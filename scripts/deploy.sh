#!/usr/bin/env bash
#
# CompassFinance deploy.
#
#   scripts/deploy.sh                 build, smoke-test, switch the service, clean up
#   scripts/deploy.sh --no-switch     build + install + smoke-test only; live service untouched
#   scripts/deploy.sh --from <dir|.tgz> [--no-switch]
#                                     install a release that was built somewhere else (or
#                                     assembled with scripts/assemble-standalone-from-build.mjs),
#                                     smoke-test it, then switch. No build runs on this host.
#   scripts/deploy.sh --switch        switch to the newest installed release (no rebuild)
#   scripts/deploy.sh --rollback      go back to the previous release
#   scripts/deploy.sh --prune         remove old releases and stale build leftovers
#
# Why it is shaped like this
#   * The app is built in a THROWAWAY directory (BUILD_DIR), never in the
#     project folder. `next build` rewrites .next in place, and a running
#     `next start` keeps the old chunk manifest in memory, so building inside
#     the live tree makes the site serve HTML that points at JS/CSS files that
#     no longer exist. Building elsewhere cannot do that.
#   * node_modules (1.6 GB) and the build cache only ever exist inside
#     BUILD_DIR, and BUILD_DIR is deleted on exit, success or failure. What
#     stays on disk is the standalone output: server.js plus only the
#     node_modules files the app really loads.
#   * The source tree is copied as it is, including uncommitted edits. Nothing
#     in it is stashed, reset or committed by this script.
#   * The live SQLite file (APP_DIR/dev.db) is only ever read, by the online
#     backup. It is never moved, copied into the build, or recreated. The
#     service is told its absolute path through DATABASE_URL, because the
#     standalone server.js calls process.chdir() into its own release folder
#     and the app's default "file:./dev.db" would otherwise silently create a
#     new, empty database there.
#
# Layout
#   $APP_DIR/                     source, .env.local, dev.db   (stays put)
#   $RUNTIME_DIR/releases/<id>/   one standalone release each
#   $RUNTIME_DIR/current          symlink to the release the service runs
#   $RUNTIME_DIR/previous         symlink to the one before (for --rollback)
#
# Building on this host (measured 2026-10-03)
#   `next build` (Turbopack) needs more than ~1.3 GB of RAM. This host has
#   3.9 GB, roughly 1.5 GB available, and its swap is full. Capped at 1.1 GB
#   and 1.3 GB the build thrashed (tens of thousands of page re-faults per
#   second, no progress in 14 minutes); at 1.3 GB it also pushed whole-host
#   MemAvailable under 200 MB, where the watchdog stopped it. The memory
#   guards below exist so that this fails safe instead of squeezing the other
#   production services. When the host is quiet enough the full build works;
#   otherwise build somewhere else (same OS family, x86_64, Node 22) and ship
#   the result:
#
#     # on the build machine, in a checkout that has .env.local (NEXT_PUBLIC_* are baked in)
#     npm ci && npm run build
#     cp -a .next/static .next/standalone/.next/static
#     cp -a public .next/standalone/public
#     tar czf compass-release.tgz -C .next/standalone .
#
#     # then on this host
#     scp compass-release.tgz root@<host>:/var/tmp/
#     scripts/deploy.sh --from /var/tmp/compass-release.tgz
#
#   The tarball carries a compiled better-sqlite3 binary, so the build machine
#   must match this host's platform and Node major version; --from refuses a
#   release that is missing it, and the smoke test would catch a mismatch.
#
#   Last resort without any build: scripts/assemble-standalone-from-build.mjs
#   derives the same layout from the production build already in .next. That is
#   how the first standalone release was made (see its header for the caveats).

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/compassfinance}"
RUNTIME_DIR="${RUNTIME_DIR:-/root/compassfinance-runtime}"
BUILD_DIR="${BUILD_DIR:-/var/tmp/compass-build}"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-/var/tmp/compass-npm-cache}"
BACKUP_DIR="${BACKUP_DIR:-/root/db-backups}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/opt/node-v22.23.2-linux-x64/bin}"
SERVICE="${SERVICE:-compass.service}"
LIVE_PORT="${LIVE_PORT:-3002}"
SMOKE_PORT="${SMOKE_PORT:-3012}"
KEEP_RELEASES="${KEEP_RELEASES:-2}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
KEEP_LOGS="${KEEP_LOGS:-5}"

# Build memory. This host has little free RAM and its swap is full, so the
# build runs in its own cgroup: MemoryHigh throttles it (and reclaims its own
# page cache) well before MemoryMax, which OOM-kills only the build, never a
# neighbouring service. A watchdog also stops the build if the whole host
# runs low.
BUILD_MEM_HIGH="${BUILD_MEM_HIGH:-1300M}"
BUILD_MEM_MAX="${BUILD_MEM_MAX:-1500M}"
MIN_AVAIL_MB="${MIN_AVAIL_MB:-1300}"
ABORT_AVAIL_MB="${ABORT_AVAIL_MB:-200}"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/tmp/compass-deploy-${STAMP}.log"
SMOKE_UNIT="compass-smoke"
BUILD_UNIT="compass-build"
LOCK_FILE="/var/lock/compass-deploy.lock"

log()  { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG_FILE" >&2; }
die()  { log "ERROR: $*"; exit 1; }

avail_mb() { awk '/^MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo; }
size_of()  { du -sh "$1" 2>/dev/null | cut -f1; }

MODE="all"
KEEP_BUILD=0
FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-switch) [ "$MODE" = "all" ] && MODE="build"; NO_SWITCH=1 ;;
    --switch)    MODE="switch" ;;
    --rollback)  MODE="rollback" ;;
    --prune)     MODE="prune" ;;
    --from)      shift; FROM="${1:-}"; [ -n "$FROM" ] || die "--from needs a directory or .tgz"; MODE="from" ;;
    --keep-build) KEEP_BUILD=1 ;;
    -h|--help)   sed -n '2,24p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
NO_SWITCH="${NO_SWITCH:-0}"

cleanup() {
  local rc=$?
  systemctl stop "${SMOKE_UNIT}.service" >/dev/null 2>&1 || true
  systemctl stop "${BUILD_UNIT}.service" >/dev/null 2>&1 || true
  if [ "$KEEP_BUILD" -eq 0 ]; then
    rm -rf "$BUILD_DIR" "$NPM_CACHE_DIR"
  fi
  # keep only the newest few deploy logs
  ls -1t /var/tmp/compass-deploy-*.log 2>/dev/null | tail -n +$((KEEP_LOGS + 1)) | xargs -r rm -f
  [ "$rc" -eq 0 ] || log "deploy FAILED (exit ${rc}); log: ${LOG_FILE}"
  return "$rc"
}
trap cleanup EXIT

[ "$(id -u)" -eq 0 ] || die "run as root"
exec 9>"$LOCK_FILE"
flock -n 9 || die "another deploy is already running"

export PATH="${NODE_BIN_DIR}:${PATH}"

# ---------------------------------------------------------------- helpers ---

preflight_build() {
  [ -f "$APP_DIR/package-lock.json" ] || die "no package-lock.json in $APP_DIR"
  [ -f "$APP_DIR/.env.local" ] || die "no $APP_DIR/.env.local (NEXT_PUBLIC_* values are baked in at build time)"
  [ -s "$APP_DIR/dev.db" ] || die "live database $APP_DIR/dev.db is missing or empty; refusing to continue"
  command -v rsync >/dev/null || die "rsync not installed"
  command -v sqlite3 >/dev/null || die "sqlite3 not installed"
  command -v systemd-run >/dev/null || die "systemd-run not available"

  local free_mb; free_mb=$(df --output=avail -BM /var/tmp | tail -1 | tr -dc '0-9')
  [ "$free_mb" -ge 4000 ] || die "only ${free_mb} MB free on /var/tmp, need 4000"

  local avail; avail=$(avail_mb)
  if [ "$avail" -lt "$MIN_AVAIL_MB" ] && [ "${FORCE:-0}" != "1" ]; then
    die "only ${avail} MB RAM available (need ${MIN_AVAIL_MB}). The build could push other services into the OOM killer. Free memory, or run with FORCE=1."
  fi
  log "preflight ok: ${avail} MB RAM available, ${free_mb} MB disk free on /var/tmp"

  if ss -ltn "( sport = :${SMOKE_PORT} )" | grep -q ":${SMOKE_PORT}"; then
    die "smoke-test port ${SMOKE_PORT} is already in use"
  fi
}

backup_db() {
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  local dest="$BACKUP_DIR/compass-dev.db.${STAMP}"
  # SQLite's online backup: consistent even while the service is writing.
  sqlite3 "$APP_DIR/dev.db" ".backup '${dest}'"
  chmod 600 "$dest"
  [ "$(sqlite3 "$dest" 'PRAGMA integrity_check;')" = "ok" ] || die "backup ${dest} failed its integrity check"
  log "database backed up to ${dest}"
  ls -1t "$BACKUP_DIR"/compass-dev.db.* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
}

sync_source() {
  rm -rf "$BUILD_DIR" "$NPM_CACHE_DIR"
  mkdir -p "$BUILD_DIR"; chmod 700 "$BUILD_DIR"
  # dev.db is deliberately excluded: the build must never see the live data.
  rsync -a --delete \
    --exclude='/node_modules' --exclude='/.next' --exclude='/.git' \
    --exclude='/dev.db*' --exclude='/*.zip' --exclude='/.claude' \
    --exclude='/src/generated' --exclude='/tsconfig.tsbuildinfo' \
    "$APP_DIR"/ "$BUILD_DIR"/
  chmod 600 "$BUILD_DIR/.env.local"
  log "source copied to ${BUILD_DIR} ($(size_of "$BUILD_DIR")); includes uncommitted edits, excludes dev.db"
}

watchdog() {
  local pid="$1" a min_avail=999999 peak="" p
  while kill -0 "$pid" 2>/dev/null; do
    a=$(avail_mb)
    [ "$a" -lt "$min_avail" ] && min_avail=$a
    p=$(cat "/sys/fs/cgroup/system.slice/${BUILD_UNIT}.service/memory.peak" 2>/dev/null || true)
    [ -n "$p" ] && peak=$p
    if [ "$a" -lt "$ABORT_AVAIL_MB" ]; then
      log "WATCHDOG: host memory below ${ABORT_AVAIL_MB} MB, stopping the build to protect other services"
      touch "$BUILD_DIR/.aborted-low-memory" 2>/dev/null || true
      systemctl stop "${BUILD_UNIT}.service" 2>/dev/null || true
      return
    fi
    sleep 2
  done
  [ -z "$peak" ] || log "build memory: cgroup peak $((peak / 1048576)) MB; lowest host MemAvailable seen ${min_avail} MB"
}

build() {
  [ -f "$APP_DIR/package-lock.json" ] || die "no package-lock.json in $APP_DIR"
  [ -f "$APP_DIR/.env.local" ] || die "no $APP_DIR/.env.local (NEXT_PUBLIC_* values are baked in at build time)"
  [ -s "$APP_DIR/dev.db" ] || die "live database $APP_DIR/dev.db is missing or empty; refusing to continue"
  command -v rsync >/dev/null || die "rsync not installed"
  command -v sqlite3 >/dev/null || die "sqlite3 not installed"
  command -v systemd-run >/dev/null || die "systemd-run not available"

  local free_mb; free_mb=$(df --output=avail -BM /var/tmp | tail -1 | tr -dc '0-9')
  [ "$free_mb" -ge 4000 ] || die "only ${free_mb} MB free on /var/tmp, need 4000"

  local avail; avail=$(avail_mb)
  if [ "$avail" -lt "$MIN_AVAIL_MB" ] && [ "${FORCE:-0}" != "1" ]; then
    die "only ${avail} MB RAM available (need ${MIN_AVAIL_MB}). The build could push other services into the OOM killer. Free memory, or run with FORCE=1."
  fi
  log "preflight ok: ${avail} MB RAM available, ${free_mb} MB disk free on /var/tmp"

  if ss -ltn "( sport = :${SMOKE_PORT} )" | grep -q ":${SMOKE_PORT}"; then
    die "smoke-test port ${SMOKE_PORT} is already in use"
  fi
}

backup_db() {
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  local dest="$BACKUP_DIR/compass-dev.db.${STAMP}"
  # SQLite's online backup: consistent even while the service is writing.
  sqlite3 "$APP_DIR/dev.db" ".backup '${dest}'"
  chmod 600 "$dest"
  [ "$(sqlite3 "$dest" 'PRAGMA integrity_check;')" = "ok" ] || die "backup ${dest} failed its integrity check"
  log "database backed up to ${dest}"
  ls -1t "$BACKUP_DIR"/compass-dev.db.* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
}

sync_source() {
  rm -rf "$BUILD_DIR" "$NPM_CACHE_DIR"
  mkdir -p "$BUILD_DIR"; chmod 700 "$BUILD_DIR"
  # dev.db is deliberately excluded: the build must never see the live data.
  rsync -a --delete \
    --exclude='/node_modules' --exclude='/.next' --exclude='/.git' \
    --exclude='/dev.db*' --exclude='/*.zip' --exclude='/.claude' \
    --exclude='/src/generated' --exclude='/tsconfig.tsbuildinfo' \
    "$APP_DIR"/ "$BUILD_DIR"/
  chmod 600 "$BUILD_DIR/.env.local"
  log "source copied to ${BUILD_DIR} ($(size_of "$BUILD_DIR")); includes uncommitted edits, excludes dev.db"
}

watchdog() {
  local pid="$1"
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(avail_mb)" -lt "$ABORT_AVAIL_MB" ]; then
      log "WATCHDOG: host memory below ${ABORT_AVAIL_MB} MB, stopping the build to protect other services"
      touch "$BUILD_DIR/.aborted-low-memory" 2>/dev/null || true
      systemctl stop "${BUILD_UNIT}.service" 2>/dev/null || true
      return
    fi
    sleep 2
  done
}

build() {
  cat > "$BUILD_DIR/.deploy-build.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
cd "$BUILD_DIR"
echo "--- npm ci"
npm ci --no-audit --no-fund --loglevel=error
echo "--- next build"
npm run build
EOF
  chmod 700 "$BUILD_DIR/.deploy-build.sh"

  log "building (memory: high ${BUILD_MEM_HIGH}, hard cap ${BUILD_MEM_MAX}, no swap); this takes a few minutes"
  systemctl reset-failed "${BUILD_UNIT}.service" 2>/dev/null || true
  local rc=0 rcfile="$BUILD_DIR/.build-rc"
  # systemd-run's own exit status goes to a file: `wait` on a backgrounded
  # pipeline would report tee's status and could call a failed build a success.
  {
    if systemd-run --unit="$BUILD_UNIT" --wait --collect --pipe --quiet \
      -p MemoryHigh="$BUILD_MEM_HIGH" -p MemoryMax="$BUILD_MEM_MAX" -p MemorySwapMax=0 \
      -p Nice=15 -p CPUWeight=20 -p IOWeight=20 \
      -p WorkingDirectory="$BUILD_DIR" \
      -E PATH="$PATH" -E HOME=/root -E BUILD_DIR="$BUILD_DIR" \
      -E npm_config_cache="$NPM_CACHE_DIR" -E npm_config_update_notifier=false \
      -E NEXT_TELEMETRY_DISABLED=1 -E CI=1 \
      /bin/bash "$BUILD_DIR/.deploy-build.sh"; then
      echo 0 > "$rcfile"
    else
      echo $? > "$rcfile"
    fi
  } 2>&1 | tee -a "$LOG_FILE" &
  local pipeline_pid=$!
  watchdog "$pipeline_pid" &
  local wd_pid=$!
  wait "$pipeline_pid" || true
  kill "$wd_pid" 2>/dev/null || true
  rc=$(cat "$rcfile" 2>/dev/null || echo 1)
  [ ! -e "$BUILD_DIR/.aborted-low-memory" ] || die "build aborted by the memory watchdog; the live service was not touched"
  [ "$rc" -eq 0 ] || die "build failed (see ${LOG_FILE}); the live service was not touched"
  [ -f "$BUILD_DIR/.next/standalone/server.js" ] || die "build finished but .next/standalone/server.js is missing; is output: \"standalone\" set in next.config.ts?"
  log "build finished"
}

# Lay out what `next build` leaves for the operator: the standalone folder
# with .next/static and public/ placed next to server.js.
stage_build_output() {
  STAGE_DIR="$BUILD_DIR/.stage"
  cp -a "$BUILD_DIR/.next/standalone" "$STAGE_DIR"
  mkdir -p "$STAGE_DIR/.next"
  cp -a "$BUILD_DIR/.next/static" "$STAGE_DIR/.next/static"
  [ -d "$BUILD_DIR/public" ] && cp -a "$BUILD_DIR/public" "$STAGE_DIR/public"
  return 0
}

# install_release <ready-layout-dir>
install_release() {
  local stage="$1"
  [ -f "$stage/server.js" ] || die "$stage has no server.js"
  [ -d "$stage/.next/static" ] || die "$stage has no .next/static"
  local commit; commit=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo nogit)
  RELEASE_ID="${STAMP}-${commit}"
  RELEASE_DIR="$RUNTIME_DIR/releases/$RELEASE_ID"
  mkdir -p "$RUNTIME_DIR/releases"
  [ ! -e "$RELEASE_DIR" ] || die "$RELEASE_DIR already exists"

  cp -a "$stage" "$RELEASE_DIR"

  # Secrets stay in $APP_DIR/.env.local only; nothing env-like may ride along in a release.
  local stray; stray=$(find "$RELEASE_DIR" -maxdepth 3 \( -name '.env' -o -name '.env.*' \) ! -path '*/node_modules/*' -print)
  [ -z "$stray" ] || { rm -rf "$RELEASE_DIR"; die "env file(s) found inside the release: ${stray}"; }
  # And no database file: the release must never carry or create its own.
  local strayDb; strayDb=$(find "$RELEASE_DIR" \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) -print)
  [ -z "$strayDb" ] || { rm -rf "$RELEASE_DIR"; die "database file(s) found inside the release: ${strayDb}"; }

  # Next's file tracing does not always pick up native addons, and the Turbopack
  # externals are reached through hashed symlinks. The app's Prisma adapter uses
  # its own nested better-sqlite3: make sure the compiled binary, the hashed
  # symlinks and Prisma's runtime (a devDependency) all came along.
  local missing=""
  find "$RELEASE_DIR/node_modules" -name 'better_sqlite3.node' -print -quit | grep -q . || missing="${missing} better_sqlite3.node"
  [ -f "$RELEASE_DIR/node_modules/@prisma/client/runtime/client.js" ] || missing="${missing} @prisma/client/runtime/client.js"
  local l
  for l in "$RELEASE_DIR"/.next/node_modules/* "$RELEASE_DIR"/.next/node_modules/@*/*; do
    [ -L "$l" ] && { [ -e "$l" ] || missing="${missing} broken-symlink:${l##*/}"; }
  done
  if [ -n "$missing" ] && [ -d "${BUILD_DIR}/node_modules" ] && ! echo "$missing" | grep -q 'client.js\|broken-symlink'; then
    log "WARNING: better_sqlite3.node was not traced into the release; copying it from the build tree"
    local src dst
    src=$(find "$BUILD_DIR/node_modules" -name better_sqlite3.node -path '*adapter-better-sqlite3*' -print -quit)
    [ -n "$src" ] || { rm -rf "$RELEASE_DIR"; die "could not find a compiled better_sqlite3.node in the build tree"; }
    dst="$RELEASE_DIR/${src#"$BUILD_DIR"/}"
    mkdir -p "$(dirname "$dst")"; cp -a "$src" "$dst"
    missing=""
  fi
  [ -z "$missing" ] || { rm -rf "$RELEASE_DIR"; die "release is incomplete, missing:${missing}"; }
  log "installed release ${RELEASE_ID} ($(size_of "$RELEASE_DIR"))"
}

smoke_test() {
  local rel="$1"
  log "smoke test: starting ${rel##*/} on port ${SMOKE_PORT} with the production environment file"
  systemctl stop "${SMOKE_UNIT}.service" >/dev/null 2>&1 || true
  systemctl reset-failed "${SMOKE_UNIT}.service" >/dev/null 2>&1 || true
  # Same .env.local parsing as the real unit (EnvironmentFile). The scheduler
  # is off so a second instance never competes with the live one.
  systemd-run --unit="$SMOKE_UNIT" --collect --quiet \
    -p WorkingDirectory="$rel" -p EnvironmentFile="$APP_DIR/.env.local" \
    -p MemoryMax=600M -p MemorySwapMax=0 \
    -E NODE_ENV=production -E PORT="$SMOKE_PORT" -E HOSTNAME=127.0.0.1 \
    -E DATABASE_URL="file:${APP_DIR}/dev.db" \
    -E TRADING212_AUTO_SYNC_ENABLED=false -E NEXT_TELEMETRY_DISABLED=1 \
    "$NODE_BIN_DIR/node" "$rel/server.js" >/dev/null

  local i
  for i in $(seq 1 40); do
    curl -s -o /dev/null -m 2 "http://127.0.0.1:${SMOKE_PORT}/" && break
    systemctl is-active --quiet "${SMOKE_UNIT}.service" || { journalctl -u "${SMOKE_UNIT}.service" --no-pager -n 30 | tee -a "$LOG_FILE" >&2; die "smoke instance exited during startup"; }
    sleep 1
  done

  local ref=""
  if curl -s -o /dev/null -m 3 "http://127.0.0.1:${LIVE_PORT}/"; then ref="http://127.0.0.1:${LIVE_PORT}"; else log "live service not answering on ${LIVE_PORT}; testing without a reference"; fi
  if ! "$APP_DIR/scripts/smoke-test.sh" "http://127.0.0.1:${SMOKE_PORT}" ${ref:+"$ref"} 2>&1 | tee -a "$LOG_FILE" >&2; then
    journalctl -u "${SMOKE_UNIT}.service" --no-pager -n 40 | tee -a "$LOG_FILE" >&2
    die "smoke test failed; the live service was not touched"
  fi

  # The test instance must be reading the SAME database file as production
  # and must not have created one of its own.
  local pid; pid=$(systemctl show -p MainPID --value "${SMOKE_UNIT}.service")
  if ls -l "/proc/${pid}/fd" 2>/dev/null | grep -q "${APP_DIR}/dev.db"; then
    log "smoke instance has ${APP_DIR}/dev.db open (the live database)"
  else
    die "smoke instance does not have ${APP_DIR}/dev.db open; it may be using a different database"
  fi
  [ -z "$(find "$rel" \( -name '*.db' -o -name '*.db-journal' \) -print -quit)" ] || die "smoke instance created a database file inside the release"

  local rss; rss=$(awk '/VmRSS/ {printf "%d", $2/1024}' "/proc/${pid}/status")
  log "smoke instance RSS after the test run: ${rss} MB"
  systemctl stop "${SMOKE_UNIT}.service" >/dev/null 2>&1 || true
}

unit_uses_runtime() {
  systemctl cat "$SERVICE" 2>/dev/null | grep -q "${RUNTIME_DIR}/current/server.js"
}

point_current_at() {
  local target="$1"
  ln -sfn "$target" "$RUNTIME_DIR/.current.tmp"
  mv -Tf "$RUNTIME_DIR/.current.tmp" "$RUNTIME_DIR/current"
}

# Healthy = the home page answers 200. Gives up early, instead of waiting out
# the full timeout, when the unit has failed or is crash-looping: a release that
# cannot start should be rolled back in seconds, not after a 45 s outage.
wait_healthy() {
  local i state restarts base
  base=$(systemctl show -p NRestarts --value "$SERVICE" 2>/dev/null || echo 0)
  for i in $(seq 1 45); do
    [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' -H 'Host: compassfinance.online' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:${LIVE_PORT}/")" = "200" ] && return 0
    state=$(systemctl show -p ActiveState --value "$SERVICE" 2>/dev/null || true)
    [ "$state" = "failed" ] && return 1
    restarts=$(systemctl show -p NRestarts --value "$SERVICE" 2>/dev/null || echo 0)
    [ $((restarts - base)) -ge 2 ] && return 1
    sleep 1
  done
  return 1
}

switch_to() {
  local target="$1"
  unit_uses_runtime || die "${SERVICE} is not configured to run ${RUNTIME_DIR}/current/server.js yet; install deploy/compass.service first (see its header)"
  [ -f "$target/server.js" ] || die "${target} is not a release"

  local old=""
  [ -L "$RUNTIME_DIR/current" ] && old="$(readlink -f "$RUNTIME_DIR/current")"
  if [ -n "$old" ] && [ "$old" != "$(readlink -f "$target")" ]; then
    ln -sfn "$old" "$RUNTIME_DIR/previous"
  fi

  log "switching ${SERVICE} to ${target##*/}"
  point_current_at "$target"
  # reset-failed also clears systemd's start-rate limit, which a crash-looping
  # release can trip ("Start request repeated too quickly") and which would
  # otherwise refuse the rollback restart below.
  systemctl reset-failed "$SERVICE" 2>/dev/null || true
  systemctl restart "$SERVICE"
  if wait_healthy; then
    log "${SERVICE} is healthy on release ${target##*/}"
    return 0
  fi
  log "NEW RELEASE DID NOT BECOME HEALTHY; rolling back"
  journalctl -u "$SERVICE" --no-pager -n 30 | tee -a "$LOG_FILE" >&2
  if [ -n "$old" ] && [ -d "$old" ]; then
    point_current_at "$old"
    systemctl reset-failed "$SERVICE" 2>/dev/null || true
    systemctl restart "$SERVICE"
    wait_healthy && die "rolled back to ${old##*/}; the new release was rejected" || die "rollback target ${old##*/} is also unhealthy; investigate immediately"
  fi
  die "no previous release to roll back to"
}

latest_release() { ls -1dt "$RUNTIME_DIR"/releases/*/ 2>/dev/null | head -1 | sed 's:/$::'; }

prune_releases() {
  [ -d "$RUNTIME_DIR/releases" ] || return 0
  local keep_cur keep_prev
  keep_cur=$(readlink -f "$RUNTIME_DIR/current" 2>/dev/null || true)
  keep_prev=$(readlink -f "$RUNTIME_DIR/previous" 2>/dev/null || true)
  local r n=0
  while read -r r; do
    n=$((n + 1))
    [ "$n" -le "$KEEP_RELEASES" ] && continue
    [ "$(readlink -f "$r")" = "$keep_cur" ] && continue
    [ "$(readlink -f "$r")" = "$keep_prev" ] && continue
    log "removing old release ${r##*/}"
    rm -rf "$r"
  done < <(ls -1dt "$RUNTIME_DIR"/releases/*/ 2>/dev/null | sed 's:/$::')
}

summary() {
  log "disk: releases $(size_of "$RUNTIME_DIR"), build leftovers: $( [ -e "$BUILD_DIR" ] && size_of "$BUILD_DIR" || echo none )"
  if systemctl is-active --quiet "$SERVICE"; then
    local pid; pid=$(systemctl show -p MainPID --value "$SERVICE")
    log "service RSS: $(awk '/VmRSS/ {printf "%d MB", $2/1024}' "/proc/${pid}/status")"
  fi
}

# ------------------------------------------------------------------- main ---

finish_release() {
  smoke_test "$RELEASE_DIR"
  if [ "$NO_SWITCH" = "1" ]; then
    log "installed and tested release ${RELEASE_ID}; NOT switched. Run: scripts/deploy.sh --switch"
  else
    switch_to "$RELEASE_DIR"
    prune_releases
  fi
  summary
}

case "$MODE" in
  all|build)
    preflight_build
    backup_db
    sync_source
    build
    stage_build_output
    install_release "$STAGE_DIR"
    finish_release
    ;;
  from)
    [ -s "$APP_DIR/dev.db" ] || die "live database $APP_DIR/dev.db is missing or empty; refusing to continue"
    command -v sqlite3 >/dev/null || die "sqlite3 not installed"
    if ss -ltn "( sport = :${SMOKE_PORT} )" | grep -q ":${SMOKE_PORT}"; then die "smoke-test port ${SMOKE_PORT} is already in use"; fi
    backup_db
    src="$FROM"
    case "$FROM" in
      *.tgz|*.tar.gz)
        [ -f "$FROM" ] || die "$FROM not found"
        mkdir -p "$BUILD_DIR"; chmod 700 "$BUILD_DIR"
        mkdir -p "$BUILD_DIR/incoming"
        tar -xzf "$FROM" -C "$BUILD_DIR/incoming"
        src="$BUILD_DIR/incoming" ;;
      *) [ -d "$FROM" ] || die "$FROM is not a directory" ;;
    esac
    install_release "$src"
    finish_release
    ;;
  switch)
    rel="$(latest_release)"; [ -n "$rel" ] || die "no releases in $RUNTIME_DIR/releases"
    backup_db
    switch_to "$rel"
    summary
    ;;
  rollback)
    [ -L "$RUNTIME_DIR/previous" ] || die "no previous release recorded"
    switch_to "$(readlink -f "$RUNTIME_DIR/previous")"
    summary
    ;;
  prune)
    prune_releases
    rm -rf "$BUILD_DIR" "$NPM_CACHE_DIR"
    summary
    ;;
esac

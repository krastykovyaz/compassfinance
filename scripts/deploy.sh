#!/usr/bin/env bash
#
# CompassFinance deploy.
#
#   scripts/deploy.sh --from <dir|.tgz> [--no-switch]
#                                     install a release that was built somewhere else (or
#                                     assembled with scripts/assemble-standalone-from-build.mjs),
#                                     smoke-test it, then switch. No build runs on this host.
#                                     THIS IS THE PROVEN PATH ON THIS HOST.
#   scripts/deploy.sh                 build here, smoke-test, switch the service, clean up
#   scripts/deploy.sh --no-switch     build + install + smoke-test only; live service untouched
#   scripts/deploy.sh --switch        switch to the newest installed release (no rebuild)
#   scripts/deploy.sh --rollback      go back to the previous release
#   scripts/deploy.sh --prune         remove old/rejected releases and build leftovers
#
# Why it is shaped like this
#   * The app is built in a THROWAWAY directory, never in the project folder.
#     `next build` rewrites .next in place, and a running `next start` keeps
#     the old chunk manifest in memory, so building inside the live tree makes
#     the site serve HTML that points at JS/CSS files that no longer exist.
#   * node_modules (1.6 GB) and the build cache only ever exist inside that
#     throwaway directory, which is deleted on exit, success or failure. What
#     stays on disk is the standalone output: server.js plus only the
#     node_modules files the app really loads.
#   * The source tree is copied as it is, including uncommitted edits. Nothing
#     in it is stashed, reset or committed by this script.
#   * The live SQLite file (APP_DIR/dev.db) is only ever read, by the online
#     backup. It is never moved, copied into the build, or recreated. The
#     service is told its absolute path (see deploy/compass.service), because
#     the standalone server.js calls process.chdir() into its own release
#     folder and the app's default "file:./dev.db" would otherwise silently
#     create a new, empty database there.
#
# Layout (everything under RUNTIME_DIR, which is root-only; nothing lives in
# a world-writable directory, because the build copies .env.local)
#   $APP_DIR/                     source, .env.local, dev.db   (stays put)
#   $RUNTIME_DIR/releases/<id>/   one standalone release each; ids sort by time
#   $RUNTIME_DIR/releases/<id>/REJECTED   marker left on a release that failed to start
#   $RUNTIME_DIR/current          symlink to the release the service runs
#   $RUNTIME_DIR/previous         symlink to the one before (for --rollback)
#   $RUNTIME_DIR/logs/            deploy logs (newest few kept)
#   $RUNTIME_DIR/.work/           throwaway build area, removed on exit
#
# Building on this host (measured 2026-10-03)
#   `next build` (Turbopack) needs more than 1.3 GB of RAM. This host has
#   3.9 GB, about 1.5 to 1.7 GB of it available, and its swap is full. Three
#   attempts capped at 1.1 to 1.3 GB thrashed for minutes and never finished;
#   the last pushed whole-host MemAvailable under 200 MB. A build on this
#   host has NEVER completed with this script. The preflight therefore
#   refuses to start a build unless the host has room for the build's whole
#   memory cap plus a safety margin, and when it refuses, nothing has been
#   touched. Build somewhere else (same OS family, x86_64, Node 22) and ship
#   the result:
#
#     # on the build machine, in a checkout that has .env.local (NEXT_PUBLIC_* are baked in)
#     npm ci && npm run build
#     cp -a .next/static .next/standalone/.next/static
#     cp -a public .next/standalone/public
#     tar czf compass-release.tgz -C .next/standalone .
#
#     # then on this host
#     scp compass-release.tgz root@<host>:/root/
#     scripts/deploy.sh --from /root/compass-release.tgz
#
#   The tarball carries a compiled better-sqlite3 binary, so the build machine
#   must match this host's platform and Node major version; --from refuses a
#   release that is missing it, and the smoke test would catch a mismatch.
#
#   Last resort without any build: scripts/assemble-standalone-from-build.mjs
#   derives the same layout from a production build that already exists in
#   .next. That is how the first standalone release was made (see its header
#   for the caveats). It cannot pick up source changes.

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/compassfinance}"
RUNTIME_DIR="${RUNTIME_DIR:-/root/compassfinance-runtime}"
WORK_DIR="${WORK_DIR:-$RUNTIME_DIR/.work}"
BUILD_DIR="$WORK_DIR/build"
NPM_CACHE_DIR="$WORK_DIR/npm-cache"
INCOMING_DIR="$WORK_DIR/incoming"
LOG_DIR="${LOG_DIR:-$RUNTIME_DIR/logs}"
BACKUP_DIR="${BACKUP_DIR:-/root/db-backups}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/opt/node-v22.23.2-linux-x64/bin}"
SERVICE="${SERVICE:-compass.service}"
LIVE_PORT="${LIVE_PORT:-3002}"
SMOKE_PORT="${SMOKE_PORT:-3012}"
KEEP_RELEASES="${KEEP_RELEASES:-2}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
KEEP_LOGS="${KEEP_LOGS:-10}"

# Build memory. The build runs in its own cgroup: MemoryHigh throttles it
# and MemoryMax OOM-kills only the build, never a neighbouring service. A
# watchdog also stops the build if the whole host runs low. The preflight
# requires room for the whole cap (see min_avail_mb), so a build that is
# allowed to start cannot by itself drive the host to the watchdog threshold.
BUILD_MEM_HIGH="${BUILD_MEM_HIGH:-1300M}"
BUILD_MEM_MAX="${BUILD_MEM_MAX:-1500M}"
ABORT_AVAIL_MB="${ABORT_AVAIL_MB:-200}"
BUILD_HEADROOM_MB="${BUILD_HEADROOM_MB:-100}"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/deploy-${STAMP}.log"
SMOKE_UNIT="${SMOKE_UNIT:-compass-smoke}"
BUILD_UNIT="${BUILD_UNIT:-compass-build}"
LOCK_FILE="${LOCK_FILE:-/var/lock/compass-deploy.lock}"

if [ "$(id -u)" -ne 0 ]; then echo "deploy: run as root" >&2; exit 1; fi
mkdir -p "$RUNTIME_DIR" "$LOG_DIR"
chmod 700 "$RUNTIME_DIR" "$LOG_DIR"

log()  { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG_FILE" >&2; }
die()  { log "ERROR: $*"; exit 1; }

avail_mb() { awk '/^MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo; }
size_of()  { du -sh "$1" 2>/dev/null | cut -f1; }
to_mb() {
  case "$1" in
    *G) echo $(( ${1%G} * 1024 )) ;;
    *M) echo "${1%M}" ;;
    *)  die "memory size must end in M or G: $1" ;;
  esac
}
# RAM that must be available before a build may start: the most the build can
# take, plus the level at which the watchdog would stop it, plus headroom.
min_avail_mb() {
  if [ -n "${MIN_AVAIL_MB:-}" ]; then echo "$MIN_AVAIL_MB"; return; fi
  echo $(( $(to_mb "$BUILD_MEM_MAX") + ABORT_AVAIL_MB + BUILD_HEADROOM_MB ))
}

MODE="all"
KEEP_BUILD=0
NO_SWITCH=0
FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-switch) NO_SWITCH=1 ;;
    --switch)    MODE="switch" ;;
    --rollback)  MODE="rollback" ;;
    --prune)     MODE="prune" ;;
    --from)      shift; FROM="${1:-}"; [ -n "$FROM" ] || die "--from needs a directory or .tgz"; MODE="from" ;;
    --keep-build) KEEP_BUILD=1 ;;
    -h|--help)   sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

# Take the lock BEFORE installing the cleanup trap. cleanup stops the build
# and smoke units and deletes the work directory; if a second invocation ran
# it while being turned away here, it would destroy the first one's build.
exec 9>"$LOCK_FILE"
flock -n 9 || die "another deploy is already running; nothing was touched"

cleanup() {
  local rc=$?
  systemctl stop "${SMOKE_UNIT}.service" >/dev/null 2>&1 || true
  systemctl stop "${BUILD_UNIT}.service" >/dev/null 2>&1 || true
  if [ "$KEEP_BUILD" -eq 0 ]; then
    rm -rf "$WORK_DIR"
  fi
  # keep only the newest few deploy logs
  find "$LOG_DIR" -maxdepth 1 -name 'deploy-*.log' -printf '%f\n' 2>/dev/null | sort -r | tail -n +$((KEEP_LOGS + 1)) \
    | while read -r f; do rm -f "$LOG_DIR/$f"; done
  [ "$rc" -eq 0 ] || log "deploy FAILED (exit ${rc}); log: ${LOG_FILE}"
  return "$rc"
}
trap cleanup EXIT

export PATH="${NODE_BIN_DIR}:${PATH}"

# ---------------------------------------------------------------- helpers ---

require_live_db() {
  [ -s "$APP_DIR/dev.db" ] || die "live database $APP_DIR/dev.db is missing or empty; refusing to continue"
  command -v sqlite3 >/dev/null || die "sqlite3 not installed"
}

require_smoke_port_free() {
  if ss -ltn "( sport = :${SMOKE_PORT} )" | grep -q ":${SMOKE_PORT}"; then
    die "smoke-test port ${SMOKE_PORT} is already in use"
  fi
}

require_disk_mb() {
  mkdir -p "$WORK_DIR"; chmod 700 "$WORK_DIR"
  local need="$1" free_mb
  free_mb=$(df --output=avail -BM "$WORK_DIR" | tail -1 | tr -dc '0-9')
  [ "$free_mb" -ge "$need" ] || die "only ${free_mb} MB free under ${WORK_DIR}, need ${need}"
}

# The unit pins DATABASE_URL itself; a DATABASE_URL line in .env.local is not
# what the service uses. Say so, because the README suggests adding one.
warn_if_env_sets_database_url() {
  if grep -Eq '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$APP_DIR/.env.local" 2>/dev/null; then
    log "NOTE: $APP_DIR/.env.local sets DATABASE_URL. The service ignores it and always uses file:${APP_DIR}/dev.db (see deploy/compass.service)."
  fi
}

preflight_build() {
  [ -f "$APP_DIR/package-lock.json" ] || die "no package-lock.json in $APP_DIR"
  [ -f "$APP_DIR/.env.local" ] || die "no $APP_DIR/.env.local (NEXT_PUBLIC_* values are baked in at build time)"
  require_live_db
  command -v rsync >/dev/null || die "rsync not installed"
  command -v systemd-run >/dev/null || die "systemd-run not available"
  require_smoke_port_free
  require_disk_mb 4000

  local avail need
  avail=$(avail_mb)
  need=$(min_avail_mb)
  if [ "$avail" -lt "$need" ] && [ "${FORCE:-0}" != "1" ]; then
    die "not building: ${avail} MB RAM available, ${need} MB needed (the build may use up to ${BUILD_MEM_MAX}, and the watchdog stops it once the host drops below ${ABORT_AVAIL_MB} MB). Nothing was started or changed. Build on another machine and run: scripts/deploy.sh --from <release.tgz> (see the header of this script). FORCE=1 overrides this check."
  fi
  log "preflight ok: ${avail} MB RAM available (need ${need})"
}

backup_db() {
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  local dest="$BACKUP_DIR/compass-dev.db.${STAMP}"
  # SQLite's online backup: consistent even while the service is writing.
  sqlite3 "$APP_DIR/dev.db" ".backup '${dest}'"
  chmod 600 "$dest"
  [ "$(sqlite3 "$dest" 'PRAGMA integrity_check;')" = "ok" ] || die "backup ${dest} failed its integrity check"
  log "database backed up to ${dest}"
  find "$BACKUP_DIR" -maxdepth 1 -name 'compass-dev.db.*' -printf '%f\n' | sort -r | tail -n +$((KEEP_BACKUPS + 1)) \
    | while read -r f; do rm -f "$BACKUP_DIR/$f"; done
}

sync_source() {
  rm -rf "$WORK_DIR"
  mkdir -p "$BUILD_DIR"; chmod 700 "$WORK_DIR" "$BUILD_DIR"
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
    if [ "$a" -lt "$min_avail" ]; then min_avail=$a; fi
    p=$(cat "/sys/fs/cgroup/system.slice/${BUILD_UNIT}.service/memory.peak" 2>/dev/null || true)
    if [ -n "$p" ]; then peak=$p; fi
    if [ "$a" -lt "$ABORT_AVAIL_MB" ]; then
      log "WATCHDOG: host memory below ${ABORT_AVAIL_MB} MB, stopping the build to protect other services"
      touch "$BUILD_DIR/.aborted-low-memory" 2>/dev/null || true
      systemctl stop "${BUILD_UNIT}.service" 2>/dev/null || true
      break
    fi
    sleep 2
  done
  if [ -n "$peak" ]; then
    log "build memory: cgroup peak $((peak / 1048576)) MB; lowest host MemAvailable seen ${min_avail} MB"
  fi
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
  # The watchdog ends by itself once the pipeline is gone (and logs the peak).
  wait "$wd_pid" 2>/dev/null || true
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
  if [ -d "$BUILD_DIR/public" ]; then cp -a "$BUILD_DIR/public" "$STAGE_DIR/public"; fi
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
  rm -f "$RELEASE_DIR/REJECTED"

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
    if [ -L "$l" ] && [ ! -e "$l" ]; then missing="${missing} broken-symlink:${l##*/}"; fi
  done
  if [ "$missing" = " better_sqlite3.node" ] && [ -d "${BUILD_DIR}/node_modules" ]; then
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
  # Same .env.local parsing as the real unit (EnvironmentFile). The values
  # this instance MUST have are set through `env` in the command itself, not
  # with -E: systemd lets EnvironmentFile override Environment=, so a PORT or
  # DATABASE_URL line in .env.local would otherwise win. The scheduler is off
  # so a second instance never competes with the live one.
  systemd-run --unit="$SMOKE_UNIT" --collect --quiet \
    -p WorkingDirectory="$rel" -p EnvironmentFile="$APP_DIR/.env.local" \
    -p MemoryMax=600M -p MemorySwapMax=0 \
    -E NODE_ENV=production \
    /usr/bin/env PORT="$SMOKE_PORT" HOSTNAME=127.0.0.1 \
      DATABASE_URL="file:${APP_DIR}/dev.db" \
      TRADING212_AUTO_SYNC_ENABLED=false NEXT_TELEMETRY_DISABLED=1 \
      "$NODE_BIN_DIR/node" "$rel/server.js" >/dev/null

  local i
  for i in $(seq 1 40); do
    if curl -s -o /dev/null -m 2 "http://127.0.0.1:${SMOKE_PORT}/"; then break; fi
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

# point_link <name> <target>: atomically (re)point $RUNTIME_DIR/<name>.
point_link() {
  ln -sfn "$2" "$RUNTIME_DIR/.$1.tmp"
  mv -Tf "$RUNTIME_DIR/.$1.tmp" "$RUNTIME_DIR/$1"
}

link_target() {
  if [ -L "$RUNTIME_DIR/$1" ]; then readlink -f "$RUNTIME_DIR/$1"; fi
}

# Healthy = the home page answers 200. Gives up early, instead of waiting out
# the full timeout, when the unit has failed or is crash-looping: a release that
# cannot start should be rolled back in seconds, not after a 45 s outage.
wait_healthy() {
  local i state restarts base
  base=$(systemctl show -p NRestarts --value "$SERVICE" 2>/dev/null || echo 0)
  for i in $(seq 1 45); do
    if [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' -H 'Host: compassfinance.online' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:${LIVE_PORT}/")" = "200" ]; then return 0; fi
    state=$(systemctl show -p ActiveState --value "$SERVICE" 2>/dev/null || true)
    if [ "$state" = "failed" ]; then return 1; fi
    restarts=$(systemctl show -p NRestarts --value "$SERVICE" 2>/dev/null || echo 0)
    if [ $((restarts - base)) -ge 2 ]; then return 1; fi
    sleep 1
  done
  return 1
}

switch_to() {
  local target; target="$(readlink -f "$1")"
  unit_uses_runtime || die "${SERVICE} is not configured to run ${RUNTIME_DIR}/current/server.js yet; install deploy/compass.service first (see its header)"
  [ -f "$target/server.js" ] || die "${target} is not a release"
  [ ! -e "$target/REJECTED" ] || die "${target##*/} was rejected earlier ($(cat "$target/REJECTED")); not switching to it"

  local old prev_before
  old="$(link_target current)"
  prev_before="$(link_target previous)"
  if [ -n "$old" ] && [ "$old" != "$target" ]; then
    point_link previous "$old"
  fi

  log "switching ${SERVICE} to ${target##*/}"
  point_link current "$target"
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
  # Mark it, so neither --switch ("newest release") nor --rollback picks it again.
  echo "$(date -Is) did not become healthy after switch" > "$target/REJECTED"
  # Put `previous` back to what it was before this attempt. Leaving it at
  # `old` would make it equal to `current` after the rollback below, which
  # turns the next --rollback into a no-op and loses the real previous release.
  if [ -n "$prev_before" ] && [ "$prev_before" != "$target" ] && [ -d "$prev_before" ]; then
    point_link previous "$prev_before"
  else
    rm -f "$RUNTIME_DIR/previous"
  fi

  if [ -n "$old" ] && [ -d "$old" ] && [ "$old" != "$target" ]; then
    point_link current "$old"
    systemctl reset-failed "$SERVICE" 2>/dev/null || true
    systemctl restart "$SERVICE"
    if wait_healthy; then
      die "rolled back to ${old##*/}; release ${target##*/} was rejected and marked"
    fi
    die "rollback target ${old##*/} is also unhealthy; investigate immediately"
  fi
  die "no previous release to roll back to; ${SERVICE} is down on ${target##*/}"
}

# Release ids start with a timestamp, so name order is time order. (mtime is
# not used: copying or touching a release directory would reorder them.)
releases_newest_first() {
  find "$RUNTIME_DIR/releases" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r
}

latest_release() {
  local r
  while read -r r; do
    if [ ! -e "$r/REJECTED" ]; then echo "$r"; return 0; fi
  done < <(releases_newest_first)
}

prune_releases() {
  [ -d "$RUNTIME_DIR/releases" ] || return 0
  local keep_cur keep_prev r n=0
  keep_cur="$(link_target current)"
  keep_prev="$(link_target previous)"
  while read -r r; do
    if [ "$r" = "$keep_cur" ] || [ "$r" = "$keep_prev" ]; then continue; fi
    if [ -e "$r/REJECTED" ]; then
      log "removing rejected release ${r##*/}"
      rm -rf "$r"
      continue
    fi
    n=$((n + 1))
    if [ "$n" -le "$KEEP_RELEASES" ]; then continue; fi
    log "removing old release ${r##*/}"
    rm -rf "$r"
  done < <(releases_newest_first)
}

summary() {
  log "disk: runtime $(size_of "$RUNTIME_DIR") (releases: $(releases_newest_first | wc -l))"
  if systemctl is-active --quiet "$SERVICE"; then
    local pid; pid=$(systemctl show -p MainPID --value "$SERVICE")
    log "service RSS: $(awk '/VmRSS/ {printf "%d MB", $2/1024}' "/proc/${pid}/status")"
  fi
}

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

# ------------------------------------------------------------------- main ---

case "$MODE" in
  all)
    preflight_build
    warn_if_env_sets_database_url
    backup_db
    sync_source
    build
    stage_build_output
    install_release "$STAGE_DIR"
    finish_release
    ;;
  from)
    require_live_db
    require_smoke_port_free
    require_disk_mb 1000
    warn_if_env_sets_database_url
    backup_db
    src="$FROM"
    case "$FROM" in
      *.tgz|*.tar.gz)
        [ -f "$FROM" ] || die "$FROM not found"
        rm -rf "$INCOMING_DIR"
        mkdir -p "$INCOMING_DIR"; chmod 700 "$INCOMING_DIR"
        tar -xzf "$FROM" -C "$INCOMING_DIR" --no-same-owner
        src="$INCOMING_DIR" ;;
      *) [ -d "$FROM" ] || die "$FROM is not a directory" ;;
    esac
    install_release "$src"
    finish_release
    ;;
  switch)
    rel="$(latest_release)"
    [ -n "$rel" ] || die "no usable release in $RUNTIME_DIR/releases"
    if [ "$rel" = "$(link_target current)" ]; then
      log "already running the newest release (${rel##*/}); nothing to do"
    else
      require_live_db
      backup_db
      switch_to "$rel"
    fi
    summary
    ;;
  rollback)
    prev="$(link_target previous)"
    [ -n "$prev" ] || die "no previous release recorded; nothing to roll back to"
    [ "$prev" != "$(link_target current)" ] || die "the previous release is the one already running; nothing to roll back to"
    switch_to "$prev"
    summary
    ;;
  prune)
    prune_releases
    summary
    ;;
esac

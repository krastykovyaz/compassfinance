#!/usr/bin/env bash
#
# Smoke test for a running CompassFinance server.
#
#   scripts/smoke-test.sh <base-url> [reference-url]
#
# Every request carries the headers nginx adds in production (Host, and
# X-Forwarded-Proto/Host), so Auth.js and the Server Actions origin check see
# the same thing they see for real traffic.
#
# When a reference URL (the live service) is given, each page/API status is
# also compared against it, so "different from today's behaviour" fails the
# test, not just "not 200".
#
# Read-only against the database: it never signs anyone in, never sends an
# email and never starts a sync. The auth check stops at the redirect to
# Google, before any user or session row would be written.

set -u

BASE="${1:?usage: smoke-test.sh <base-url> [reference-url]}"
REF="${2:-}"
SITE_HOST="${SITE_HOST:-compassfinance.online}"

HDRS=(-H "Host: ${SITE_HOST}" -H "X-Forwarded-Proto: https" -H "X-Forwarded-Host: ${SITE_HOST}" -H "X-Forwarded-For: 127.0.0.1")
pass=0
fail=0

ok()   { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }

status_of() { curl -s -o /dev/null -m 40 -w '%{http_code}' "${HDRS[@]}" "$1"; }
ctype_of()  { curl -s -o /dev/null -m 40 -w '%{content_type}' "${HDRS[@]}" "$1"; }

# page <path> <expected-status> [expected-content-type-prefix]
page() {
  local path="$1" want="$2" ctype_want="${3:-}" got
  got=$(status_of "${BASE}${path}")
  if [ "$got" != "$want" ]; then bad "${path}: status ${got}, expected ${want}"; return; fi
  if [ -n "$ctype_want" ]; then
    local ct; ct=$(ctype_of "${BASE}${path}")
    case "$ct" in "$ctype_want"*) ;; *) bad "${path}: content-type '${ct}', expected '${ctype_want}*'"; return ;; esac
  fi
  if [ -n "$REF" ]; then
    local ref_got; ref_got=$(status_of "${REF}${path}")
    if [ "$ref_got" != "$got" ]; then bad "${path}: new=${got} but live=${ref_got}"; return; fi
    ok "${path} -> ${got} (matches live)"
  else
    ok "${path} -> ${got}"
  fi
}

echo "smoke test: ${BASE}${REF:+  (reference: ${REF})}"

echo "[pages]"
page "/" 200 "text/html"
page "/signin" 200 "text/html"
page "/explore" 200 "text/html"
page "/markets" 200 "text/html"
page "/news" 200 "text/html"
page "/sw.js" 200
page "/no-such-page-smoke" 404

echo "[database reads: both pages run a real Prisma query against the users / achievement_shares tables]"
# An unknown code/token must render the fallback, not crash. A server that
# opened an empty or wrong database file would fail here with "no such table".
page "/invite/smoke-test-code" 200 "text/html"
page "/share/achievement/smoke-test-token" 200 "text/html"

echo "[opengraph images: need next/og's bundled wasm + font files to be present]"
page "/invite/smoke-test-code/opengraph-image" 200 "image/png"
page "/share/achievement/smoke-test-token/opengraph-image" 200 "image/png"

echo "[static assets]"
html=$(curl -s -m 40 "${HDRS[@]}" "${BASE}/")
chunk=$(printf '%s' "$html" | grep -o '/_next/static/[^"]*\.js' | head -1)
if [ -z "$chunk" ]; then bad "no /_next/static chunk referenced by the home page"; else page "$chunk" 200 "application/javascript"; fi
css=$(printf '%s' "$html" | grep -o '/_next/static/[^"]*\.css' | head -1)
if [ -z "$css" ]; then bad "no /_next/static css referenced by the home page"; else page "$css" 200 "text/css"; fi

echo "[auth]"
page "/api/auth/providers" 200 "application/json"
session=$(curl -s -m 20 "${HDRS[@]}" "${BASE}/api/auth/session")
if [ "$session" = "null" ]; then ok "/api/auth/session -> null (anonymous)"; else bad "/api/auth/session returned '${session}', expected null"; fi
page "/api/me" 401

# CSRF round trip + start of the Google flow. This needs AUTH_SECRET,
# GOOGLE_CLIENT_ID/SECRET and AUTH_URL to all be loaded, which a home-page
# check does not prove. It stops at the 302 to accounts.google.com.
oauth_client_id() {
  local base="$1" hdr body token cookie loc
  hdr=$(mktemp)
  body=$(curl -s -m 20 -D "$hdr" "${HDRS[@]}" "${base}/api/auth/csrf")
  token=$(printf '%s' "$body" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
  cookie=$(grep -i '^set-cookie:.*csrf-token' "$hdr" | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*);.*/\1/' | tr -d '\r')
  rm -f "$hdr"
  [ -n "$token" ] && [ -n "$cookie" ] || { echo "NO_CSRF"; return; }
  loc=$(curl -s -m 20 -o /dev/null -D - -X POST "${HDRS[@]}" -H "Cookie: ${cookie}" \
          --data-urlencode "csrfToken=${token}" --data-urlencode "callbackUrl=https://${SITE_HOST}/" \
          "${base}/api/auth/signin/google" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r')
  case "$loc" in
    https://accounts.google.com/*) printf '%s' "$loc" | sed -n 's/.*[?&]client_id=\([^&]*\).*/\1/p' ;;
    *) echo "BAD_LOCATION:${loc}" ;;
  esac
}
cid=$(oauth_client_id "$BASE")
case "$cid" in
  NO_CSRF|BAD_LOCATION*|"") bad "Google sign-in start failed (${cid:-empty})" ;;
  *)
    if [ -n "$REF" ]; then
      ref_cid=$(oauth_client_id "$REF")
      if [ "$cid" = "$ref_cid" ]; then ok "Google sign-in start -> accounts.google.com, same client_id as live"; else bad "Google client_id differs from live"; fi
    else
      ok "Google sign-in start -> accounts.google.com"
    fi ;;
esac

echo "[api]"
page "/api/user/profile" 401
page "/api/notifications" 401

echo
echo "smoke test: ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]

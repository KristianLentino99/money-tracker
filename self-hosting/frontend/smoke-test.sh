#!/bin/sh
# Starts the frontend image and checks what search engines see: every sitemap
# URL answers 200 with a canonical pointing at itself, and the app shell is
# marked noindex.
# Usage: smoke-test.sh <image>
set -eu

IMAGE="$1"
PORT="${PORT:-8089}"
BASE="http://localhost:$PORT"
MCP_ORIGIN="${MCP_BASE_URL:-https://finance.example.test}"

cid=$(docker run -d -p "$PORT:80" -e IS_SELF_HOST=true -e MCP_BASE_URL="$MCP_ORIGIN" "$IMAGE")
trap 'docker rm -f "$cid" >/dev/null' EXIT

i=0
until curl -fs -o /dev/null "$BASE/version.json"; do
  i=$((i + 1))
  [ "$i" -lt 30 ] || { echo "container did not start" >&2; docker logs "$cid" >&2; exit 1; }
  sleep 1
done

discovery_dir=$(mktemp -d)
trap 'rm -rf "$discovery_dir"; docker rm -f "$cid" >/dev/null' EXIT
curl -fsS "$BASE/.well-known/mcp/server-card.json" > "$discovery_dir/server-card.json"
curl -fsS "$BASE/.well-known/agent-skills/index.json" > "$discovery_dir/skills-index.json"
curl -fsS "$BASE/skills/connect-moneymatter/SKILL.md" > "$discovery_dir/SKILL.md"
python3 - "$discovery_dir" "$MCP_ORIGIN" <<'PY'
import hashlib
import json
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
origin = sys.argv[2].rstrip('/')
card = json.loads((directory / 'server-card.json').read_text())
assert card['transport']['url'] == f'{origin}/mcp', card['transport']
oauth = card['authentication']['oauth2']
assert oauth['authorizationServer'] == f'{origin}/api/v1/auth', oauth
assert oauth['metadata'] == f'{origin}/.well-known/oauth-authorization-server', oauth
assert oauth['protectedResourceMetadata'] == f'{origin}/.well-known/oauth-protected-resource', oauth

index = json.loads((directory / 'skills-index.json').read_text())
skill = next(item for item in index['skills'] if item['name'] == 'connect-moneymatter')
assert skill['url'] == f'{origin}/skills/connect-moneymatter/SKILL.md', skill
markdown = (directory / 'SKILL.md').read_bytes()
assert skill['sha256'] == hashlib.sha256(markdown).hexdigest(), 'Skill content hash mismatch'
text = markdown.decode()
for endpoint in ('/mcp', '/.well-known/mcp/server-card.json', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource'):
    assert f'{origin}{endpoint}' in text, f'Missing deployment endpoint: {endpoint}'
assert 'https://mcp.moneymatter.app/mcp' not in text, 'Skill directs the agent to the hosted MCP server'
assert f'{origin}/sign-up' in text, 'Skill must register the user on this deployment'
assert 'https://moneymatter.app/sign-up' not in text, 'Skill directs registration to the hosted site'
print('ok   MCP discovery advertises this deployment and a matching skill digest')
PY

locs() { curl -fsS "$BASE$1" | grep -o '<loc>[^<]*</loc>' | sed -e 's/<[^>]*>//g'; }
path_of() { printf '%s' "$1" | sed -e 's|^https\{0,1\}://[^/]*||'; }

fail=0
checked=0
for map in $(locs /sitemap-index.xml); do
  for url in $(locs "$(path_of "$map")"); do
    checked=$((checked + 1))
    # The sitemap lists the homepage without the slash its canonical carries.
    [ -n "$(path_of "$url")" ] || url="$url/"
    body=$(curl -sS -w '\n%{http_code}' "$BASE$(path_of "$url")")
    status=$(printf '%s' "$body" | tail -n 1)
    case "$status:$body" in
      200:*"<link rel=\"canonical\" href=\"$url\""*) echo "ok   $url" ;;
      200:*) echo "FAIL $url: canonical does not point at itself"; fail=1 ;;
      *) echo "FAIL $url: HTTP $status"; fail=1 ;;
    esac
  done
done
[ "$checked" -gt 0 ] || { echo "FAIL sitemap lists no URLs"; fail=1; }

robots_tag() { curl -sS -o /dev/null -D - "$BASE$1" | tr -d '\r' | grep -i '^x-robots-tag:' || true; }
[ -n "$(robots_tag /dashboard)" ] || { echo "FAIL /dashboard: app shell is not noindex"; fail=1; }
[ -z "$(robots_tag /sign-in)" ] || { echo "FAIL /sign-in: must stay indexable"; fail=1; }
case "$(curl -sS -w '\n%{http_code}' "$BASE/demo")" in
  *'<meta name="robots" content="noindex'*200) ;;
  *) echo "FAIL /demo: not the noindex landing page"; fail=1 ;;
esac

exit "$fail"

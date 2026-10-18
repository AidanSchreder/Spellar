#!/usr/bin/env bash
# Deploys the plugin to seds.ca.
#
#   bin/deploy.sh             checks, copy, smoke test (the plugin is already active)
#   bin/deploy.sh --first     first time only: checks, copy, `php -l`, activate, smoke test;
#                             deactivates again at once if the homepage stops answering 200
#   bin/deploy.sh --no-tests  skip the Playwright tests (the data check still runs)
#
# Needs: the SSH alias "seds" (override with SPELLAR_SSH_HOST), Node, Git Bash on Windows.
# This machine has no rsync, so files go over SSH as a tar stream into ~/spellar-deploy/ on the
# server, are checked there, and the server's rsync mirrors them into the plugin folder.
# Only the files the plugin needs ship: no dev/, tests/, src/, docs/, bin/, node_modules/, .claude/.

set -euo pipefail

HOST="${SPELLAR_SSH_HOST:-seds}"
URL="${SPELLAR_SITE_URL:-https://www.seds.ca}"
FIRST=""
TESTS="yes"
for arg in "$@"; do
  case "$arg" in
    --first) FIRST="yes" ;;
    --no-tests) TESTS="" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."

echo "== Checks"
node bin/validate-data.mjs
node bin/build-client.mjs > /dev/null
if [ -n "$(git status --porcelain -- assets)" ]; then
  echo "assets/ differs from the last commit after a fresh build: commit the build first." >&2
  exit 1
fi
if [ -n "$TESTS" ]; then npx playwright test; fi

echo "== Copy"
SHIP=(spellar.php uninstall.php includes assets data)
tar -czf - "${SHIP[@]}" | ssh "$HOST" 'rm -rf ~/spellar-deploy && mkdir -p ~/spellar-deploy/spellar && tar -xzf - -C ~/spellar-deploy/spellar'

# On the server: syntax-check every PHP file with the site's PHP, then mirror into the plugin folder.
ssh "$HOST" 'bash -s' <<'EOF'
set -e
cd ~/spellar-deploy/spellar
for f in $(find . -name '*.php'); do
  /usr/local/php83/bin/php -l "$f" > /dev/null || { echo "Syntax error in $f: nothing was copied." >&2; exit 1; }
done
echo "php -l: OK"
mkdir -p ~/seds.ca/wp-content/plugins/spellar
rsync -a --delete ~/spellar-deploy/spellar/ ~/seds.ca/wp-content/plugins/spellar/
echo "Copied to wp-content/plugins/spellar/"
EOF

wp() { ssh "$HOST" "WP_CLI_PHP=/usr/local/php83/bin/php wp --path=\$HOME/seds.ca $*"; }

if [ -n "$FIRST" ]; then
  echo "== Activate"
  wp plugin activate spellar
fi

echo "== Smoke test"
STAMP=$(date +%s)
# A query string makes the page cache build the homepage live, so the plugin's code really runs.
HOME_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/?spellar-smoke=$STAMP")
echo "Homepage: $HOME_CODE"
if [ "$HOME_CODE" != "200" ]; then
  echo "The homepage did not answer 200. Deactivating Spellar." >&2
  wp plugin deactivate spellar || true
  exit 1
fi

TODAY=$(date -u +%F)
PUZZLE=$(curl -s "$URL/wp-json/spellar/v1/puzzle?date=$TODAY")
echo "Puzzle for $TODAY: $PUZZLE"
echo "$PUZZLE" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!Number.isInteger(p.number)||!p.answer||!p.length) process.exit(1)' \
  || { echo "The puzzle route did not return a valid puzzle." >&2; exit 1; }

STATUS=$(wp plugin list --name=spellar --field=status)
echo "Plugin status: $STATUS"
[ "$STATUS" = "active" ] || { echo "Spellar is not active." >&2; exit 1; }

# PHP errors mentioning the plugin, in the server's error log and WordPress's debug log. (Apache's
# "client denied" lines for data/*.json are the .htaccess working, not errors.)
ERRORS=$(ssh "$HOST" 'tail -n 400 ~/logs/seds.ca/https/error.log 2>/dev/null; tail -n 400 ~/seds.ca/wp-content/debug.log 2>/dev/null' | grep -i "spellar" | grep -E "PHP (Fatal|Parse|Warning|Notice|Deprecated)" || true)
if [ -n "$ERRORS" ]; then
  echo "PHP messages mentioning Spellar:" >&2
  echo "$ERRORS" >&2
  exit 1
fi
echo "No PHP errors mentioning Spellar."

# Saved copies of the game page may name the previous asset versions.
wp spellar flush-page || true
echo "Deployed."

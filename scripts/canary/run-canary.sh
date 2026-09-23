#!/usr/bin/env bash
#
# run-canary.sh
#
# Runs the drift canary once, keeps the consecutive-failure count, and decides
# whether anyone needs to be told. The canary script itself only measures and
# reports; escalation lives here so that changing how we are alerted never
# risks changing what is measured.
#
# Escalation is on the SECOND consecutive failure, never the first. A single
# failure is far more likely to be a slow Gmail load or an expired session
# than a Gmail redesign, and a canary that cries wolf is a canary that gets
# ignored inside a fortnight.
#
# Exit codes are passed straight through from the canary:
#   0 PASS   2 FAIL   3 SKIPPED   4 ERROR
#
# Usage:  scripts/canary/run-canary.sh [extra args passed to the canary]

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HERE/state.json"
LOG="$HERE/canary.log"

ESCALATE_AFTER=2

mkdir -p "$HERE"
node_path="$(npm root -g 2>/dev/null || true)"

stamp() { date -Iseconds; }

read_state() {
    if [ -f "$STATE" ]; then
        FAIL_STREAK=$(grep -o '"failStreak"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE" | grep -o '[0-9]*$' || echo 0)
        ERROR_STREAK=$(grep -o '"errorStreak"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE" | grep -o '[0-9]*$' || echo 0)
    fi
    FAIL_STREAK=${FAIL_STREAK:-0}
    ERROR_STREAK=${ERROR_STREAK:-0}
}

write_state() {
    printf '{ "failStreak": %s, "errorStreak": %s, "lastRun": "%s", "lastVerdict": "%s" }\n' \
        "$1" "$2" "$(stamp)" "$3" > "$STATE"
}

notify() {
    local title="$1" body="$2"
    command -v notify-send >/dev/null 2>&1 && notify-send -u critical "$title" "$body" >/dev/null 2>&1
    return 0
}

open_issue() {
    local title="$1" body="$2"
    command -v gh >/dev/null 2>&1 || { echo "  gh not installed; issue not opened" >> "$LOG"; return 0; }
    # One open issue, not one a day. A persisting break updates nothing and
    # opens nothing further.
    if gh issue list --repo PalWorks/Gmail-Labels-Queries-As-Tabs --state open --search "$title in:title" \
        --json title --jq '.[].title' 2>/dev/null | grep -qxF "$title"; then
        echo "  issue already open; not duplicating" >> "$LOG"
        return 0
    fi
    gh issue create --repo PalWorks/Gmail-Labels-Queries-As-Tabs \
        --title "$title" --body "$body" >> "$LOG" 2>&1 || echo "  gh issue create failed" >> "$LOG"
}

read_state

cd "$REPO" || exit 4

# The canary loads dist/, so a stale or missing build would test the wrong
# thing. Building is cheap and makes the timer self-sufficient.
npm run build >/dev/null 2>&1 || { echo "$(stamp) BUILD-FAILED" >> "$LOG"; exit 4; }

OUTPUT="$(NODE_PATH="$node_path" node "$HERE/gmail-drift-canary.mjs" "$@" 2>&1)"
CODE=$?

{
    echo "$(stamp) exit=$CODE"
    echo "$OUTPUT" | sed 's/^/  /'
} >> "$LOG"

case "$CODE" in
    0)
        write_state 0 0 PASS
        ;;
    3)
        # A skip teaches nothing, so it neither breaks nor mends a streak.
        write_state "$FAIL_STREAK" "$ERROR_STREAK" SKIPPED
        ;;
    2)
        FAIL_STREAK=$((FAIL_STREAK + 1))
        write_state "$FAIL_STREAK" 0 FAIL
        if [ "$FAIL_STREAK" -ge "$ESCALATE_AFTER" ]; then
            TITLE="Gmail drift canary: the label menu contract broke"
            BODY=$(printf 'The drift canary has failed %s runs in a row.\n\n```\n%s\n```\n\nThe contract and what to do for each check is in `.planning/phases/05-label-menu/PLAN.md` and PLAYBOOK.md.\n' "$FAIL_STREAK" "$OUTPUT")
            # The issue is opened once and left open; the desktop notification
            # fires on the run that crosses the threshold and then only weekly.
            # A critical popup every day about something already reported is
            # how notifications get muted, and a muted one is worse than none.
            if [ "$FAIL_STREAK" -eq "$ESCALATE_AFTER" ] || [ $((FAIL_STREAK % 7)) -eq 0 ]; then
                notify "Gmail drift canary failed $FAIL_STREAK times" "Gmail changed something the label menu depends on."
            fi
            open_issue "$TITLE" "$BODY"
        fi
        ;;
    *)
        ERROR_STREAK=$((ERROR_STREAK + 1))
        write_state "$FAIL_STREAK" "$ERROR_STREAK" ERROR
        if [ "$ERROR_STREAK" -ge "$ESCALATE_AFTER" ]; then
            TITLE="Gmail drift canary: the canary itself cannot run"
            BODY=$(printf 'The canary has errored %s runs in a row. This is the canary, not Gmail.\n\n```\n%s\n```\n' "$ERROR_STREAK" "$OUTPUT")
            if [ "$ERROR_STREAK" -eq "$ESCALATE_AFTER" ] || [ $((ERROR_STREAK % 7)) -eq 0 ]; then
                notify "Gmail drift canary cannot run" "$ERROR_STREAK errors in a row. Check Playwright and Chrome."
            fi
            open_issue "$TITLE" "$BODY"
        fi
        ;;
esac

exit "$CODE"

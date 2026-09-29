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
#   0 PASS   2 FAIL   3 SKIPPED   4 ERROR   5 DEGRADED
#
# Who is told, and how:
#   - a desktop notification (notify-send), as before
#   - a GitHub issue, deduplicated by title, as before
#   - a Google Chat message, when a webhook is configured in
#     ~/.config/gmail-labels-as-tabs/alerts.env (see README.md). Each kind of
#     break has its own thread, so a week of reminders reads as one
#     conversation. A recovery is announced in the same thread.
#
# DEGRADED means working, but only because a fallback held, or a fallback has
# stopped matching. It escalates like FAIL (second run in a row), but it is a
# warning, not a break. When the canary also wrote a selector proposal and
# GLT_CANARY_AUTO_PR=1 is set in alerts.env, propose-selectors.mjs opens a
# pull request with the refreshed value, and the link is sent to Google Chat.
#
# Usage:  scripts/canary/run-canary.sh [extra args passed to the canary]

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HERE/state.json"
LOG="$HERE/canary.log"
PROPOSAL="$HERE/selector-proposal.json"
ALERTS_ENV="$HOME/.config/gmail-labels-as-tabs/alerts.env"

ESCALATE_AFTER=2

mkdir -p "$HERE"
node_path="$(npm root -g 2>/dev/null || true)"

stamp() { date -Iseconds; }

read_state() {
    if [ -f "$STATE" ]; then
        FAIL_STREAK=$(grep -o '"failStreak"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE" | grep -o '[0-9]*$' || echo 0)
        ERROR_STREAK=$(grep -o '"errorStreak"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE" | grep -o '[0-9]*$' || echo 0)
        DEGRADED_STREAK=$(grep -o '"degradedStreak"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE" | grep -o '[0-9]*$' || echo 0)
    fi
    FAIL_STREAK=${FAIL_STREAK:-0}
    ERROR_STREAK=${ERROR_STREAK:-0}
    DEGRADED_STREAK=${DEGRADED_STREAK:-0}
}

# failStreak errorStreak degradedStreak verdict
write_state() {
    printf '{ "failStreak": %s, "errorStreak": %s, "degradedStreak": %s, "lastRun": "%s", "lastVerdict": "%s" }\n' \
        "$1" "$2" "$3" "$(stamp)" "$4" > "$STATE"
}

# The run that crosses the threshold, then weekly. A daily reminder about
# something already reported is how an alert channel gets muted.
due() {
    local streak="$1"
    [ "$streak" -eq "$ESCALATE_AFTER" ] || { [ "$streak" -gt "$ESCALATE_AFTER" ] && [ $((streak % 7)) -eq 0 ]; }
}

# event thread title body
gchat() {
    local body_file
    body_file="$(mktemp)"
    printf '%s' "$4" > "$body_file"
    NODE_PATH="$node_path" node "$HERE/notify.mjs" --event "$1" --thread "$2" --title "$3" --body-file "$body_file" >> "$LOG" 2>&1
    case $? in
        0) echo "  google chat: sent ($1)" >> "$LOG" ;;
        3) echo "  google chat: not configured" >> "$LOG" ;;
        *) echo "  google chat: delivery failed ($1)" >> "$LOG" ;;
    esac
    rm -f "$body_file"
    return 0
}

auto_pr_enabled() {
    [ -f "$ALERTS_ENV" ] && grep -qE '^[[:space:]]*GLT_CANARY_AUTO_PR[[:space:]]*=[[:space:]]*"?1"?[[:space:]]*$' "$ALERTS_ENV"
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

# What the previous run said, so a recovery can be announced where the
# break was.
PREV_FAIL=$FAIL_STREAK
PREV_ERROR=$ERROR_STREAK
PREV_DEGRADED=$DEGRADED_STREAK

announce_recovery() {
    if [ "$PREV_FAIL" -ge "$ESCALATE_AFTER" ]; then
        gchat RECOVERED canary-fail "the contract holds again" "The drift canary passed after $PREV_FAIL failed runs."
    fi
    if [ "$PREV_ERROR" -ge "$ESCALATE_AFTER" ]; then
        gchat RECOVERED canary-error "the canary runs again" "The drift canary ran after $PREV_ERROR errors."
    fi
    if [ "$PREV_DEGRADED" -ge "$ESCALATE_AFTER" ] && [ "$1" = PASS ]; then
        gchat RECOVERED canary-degraded "no fallback is carrying the load any more" "The drift canary passed cleanly after $PREV_DEGRADED degraded runs."
    fi
}

case "$CODE" in
    0)
        write_state 0 0 0 PASS
        announce_recovery PASS
        ;;
    3)
        # A skip teaches nothing, so it neither breaks nor mends a streak.
        write_state "$FAIL_STREAK" "$ERROR_STREAK" "$DEGRADED_STREAK" SKIPPED
        ;;
    5)
        DEGRADED_STREAK=$((DEGRADED_STREAK + 1))
        write_state 0 0 "$DEGRADED_STREAK" DEGRADED
        announce_recovery DEGRADED
        if [ "$DEGRADED_STREAK" -ge "$ESCALATE_AFTER" ] && due "$DEGRADED_STREAK"; then
            notify "Gmail drift canary: degraded" "A fallback is carrying the load, or has stopped matching."
            gchat DEGRADED canary-degraded "a fallback is carrying the load ($DEGRADED_STREAK runs)" \
                "Nothing is broken on screen yet.$(printf '\n\n')$OUTPUT"
        fi
        # The proposal is acted on as soon as it exists: it is a pull request,
        # not a merge, and propose-selectors.mjs opens at most one per value.
        if [ -f "$PROPOSAL" ]; then
            if auto_pr_enabled; then
                PR_OUT="$(NODE_PATH="$node_path" node "$HERE/propose-selectors.mjs" --proposal "$PROPOSAL" 2>>"$LOG")"
                PR_CODE=$?
                echo "  propose-selectors exit=$PR_CODE $PR_OUT" >> "$LOG"
                if [ "$PR_CODE" -eq 0 ] && [ -n "$PR_OUT" ]; then
                    gchat PROPOSAL canary-degraded "a refreshed selector is ready for review" \
                        "The canary opened a pull request with the value Gmail uses today:$(printf '\n')$PR_OUT"
                fi
            else
                echo "  selector proposal written; GLT_CANARY_AUTO_PR is not set, so no pull request" >> "$LOG"
            fi
        fi
        ;;
    2)
        FAIL_STREAK=$((FAIL_STREAK + 1))
        write_state "$FAIL_STREAK" 0 0 FAIL
        if [ "$FAIL_STREAK" -ge "$ESCALATE_AFTER" ]; then
            TITLE="Gmail drift canary: a Gmail contract broke"
            BODY=$(printf 'The drift canary has failed %s runs in a row.\n\n```\n%s\n```\n\nWhat each check means and what to do is in scripts/canary/README.md and PLAYBOOK.md.\n' "$FAIL_STREAK" "$OUTPUT")
            # The issue is opened once and left open; the notifications fire on
            # the run that crosses the threshold and then only weekly.
            if due "$FAIL_STREAK"; then
                notify "Gmail drift canary failed $FAIL_STREAK times" "Gmail changed something the extension depends on."
                gchat FAIL canary-fail "a Gmail contract broke ($FAIL_STREAK runs in a row)" "$OUTPUT"
            fi
            open_issue "$TITLE" "$BODY"
        fi
        ;;
    *)
        ERROR_STREAK=$((ERROR_STREAK + 1))
        write_state "$FAIL_STREAK" "$ERROR_STREAK" "$DEGRADED_STREAK" ERROR
        if [ "$ERROR_STREAK" -ge "$ESCALATE_AFTER" ]; then
            TITLE="Gmail drift canary: the canary itself cannot run"
            BODY=$(printf 'The canary has errored %s runs in a row. This is the canary, not Gmail.\n\n```\n%s\n```\n' "$ERROR_STREAK" "$OUTPUT")
            if due "$ERROR_STREAK"; then
                notify "Gmail drift canary cannot run" "$ERROR_STREAK errors in a row. Check Playwright and Chrome."
                gchat ERROR canary-error "the canary itself cannot run ($ERROR_STREAK runs in a row)" "$OUTPUT"
            fi
            open_issue "$TITLE" "$BODY"
        fi
        ;;
esac

exit "$CODE"

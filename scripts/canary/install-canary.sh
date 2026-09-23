#!/usr/bin/env bash
#
# install-canary.sh
#
# Installs the drift canary as a daily systemd *user* timer.
#
# A user timer rather than cron, for two reasons: this machine already runs
# three of them, and `systemctl --user status` keeps a record of a failed run
# that cron would only email into the void.
#
#   scripts/canary/install-canary.sh            install and enable
#   scripts/canary/install-canary.sh --remove   stop, disable and delete
#   scripts/canary/install-canary.sh --status    show timer and last run
#
# The source Chrome profile is detected once, at install time, and written
# into the unit, so the timer does not depend on a browser being open when it
# fires.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
NAME="gmail-drift-canary"

case "${1:-}" in
    --remove)
        systemctl --user disable --now "$NAME.timer" 2>/dev/null || true
        rm -f "$UNIT_DIR/$NAME.timer" "$UNIT_DIR/$NAME.service"
        systemctl --user daemon-reload
        echo "Removed $NAME.timer and $NAME.service."
        exit 0
        ;;
    --status)
        systemctl --user list-timers "$NAME.timer" --no-pager || true
        echo
        systemctl --user status "$NAME.service" --no-pager -n 20 || true
        exit 0
        ;;
esac

# Find every Chrome profile that holds cookies and record them all, in order,
# as a colon-separated list. The canary tries each until one reaches a
# signed-in Gmail.
#
# All of them, rather than a guess at the right one, because nothing on disk
# distinguishes them cheaply: two profiles on this machine each carry an
# `account_info` block naming the same address, and only one of them may have a
# live Gmail session. Reaching Gmail is the only honest test, and the canary
# already performs it.
#
# Fixed at install time rather than detected on each run, because the timer
# fires in the middle of the night when no Chrome may be running at all.
PROFILES="${CANARY_SOURCE_PROFILE:-}"
if [ -z "$PROFILES" ]; then
    while IFS= read -r dir; do
        case "$dir" in /tmp/*) continue ;; esac
        if [ -f "$dir/Default/Cookies" ]; then
            case ":$PROFILES:" in *":$dir:"*) ;; *) PROFILES="${PROFILES:+$PROFILES:}$dir" ;; esac
        fi
    done < <(ps -eo args | grep -o -- '--user-data-dir=[^ ]*' | sed 's/--user-data-dir=//' | sort -u)
fi
if [ -f "$HOME/.config/google-chrome/Default/Cookies" ]; then
    case ":$PROFILES:" in
        *":$HOME/.config/google-chrome:"*) ;;
        *) PROFILES="${PROFILES:+$PROFILES:}$HOME/.config/google-chrome" ;;
    esac
fi
if [ -z "$PROFILES" ]; then
    echo "Could not find a Chrome profile with a cookie store." >&2
    echo "Set CANARY_SOURCE_PROFILE=/path/to/profile and run again." >&2
    exit 1
fi

mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/$NAME.service" <<UNIT
[Unit]
Description=Gmail label-menu drift canary for Gmail Labels as Tabs
Documentation=file://$HERE/README.md

[Service]
Type=oneshot
WorkingDirectory=$(cd "$HERE/../.." && pwd)
Environment=CANARY_SOURCE_PROFILE=$PROFILES
Environment=PATH=$PATH
ExecStart=$HERE/run-canary.sh
# The canary reports through its own log, its state file and notify-send; a
# non-zero exit here is a normal outcome, not a unit failure.
SuccessExitStatus=0 2 3 4
UNIT

cat > "$UNIT_DIR/$NAME.timer" <<UNIT
[Unit]
Description=Run the Gmail label-menu drift canary daily

[Timer]
OnCalendar=daily
# Do not all fire at once with every other daily timer on the machine, and do
# not hammer Gmail at the same second every day.
RandomizedDelaySec=30m
# A run missed because the machine was off happens at the next boot.
Persistent=true
Unit=$NAME.service

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now "$NAME.timer"

echo "Installed. Profiles tried in order: $PROFILES"
systemctl --user list-timers "$NAME.timer" --no-pager
echo
echo "Run it now:      systemctl --user start $NAME.service"
echo "See the log:     tail -f $HERE/canary.log"
echo "Remove it:       $HERE/install-canary.sh --remove"

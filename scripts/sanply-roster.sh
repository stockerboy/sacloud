#!/bin/sh
# ★열산 명단 대조 — 겹쳐 돌지 않는다★ (2026-09-22)
#
# > 실측: 이 잡을 자물쇠 없이 돌렸더니 마침 autocollect 의 크롬(barracks-collect)과
# >   season0 의 IPL 랭킹 적용이 겹쳐 ★크롬 26개 · load 37.57★ 까지 치솟았다.
# >   그 부하 속에서 병영 요청이 실패해 ★91곳 찾음 → 86곳★ 으로 줄었다
# >   (검색 안 된 게 아니라 부하로 답을 못 받은 것이다).
#
# ★자물쇠를 쥔다★ — 다른 무거운 크롬 잡(수집·랭킹적용)과 겹치면 기다린다.
set -u
cd "$(dirname "$0")/.." || exit 1
. /root/sacloud.env 2>/dev/null || true
flock /var/lock/sac-manual-chrome.lock -c "pnpm --filter @sacloud/worker nexon sanply-roster-register $*"

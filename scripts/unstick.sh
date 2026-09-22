#!/bin/sh
# ★★막힌 경기를 스스로 푼다★★ (2026-09-22 · 사장님 지시)
#
# > 「경기 40분 후에도 ★킬데스 수집조차 안 된★ 이런 경기들 싹다 명단채우고 분석 끝내놔」
# > 「안되는거 있으면 ★바로바로 고쳐★」
#
# ── 2026-09-22 새벽에 손으로 뚫은 길을 그대로 예약에 건다
#   ```
#   막힌 경기 110건 → ★0건★
#     ① 모르는 클랜을 찾아 만들었다 → ★2026-09-22 에 껐다★ (아래 경고)
#     ② 클랜 번호를 받아 적었다 (번호가 없으면 명단이 못 잇는다)
#     ④ 경기 원문으로 «이 번호는 저 클랜» 을 알아냈다 (17개)
#     ⑤ 진영이 잘못 박힌 경기 ★1,145건★ 을 바로잡았다
#   ```
#   ★이 일은 새 경기가 들어올 때마다 다시 생긴다.★ 그래서 사람이 아니라 예약이 한다.
#
# ── ⚠⚠ ★★2026-09-22 — 클랜을 만들거나 리그에 올리지 않는다★★ ⚠⚠
#
#   > 「리그에 등록된 클랜끼리만 기록해야지 ★뭔 개잡사들이랑 한걸 다 기록하고 있어★」
#
#   ★상대 클랜을 리그에 올리면 기록하면 안 되는 경기가 기록된다.★
#   실측으로 등록 23줄 때문에 115경기가 잘못 들어왔다 (되돌렸다).
#   이제 `clan-find-missing` 은 ★번호만 받아 적는다★ — 등록은 사장님이 정한다.
#   되돌리려면 `CLAN_FIND_CREATE=1`.
#
# ⚠ ★무거운 일이다★ — 20분에 한 번이면 넉넉하다. 겹치지 않게 자물쇠를 쥔다.
# ⚠ ★403 이면 클랜 찾기가 스스로 멈춘다★ — 우회하지 않는다 (D-266)
set -u

cd "$(dirname "$0")/.." || exit 1
. /root/sacloud.env 2>/dev/null || true

LOG="${UNSTICK_LOG:-/root/log/unstick.log}"
mkdir -p /root/log
say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" >> "$LOG"; }

say "★막힌 경기 풀기 시작★"

# ① ~ ④ — 모르는 클랜 찾기 · 번호 받기 · 번호 알아내기
timeout 540 pnpm --filter @sacloud/worker nexon clan-find-missing \
  --limit "${UNSTICK_CLAN_LIMIT:-10}" --confirm >> "$LOG" 2>&1 || true

# ⑤ — 진영 바로잡기 (병영에 한 번도 안 물어본다. DB 만 본다)
timeout 300 pnpm --filter @sacloud/worker nexon match-side-fix --confirm >> "$LOG" 2>&1 || true

# 풀린 경기의 명단을 그 자리에서 채운다 — 자기 차례를 기다리지 않는다
flock -n /var/lock/sac-lineup.lock timeout -k 30 540 sh scripts/lineup.sh >> "$LOG" 2>&1 || true

tail -4 "$LOG" | sed 's/^/  /' >> "$LOG"
say "★끝★"

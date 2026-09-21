#!/bin/sh
# ★「정보갱신」 단추를 진짜로 만드는 예약★ (2026-09-21 · 사장님 지시)
#
# > 「정보갱신 누르면 ★현재 병영수첩상 닉네임과 클랜으로 최신화★ 되는 기능
# >  탑재한거야? ★안되는데?★」
#
# ── 여태 무엇이 빠져 있었나
#   단추는 `ImportJob` 에 `nexon:renew:*` 를 ★pending 으로 넣기만★ 했고
#   ★그 큐를 읽는 사람이 아무도 없었다.★ 「갱신했습니다」 라는 시각만 새것이 됐다.
#
# ── 왜 5분마다인가
#   사람이 단추를 누르고 ★기다리는★ 일이다. 한 시간 뒤에 반영되면 안 누른 것과 같다.
#   한 판은 25건 × 약 1초 = ★30초 안팎★ 이라 자주 돌아도 가볍다.
#
# ── 겹침
#   ★자기 자물쇠★ 를 쓴다. 명부 받기(`roster.sh`)와는 다른 이름이라 서로 안 막는다.
#   병영수첩에 대한 예의는 잡 안에서 지킨다 (요청 사이 0.9초).
#
# ```
# sh scripts/renew.sh              # 반영
# RENEW_DRY=1 sh scripts/renew.sh  # 미리보기 (한 줄도 안 쓴다)
# ```
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${RENEW_LOG:-${ROSTER_LOG:-C:/Users/LG/AppData/Local/Temp/claude/renew.log}}"
DRY="${RENEW_DRY:-0}"
LIMIT="${RENEW_LIMIT:-25}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# 짧은 잡이라 사이트와 같은 자리를 다투지 않게 세션 풀러를 쓴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

CONFIRM="--confirm"
if [ "$DRY" = "1" ]; then CONFIRM=""; fi

# shellcheck disable=SC2086
pnpm --filter @sacloud/worker nexon renew-requests --limit "$LIMIT" $CONFIRM >> "$LOG" 2>&1
code=$?

# 잡이 스스로 한 줄 요약을 찍는다 — 그 줄만 옮긴다
say "  $(grep -E '^정보갱신' "$LOG" | tail -1)"

if [ "$code" != "0" ]; then
  # 막혔다는 뜻이다. ★재시도하지 않는다★ — 큐는 그대로 남아 다음 판이 잇는다
  say "★★병영수첩이 막았다 — 이번 판은 여기까지★★"
fi
exit 0

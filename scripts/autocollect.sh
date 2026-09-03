#!/bin/sh
# ★15분마다 스스로 도는 수집★ (2026-09-04 · O-051)
#
# ── 왜 이 파일이 있나
#   사장님: ★«9/3부터 자동수집 15분마다 · 사람 손 0»★
#   ★돌릴 곳을 세 군데 다 재 봤고 셋 다 막혔다★ —
#   ```
#   GitHub 실행기   ★403★ (D-269)
#   Vercel 서울     ★403★ (D-274 · icn1 에서 직접 재서 확인)
#   Oracle 무료     ★한국 지역이 신청 화면에 없다★
#   ```
#   ★남은 것은 이 컴퓨터뿐이다.★ 그래서 ★이 컴퓨터가 켜져 있는 동안 도는 것★ 을 만든다.
#
# ── 쓰는 법
#   sh scripts/autocollect.sh              ← 창을 닫으면 멈춘다
#
#   ⚠ ★윈도 예약 작업으로 등록하지 않았다.★ ★그건 사장님 컴퓨터에 무언가를 심는 일이라
#     내가 임의로 하지 않는다.★ 원하시면 이 한 줄을 예약 작업에 넣으면 된다.
#
# ── 한 바퀴에 하는 일
#   ```
#   ① 배틀로그 ★600건★ (간격 1500ms ≒ 15분 · ★한 바퀴가 주기를 넘지 않게★)
#   ② 투영 — 경기 → 라인업
#   ③ 다음 바퀴까지 남은 시간만큼 쉰다
#   ```
#   ⚠ ★①이 15분을 넘으면 바퀴가 밀린다.★ 그래서 ★받은 뒤 남은 시간만 쉰다★ —
#     고정으로 15분을 쉬면 주기가 점점 늘어난다.
#
# ── ⚠ 멈추는 조건
#   ★차단(403·429)이면 그 자리에서 끝낸다.★ ★우회하지 않는다★ (D-266).
#   무겁거나 끊긴 것(코드 3)은 ★다음 바퀴에 다시 해 본다★ — 그건 일시적이다.
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${AUTOCOLLECT_LOG:-C:/Users/LG/AppData/Local/Temp/claude/autocollect.log}"
PERIOD="${AUTOCOLLECT_PERIOD:-900}"   # 15분
BATCH="${AUTOCOLLECT_BATCH:-600}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

say "★자동수집 시작★ — ${PERIOD}초마다 · 한 바퀴 ${BATCH}건 · 차단이면 끝낸다"

lap=0
while :; do
  lap=$((lap + 1))
  began=$(date +%s)

  pnpm --filter @sacloud/worker nexon barracks-collect \
    --league nolink --clans 43 --limit "$BATCH" --confirm \
    --health https://3rdcloud.my/api/health >> "$LOG" 2>&1
  code=$?

  if [ "$code" = "2" ]; then
    say "★★차단됐다 (403·429) — 자동수집을 끝낸다. 우회하지 않는다★★"
    exit 1
  fi

  pnpm --filter @sacloud/worker nexon iplmatch-project --confirm >> "$LOG" 2>&1
  pnpm --filter @sacloud/worker nexon battlelog-lineup --league nolink --confirm >> "$LOG" 2>&1

  got=$(grep -E '^계획 ' "$LOG" | tail -1)
  say "  ${lap}바퀴 (코드 ${code}) — ${got:-(요약을 못 읽었다)}"

  # ★남은 시간만 쉰다★ — 고정으로 쉬면 주기가 점점 밀린다
  spent=$((`date +%s` - began))
  rest=$((PERIOD - spent))
  if [ "$rest" -gt 0 ]; then
    sleep "$rest"
  else
    say "  ⚠ ★한 바퀴가 ${spent}초 걸렸다 — 주기(${PERIOD}초)를 넘었다.★ 쉬지 않고 다음 바퀴로 간다"
  fi
done

#!/bin/sh
# ★세 리그를 돌아가며 받는다★ (2026-09-04 · 사장님 «앞으로 들어오는 것만 잘 받아라»)
#
# ── 왜 하나씩 도나
#   ★병영수첩은 한 번에 하나만 두드린다★ (D-266). 세 리그를 동시에 돌리면
#   간격 1500ms 가 500ms 가 된다. ★그래서 순서대로 돈다.★
#
# ── 무엇을 받나
#   ★9/3 07시 이후 경기만★ — 그 전은 화면에서 안 보이므로 받을 이유가 없다.
#   경기키가 `YYMMDD…` 라 날짜로만 자를 수 있어 `260903` 부터 받는다.
#   ★7시 이전 그날 경기 몇 건이 더 들어오지만 화면이 자른다.★ 받는 건 손해가 아니다.
#
# ── 한 바퀴
#   리그마다: 목록(클랜 전부) → 배틀로그 → 투영
#   그리고 ★남은 시간만큼 쉰다★ — 고정으로 쉬면 주기가 밀린다
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${COLLECT_LOG:-C:/Users/LG/AppData/Local/Temp/claude/collect3.log}"
PERIOD="${COLLECT_PERIOD:-900}"     # 15분
BATCH="${COLLECT_BATCH:-400}"       # 리그당 한 바퀴에 받을 배틀로그
FROM="${COLLECT_FROM:-260903}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

# ★두 개가 동시에 못 돌게 잠근다★ (D-279)
# ★자물쇠는 한 곳에서 만든다★ — `autocollect.sh` 와 같은 것을 쥔다 (2026-09-04)
. "$(dirname "$0")/collect-lock.sh"
collect_lock_acquire

say "★3리그 수집 시작★ — ${FROM} 이후 · 리그당 ${BATCH}건 · ${PERIOD}초 주기 · 첫 403 에서 멈춘다"

lap=0
while :; do
  lap=$((lap + 1))
  began=$(date +%s)

  for lg in nolink supply daerule; do
    pnpm --filter @sacloud/worker nexon barracks-collect \
      --league "$lg" --clans 999 --limit "$BATCH" --from "$FROM" --confirm \
      --health https://3rdcloud.my/api/health >> "$LOG" 2>&1
    code=$?
    got=$(grep -E '^계획 ' "$LOG" | tail -1)
    say "  ${lap}바퀴 ${lg} (코드 ${code}) — ${got:-(요약을 못 읽었다)}"
    if [ "$code" = "2" ]; then
      say "★★차단됐다 (403·429) — 끝낸다. 우회하지 않는다★★"
      exit 1
    fi
  done

  # ★투영은 리그를 다 돈 뒤 한 번★ — 매번 돌리면 그게 더 오래 걸린다
  pnpm --filter @sacloud/worker nexon iplmatch-project --confirm >> "$LOG" 2>&1
  pnpm --filter @sacloud/worker nexon battlelog-lineup --league nolink --confirm >> "$LOG" 2>&1
  say "  ${lap}바퀴 투영 끝"

  spent=$(( $(date +%s) - began ))
  rest=$((PERIOD - spent))
  if [ "$rest" -gt 0 ]; then sleep "$rest"; else say "  ⚠ 한 바퀴가 ${spent}초 — 주기를 넘었다"; fi
done

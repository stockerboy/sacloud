#!/bin/sh
# 밤새 IPL 배틀로그를 채운다 (2026-09-04 · 사장님 «내일아침까지 경기만 잘 채워놔»)
#
# ── 왜 판을 나누나
#   한 번에 21,508건을 걸어 두면 ★중간에 무슨 일이 나도 아침까지 아무도 모른다.★
#   ★한 판(4,000건)이 끝날 때마다 한 줄을 남기고★ 다음 판을 건다.
#   ★적재는 25건마다 하니★ 판 중간에 죽어도 받은 것은 남는다.
#
# ── 판마다 하는 일
#   ① 배틀로그 4,000건 (간격 1500ms · 약 100분)
#   ② ★투영★ — 경기 → 라인업. ★받는 도중에는 안 한다★ (DB 를 두 번 두드린다)
#   ③ 한 줄 남기기
#
# ── ⚠ 멈추는 조건
#   ★첫 403·429 에서 CLI 가 스스로 멈추고 exit 1 을 낸다.★ 그러면 ★이 판도 멈춘다.★
#   ★우회하지 않는다.★ 아침에 사람이 본다.
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${1:-C:/Users/LG/AppData/Local/Temp/claude/overnight-collect.log}"
DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

say "★밤샘 수집 시작★ — 4,000건씩 · 간격 1500ms · 첫 403 에서 멈춘다"

round=0
while [ "$round" -lt 8 ]; do
  round=$((round + 1))
  say "── ${round}판 시작"

  if ! pnpm --filter @sacloud/worker nexon barracks-collect \
        --league nolink --clans 43 --limit 4000 --confirm \
        --health https://3rdcloud.my/api/health >> "$LOG" 2>&1; then
    say "★★${round}판이 0 이 아닌 코드로 끝났다 — 멈춘다★★ (403 이거나 사이트가 무겁다)"
    break
  fi

  got=$(grep -E '^계획 ' "$LOG" | tail -1)
  say "  ${round}판 수집: ${got:-(요약을 못 읽었다)}"

  # ── 투영. ★여기까지 와야 화면이 바뀐다★
  pnpm --filter @sacloud/worker nexon iplmatch-project --confirm >> "$LOG" 2>&1
  pnpm --filter @sacloud/worker nexon battlelog-lineup --league nolink --confirm >> "$LOG" 2>&1
  line=$(grep -E '^배틀로그경기=' "$LOG" | tail -1)
  say "  ${round}판 투영: ${line:-(요약을 못 읽었다)}"

  # 남은 것이 없으면 끝
  left=$(pnpm --filter @sacloud/worker nexon barracks-collect --league nolink --clans 0 \
           --limit 30000 --dry-run 2>/dev/null | grep -oE '받을 것 ★[0-9]+건★' | grep -oE '[0-9]+')
  say "  ${round}판 끝 — ★남은 것 ${left:-?}건★"
  if [ "${left:-1}" = "0" ]; then
    say "★남은 것이 없다 — 다 받았다★"
    break
  fi
done

say "★밤샘 수집 종료★ (${round}판)"

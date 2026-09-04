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

# ★★두 개가 동시에 못 돌게 잠근다★★ (D-279 → 2026-09-04 Pre-Part 0)
#
# ⚠ ★자물쇠가 세 번째로 뚫린 뒤 방식을 바꿨다★ —
#   프로세스를 세던 것을 ★DB 임대★ 로 바꿨다. 자세한 이유는 `collect-lock.sh` 머리말.
#   ★못 잡으면 그 안에서 조용히 끝난다 (exit 0)★ — 「남이 돌고 있다」는 고장이 아니다.
. "$(dirname "$0")/collect-lock.sh"
collect_lock_acquire

say "★3리그 수집 시작★ — ${FROM} 이후 · 리그당 ${BATCH}건 · ${PERIOD}초 주기 · 첫 403 에서 멈춘다"

lap=0
while :; do
  lap=$((lap + 1))
  began=$(date +%s)
  # ★이번 바퀴가 로그의 어디서부터인가★ — 요약을 앞 바퀴에서 훔쳐 오지 않으려고 표시해 둔다
  mark=$(( $(wc -l < "$LOG") + 1 ))

  # ★긴 구간에 들어가기 전에 임대를 이어 쥔다★ — 투영·쉼이 여기 아래에 있다
  collect_lock_renew || exit 0

  # ⚠ ★`daerule` 을 뺐다★ (2026-09-04) — 사장님이 ★두 번★ 말씀하신 것이다
  #   («대룰리그는 없애 생각하지마 이거 못박아놔» · O-042 «나) 수집하지마라»).
  #   O-042 로 워크플로에서는 뺐는데 ★이 셸이 만들어지면서 되살아나 있었다.★
  #   ★지운 게 아니라 옛 줄을 여기 남긴다★ (`CLAUDE.md` 1-4):
  #       옛값:  for lg in nolink supply daerule; do
  #
  # ⚠ ★`sanply`(10mountain)는 여기서 더하지 않는다.★ 더해도 화면에 안 나온다 —
  #   투영(`iplmatch-project`)이 `nolink` 로 못 박혀 있다 (`jobs/iplProject.ts:36`).
  #   ★그건 Part 3(통합 Collector)이 풀 문제다. 여기에 임시 분기를 넣지 않는다.★
  for lg in nolink supply; do
    pnpm --filter @sacloud/worker nexon barracks-collect \
      --league "$lg" --clans 999 --limit "$BATCH" --from "$FROM" --confirm \
      --lease-owner "$COLLECT_LEASE_OWNER" \
      --health https://3rdcloud.my/api/health >> "$LOG" 2>&1
    code=$?
    # ⚠ ★요약을 로그 전체에서 긁어 오면 안 된다★ (2026-09-04 발견).
    #   `grep … | tail -1` 은 ★이번 바퀴가 아무것도 못 찍었을 때 직전 바퀴의 줄★ 을 집어 온다.
    #   실제로 코드 127 로 죽은 바퀴가 ★앞 바퀴의 숫자를 자기 결과처럼★ 찍고 있었다.
    #   그래서 ★이번 바퀴가 찍은 부분만★ 본다.
    got=$(tail -n +"$mark" "$LOG" | grep -E '^계획 ' | tail -1)
    say "  ${lap}바퀴 ${lg} (코드 ${code}) — ${got:-★이번 바퀴는 요약을 못 찍었다★}"
    if [ "$code" = "2" ]; then
      say "★★차단됐다 (403·429) — 끝낸다. 우회하지 않는다★★"
      exit 1
    fi
    # ★9 = 임대 상실★ — 쥐고 있던 것을 남에게 빼앗겼다. 남이 지금 돌고 있다
    if [ "$code" = "9" ]; then
      say "★★임대 상실 — 이 판을 끝낸다. 남이 이미 수집 중이다★★"
      exit 0
    fi
    # ★10 = 임대 미획득★ — ★애초에 못 잡은 채 불렸다.★ 남이 도는지는 ★모른다★
    if [ "$code" = "10" ]; then
      say "★★임대 미획득 — 수집을 시작하지 않는다★★ (주인 번호가 비어 있다)"
      exit 0
    fi
    # ★127 은 「명령을 못 찾았다」다. 성공이 아니다★ — 조용히 넘기면 밤새 헛돈다
    if [ "$code" = "127" ]; then
      say "★★코드 127 — 명령을 못 찾았다. 이번 바퀴는 한 건도 못 받았다★★"
      exit 1
    fi
  done

  # ★투영은 리그를 다 돈 뒤 한 번★ — 매번 돌리면 그게 더 오래 걸린다
  pnpm --filter @sacloud/worker nexon iplmatch-project --confirm >> "$LOG" 2>&1
  pnpm --filter @sacloud/worker nexon battlelog-lineup --league nolink --confirm >> "$LOG" 2>&1
  say "  ${lap}바퀴 투영 끝"

  # ★쉬기 전에 다시 이어 쥔다★ — 쉬는 구간이 제일 길고, ★3차 사고가 난 자리다★
  collect_lock_renew || exit 0

  spent=$(( $(date +%s) - began ))
  rest=$((PERIOD - spent))
  if [ "$rest" -gt 0 ]; then sleep "$rest"; else say "  ⚠ 한 바퀴가 ${spent}초 — 주기를 넘었다"; fi
done

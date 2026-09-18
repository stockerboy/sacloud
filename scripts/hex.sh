#!/bin/sh
# ★경기 분석(육각)을 경기 결과와 ★거의 같이★ 내보낸다★ (2026-09-18 사장님).
#
# > 「경기결과+명단(킬뎃)+경기분석 > 동시에 오게할 수는 없어?
# >  유저들이 너무 오래 기다릴거같아」
#
# ── 왜 늦었나
#   ★육각 집계가 예약에 아예 없었다.★ 손으로 돌릴 때만 계산됐다.
#   그래서 경기 끝 → 육각까지 평균 ★20시간★ 이었고, 어제 경기 398건 중
#   육각이 붙은 것은 220건(55%)뿐이었다.
#
#   수집은 10분마다 돈다(`autocollect.sh`). 결과·명단·K/D 는 그래서 금방 왔다.
#   분석만 뒤에 남았다.
#
# ── 무엇을 하나
#   ★새 경기만★ 센다. `--rebuild` 를 안 주면 같은 `formulaVersion` 으로 이미
#   만들어진 경기를 건너뛴다 — 실측 「경기 6,773건 · 셀 것 247건 · 건너뜀 6,526건」 에
#   2분이 걸렸다. 평소에는 몇 초다.
#
# ── 순서가 있다
#   ① 경기 육각(클랜) → ② 개인 육각 → ③ 클랜 요약
#   개인 육각이 MVP 를 정하고, 요약은 경기 육각을 접는다. 거꾸로 돌리면 한 판 늦는다.
#
# ⚠ ★겹쳐 돌리지 않는다★ — cron 의 `flock` 이 막고, 여기서도 다른 잡이 돌면 비킨다.
#   겹치면 DB 가 밀려 사이트가 503 이 된다 (2026-09-18 새벽에 실제로 그랬다).
set -e
cd /root/sacloud

# 다른 무거운 잡이 돌고 있으면 이번 차례는 건너뛴다 — 다음 10분에 다시 온다
RUNNING=$(pgrep -cf "tsx src/cli.ts" || true)
if [ "${RUNNING:-0}" -gt 1 ]; then
  echo "[$(date +%H:%M)] 다른 잡이 도는 중($RUNNING) — 이번 차례는 건너뛴다"
  exit 0
fi

echo "[$(date +%H:%M)] ① 경기 육각"
pnpm --filter @sacloud/worker nexon clan-hex-v2-build --confirm 2>&1 | tail -3

echo "[$(date +%H:%M)] ② 개인 육각 (MVP 도 여기서 정해진다)"
pnpm --filter @sacloud/worker nexon player-hex-build --confirm 2>&1 | tail -3

echo "[$(date +%H:%M)] ③ 클랜 요약"
pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --confirm 2>&1 | tail -3

echo "[$(date +%H:%M)] 끝"

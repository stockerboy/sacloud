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
#   ① 경기 육각(클랜) → ② 개인 육각 → ③ 클랜 요약 → ④ 점수 래더
#   개인 육각이 MVP 를 정하고, 요약은 경기 육각을 접는다. 거꾸로 돌리면 한 판 늦는다.
#
# ⚠ ★④ 점수 래더가 여기 없었다★ (2026-09-19 검증에서 찾았다).
#   래더는 ★그때의 상위 10클랜★ 에게 보정 +2.0 을 준다. 그런데 클랜 레이팅은
#   다른 예약(`sac-season`)이 따로 다시 매긴다. 래더가 그보다 먼저 돌고 끝이면
#   ★DB 에 남은 보정 명단이 옛 순위로 굳는다.★ 실측:
#   ```
#     19:30  래더 빌드 (그때의 상위 10클랜으로 보정을 박음)
#     01:57  클랜 레이팅 43개 전부 재계산   ← 순위가 바뀌었다
#     결과   evermore 는 28위인데 +2.0 을 받고, 지금 1·2위는 한 명도 못 받았다
#   ```
#   ★래더를 여기 붙여 10분마다 따라오게 한다.★ 늦어도 한 바퀴면 맞춰진다.
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

# ── ★전문을 따로 남긴다★ (2026-09-20)
#
#   `| tail -3` 이 pnpm 껍데기 세 줄만 남기고 ★진짜 오류를 잘라 버렸다.★
#   `player-hex-build` 가 어제 15번 실패했는데 로그에는 「Exit status 1」 만 있었고,
#   원인(`57014`)을 찾으려고 ★VPS 에서 네 번 재현해야 했다.★
#   요약은 지금처럼 짧게 남기되, ★전문은 이 파일에 통째로 쌓는다.★
HEXLOG="${HEXLOG:-/root/log/hex.log}"

echo "[$(date +%H:%M)] ① 경기 육각"
pnpm --filter @sacloud/worker nexon clan-hex-v2-build --confirm 2>&1 | tee -a "$HEXLOG" | tail -3

echo "[$(date +%H:%M)] ② 개인 육각 (MVP 도 여기서 정해진다)"
pnpm --filter @sacloud/worker nexon player-hex-build --confirm 2>&1 | tee -a "$HEXLOG" | tail -3

echo "[$(date +%H:%M)] ③ 클랜 요약"
pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --confirm 2>&1 | tee -a "$HEXLOG" | tail -3

echo "[$(date +%H:%M)] ④ 점수 래더 (상위 10클랜 보정은 ★지금 순위★ 로 다시 박는다)"
for L in nolink supply sanply; do
  pnpm --filter @sacloud/worker nexon score-ladder-build --league "$L" --confirm 2>&1 | grep -E "선수 [0-9]+명" || true
done

echo "[$(date +%H:%M)] 끝"

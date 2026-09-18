#!/bin/sh
# ★점수제 전량 재계산★ (2026-09-18) — 사장님 QA 로 규칙이 바뀔 때마다 돌린다.
#
# 순서에 뜻이 있다:
#   ① 경기 육각   → 스나싸움·점수 넷의 재료
#   ② 개인 육각   → MVP 와 점수 래더의 재료 (①과 무관하게 배틀로그를 다시 읽는다)
#   ③ 클랜 요약   → ①을 접는다. ①보다 먼저 돌면 옛 값을 접는다
#   ④ 점수 래더   → ②를 모은다. ②보다 먼저 돌면 통째로 null 이 된다
#
# ⚠ ★예약 잡을 멈추고 돌린다★ — 겹치면 DB 가 밀려 사이트가 503 이 된다.
#   끝나면 `crontab /root/crontab.backup.*` 로 되돌린다.
set -e
cd /root/sacloud
. /root/sacloud.env

echo "[$(date +%H:%M)] ① 경기 육각 — 전부 다시"
pnpm --filter @sacloud/worker nexon clan-hex-v2-build --rebuild --confirm 2>&1 | tail -3

echo "[$(date +%H:%M)] ② 개인 육각 — 전부 다시"
pnpm --filter @sacloud/worker nexon player-hex-build --rebuild --confirm 2>&1 | tail -3

echo "[$(date +%H:%M)] ③ 클랜 요약"
pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --confirm 2>&1 | tail -2

echo "[$(date +%H:%M)] ④ 점수 래더"
for L in nolink supply sanply; do
  pnpm --filter @sacloud/worker nexon score-ladder-build --league "$L" --confirm 2>&1 | grep -E "선수 [0-9]+명" || true
done

echo "[$(date +%H:%M)] ★전부 끝★"

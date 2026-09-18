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

# ⚠ ★리그별로 나눠 돈다★ (2026-09-18) — VPS 메모리가 2GB 뿐이라
#   세 리그를 한 번에 `--rebuild` 하면 ★OOM 으로 죽는다★ (실측: 15:40 에 Killed).
#   `--max-old-space-size` 로 힙도 눌러 둔다 — 넘치면 GC 가 돌지 OOM 으로 안 죽는다.
export NODE_OPTIONS="--max-old-space-size=900"

# ⚠ ★`ONLY=player` 면 개인 육각만 돈다★ — 점수표만 바뀌었을 때 경기 육각을 다시
#   돌릴 까닭이 없다 (61,900행 · 15분). 세이브 규칙처럼 개인 쪽만 바뀐 날에 쓴다.
if [ "${ONLY:-}" != "player" ]; then
  for L in nolink supply sanply; do
    echo "[$(date +%H:%M)] ① 경기 육각 — $L"
    pnpm --filter @sacloud/worker nexon clan-hex-v2-build --league "$L" --rebuild --confirm 2>&1 | tail -2
  done
fi

for L in nolink supply sanply; do
  echo "[$(date +%H:%M)] ② 개인 육각 — $L"
  pnpm --filter @sacloud/worker nexon player-hex-build --league "$L" --rebuild --confirm 2>&1 | tail -2
done

echo "[$(date +%H:%M)] ③ 클랜 요약"
pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --confirm 2>&1 | tail -2

echo "[$(date +%H:%M)] ④ 점수 래더"
for L in nolink supply sanply; do
  pnpm --filter @sacloud/worker nexon score-ladder-build --league "$L" --confirm 2>&1 | grep -E "선수 [0-9]+명" || true
done

echo "[$(date +%H:%M)] ★전부 끝★"

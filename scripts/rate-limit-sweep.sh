#!/bin/sh
# ★지난 rate-limit 기록을 쓸어낸다★ (2026-09-20 비판 검수)
#   실측 — 1,330줄 중 1,328줄이 이미 지난 것이었다. 지우는 곳이 없었다.
#   게시판 조회수가 이 표를 쓰기 시작해서 앞으로 훨씬 빨리 큰다.
# ⚠ 하루 지난 것만 지운다 — 창 경계에서 제한이 새면 안 된다.
set -e
cd /root/sacloud
. /root/sacloud.env
pnpm --filter @sacloud/worker nexon rate-limit-sweep

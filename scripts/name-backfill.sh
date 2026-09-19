#!/bin/sh
# ★원문의 클랜 이름·번호를 칸으로 옮긴다★ (2026-09-20)
#
# 왜 — `BarracksClanMatchRaw.payload` 가 ★행 안에 그대로★ 들어 있어(본체 1,378MB)
#      `payload->>'...'` 를 쓰는 질의가 2분 벽에 걸려 ★정규화·라인업이 매번 죽었다.★
#      그 바람에 09-19 16:43 부터 Match·명단·경기분석이 전부 0건이었다.
#
# ⚠ ★한 판에 5,000줄씩★ 만 한다 — 한 번에 다 하는 짓이 사이트를 멈춰 세웠다.
# ⚠ ★다른 잡이 돌면 비킨다★ — 겹치면 DB 가 밀려 사이트가 503 이 된다.
# ⚠ 다 채우면 스스로 멈춘다 (남은 줄 0).
set -e
cd /root/sacloud
. /root/sacloud.env

for i in $(seq 1 400); do
  n=$(pgrep -cf "tsx src/cli.ts" || true)
  if [ "${n:-0}" -gt 1 ]; then
    echo "[$(date +%H:%M)] 다른 잡이 도는 중($n) — 60초 쉰다"
    sleep 60
    continue
  fi
  out=$(pnpm --filter @sacloud/worker nexon clan-name-backfill --confirm --limit 5000 2>&1 | grep "남은 줄" || true)
  echo "[$(date +%H:%M)] $out"
  case "$out" in
    *"남은 줄=0"*) echo "[$(date +%H:%M)] ★다 채웠다★"; break ;;
    *"읽음=0"*)    echo "[$(date +%H:%M)] ★더 채울 줄이 없다★"; break ;;
  esac
  sleep 5
done

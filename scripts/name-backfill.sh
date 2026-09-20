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

# ⚠ ★비키기만 하다 아무것도 못 했다★ (2026-09-20 검수) — 40분 동안 채운 줄이 ★0★ 이었다.
#   예약이 5분마다 뜨니 «다른 잡이 하나라도 돌면 비킨다» 로는 ★영영 자리가 안 난다.★
#   그래서 ★무거운 잡(정규화·명단)만 피한다.★ 가벼운 잡과는 같이 돈다.
# ⚠ 그래도 10번 연속 비키면 ★한 번은 끼어든다★ — 안 그러면 이름표가 영영 안 채워진다.
SKIPPED=0
for i in $(seq 1 400); do
  busy=$(pgrep -fc "unified-project|battlelog-lineup" || true)
  if [ "${busy:-0}" -gt 0 ] && [ "$SKIPPED" -lt 10 ]; then
    SKIPPED=$((SKIPPED + 1))
    echo "[$(date +%H:%M)] 무거운 잡이 도는 중 — 40초 쉰다 ($SKIPPED/10)"
    sleep 40
    continue
  fi
  if [ "$SKIPPED" -ge 10 ]; then
    echo "[$(date +%H:%M)] ★10번 연속 비켰다 — 한 번은 끼어든다★"
  fi
  SKIPPED=0
  out=$(pnpm --filter @sacloud/worker nexon clan-name-backfill --confirm --limit 5000 2>&1 | grep "읽음=" || true)
  echo "[$(date +%H:%M)] $out"
  # ⚠ ★「남은 줄」 로 끝을 판단하지 않는다★ (2026-09-20) — 그 셈이 2분 벽에
  #   걸리면 `-1` 이 오는데, 그걸 0 과 헷갈리면 ★다 채우기 전에 멈춘다.★
  #   ★「읽음=0」 하나만 본다★ — 더 고칠 줄이 없다는 뜻이고, 이건 틀릴 수가 없다.
  case "$out" in
    *"읽음=0"*) echo "[$(date +%H:%M)] ★다 채웠다 — 더 고칠 줄이 없다★"; break ;;
  esac
  sleep 5
done

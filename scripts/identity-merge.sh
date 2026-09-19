#!/bin/sh
# ★병영수첩 계정이 두 꼴로 쪼개진 사람을 합친다★ (2026-09-20)
#
# 사장님: 「게임한 아이디는 하나인데 (…) 여러개의 분신이 생성되는거 같아」
#
# 실측 — 앞 300명 중 ★86명(29%)★ 이 쪼개져 있었다. 8,878명이면 약 2,500명이다.
#
# ⚠ ★한 판에 300명씩★ 만 한다. 한 번에 다 하면 DB 가 밀린다.
# ⚠ ★다른 잡이 돌면 비킨다★ — 겹치면 사이트가 503 이 된다.
# ⚠ 이 잡은 ★멱등하다★ — 이미 합쳐진 사람은 `Player` 가 하나라 건너뛴다.
#   그래서 처음부터 다시 돌려도 안전하다 (커서를 안 들고 있는 까닭이다).
set -e
cd /root/sacloud
. /root/sacloud.env

# ⚠ ★커서를 들고 간다★ — 없으면 늘 같은 앞 300명만 돈다 (실제로 그렇게 만들었다가 잡았다)
AFTER=""
for i in $(seq 1 60); do
  n=$(pgrep -cf "tsx src/cli.ts" || true)
  if [ "${n:-0}" -gt 1 ]; then
    echo "[$(date +%H:%M)] 다른 잡이 도는 중($n) — 90초 쉰다"
    sleep 90
    continue
  fi
  if [ -z "$AFTER" ]; then
    line=$(pnpm --filter @sacloud/worker nexon barracks-identity-merge --confirm --limit 300 2>&1 | grep "쪼개진사람" || true)
  else
    line=$(pnpm --filter @sacloud/worker nexon barracks-identity-merge --confirm --limit 300 --after "$AFTER" 2>&1 | grep "쪼개진사람" || true)
  fi
  echo "[$(date +%H:%M)] $line"
  case "$line" in
    *"다음커서=끝"*) echo "[$(date +%H:%M)] ★전부 훑었다★"; break ;;
  esac
  AFTER=$(echo "$line" | grep -o "다음커서=[0-9]*" | grep -o "[0-9]*")
  if [ -z "$AFTER" ]; then echo "[$(date +%H:%M)] 커서를 못 읽었다 — 멈춘다"; break; fi
  sleep 10
done

#!/bin/sh
# ★깃발 꽂기★ — 매일 새벽 3시 마감 (2026-09-15 사장님)
#
#   «17시부터 03시까지의 1,2,3등을 라이브로 보여주고 3시에 마감치는거야.»
#   «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고»
#
# ── 언제 도나
#   ★03:05 KST★ 한 번이다. 03:00 정각이 아니라 5분 뒤인 이유 —
#   02:5x 에 끝난 경기가 수집·정규화를 거쳐 들어올 틈을 준다.
#   잡 자신이 «아직 안 끝난 하루» 를 거르므로 늦게 도는 것은 안전하고,
#   일찍 도는 것만 위험하다.
#
# ── 몇 번을 돌려도 깃발은 하나다
#   `(리그, 마감일, 등수)` 가 표의 자물쇠라 다시 돌리면 덮어쓴다.
#   그래서 놓친 날은 `--day 2026-09-15 --confirm` 으로 언제든 다시 꽂을 수 있다.
#
# ── ⚠ 수집을 하지 않는다
#   네트워크를 한 건도 쓰지 않는다 — DB 만 읽고 쓴다.
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${FLAG_LOG:-/root/log/flag.log}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# 긴 배치는 아니지만 사이트 몫(6543)을 건드리지 않게 세션 풀러를 쓴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

say "★깃발 꽂기 시작★"
pnpm --filter @sacloud/worker nexon flag-plant --confirm >> "$LOG" 2>&1
code=$?
if [ "$code" = "0" ]; then
  line=$(grep -E '^등수=1위' "$LOG" | tail -3 | tr '\n' ' ')
  say "  끝 — ${line}"
else
  say "  ★실패★ (코드 ${code})"
fi
exit "$code"

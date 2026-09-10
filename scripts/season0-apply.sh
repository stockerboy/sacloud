#!/bin/sh
# ★30분마다 스스로 도는 집계★ (2026-09-06 · Part 9 · 사장님 승인)
#
# ── 왜 이 파일이 있나
#   ★수집과 집계는 서로 다른 일이다.★ 사장님 지시 —
#   ```
#   sacloud-autocollect  → 수집 전용
#   sacloud-season0      → 통계/랭킹 집계 전용
#   ```
#   ★Collector 루프 안에 무거운 집계를 박지 않는다.★
#   수집이 죽어도 집계는 돌고, 집계가 죽어도 수집은 안 죽는다.
#
# ── 왜 필요해졌나
#   옛 주 경로는 «증분 수집이 끝나며 GitHub Actions 집계를 부르는» 고리였다.
#   ★미러를 동결하면서 그 고리가 끊겼고★ 후퇴값 cron(전달률 11%)만 남아
#   ★랭킹이 몇 시간 옛 숫자를 보여 줬다.★ 이 파일이 그 자리를 메운다.
#
# ── 왜 30분인가
#   실측 한 판이 ★11~12분★ 이다. 15분이면 거의 쉬지 않고 돈다.
#   30분이면 여유가 있고 «새 기록이 30분 안팎에 랭킹에 반영» 이라는 목표에 든다.
#
# ── 겹침·덮어쓰기
#   ★이 스크립트는 자물쇠를 직접 만들지 않는다.★ `season0Apply.ts` 안에
#   ★DB 임대★ 가 있고, ★쓰기 직전에 「나보다 새 판이 이미 썼나」를 다시 묻는다.★
#   그래서 GitHub Actions 회차와 겹쳐도 ★한 판만 쓴다.★
#
# ── ⚠ 하지 않는 것
#   ★수집을 하지 않는다.★ 네트워크를 한 건도 쓰지 않는다 — DB 만 읽고 쓴다.
#   ★autocollect.sh 를 건드리지 않는다.★
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${SEASON0_LOG:-C:/Users/LG/AppData/Local/Temp/claude/season0.log}"
LEAGUES="${SEASON0_LEAGUES:-supply,sanply,nolink}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# ★긴 배치 잡★ 이라 세션 풀러(5432)를 쓴다. 6543 자리는 사이트 몫으로 남긴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

say "★집계 시작★ — 리그 ${LEAGUES}"

pnpm --filter @sacloud/worker exec tsx src/jobs/season0Apply.ts \
  --leagues "$LEAGUES" --confirm >> "$LOG" 2>&1
code=$?

# ── ★IPL 랭킹을 새 공식으로 다시 쓴다★ (2026-09-10 · 사장님 확정) ─────
#   위 집계는 ★쉘 공식★ 로 점수를 쓴다. 그쪽은 한 글자도 안 고쳤다 (`CLAUDE.md` 1-4).
#   IPL 만 ★티어 셋짜리 새 공식★ 으로 덮는다 — 바로 뒤에 붙어서 틈이 안 생긴다.
#   ★되돌리려면 이 줄만 지우면 된다.★ 다음 회차에 쉘 점수로 돌아간다.
if [ "$code" = "0" ]; then
  pnpm --filter @sacloud/worker nexon ipl-rank-apply --confirm >> "$LOG" 2>&1 || true
  rank_line=$(grep -E '^경기 [0-9,]+건 · 클랜 ' "$LOG" | tail -1)
  [ -n "$rank_line" ] && say "  IPL 랭킹 — ${rank_line}"

  # ── ★육각형★ (2026-09-10 · 사장님 확정) — 새 경기의 배틀로그만 더 센다 (같은 판은 건너뜀)
  #   클랜 육각(스나싸움 롱 규칙 · clan-hex-v2.4) → 선수 여섯 축 · 실력 점수 (player-hex-v1.0)
  #   "한 판 하고 나면 세이브 순위가 오른다" 가 이 두 줄로 30분 안에 반영된다.
  pnpm --filter @sacloud/worker nexon clan-hex-v2-build --confirm >> "$LOG" 2>&1 || true
  pnpm --filter @sacloud/worker nexon player-hex-build --confirm >> "$LOG" 2>&1 || true
  hex_line=$(grep -E '스나 [0-9]+ · 라플 [0-9]+ · 미측정' "$LOG" | tail -1)
  [ -n "$hex_line" ] && say "  선수 육각 — ${hex_line}"
fi

if [ "$code" = "0" ]; then
  # 마지막 결과 줄을 요약으로 남긴다
  done_line=$(grep -E '반영 완료' "$LOG" | tail -1)
  skip_line=$(grep -E '이번 판은 시작하지 않는다|쓰지 않고 끝낸다' "$LOG" | tail -1)
  if [ -n "$skip_line" ]; then
    say "  끝 (코드 0) — ${skip_line}"
  else
    say "  끝 (코드 0) — ${done_line:-(요약을 못 읽었다)}"
  fi
else
  say "★★집계 실패 (코드 ${code})★★ — 다음 회차에 다시 해 본다"
fi

exit 0

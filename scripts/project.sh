#!/bin/sh
# ★5분마다 스스로 도는 정규화 (RAW → Match)★ (2026-09-08 · 사장님 승인)
#
# ── 왜 이 파일이 생겼나
#   ★2026-09-07 에 화면이 18시간 낡았다.★ 원인은 수집기가 죽어서가 아니었다 —
#   ```
#   autocollect 한 바퀴 = ①수집 → ②정규화 → ③라인업   (순서대로)
#   ★수집이 안 끝나면 정규화가 시작조차 안 한다★
#   ```
#   그날 한 바퀴가 ★11.6시간★ 걸렸고, 그동안 ②가 한 번도 안 돌았다.
#   RAW 는 계속 들어오는데 Match 가 안 생겼다. ★정규화가 수집의 인질이었다.★
#
#   그래서 ②를 ★따로 뺀다.★ `season0-apply.sh` 가 집계를 뺀 것과 같은 이유다.
#   수집이 몇 시간 걸려도 정규화는 제 주기로 돈다.
#
# ── 왜 5분인가
#   실측 한 판이 ★38초★ 다 (2026-09-08 · 운영 · 229건 생성 포함).
#   5분이면 여유가 8배다. «새 경기가 5~10분 안에 화면에 뜬다» 라는 목표에 든다.
#
# ── 겹침
#   ★이미 있는 명령을 그대로 쓴다★ — `nexon collect-lease acquire --name unified-project`.
#   `CollectorLease` 표를 ★이름만 달리해서★ 쓴다. ★스키마도 코드도 새로 안 만든다.★
#   앞 판이 아직 돌면 그 명령이 코드 9 를 주고, 우리는 ★조용히 건너뛴다 (코드 0).★
#   ★`barracks-collect` · `season0-apply` 임대와는 이름이 달라 서로 안 막는다.★
#
#   ⚠ ★`apps/worker/src/cli.ts` 는 한 글자도 안 건드렸다.★ 그 파일은 지금
#     ★다른 세션이 고치는 중★ 이라 손대면 남의 작업을 커밋에 쓸어담게 된다.
#
# ── ⚠ 하지 않는 것
#   ★수집을 하지 않는다.★ 네트워크를 한 건도 안 쓴다 — DB 만 읽고 쓴다.
#   ★라인업(battlelog-lineup)을 하지 않는다.★ 그건 아직 autocollect 안에 있다.
#   ★autocollect.sh 를 건드리지 않는다.★
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${PROJECT_LOG:-C:/Users/LG/AppData/Local/Temp/claude/project.log}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# ★긴 배치 잡★ 이라 세션 풀러(5432)를 쓴다. 6543 자리는 사이트 몫으로 남긴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M:%S')" "$1" | tee -a "$LOG"; }

began=$(date +%s)

# ── ① 임대를 잡는다 ────────────────────────────────────────────────
#   ★한 판 실측 38~77초★ · 주기 5분. TTL 은 ★10분★ 이면 넉넉하고,
#   프로세스가 죽어도 10분 뒤 저절로 풀려 다음 회차가 이어받는다.
acq=$(pnpm --filter @sacloud/worker nexon collect-lease acquire         --name unified-project --ttl 600 2>&1)
acode=$?
if [ "$acode" != "0" ]; then
  say "  건너뜀 — 앞 판이 아직 돈다 (임대 코드 ${acode})"
  exit 0
fi
OWNER=$(printf '%s' "$acq" | grep -m1 '^OWNER=' | cut -d= -f2)
if [ -z "$OWNER" ]; then
  say "★★임대는 잡혔는데 OWNER 를 못 읽었다★★ — 안전하게 끝낸다"
  exit 0
fi
say "★정규화 시작★ (임대 ${OWNER})"

# ── ② 정규화 ──────────────────────────────────────────────────────
pnpm --filter @sacloud/worker nexon unified-project --confirm >> "$LOG" 2>&1
code=$?
spent=$(( $(date +%s) - began ))

# ── ③ 반납 ────────────────────────────────────────────────────────
#   ★실패로 끝나도 반납한다★ — 안 그러면 TTL 10분 동안 다음 회차가 다 막힌다
pnpm --filter @sacloud/worker nexon collect-lease release      --name unified-project --owner "$OWNER" >> "$LOG" 2>&1 || true

if [ "$code" = "0" ]; then
  made=$(grep -E '^본경기=' "$LOG" | tail -1)
  say "  끝 (${spent}초) — ${made:-(요약을 못 읽었다)}"
else
  say "★★정규화 실패 (코드 ${code} · ${spent}초)★★ — 다음 회차에 다시 해 본다"
fi

exit 0

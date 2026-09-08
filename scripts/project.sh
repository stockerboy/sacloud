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
#   ★라인업(battlelog-lineup)을 하지 않는다.★ 그건 `scripts/lineup.sh` 몫이다
#   (2026-09-08 에 그것도 따로 뺐다 — 예약작업 `sacloud-lineup`).
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${PROJECT_LOG:-C:/Users/LG/AppData/Local/Temp/claude/project.log}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# ★긴 배치 잡★ 이라 세션 풀러(5432)를 쓴다. 6543 자리는 사이트 몫으로 남긴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M:%S')" "$1" | tee -a "$LOG"; }

began=$(date +%s)

# ── ⓪ ★도는 놈을 직접 센다★ ──────────────────────────────────────
#   ⚠ ★2026-09-08 02:0x 에 실제로 당했다★ — 01:56 판이 요약까지 다 찍고
#     ★끝 줄도 못 쓰고 반납도 못 한 채 사라졌다.★ 임대는 TTL 까지 남았고
#     02:01 · 02:06 두 회차가 「앞 판이 아직 돈다」 로 헛돌았다.
#
#     ★범인은 나였다.★ 그 판이 도는 중에 ★이 파일을 고쳤다.★
#     `sh` 는 스크립트를 ★읽어 가면서 실행한다★ — 파일 길이가 바뀌면
#     다음에 읽을 자리가 어긋나 ★소리 없이 죽는다.★
#     ⚠ ★도는 중에는 이 파일을 고치지 마라.★ (`autocollect.sh` 는 전체가
#       `while :; do … done` 한 덩어리라 이미 다 읽혀 있어서 안전하다 — 여긴 아니다)
#
#     그래도 이 자물쇠는 남긴다 — ★죽은 판이 쥔 임대에 속지 않으려면 필요하다.★
#
#   그래서 자물쇠를 ★두 겹★ 으로 건다 — `lineup.sh` 와 같은 방식이다.
#     ⓪ ★진짜 프로세스를 센다★ (죽은 판의 임대에 속지 않는다)
#     ① 임대 (여러 컴퓨터·여러 회차끼리의 겹침을 막는다)
#   ★두 겹이라 TTL 을 짧게 둘 수 있다★ — 짧을수록 죽은 판에서 빨리 회복한다.
#
#   `collect-lease` 를 부르는 프로세스는 명령줄에 `unified-project` 가 들어가므로
#   ★반드시 빼고 센다.★ 안 그러면 자기 자신을 세서 영영 못 돈다 (2026-09-04 의 함정 ①)
# ── ★윈도와 리눅스 둘 다 센다★ (2026-09-08)
#   윈도(노트북)는 PowerShell 로, 리눅스(서버)는 `pgrep` 으로 센다.
#   ⚠ 서버 첫 시험에서 걸렸다 — 리눅스에는 PowerShell 이 없으니 「못 셌다」가 되어
#     ★안전하게 시작을 안 했다.★ 멈춘 것은 옳았고, ★셀 줄을 몰랐던 것★ 이 문제였다.
if command -v powershell >/dev/null 2>&1; then
  n=$(powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -match 'unified-project' -and \$_.CommandLine -notmatch 'collect-lease' -and \$_.CommandLine -notmatch 'Get-CimInstance' }).Count" 2>/dev/null | tr -d '\r' | tr -d ' ')
else
  # `-f` 는 명령줄 전체를 본다. 임대를 부르는 프로세스는 빼고 센다
  cnt_all=$(pgrep -fc -- 'unified-project' 2>/dev/null)
  cnt_lease=$(pgrep -fc -- 'collect-lease' 2>/dev/null)
  # ⚠ pgrep 은 못 찾으면 ★아무것도 안 찍는다.★ 빈 값을 계산에 넣으면 「Illegal number」 로 죽는다
  case "$cnt_all"   in ''|*[!0-9]*) cnt_all=0 ;;   esac
  case "$cnt_lease" in ''|*[!0-9]*) cnt_lease=0 ;; esac
  if [ "$cnt_all" -gt "$cnt_lease" ]; then
    n=$(( cnt_all - cnt_lease ))
  else
    n=0
  fi
fi
case "$n" in
  ''|*[!0-9]*)
    # ★모르면 시작하지 않는다★
    say "★정규화가 도는지 못 셌다 — 시작하지 않는다★"
    exit 0 ;;
esac
if [ "$n" != "0" ]; then
  say "  건너뜀 — 정규화가 이미 ${n}개 돈다"
  exit 0
fi

# ── ① 임대를 잡는다 ────────────────────────────────────────────────
#   ★한 판 실측 38~118초★ · 주기 5분.
#   TTL 은 ★10분★ 이다. 길게 잡고 싶어지지만 ★죽은 판이 쥔 임대가 그만큼 오래 막는다.★
#   길이는 ⓪ 의 프로세스 세기가 대신 지켜 준다 — 임대가 먼저 풀려도 두 판이 같이 돌지 않는다.
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

# ── ② 정규화 — ★끊기면 짧게 세 번까지만 다시 해 본다★ ─────────────
#   왜 필요한가 (2026-09-07 23:44 · 운영 로그 실측):
#   ```
#   prisma:error ... code: 10054 ConnectionReset  「원격 호스트에 의해 강제로 끊겼습니다」
#   prisma:error ... code: 10053 ConnectionAborted 「호스트 시스템의 소프트웨어에 의해 중단되었습니다」
#   ```
#   ★10053 은 저쪽이 아니라 이쪽 컴퓨터의 프로그램이 끊은 것이다★ —
#   문서보안(i-Defense3)이 소켓을 끊는 그 증상이다. ★우리가 고칠 수 없는 원인★ 이라
#   ★다시 해 보는 것 말고는 길이 없다.★ 그날은 여기서 판이 죽고 ②가 18시간 멈췄다.
#
#   ⚠ ★무한히 다시 하지 않는다.★ 세 번이면 끝이다. 5분 뒤 다음 회차가 또 온다.
#   ⚠ ★같은 것을 두 번 만들지 않는다.★ `unified-project` 는 멱등이다 —
#     이미 있는 경기는 「이미있음」 으로 세고 넘어간다 (로그의 `이미있음=` 칸).
#   ⚠ ★기다리는 시간을 늘려 간다★ (20초 → 60초). 끊긴 직후에 바로 붙으면 또 끊긴다
TRIES=3
try=1
while : ; do
  pnpm --filter @sacloud/worker nexon unified-project --confirm >> "$LOG" 2>&1
  code=$?
  [ "$code" = "0" ] && break
  if [ "$try" -ge "$TRIES" ]; then
    say "  ⚠ ★${TRIES}번 다 실패했다 (코드 ${code}) — 여기서 멈춘다.★ 다음 회차가 5분 뒤에 온다"
    break
  fi
  wait=$(( try * 20 + 20 ))
  say "  ⚠ 실패 (코드 ${code}) — ${wait}초 쉬고 ${try}/${TRIES} 다시 해 본다"
  sleep "$wait"
  try=$(( try + 1 ))
done
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

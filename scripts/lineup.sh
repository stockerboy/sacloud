#!/bin/sh
# ★라인업 전용 — 새 경기의 10명을 빨리 붙인다★ (2026-09-08 · 사장님 지시)
#
# ── 왜 이 파일이 생겼나
#   `project.sh` 로 ②정규화를 빼자 RAW→Match 지연이 ★0분★ 이 됐다.
#   그런데 화면에 「10명」이 뜨려면 ③라인업까지 와야 하는데,
#   ③은 아직 `autocollect.sh` 안에 있어서 ★수집 한 바퀴(70분)를 기다린다.★
#
# ── ★먼저 범위부터 좁혔다★ (사장님: «주기만 줄이지 마라»)
#   실측한 한 판 (2026-09-08 00:56 · 운영 로그):
#   ```
#   참가 기록 신규 ★0★ · 갱신 ★76,750★ · 선수 신규 0 · 재사용 76,750
#   ```
#   ★한 줄도 새로 안 만들고 7만 6천 줄을 같은 값으로 다시 썼다.★
#   그게 한 판을 수십 분으로 만든 범인이다.
#
#   왜 매번 다시 쓰나 — 기준시각 이전 경기 ★7,170건★ 의 `lineupStatus` 가
#   전부 «없음» 이다. ★「끝났다」는 표시가 없으니 영원히 다시 손댄다.★
#   그 중 6,917건은 ★이미 10명이 다 들어와 있다.★ 다시 쓸 이유가 없다.
#
#   그래서 이 예약작업은 ★`--from-cutoff` 로 창 안(시즌0)만★ 본다.
#
#   ★재 본 결과 (2026-09-08 · 운영 · 한 판씩)★
#   ```
#                     창 없이 전체        창 안만 (`--from-cutoff`)
#     걸린 시간        ★34분★             ★17.5분★ (1,050초)
#     우리 경기        9,000대            2,011
#     참가기록 신규    ★0★                ★790★
#     참가기록 갱신    ★76,750★           17,700
#     라인업 표시       만듦 0             ★만듦 79 · 못 만듦 9★
#   ```
#   ★전체를 훑던 판은 34분 동안 한 줄도 새로 안 만들었다.★ 좁힌 판은 절반 시간에 790줄을 넣었다.
#
# ── 왜 10분인가
#   한 판이 17.5분이라 ★주기가 15분이면 한 회차가 통째로 헛돈다★ (15분에 떠서 막히고,
#   30분에 떠서 돌기 시작 → 실제로는 30분마다). ★10분이면 20분마다 돈다.★
#   나중에 `O-065`(열쇠 범위 자르기)가 들어가면 판이 1분대로 줄고,
#   ★주기를 안 건드려도 저절로 10분마다가 된다.★
#
# ── ⚠ ★과거 메꾸기를 죽이지 않았다★ (`CLAUDE.md` 1-4)
#   `autocollect.sh` 의 ③ 은 ★창 없이 전체를 그대로 훑는다.★ 손대지 않았다.
#   IPL 과거 배틀로그 메꾸기는 Part 4 이전부터 돌던 일이라 여기서 끊지 않는다.
#   ★이 파일은 「빠른 길」을 하나 더 낸 것이지 옛 길을 막은 것이 아니다.★
#
# ── 겹침 — ★자물쇠를 두 겹으로 건다★
#   ① ★실제로 도는 프로세스를 센다.★ `autocollect.sh` 의 ③ 은 임대를 쥐지 않아서
#     임대만으로는 못 막는다. 2026-09-04 에 자물쇠가 뚫린 것과 같은 함정이다 (`5acfd39`).
#     ★못 세면 0 이 아니라 「모름」이고, 모르면 시작하지 않는다.★
#   ② 같은 이름의 임대(`battlelog-lineup`). 이건 이 예약작업끼리의 겹침을 막는다.
#     ★이미 있는 명령을 그대로 쓴다★ — 스키마도 코드도 새로 안 만든다.
#
#   ⚠ ★`apps/worker/**` 는 한 글자도 안 건드렸다.★ 그 파일들은 지금
#     ★다른 세션이 고치는 중★ 이라 손대면 남의 작업을 커밋에 쓸어담게 된다.
#
# ── ⚠ 하지 않는 것
#   ★수집을 하지 않는다★ (네트워크 0건 — 이미 받아 둔 배틀로그 원문만 읽는다).
#   ★정규화를 하지 않는다★ (그건 `project.sh`).
#   ★10명이 안 채워진 경기를 추측으로 채우지 않는다★ — 그건 원본이 모르는 것이다.
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${LINEUP_LOG:-C:/Users/LG/AppData/Local/Temp/claude/lineup.log}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# ★긴 배치 잡★ 이라 세션 풀러(5432)를 쓴다. 6543 자리는 사이트 몫으로 남긴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M:%S')" "$1" | tee -a "$LOG"; }

began=$(date +%s)

# ── ① ★도는 놈을 직접 센다★ ──────────────────────────────────────
#   `node.exe` / `cmd.exe` 만 본다 — 셸은 명령줄에 스크립트가 통째로 들어가서
#   글자만 보면 자기 자신이 걸린다. 세러 띄운 PowerShell 도 빼고 센다.
# ── ★윈도와 리눅스 둘 다 센다★ (2026-09-08)
#   윈도(노트북)는 PowerShell 로, 리눅스(서버)는 `pgrep` 으로 센다.
#   ⚠ 서버 첫 시험에서 걸렸다 — 리눅스에는 PowerShell 이 없으니 「못 셌다」가 되어
#     ★안전하게 시작을 안 했다.★ 멈춘 것은 옳았고, ★셀 줄을 몰랐던 것★ 이 문제였다.
if command -v powershell >/dev/null 2>&1; then
  n=$(powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { (\$_.Name -eq 'node.exe' -or \$_.Name -eq 'cmd.exe') -and \$_.CommandLine -match 'battlelog-lineup' -and \$_.CommandLine -notmatch 'collect-lease' -and \$_.CommandLine -notmatch 'Get-CimInstance' }).Count" 2>/dev/null | tr -d '\r' | tr -d ' ')
else
  # `-f` 는 명령줄 전체를 본다. 임대를 부르는 프로세스는 빼고 센다
  cnt_all=$(pgrep -fc -- 'battlelog-lineup' 2>/dev/null || echo 0)
  cnt_lease=$(pgrep -fc -- 'collect-lease' 2>/dev/null || echo 0)
  n=$(( cnt_all > cnt_lease ? cnt_all - cnt_lease : 0 ))
fi
case "$n" in
  ''|*[!0-9]*)
    # ★모르면 시작하지 않는다.★ 확인 못 한 채 시작하는 것이 지금까지 사고의 원인이었다
    say "★라인업이 도는지 못 셌다 — 시작하지 않는다★"
    exit 0 ;;
esac
if [ "$n" != "0" ]; then
  say "  건너뜀 — 라인업이 이미 ${n}개 돈다 (수집 바퀴의 ③ 일 수 있다)"
  exit 0
fi

# ── ② 임대 ────────────────────────────────────────────────────────
acq=$(pnpm --filter @sacloud/worker nexon collect-lease acquire \
        --name battlelog-lineup --ttl 1800 2>&1)
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
say "★라인업 시작★ (임대 ${OWNER})"

# ── ③ ★창 안만★ (옛 방식도 한 줄로 되돌아온다) ───────────────────
#   옛 줄(창 없이 전체):  --all-leagues --confirm    ← ★지우지 않는다★ (CLAUDE.md 1-4)
#   `LINEUP_FULL=1 sh scripts/lineup.sh` 로 부르면 ★창 없이 전체★ 를 훑는다 —
#   과거 배틀로그 메꾸기를 손으로 한 판 돌리고 싶을 때 쓴다.
LINEUP_FULL="${LINEUP_FULL:-0}"
if [ "$LINEUP_FULL" = "1" ]; then
  say "  ★창 없이 전체★ 를 훑는다 (LINEUP_FULL=1) — 한 판이 30분 가까이 걸린다"
  WINDOW=""
else
  WINDOW="--from-cutoff"
fi

# ── ★손볼 필요가 있는 경기만★ (2026-09-08 · O-065 · 사장님 지시)
#   실측 (운영 · 쓰기 없이 잰 값):
#   ```
#                        훑는 열쇠   손대는 경기    한 판
#     옛 방식 (창만)      37,789      2,191       ★271초★
#     새 방식 (+좁힘)         64         64        ★28초★
#   ```
#   ★매 판 헛되이 다시 쓰던 참가기록 20,070줄 → 0.★
#
#   ★잃는 것이 없다는 증명★ — 안 보게 되는 2,127건의 정체:
#     complete 2,007건        전부 ★참가기록이 이미 있다.★ 다시 볼 이유가 없다
#     roster_incomplete 120건 ★마지막으로 본 뒤 새 배틀로그가 안 왔다.★ 봐도 결과가 같다
#   새 원문이 오거나 클랜이 등록되면 ★저절로 다시 대상★ 이 된다. ★영구 제외는 없다.★
#
#   ⚠ 되돌리려면 `LINEUP_ALL=1` — 창 안 전부를 다시 훑는다 (`CLAUDE.md` 1-4)
LINEUP_ALL="${LINEUP_ALL:-0}"
if [ "$LINEUP_ALL" = "1" ] || [ "$LINEUP_FULL" = "1" ]; then
  PENDING=""
else
  PENDING="--only-pending"
fi

# ★끊기면 짧게 세 번까지만 다시 해 본다★
#   `project.sh` 와 같은 이유다 — 2026-09-07 23:44 에 이 잡이 바로 이 오류로 죽었다:
#     code 10054 ConnectionReset   「원격 호스트에 의해 강제로 끊겼습니다」
#     code 10053 ConnectionAborted 「호스트 시스템의 소프트웨어에 의해 중단되었습니다」
#   ★10053 은 저쪽이 아니라 이쪽 컴퓨터의 프로그램이 끊은 것이다.★
#   우리가 못 고치는 원인이라 ★다시 해 보는 것 말고는 길이 없다.★
#   ⚠ ★무한히 하지 않는다★ (세 번) · ★같은 것을 두 번 만들지 않는다★ —
#     이 잡은 멱등이다. 이미 있는 참가 기록은 「갱신」 으로 세고 넘어간다
TRIES=3
try=1
while : ; do
  # shellcheck disable=SC2086
  pnpm --filter @sacloud/worker nexon battlelog-lineup \
       --all-leagues $WINDOW $PENDING --confirm >> "$LOG" 2>&1
  code=$?
  [ "$code" = "0" ] && break
  if [ "$try" -ge "$TRIES" ]; then
    say "  ⚠ ★${TRIES}번 다 실패했다 (코드 ${code}) — 여기서 멈춘다.★ 다음 회차가 온다"
    break
  fi
  wait=$(( try * 20 + 20 ))
  say "  ⚠ 실패 (코드 ${code}) — ${wait}초 쉬고 ${try}/${TRIES} 다시 해 본다"
  sleep "$wait"
  try=$(( try + 1 ))
done
spent=$(( $(date +%s) - began ))

# ── ④ 반납 ────────────────────────────────────────────────────────
#   ★실패로 끝나도 반납한다★ — 안 그러면 TTL 동안 다음 회차가 다 막힌다
pnpm --filter @sacloud/worker nexon collect-lease release \
     --name battlelog-lineup --owner "$OWNER" >> "$LOG" 2>&1 || true

if [ "$code" = "0" ]; then
  made=$(grep -E '^참가 기록 ' "$LOG" | tail -1)
  mark=$(grep -E '^라인업 상태 표시' "$LOG" | tail -1)
  say "  끝 (${spent}초) — ${made:-(요약을 못 읽었다)}"
  [ -n "$mark" ] && say "        ${mark}"
else
  say "★★라인업 실패 (코드 ${code} · ${spent}초)★★ — 다음 회차에 다시 해 본다"
fi

exit 0

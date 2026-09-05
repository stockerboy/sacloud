#!/bin/sh
# ★15분마다 스스로 도는 수집★ (2026-09-04 · O-051)
#
# ── 왜 이 파일이 있나
#   사장님: ★«9/3부터 자동수집 15분마다 · 사람 손 0»★
#   ★돌릴 곳을 세 군데 다 재 봤고 셋 다 막혔다★ —
#   ```
#   GitHub 실행기   ★403★ (D-269)
#   Vercel 서울     ★403★ (D-274 · icn1 에서 직접 재서 확인)
#   Oracle 무료     ★한국 지역이 신청 화면에 없다★
#   ```
#   ★남은 것은 이 컴퓨터뿐이다.★ 그래서 ★이 컴퓨터가 켜져 있는 동안 도는 것★ 을 만든다.
#
# ── 쓰는 법
#   sh scripts/autocollect.sh              ← 창을 닫으면 멈춘다
#
#   ⚠ ★윈도 예약 작업으로 등록하지 않았다.★ ★그건 사장님 컴퓨터에 무언가를 심는 일이라
#     내가 임의로 하지 않는다.★ 원하시면 이 한 줄을 예약 작업에 넣으면 된다.
#
# ── 한 바퀴에 하는 일
#   ```
#   ① 배틀로그 ★600건★ (간격 1500ms ≒ 15분 · ★한 바퀴가 주기를 넘지 않게★)
#   ② 투영 — 경기(세 리그 한 번에) → 라인업(★세 리그 한 번에★ · Part 4)
#   ③ 다음 바퀴까지 남은 시간만큼 쉰다
#   ```
#   ⚠ ★①이 15분을 넘으면 바퀴가 밀린다.★ 그래서 ★받은 뒤 남은 시간만 쉰다★ —
#     고정으로 15분을 쉬면 주기가 점점 늘어난다.
#
# ── ⚠ 멈추는 조건
#   ★차단(403·429)이면 그 자리에서 끝낸다.★ ★우회하지 않는다★ (D-266).
#   무겁거나 끊긴 것(코드 3)은 ★다음 바퀴에 다시 해 본다★ — 그건 일시적이다.
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${AUTOCOLLECT_LOG:-C:/Users/LG/AppData/Local/Temp/claude/autocollect.log}"
PERIOD="${AUTOCOLLECT_PERIOD:-900}"   # 15분
BATCH="${AUTOCOLLECT_BATCH:-600}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

# ── ★★두 개가 동시에 돌지 못하게 잠근다★★ (2026-09-04 · D-279)
#
#   ★한 번 당했다.★ 멈춘 줄 알았던 판이 살아 있어서 ★두 시간 반 동안 원본을 두 배로 두드렸다.★
#   멈추는 도구가 ★셸만 죽이고 그 아래 프로세스는 남기기 때문★ 이다.
#
#   ★「간격 1500ms」는 한 프로세스 안에서만 지켜지는 약속이다.★
#   ★두 개가 돌면 그 약속이 저절로 깨진다.★ 그래서 ★사람이 조심하는 대신 코드가 막는다.★
#
#   ⚠ ★낡은 잠금은 스스로 푼다★ — 프로세스가 죽으면서 잠금만 남으면
#     그 뒤로 영영 못 돌게 된다. ★그건 더 나쁘다.★
#   ★2026-09-04 · 두 번째로 뚫렸다★ — 자물쇠를 `scripts/collect-lock.sh` 로 옮겼다.
#     셸 번호만 보던 것을 ★도는 수집 프로세스를 직접 세는★ 것으로 바꿨다.
. "$(dirname "$0")/collect-lock.sh"
collect_lock_acquire

say "★자동수집 시작★ — ${PERIOD}초마다 · 한 바퀴 ${BATCH}건 · 차단이면 끝낸다"
# ★잠금만 시험하고 싶을 때★ — `COLLECT_LOCK_TEST=1` 을 주면 여기서 끝낸다.
#
# ⚠ ★이 문이 없어서 잠금을 시험하다 실제 수집을 12초 띄웠다★ (2026-09-04).
#   남은 프로세스는 없었지만 ★운이 좋았던 것★ 이다.
#   ★막는 장치를 시험한다고 막으려던 일을 벌이면 안 된다.★
if [ "${COLLECT_LOCK_TEST:-0}" = "1" ]; then
  say "★잠금 시험이다 — 여기서 끝낸다 (요청을 한 건도 보내지 않았다)★"
  exit 0
fi


lap=0
while :; do
  lap=$((lap + 1))
  began=$(date +%s)
  # ★긴 구간에 들어가기 전에 임대를 이어 쥔다★ (2026-09-04 · Pre-Part 0)
  collect_lock_renew || exit 0

  # ★세 리그를 한 대기열로 돈다★ (2026-09-05 · Part 3 ⑤단계 · 사장님 지시)
  #   «수집 단계에서 IPL/SPL/열산을 따로 세 번 처리하는 구조로 만들지 마라»
  #   ⚠ ★따로 세 번 돌면 간격 1500ms 약속이 500ms 가 된다★
  #   ⚠ ★열산이 311곳 중 8곳만 수집되고 있었다★ — 그래서 열산 신규가 0건이었다
  #   옛값:  --league nolink --clans 43   ← ★지우지 않는다★ (CLAUDE.md 1-4)
  pnpm --filter @sacloud/worker nexon barracks-collect \
    --all-leagues --clans 999 --limit "$BATCH" --confirm \
    --lease-owner "$COLLECT_LEASE_OWNER" \
    --health https://3rdcloud.my/api/health >> "$LOG" 2>&1
  code=$?

  # ★9 = 임대 상실★ — 쥐고 있던 것을 남에게 빼앗겼다. 남이 지금 돌고 있다
  if [ "$code" = "9" ]; then
    say "★★임대 상실 — 이 판을 끝낸다. 남이 이미 수집 중이다★★"
    exit 0
  fi
  # ★10 = 임대 미획득★ — ★애초에 못 잡은 채 불렸다.★ 남이 도는지는 ★모른다★
  #   ⚠ 9 와 같은 말로 찍으면 «남이 이미 수집 중이다» 라는 ★거짓말★ 이 된다
  #     (2026-09-05 01:03 에 실제로 그렇게 찍혔다 — 아무도 안 돌고 있었다)
  if [ "$code" = "10" ]; then
    say "★★임대 미획득 — 수집을 시작하지 않는다★★ (주인 번호가 비어 있다)"
    exit 0
  fi
  # ★127 은 「명령을 못 찾았다」다. 성공이 아니다★
  if [ "$code" = "127" ]; then
    say "★★코드 127 — 명령을 못 찾았다. 이번 바퀴는 한 건도 못 받았다★★"
    exit 1
  fi

  if [ "$code" = "2" ]; then
    say "★★차단됐다 (403·429) — 자동수집을 끝낸다. 우회하지 않는다★★"
    exit 1
  fi

  # ★통합 투영★ — IPL/SPL/열산 중 정확히 하나로 (2026-09-05 · Part 3)
  #   옛값: pnpm … nexon iplmatch-project --confirm  ← ★지우지 않는다★
  #   둘 다 origin='nexon_barracks' 라 같이 돌리면 헛수고다. 하나만 돈다
  pnpm --filter @sacloud/worker nexon unified-project --confirm >> "$LOG" 2>&1
  # ★라인업도 세 리그를 한 번에★ (2026-09-05 · Part 4 · 사장님 지시)
  #   «리그별 라인업 수집기를 세 개 따로 만들지 마라»
  #   ⚠ ★열산·SPL 은 라인업이 아예 안 들어오고 있었다★ — 이 줄이 nolink 로 고정이어서다
  #   옛값:  --league nolink   ← ★지우지 않는다★ (CLAUDE.md 1-4)
  #   ⚠ 창은 ★좁히지 않는다★ — IPL 과거 배틀로그 메꾸기는 Part 4 이전부터 돌던 일이다.
  #     여기서 --from-cutoff 를 붙이면 ★말 안 한 변경★ 이 된다
  pnpm --filter @sacloud/worker nexon battlelog-lineup --all-leagues --confirm >> "$LOG" 2>&1
  # ★쉬기 전에 다시 이어 쥔다★ — 쉬는 구간이 제일 길다
  collect_lock_renew || exit 0

  got=$(grep -E '^계획 ' "$LOG" | tail -1)
  say "  ${lap}바퀴 (코드 ${code}) — ${got:-(요약을 못 읽었다)}"

  # ★남은 시간만 쉰다★ — 고정으로 쉬면 주기가 점점 밀린다
  spent=$((`date +%s` - began))
  rest=$((PERIOD - spent))
  if [ "$rest" -gt 0 ]; then
    sleep "$rest"
  else
    say "  ⚠ ★한 바퀴가 ${spent}초 걸렸다 — 주기(${PERIOD}초)를 넘었다.★ 쉬지 않고 다음 바퀴로 간다"
  fi
done

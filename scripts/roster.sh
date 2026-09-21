#!/bin/sh
# ★6시간마다 스스로 도는 「병영수첩 소속 갱신」★ (2026-09-09 · 사장님 지시 「1단계부터 가」)
#
# ── 왜 이 파일이 생겼나
#   > "병영수첩기준으로 계속 실시간으로 반영돼야하는데 애초에 반영도 안되네"
#   >   — 사장님, 2026-09-09
#
#   ★소속을 채우는 절차가 사람 손이었다.★ 브라우저 콘솔에 스크립트를 붙여넣고
#   파일로 내려받아 다시 불러넣는 방식(`scripts/ipl-clan-members-snippet.js`)이라
#   ★2026-08-31 에 한 번 돌고 9일간 멈춰 있었다.★
#   그동안 새로 들어온 선수는 전원 무소속으로 보였다 (IPL 실측 2,324명 · 61.5%).
#
#   ★이 파일이 그 손을 대신한다.★
#
# ── 두 걸음이다
#   ```
#   ① barracks-roster     병영수첩에서 클랜원 명부를 받아 온다   ← 네트워크를 쓴다
#   ② clan-affiliation    그 명부로 선수의 현재 소속을 맞춘다     ← DB 만 만진다
#   ```
#   ①이 막히거나 실패하면 ②를 하지 않는다 — ★반쪽 명부로 소속을 비우면 안 된다.★
#
# ── 왜 6시간인가
#   클랜 이적은 하루 몇 건이다. ★실시간으로 물어볼 일이 아니다.★
#   한 판이 클랜 461곳 × 1.5초 = ★약 12분★ 이라 이보다 자주 돌면 넥슨에 대한 부담만 는다.
#   6시간이면 이적이 ★늦어도 6시간 안에★ 화면에 반영된다.
#
#   ⚠ 더 자주 돌리고 싶으면 리그를 줄여라 — IPL+SPL 만 하면 105곳(약 3분)이다.
#     `ROSTER_LEAGUES=nolink,supply sh scripts/roster.sh`
#
# ── 겹침
#   ★이미 있는 명령을 그대로 쓴다★ — `nexon collect-lease acquire --name barracks-roster`.
#   `CollectorLease` 표를 ★이름만 달리해서★ 쓴다. 스키마도 코드도 새로 안 만든다.
#   `barracks-collect` · `unified-project` · `season0-apply` 와 이름이 달라 서로 안 막는다.
#
# ── ⚠ 하지 않는 것
#   ★경기 수집을 하지 않는다.★ 경기·라인업·정규화에 한 글자도 손대지 않는다.
#   ★경기 당시 소속(`matchTime*`)을 건드리지 않는다.★ 지금 소속을 과거에 뿌리면
#   이적하는 순간 옛 기록이 통째로 바뀐다.
#
# ```
# sh scripts/roster.sh                              # 세 리그 전부
# ROSTER_LEAGUES=nolink sh scripts/roster.sh        # 한 리그만
# ROSTER_DRY=1 sh scripts/roster.sh                 # 미리보기 (한 줄도 안 쓴다)
# ```
set -u

cd "$(dirname "$0")/.." || exit 1
# 서버(VPS)는 `/root/sacloud.env` 에서 `ROSTER_LOG` 를 준다. 없으면 노트북 자리를 쓴다
LOG="${ROSTER_LOG:-C:/Users/LG/AppData/Local/Temp/claude/roster.log}"
LEAGUES="${ROSTER_LEAGUES:-}"
DRY="${ROSTER_DRY:-0}"

DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
# ★긴 배치 잡★ 이라 세션 풀러(5432)를 쓴다. 6543 자리는 사이트 몫으로 남긴다 (D-249)
export SACLOUD_DB_SESSION_POOLER=1

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

# 리그를 지정했으면 그 리그만. 안 했으면 잡의 기본값(세 리그)을 쓴다
LEAGUE_ARG=""
if [ -n "$LEAGUES" ]; then LEAGUE_ARG="--league $LEAGUES"; fi
CONFIRM="--confirm"
if [ "$DRY" = "1" ]; then CONFIRM=""; fi

# ── ⓪ 이미 도는 판이 있나 ────────────────────────────────────────
#   ★셸이 아니라 실제 프로세스를 센다★ (2026-09-08 의 교훈).
#   임대를 부르는 프로세스는 명령줄에 이름이 들어가므로 ★반드시 빼고 센다.★
if command -v powershell >/dev/null 2>&1; then
  n=$(powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -match 'barracks-roster' -and \$_.CommandLine -notmatch 'collect-lease' -and \$_.CommandLine -notmatch 'Get-CimInstance' }).Count" 2>/dev/null | tr -d '\r' | tr -d ' ')
else
  cnt_all=$(pgrep -fc -- 'barracks-roster' 2>/dev/null)
  cnt_lease=$(pgrep -fc -- 'collect-lease' 2>/dev/null)
  # ⚠ pgrep 은 못 찾으면 ★아무것도 안 찍는다.★ 빈 값을 계산에 넣으면 죽는다
  case "$cnt_all"   in ''|*[!0-9]*) cnt_all=0 ;;   esac
  case "$cnt_lease" in ''|*[!0-9]*) cnt_lease=0 ;; esac
  if [ "$cnt_all" -gt "$cnt_lease" ]; then n=$(( cnt_all - cnt_lease )); else n=0; fi
fi
case "$n" in
  ''|*[!0-9]*)
    # ★모르면 시작하지 않는다★
    say "★명부 받기가 도는지 못 셌다 — 시작하지 않는다★"
    exit 0 ;;
esac
if [ "$n" != "0" ]; then
  say "  건너뜀 — 명부 받기가 이미 ${n}개 돈다"
  exit 0
fi

# ── ① 임대 ────────────────────────────────────────────────────────
#   ⚠ ★반납할 때도 `--name` 을 반드시 준다.★ 안 주면 기본값이 `barracks-collect` 라
#     ★수집기의 임대를 반납하려 든다★ (2026-09-09 실측 — 주인이 달라 실패했지만
#     실패했기에 우리 임대가 30분 동안 안 풀렸다).
#   한 판 ★약 12분★ 이라 TTL 은 ★30분★ 이다. 죽은 판이 그보다 오래 막지 않게 짧게 둔다.
acq=$(pnpm --filter @sacloud/worker nexon collect-lease acquire --name barracks-roster --ttl 1800 2>&1)
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
say "★소속 갱신 시작★ (임대 ${OWNER}${LEAGUES:+ · 리그 ${LEAGUES}})"

# ── ② 명부를 받는다 ───────────────────────────────────────────────
# shellcheck disable=SC2086
# ★스스로 시간을 재고 멈춘다★ — 밖에서 끊기면 끊긴 자리를 알 수 없다.
# 남은 곳은 다음 회차가 `--resume` 으로 그대로 잇는다 (같은 관측 시각을 이어 쓴다)
MAXMIN="${ROSTER_MAX_MIN:-20}"
# ★★이어받기 창을 예약 주기보다 길게 준다★★ (2026-09-20 사장님: 「왤케 최신화가 안되냐」)
#
#   ⚠ 옛 판은 `--resume` 을 ★안 줬다.★ 그러면 기본 90분이 쓰이는데 예약은 그보다
#     드물게 온다. 그래서 ★매번 처음부터★ 받고, 앞 150곳만 받다 끝났다.
#     실측 — 409곳 중 ★29곳★ 만 들어 있던 판이 있었다.
#   ★120분★ 이면 1시간 주기에서 다음 판이 확실히 이어받는다. 세 바퀴면 완주한다.
RESUME="${ROSTER_RESUME_MIN:-120}"
pnpm --filter @sacloud/worker nexon barracks-roster $LEAGUE_ARG --max-min "$MAXMIN" --resume "$RESUME" $CONFIRM >> "$LOG" 2>&1
code=$?

if [ "$code" != "0" ]; then
  # 잡은 403/429 로 막히면 코드 1 을 준다. ★막힌 명부로 소속을 고치지 않는다★
  say "★★명부 받기 실패/막힘 (코드 ${code}) — 소속 반영은 하지 않는다★★"
  pnpm --filter @sacloud/worker nexon collect-lease release --name barracks-roster --owner "$OWNER" >> "$LOG" 2>&1
  exit 0
fi
say "  명부 받음 — $(grep -E '^명부 ' "$LOG" | tail -1)"

# ── ③ 소속을 맞춘다 ───────────────────────────────────────────────
#   ★DB 만 만진다.★ 네트워크를 한 건도 안 쓴다.
# shellcheck disable=SC2086
pnpm --filter @sacloud/worker nexon clan-affiliation $LEAGUE_ARG $CONFIRM >> "$LOG" 2>&1
code=$?
if [ "$code" = "0" ]; then
  say "  소속 반영 — $(grep -E '^선수 ' "$LOG" | tail -1)"
else
  say "★★소속 반영 실패 (코드 ${code})★★ — 다음 회차에 다시 해 본다"
fi

# ── ③-2 ★클랜 마크를 최근 경기로 맞춘다★ (2026-09-21 사장님) ─────────
#   사장님: 「클랜명바뀐건 적용이 잘되는데 ★클랜마크 바뀐건 적용이 안된다니까★」
#
#   ⚠ ★병영 클랜원 명부에는 마크 칸이 없다.★ 이름만 온다.
#     그래서 ③ 이 이름을 고쳐도 마크는 영영 옛것이었다.
#   ★질의 한 번★ 이라 가볍다 — 참가 기록에 쌓인 「경기 당시 마크」 를 읽는다.
#   실측 (2026-09-21 첫 판) — 클랜 133곳 중 ★8곳★ 을 고쳤다 (grave 포함).
# shellcheck disable=SC2086
pnpm --filter @sacloud/worker nexon clan-mark-fresh $CONFIRM >> "$LOG" 2>&1
say "  마크 맞춤 — $(grep -E '^클랜 마크' "$LOG" | tail -1)"

# ── ③-2b ★닉네임을 병영 명부로 맞춘다★ (2026-09-21 사장님) ────────────
#   사장님: 「정보갱신 최신화 좀 제대로 안되냐 진짜 왜 못하는거야 이거?」
#           「★언제적 닉네임이야★ 이건 이 사람 이 닉네임 거의 6개월전에 쓰던건데」
#
#   ⚠ 명부는 ★매시 받아 오고 있었다.★ 그런데 ③(`clan-affiliation`)은 ★소속만★
#     맞추고 이름은 안 건드렸고, 정보갱신은 ★누른 한 명★ 만 고쳤다.
#     ★받아 둔 명부의 닉을 선수 이름에 옮기는 잡이 아예 없었다.★
#     실측 — 계정으로 이은 3,969명 중 ★1,740명★ 이 어긋나 있었다.
#
#   ★질의 한 번★ 이라 가볍다. 계정으로 이어진 사람만 고친다 (D-221).
# shellcheck disable=SC2086
pnpm --filter @sacloud/worker nexon nick-from-barracks $CONFIRM >> "$LOG" 2>&1
say "  닉 맞춤 — $(grep -E '^병영 닉 맞춤' "$LOG" | tail -1)"

# ── ③-3 ★배틀로그로 계정을 잇는다★ (2026-09-21 사장님) ────────────────
#   사장님: 「왤케 최신화가 안돼 원인이 뭐야? ★26퍼만 훑는 원인은 뭐고★」
#
#   ⚠ ★선수의 80%는 넥슨 계정번호를 모른다.★ 9/4 이전에 미러로 들여온 사람들이라
#     그때는 그 번호가 안 왔다. 번호가 없으면 ★병영 명부와 못 잇는다★ —
#     닉으로 이으면 위장닉이 걸린다 (D-221).
#   ★배틀로그에는 번호와 닉이 같이 온다.★ 그걸로 이어 준다.
#   실측 (2026-09-21) — 배틀로그 22만 줄을 훑어 ★1,400명 넘게 새로 이었다.★
#
#   ⚠ 한 번에 다 하지 않는다 — 매시 조금씩 이어 가면 된다.
# shellcheck disable=SC2086
pnpm --filter @sacloud/worker nexon identity-from-battlelog --limit 20000 $CONFIRM >> "$LOG" 2>&1
say "  계정 잇기 — $(grep -E '^계정 잇기' "$LOG" | tail -1)"

# ── ④ ★상대 팀 마크를 달고 있는 참가 기록을 고친다★ (2026-09-20 사장님) ──
#   명부가 낡았을 때 찍힌 도장은 ★상대 팀★ 을 가리킨다. 실측 1,133줄이 그랬다.
#   ⚠ 용병(제3 클랜)은 한 줄도 안 건드린다 — 판정 기준이 「상대 팀인가」 하나다.
#   ★명부를 받은 직후에 돌려야 한다★ — ③ 이 소속을 고친 뒤라야 값이 맞다.
# shellcheck disable=SC2086
pnpm --filter @sacloud/worker nexon restamp-wrong-clan $CONFIRM >> "$LOG" 2>&1
say "  도장 손질 — $(grep -E '^상대팀 도장' "$LOG" | tail -1)"

pnpm --filter @sacloud/worker nexon collect-lease release --name barracks-roster --owner "$OWNER" >> "$LOG" 2>&1
exit 0

#!/bin/sh
# ★★24시간 감시 — 기록이 밀리면 스스로 찾아 고치고 장부에 남긴다★★
#   (2026-09-22 · 사장님 지시)
#
# > 「기록 ★20분이상 지체될때마다★ 왜그런지 확인하고 원인파악하고 문제해결해
# >  내가 자는동안 ★멈춘시간과 고친시간 등을 전부 기록★ 하고 근본적인 문제를 파악하고
# >  해결하려고 시도해 (…) ★패턴보고 24시간 사이트를 너가 직접 감시★ 하고
# >  안되는거 있으면 바로바로 고쳐」
#
# ── 무엇을 보나 (2분마다)
#   ```
#   raw    마지막 원문 수집이 몇 분 전인가       ← 수집이 도는가
#   proj   아직 Match 가 안 된 원문 중 제일 묵은 것 ← 정규화가 밀렸나
#   line   참가행이 없는 경기 중 제일 묵은 것       ← 명단이 밀렸나
#   pend   40분 넘게 킬데스 없는 경기 수           ← 「영영 수집중」
#
# ⚠ ★「마지막 경기가 몇 분 전인가」 로 재지 않는다★ — 경기 한 판이 20분이라
#   멀쩡한데도 밀린 것처럼 잡힌다 (2026-09-22 실측으로 한 번 잘못 쟀다).
#   ★우리 손에 들어온 뒤로 묵은 만큼만★ 센다.
#   ```
#
# ── ★20분을 넘으면★
#   ① 왜 그런지 본다 — 수집 프로세스가 사는가 · 403 을 맞았나 · 잠금이 굳었나 · 메모리
#   ② 할 수 있는 것을 고친다 — 굳은 잠금 풀기 · 멈춘 사슬 다시 걸기
#   ③ ★장부에 남긴다★ — 언제 멈췄고 · 왜인 것 같고 · 무엇을 했고 · 언제 풀렸나
#
# ⚠ ★사람이 읽는 장부는 하나다★ — `/root/log/lag-ledger.md`
# ⚠ ★우리가 고칠 수 없는 것은 고친 척하지 않는다★ — 「사람이 봐야 한다」 로 남긴다
# ⚠ ★403(차단)이면 아무것도 되살리지 않는다★ — 우회하지 않는다 (D-266)
set -u

ROOT=/root/sacloud
LEDGER="${LAG_LEDGER:-/root/log/lag-ledger.md}"
LOG="${LAG_LOG:-/root/log/lag-watch.log}"
STATE="${LAG_STATE:-/root/log/lag-watch.state}"

# 몇 분부터 「밀렸다」 로 보나 — 사장님이 정하신 값이다
THRESHOLD="${LAG_THRESHOLD:-20}"

mkdir -p /root/log
ts()  { date '+%m-%d %H:%M'; }
say() { echo "$(ts) | $*" >> "$LOG"; }
led() { echo "$*" >> "$LEDGER"; }

[ -f "$LEDGER" ] || {
  led "# 기록 지연 장부"
  led ""
  led "사장님 지시(2026-09-22): 「20분 이상 지체될 때마다 왜 그런지 확인하고"
  led "원인 파악하고 문제 해결해. 멈춘 시간과 고친 시간을 전부 기록해」"
  led ""
  led "· **밀림** 줄 = 그때 20분을 넘었다  · **풀림** 줄 = 그때 정상으로 돌아왔다"
  led "· 숫자는 «지금으로부터 몇 분 전» 이다"
  led ""
}

# ── 잰다 ─────────────────────────────────────────────────────────
. /root/sacloud.env 2>/dev/null || true
cd "$ROOT" || exit 0
OUT=$(timeout 90 node scripts/lag-probe.mjs 2>/dev/null | tail -1)
case "$OUT" in
  raw=*) : ;;
  *) say "★값을 못 읽었다★ — 이번 판은 판단하지 않는다 ($OUT)"; exit 0 ;;
esac
raw=0; proj=0; line=0; pend=0
eval "$OUT"

# 가장 늦은 단계가 곧 사장님이 겪는 지연이다
WORST=$raw
STAGE=수집
[ "$proj" -gt "$WORST" ] 2>/dev/null && { WORST=$proj; STAGE=정규화; }
[ "$line" -gt "$WORST" ] 2>/dev/null && { WORST=$line; STAGE=명단; }

say "raw=${raw} proj=${proj} line=${line} pend=${pend} → 최악 ${WORST}분(${STAGE})"

WAS=$(cat "$STATE" 2>/dev/null || echo ok)

# ── 괜찮다 ───────────────────────────────────────────────────────
if [ "$WORST" -ge 0 ] && [ "$WORST" -lt "$THRESHOLD" ]; then
  if [ "$WAS" != "ok" ]; then
    led "- **풀림** \`$(ts)\` — ${WORST}분까지 내려왔다 (수집 ${raw} · 정규화 ${proj} · 명단 ${line} · 수집중 ${pend})"
    say "★풀렸다★"
  fi
  echo ok > "$STATE"
  exit 0
fi

# ── 밀렸다 — 왜인지 본다 ─────────────────────────────────────────
WHY=""
FIX=""

laps=$(pgrep -fc "autocollect.sh" 2>/dev/null || echo 0)
case "$laps" in ''|*[!0-9]*) laps=0 ;; esac
[ "$laps" -eq 0 ] && WHY="${WHY}수집 프로세스가 없다 · "

# ★차단이면 손대지 않는다★ — 우회하지 않는다 (D-266)
BLOCKED=0
if tail -400 /root/log/autocollect.log 2>/dev/null | grep -q "차단됐다 (403·429)"; then
  BLOCKED=1
  WHY="${WHY}★병영수첩이 막았다(403·429)★ · "
fi

avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo -1)
[ "$avail" -ge 0 ] && [ "$avail" -lt 200 ] && WHY="${WHY}남은 메모리 ${avail}MB · "

# ⚠ ★잠금 파일이 남아 있는 것은 고장이 아니다★ (2026-09-22 실측으로 알았다).
#   `flock` 은 안 쓸 때도 파일을 그대로 둔다. 처음에 이것을 「주인 없이 굳었다」 로
#   적었더니 ★멀쩡한데 장부가 거짓 원인으로 찼다.★ 그래서 ★세지 않는다.★
#   («없는 것을 지어내지 않는다» — CLAUDE.md 2-1)

[ -z "$WHY" ] && WHY="겉으로는 멀쩡하다 — 더 봐야 한다 · "

# ── 할 수 있는 것을 고친다 ───────────────────────────────────────
if [ "$BLOCKED" = "1" ]; then
  FIX="아무것도 되살리지 않았다 (막힌 동안 다시 두드리지 않는다)"
else
  # 멈춘 뒷일(정규화·명단·분석)을 다시 건다 — 각자 잠금이 있어 겹치지 않는다
  if [ "$proj" -ge "$THRESHOLD" ] || [ "$line" -ge "$THRESHOLD" ] || [ "$pend" -gt 0 ]; then
    setsid sh -c "
      flock -n /var/lock/sac-project.lock timeout -k 30 540 sh $ROOT/scripts/project.sh >> '$LOG' 2>&1
      flock -n /var/lock/sac-lineup.lock  timeout -k 30 540 sh $ROOT/scripts/lineup.sh  >> '$LOG' 2>&1
    " </dev/null >/dev/null 2>&1 &
    FIX="${FIX}정규화·명단을 다시 걸었다 · "
  fi
  if [ "$laps" -eq 0 ]; then
    # cron 이 1분 안에 다시 띄운다. 굳은 잠금만 치워 준다
    if [ -f /var/lock/sac-collect.lock ] && ! fuser /var/lock/sac-collect.lock >/dev/null 2>&1; then
      rm -f /var/lock/sac-collect.lock
      FIX="${FIX}주인 없는 수집 잠금을 치웠다 · "
    fi
    FIX="${FIX}수집은 예약(1분)이 다시 띄운다 · "
  fi
  [ -z "$FIX" ] && FIX="고칠 거리를 못 찾았다 — 사람이 봐야 한다"
fi

if [ "$WAS" = "ok" ]; then
  led ""
  led "- **밀림** \`$(ts)\` — 최악 **${WORST}분**(${STAGE})  ·  수집 ${raw} · 정규화 ${proj} · 명단 ${line} · 수집중 ${pend}"
  led "    - 왜: ${WHY%· }"
  led "    - 한 것: ${FIX%· }"
else
  led "    - \`$(ts)\` 아직 ${WORST}분(${STAGE}) — ${FIX%· }"
fi
say "★밀렸다 ${WORST}분(${STAGE})★ — ${WHY%· } → ${FIX%· }"
echo lag > "$STATE"

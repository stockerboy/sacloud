#!/bin/sh
# 밤새 IPL 배틀로그를 채운다 (2026-09-04 · 사장님 «내일아침까지 경기만 잘 채워놔»)
#
# ── 왜 판을 나누나
#   한 번에 21,508건을 걸어 두면 ★중간에 무슨 일이 나도 아침까지 아무도 모른다.★
#   ★한 판(4,000건)이 끝날 때마다 한 줄을 남기고★ 다음 판을 건다.
#   ★적재는 25건마다 하니★ 판 중간에 죽어도 받은 것은 남는다.
#
# ── ★한 판을 얼마로 잡나★
#   ⚠ ★4,000건이었다. 그러면 한 판이 세 시간이고 그동안 화면이 안 바뀐다★ —
#     투영(경기 → 라인업)은 ★판이 끝나야★ 돌기 때문이다.
#   ★1,500건(약 70분)으로 줄였다.★ 밤새 투영이 세 번 돌아 ★아침에 더 채워져 있다.★
#   ★받는 총량은 같다.★ 나누는 단위만 바꾼 것이다. `ROUND_LIMIT` 로 바꿀 수 있다.
#
# ── 판마다 하는 일
#   ① 배틀로그 한 판치 (간격 1500ms)
#   ② ★투영★ — 경기 → 라인업. ★받는 도중에는 안 한다★ (DB 를 두 번 두드린다)
#   ③ 한 줄 남기기
#
# ── ⚠ 멈추는 조건
#   ★첫 403·429 에서 CLI 가 스스로 멈추고 exit 1 을 낸다.★ 그러면 ★이 판도 멈춘다.★
#   ★우회하지 않는다.★ 아침에 사람이 본다.
set -u

cd "$(dirname "$0")/.." || exit 1
LOG="${1:-C:/Users/LG/AppData/Local/Temp/claude/overnight-collect.log}"
DB=$(grep -m1 '^DATABASE_URL' packages/db/.env.production.local | cut -d= -f2- | tr -d '"')
export DATABASE_URL="$DB"
export SACLOUD_DB_SESSION_POOLER=1
# ★한 판에 받을 배틀로그 수★ — 작을수록 투영이 자주 돌아 화면이 자주 바뀐다
ROUND_LIMIT="${ROUND_LIMIT:-1500}"
ROUNDS="${ROUNDS:-20}"

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
LOCK="${COLLECT_LOCK:-C:/Users/LG/AppData/Local/Temp/claude/barracks-collect.lock}"
if [ -f "$LOCK" ]; then
  old=$(cat "$LOCK" 2>/dev/null)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    say "★★이미 돌고 있다 (프로세스 ${old}) — 시작하지 않는다★★"
    say "  ★두 개가 돌면 원본을 두 배로 두드린다★ (D-266 · D-279)"
    exit 1
  fi
  say "  ⚠ 낡은 잠금을 지운다 (프로세스 ${old:-?} 는 없다)"
  rm -f "$LOCK"
fi
echo $$ > "$LOCK"
# ★어떻게 끝나든 잠금을 푼다★ — 정상 종료도, 끊겨도
trap 'rm -f "$LOCK"' EXIT INT TERM

say "★밤샘 수집 시작★ — ${ROUND_LIMIT}건씩 · 최대 ${ROUNDS}판 · 간격 1500ms · 첫 403 에서 멈춘다"
# ★잠금만 시험하고 싶을 때★ — `COLLECT_LOCK_TEST=1` 을 주면 여기서 끝낸다.
#
# ⚠ ★이 문이 없어서 잠금을 시험하다 실제 수집을 12초 띄웠다★ (2026-09-04).
#   남은 프로세스는 없었지만 ★운이 좋았던 것★ 이다.
#   ★막는 장치를 시험한다고 막으려던 일을 벌이면 안 된다.★
if [ "${COLLECT_LOCK_TEST:-0}" = "1" ]; then
  say "★잠금 시험이다 — 여기서 끝낸다 (요청을 한 건도 보내지 않았다)★"
  exit 0
fi


# ── ★★0판 · 발견 — 3~6월 목록을 뒤로 넘겨 받는다★★ (2026-09-04 · D-270)
#
#   ★한 프로세스 안에서 순서대로 한다.★ 목록 받기와 배틀로그 받기를
#   ★따로 띄우면 병영수첩을 동시에 두 배로 두드린다★ — 간격 1500ms 가 750ms 가 된다.
#   ★그건 D-266 을 어기는 것이다.★
#
#   ⚠ ★쪽 수로 끊으면 안 된다★ (2026-09-04 실측) —
#   ```
#   zzim1   68쪽에 ★3월 1일★    ← 한산한 클랜. 80쪽이면 남는다
#   lee2    81쪽에 ★7월 18일★   ← 바쁜 클랜. 80쪽으로는 한참 모자라다
#   ```
#   ★같은 80쪽인데 하나는 넘치고 하나는 모자란다.★ 그래서 ★날짜로 끊는다★ —
#   `--list-until 260305` (시즌 구분의 시작). `--list-pages 400` 은 ★끝없이 도는 것을 막는 한도★ 다.
#   ★배틀로그는 안 받는다★ (`--limit 0`) — 이 판은 「무엇이 있는지 알아내는」 판이다.
if [ "${SKIP_DISCOVER:-0}" != "1" ]; then
  say "── ★0판 · 발견★ (3~6월 목록 · ★260305 에 닿을 때까지★ · 배틀로그 안 받음)"
  pnpm --filter @sacloud/worker nexon barracks-collect \
    --league nolink --clans 43 --list-pages 400 --list-until 260305 --limit 0 --confirm \
    --health https://3rdcloud.my/api/health >> "$LOG" 2>&1
  dcode=$?
  found=$(grep -E '^  ① 목록 요청 ' "$LOG" | tail -1)
  say "  0판 발견 끝 (코드 ${dcode}) — ${found:-(요약을 못 읽었다)}"
  # ★받은 목록을 경기로 만든다★ — 이걸 해야 3~6월이 화면에 생긴다 (적재 창 3/5 · D-271)
  pnpm --filter @sacloud/worker nexon iplmatch-project --confirm >> "$LOG" 2>&1
  proj=$(grep -E '^고유경기=' "$LOG" | tail -1)
  say "  0판 투영 — ${proj:-(요약을 못 읽었다)}"
  if [ "$dcode" = "2" ]; then
    say "★★발견 중에 차단됐다 (403·429) — 밤을 끝낸다. 우회하지 않는다★★"
    exit 1
  fi
fi

round=0
while [ "$round" -lt "$ROUNDS" ]; do
  round=$((round + 1))
  say "── ${round}판 시작"

  # ── ★한 번 튄 것으로 밤을 끝내지 않는다★ (2026-09-04)
  #   1판을 190건에서 끝냈던 이유가 ★14ms 짜리 순간 끊김 하나★ 였다.
  #   ★차단(코드 2)은 즉시 끝낸다. 무거움·끊김(코드 3)은 5분 쉬고 세 번까지 다시 건다.★
  try=0
  code=0
  while [ "$try" -lt 3 ]; do
    try=$((try + 1))
    pnpm --filter @sacloud/worker nexon barracks-collect \
      --league nolink --clans 43 --limit "$ROUND_LIMIT" --confirm \
      --health https://3rdcloud.my/api/health >> "$LOG" 2>&1
    code=$?
    [ "$code" = "0" ] && break
    if [ "$code" = "2" ]; then
      say "★★차단됐다 (403·429) — 밤을 끝낸다. 우회하지 않는다★★"
      break
    fi
    say "  ${round}판 ${try}번째가 코드 ${code} 로 끝났다 (무겁거나 끊겼다) — ★5분 쉬고 다시 건다★"
    sleep 300
  done
  if [ "$code" != "0" ]; then
    say "★★${round}판을 못 끝냈다 (코드 ${code}) — 멈춘다★★"
    break
  fi

  got=$(grep -E '^계획 ' "$LOG" | tail -1)
  say "  ${round}판 수집: ${got:-(요약을 못 읽었다)}"

  # ── 투영. ★여기까지 와야 화면이 바뀐다★
  pnpm --filter @sacloud/worker nexon iplmatch-project --confirm >> "$LOG" 2>&1
  pnpm --filter @sacloud/worker nexon battlelog-lineup --league nolink --confirm >> "$LOG" 2>&1
  line=$(grep -E '^배틀로그경기=' "$LOG" | tail -1)
  say "  ${round}판 투영: ${line:-(요약을 못 읽었다)}"

  # 남은 것이 없으면 끝
  left=$(pnpm --filter @sacloud/worker nexon barracks-collect --league nolink --clans 0 \
           --limit 30000 --dry-run 2>/dev/null | grep -oE '받을 것 ★[0-9]+건★' | grep -oE '[0-9]+')
  say "  ${round}판 끝 — ★남은 것 ${left:-?}건★"
  if [ "${left:-1}" = "0" ]; then
    say "★남은 것이 없다 — 다 받았다★"
    break
  fi
done

say "★밤샘 수집 종료★ (${round}판)"

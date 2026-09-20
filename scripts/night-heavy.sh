#!/bin/sh
# ★★무거운 일은 새벽에만 한다★★ (2026-09-20 · 사장님)
#
# > 「사이트 중간중간 버벅대고 느린거 진짜 왜이러는거야」
# > 「아직도 느린데… 왜이래 진짜 사람들 많이 들어오면 어쩌려고 이러는거야」
#
# ── 왜 만들었나 (실측으로 잡았다)
#
#   기록을 채우는 배치가 낮에 돌면 ★사이트가 10~25배 느려진다.★
#   ```
#     배치 4개가 돌 때   검색 13~25초 · 경기상세 25초 (500 나기도)
#     배치를 멈춘 뒤     검색 0.4초   · 경기상세 0.4초
#   ```
#   ★사람이 쓰는 시간이 기록을 채우는 것보다 먼저다.★ 기록은 밤에 채우면 된다.
#
# ── 여기서 하는 일 (순서대로 · ★한 번에 하나씩★)
#   ```
#   ① 클랜 이름표 채우기      71만 줄 남음 — 제일 무겁다
#   ② MVP 설명 다시 만들기    「한 라운드 3킬」 을 과거 경기에도 붙인다
#   ```
#
# ⚠ ★동시에 돌리지 않는다.★ 둘이 겹치면 밤에도 사이트가 느려진다.
# ⚠ ★끝나는 시각을 지킨다★ — 아침 7시가 되면 하던 일을 접는다.
#   사람이 들어오기 시작하는 시각이다. 다음 밤에 이어서 하면 된다.
set -u
cd "$(dirname "$0")/.." || exit 1
. /root/sacloud.env 2>/dev/null || true

LOG="${NIGHT_LOG:-/root/log/night.log}"
STOP_HOUR="${NIGHT_STOP_HOUR:-7}"

say() { printf '%s | %s\n' "$(date '+%m-%d %H:%M')" "$1" | tee -a "$LOG"; }

# ★아침이 되었나★ — 되었으면 아무것도 시작하지 않는다
past_dawn() {
  h=$(date +%-H)
  [ "$h" -ge "$STOP_HOUR" ] && [ "$h" -lt 23 ]
}

if past_dawn; then
  say "낮이다 — 무거운 일은 하지 않는다 (${STOP_HOUR}시~23시)"
  exit 0
fi

say "★밤 작업 시작★ (아침 ${STOP_HOUR}시에 접는다)"

# ── ① 클랜 이름표 채우기 ──────────────────────────────────────────
#   한 판 1,000줄 · 약 1분. 아침이 되면 그 자리에서 멈춘다.
for i in $(seq 1 400); do
  past_dawn && { say "아침이다 — ① 을 여기서 접는다"; break; }
  out=$(pnpm --filter @sacloud/worker nexon clan-name-backfill --confirm --limit 1000 2>&1 | grep "읽음=" || true)
  say "  ① $out"
  case "$out" in
    *"읽음=0"*) say "  ① ★다 채웠다★"; break ;;
    '')         say "  ① 출력을 못 읽었다 — 30초 쉬고 다시"; sleep 30; continue ;;
  esac
  sleep 5
done

# ── ② MVP 설명 다시 만들기 ────────────────────────────────────────
#   ⚠ ★①이 끝난 뒤에만★ 한다. 둘이 겹치면 밤에도 사이트가 느려진다.
if past_dawn; then
  say "아침이다 — ② 는 다음 밤에 한다"
else
  say "  ② MVP 설명 다시 만들기 시작"
  pnpm --filter @sacloud/worker nexon player-hex-build --confirm --rebuild >> "$LOG" 2>&1
  say "  ② 끝 (코드 $?)"
fi

say "★밤 작업 끝★"

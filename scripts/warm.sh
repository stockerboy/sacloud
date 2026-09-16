#!/bin/sh
# ★캐시를 미리 데운다★ (2026-09-16 사장님: «버튼들 전부최적화해 개느려
#  눌러서 페이지넘어가거나 펼칠때마다 5초씩 걸려»).
#
# ── 무엇이 느렸나
#   화면(HTML)은 0.2초로 빠르다. 느린 것은 ★그 뒤에 부르는 자료★ 다.
#   개인랭킹 한 판이 ★차가울 때 11~13초★ 가 걸린다 (실측 2026-09-16).
#   한 번 돌고 나면 0.1초다 — DB 가 데워지기 때문이다.
#
#   응답에는 이미 엣지 캐시가 붙어 있다:
#       public, max-age=0, s-maxage=300, stale-while-revalidate=86400
#   그래서 ★누군가 한 번 밟아 두면★ 하루 동안 아무도 안 기다린다.
#
#   ⚠ 그런데 ★배포할 때마다 그 캐시가 통째로 비워진다.★
#     그래서 배포가 잦은 날에는 들어오는 사람마다 첫 방문자가 되어
#     10초씩 기다렸다. 사장님이 겪으신 «개느려» 가 바로 이것이다.
#
# ── 그래서
#   ★사람보다 먼저 우리가 밟는다.★ 5분마다 주요 주소를 한 번씩 부른다.
#   `s-maxage` 가 300초(5분)이므로 딱 맞물려 ★늘 따뜻한 상태★ 가 된다.
#   사람이 만나는 것은 언제나 캐시다.
#
# ── ★DB 를 더 때리지 않는다★
#   이 스크립트가 5분에 한 번 밟는 그 한 번이, 원래 사람이 밟았을 그 한 번이다.
#   캐시가 있는 동안 나머지 접속은 DB 에 닿지 않는다. 총량은 오히려 준다.
#
# ── 쓰는 법
#   sh scripts/warm.sh              # 운영(3rdcloud.my)
#   BASE=http://localhost:3000 sh scripts/warm.sh
#
#   크론 (VPS):
#   */5 * * * * flock -n /var/lock/sac-warm.lock sh /root/sacloud/scripts/warm.sh >> /var/log/sac-warm.log 2>&1

set -u

BASE="${BASE:-https://3rdcloud.my}"
# 한 주소가 오래 걸려도 전체가 멈추지 않게 — 차가운 개인랭킹이 13초였다
TIMEOUT="${TIMEOUT:-30}"

# ★열려 있는 리그만★ — 없는 리그를 부르면 404 를 캐시한다
LEAGUES="supply nolink sanply"

# 리그마다 밟을 자리. 자주 보는 것부터 — 중간에 끊겨도 중요한 것은 이미 데워진다
LEAGUE_PATHS="
ranks/players?page=1&weapon=all
ranks/clans
matches
hex-top
daily-podium
flags
ranks/form
ranks/players?page=1&weapon=sniper
ranks/players?page=1&weapon=rifle
ranks/players?page=2&weapon=all
"

# 리그와 상관없는 자리
FLAT_PATHS="
home/analyzed-matches
home/top
leagues
maps
"

hit() {
  # 시간과 캐시 상태를 같이 남긴다 — 로그만 보고 «데워졌나» 를 알 수 있어야 한다
  out=$(curl -s -o /dev/null -m "$TIMEOUT" \
        -w '%{time_total} %{http_code}' \
        -H 'Accept: application/json' \
        "$1" 2>/dev/null)
  echo "  $out  $1"
  #
  # ★한 박자 쉰다★ — 데우려다 DB 를 몰아치면 본말전도다.
  #   실측(2026-09-16): 쉼 없이 몰아치니 무거운 질의가 겹쳐 500 이 났다.
  #   40여 개 × 1초라도 5분 주기 안에 넉넉히 끝난다.
  sleep "${GAP:-1}"
}

echo "== 캐시 데우기 $(date '+%F %T') · $BASE"

for p in $FLAT_PATHS; do
  hit "$BASE/api/$p"
done

for lg in $LEAGUES; do
  for p in $LEAGUE_PATHS; do
    hit "$BASE/api/leagues/$lg/$p"
  done
done

# ── ★1위 선수·클랜의 상세★ ──────────────────────────────────
#   첫 화면의 «예시» 가 1위의 상세를 펼쳐 보여 준다 (육각형·그래프).
#   그 두 질의가 ★차가울 때 4초★ 다 (실측). 랭킹만 데워 놓으면 예시를 누른
#   사람이 그 4초를 그대로 맞는다.
#
#   1위는 날마다 바뀐다 — 랭킹을 먼저 읽어 1위를 뽑은 뒤 그 상세를 밟는다.
#   뽑아내는 데 node 를 쓴다 (VPS 에 이미 있다). 없으면 조용히 건너뛴다.
first_of() {
  # $1 주소 · $2 꺼낼 길 (예: data.0.player.id)
  curl -s -m "$TIMEOUT" "$1" 2>/dev/null | node -e '
    let raw = ""
    process.stdin.on("data", (d) => (raw += d))
    process.stdin.on("end", () => {
      try {
        let v = JSON.parse(raw)
        for (const k of process.argv[1].split(".")) v = v?.[k]
        if (typeof v === "string" && v !== "") process.stdout.write(v)
      } catch {}
    })
  ' "$2" 2>/dev/null
}

if command -v node >/dev/null 2>&1; then
  for lg in $LEAGUES; do
    pid=$(first_of "$BASE/api/leagues/$lg/ranks/players?page=1&weapon=all" "data.0.player.id")
    [ -n "$pid" ] && hit "$BASE/api/leagues/$lg/players/$pid"
    cs=$(first_of "$BASE/api/leagues/$lg/ranks/clans?size=3" "data.0.clan.slug")
    [ -n "$cs" ] && hit "$BASE/api/leagues/$lg/clans/$cs/show"

    # ★첫 화면 예시가 고정으로 쓰는 클랜★ (2026-09-16 사장님 «tsarntc 클랜 걸어»)
    if [ "$lg" = "supply" ]; then
      hit "$BASE/api/leagues/$lg/clans/sorentolove/show"
    fi

    # ★경기 상세★ — 예시가 스코어보드를 그리려면 이걸 받아야 한다
    mid=$(first_of "$BASE/api/leagues/$lg/matches" "data.0.id")
    lcid=$(first_of "$BASE/api/leagues/$lg/matches" "data.0.league_clan.league_clan_id")
    if [ -n "$mid" ] && [ -n "$lcid" ]; then
      hit "$BASE/api/leagues/$lg/matches/$mid?league_clan_id=$lcid"
    fi
  done
else
  echo "  (node 가 없어 1위 상세는 건너뛴다)"
fi

# ⚠ ★화면(HTML)은 데우지 않는다★ (2026-09-16 실측).
#   사이트가 아직 비공개라 로그인 없는 접속은 503 을 받는다.
#   그 503 이 엣지에 얹히면 ★열고 나서도 모두가 «비공개» 를 본다.★
#   화면은 어차피 0.2초로 빠르다 — 느린 것은 자료 쪽이다.
#   사이트를 공개로 돌린 뒤에 이 줄을 되살린다:
#     for p in / /league/supply/home /board/hot; do hit "$BASE$p"; done

echo "== 끝 $(date '+%F %T')"

# ★★수집 자물쇠 — DB 임대(lease)★★ (2026-09-04 · Pre-Part 0 · 사장님 지시)
#
# ══ ★왜 세 번째로 다시 쓰는가★ ══
#
# 자물쇠가 ★세 번 뚫렸다.★ 셋 다 같은 뿌리다 — ★자물쇠가 이 컴퓨터 안에만 있었다.★
#
#   1차 (D-279)   멈추는 도구가 ★셸만 죽이고 아래 일꾼을 남겼다.★
#                 두 시간 반 동안 원본을 두 배로 두드렸다
#                 → 잠금 ★파일★ 을 달았다
#
#   2차           잠금 파일의 ★셸 번호★ 만 봤다. 셸이 죽고 일꾼만 살아남자
#                 다음 예약이 「낡은 잠금이네」 하고 지우고 새로 시작했다
#                 → ★프로세스를 직접 세는★ 것으로 바꿨다
#
#   ★3차 (2026-09-04 · 실측)★
#                 ★프로세스를 세는 순간이 하필 「쉬는 중」이었다.★
#                 `collect-3leagues.sh` 두 판이 ★10:13 과 12:23 부터 나란히 돌았다.★
#                 로그가 섞였고 `battlelog-lineup` 이 동시에 두 개 떠 있었다
#
# ══ ★프로세스를 세는 방식은 원리적으로 못 고친다★ ══
#
# 한 판이 도는 15분 중 ★일꾼이 하나도 없는 구간★ 이 길다 —
# ```
# 목록·배틀로그 받는 중   node 가 있다   → 「돌고 있다」
# ★투영 중★              이름이 다르다  → ★「안 돈다」★
# ★쉬는 중★              node 가 없다   → ★「안 돈다」★
# ```
# ★그 구간과 「진짜 안 도는 것」을 구별할 방법이 없다.★
# 예약이 하필 그때 뜨면 통과한다. 3차가 정확히 그것이었다.
#
# ══ ★그래서 질문을 바꾼다★ ══
#
# ```
# ★전★  「도는 프로세스가 있나」  ← 상태를 ★관찰★ 한다. 관찰에는 틈이 있다
# ★후★  「내가 임대를 쥐었나」    ← 상태를 ★선언★ 한다. 틈이 없다
# ```
#
# 임대는 ★DB 한 문장★ 으로 잡는다 (`INSERT … ON CONFLICT … WHERE`).
# 두 판이 같은 밀리초에 달려들어도 ★행 잠금이 순서를 세우고 정확히 하나만★ 성공한다.
# ★프로세스가 몇 겹이든 · 쉬고 있든 · 무슨 이름이든 상관이 없다.★
#
# ⚠ ★옛 방식을 지우지 않았다★ (`CLAUDE.md` 1-4) —
#   `scripts/collect-lock-processcount.sh.old` 에 그대로 있다.
#
# ══ 쓰는 법 ══
#
#   . scripts/collect-lock.sh      # say() 를 먼저 정의해 두고 부른다
#   collect_lock_acquire           # 못 잡으면 여기서 exit 0 한다
#   # 그 뒤 $COLLECT_LEASE_OWNER 를 --lease-owner 로 넘긴다
#
# ⚠ ★못 잡았을 때 exit 1 이 아니라 exit 0 이다.★
#   「남이 돌고 있어서 물러났다」는 ★고장이 아니라 정상 동작★ 이다.
#   여기서 빨간 줄을 쌓으면 ★진짜 고장이 그 속에 묻힌다.★

WORKER_RUN="pnpm --filter @sacloud/worker nexon"
COLLECT_LEASE_TTL="${COLLECT_LEASE_TTL:-1200}"   # ★20분★ — 한 사이클(15분)보다 넉넉해야 한다
COLLECT_LEASE_OWNER=""

# ★임대를 잡는다.★ 못 잡으면 여기서 판이 끝난다
collect_lock_acquire() {
  out=$($WORKER_RUN collect-lease acquire \
          --ttl "$COLLECT_LEASE_TTL" \
          --pid "$$" \
          --command "$(basename "$0")" 2>&1)
  code=$?

  # ★9 = 남이 쥐고 있다★ (0 성공 · 1 오류 · 9 막힘)
  if [ "$code" = "9" ]; then
    say "★★수집 임대를 남이 쥐고 있다 — 이번 판은 시작하지 않는다★★"
    echo "$out" | grep -E '★|barracks-collect ·' | sed 's/^/    /'
    exit 0
  fi
  if [ "$code" != "0" ]; then
    # ★모르면 시작하지 않는다.★ 확인 못 한 채 시작하는 것이 지금까지 사고의 원인이었다
    say "★임대를 잡지 못했다 (코드 ${code}) — 시작하지 않는다★"
    echo "$out" | tail -5 | sed 's/^/    /'
    exit 1
  fi

  COLLECT_LEASE_OWNER=$(echo "$out" | sed -n 's/^OWNER=//p' | tail -1)
  if [ -z "$COLLECT_LEASE_OWNER" ]; then
    say "★임대는 잡혔다는데 주인 번호를 못 읽었다 — 시작하지 않는다★"
    exit 1
  fi

  say "★임대를 잡았다★ (${COLLECT_LEASE_TTL}초 · 주인 ${COLLECT_LEASE_OWNER})"

  # ★어떻게 끝나든 반납한다★ — 정상 종료도, 끊겨도.
  #   ⚠ 반납은 ★빨리 풀리게 하는 것★ 이지 안전의 근거가 아니다.
  #     반납을 못 하고 죽어도 ★만료가 받아 준다.★
  trap 'collect_lock_release' EXIT INT TERM
}

collect_lock_release() {
  [ -n "$COLLECT_LEASE_OWNER" ] || return 0
  $WORKER_RUN collect-lease release --owner "$COLLECT_LEASE_OWNER" >/dev/null 2>&1
  COLLECT_LEASE_OWNER=""
}

# ★도는 동안 임대를 이어 쥔다.★ 잃었으면 1 을 돌려준다 — 그때는 판을 끝내야 한다
#
# ⚠ 평상시에는 `barracks-collect` 가 ★스스로★ 갱신한다 (`--lease-owner`).
#   이 함수는 ★그 명령 바깥의 긴 구간★(투영·쉼)을 덮는다 —
#   ★3차 사고가 난 자리가 바로 그 구간이다.★
collect_lock_renew() {
  [ -n "$COLLECT_LEASE_OWNER" ] || return 0
  $WORKER_RUN collect-lease renew --owner "$COLLECT_LEASE_OWNER" --ttl "$COLLECT_LEASE_TTL" \
    >/dev/null 2>&1
  code=$?
  if [ "$code" != "0" ]; then
    say "★★임대를 잃었다 — 이 판을 끝낸다. 남이 이미 수집 중이다★★"
    return 1
  fi
  return 0
}

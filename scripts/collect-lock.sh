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
# 심장박동 백그라운드의 셸 번호. 반납할 때 같이 멈춘다
COLLECT_HEARTBEAT_PID=""
# ★임대를 마지막으로 「확인」한 시각★ (epoch 초) — 갱신에 성공한 순간이다.
#   DB 가 안 닿는 동안 이 값이 안 움직이고, ★TTL 을 넘기면 안전하게 멈춘다★
COLLECT_LEASE_LAST_OK=""

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

  COLLECT_LEASE_LAST_OK=$(date +%s)
  say "★임대를 잡았다★ (${COLLECT_LEASE_TTL}초 · 주인 ${COLLECT_LEASE_OWNER})"

  # ══ ★★심장박동 — 도는 내내 따로 갱신한다★★ (2026-09-04 후속) ══
  #
  #   ⚠ ★이것 없이는 구멍이 남는다.★ 실측(16:45) —
  #     갱신이 11분째 멈춰 있는데 수집은 돌고 있었다.
  #     `barracks-collect` 는 요청 10건마다 갱신하고, 셸은 바퀴 끝에만 갱신한다.
  #     그 사이의 ★투영·라인업·쉰은 갱신이 없는 구간★ 이다.
  #     그 구간이 TTL(20분)을 넘기면 ★살아 있는 판의 임대가 남에게 넘어간다.★
  #     ★그게 곧 두 판이다.★
  #
  #   ★그래서 단계에 기대지 않고 시계에 기대는 갱신을 따로 둔다.★
  #   TTL의 1/4 마다 둔다 — 한 번 놓쳐도 만료 전에 세 번 더 기회가 있다.
  #
  #   ⚠ ★심장박동은 「살아 있다」가 아니라 「셸이 살아 있다」만 말한다.★
  #     셸이 죽으면 이 백그라운드도 같이 죽고(trap), 임대는 만료로 풀린다.
  COLLECT_HEARTBEAT_EVERY=$((COLLECT_LEASE_TTL / 4))
  (
    while :; do
      sleep "$COLLECT_HEARTBEAT_EVERY"
      $WORKER_RUN collect-lease renew --owner "$COLLECT_LEASE_OWNER" --ttl "$COLLECT_LEASE_TTL" >/dev/null 2>&1
      hb=$?
      if [ "$hb" = "0" ]; then
        COLLECT_LEASE_LAST_OK=$(date +%s)
        continue
      fi
      if [ "$hb" = "9" ]; then
        # ★진짜로 잃었다★ — 남이 가져갔다. ★부모까지 끝낸다★
        say "★★임대 상실 — 남이 가져갔다. 이 판을 끝낸다★★"
        kill -TERM $$ 2>/dev/null
        exit 0
      fi
      # ★3 (또는 그 밖) = DB 를 못 물어봤다. 잃은 것이 아니다★
      blind=$(( $(date +%s) - COLLECT_LEASE_LAST_OK ))
      say "★DB 연결 실패 — 임대 상태 확인 불가★ (${blind}초째 · ★잃은 것이 아니다★)"
      if [ "$blind" -ge "$COLLECT_LEASE_TTL" ]; then
        say "★만료(${COLLECT_LEASE_TTL}초)를 넘겨서도 확인이 안 된다 — 안전하게 끝낸다★"
        kill -TERM $$ 2>/dev/null
        exit 0
      fi
    done
  ) &
  COLLECT_HEARTBEAT_PID=$!
  say "  심장박동 ${COLLECT_HEARTBEAT_EVERY}초마다 (셸 ${COLLECT_HEARTBEAT_PID})"

  # ★어떻게 끝나든 반납한다★ — 정상 종료도, 끊겨도.
  #   ⚠ 반납은 ★빨리 풀리게 하는 것★ 이지 안전의 근거가 아니다.
  #     반납을 못 하고 죽어도 ★만료가 받아 준다.★
  # ★EXIT 와 INT/TERM 을 갈라야 한다★ (2026-09-05 실측)
  #
  #   ⚠ 셋을 한 줄로 묶었더니 ★TERM 을 받고도 셸이 안 끝났다.★
  #     POSIX sh 는 신호 처리기를 돌린 뒤 ★하던 자리로 돌아온다★ —
  #     그래서 임대만 반납되고(주인 번호가 빈 채로) 루프가 계속 돌았다.
  #     그 뒤 `barracks-collect` 가 매번 ★「임대 미획득」★ 으로 거절했다.
  #     ★반납했으면 끝내야 한다.★ 안 그러면 주인 없는 판이 남는다
  trap 'collect_lock_release' EXIT
  trap 'collect_lock_release; exit 0' INT TERM
}

collect_lock_release() {
  # ★심장박동을 먼저 멈춘다★ — 안 그러면 반납한 임대를 다시 살린다
  if [ -n "${COLLECT_HEARTBEAT_PID:-}" ]; then
    kill "$COLLECT_HEARTBEAT_PID" 2>/dev/null
    COLLECT_HEARTBEAT_PID=""
  fi
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

  # ══ ★★셋을 가른다★★ (2026-09-04 · O-055-1 · 사장님 지시) ══
  #
  #   ★전★  0 이 아니면 전부 「임대를 잃었다」
  #          → ★DB 가 잠깐 끊기자 멀쩡한 판이 죽었다★ (2026-09-04 20:30)
  #          → ★4시간 43분 동안 IPL 이 한 건도 안 들어왔다★
  #          → 게다가 로그가 «남이 이미 수집 중이다» 라고 ★거짓말을 했다★
  #   ★후★  0 갱신됨 · ★9 임대 상실★ · ★3 DB 연결 실패★
  #
  #   ★「모른다」는 「잃었다」가 아니다.★ 만료 전까지는 계속 돈다 —
  #   그 사이에 DB 가 살아나면 그대로 이어 간다.
  if [ "$code" = "0" ]; then
    COLLECT_LEASE_LAST_OK=$(date +%s)
    return 0
  fi

  if [ "$code" = "9" ]; then
    say "★★임대 상실 — 이 판을 끝낸다. 남이 이미 수집 중이다★★"
    return 1
  fi

  # ★3 (또는 그 밖) = 물어보지도 못했다★
  blind=$(( $(date +%s) - COLLECT_LEASE_LAST_OK ))
  say "★DB 연결 실패 — 임대 상태 확인 불가★ (${blind}초째 · ★잃은 것이 아니다★)"
  if [ "$blind" -ge "$COLLECT_LEASE_TTL" ]; then
    # ⚠ ★영원히 버티면 안 된다.★ 만료를 넘기면 남이 진짜로 가져갈 수 있고,
    #   그때부터 계속 도는 것은 ★두 판★ 이다
    say "★만료(${COLLECT_LEASE_TTL}초)를 넘겨서도 확인이 안 된다 — 안전하게 끝낸다★"
    return 1
  fi
  say "  만료까지 $((COLLECT_LEASE_TTL - blind))초 남았다 — 계속 돈다"
  return 0
}

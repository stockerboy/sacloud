# ★수집 자물쇠★ — 두 곳(`autocollect.sh` · `collect-3leagues.sh`)이 같이 쓴다 (2026-09-04)
#
# ══ ★왜 이 파일이 따로 생겼나★ ══
#
# 잠금이 ★두 번 뚫렸다.★ 같은 구멍이다.
#
#   1차 (D-279)  멈추는 도구가 ★셸만 죽이고 그 아래 프로세스는 남겼다.★
#                두 시간 반 동안 원본을 두 배로 두드렸다.
#                → 잠금 파일을 달았다. ★그것으로 부족했다.★
#
#   2차 (오늘)   잠금 파일에 적힌 ★셸 번호★ 로만 「돌고 있나」를 봤다.
#                셸은 죽고 ★그 아래 수집 프로세스만 살아남자★,
#                다음 예약 실행이 「낡은 잠금이네」 하고 지우고 새로 시작했다.
#                ★nolink 와 supply 가 동시에 돌았다.★ (실측)
#
# ══ ★그래서 무엇을 바꾸나★ ══
#
#   ```
#   ★전★  잠금 파일에 적힌 번호가 살아 있나         ← 셸을 본다
#   ★후★  ★실제로 barracks-collect 가 돌고 있나★   ← 일하는 놈을 직접 센다
#   ```
#
#   ★자물쇠는 이름표가 아니라 가게 안을 봐야 한다.★
#
# ══ 쓰는 법 ══
#
#   . scripts/collect-lock.sh      # say() 를 먼저 정의해 두고 부른다
#   collect_lock_acquire           # 못 잡으면 여기서 exit 1 한다
#
# ⚠ ★낡은 잠금은 스스로 푼다.★ 프로세스가 죽으면서 잠금만 남으면 영영 못 돌게 된다 —
#   그건 더 나쁘다. 다만 ★「돌고 있는 게 정말 없는지」를 확인한 뒤에★ 푼다.

COLLECT_LOCK_FILE="${COLLECT_LOCK:-C:/Users/LG/AppData/Local/Temp/claude/barracks-collect.lock}"

# ★실제로 도는 수집 프로세스 개수★ — 잠금 파일이 아니라 프로세스 목록을 본다.
#
# `tasklist` 는 명령줄을 안 보여 줘서 못 쓴다. PowerShell 로 명령줄까지 본다.
# 못 세면 ★0 이 아니라 -1 을 돌려준다★ — 「모르는 것」과 「없는 것」은 다르다.
#
# ⚠ ★자기 자신을 세면 안 된다★ (2026-09-04 · 만들자마자 걸린 함정).
#   세러 띄운 PowerShell 의 ★명령줄에도 `barracks-collect` 라는 글자가 들어 있다.★
#   그래서 아무것도 안 도는데 ★1개 돌고 있다★ 고 나와서 영영 시작을 못 했다.
#   ★세는 놈(`Get-CimInstance` 가 명령줄에 있는 프로세스)은 빼고 센다.★
#
#   ★한 겹 더 좁힌다★ — 진짜 수집기는 `node.exe` 나 `cmd.exe` 로만 뜬다
#   (pnpm → cmd → tsx → node). ★셸(`bash.exe`)이나 PowerShell 은 수집기가 아니다.★
#   이 셸들은 명령줄에 스크립트 내용이 통째로 들어가서 ★글자만 보면 걸린다.★
collect_running_count() {
  n=$(powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { (\$_.Name -eq 'node.exe' -or \$_.Name -eq 'cmd.exe') -and \$_.CommandLine -match 'barracks-collect' -and \$_.CommandLine -notmatch 'Get-CimInstance' }).Count" 2>/dev/null | tr -d '\r' | tr -d ' ')
  case "$n" in
    ''|*[!0-9]*) echo -1 ;;
    *) echo "$n" ;;
  esac
}

collect_lock_acquire() {
  live=$(collect_running_count)

  # ★모르면 시작하지 않는다.★ 확인 못 한 채 시작하는 것이 지금까지 사고의 원인이었다
  if [ "$live" = "-1" ]; then
    say "★돌고 있는 수집기가 있는지 못 셌다 — 시작하지 않는다★"
    say "  ★모르는 채 시작하면 두 개가 될 수 있다.★ 확인이 안 되면 안 하는 쪽이 맞다"
    exit 1
  fi

  # ⚠ ★숫자는 「수집기 개수」가 아니다★ — 한 번 실행이 `pnpm → cmd → tsx → node` 로
  #   ★네 겹★ 이라 4 로 보인다. ★0 인가 아닌가만 뜻이 있다.★
  if [ "$live" -gt 0 ]; then
    say "★★수집기가 이미 돌고 있다 (프로세스 ${live}겹) — 시작하지 않는다★★"
    say "  ★두 개가 돌면 1500ms 약속이 750ms 가 된다★ (D-266 · D-279)"
    exit 1
  fi

  if [ -f "$COLLECT_LOCK_FILE" ]; then
    old=$(cat "$COLLECT_LOCK_FILE" 2>/dev/null)
    if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
      say "★★잠금을 쥔 셸(${old})이 아직 살아 있다 — 시작하지 않는다★★"
      exit 1
    fi
    say "  ⚠ 낡은 잠금을 지운다 (셸 ${old:-?} 없음 · 도는 수집기 0개 확인함)"
    rm -f "$COLLECT_LOCK_FILE"
  fi

  echo $$ > "$COLLECT_LOCK_FILE"
  # ★어떻게 끝나든 잠금을 푼다★ — 정상 종료도, 끊겨도
  trap 'rm -f "$COLLECT_LOCK_FILE"' EXIT INT TERM
}

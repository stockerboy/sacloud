/**
 * 리포트 렌더링 — 시뮬레이션 결과를 사람이 읽는 마크다운으로.
 *
 * 표를 예쁘게 만드는 것이 목적이 아니다. **왜 그 순위인지**가 보여야 한다.
 */
import type { ClanLeaderRow, LeaderRow } from './season.js'

/* 느슨한 타입 — main 이 조립한 번들을 그대로 받는다 */
type Bundle = Record<string, any>

const f = (n: number, digits = 1): string => n.toFixed(digits)

function table(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const head = `| ${headers.join(' | ')} |`
  const sep = `|${headers.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
  return [head, sep, body].join('\n')
}

export function renderReport(
  b: Bundle,
  explainVersus: (higher: LeaderRow, lower: LeaderRow) => string,
  rankReason: (row: LeaderRow, field: readonly LeaderRow[]) => string,
  clanRankReason: (row: ClanLeaderRow) => string,
): string {
  const p = b.primary
  const rows: LeaderRow[] = p.personalRows
  const clanRows: ClanLeaderRow[] = p.clanRows
  const out: string[] = []
  const w = (s = ''): void => {
    out.push(s)
  }

  w('# RATING_SIMULATION.md — 3개월 시즌 설계 검증')
  w()
  w('> **운영 코드가 아니다.** `packages/rating`(현행 1500 기준)은 이번 작업에서 건드리지 않았고,')
  w('> 운영 DB replay 도 하지 않았다. 여기 있는 것은 "3000 기준 · 구성 보너스" **제안 설계안**을')
  w('> 검증하기 위한 별도 구현이다 — `scripts/rating-simulation/`.')
  w()
  w('재현:')
  w()
  w('```bash')
  w(`pnpm rating:simulate --seed ${b.options.seed} --runs ${b.options.runs} --players ${b.options.players} --clans ${b.options.clans} --season-days ${b.options.seasonDays}`)
  w('```')
  w()
  w(`결정성 확인 — 같은 시드 재실행 결과 일치: **${b.deterministic ? 'OK' : 'FAIL'}**`)
  w()

  /* ---------------------------------------------------------------- 가정 --- */
  w('---')
  w()
  w('## 1. 가정과 공식')
  w()
  w('### 개인')
  w()
  w('```')
  w('baseline           3000')
  w(`K                  ${b.personal.k}`)
  w(`퍼포먼스 비중       ±${(b.personal.performanceWeight * 100).toFixed(0)}%`)
  w(`신뢰도 적용        ${b.personal.confidenceMode}`)
  w('')
  w('expected  = 1 / (1 + 10^((Ro - R)/400))')
  w('baseDelta = K × (actual - expected)')
  w('delta     = baseDelta + |baseDelta| × 퍼포먼스비중 × perf(-1~+1)')
  w('display   = 3000 + (internal - 3000) × confidence      (display 모드)')
  w('```')
  w()
  w('퍼포먼스를 **곱하지 않고 더한다.** 곱하면 패배했을 때 잘한 사람이 더 깎이는 뒤집힌 결과가 나온다.')
  w('그래서 승리는 더 받고, 패배는 덜 잃는 방향으로만 움직인다.')
  w()
  w('신뢰도 구간 — 1~30 40% · 31~60 55% · 61~90 70% · 91~120 85% · 121~149 95% · 150+ 100%.')
  w('150판 이후로는 더 해도 올라가지 않는다 (판수 박치기 차단 지점).')
  w()
  w('### 클랜')
  w()
  w('```')
  w(`K                  ${b.clanConstants.k}   (동급전 ±30)`)
  w('구성 승리 보너스    클1 +0 · 클2 +3 · 클3 +6 · 클4 +9 · 클5 +12   =  (n-1) × 3')
  w('패배 구성 패널티    없음')
  w('상대 구성 비교      없음')
  w('반복 상대 감쇠      없음')
  w('official 게이트     없음 — 정상 5v5 는 전부 점수 대상')
  w('```')
  w()
  w('### 모집단')
  w()
  w(`가상 선수 ${rows.length}명(archetype ${b.primary.archetypes.length}명 포함) · 클랜 ${clanRows.length}개 · 경기 ${p.matches}건 · ${b.options.seasonDays}일.`)
  w()
  w('선수마다 **hidden skill** 을 따로 두고, rating 공식은 그 값을 절대 보지 못한다.')
  w('경기 결과(승패·킬·데스·MVP)로만 추정한다. 그래야 "잘하는 사람이 위에 오는가"가 동어반복이 아니다.')
  w()

  /* -------------------------------------------------------------- 핵심 판정 --- */
  w('---')
  w()
  w('## 2. 실력 재현도')
  w()
  w(`표시 순위 ↔ 실제 실력 순위 **스피어만 상관 ${f(p.correlation, 3)}**`)
  w()
  w(
    table(
      ['시드', '상관', '1위 표시점수', 'FAIL 이상', '클랜 순증', '경기'],
      b.monteCarlo.map((m: any) => [m.seed, f(m.correlation, 3), f(m.topDisplayed, 0), m.failAnomalies, f(m.clanCreated, 0), m.matches]),
    ),
  )
  w()
  const corrs = b.monteCarlo.map((m: any) => m.correlation)
  const mean = corrs.reduce((a: number, x: number) => a + x, 0) / corrs.length
  w(`${b.monteCarlo.length}개 시드 평균 상관 **${f(mean, 3)}** · 최소 ${f(Math.min(...corrs), 3)} · 최대 ${f(Math.max(...corrs), 3)}`)
  w()

  /* ------------------------------------------------------------- 개인 1~100 --- */
  w('---')
  w()
  w('## 3. 개인 랭킹 1~100')
  w()
  w(
    table(
      ['#', '선수', 'arch', '역할', '판', '승', '패', '승률', 'KD', 'MVP', 'MVP%', '평균상대', '강자전', '업셋', 'internal', '신뢰', '표시', '(실제실력)'],
      rows.slice(0, 100).map((r) => [
        r.rank,
        r.name,
        r.archetype,
        r.role,
        r.games,
        r.wins,
        r.losses,
        f(r.winRate),
        f(r.kd),
        r.mvpCount,
        f(r.mvpRate, 0),
        f(r.avgOpponentRating, 0),
        r.strongOpponentGames,
        r.upsetWins,
        f(r.internal, 0),
        f(r.confidence * 100, 0) + '%',
        f(r.displayed, 0),
        f(r.latentSkill, 0),
      ]),
    ),
  )
  w()
  w('> 맨 오른쪽 `(실제실력)` 은 **공식이 볼 수 없는 값**이다. 검증용으로만 출력한다.')
  w()

  /* --------------------------------------------------------------- 순위 이유 --- */
  w('---')
  w()
  w('## 4. 왜 이 순위인가 (상위 20)')
  w()
  for (const r of rows.slice(0, 20)) {
    w(`**${r.rank}위 ${r.name}** — ${rankReason(r, rows)}`)
    w()
  }

  if (rows.length >= 2) {
    w('### 1위 vs 2위')
    w()
    w('```')
    w(`1위 ${rows[0]!.name}: ${rows[0]!.games}판 ${f(rows[0]!.winRate)}% KD ${f(rows[0]!.kd)} 평균상대 ${f(rows[0]!.avgOpponentRating, 0)}`)
    w(`2위 ${rows[1]!.name}: ${rows[1]!.games}판 ${f(rows[1]!.winRate)}% KD ${f(rows[1]!.kd)} 평균상대 ${f(rows[1]!.avgOpponentRating, 0)}`)
    w('```')
    w()
    w(`차이: ${explainVersus(rows[0]!, rows[1]!)}`)
    w()
  }

  /* ------------------------------------------------------------- archetype --- */
  w('---')
  w()
  w('## 5. Archetype 검증')
  w()
  w(
    table(
      ['코드', '기대', '판', '승률', 'KD', '평균상대', '표시', '순위', '판정'],
      b.primary.archetypes.map((a: any) => {
        const r: LeaderRow | null = a.row
        if (!r) return [a.spec.code, a.spec.expectation, '-', '-', '-', '-', '-', '미출전', '—']
        const total = rows.length
        const topPct = (r.rank / total) * 100
        let verdict = '—'
        const code = a.spec.code
        if (code === 'A') verdict = r.rank <= total * 0.2 ? '**FAIL** 판수만으로 상위' : 'PASS'
        else if (code === 'G' || code === 'K') verdict = r.rank <= 10 ? '**FAIL** KD/MVP만으로 top10' : 'PASS'
        else if (code === 'E' || code === 'F' || code === 'P') verdict = r.rank <= 3 ? 'WARN 신뢰도 부족한데 최상위' : 'PASS'
        else if (code === 'L' || code === 'B' || code === 'N') verdict = r.rank <= total * 0.25 ? 'PASS' : '**FAIL** 상위권이어야 한다'
        else if (code === 'I') verdict = r.rank <= total * 0.1 ? 'WARN 약자 위주인데 상위' : 'PASS'
        return [
          code,
          a.spec.expectation,
          r.games,
          f(r.winRate),
          f(r.kd),
          f(r.avgOpponentRating, 0),
          f(r.displayed, 0),
          `${r.rank}/${total} (상위 ${f(topPct, 0)}%)`,
          verdict,
        ]
      }),
    ),
  )
  w()

  /* --------------------------------------------------------------- 이상 사례 --- */
  w('---')
  w()
  w('## 6. 이상 탐지')
  w()
  if (p.anomalies.length === 0) {
    w('탐지된 이상 없음.')
  } else {
    w(table(['심각도', '코드', '내용'], p.anomalies.map((a: any) => [a.severity.toUpperCase(), a.code, a.message])))
  }
  w()
  w('### 순위 역전 (판수·승률 모두 낮은데 위)')
  w()
  const inv = p.inversions
  const counts = {
    PASS: inv.filter((i: any) => i.verdict === 'PASS').length,
    QUESTIONABLE: inv.filter((i: any) => i.verdict === 'QUESTIONABLE').length,
    FAIL: inv.filter((i: any) => i.verdict === 'FAIL').length,
  }
  w(`총 ${inv.length}쌍 — PASS ${counts.PASS} · QUESTIONABLE ${counts.QUESTIONABLE} · **FAIL ${counts.FAIL}**`)
  w()
  /* FAIL 을 먼저 보여 준다 — 문제부터 눈에 띄어야 한다 */
  const rankOf = (verdict: string): number => (verdict === 'FAIL' ? 0 : verdict === 'QUESTIONABLE' ? 1 : 2)
  const shown = [...inv].sort((a: any, b: any) => rankOf(a.verdict) - rankOf(b.verdict)).slice(0, 25)
  if (shown.length > 0) {
    w(
      table(
        ['판정', '위', '아래', '근거'],
        shown.map((i: any) => [
          i.verdict,
          `${i.higher.rank}위 ${i.higher.name} (${i.higher.games}판 ${f(i.higher.winRate)}%)`,
          `${i.lower.rank}위 ${i.lower.name} (${i.lower.games}판 ${f(i.lower.winRate)}%)`,
          i.reason,
        ]),
      ),
    )
  }
  w()

  /* ------------------------------------------------------------ 포지션 편향 --- */
  w('---')
  w()
  w('## 7. 포지션 편향')
  w()
  w(
    table(
      ['역할', '인원', '평균 표시', '평균 실제실력', '과대평가(표시-실력)', 'top20 비중'],
      p.roleBias.map((r: any) => [r.role, r.count, f(r.avgDisplayed, 0), f(r.avgLatent, 0), f(r.avgOverRating, 1), f(r.top20Share, 0) + '%']),
    ),
  )
  w()
  w('경기 생성기는 **스나이퍼에게 일부러 킬·KD·MVP 이점을 준다**(킬 ×1.22 · MVP ×1.35).')
  w('그 상태에서 표시 점수가 역할별로 얼마나 벌어지는지가 퍼포먼스 공식의 편향 지표다.')
  w()
  w('### 퍼포먼스 비중별')
  w()
  w(
    table(
      ['비중', '실력 상관', '스나-서포트 격차', '스나 top20 비중', 'FAIL 이상'],
      b.performanceSweep.map((s: any) => [
        `±${(s.weight * 100).toFixed(0)}%`,
        f(s.correlation, 3),
        f(s.sniperEdge, 1),
        f(s.sniperTop20Share, 0) + '%',
        s.anomalies,
      ]),
    ),
  )
  w()

  /* ------------------------------------------------------------------ K값 --- */
  w('---')
  w()
  w('## 8. K 값')
  w()
  w(
    table(
      ['K', '실력 상관', '1위', '상위1%', '중앙값', '최대-최소', 'FAIL 이상'],
      b.kSweep.map((s: any) => [s.k, f(s.correlation, 3), f(s.top, 0), f(s.p99, 0), f(s.p50, 0), f(s.spread, 0), s.anomalies]),
    ),
  )
  w()
  w('목표 체감 — 3000 평균권 · 3500~3900 강함 · 4000+ 랭커 · 시즌 최상위 4300±200.')
  w()

  /* ------------------------------------------------------------- 신뢰도 방식 --- */
  w('---')
  w()
  w('## 9. 신뢰도 적용 방식 A(display) vs B(delta)')
  w()
  w(
    table(
      ['방식', '실력 상관', '1위 표시', '신규(60판 미만) 최고 순위', 'top50 내 신규 수', 'FAIL 이상'],
      b.confidenceSweep.map((s: any) => [
        s.mode === 'display' ? 'A · 표시값만' : 'B · delta 에 곱함',
        f(s.correlation, 3),
        f(s.top, 0),
        Number.isFinite(s.newcomerBestRank) ? s.newcomerBestRank : '-',
        s.newcomerCountTop50,
        s.anomalies,
      ]),
    ),
  )
  w()

  /* -------------------------------------------------------------- 동급전 --- */
  w('---')
  w()
  w('## 10. 클랜 — 동급전 sanity')
  w()
  w(
    table(
      ['본클랜원', '승', '패', '기대값(30+보너스)', '일치'],
      b.evenTable.map((r: any) => [r.members, `+${f(r.win)}`, f(r.lose), `+${r.expectedWin}`, Math.abs(r.win - r.expectedWin) < 1e-9 ? 'OK' : 'MISMATCH']),
    ),
  )
  w()
  w('패배는 구성과 무관하게 항상 -30 이다 — **구성 패널티 없음**이 지켜진다.')
  w()

  /* ------------------------------------------------------- 구성 매트릭스 --- */
  w('---')
  w()
  w('## 11. 구성 매트릭스 (승자 1~5 × 패자 1~5)')
  w()
  w(
    table(
      ['승자 클랜원', '패자 클랜원', 'base', '보너스', '승자 delta', '패자 delta'],
      b.compMatrix.map((c: any) => [c.winnerMembers, c.loserMembers, f(c.baseDelta), `+${c.bonus}`, `+${f(c.winnerDelta)}`, f(c.loserDelta)]),
    ),
  )
  w()
  w('패자 delta 가 패자 구성과 무관하게 일정하다 = 상대 구성 비교 없음이 지켜진다.')
  w()

  /* ------------------------------------------------------ rating 차 매트릭스 --- */
  w('---')
  w()
  w('## 12. rating 차이별')
  w()
  w(
    table(
      ['강팀', '약팀', '승자 클랜원', '강팀 기대승률', '강팀 승리 delta', '약팀 upset delta'],
      b.gapMatrix.map((c: any) => [
        c.strong,
        c.weak,
        c.members,
        f(c.strongExpected * 100, 1) + '%',
        `+${f(c.strongWinDelta)}`,
        `+${f(c.weakUpsetDelta)}`,
      ]),
    ),
  )
  w()

  /* --------------------------------------------------------------- 멸망전 --- */
  w('---')
  w()
  w('## 13. 멸망전 (반복 감쇠 없음)')
  w()
  w(
    table(
      ['시나리오', '경기', 'A승', 'B승', 'A rating', 'B rating', 'A보너스', 'B보너스', '순증', '후반 평균|delta|'],
      b.deathmatches.map((d: any) => [
        d.name,
        d.games,
        d.aWins,
        d.bWins,
        f(d.aRating, 0),
        f(d.bRating, 0),
        d.aBonusTotal,
        d.bBonusTotal,
        f(d.ratingCreated, 0),
        f(d.lateAvgAbsDelta, 1),
      ]),
    ),
  )
  w()
  w('`순증` = 두 클랜 rating 합 − 6000. 구성 보너스가 만들어 낸 **새 점수**다.')
  w('`후반 평균|delta|` 가 작아지면 Elo 가 수렴했다는 뜻이다.')
  w()

  /* ------------------------------------------------- 멸망전 vs 팀재편 --- */
  w('---')
  w()
  w('## 14. 멸망전 vs 팀재편형(열빡) — 같은 10명 · 같은 20경기')
  w()
  w('두 환경의 **선수·실력·판수를 동일하게** 두고 팀 재편 주기만 바꿨다.')
  w()
  w(
    table(
      ['환경', '팀 지속성', '클랜 rating 순증', '상위 클랜'],
      [
        [
          b.fixedTeams.name,
          f(b.fixedTeams.teamContinuity * 100, 0) + '%',
          f(b.fixedTeams.ratingCreated, 0),
          b.fixedTeams.clanRatings.slice(0, 3).map((c: any) => `${c.clanId} ${f(c.rating, 0)}(본클랜원 ${f(c.avgMembers, 1)})`).join(' · '),
        ],
        [
          b.reshuffle.name,
          f(b.reshuffle.teamContinuity * 100, 0) + '%',
          f(b.reshuffle.ratingCreated, 0),
          b.reshuffle.clanRatings.slice(0, 3).map((c: any) => `${c.clanId} ${f(c.rating, 0)}(본클랜원 ${f(c.avgMembers, 1)})`).join(' · '),
        ],
      ],
    ),
  )
  w()

  /* -------------------------------------------------------------- 클랜 랭킹 --- */
  w('---')
  w()
  w('## 15. 클랜 랭킹 1~100')
  w()
  w(
    table(
      ['#', '클랜', '전', '승', '패', '승률', '평균 본클랜원', '구성보너스 누적', 'base 누적', '평균상대', 'rating', '(실제전력)'],
      clanRows.slice(0, 100).map((r) => [
        r.rank,
        r.name,
        r.games,
        r.wins,
        r.losses,
        f(r.winRate),
        f(r.avgMembers, 2),
        f(r.bonusTotal, 0),
        f(r.baseDeltaTotal, 0),
        f(r.avgOpponentRating, 0),
        f(r.rating, 0),
        f(r.latentStrength, 0),
      ]),
    ),
  )
  w()
  w('### 상위 10 이유')
  w()
  for (const r of clanRows.slice(0, 10)) {
    w(`**${r.rank}위 ${r.name}** — ${clanRankReason(r)}`)
    w()
  }
  w('### 클랜 이상 탐지')
  w()
  if (p.clanAnomalies.length === 0) w('탐지된 이상 없음.')
  else w(table(['심각도', '코드', '내용'], p.clanAnomalies.map((a: any) => [a.severity.toUpperCase(), a.code, a.message])))
  w()

  /* ------------------------------------------------------------ inflation --- */
  w('---')
  w()
  w('## 16. Inflation')
  w()
  const inf = p.inflation
  w('```')
  w(`클랜 수            ${inf.clanCount}`)
  w(`rating 총합        ${f(inf.totalRating, 0)}`)
  w(`baseline 총합      ${f(inf.baseline, 0)}`)
  w(`순증(구성 보너스)   ${f(inf.created, 0)}`)
  w(`경기당 순증        ${f(inf.createdPerGame, 2)}`)
  w(`평균 clan rating   ${f(inf.avgRating, 0)}`)
  w(`최고 clan rating   ${f(inf.topRating, 0)}`)
  w('```')
  w()
  w('구성 보너스는 승자에게만 더해지고 패자에게서 빼지 않으므로 **positive-sum** 이다.')
  w('경기마다 평균 보너스만큼 리그 전체 점수가 늘어난다.')
  w()

  /* ------------------------------------------------------------ 대안 비교 --- */
  w('---')
  w()
  w('## 17. 대안 비교 (같은 시드 · 같은 모집단)')
  w()
  w('확정안(`current`)을 **먼저 그대로** 돌린 결과가 위 16장까지다. 아래는 문제가 나온 지점에')
  w('대한 후보들이고, 값을 몰래 바꾼 것이 아니라 **모드만 갈아 끼워 같은 시드로 재실행**한 것이다.')
  w()
  w(
    table(
      [
        '모드',
        '클랜래더↔실제전력 상관',
        'rating 순증',
        '평균 rating',
        '1위',
        'top10 보너스 기여',
        'top10 중 base 음수',
        'top10 평균 본클랜원',
      ],
      b.alternatives.map((a: any) => [
        a.mode === 'current' ? '**current (확정안)**' : a.mode,
        f(a.corr, 3),
        f(a.created, 0),
        f(a.avgRating, 0),
        f(a.top, 0),
        f(a.bonusShareTop10 * 100, 0) + '%',
        f(a.negativeBaseInTop10, 1) + '개',
        f(a.avgMembersTop10, 2),
      ]),
    ),
  )
  w()
  w('`top10 중 base 음수` = 상위 10개 클랜 중 **Elo 기준으로는 마이너스인데 보너스로 올라온** 클랜 수.')
  w('이 값이 크면 실력보다 구성·판수가 순위를 만들고 있다는 뜻이다.')
  w()
  w('### 멸망전(클5 vs 클5 · 50연전) 모드별 순증')
  w()
  w(
    table(
      ['모드', '순증', 'A 최종', 'B 최종'],
      b.altDeathmatch.map((a: any) => [a.mode, f(a.created, 0), f(a.aRating, 0), f(a.bRating, 0)]),
    ),
  )
  w()

  return out.join('\n')
}

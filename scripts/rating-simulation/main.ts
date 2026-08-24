/**
 * 3개월 시즌 rating 시뮬레이션 CLI.
 *
 *   pnpm rating:simulate --seed 42
 *   pnpm rating:simulate --seed 42 --runs 20 --players 200 --clans 100 --season-days 90
 *   pnpm rating:simulate --out docs/RATING_SIMULATION.md --json out/sim.json
 *
 * **운영 코드도 운영 DB도 건드리지 않는다.** 순수 계산과 파일 출력만 한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Rng } from './rng.js'
import {
  DEFAULT_CLAN,
  DEFAULT_PERSONAL,
  confidenceFor,
  type ClanConstants,
  type ConfidenceMode,
  type PersonalConstants,
} from './engine.js'
import { makeArchetypePlayers, makeClans, makePlayers, ARCHETYPES } from './population.js'
import { clanLeaderboard, personalLeaderboard, replay, scheduleSeason } from './season.js'
import {
  clanRankReason,
  detectAnomalies,
  detectClanAnomalies,
  explainVersus,
  findInversions,
  inflationReport,
  rankReason,
  roleBias,
  skillCorrelation,
} from './analysis.js'
import {
  compositionMatrix,
  evenMatchTable,
  ratingGapMatrix,
  runDeathmatch,
  runReshuffle,
} from './scenarios.js'
import { renderReport } from './report.js'

interface Options {
  seed: number
  runs: number
  players: number
  clans: number
  seasonDays: number
  out: string | null
  json: string | null
}

function parseArgs(argv: readonly string[]): Options {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token?.startsWith('--')) continue
    const next = argv[i + 1]
    flags.set(token.slice(2), next && !next.startsWith('--') ? next : 'true')
  }
  const num = (key: string, fallback: number): number => {
    const raw = flags.get(key)
    const parsed = raw === undefined ? NaN : Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return {
    seed: num('seed', 42),
    runs: num('runs', 10),
    players: num('players', 100),
    clans: num('clans', 100),
    seasonDays: num('season-days', 90),
    out: flags.get('out') ?? 'docs/RATING_SIMULATION.md',
    json: flags.get('json') ?? null,
  }
}

/** 한 번의 시즌 (하나의 파라미터 조합 × 하나의 시드) */
function runSeason(
  seed: number,
  options: Options,
  personal: PersonalConstants,
  clanConstants: ClanConstants,
) {
  const rng = new Rng(seed)
  const base = makePlayers(rng, options.players)
  const archetypes = makeArchetypePlayers(rng)
  const allPlayers = [...base, ...archetypes]
  const clans = makeClans(rng, allPlayers, options.clans)
  const matches = scheduleSeason(rng, allPlayers, clans, options.seasonDays)
  const result = replay(matches, personal, clanConstants)
  const personalRows = personalLeaderboard(result, allPlayers)
  const clanRows = clanLeaderboard(result, clans)
  return { rng, allPlayers, clans, matches, result, personalRows, clanRows }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const started = Date.now()

  /* ---------------------------------------------------- 기준 시즌 (main run) --- */
  const personal = { ...DEFAULT_PERSONAL }
  const primary = runSeason(options.seed, options, personal, DEFAULT_CLAN)

  /* -------------------------------------------------------- K 값 민감도 ------- */
  const kSweep = [40, 50, 60, 70].map((k) => {
    const season = runSeason(options.seed, options, { ...personal, k }, DEFAULT_CLAN)
    const rows = season.personalRows
    return {
      k,
      correlation: skillCorrelation(rows),
      top: rows[0]?.displayed ?? 0,
      p99: rows[Math.floor(rows.length * 0.01)]?.displayed ?? 0,
      p50: rows[Math.floor(rows.length * 0.5)]?.displayed ?? 0,
      spread: (rows[0]?.displayed ?? 0) - (rows[rows.length - 1]?.displayed ?? 0),
      anomalies: detectAnomalies(rows, season.allPlayers).filter((a) => a.severity === 'fail').length,
    }
  })

  /* ------------------------------------------------- 신뢰도 방식 A vs B ------- */
  const confidenceSweep = (['display', 'delta'] as ConfidenceMode[]).map((mode) => {
    const season = runSeason(options.seed, options, { ...personal, confidenceMode: mode }, DEFAULT_CLAN)
    const rows = season.personalRows
    const newcomers = rows.filter((r) => r.games < 60)
    return {
      mode,
      correlation: skillCorrelation(rows),
      top: rows[0]?.displayed ?? 0,
      newcomerBestRank: Math.min(...newcomers.map((r) => r.rank), Infinity),
      newcomerCountTop50: rows.slice(0, 50).filter((r) => r.games < 60).length,
      anomalies: detectAnomalies(rows, season.allPlayers).filter((a) => a.severity === 'fail').length,
    }
  })

  /* ------------------------------------------------ 개인 퍼포먼스 비중 -------- */
  const performanceSweep = [0, 0.05, 0.1, 0.15].map((w) => {
    const season = runSeason(options.seed, options, { ...personal, performanceWeight: w }, DEFAULT_CLAN)
    const rows = season.personalRows
    const bias = roleBias(rows)
    return {
      weight: w,
      correlation: skillCorrelation(rows),
      sniperEdge:
        (bias.find((b) => b.role === 'sniper')?.avgOverRating ?? 0) -
        (bias.find((b) => b.role === 'support')?.avgOverRating ?? 0),
      sniperTop20Share: bias.find((b) => b.role === 'sniper')?.top20Share ?? 0,
      anomalies: detectAnomalies(rows, season.allPlayers).filter((a) => a.severity === 'fail').length,
    }
  })

  /* --------------------------------------------- Monte Carlo (여러 시드) ------ */
  const monteCarlo = Array.from({ length: options.runs }, (_, i) => {
    const season = runSeason(options.seed + i * 977, options, personal, DEFAULT_CLAN)
    const rows = season.personalRows
    const clanRows = season.clanRows
    return {
      seed: options.seed + i * 977,
      correlation: skillCorrelation(rows),
      topDisplayed: rows[0]?.displayed ?? 0,
      failAnomalies: detectAnomalies(rows, season.allPlayers).filter((a) => a.severity === 'fail').length,
      clanCreated: season.result.clanRatingCreated,
      clanTop: clanRows[0]?.rating ?? 0,
      matches: season.matches.length,
    }
  })

  /* ------------------------------------------------------- 멸망전 ------------ */
  const dmRng = new Rng(options.seed + 1)
  const deathmatches = [
    runDeathmatch(dmRng, { name: 'M1 클4용1 vs 클4용1 · 20연전', games: 20, aMembers: 4, bMembers: 4, aSkill: 3150, bSkill: 3150, clanConstants: DEFAULT_CLAN }),
    runDeathmatch(dmRng, { name: 'M2 클3용2 vs 클5 · 30연전', games: 30, aMembers: 3, bMembers: 5, aSkill: 3150, bSkill: 3150, clanConstants: DEFAULT_CLAN }),
    runDeathmatch(dmRng, { name: 'M3 클5 vs 클5 실력 대등 · 50연전', games: 50, aMembers: 5, bMembers: 5, aSkill: 3150, bSkill: 3160, clanConstants: DEFAULT_CLAN }),
    runDeathmatch(dmRng, { name: 'M4 한쪽이 명확히 강함 · 20연전', games: 20, aMembers: 4, bMembers: 4, aSkill: 3400, bSkill: 3050, clanConstants: DEFAULT_CLAN }),
  ]

  /* ------------------------------------------- 팀재편형(열빡) vs 멸망전 ------- */
  const mixRng = new Rng(options.seed + 2)
  /* 같은 10명 · 같은 실력 · 같은 판수. 팀 재편 주기만 다르다 */
  const skills = Array.from({ length: 10 }, () => 3100 + mixRng.normal(0, 60))
  const scatteredClans = ['CX', 'CX', 'CY', 'CY', 'CZ', 'CZ', 'CW', 'CW', 'CV', 'CV']
  const fixedClans = ['CA', 'CA', 'CA', 'CA', 'CA', 'CB', 'CB', 'CB', 'CB', 'CB']

  const reshuffle = runReshuffle(new Rng(options.seed + 3), {
    name: '열빡형 — 2경기마다 팀 재편 · 소속이 흩어짐',
    games: 20,
    reshuffleEvery: 2,
    clanOfPlayer: scatteredClans,
    skills,
    personalConstants: personal,
    clanConstants: DEFAULT_CLAN,
  })
  const fixedTeams = runReshuffle(new Rng(options.seed + 3), {
    name: '멸망전형 — 고정 팀 · 클5 vs 클5',
    games: 20,
    reshuffleEvery: 9999,
    clanOfPlayer: fixedClans,
    skills,
    personalConstants: personal,
    clanConstants: DEFAULT_CLAN,
  })

  /* --------------------------------- 대안 비교 (같은 시드 · 같은 모집단) ------- */
  const bonusModes = ['current', 'zero-sum', 'opponent-scaled', 'separate-track'] as const
  const alternatives = bonusModes.map((mode) => {
    const constants = { ...DEFAULT_CLAN, bonusMode: mode }
    /* 여러 시드로 돌려 한 번의 운에 좌우되지 않게 한다 */
    const runs = Array.from({ length: Math.min(5, options.runs) }, (_, i) => {
      const season = runSeason(options.seed + i * 977, options, personal, constants)
      const rows = season.clanRows
      const latentSorted = [...rows].sort((a, b) => b.latentStrength - a.latentStrength)
      const latentRank = new Map(latentSorted.map((r, i2) => [r.clanId, i2 + 1]))
      // 클랜 래더가 실제 전력을 얼마나 따라가는가 (스피어만)
      const n = rows.length
      let sum = 0
      for (const r of rows) {
        const d = r.rank - (latentRank.get(r.clanId) ?? r.rank)
        sum += d * d
      }
      const corr = n > 1 ? 1 - (6 * sum) / (n * (n * n - 1)) : 0
      const top10 = rows.slice(0, 10)
      const bonusShare =
        top10.reduce((a, r) => a + r.bonusTotal, 0) /
        Math.max(1, top10.reduce((a, r) => a + Math.abs(r.baseDeltaTotal) + r.bonusTotal, 0))
      return {
        corr,
        created: season.result.clanRatingCreated,
        avgRating: rows.reduce((a, r) => a + r.rating, 0) / Math.max(1, rows.length),
        top: rows[0]?.rating ?? 0,
        bonusShareTop10: bonusShare,
        negativeBaseInTop10: top10.filter((r) => r.baseDeltaTotal < 0).length,
        avgMembersTop10: top10.reduce((a, r) => a + r.avgMembers, 0) / Math.max(1, top10.length),
      }
    })
    const avg = (key: keyof (typeof runs)[number]): number =>
      runs.reduce((a, r) => a + (r[key] as number), 0) / runs.length
    return {
      mode,
      corr: avg('corr'),
      created: avg('created'),
      avgRating: avg('avgRating'),
      top: avg('top'),
      bonusShareTop10: avg('bonusShareTop10'),
      negativeBaseInTop10: avg('negativeBaseInTop10'),
      avgMembersTop10: avg('avgMembersTop10'),
    }
  })

  /* 멸망전 inflation 도 모드별로 */
  const altDeathmatch = bonusModes.map((mode) => {
    const constants = { ...DEFAULT_CLAN, bonusMode: mode }
    const r = runDeathmatch(new Rng(options.seed + 1), {
      name: `M3 클5 vs 클5 · 50연전 (${mode})`,
      games: 50,
      aMembers: 5,
      bMembers: 5,
      aSkill: 3150,
      bSkill: 3160,
      clanConstants: constants,
    })
    return { mode, created: r.ratingCreated, aRating: r.aRating, bRating: r.bRating }
  })

  /* ------------------------------------------------------- 매트릭스 ---------- */
  const evenTable = evenMatchTable(DEFAULT_CLAN)
  const compMatrix = compositionMatrix(DEFAULT_CLAN)
  const gapMatrix = ratingGapMatrix(DEFAULT_CLAN)

  /* ------------------------------------------------------- 결정성 확인 ------- */
  const repeat = runSeason(options.seed, options, personal, DEFAULT_CLAN)
  const deterministic =
    JSON.stringify(repeat.personalRows.slice(0, 20).map((r) => [r.playerId, Math.round(r.displayed * 1e6)])) ===
    JSON.stringify(primary.personalRows.slice(0, 20).map((r) => [r.playerId, Math.round(r.displayed * 1e6)]))

  /* ------------------------------------------------------- 리포트 ------------ */
  const bundle = {
    options,
    generatedInMs: Date.now() - started,
    deterministic,
    personal,
    clanConstants: DEFAULT_CLAN,
    primary: {
      matches: primary.matches.length,
      personalRows: primary.personalRows,
      clanRows: primary.clanRows,
      correlation: skillCorrelation(primary.personalRows),
      anomalies: detectAnomalies(primary.personalRows, primary.allPlayers),
      clanAnomalies: detectClanAnomalies(primary.clanRows),
      inversions: findInversions(primary.personalRows, 100),
      roleBias: roleBias(primary.personalRows),
      inflation: inflationReport(
        primary.clanRows,
        primary.result.clanRatingCreated,
        primary.clanRows.reduce((a, r) => a + r.games, 0) / 2,
      ),
      archetypes: ARCHETYPES.map((spec) => {
        const row = primary.personalRows.find((r) => r.archetype === spec.code)
        return { spec, row: row ?? null }
      }),
    },
    kSweep,
    confidenceSweep,
    performanceSweep,
    monteCarlo,
    deathmatches,
    reshuffle,
    fixedTeams,
    evenTable,
    compMatrix,
    gapMatrix,
    alternatives,
    altDeathmatch,
  }

  if (options.json) {
    mkdirSync(dirname(options.json), { recursive: true })
    writeFileSync(options.json, JSON.stringify(bundle, null, 1), 'utf8')
    console.info(`JSON: ${options.json}`)
  }

  const markdown = renderReport(bundle, (higher, lower) => explainVersus(higher, lower), rankReason, clanRankReason)
  if (options.out && options.out !== 'true') {
    mkdirSync(dirname(options.out), { recursive: true })
    writeFileSync(options.out, markdown, 'utf8')
    console.info(`리포트: ${options.out}`)
  }

  /* 콘솔 요약 */
  console.info('')
  console.info(`시드 ${options.seed} · 선수 ${primary.allPlayers.length} · 클랜 ${primary.clans.length} · 경기 ${primary.matches.length}`)
  console.info(`실력 재현도(스피어만) ${skillCorrelation(primary.personalRows).toFixed(3)}`)
  console.info(`결정성 ${deterministic ? 'OK — 같은 시드에 같은 결과' : 'FAIL'}`)
  const fails = detectAnomalies(primary.personalRows, primary.allPlayers).filter((a) => a.severity === 'fail')
  console.info(`개인 이상(FAIL) ${fails.length}건 · 클랜 이상 ${detectClanAnomalies(primary.clanRows).length}건`)
  console.info(`클랜 rating 순증 ${primary.result.clanRatingCreated.toFixed(0)}점`)
  console.info(`소요 ${((Date.now() - started) / 1000).toFixed(1)}초`)
}

main()

export { confidenceFor }

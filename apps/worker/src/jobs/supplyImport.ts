/**
 * `nexon supply-import` — 3rd.supply 미러링 수집 파일을 우리 DB 로 넣는다 (D-153).
 *
 *   1) 수집 파일을 **순수 함수**로 판독한다 (`supplyMirrorParse`)
 *   2) 판독 결과를 DB 에 넣는다 (`supplyMirrorImport`) — `--confirm` 없이는 한 줄도 안 쓴다
 *   3) 끝나면 **파일과 DB 를 숫자로 대조**한다 (`CLAUDE.md` 3-A 6번)
 *
 * 수집 잡(`supply-mirror`)과는 완전히 분리돼 있다. 여기서는 **네트워크를 쓰지 않는다.**
 * 수집이 도는 중에도 이미 받아 둔 파일로 안전하게 돌릴 수 있다.
 *
 * ── 수집 파일 포맷이 둘이다. 둘 다 읽는다
 *
 *   (구) `<base>.json` 하나에 `matches` · `details` 까지 전부      ← daerule · sanply
 *   (신) `<base>.json`           체크포인트(메타·클랜·실패)만
 *        `<base>.matches.jsonl`  경기 목록 원본. 한 줄에 하나
 *        `<base>.details.jsonl`  경기 상세 원본. `_matchId` 가 붙어 있다   ← supply
 *
 *   `<base>.json` 에 `matches` 키가 있으면 구 포맷이다. 없으면 옆의 `.jsonl` 을 읽는다.
 *
 * ── 새 포맷은 **통째로 메모리에 올리지 않는다**
 *   supply 는 경기가 13만 건 규모다. 상세까지 합치면 1.5GB 라 `JSON.parse` 가 죽는다.
 *   그래서 이렇게 한다.
 *
 *     1차 통과 — `.matches.jsonl` 을 흘려 읽으며
 *                · 클랜 사전을 만들고 (수백 건. 이것만 끝까지 들고 있는다)
 *                · 경기 목록 줄에서 **요약 라인업과 마크 URL 을 버린** 작은 색인을 만든다
 *                  (라인업은 상세에 더 자세히 다시 오고, 마크는 사전에 이미 있다)
 *     2차 통과 — `.details.jsonl` 을 흘려 읽으며 색인과 이어 붙여 **한 건씩** 내보낸다
 *
 *   적재 쪽은 경기를 한 건씩 받아 처리하고 버린다. 판독 결과 배열은 어디에도 없다.
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  absorbClanList,
  absorbClansFromMatchRow,
  countParsedMatch,
  countUnparsed,
  createSupplySummary,
  importSupplyMirror,
  parseSupplyMatch,
  parseSupplyMirrorFile,
  parseSupplyDateTime,
  reconcileSupplyMirror,
  sourceFromParsedFile,
  type ParsedSupplyMatch,
  type ParsedSupplySource,
  type ParsedSupplySummary,
  type SupplyClanDirectory,
  type SupplyMatchDetailRaw,
  type SupplyMatchListRaw,
  type SupplyMirrorFileLike,
  type SupplyMirrorImportResult,
  type SupplyMirrorReconciliation,
} from '@sacloud/db/ops'
import { readJsonl } from '../lib/jsonlStore.js'
import { log, table, warn } from '../lib/log.js'

export interface SupplyImportInput {
  file: string
  /** 넣을 리그. 없으면 수집 파일의 `leagueSlug` 를 쓴다 */
  leagueSlug?: string | null
  confirm?: boolean
  updateSource?: boolean
  createLeagueName?: string | null
  limit?: number | null
}

export interface SupplyImportOutput {
  summary: ParsedSupplySummary
  imported: SupplyMirrorImportResult
  reconciliation: SupplyMirrorReconciliation
}

const matchesPath = (base: string): string => base.replace(/\.json$/, '.matches.jsonl')
const detailsPath = (base: string): string => base.replace(/\.json$/, '.details.jsonl')

/** 체크포인트(구·신 공용). 데이터가 들어 있는지로 포맷을 가른다 */
type CheckpointLike = SupplyMirrorFileLike & { matches?: Record<string, SupplyMatchListRaw> }

function readCheckpoint(path: string): CheckpointLike {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CheckpointLike
  if (!parsed.leagueSlug) throw new Error(`수집 파일에 leagueSlug 가 없다: ${path}`)
  return parsed
}

/**
 * 경기 목록 줄에서 **끝까지 들고 있을 만한 것만** 남긴다.
 *
 * 버리는 것 두 가지 —
 *   `summary`         상세에 같은 사람이 K/D/A 까지 붙어 다시 온다. 두 벌 들 이유가 없다
 *   상대 클랜 마크 URL  1차 통과에서 이미 클랜 사전에 들어갔다. 줄마다 또 들면 낭비다
 * 13만 줄이라 이 두 가지만 빼도 메모리가 몇 배 차이 난다.
 */
function compactMatchRow(row: SupplyMatchListRaw): SupplyMatchListRaw {
  const { summary: _summary, opponent, ...rest } = row
  return {
    ...rest,
    opponent: opponent
      ? {
          id: opponent.id ?? null,
          rating: opponent.rating ?? null,
          division: opponent.division ?? null,
          placement: opponent.placement ?? null,
          clan: opponent.clan
            ? { id: opponent.clan.id, name: opponent.clan.name, slug: opponent.clan.slug }
            : null,
        }
      : null,
  }
}

/** 수집 파일 → 판독 결과를 한 건씩 흘려 주는 통로. 포맷 두 가지를 여기서 흡수한다 */
export async function openSupplyMirrorSource(
  base: string,
  options: { limit?: number | null } = {},
): Promise<ParsedSupplySource> {
  if (!existsSync(base)) throw new Error(`수집 파일이 없다: ${base}`)
  const checkpoint = readCheckpoint(base)
  const limit = options.limit && options.limit > 0 ? options.limit : null

  /* ── 구 포맷: 데이터가 같은 파일에 들어 있다 (수 MB 라 통째로 읽어도 된다) ── */
  if (checkpoint.matches && typeof checkpoint.matches === 'object') {
    log('수집 파일 포맷: 예전 단일 JSON (matches/details 가 같은 파일에 있다)')
    return sourceFromParsedFile(parseSupplyMirrorFile(checkpoint, { limit }))
  }

  /* ── 신 포맷: 줄 단위 파일 두 개 ─────────────────────────────────────────── */
  const matchesFile = matchesPath(base)
  const detailsFile = detailsPath(base)
  if (!existsSync(matchesFile)) {
    throw new Error(
      `체크포인트에 matches 가 없고 ${matchesFile} 도 없다 — 수집 파일 짝이 맞지 않는다`,
    )
  }
  log(`수집 파일 포맷: 줄 단위(JSONL) — 흘려 읽는다`)

  /* 1차 통과 — 클랜 사전 + 작은 색인. 본문은 남기지 않는다 */
  const clans: SupplyClanDirectory = new Map()
  const index = new Map<string, SupplyMatchListRaw>()
  const matchStats = await readJsonl<SupplyMatchListRaw>(matchesFile, (row) => {
    if (!row?.id) return
    absorbClansFromMatchRow(clans, row)
    /* 같은 id 가 두 번 들어 있을 수 있다(재시작). 나중 줄이 이긴다 */
    index.set(String(row.id), compactMatchRow(row))
  })
  absorbClanList(clans, checkpoint.clans)
  log(
    `   경기 목록 ${matchStats.lines}줄 → 고유 ${index.size}건` +
      (matchStats.broken > 0 ? ` · 깨진 줄 ${matchStats.broken}` : ''),
  )

  const unparsed: Record<string, number> = {}
  if (!existsSync(detailsFile)) {
    /* 수집이 아직 목록만 받은 단계다. 경기는 한 건도 판독되지 않고 전부 detail_missing 이 된다 */
    warn(`   상세 파일이 아직 없다: ${detailsFile}`)
  }

  return {
    leagueSlug: checkpoint.leagueSlug,
    leagueId: checkpoint.leagueId,
    capturedAt: checkpoint.capturedAt
      ? parseSupplyDateTime(`${checkpoint.capturedAt} 00:00:00`)
      : null,
    clans: [...clans.values()],
    unparsed,
    matches: async function* (): AsyncGenerator<ParsedSupplyMatch> {
      /* 2차 통과 — 상세를 **당겨** 읽으며 색인과 이어 붙인다 */
      const joined = new Set<string>()
      let orphan = 0
      let duplicate = 0
      let broken = 0
      let emitted = 0
      let truncated = false

      for await (const detail of pullJsonl<SupplyMatchDetailRaw & { _matchId?: string }>(
        detailsFile,
        () => {
          broken += 1
        },
      )) {
        const id = detail?._matchId === undefined ? undefined : String(detail._matchId)
        if (!id) continue
        if (joined.has(id)) {
          /* 같은 상세가 두 줄 있을 수 있다(재시작). 뒤엣것은 버리고 센다 */
          duplicate += 1
          continue
        }
        const row = index.get(id)
        if (!row) {
          /* 상세는 있는데 목록에 없다 — 짝이 안 맞는다. 조용히 버리지 않는다 */
          orphan += 1
          continue
        }
        joined.add(id)
        if (!detail.red && !detail.blue) continue
        yield parseSupplyMatch(id, row, detail, { leagueSlug: checkpoint.leagueSlug, clans })
        emitted += 1
        if (limit !== null && emitted >= limit) {
          truncated = true
          break
        }
      }

      /* 다 흘려 본 뒤에야 "무엇이 왜 빠졌는지" 를 셀 수 있다 */
      if (truncated) {
        log(`   [미리보기] ${limit}건에서 멈췄다 — detail_missing 은 세지 않는다`)
      } else {
        const missing = index.size - joined.size
        if (missing > 0) unparsed['detail_missing'] = missing
      }
      if (orphan > 0) unparsed['detail_without_match_row'] = orphan
      if (duplicate > 0) unparsed['duplicate_detail_line'] = duplicate
      if (broken > 0) unparsed['broken_detail_line'] = broken
    },
  }
}

/**
 * JSONL 을 한 줄씩 **당겨** 읽는다 (backpressure).
 *
 * `jsonlStore.readJsonl` 은 콜백으로 밀어 주는 구조라 소비자(DB 쓰기)가 느리면
 * 읽는 쪽이 앞질러 달려 결국 파일 전체가 메모리에 쌓인다 — 13만 건이면 그게 곧 죽음이다.
 * 여기서는 `yield` 가 읽기 자체를 멈춰 세운다. 색인을 만드는 1차 통과처럼
 * **결과가 작은** 곳에서는 그대로 `readJsonl` 을 쓴다.
 *
 * 깨진 줄은 건너뛰고 센다 (쓰다가 죽으면 마지막 줄이 잘려 있을 수 있다).
 */
async function* pullJsonl<T>(file: string, onBroken: () => void): AsyncGenerator<T> {
  if (!existsSync(file)) return
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    if (line.trim() === '') continue
    let record: T
    try {
      record = JSON.parse(line) as T
    } catch {
      onBroken()
      continue
    }
    yield record
  }
}

export async function runSupplyImport(input: SupplyImportInput): Promise<SupplyImportOutput> {
  const source = await openSupplyMirrorSource(input.file, { limit: input.limit })
  const leagueSlug = input.leagueSlug ?? source.leagueSlug
  if (leagueSlug !== source.leagueSlug) {
    /* 리그를 섞으면 되돌릴 수 없다. 일부러 다른 리그에 넣는 것이라면 그렇다고 남긴다 */
    warn(`수집 파일의 리그(${source.leagueSlug})와 넣을 리그(${leagueSlug})가 다르다`)
  }

  /**
   * 판독 요약은 **적재가 흘려 받는 그 순간에** 센다.
   * 따로 한 번 더 흘리면 13만 건을 두 번 읽게 된다.
   */
  const summary = createSupplySummary()
  const counted: ParsedSupplySource = {
    ...source,
    matches: () => tap(source.matches(), (match) => countParsedMatch(summary, match)),
  }

  const imported = await importSupplyMirror({
    source: counted,
    leagueSlug,
    confirm: Boolean(input.confirm),
    updateSource: Boolean(input.updateSource),
    createLeagueName: input.createLeagueName ?? null,
  })

  /* 판독 실패는 원본을 다 흘려 본 뒤에야 확정된다 (JSONL 경로) */
  for (const [reason, count] of Object.entries(source.unparsed)) {
    countUnparsed(summary, reason, count)
  }

  log('')
  log('[1] 판독 (수집 파일 → 우리 모양) — DB 를 건드리지 않는다')
  table([
    {
      '경기(상세 있음)': summary.matches,
      '판독 못한 경기': summary.unparsed,
      참가자: summary.participants,
      '진영↔클랜 연결': summary.sideLinked,
      '연결 실패': summary.sideUnlinked,
    },
  ])
  log('  판독 못한 사유 (안 들어간 것이 몇 건이고 왜인지)')
  table([Object.keys(summary.unparsedByReason).length > 0 ? summary.unparsedByReason : { 없음: 0 }])
  log('  연결 근거')
  table([Object.keys(summary.sideEvidence).length > 0 ? summary.sideEvidence : { 없음: 0 }])
  log('  값 완비 (경기 단위 · 참가자 전원이 값을 가진 경기 수)')
  table([
    {
      '10명': summary.tenParticipants,
      불완전: summary.incompleteParticipants,
      KDA: summary.kdaComplete,
      무기: summary.weaponComplete,
      딜량: summary.damageComplete,
      헤드샷: summary.headshotComplete,
      '원본표시 래더': summary.sourceRatingComplete,
    },
  ])
  log('  결측')
  table([
    {
      'play_time 없음': summary.playTimeNull,
      'play_time 음수(원본 end_at 이 분 단위로 잘림)': summary.playTimeNegative,
      'end_at 없음': summary.endAtNull,
      'MVP 없음': summary.mvpNull,
    },
  ])
  if (Object.keys(summary.warnings).length > 0) {
    log('  경고')
    table([summary.warnings])
  }

  log('')
  log(`[2] 적재 ${input.confirm ? '(실제 쓰기)' : '(미리보기 — 한 줄도 쓰지 않았다)'}`)
  table([
    {
      리그: imported.planned.leagues,
      클랜: imported.planned.clans,
      '리그 참가 클랜': imported.planned.leagueClans,
      맵: imported.planned.maps,
      '리그 맵': imported.planned.leagueMaps,
      선수: imported.planned.players,
      경기: imported.planned.matches,
      '참가 기록': imported.planned.stats,
    },
  ])
  if (input.updateSource) {
    log(`  원본점수 빈 칸 보충 ${input.confirm ? '(실제로 채움)' : '(미리보기 — 채울 예정)'}`)
    table([
      {
        '경기 행': imported.written.sourceBackfilledMatches,
        '참가 행': imported.written.sourceBackfilledStats,
        '채워질 빈 칸': imported.written.sourceBackfilledColumns,
      },
    ])
  }
  if (input.confirm) {
    log('  실제로 쓴 것')
    table([
      {
        리그: imported.written.leagues,
        클랜: imported.written.clans,
        '리그 참가 클랜': imported.written.leagueClans,
        맵: imported.written.maps,
        '리그 맵': imported.written.leagueMaps,
        선수: imported.written.players,
        경기: imported.written.matches,
        '참가 기록': imported.written.stats,
        '원본점수 보충(경기)': imported.written.sourceBackfilledMatches,
        '원본점수 보충(참가)': imported.written.sourceBackfilledStats,
        '원본점수 보충(칸)': imported.written.sourceBackfilledColumns,
      },
    ])
  }
  log('  넣지 않은 경기 (사유별)')
  table([Object.keys(imported.skipped).length > 0 ? imported.skipped : { 없음: 0 }])
  for (const note of imported.notes) warn(`  ${note}`)

  const reconciliation = await reconcileSupplyMirror({
    matchIds: imported.sourceMatchIds,
    unparsed: summary.unparsed,
    leagueSlug,
  })

  log('')
  log(`[3] 대조 — 리그 ${leagueSlug}${reconciliation.leagueExists ? '' : ' (DB 에 없음)'}`)
  table([
    {
      '수집 파일 경기': reconciliation.fileMatches,
      'DB 경기': reconciliation.dbMatches,
      공통: reconciliation.common,
      '3rd.supply only': reconciliation.supplyOnly,
      'DB only': reconciliation.dbOnly,
      /* 오류가 아니다 — 클랜이 리그를 겸하면 같은 경기가 양쪽에 찍힌다 (D-155) */
      '다른 리그에도 기록됨(정상)': reconciliation.alsoInOtherLeagues,
    },
  ])
  table([
    {
      '참가자 10명': reconciliation.db.tenParticipants,
      불완전: reconciliation.db.incompleteParticipants,
      'KDA 완비': reconciliation.db.kdaComplete,
      'KDA 결측': reconciliation.db.kdaIncomplete,
      무기: reconciliation.db.weaponComplete,
      딜량: reconciliation.db.damageComplete,
      헤드샷: reconciliation.db.headshotComplete,
      '원본표시 래더': reconciliation.db.sourceRatingComplete,
    },
  ])
  if (reconciliation.supplyOnly > 0) {
    warn(`  3rd.supply only 가 ${reconciliation.supplyOnly}건이다 (목표 0)`)
  }
  if (!input.confirm) log('\n미리보기다. 실제로 쓰려면 --confirm 을 붙인다')

  return { summary, imported, reconciliation }
}

/** 흘러가는 값을 세면서 그대로 흘려보낸다 (요약을 위해 한 번 더 읽지 않기 위한 것) */
async function* tap<T>(source: AsyncIterable<T>, onEach: (value: T) => void): AsyncIterable<T> {
  for await (const value of source) {
    onEach(value)
    yield value
  }
}

/**
 * 래더 백업 v2(JSONL)의 **검증 규칙**을 고정한다 (2026-09-02).
 *
 * v1 은 sanply(202만 행)에서 죽었다 — `findMany` 가 한 번에 다 읽고
 * `JSON.stringify` 가 통짜 문자열을 만들었다. v2 는 줄 단위로 흘려 쓴다.
 *
 * 그런데 **스트리밍은 조용히 반쪽이 되기 쉽다.** 파일이 중간에 끊겨도
 * 앞부분은 멀쩡해 보인다. 그래서 여기서 고정하는 것은 「잘 읽힌다」가 아니라
 * **「어긋나면 한 줄도 쓰지 않고 거부한다」**다.
 *
 *   1. 멀쩡한 파일은 dry-run 으로 통과하고 아무것도 쓰지 않는다
 *   2. 한 글자라도 바뀌면 checksum 으로 잡는다
 *   3. 꼬리글이 없으면(= 쓰다 죽은 파일) 거부한다
 *   4. **꼬리글**이 적은 수와 실제 줄 수가 다르면 거부한다
 *      (머리글의 예고는 백업 도중 경기가 들어와 어긋나는 것이 정상이라 그냥 통과시킨다)
 *   5. v1 파일과 season0Apply 파일을 형식으로 알아본다
 *
 * 전부 파일만 읽는 검사라 **DB 를 건드리지 않는다.**
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RATING_SNAPSHOT_STREAM_VERSION,
  restoreRatingSnapshotAuto,
  restoreRatingSnapshotStream,
} from '../jobs/ratingBackup.js'

const dir = mkdtempSync(join(tmpdir(), 'rating-backup-'))

interface Counts {
  leaguePlayers: number
  leagueClans: number
  matchPlayerStats: number
  matches: number
}

/** 쓰는 쪽과 **같은 방식**으로 만든다 — 레코드 줄의 바이트만 순서대로 해시에 흘린다 */
function buildFile(
  name: string,
  options: {
    records?: Array<{ kind: string; row: unknown }>
    /** 머리글에 적을 수. 생략하면 실제 줄 수와 맞춘다 */
    counts?: Counts
    /** 꼬리글을 뺀다 — 쓰다 죽은 파일을 흉내낸다 */
    omitFooter?: boolean
    /** 꼬리글에 넣을 수. 생략하면 실제 줄 수와 맞춘다 */
    footerCounts?: Counts
    /** 꼬리글에서 `counts` 칸을 뺀다 — 그 칸을 넣기 전에 뜬 옛 파일을 흉내낸다 */
    legacyFooter?: boolean
    /** 체크섬을 계산한 **뒤에** 본문을 건드린다 — 손상을 흉내낸다 */
    tamper?: (lines: string[]) => string[]
    version?: number
  } = {},
): string {
  const records = options.records ?? [
    { kind: 'leaguePlayer', row: { id: 'lp1', playerId: 'p1', rating: 3100 } },
    { kind: 'leagueClan', row: { id: 'lc1', rating: 3050 } },
    { kind: 'matchPlayerStat', row: { matchId: 'm1', playerId: 'p1', ratingUpdate: 12 } },
    { kind: 'match', row: { id: 'm1', redRatingUpdate: 12 } },
  ]
  const counts: Counts = options.counts ?? {
    leaguePlayers: records.filter((r) => r.kind === 'leaguePlayer').length,
    leagueClans: records.filter((r) => r.kind === 'leagueClan').length,
    matchPlayerStats: records.filter((r) => r.kind === 'matchPlayerStat').length,
    matches: records.filter((r) => r.kind === 'match').length,
  }
  const header = {
    kind: 'header',
    version: options.version ?? RATING_SNAPSHOT_STREAM_VERSION,
    leagueSlug: 'testleague',
    takenAt: 'fixed-stamp',
    counts,
  }

  const hash = createHash('sha256')
  let body = records.map((r) => JSON.stringify(r))
  for (const line of body) hash.update(line + '\n')
  const checksum = hash.digest('hex').slice(0, 32)

  if (options.tamper) body = options.tamper(body)

  const actual: Counts = {
    leaguePlayers: records.filter((r) => r.kind === 'leaguePlayer').length,
    leagueClans: records.filter((r) => r.kind === 'leagueClan').length,
    matchPlayerStats: records.filter((r) => r.kind === 'matchPlayerStat').length,
    matches: records.filter((r) => r.kind === 'match').length,
  }
  const footer = options.legacyFooter
    ? { kind: 'footer', checksum }
    : { kind: 'footer', checksum, counts: options.footerCounts ?? actual }

  const lines = [JSON.stringify(header), ...body]
  if (!options.omitFooter) lines.push(JSON.stringify(footer))

  const path = join(dir, name)
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
  return path
}

describe('래더 백업 v2 — 검증', () => {
  it('멀쩡한 파일은 dry-run 으로 통과하고 아무것도 쓰지 않는다', async () => {
    const path = buildFile('ok.jsonl')
    const result = await restoreRatingSnapshotStream({ path, dryRun: true })
    expect(result.restored).toEqual({ leaguePlayers: 0, leagueClans: 0, stats: 0, matches: 0 })
  })

  it('한 글자라도 바뀌면 checksum 으로 잡는다', async () => {
    const path = buildFile('tampered.jsonl', {
      tamper: (lines) => lines.map((l) => l.replace('"rating":3100', '"rating":9999')),
    })
    await expect(restoreRatingSnapshotStream({ path, dryRun: true })).rejects.toThrow(/손상/)
  })

  it('꼬리글이 없으면 — 쓰다 죽은 파일이면 — 거부한다', async () => {
    const path = buildFile('truncated.jsonl', { omitFooter: true })
    await expect(restoreRatingSnapshotStream({ path, dryRun: true })).rejects.toThrow(/꼬리글/)
  })

  it('꼬리글이 적은 수와 실제 줄 수가 다르면 거부한다', async () => {
    /* 「앞부분만 멀쩡한 파일」이 그냥 통과하는 것을 막는 자물쇠다.
       checksum 은 있는 줄만 보므로 이 검사가 없으면 빠진 줄을 못 잡는다 */
    const path = buildFile('short.jsonl', {
      footerCounts: { leaguePlayers: 5, leagueClans: 1, matchPlayerStats: 1, matches: 1 },
    })
    await expect(restoreRatingSnapshotStream({ path, dryRun: true })).rejects.toThrow(/줄 수/)
  })

  it('머리글의 예고가 실제와 달라도 통과한다 — 백업 도중 경기가 들어오기 때문이다', async () => {
    /* 202만 행 백업은 30분 넘게 돌고 그동안 sanply 에 새 경기가 적재된다.
       머리글은 시작할 때의 예고일 뿐이라, 이걸 실패로 치면 큰 리그는 영영 백업을 못 뜬다.
       정본은 꼬리글이다 */
    const path = buildFile('drifted.jsonl', {
      counts: { leaguePlayers: 1, leagueClans: 1, matchPlayerStats: 0, matches: 0 },
    })
    const result = await restoreRatingSnapshotStream({ path, dryRun: true })
    expect(result.restored.stats).toBe(0)
  })

  it('꼬리글에 수가 없는 옛 파일은 머리글로 대조한다', async () => {
    const ok = buildFile('legacy-footer.jsonl', { legacyFooter: true })
    await expect(restoreRatingSnapshotStream({ path: ok, dryRun: true })).resolves.toBeTruthy()

    const bad = buildFile('legacy-footer-short.jsonl', {
      legacyFooter: true,
      counts: { leaguePlayers: 9, leagueClans: 1, matchPlayerStats: 1, matches: 1 },
    })
    await expect(restoreRatingSnapshotStream({ path: bad, dryRun: true })).rejects.toThrow(/줄 수/)
  })

  it('모르는 형식 버전은 거부한다', async () => {
    const path = buildFile('future.jsonl', { version: 99 })
    await expect(restoreRatingSnapshotStream({ path, dryRun: true })).rejects.toThrow(/버전/)
  })

  it('모르는 레코드 종류는 거부한다 — 조용히 건너뛰지 않는다', async () => {
    const path = buildFile('unknown.jsonl', {
      records: [{ kind: 'somethingElse', row: {} }],
      counts: { leaguePlayers: 0, leagueClans: 0, matchPlayerStats: 0, matches: 0 },
    })
    await expect(restoreRatingSnapshotStream({ path, dryRun: true })).rejects.toThrow(/종류/)
  })
})

describe('래더 백업 — 형식 자동 판별', () => {
  it('v2(JSONL) 를 알아본다', async () => {
    const path = buildFile('auto-v2.jsonl')
    const result = await restoreRatingSnapshotAuto({ path, dryRun: true })
    expect(result.restored.leaguePlayers).toBe(0)
  })

  it('season0Apply 백업은 되돌리는 길을 알려 주고 거부한다', async () => {
    /* 이 파일을 v1 로 읽으면 「손상됐다」는 엉뚱한 말이 나온다.
       사람이 멀쩡한 백업을 버리게 되는 자리라 문구까지 고정한다 */
    const path = join(dir, 'season0.json')
    writeFileSync(
      path,
      JSON.stringify(
        { version: 1, kind: 'season0Apply-writable-tables', leagueSlug: 'supply', leaguePlayers: [] },
        null,
        1,
      ),
      'utf8',
    )
    await expect(restoreRatingSnapshotAuto({ path, dryRun: true })).rejects.toThrow(/season0Apply/)
  })

  it('v1(통짜 JSON) 은 v1 경로로 보낸다', async () => {
    const body = { leaguePlayers: [], leagueClans: [], matchPlayerStats: [], matches: [] }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)
    const path = join(dir, 'auto-v1.json')
    writeFileSync(
      path,
      JSON.stringify(
        {
          version: 1,
          leagueSlug: 'supply',
          takenAt: 'fixed',
          counts: { leaguePlayers: 0, leagueClans: 0, matchPlayerStats: 0, matches: 0 },
          checksum,
          ...body,
        },
        null,
        2,
      ),
      'utf8',
    )
    const result = await restoreRatingSnapshotAuto({ path, dryRun: true })
    expect(result.restored).toEqual({ leaguePlayers: 0, leagueClans: 0, stats: 0, matches: 0 })
  })
})

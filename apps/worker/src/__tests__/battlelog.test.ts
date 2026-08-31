/**
 * 배틀로그 원문 적재 (D-174).
 *
 * 여기서 고정하는 것
 *   1. 응답의 이벤트 배열을 **키 이름이 흔들려도** 찾는다
 *   2. 주인(사람 키)을 모르는 줄은 **넣지 않는다.** 추측해서 키를 만들지 않는다
 *   3. `--confirm` 없이는 **DB 를 건드리지 않는다**
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eventsOf, importBattleLogs, isClanResponse } from '../jobs/battlelog.js'

function fixture(payload: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'battlelog-'))
  const file = join(dir, 'sample.json')
  writeFileSync(file, JSON.stringify(payload), 'utf8')
  return file
}

describe('이벤트 배열 찾기', () => {
  it('배열이 그대로 오면 그대로 쓴다', () => {
    expect(eventsOf([{ event_type: 'kill' }])).toHaveLength(1)
  })

  it('battleLog / battleLogs / logs 어느 키에 있어도 찾는다', () => {
    expect(eventsOf({ battleLog: [{ event_type: 'kill' }] })).toHaveLength(1)
    expect(eventsOf({ battleLogs: [{ event_type: 'kill' }] })).toHaveLength(1)
    expect(eventsOf({ logs: [{ event_type: 'kill' }] })).toHaveLength(1)
  })

  it('못 찾으면 빈 배열이다 — 던지지 않는다. 원문은 그대로 보존해야 한다', () => {
    expect(eventsOf({ 무엇인가: 1 })).toEqual([])
    expect(eventsOf(null)).toEqual([])
  })
})

describe('원문 적재 미리보기', () => {
  it('--confirm 없으면 한 줄도 쓰지 않고 세기만 한다', async () => {
    const file = fixture({
      rows: [
        {
          matchKey: 'T174-a',
          strUsn: 'u1',
          raw: {
            battleLog: [
              { event_type: 'kill', kill_x: 100, kill_y: 200 },
              { event_type: 'death', death_x: 110, death_y: 210 },
            ],
          },
        },
      ],
    })
    const result = await importBattleLogs({ file })
    expect(result.rows).toBe(1)
    expect(result.stored).toBe(0)
    expect(result.events).toBe(2)
    expect(result.points).toBe(2)
  })

  it('주인을 모르는 줄은 넣지 않는다', async () => {
    const file = fixture({ rows: [{ matchKey: 'T174-b', raw: { battleLog: [] } }] })
    const result = await importBattleLogs({ file })
    expect(result.skipped).toBe(1)
    expect(result.stored).toBe(0)
  })

  it('주인이 안 적혀 있어도 이벤트의 str_usn 으로 알아낸다', async () => {
    const file = fixture({
      rows: [{ matchKey: 'T174-c', raw: { battleLog: [{ event_type: 'kill', str_usn: 'u9', kill_x: 1, kill_y: 2 }] } }],
    })
    const result = await importBattleLogs({ file })
    expect(result.skipped).toBe(0)
    expect(result.points).toBe(1)
  })

  it('수집 실패는 실패로 센다 — 조용히 넘어가지 않는다', async () => {
    const file = fixture({ rows: [], failures: [{ matchKey: 'T174-d', error: '500' }] })
    const result = await importBattleLogs({ file })
    expect(result.failures).toBe(1)
  })
})

describe('클랜 단위 응답과 선수 단위 응답을 가른다 (D-184)', () => {
  it('`teamList` 가 있으면 클랜 응답이다', () => {
    expect(isClanResponse({ battleLog: [], teamList: [{ team_no: '0', clan_no: '1' }] })).toBe(true)
  })

  it('`teamList` 가 없으면 선수 응답이다', () => {
    expect(isClanResponse({ battleLog: [{ str_usn: 'AAA' }] })).toBe(false)
    expect(isClanResponse(null)).toBe(false)
    expect(isClanResponse([{ str_usn: 'AAA' }])).toBe(false)
  })

  /**
   * 이걸 안 가르면 클랜 응답이 **첫 선수의 개인 로그로 둔갑한다.**
   * 그 선수 혼자 한 경기에서 10명분 좌표를 가진 것이 되어
   * 포지션 판정(`subjectKind: 'user'` 만 읽는다)이 통째로 오염된다.
   */
  it('클랜 응답의 주인은 안에 든 선수가 아니라 **클랜**이다', async () => {
    const file = fixture({
      rows: [
        {
          matchKey: '260820162642124001',
          clanNo: '070716026783',
          raw: {
            teamList: [
              { team_no: '0', clan_no: '070716026783' },
              { team_no: '1', clan_no: '060503000068' },
            ],
            battleLog: [
              { str_usn: '5A380D89F8DB6C66SA', event_type: 'kill', kill_x: 227, kill_y: 159, round: '1' },
            ],
          },
        },
      ],
    })
    /* `--confirm` 없이 돌린다 — DB 를 건드리지 않고 셈만 본다 */
    const result = await importBattleLogs({ file })
    expect(result.rows).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.events).toBe(1)
  })

  it('클랜 번호가 없는 클랜 응답은 넣지 않는다 — 주인을 지어내지 않는다', async () => {
    const file = fixture({
      rows: [{ matchKey: '260820162642124001', raw: { teamList: [], battleLog: [{ str_usn: 'AAA' }] } }],
    })
    const result = await importBattleLogs({ file })
    expect(result.skipped).toBe(1)
  })
})

/* ------------------------------------------------- D-218 에서 더한 것 --- */

describe('창구가 한 겹 싸서 넣은 원문 (D-218)', () => {
  it('payload.raw 아래 있어도 이벤트를 찾는다', () => {
    /* `/api/dev/barracks-ingest` 가 `{ source, matchKey, clanNo, raw }` 로 넣어 둔 행.
       이걸 못 펴면 그 행들이 포지션·라운드 집계에서 통째로 빠진다 */
    const wrapped = {
      source: 'nexon_barracks',
      matchKey: 'T216-a',
      clanNo: '000000000001',
      raw: { teamList: [{ clan_no: '1' }], battleLog: [{ event_type: 'kill' }] },
    }
    expect(eventsOf(wrapped)).toHaveLength(1)
    expect(isClanResponse(wrapped)).toBe(true)
  })
})

describe('폴더째 읽기 (D-218)', () => {
  it('확장자가 아니라 내용으로 고른다 — GUID .tmp 도 읽고 남의 파일은 건드리지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'battlelog-dir-'))
    /* 크롬이 떨어뜨린 이름 없는 파일 두 개 */
    writeFileSync(
      join(dir, '9f1c2b7e-0000-4000-8000-000000000001.tmp'),
      JSON.stringify({
        rows: [
          {
            matchKey: 'T216-b',
            clanNo: '000000000002',
            raw: { teamList: [{ clan_no: '2' }], battleLog: [{ event_type: 'kill', kill_x: 1, kill_y: 2 }] },
          },
        ],
      }),
      'utf8',
    )
    writeFileSync(
      join(dir, '9f1c2b7e-0000-4000-8000-000000000002.tmp'),
      JSON.stringify([
        {
          matchKey: 'T216-c',
          clanNo: '000000000003',
          raw: { teamList: [{ clan_no: '3' }], battleLog: [{ event_type: 'kill', kill_x: 3, kill_y: 4 }] },
        },
      ]),
      'utf8',
    )
    /* 우리 것이 아닌 파일들 — 하나는 JSON 도 아니다 */
    writeFileSync(join(dir, 'notes.txt'), '이건 우리 것이 아니다', 'utf8')
    writeFileSync(join(dir, 'other.json'), JSON.stringify({ hello: 'world' }), 'utf8')

    const result = await importBattleLogs({ file: dir })
    expect(result.rows).toBe(2)
    expect(result.stored).toBe(0) // --confirm 이 없으니 한 줄도 안 쓴다
    expect(result.events).toBe(2)
    expect(result.points).toBe(2)
  })
})

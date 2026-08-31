/**
 * **명단 파일이 곧 계약이다** (D-210 후속).
 *
 * ── 왜 이 테스트가 있나
 *   IPL 명단에 클랜이 하나 들어오면, 그 클랜의 **과거 열산 경기가 소급해서
 *   「IPL끼리」가 된다.** 새로 들어온 경기가 아니라 이미 DB 에 있던 경기라서
 *   유입 차단(가드)은 아무 일도 하지 않는다. **치우는 수밖에 없다.**
 *
 *   2026-08-31 에 정확히 그 일이 났다 — 08-30 에 치웠고, 08-31 에 명단이
 *   39 → 43곳으로 자랐고, **아무도 청소를 다시 돌리지 않아서 63건이 남았다.**
 *   그때 남은 안전장치는 "사람이 기억한다" 뿐이었고, 잊혔다.
 *
 * ── 그래서 코드가 기억한다
 *   마지막 청소 때의 명단 지문을 `iplSanplyPurgeLog.ts` 에 박아 두고,
 *   지금 명단과 다르면 **여기가 빨개진다.** 워크플로의 `ipl-sanply-check` 도 같이 실패한다.
 *
 * ── 빨개졌다면 (명단을 고친 사람에게)
 *   ```
 *   node scripts/prod-run.mjs ipl-sanply-purge              # 몇 건인지 본다
 *   node scripts/prod-run.mjs ipl-sanply-purge --confirm    # 백업 뜨고 치운다
 *   ```
 *   치우면 그 명령이 `iplSanplyPurgeLog.ts` 에 붙여 넣을 블록을 그대로 찍어 준다.
 *   **지문만 고쳐서 초록으로 만들지 마라.** 그건 알람만 끄는 것이다.
 *
 * DB 를 쓰지 않는다 — 저장소 상태만으로 판정한다.
 */
import { describe, expect, it } from 'vitest'
import {
  IPL_ROSTER,
  diffIplRosterFingerprint,
  iplRosterFingerprint,
} from '../iplRoster'
import {
  IPL_SANPLY_LAST_PURGE,
  iplRosterDriftSinceLastPurge,
  nextPurgeRecordSnippet,
} from '../iplSanplyPurgeLog'

describe('명단 지문', () => {
  it('클랜이 들어오고 나가는 것만 지문을 바꾼다 — 티어 이동은 안 바꾼다', () => {
    const moved = IPL_ROSTER.map((entry, index) =>
      index === 0 ? { ...entry, tier: entry.tier === 2 ? 3 : 2 } : entry,
    )
    expect(iplRosterFingerprint(moved)).toBe(iplRosterFingerprint())

    const added = [
      ...IPL_ROSTER,
      { given: '테스트', name: '테스트', barracks: '__test__', tier: 6 },
    ]
    expect(iplRosterFingerprint(added)).not.toBe(iplRosterFingerprint())
  })

  it('순서를 바꿔도 같은 지문이다 — 명단 줄 위치는 뜻이 없다', () => {
    expect(iplRosterFingerprint([...IPL_ROSTER].reverse())).toBe(iplRosterFingerprint())
  })

  it('무엇이 늘고 빠졌는지 짚어 준다 — 사람이 눈으로 확인할 수 있어야 한다', () => {
    const added = [
      ...IPL_ROSTER,
      { given: '테스트', name: '테스트', barracks: '__test__', tier: 6 },
    ]
    const diff = diffIplRosterFingerprint(iplRosterFingerprint(), iplRosterFingerprint(added))
    expect(diff.added).toEqual(['__test__'])
    expect(diff.removed).toEqual([])
  })
})

describe('명단을 고쳤으면 열산을 치워야 한다', () => {
  it('지금 명단이 마지막 청소 때의 명단과 같다', () => {
    const drift = iplRosterDriftSinceLastPurge()
    expect(
      drift.drifted,
      [
        '',
        'IPL 명단이 마지막 청소 뒤로 바뀌었다.',
        drift.added.length > 0 ? `  들어온 클랜: ${drift.added.join(', ')}` : '',
        drift.removed.length > 0 ? `  빠진 클랜: ${drift.removed.join(', ')}` : '',
        '',
        '명단에 클랜이 들어오면 그 클랜의 **과거** 열산 경기가 소급해서',
        '「IPL끼리」가 된다. 유입 차단(가드)은 이미 DB 에 있는 경기를 막지 못한다.',
        '',
        '  node scripts/prod-run.mjs ipl-sanply-purge --confirm',
        '',
        '치운 뒤 packages/db/ops/iplSanplyPurgeLog.ts 를 갱신해라',
        '(그 명령이 붙여 넣을 블록을 그대로 찍어 준다).',
        '지문만 고쳐서 초록으로 만들지 마라 — 그건 알람만 끄는 것이다.',
        '',
      ].join('\n'),
    ).toBe(false)
  })

  it('청소 기록이 비어 있지 않다 — 언제 무엇을 치웠는지 남아 있어야 한다', () => {
    expect(IPL_SANPLY_LAST_PURGE.targetLeagueSlug).toBe('sanply')
    expect(Number.isNaN(Date.parse(IPL_SANPLY_LAST_PURGE.purgedAt))).toBe(false)
    expect(IPL_SANPLY_LAST_PURGE.note.length).toBeGreaterThan(0)
    expect(IPL_SANPLY_LAST_PURGE.fingerprint).toMatch(/^\d+:/)
  })

  it('청소 뒤 붙여 넣을 블록에 **지금** 지문이 들어간다', () => {
    const snippet = nextPurgeRecordSnippet({
      targetLeagueSlug: 'sanply',
      matchesDeleted: 7,
      leagueClansExpelled: 1,
      backupPath: '/tmp/backup.json',
    })
    expect(snippet).toContain(iplRosterFingerprint())
    expect(snippet).toContain('matchesDeleted: 7')
    expect(snippet).toContain('/tmp/backup.json')
  })
})

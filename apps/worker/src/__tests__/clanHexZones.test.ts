/**
 * `loadClanHexZones` — 구역 파일이 **말한 것만** 넘긴다 (2026-09-02 · D-256).
 *
 * ── 왜 이 테스트가 있는가
 *   이 함수는 예전에 파일에 무엇이 있든 상수 `A_ATTACK_ZONE_LABELS` 를 그대로 넘겼다.
 *   그래서 파일에 구역이 둘밖에 없어도 저장된 `zoneLabels` 는 **「넷 썼다」고 우겼다.**
 *   ⑥ 의 숫자는 셀 집합으로 계산되므로 옳았지만, «몇 구역으로 잰 값인가» 라는
 *   **출처 표시가 거짓**이 됐다. 그러면 나중에 어느 행이 옛 규칙으로 만들어졌는지 가릴 수 없다.
 *
 *   실제로 그 일이 났다 — 155개 요약이 전부 `["CONDWI","SEOLDAE"]` 인데
 *   상수는 이미 넷이었다. 값과 표시가 갈려 있었고, 아무도 그걸 못 봤다.
 *
 * ── 여기서 지키는 경계
 *   ```
 *   「어느 구역이 A어택인가」  의미 결정   → 코드(A_ATTACK_ZONE_LABELS)
 *   「그 구역이 칠해져 있는가」 데이터     → data/barracks/style-zones.json
 *   ```
 *   둘을 섞지 않는다.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { A_ATTACK_ZONE_LABELS, B_LONG_ZONE_LABEL } from '@sacloud/nexon'
import { loadClanHexZones } from '../jobs/clanHexV2Build.js'
import { REPO_ROOT } from '../lib/env.js'

/** 실제 구역 파일 — 사용자가 직접 칠한 것이다. **이 테스트가 값을 만들지 않는다** */
const REAL_FILE = join(REPO_ROOT, 'data/barracks/style-zones.json')

function writeZoneFile(zone: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sacloud-zone-'))
  const file = join(dir, 'zones.json')
  writeFileSync(file, JSON.stringify({ cell: 10, zone }), 'utf8')
  return file
}

describe('loadClanHexZones — 실제 파일', () => {
  it('⑥ 구역 넷이 **다 칠해져 있다** (2026-08-29 사용자가 직접 칠했다)', () => {
    const load = loadClanHexZones(REAL_FILE)
    expect(load.zones.attackLabels).toEqual([...A_ATTACK_ZONE_LABELS])
    expect(load.zones.attackLabels).toHaveLength(4)
  })

  /* ★ 녹뒤 6칸 · 머리 6칸은 사용자가 「맞다」고 확정했다. 작다고 의심하거나 넓히지 않는다 */
  it('`녹뒤` · `머리` 는 각각 6칸이다 — 작아도 맞는 값이다', () => {
    const load = loadClanHexZones(REAL_FILE)
    expect(load.cells['NOKDWI']).toBe(6)
    expect(load.cells['MERI']).toBe(6)
    expect(load.cells['CONDWI']).toBe(19)
    expect(load.cells['SEOLDAE']).toBe(15)
  })

  it('①`A쪽` 과 ⑥ 은 같은 집합이고, `B롱`(비롱)은 따로다', () => {
    const load = loadClanHexZones(REAL_FILE)
    /* 19 + 15 + 6 + 6 */
    expect(load.zones.attack?.cells).toHaveLength(46)
    expect(load.zones.aSide?.cells).toHaveLength(46)
    expect(load.zones.bLong?.cells).toHaveLength(97)
    expect(B_LONG_ZONE_LABEL).toBe('BIRONG')
  })

  it('⑥ 구역과 `B롱` 은 **한 칸도 안 겹친다**', () => {
    const load = loadClanHexZones(REAL_FILE)
    const attack = new Set(load.zones.attack?.cells ?? [])
    const overlap = (load.zones.bLong?.cells ?? []).filter((cell) => attack.has(cell))
    expect(overlap).toEqual([])
  })
})

describe('loadClanHexZones — 파일이 말하는 것만 넘긴다', () => {
  it('칠해지지 않은 라벨은 `attackLabels` 에서 **빠진다**', () => {
    /* 옛날 상태를 재현한다 — 컨뒤·A설대만 칠해져 있던 때 */
    const file = writeZoneFile({ '1,1': 'CONDWI', '2,2': 'SEOLDAE', '3,3': 'BIRONG' })
    const load = loadClanHexZones(file)
    expect(load.zones.attackLabels).toEqual(['CONDWI', 'SEOLDAE'])
    expect(load.cells['NOKDWI']).toBe(0)
    expect(load.cells['MERI']).toBe(0)
  })

  it('한 칸이라도 있으면 남는다 — 작다고 빼지 않는다', () => {
    const file = writeZoneFile({ '9,9': 'MERI' })
    const load = loadClanHexZones(file)
    expect(load.zones.attackLabels).toEqual(['MERI'])
    expect(load.zones.attack?.cells).toEqual(['9,9'])
  })

  it('⑥ 구역이 하나도 없으면 `attack` 이 `null` 이다 — 0 으로 채우지 않는다 (D-106)', () => {
    const file = writeZoneFile({ '3,3': 'BIRONG' })
    const load = loadClanHexZones(file)
    expect(load.zones.attack).toBeNull()
    expect(load.zones.attackLabels).toEqual([])
    /* `B롱` 은 살아 있다 — 없는 것과 있는 것을 함께 죽이지 않는다 */
    expect(load.zones.bLong?.cells).toEqual(['3,3'])
  })

  it('파일이 없으면 아무것도 넘기지 않는다. 좌표를 지어내지 않는다', () => {
    const load = loadClanHexZones(join(tmpdir(), 'sacloud-no-such-zone-file.json'))
    expect(load.file).toBeNull()
    expect(load.zones).toEqual({})
    expect(load.cells).toEqual({})
  })
})

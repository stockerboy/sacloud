import { describe, expect, it } from 'vitest'
import { buildClanHexV2Raw, sumClanHexTallies } from '../clanTraitsV2'
import type { ClanHexTallyLike } from '../clanTraitsV2'

/*
 * 회귀 — **운영에 쌓인 옛 tally 에는 새 축의 칸이 아예 없다.**
 *
 * 2026-09-02, 새 축(sniperDuel · firstBlood · trade)을 넣은 뒤 운영에서 클랜
 * 육각형이 통째로 사라졌다. 옛 요약 행에 그 칸이 없어 `undefined` 였고, 축 분기가
 * `=== null` 로만 막아 그대로 `part.won` 에서 터졌다. 화면 질의의
 * `.catch(() => null)` 이 그 예외를 삼켜 **오류 한 줄 없이 카드만 사라졌다.**
 * 버전을 v2.1 로 되돌려도 안 나온 진짜 이유가 이것이다.
 *
 * 아래 픽스처는 **지어낸 모양이 아니다.** 2026-09-02 운영 DB 의 `ClanHexV2Summary`
 * 에서 실제로 꺼낸 행이다(경기 521건 · clan-hex-v2.1). 읽기 편하라고
 * `tempo.redClearThreeSecondsLowerBound` 배열만 앞 3개로 잘랐다 — 그 축은
 * 합(`...Sum`)으로 계산하므로 자른 것이 값 판정을 바꾸지 않는다.
 *
 * 처음엔 이 모양을 손으로 지어냈다가 틀렸다(`tempo` 를 `{seconds, rounds}` 로 썼다).
 * **깨진 것을 재현하는 테스트는 깨진 그 데이터로 쓴다.**
 */
const LEGACY_TALLY = JSON.parse(`
{
  "save": {
    "won": 518,
    "rounds": 3600
  },
  "tempo": {
    "redRounds": 2798,
    "redClearThreeRounds": 1653,
    "redRoundsWithoutThreeClears": 1145,
    "redClearThreeSecondsLowerBound": [
      49,
      8,
      27
    ],
    "redClearThreeSecondsLowerBoundSum": 44926
  },
  "rounds": 6048,
  "teamNo": "0",
  "foeTeamNo": null,
  "redRounds": 2798,
  "attackZone": {
    "redRounds": 2793,
    "zoneLabels": [
      "CONDWI",
      "SEOLDAE"
    ],
    "redWonRounds": 925,
    "redWonZoneSniperRounds": {
      "byKiller": 23,
      "byVictim": 206
    },
    "sniperKillsInNamedZone": {
      "byKiller": 37,
      "byVictim": 393
    },
    "redLostZoneSniperRounds": {
      "byKiller": 13,
      "byVictim": 177
    },
    "sniperKillsWithPosition": {
      "byKiller": 1521,
      "byVictim": 1521
    },
    "sniperKillsOutsideNamedZone": {
      "byKiller": 1484,
      "byVictim": 1128
    }
  },
  "foeSnipers": 515,
  "lastSniper": {
    "wonRounds": 2778,
    "redWonRounds": 916,
    "wonSniperLast": 739,
    "noFoeDeathRounds": 13,
    "redWonSniperLast": 244,
    "ambiguousLastRounds": 14,
    "unknownLastWeaponRounds": 13
  },
  "outnumbered": {
    "won": 1023,
    "rounds": 3938
  },
  "sidedRounds": 5594,
  "sniperFight": {
    "redRounds": 2793,
    "aSideKills": {
      "byKiller": 37,
      "byVictim": 393
    },
    "bLongKills": {
      "byKiller": 224,
      "byVictim": 32
    },
    "unzonedKills": {
      "byKiller": 1260,
      "byVictim": 1096
    },
    "foeSniperKills": 1521,
    "killsWithPosition": {
      "byKiller": 1521,
      "byVictim": 1521
    }
  }
}`) as ClanHexTallyLike

describe('옛 tally(새 칸 없음)를 넣어도 육각형이 죽지 않는다', () => {
  it('픽스처에 새 축의 칸이 정말 없다 — 이게 전제다', () => {
    const raw = LEGACY_TALLY as unknown as Record<string, unknown>
    expect('sniperDuel' in raw).toBe(false)
    expect('firstBlood' in raw).toBe(false)
    expect('trade' in raw).toBe(false)
  })

  it('터지지 않고 여섯 축을 돌려준다', () => {
    const hex = buildClanHexV2Raw({ tally: LEGACY_TALLY, matches: 521 })
    expect(hex.axes.length).toBe(6)
  })

  it('칸이 없는 축은 측정중이고, 있는 축은 값이 그대로 나온다', () => {
    const hex = buildClanHexV2Raw({ tally: LEGACY_TALLY, matches: 521 })
    const at = (key: string) => hex.axes.find((axis) => axis.key === key)

    /* 칸이 없던 축 — 사라지지 않고 「측정중」으로 떨어진다 */
    for (const key of ['sniperDuel', 'firstBlood', 'trade']) {
      expect(at(key), `${key} 축이 있어야 한다`).toBeDefined()
      /* 측정 못 한 축은 `pending` 에 사유가 들어가고 `raw` 가 null 이다 */
      expect(at(key)?.pending, `${key} 는 측정중이어야 한다`).not.toBeNull()
      expect(at(key)?.raw, `${key} 는 값이 없어야 한다`).toBeNull()
    }

    /* 핵심 — 하나가 없다고 **나머지까지 죽지 않는다** */
    const save = at('save')
    expect(save?.pending).toBeNull()
    expect(save?.numerator).toBe(518)
    expect(save?.denominator).toBe(3600)

    const outnumbered = at('outnumbered')
    expect(outnumbered?.pending).toBeNull()
    expect(outnumbered?.numerator).toBe(1023)
    expect(outnumbered?.denominator).toBe(3938)
  })

  it('합산도 옛 tally 를 견딘다', () => {
    const sum = sumClanHexTallies([LEGACY_TALLY, LEGACY_TALLY])
    expect(sum.save?.won).toBe(518 * 2)
    expect(sum.sniperDuel).toBeNull()
    expect(buildClanHexV2Raw({ tally: sum, matches: 1042 }).axes.length).toBe(6)
  })
})

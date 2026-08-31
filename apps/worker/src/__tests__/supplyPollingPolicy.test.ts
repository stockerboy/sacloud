import { describe, expect, it } from 'vitest'
import {
  estimateSupplyCycleRequests,
  isSupplyClanDue,
  readSupplyPollingConfig,
  selectSupplyClansToScan,
  supplyClanTier,
  supplyCycleIndex,
  SUPPLY_POLLING_DEFAULTS,
  ticksForTier,
  type SupplyClanActivity,
} from '../lib/supplyPollingPolicy.js'

/**
 * 적응형 클랜 폴링을 **DB 없이** 고정한다.
 *
 * 여기서 지키는 것은 넷이다 —
 *   1. 등급은 마지막 경기 시각 하나로 정한다 (경계값 포함)
 *   2. 같은 입력이면 언제나 같은 답이다 (러너가 매번 새로 떠도 흔들리지 않는다)
 *   3. **굶는 클랜이 없다** — 어떤 클랜도 자기 주기 안에 반드시 한 번 차례가 온다
 *   4. 한산한 시간대에는 훑는 클랜이 실제로 줄어든다
 */

const config = SUPPLY_POLLING_DEFAULTS
const now = new Date('2026-08-28T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)

describe('supplyClanTier — 마지막 경기 시각 하나로 정한다', () => {
  it('경기가 없으면 dormant 다. 0 으로 채우거나 hot 으로 올리지 않는다', () => {
    expect(supplyClanTier(null, now, config)).toBe('dormant')
  })

  it('구간마다 등급이 다르다', () => {
    expect(supplyClanTier(hoursAgo(0.1), now, config)).toBe('hot')
    expect(supplyClanTier(hoursAgo(48), now, config)).toBe('warm')
    expect(supplyClanTier(hoursAgo(200), now, config)).toBe('cold')
    expect(supplyClanTier(hoursAgo(1000), now, config)).toBe('dormant')
  })

  it('경계는 "미만" 이다 — 6시간 정각은 hot 이 아니다', () => {
    expect(supplyClanTier(hoursAgo(5.99), now, config)).toBe('hot')
    expect(supplyClanTier(hoursAgo(6), now, config)).toBe('warm')
    expect(supplyClanTier(hoursAgo(71.99), now, config)).toBe('warm')
    expect(supplyClanTier(hoursAgo(72), now, config)).toBe('cold')
    expect(supplyClanTier(hoursAgo(503.99), now, config)).toBe('cold')
    expect(supplyClanTier(hoursAgo(504), now, config)).toBe('dormant')
  })

  it('시계가 어긋나 미래 시각이 와도 hot 으로 본다 — 놓치는 쪽보다 낫다', () => {
    expect(supplyClanTier(new Date(now.getTime() + 3_600_000), now, config)).toBe('hot')
  })
})

describe('차례 판정 — 상태를 저장하지 않고 시계에서 계산한다', () => {
  it('hot 은 매 사이클 본다', () => {
    for (let cycle = 0; cycle < 20; cycle += 1) {
      expect(isSupplyClanDue({ slug: 'anyclan', tier: 'hot', cycleIndex: cycle, config })).toBe(true)
    }
  })

  it('사이클 번호는 epoch 기준이라 같은 시각이면 같은 값이다', () => {
    const a = supplyCycleIndex(new Date('2026-08-28T12:03:59.000Z'), config)
    const b = supplyCycleIndex(new Date('2026-08-28T12:00:00.000Z'), config)
    expect(a).toBe(b)
    expect(supplyCycleIndex(new Date('2026-08-28T12:05:00.000Z'), config)).toBe(a + 1)
  })

  it.each(['warm', 'cold', 'dormant'] as const)(
    '%s 은 자기 주기 안에 정확히 한 번 차례가 온다 (굶지 않는다)',
    (tier) => {
      const ticks = ticksForTier(tier, config)
      for (const slug of ['aaa', 'zzz', '한글클랜', 'One.PoinT', 'e2stro-']) {
        let due = 0
        for (let cycle = 1000; cycle < 1000 + ticks; cycle += 1) {
          if (isSupplyClanDue({ slug, tier, cycleIndex: cycle, config })) due += 1
        }
        expect(due).toBe(1)
      }
    },
  )

  it('dormant 도 하루에 한 번은 반드시 본다', () => {
    const ticks = ticksForTier('dormant', config)
    expect(ticks * config.cycleMinutes).toBe(1440)
  })
})

describe('selectSupplyClansToScan — 이번 사이클에 볼 목록', () => {
  const clans: SupplyClanActivity[] = [
    { slug: 'hot-a', lastMatchAt: hoursAgo(1) },
    { slug: 'hot-b', lastMatchAt: hoursAgo(2) },
    { slug: 'warm-a', lastMatchAt: hoursAgo(30) },
    { slug: 'cold-a', lastMatchAt: hoursAgo(200) },
    { slug: 'dormant-a', lastMatchAt: null },
  ]

  it('hot 은 언제나 들어 있다', () => {
    const picked = selectSupplyClansToScan({ clans, now, config })
    expect(picked.scan).toContain('hot-a')
    expect(picked.scan).toContain('hot-b')
    expect(picked.byTier.hot.total).toBe(2)
    expect(picked.byTier.hot.due).toBe(2)
  })

  it('같은 입력이면 같은 답이다 (순서까지)', () => {
    const a = selectSupplyClansToScan({ clans, now, config })
    const b = selectSupplyClansToScan({ clans, now, config })
    expect(a.scan).toEqual(b.scan)
    expect(a.cycleIndex).toBe(b.cycleIndex)
  })

  const quiet50: SupplyClanActivity[] = Array.from({ length: 50 }, (_, index) => ({
    slug: `quiet-${index}`,
    lastMatchAt: null,
  }))

  it('하한을 끄면(0) 한산한 클랜은 하루 한 번씩만 본다 — 티어 주기 그대로', () => {
    const noFloor = { ...config, minClansPerCycle: 0 }
    let totalScanned = 0
    for (let step = 0; step < 288; step += 1) {
      const at = new Date(now.getTime() + step * noFloor.cycleMinutes * 60_000)
      totalScanned += selectSupplyClansToScan({ clans: quiet50, now: at, config: noFloor }).scan
        .length
    }
    /* 하루 288 사이클에 50개를 정확히 한 번씩 — 전부 훑으면 14,400 이다 */
    expect(totalScanned).toBe(50)
  })

  /* ── 하한 (D-225).
     티어는 **우리가 수집해야** 갱신되는 값으로 정해지므로, 수집이 뜸해지면 티어가 스스로
     내려가 더 뜸해진다. 운영에서 대룰리그가 그 고리에 빠져 사이클당 1곳만 훑었고
     최신 경기가 49시간 밀렸다. 아래 세 가지가 그 고리를 끊는 성질이다. */
  it('하한이 있으면 조용한 리그도 사이클마다 최소 그만큼은 훑는다', () => {
    const floored = { ...config, minClansPerCycle: 6 }
    for (let step = 0; step < 20; step += 1) {
      const at = new Date(now.getTime() + step * floored.cycleMinutes * 60_000)
      const picked = selectSupplyClansToScan({ clans: quiet50, now: at, config: floored })
      expect(picked.scan.length).toBe(6)
      expect(new Set(picked.scan).size).toBe(6) // 같은 클랜을 두 번 담지 않는다
    }
  })

  it('하한으로 채우는 자리는 **돌아간다** — 특정 클랜만 계속 뽑히지 않는다', () => {
    const floored = { ...config, minClansPerCycle: 6 }
    const seen = new Set<string>()
    /* 50곳 ÷ 사이클당 6곳 → 9사이클이면 한 바퀴가 돈다. 넉넉히 20사이클을 본다 */
    for (let step = 0; step < 20; step += 1) {
      const at = new Date(now.getTime() + step * floored.cycleMinutes * 60_000)
      for (const slug of selectSupplyClansToScan({ clans: quiet50, now: at, config: floored }).scan) {
        seen.add(slug)
      }
    }
    expect(seen.size).toBe(50)
  })

  it('바쁜 리그에서는 하한이 아무것도 바꾸지 않는다 (toppedUp 0)', () => {
    const floored = { ...config, minClansPerCycle: 6 }
    const busy: SupplyClanActivity[] = Array.from({ length: 30 }, (_, index) => ({
      slug: `hot-${index}`,
      lastMatchAt: hoursAgo(1),
    }))
    const picked = selectSupplyClansToScan({ clans: busy, now, config: floored })
    expect(picked.toppedUp).toBe(0)
    expect(picked.scan.length).toBe(30) // hot 은 매 사이클 전부 본다
  })

  it('하한은 상한을 넘지 못한다', () => {
    const clamped = { ...config, minClansPerCycle: 20, maxClansPerCycle: 4 }
    const picked = selectSupplyClansToScan({ clans: quiet50, now, config: clamped })
    expect(picked.scan.length).toBe(4)
  })

  it('상한에 걸리면 높은 티어부터 채우고 나머지를 미룬다 (빠뜨리지 않는다)', () => {
    const many: SupplyClanActivity[] = [
      ...Array.from({ length: 10 }, (_, index) => ({
        slug: `h${index}`,
        lastMatchAt: hoursAgo(1),
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        slug: `w${index}`,
        lastMatchAt: hoursAgo(30),
      })),
    ]
    const capped = selectSupplyClansToScan({
      clans: many,
      now,
      config: { ...config, maxClansPerCycle: 5 },
    })
    expect(capped.scan).toHaveLength(5)
    expect(capped.scan.every((slug) => slug.startsWith('h'))).toBe(true)
    expect(capped.deferred).toBeGreaterThan(0)
  })

  it('클랜 하나하나가 하루 안에 반드시 한 번은 뽑힌다', () => {
    const mixed: SupplyClanActivity[] = [
      { slug: 'a', lastMatchAt: null },
      { slug: 'b', lastMatchAt: hoursAgo(600) },
      { slug: 'c', lastMatchAt: hoursAgo(200) },
      { slug: 'd', lastMatchAt: hoursAgo(30) },
    ]
    const seen = new Set<string>()
    for (let step = 0; step < 288; step += 1) {
      const at = new Date(now.getTime() + step * config.cycleMinutes * 60_000)
      for (const slug of selectSupplyClansToScan({ clans: mixed, now: at, config }).scan) {
        seen.add(slug)
      }
    }
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('설정', () => {
  it('환경변수로 주기를 덮어쓴다 — 코드에 박아 두지 않는다', () => {
    const custom = readSupplyPollingConfig({
      SUPPLY_POLL_CYCLE_MINUTES: '10',
      SUPPLY_POLL_HOT_MINUTES: '20',
      SUPPLY_POLL_MAX_CLANS: '7',
    })
    expect(custom.cycleMinutes).toBe(10)
    expect(custom.intervalMinutes.hot).toBe(20)
    expect(custom.maxClansPerCycle).toBe(7)
    /* 안 준 값은 기본값 그대로 */
    expect(custom.intervalMinutes.dormant).toBe(SUPPLY_POLLING_DEFAULTS.intervalMinutes.dormant)
  })

  it('말이 안 되는 값은 무시하고 기본값을 쓴다', () => {
    const custom = readSupplyPollingConfig({ SUPPLY_POLL_HOT_MINUTES: '0', SUPPLY_POLL_WARM_MINUTES: 'x' })
    expect(custom.intervalMinutes.hot).toBe(SUPPLY_POLLING_DEFAULTS.intervalMinutes.hot)
    expect(custom.intervalMinutes.warm).toBe(SUPPLY_POLLING_DEFAULTS.intervalMinutes.warm)
  })
})

describe('요청량 모델', () => {
  it('사이클 요청 수는 고정비 + 훑는 클랜 + 새 경기 상세다', () => {
    expect(
      estimateSupplyCycleRequests({
        leagueLookups: 0,
        rankPages: 14,
        clansScanned: 28,
        pagesPerClan: 1,
        newMatchDetails: 1,
      }),
    ).toBe(43)
  })
})

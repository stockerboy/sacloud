'use client'

/**
 * ★어떻게 재는가★ — 플레이분석 탭의 왼쪽 칸 (2026-09-11 사장님)
 *
 * > «픽셀 단위로 뽑아서 배틀로그를 통해 실시간 분석하고 데이터를 가공하여 이런 정보가 올라간다고
 * >  하면서, 우리가 사용했던 픽셀 칠하는 그것도 보여주면 좋겠어»
 * > 말투는 «했습니다 · 데이터입니다». 넣을 것은 1·2·3·5, ★스나싸움 측정 방법을 1번★ 으로.
 *
 * 여기 적힌 숫자는 ★전부 실제 코드·자료에서 온 것★ 이다. 지어낸 문구가 없다 —
 *   268칸 · 9구역      `data/barracks/style-zones.json` (→ `zoneMap.ts` 로 옮겨 담았다)
 *   픽셀 환산식        같은 파일의 `source`
 *   2초 · 10판 · 20회  `playerHexScore.ts` 의 BURST_GAP_SECONDS · MIN_WEAPON_GAMES · MIN_DUELS
 *   30분               `season0-apply.sh` 크론
 *   원본 그림          `/assets/zone-paint.webp` = data/barracks/evidence-zonecheck.png
 *
 * PC 에서만 보인다 (폰은 육각형만). 칸 그림은 SVG 로 그 자리에서 그린다 — 사진이 아니라 ★자료★ 다.
 */
import { useEffect, useRef, useState } from 'react'
import { V3 } from './tokens'
import { ZONE_BOUNDS, ZONE_CELL, ZONE_CELLS, ZONE_LABELS, ZONE_LONG, ZONE_TOTAL_CELLS } from './zoneMap'

/** 구역 색 — 롱 안쪽은 따뜻한 계열, 바깥은 찬 계열 */
const ZONE_COLOR: Readonly<Record<string, string>> = {
  BIRONG: '#ff5a63',
  CONDWI: '#ff8a5c',
  NOKDWI: '#ffb45c',
  MERI: '#ffd166',
  HOLJEONG: '#ff7ac8',
  GJA: '#c98bff',
  BUNKER: '#5b8dff',
  DALBANG: '#49c6e5',
  SEOLDAE: '#5be0a0',
}

const PAD = 1
const W = ZONE_BOUNDS.maxX - ZONE_BOUNDS.minX + 1 + PAD * 2
const H = ZONE_BOUNDS.maxY - ZONE_BOUNDS.minY + 1 + PAD * 2
const isLong = (key: string) => (ZONE_LONG as readonly string[]).includes(key)

function ZoneMap() {
  const ref = useRef<SVGSVGElement>(null)
  const [on, setOn] = useState(0)
  /* 칸이 하나씩 켜진다 — 화면에 들어올 때마다 다시 */
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(1); return }
    let seen = false
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) { if (e.isIntersecting && !seen) { seen = true; setOn((n) => n + 1) } else if (!e.isIntersecting) seen = false } },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} aria-label={`구역 ${ZONE_TOTAL_CELLS}칸`}>
      <rect x="0" y="0" width={W} height={H} fill="#0a1220" />
      {Array.from({ length: Math.ceil(W / 10) + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2={H} stroke="#16203a" strokeWidth={0.08} />
      ))}
      {Array.from({ length: Math.ceil(H / 10) + 1 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 10} x2={W} y2={i * 10} stroke="#16203a" strokeWidth={0.08} />
      ))}
      {Object.entries(ZONE_CELLS).map(([key, cells]) => (
        <g key={key} fill={ZONE_COLOR[key] ?? '#5b8dff'} opacity={isLong(key) ? 0.85 : 0.42}>
          {cells.map(([x, y], i) => (
            <rect
              key={`${x}-${y}`}
              x={x - ZONE_BOUNDS.minX + PAD}
              y={y - ZONE_BOUNDS.minY + PAD}
              width={0.92}
              height={0.92}
              rx={0.16}
              style={on > 0 ? { animation: `v3ZoneIn .5s ease-out ${(i % 20) * 0.022 + 0.05}s both` } : undefined}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}

function Num({ value, unit, note }: { value: string; unit: string; note: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 21, fontWeight: 800, color: '#dbe8ff', letterSpacing: '-.01em' }}>{value}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: V3.textDim }}>{unit}</span>
      </span>
      <span style={{ fontSize: 10, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{note}</span>
    </span>
  )
}

function Block({ no, head, children }: { no: string; head: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
      <span style={{ flex: 'none', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: '#4e6ea8', paddingTop: 2 }}>{no}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#e8eeff', letterSpacing: '-.01em' }}>{head}</span>
        <span style={{ fontSize: 11.5, color: V3.textDim, lineHeight: 1.7 }}>{children}</span>
      </span>
    </div>
  )
}

const K = ({ children }: { children: React.ReactNode }) => <b style={{ color: '#c7d0e6' }}>{children}</b>

const AXES: readonly (readonly [string, string])[] = [
  ['세이브', '혼자 남아 이긴 라운드를 셉니다'],
  ['샷싸움', '롱 안 스나 대 스나 승률입니다'],
  ['캐리력', '이긴 라운드에서 맡은 몫입니다'],
  ['선짤', '라운드 첫 킬을 냈는지 봅니다'],
  ['연속킬', '2초 안에 이어진 킬입니다'],
  ['소수싸움', '인원이 모자란 상황의 승률입니다'],
]

export function AnalysisPanelV3() {
  return (
    <div className="v3-analysis" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 4px 10px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: '#7fa9ff' }}>HOW WE MEASURE</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#ffffff', letterSpacing: '-.01em' }}>전장을 칸으로 잘라 셉니다</span>
        <span style={{ fontSize: 11.5, color: V3.textGhost2, lineHeight: 1.65 }}>
          병영수첩 배틀로그를 30분마다 받아 킬 한 줄 한 줄을 좌표로 되돌리고, 그 좌표를 칸에 맞춰 여섯 축으로 가공합니다.
        </span>
      </div>

      {/* ① 스나싸움 — 사장님 지시로 맨 앞 */}
      <Block no="01" head="스나싸움은 이렇게 쟀습니다">
        A롱을 <K>컨뒤 · 녹뒤 · 머리 · 홀정면 · ㄱ자</K> 와 <K>비롱</K> 으로 나눠 칠했습니다.
        그 안에서 <K>잡은 쪽과 죽은 쪽이 둘 다 롱 안</K> 일 때만 한 판으로 셉니다.
        롱 밖에서 난 교전은 샷싸움에 넣지 않습니다.
      </Block>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <span style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ZoneMap />
          <span style={{ fontSize: 9.5, color: V3.textGhost, letterSpacing: '.04em' }}>우리가 쓰는 {ZONE_TOTAL_CELLS}칸 (밝은 색 = A롱)</span>
        </span>
        <span style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img src="/assets/zone-paint.webp" alt="좌표 산점도 위에 칠한 원본" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 6, border: `1px solid ${V3.cardBorder}` }} />
          <span style={{ fontSize: 9.5, color: V3.textGhost, letterSpacing: '.04em' }}>원본 — 킬 좌표 위에 직접 칠한 그림</span>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
          {Object.entries(ZONE_LABELS).map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: ZONE_COLOR[key] ?? '#5b8dff', flex: 'none', opacity: isLong(key) ? 1 : 0.5 }} />
              <span style={{ fontSize: 11, color: isLong(key) ? '#e8eeff' : V3.textDim, fontWeight: isLong(key) ? 700 : 500 }}>{label}</span>
            </span>
          ))}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', padding: '12px 0', borderTop: `1px solid ${V3.rowDivider}`, borderBottom: `1px solid ${V3.rowDivider}` }}>
        <Num value={String(ZONE_TOTAL_CELLS)} unit="칸" note={`구역 ${Object.keys(ZONE_CELLS).length}곳`} />
        <Num value={String(ZONE_CELL)} unit="좌표" note="한 칸 크기" />
        <Num value="2" unit="초" note="연속킬 간격" />
        <Num value="30" unit="분" note="다시 접는 주기" />
      </div>

      {/* ② 픽셀 */}
      <Block no="02" head="픽셀을 자로 쟀습니다">
        킬 좌표 산점도(<K>1125 × 1219</K>) 위에 칠한 그림의 격자선으로 픽셀을 좌표로 되돌렸습니다.
        환산식은 <K>x = 0.70 + 2.446·px</K>, <K>y = 7.70 + 2.446·py</K> 입니다. 눈대중이 아닙니다.
      </Block>

      {/* ③ 죽은 자리 */}
      <Block no="03" head="죽은 자리로 셉니다">
        잡은 사람이 아니라 <K>죽은 사람이 서 있던 칸</K> 으로 셉니다.
        그래야 «어느 자리를 먹었나» 가 나옵니다.
      </Block>

      {/* ④ 여섯 축 */}
      <Block no="04" head="여섯 축으로 가공합니다">
        같은 리그 · 같은 무기 선수끼리만 줄을 세워 백분위를 냅니다.
      </Block>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px 14px', paddingLeft: 24 }}>
        {AXES.map(([name, desc]) => (
          <span key={name} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#dbe8ff', whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ fontSize: 10.5, color: V3.textGhost2, lineHeight: 1.5 }}>{desc}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

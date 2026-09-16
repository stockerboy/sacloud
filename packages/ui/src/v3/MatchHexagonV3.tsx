'use client'

/**
 * ★경기 육각형★ — 그 판 두 클랜을 ★한 판 위에 겹쳐★ 그린다 (2026-09-11 사장님)
 *
 * > «누르면 이긴팀이 파란색 진팀이 빨간색 한 그래프 판위에 두개 그려지게끔
 * >  (그래프 그려지는 프레임이나 효과 똑같이 해서)»
 *
 * ── 값의 뜻이 클랜 페이지와 ★다르다★
 *   클랜 페이지 육각형은 ★리그 안 백분위★ 다. 여기는 ★그 판 두 클랜의 상대 비교★ 다
 *   (`MatchDetail.red_hexagon_v2` 주석 · D-235 Q7). 큰 쪽이 1.0 이다.
 *   ⚠ 옛 서술은 «게임템포만 작은 쪽이 1.0 이다» 였다 — 2026-09-15 에 ④ 가 라이플화력이
 *     되면서 뒤집히는 축이 하나도 없어졌다.
 *   두 숫자를 같은 잣대로 읽으면 안 되니 화면에 «이 판 두 팀 비교» 라고 적어 둔다.
 *
 * ── 한쪽만 잰 축
 *   양쪽 다 `value=null` 로 온다 (`pending='compare'`). 그러면 그 축은 중심(0)에 둔다 —
 *   지어내지 않는다. 글자는 ★«없었음»★ 이다 — 클랜 페이지의 «측정중»(표본 부족)과 뜻이 다르다.
 *
 * 그리는 방법·프레임은 `Hexagon` 과 한 글자도 같다 (`useDrawIn` · `penDash`).
 */
import { useEffect, useRef, useState } from 'react'
import type { ClanHexagonV2 } from '@sacloud/contract'
import { HEX, HEX_LABELS, HEX_SPOKES, V3, hexPoint } from './tokens'
import { penDash, useDrawIn } from './seasonPlot'
import { matchVerdict, matchVerdictText } from './matchVerdict'

const RING_STEP = 10
const RINGS = Array.from({ length: 100 / RING_STEP }, (_, i) => (i + 1) * RING_STEP)

/** 축 차례·이름은 클랜 카드와 같다 (`clanHexAxes`) */
/* ⚠ ★2026-09-15★ — ④ 가 `tempo`(게임템포) 에서 `riflePower`(라이플화력) 로 바뀌었다 (사장님) */
/* ⚠ 2026-09-16 — ⑤ 가 선짤에서 스나영향력으로 (사장님) */
const ORDER = ['sniperDuel', 'outnumbered', 'save', 'riflePower', 'sniperInfluence', 'trade'] as const
const LABEL: Record<(typeof ORDER)[number], string> = {
  sniperDuel: '스나싸움',
  outnumbered: '소수싸움',
  save: '세이브',
  riflePower: '라이플화력',
  sniperInfluence: '스나영향력',
  trade: '백어택성공률(2턴)',
}

/** 이긴 팀 파랑 · 진 팀 빨강 (사장님) */
const WON = { fill: '#5b8dff', line: '#9cc0ff' }
const LOST = { fill: '#ff5a63', line: '#ff9aa0' }

interface Pair {
  label: string
  wonValue: number | null
  lostValue: number | null
  wonText: string
  lostText: string
  /** «몇 번 중 몇 번» — 없으면 안 적는다 */
  wonCount: string | null
  lostCount: string | null
  /** 표본이 적어 퍼센트가 과장되는 축인가 (2026-09-16 사장님) */
  thin: boolean
}

/**
 * ★표본이 이만큼은 돼야 또렷하게 보여 준다★ (2026-09-16).
 *
 * 한 판이 보통 10~13 라운드다. 열 번도 안 일어난 일이면 그 판에서 드물었던 것이고,
 * «60%» 같은 퍼센트가 실제보다 크게 보인다 — 5번 중 3번일 뿐인데.
 * 지어낸 수가 아니라 ★한 판의 길이★ 에서 나왔다.
 */
const THIN_SAMPLE = 10

function pairsOf(won: ClanHexagonV2 | null, lost: ClanHexagonV2 | null): Pair[] {
  return ORDER.map((key) => {
    const w = won?.axes.find((a) => a.key === key) ?? null
    const l = lost?.axes.find((a) => a.key === key) ?? null
    return {
      label: LABEL[key],
      wonValue: w?.value ?? null,
      lostValue: l?.value ?? null,
      /* ★없었음★ (2026-09-11 사장님) — 그 판에 그 일이 한 번도 안 일어났다는 뜻이다.
         클랜 페이지의 «측정중»(표본이 아직 모자람)과 뜻이 다르다 */
      wonText: w && w.value !== null ? w.text : '없었음',
      lostText: l && l.value !== null ? l.text : '없었음',
      /* ★분모를 그대로 보여 준다★ — «60%» 뒤에 «(3/5)» 가 붙으면 뜻이 달라진다 */
      wonCount: w && w.value !== null ? `${w.numerator}/${w.denominator}` : null,
      lostCount: l && l.value !== null ? `${l.numerator}/${l.denominator}` : null,
      /* 양쪽 다 표본이 적으면 흐리게 — 한쪽만 적은 경우는 그 판이 원래 그런 것이다 */
      thin:
        Math.max(w?.denominator ?? 0, l?.denominator ?? 0) < THIN_SAMPLE,
    }
  })
}

const areaOf = (values: readonly (number | null)[]): string =>
  values
    .map((v, i) => hexPoint(i, Math.max(0, Math.min(1, v ?? 0))).join(','))
    .join(' ')

export interface MatchHexagonV3Props {
  /** 이긴 팀의 육각형 (슬롯이 아니라 ★승패★ 로 넘긴다 — 색이 승패를 뜻하니까) */
  won: ClanHexagonV2 | null
  lost: ClanHexagonV2 | null
  wonName: string
  lostName: string
  /** 다시 그리기 열쇠 — 누를 때마다 새로 그려진다 */
  id?: string
  /**
   * ★한 팀만 그린다★ (2026-09-12 사장님: «각 명단에서 경기분석 누르면 자기 팀 그래프만
   * 띄워주라 지금 오른쪽 보면 똑같은게 한번 더 뜨고있어»).
   *
   * PC 스코어보드는 가운데에 ★두 팀 겹친 판★ 이 늘 떠 있다. 거기에 팀 칸의 경기분석까지
   * 두 팀을 그리니 같은 그림이 두 번 나왔다. 팀 칸은 ★그 팀 하나만★ 그린다.
   *
   * 값의 뜻은 그대로 «이 판 두 팀 비교» 다 — 상대가 있어야 나오는 숫자라 설명 줄은 남긴다.
   * 없으면(기본) 옛 판대로 두 팀을 겹쳐 그린다.
   */
  only?: 'won' | 'lost' | null
}

export function MatchHexagonV3({ won, lost, wonName, lostName, id = 'matchHex', only = null }: MatchHexagonV3Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const grow = useDrawIn(1800, id, svgRef)
  const labelIn = grow > 0.92 ? 1 : 0
  const done = grow >= 1
  const [flash, setFlash] = useState(0)
  useEffect(() => { if (done) setFlash((f) => f + 1) }, [done])

  const pairs = pairsOf(won, lost)
  /* ★겹쳐 볼 때만 «갈린 자리» 를 적는다★ — 한 팀만 보고 있으면 견줄 상대가 없다 */
  const verdict = only === null ? matchVerdict(won, lost) : null
  const showWon = only !== 'lost'
  const showLost = only !== 'won'
  const wonArea = areaOf(pairs.map((p) => p.wonValue))
  const lostArea = areaOf(pairs.map((p) => p.lostValue))
  const fillIn = Math.max(0, (grow - 0.45) / 0.55)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/*
        ★양옆으로 34 씩 넓힌 그림판★ (2026-09-16 사장님 «글씨 안튀어나가게»).
          육각 자체는 그대로고 ★글자 자리만★ 생긴다. 왼쪽 축은 `textAnchor="end"` 라
          이름이 길수록 왼쪽으로 뻗는데, 0 에서 잘려 카드 밖으로 나갔다.
      */}
      <svg
        ref={svgRef}
        viewBox={`-34 0 ${HEX.w + 68} ${HEX.h}`}
        style={{ width: HEX.w + 68, height: HEX.h, maxWidth: '100%', display: 'block' }}
      >
        <defs>
          <filter id={`${id}Glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b1" />
            <feGaussianBlur stdDeviation="10" result="b2" />
            <feMerge>
              <feMergeNode in="b2" />
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {RINGS.map((v) => (
          <polygon
            key={v}
            points={Array.from({ length: 6 }, (_, i) => hexPoint(i, v / 100).join(',')).join(' ')}
            fill="none"
            stroke={v % 50 === 0 ? '#4a5c88' : '#2c3a5c'}
            strokeWidth={v % 50 === 0 ? 1.2 : 0.9}
          />
        ))}
        {HEX_SPOKES.map(([x, y], i) => (
          <line key={i} x1={HEX.cx} y1={HEX.cy} x2={x} y2={y} stroke="#2c3a5c" strokeWidth={0.9} />
        ))}

        {/* 진 팀이 밑 · 이긴 팀이 위 — 겹쳐도 이긴 쪽이 보인다. `only` 면 한 쪽만 */}
        {showLost ? <polygon points={lostArea} fill={LOST.fill} fillOpacity={0.22} stroke="none" opacity={fillIn} /> : null}
        {showWon ? <polygon points={wonArea} fill={WON.fill} fillOpacity={0.24} stroke="none" opacity={fillIn} /> : null}
        {showLost ? (
          <polygon
            points={lostArea}
            fill="none"
            stroke={LOST.line}
            strokeWidth={2}
            strokeOpacity={0.95}
            strokeLinejoin="round"
            filter={grow < 1 ? undefined : `url(#${id}Glow)`}
            {...penDash(grow)}
          />
        ) : null}
        {showWon ? (
          <polygon
            points={wonArea}
            fill="none"
            stroke={WON.line}
            strokeWidth={2}
            strokeOpacity={0.95}
            strokeLinejoin="round"
            filter={grow < 1 ? undefined : `url(#${id}Glow)`}
            {...penDash(grow)}
          />
        ) : null}

        {/* 눈금 숫자 — 채움 위에 (Hexagon 과 같은 규칙) */}
        {RINGS.filter((v) => v % 20 === 0).map((v) => {
          const [x, y] = hexPoint(0, v / 100)
          return (
            <text key={v} x={x + 5} y={y + 3} fontSize="7.5" fontWeight="700" fill="#c7d0e6" textAnchor="start">
              {v}
            </text>
          )
        })}
        {done ? <polygon key={flash} className="v3-hex-flash" points={showWon ? wonArea : lostArea} fill={showWon ? WON.line : LOST.line} pointerEvents="none" /> : null}

        {/* 축 이름·숫자는 다 그려진 뒤에 스며든다 (Hexagon 과 같은 규칙) */}
        <g opacity={labelIn} style={{ transition: 'opacity .45s ease' }}>
          {pairs.map((p, i) => {
            const [x, y, anchor] = HEX_LABELS[i] as (typeof HEX_LABELS)[number]
            return (
              <g key={p.label} opacity={p.thin ? 0.45 : 1}>
                {/*
                  ★긴 이름은 괄호 앞에서 두 줄★ — «백어택성공률(2턴)» 은 열두 자라
                  한 줄로는 어디로 늘려도 삐져나온다 (선수 육각과 같은 방법).
                */}
                <text x={x} y={y} textAnchor={anchor} fontSize={12} fontWeight="700" fill={V3.textMuted}>
                  {(() => {
                    const cut = p.label.indexOf('(')
                    if (cut <= 0) return p.label
                    return (
                      <>
                        <tspan x={x}>{p.label.slice(0, cut)}</tspan>
                        <tspan x={x} dy={13}>{p.label.slice(cut)}</tspan>
                      </>
                    )
                  })()}
                </text>
                <text
                  x={x}
                  y={y + (p.label.includes('(') ? 27 : 14)}
                  textAnchor={anchor}
                  fontSize={11}
                  fontWeight="700"
                >
                  {showWon ? <tspan fill={WON.line}>{p.wonText}</tspan> : null}
                  {showWon && showLost ? <tspan fill="#44506c"> · </tspan> : null}
                  {showLost ? <tspan fill={LOST.line}>{p.lostText}</tspan> : null}
                </text>
                {/*
                  ⚠ ★2026-09-16 — «몇 번 중 몇 번» 줄을 뺐다★ (사장님: «6축 전부
                    몇번중에 몇번인지 쓰지마»). 줄이 셋이 되니 빽빽하고 왼쪽 글씨가
                    카드 밖으로 밀렸다. ★그 몫은 육각 밑 「어디서 갈렸나」 한 줄이
                    이미 한다★ — 거기에 «23/43» 처럼 횟수가 들어간다.
                    `wonCount`·`lostCount` 는 `pairsOf` 에 그대로 남겨 뒀다.
                */}
              </g>
            )
          })}
        </g>
      </svg>

      {/*
        ★이 판이 어디서 갈렸나★ (2026-09-16 사장님: «걍 진팀이 진 이유를 알면 되는데»).
          여섯 축을 나란히 두면 유저가 스스로 해석해야 하는데, 퍼센트가 표본을 감춰서
          «다 압도했는데 왜 졌지» 가 된다. 그래서 ★답을 우리가 써 준다.★
          표본이 얇은 축은 후보가 아니고, 뽑을 게 없으면 아무 말도 안 한다.
      */}
      {verdict !== null ? (
        <div
          style={{
            margin: '2px 12px 10px',
            padding: '9px 12px',
            borderLeft: `3px solid ${WON.fill}`,
            background: 'rgba(91,141,255,.07)',
            fontSize: 11.5,
            lineHeight: 1.6,
            color: V3.text,
          }}
        >
          {matchVerdictText(verdict, wonName, lostName)}
        </div>
      ) : null}

      {/* 범례 — 어느 색이 어느 클랜인가 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {showWon ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: WON.fill, flex: 'none' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: WON.line, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wonName}</span>
            <span style={{ fontSize: 10, color: V3.textGhost2 }}>승</span>
          </span>
        ) : null}
        {showLost ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: LOST.fill, flex: 'none' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: LOST.line, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lostName}</span>
            <span style={{ fontSize: 10, color: V3.textGhost2 }}>패</span>
          </span>
        ) : null}
      </div>
      <span style={{ fontSize: 10, color: V3.textGhost2, letterSpacing: '.04em', textAlign: 'center' }}>
        {only === null ? '이 판 두 팀 비교 · 리그 순위와는 잣대가 다릅니다' : '상대와 견준 값입니다 · 리그 순위와는 잣대가 다릅니다'}
      </span>
    </div>
  )
}

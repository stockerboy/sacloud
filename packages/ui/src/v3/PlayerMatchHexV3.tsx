/**
 * ★한 판 육각★ — 스코어보드에서 닉네임을 누르면 그 줄 밑에 펼쳐지는 칸 (2026-09-15 사장님).
 *
 * > «이거 아티팩트처럼 매경기마다 이거 선수개개인 육각형 보여줄 수 있으면 진짜 좋겠는데 사이트터져?»
 * > «닉네임 누르면 그 판의 그 선수 육각형 나오고 그 펼쳐진 공간안에 기본정보바로가기 버튼을 두는건 어때?»
 *
 * ── 여는 법 · 접는 법 (사장님이 못박은 것)
 *   ```
 *   닉네임을 누르면      그 줄 밑에 펼쳐진다
 *   다른 선수를 눌러도   ★안 접힌다★ — 열 명 다 열어 둘 수 있다 (아코디언이 아니다)
 *   접히는 건            ★그 닉네임을 다시 누를 때뿐★ — 저절로 접히는 일은 없다
 *   ```
 *   그래서 열림 상태는 ★줄마다 따로★ 갖는다 (`PlayerRow` 안의 `useState`).
 *   한 곳에 모아 두면 «다른 줄을 열 때 이 줄을 닫는» 규칙이 끼어들 틈이 생긴다.
 *
 * ── 닉네임이 가던 곳은 어디로 갔나
 *   원래 닉네임은 ★선수 기록실로 가는 링크★ 였다. 이제 누르면 육각이 펼쳐지므로,
 *   그 링크를 ★펼친 칸 안의 버튼★ 으로 옮겼다 (사장님: «기본정보바로가기 버튼»).
 *   길이 사라진 게 아니라 한 칸 안으로 들어갔다.
 *
 * ── 무엇을 그리나
 *   축 여섯 개. ★면적은 그 판 열 명 안에서의 백분위★ 이고, 옆의 숫자는 원값이다.
 *   시즌 분포로 그리면 «이 판에서 누가 잘했나» 가 아니라 «원래 잘하는 사람» 이 나온다.
 *   «몇 번 중 몇 번»(`1/2`)을 같이 적는다 — 사장님이 «1번중 1번은 100퍼센트가 맞잖아»
 *   라 하셨고, 맞는 말이라 값은 100% 로 적되 ★가벼운 100% 라는 걸 옆에서 말해 준다.★
 */
import type { CSSProperties } from 'react'
import { playerHexValueText, type MatchPlayerStat } from '@sacloud/contract'
import { type V3Tone, useV3Tone } from './tokens'

type Axis = MatchPlayerStat['hexagon'][number]

/** 그림 크기 — 축 이름이 설 자리까지 `viewBox` 안에 둔다 (겹쳐 놨다가 글자가 잘렸었다) */
const CX = 88
const CY = 78
const R = 42
const VW = 176
const VH = 152

const corner = (i: number, r: number): [number, number] => {
  const ang = -Math.PI / 2 + (i * Math.PI) / 3
  return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)]
}

const ring = (r: number) =>
  Array.from({ length: 6 }, (_, i) => corner(i, r))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

/** 값이 0 이어도 꼭짓점을 아주 조금 띄운다 — 완전히 접히면 도형이 아니라 점이 된다 */
const areaOf = (axes: readonly Axis[]) =>
  axes
    .map((a, i) => {
      const pct = a.pct ?? 0
      const [x, y] = corner(i, R * Math.max(0.03, pct / 100))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

/**
 * 판당 몇 번인 축 — 나머지는 퍼센트다.
 *
 * ★게임영향력은 퍼센트다★ (2026-09-15 사장님) — «한 라운드에 적 다섯 중 몇 명».
 * ⚠ 옛 판은 «3킬» 처럼 횟수로 적었다. 15킬 한 사람이 3킬로 떠서 작아 보였다.
 */
const valueText = (a: Axis): string => {
  if (a.value === null) return '—'
  /*
   * ⚠ ★여기가 «초» 를 몰라서 «50%» 라고 적고 있었다★ (2026-09-16).
   *   ④ 가 «평균 사망 시간» 이 된 날 이 화면만 안 따라왔다. 이제 한 곳에서 만든다.
   */
  return playerHexValueText(a.unit, a.value)
}

/**
 * 축 옆의 작은 글씨 — 축마다 뜻이 다르다 (2026-09-15 사장님).
 *
 *   세이브   «3/9»  몇 번 혼자 남아 몇 번 이겼나. «3회» 가 무거운지 가벼운지 여기서 안다
 *   게임영향력 «3킬 ×2»  몇 킬이었고 그 최고를 몇 번 냈나 — 퍼센트만으론 킬 수가 안 보인다
 *   싸움·소수싸움  «7/15»  이긴 수 / 붙은 수
 *   선짤          비운다 — 분모가 판수(=1)라 세는 게 뜻이 없다
 *   (⚠ 5번 축은 2026-09-15 에 «연속킬» → «교환율» 로 바뀌었다)
 */
const partsText = (a: Axis): string => {
  if (a.numerator === null) return ''
  if (a.key === 'save') return `${a.numerator}/${a.denominator ?? 0}`
  /* 값이 «60%» 라 몇 킬인지 안 보인다 — 분모(그 최대 킬)를 같이 적는다 */
  if (a.key === 'carry') {
    const kills = a.denominator ?? 0
    if (kills <= 0) return ''
    return a.numerator > 1 ? `${kills}킬 ×${a.numerator}` : `${kills}킬`
  }
  if (a.unit === 'per_game') return ''
  return `${a.numerator}/${a.denominator ?? 0}`
}

function panelStyleOf(tone: V3Tone): CSSProperties {
  return {
    padding: '12px 14px 14px',
    borderBottom: `1px solid ${tone.rowDivider}`,
    background: 'rgba(8,14,26,.34)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 14,
  }
}

export function PlayerMatchHexV3({
  axes,
  name,
  href,
  side,
}: {
  axes: readonly Axis[]
  name: string
  /** 선수 기록실 주소 — 원래 닉네임이 가던 곳 */
  href: string
  side: 'red' | 'blue'
}) {
  const V3 = useV3Tone()
  const stroke = side === 'red' ? '#c81e28' : '#1d4fd6'
  const fill = side === 'red' ? 'rgba(255,120,128,.26)' : 'rgba(124,160,255,.3)'
  return (
    <div className="v3-phex" style={panelStyleOf(V3)}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label={`${name} 이 판의 육각형`}
        style={{ flex: '0 0 176px', width: 176, height: 'auto', maxWidth: '100%' }}
      >
        <polygon points={ring(R)} fill="none" stroke={V3.rowDivider} strokeWidth={0.7} />
        <polygon points={ring(R * 0.66)} fill="none" stroke={V3.rowDivider} strokeWidth={0.7} />
        <polygon points={ring(R * 0.33)} fill="none" stroke={V3.rowDivider} strokeWidth={0.7} />
        <polygon points={areaOf(axes)} fill={fill} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
        {axes.map((a, i) => {
          const ang = -Math.PI / 2 + (i * Math.PI) / 3
          const x = CX + (R + 13) * Math.cos(ang)
          const y = CY + (R + 13) * Math.sin(ang)
          const anchor = Math.cos(ang) > 0.4 ? 'start' : Math.cos(ang) < -0.4 ? 'end' : 'middle'
          /* 위·아래 꼭짓점은 글자가 도형에 닿지 않게 조금 더 민다 */
          const dy = Math.sin(ang) < -0.8 ? -3 : Math.sin(ang) > 0.8 ? 10 : 0
          return (
            <g key={a.key}>
              <text x={x} y={y + dy} textAnchor={anchor} fontSize={8} fill={V3.textDim}>
                {a.label}
              </text>
              <text x={x} y={y + dy + 10} textAnchor={anchor} fontSize={9} fontWeight={700} fill={V3.text}>
                {valueText(a)}
              </text>
            </g>
          )
        })}
      </svg>

      <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* ⚠ 옛 판은 표 밑에 ★설명 두 줄★ 을 달았다. 열 명을 다 펴면 그 두 줄이 ★열 번★
            나와서 화면이 설명으로 덮였다. 머릿줄 한 줄이면 같은 말을 한 번만 한다 */}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <li style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 9, color: V3.textGhost2, letterSpacing: '.06em', paddingBottom: 2, borderBottom: `1px solid ${V3.rowDivider}` }}>
            <span style={{ width: 52, flex: 'none' }}>축</span>
            <span style={{ width: 46, flex: 'none' }}>값</span>
            <span>몇 번 중 몇 번</span>
            <span style={{ marginLeft: 'auto' }}>이 판 순위</span>
          </li>
          {axes.map((a) => (
            <li key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11 }}>
              <span style={{ color: V3.textDim, width: 52, flex: 'none' }}>{a.label}</span>
              <b style={{ fontWeight: 700, width: 46, flex: 'none', color: V3.text }}>{valueText(a)}</b>
              <em style={{ fontStyle: 'normal', color: V3.textGhost2, fontSize: 10 }}>{partsText(a)}</em>
              <i style={{ marginLeft: 'auto', fontStyle: 'normal', color: V3.textGhost, fontSize: 10 }}>
                {a.pct === null ? '—' : `${Math.round(a.pct)}`}
              </i>
            </li>
          ))}
        </ul>
        <a
          href={href}
          onClick={(e) => e.stopPropagation()}
          style={{
            alignSelf: 'flex-start',
            fontSize: 11.5,
            fontWeight: 600,
            color: V3.blueSoft,
            textDecoration: 'none',
            border: `1px solid ${V3.cardBorder}`,
            borderRadius: 999,
            padding: '5px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          {name} 기록실 →
        </a>
      </div>
    </div>
  )
}

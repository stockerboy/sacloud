'use client'

/**
 * ★비교분석 검색칸★ — STRENGTH POINT 제목 자리 (2026-09-12 사장님)
 *
 * > «없애고 비교분석하기 버튼 만들고 눌러서 선수 검색 할 수 있게하고
 * >  검색 후 클릭 누르면 그 선수 그래프 불러와서 여기에 겹쳐줘 색깔 다르게 해서
 * >  한눈에 보고 비교할 수 있게 스나수 라플수 구분없이 그래프 대볼 수 있게 만들어»
 *
 * ── 이 파일은 ★껍데기만★ 이다
 *   찾기와 불러오기는 화면(앱)이 한다 — \`packages/ui\` 는 API 를 모른다.
 *   그래서 «글자가 바뀌었다 · 하나를 골랐다» 만 위로 올려 준다.
 *
 * ── 스나수·라플수를 가리지 않는다
 *   여섯 축 중 싸움만 무기별 모집단이라 잣대가 다르지만, 사장님이 ★구분 없이 대보라★ 고
 *   하셨다. 그래서 아무나 고를 수 있고, 대신 그림 밑에 그 말을 한 줄 적는다.
 */
import { useState, type CSSProperties } from 'react'
import { V3 } from './tokens'

export interface CompareCandidate {
  id: string
  name: string
  clanName: string | null
}

export interface CompareSearchV3Props {
  /** 지금 겹쳐 놓은 상대. 없으면 null */
  picked: { id: string; name: string } | null
  /** 찾은 사람들. 아직 안 찾았으면 빈 배열 */
  results: readonly CompareCandidate[]
  loading?: boolean
  onQueryChange: (query: string) => void
  onPick: (candidate: CompareCandidate) => void
  onClear: () => void
}

const boxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  padding: '5px 9px',
  borderRadius: V3.radiusCtl,
  background: V3.chip,
  border: `1px solid ${V3.chipBorder}`,
}

export function CompareSearchV3({ picked, results, loading = false, onQueryChange, onPick, onClear }: CompareSearchV3Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const change = (next: string) => {
    setText(next)
    onQueryChange(next)
  }

  /* 겹쳐 놓은 상대가 있으면 이름표와 「지우기」만 보여 준다 — 검색칸을 계속 열어 둘 이유가 없다 */
  if (picked !== null) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 10, color: V3.textGhost2, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>비교</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#8ff0ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {picked.name}
        </span>
        <button
          type="button"
          onClick={() => { onClear(); setOpen(false); change('') }}
          style={{ fontFamily: 'inherit', fontSize: 10.5, color: V3.textDim, background: 'none', border: `1px solid ${V3.chipBorder}`, borderRadius: V3.radiusChip, padding: '2px 7px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          지우기
        </button>
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: '#a9c3ff', background: 'rgba(91,141,255,.12)', border: '1px solid rgba(127,169,255,.5)', borderRadius: V3.radiusChip, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        비교분석하기
      </button>
    )
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', minWidth: 0 }}>
      <span style={boxStyle}>
        <input
          autoFocus
          value={text}
          onChange={(event) => change(event.target.value)}
          placeholder="닉네임으로 찾기"
          style={{ width: 132, minWidth: 0, fontFamily: 'inherit', fontSize: 12, color: V3.text, background: 'transparent', border: 'none', outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => { setOpen(false); change('') }}
          aria-label="닫기"
          style={{ fontFamily: 'inherit', fontSize: 11, color: V3.textGhost, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ✕
        </button>
      </span>

      {text.trim().length > 0 ? (
        <span
          style={{ position: 'absolute', top: '100%', right: 0, zIndex: 40, marginTop: 5, minWidth: 190, maxHeight: 232, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 4, gap: 2, borderRadius: 7, background: '#0d1524', border: `1px solid ${V3.cardBorder}`, boxShadow: '0 10px 26px rgba(0,0,0,.5)' }}
        >
          {loading ? (
            <span style={{ padding: '8px 9px', fontSize: 11.5, color: V3.textGhost }}>찾는 중…</span>
          ) : results.length === 0 ? (
            /* 없으면 없다고 말한다 — 빈 상자를 남기지 않는다 */
            <span style={{ padding: '8px 9px', fontSize: 11.5, color: V3.textGhost }}>맞는 선수가 없습니다</span>
          ) : (
            results.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => { onPick(candidate); setOpen(false); change('') }}
                style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, padding: '7px 9px', fontFamily: 'inherit', textAlign: 'left', background: 'none', border: 'none', borderRadius: 5, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {candidate.name}
                </span>
                <span style={{ fontSize: 10.5, color: V3.textGhost, whiteSpace: 'nowrap' }}>
                  {candidate.clanName ?? '무소속'}
                </span>
              </button>
            ))
          )}
        </span>
      ) : null}
    </span>
  )
}

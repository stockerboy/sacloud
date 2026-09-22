import type { CSSProperties, ReactNode } from 'react'

/**
 * ★★v2 화면 머리★★ — 리본 + 작은 글자 + 큰 제목 + 설명 + 오른쪽 자리.
 * (2026-09-07 · Part 10 ⑤~ · 사장님 승인)
 *
 * ── 시안 실측 (개인랭킹 · 선수 상세 · 경기 상세가 ★같은 머리★ 를 쓴다)
 *   ```
 *   ▬▬▬▬  INDEPENDENT PREMIER LEAGUE          ┌────────┐┌────────┐
 *   개인랭킹  1시간마다 갱신 · 43개 클랜         │ TIER ▼ ││WEAPON ▼│
 *   ───────────────────────────────────────────────────────────────
 *   ↑리본 38×2   ↑11px .14em   ↑34px 700  ↑12.5px    ↑오른쪽 끝
 *   위 38 · 아래 26 · 밑줄 1px
 *   ```
 *
 * ── ★`SectionHead` 와 다른 것★
 *   `SectionHead`(②단계)는 ★카드 안 구역 머리★ 다 (16px 제목 · 리본 22).
 *   이쪽은 ★화면 전체의 머리★ 다 (34px 제목 · 리본 38 · 밑줄).
 *   둘을 한 컴포넌트로 합치지 않는다 — 크기가 아니라 역할이 다르다.
 *
 * ── ★없으면 안 그린다★
 *   `kicker` · `subtitle` · `right` 는 없으면 요소 자체를 안 만든다.
 *   빈 `<span>` 을 남기면 `gap` 때문에 자리가 뜬다.
 */
export interface PageHeadProps {
  /** 리본 옆 작은 글자 (리그 이름 등). 없으면 리본 줄 자체를 안 그린다 */
  kicker?: ReactNode
  title: ReactNode
  /** 제목 옆 설명 한 줄 */
  subtitle?: ReactNode
  /** 오른쪽 끝 (필터 칩 등) */
  right?: ReactNode
  /** 아래 1px 줄. 카드 안에 넣을 때는 `false` */
  divider?: boolean
  className?: string
  style?: CSSProperties
}

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 20,
  padding: '38px 0 26px',
}
/**
 * ★제목이 없을 때의 여백★ (2026-09-16 사장님: «바랑 내용 사이가 좀 떨어져있는거야»).
 *
 * 제목을 없앴는데(바로 위 탭이 제목을 대신한다) ★제목이 서 있던 자리의 여백이
 * 그대로 남아★ 탭과 내용 사이가 떴다. 글자만 빠지고 빈 칸이 남은 셈이다.
 * 제목이 있는 화면은 위 `wrap` 그대로다 — 한 픽셀도 안 바뀐다.
 */
const wrapNoTitle: CSSProperties = { ...wrap, padding: '14px 0 18px' }
const left: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }
const ribbonRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9 }
const ribbon: CSSProperties = { width: 38, height: 2, flex: 'none', background: 'var(--v2-accent)' }
const kickerStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '.14em',
  color: 'var(--v2-text-faint)',
  whiteSpace: 'nowrap',
}
const titleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 16,
  flexWrap: 'wrap',
  minWidth: 0,
}
/**
 * ⚠ ★2026-09-16 — 클랜랭킹 제목과 크기를 맞췄다★ (사장님: «클랜랭킹이랑 개인랭킹
 *   글씨 크기가 달라 클랜랭킹 글씨크기 기준으로 통일좀 시켜줘(제목말하는거야)»).
 *
 *   두 화면이 ★아예 다른 부품★ 을 쓰고 있었다 —
 *     클랜랭킹 `RankHeader`  `text-3xl`(PC 28.1px) · `max-md:text-2xl`(폰 22.5px)
 *     개인랭킹 `PageHead`    ★34px 고정★
 *   그래서 폰에서 34 대 22.5 로 눈에 띄게 달랐다.
 *
 *   여기 값을 클랜랭킹의 PC 값에 맞추고, 폰은 아래 `.v2-pagehead__title` 미디어
 *   규칙이 22.5px 로 줄인다 (`v2/tokens.css`). 옛 값은 34px 이다.
 */
const titleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.1,
  color: 'var(--v2-text-strong)',
  letterSpacing: '-.01em',
}
const subtitleStyle: CSSProperties = { fontSize: 12.5, color: 'var(--v2-text-faint)' }

export function PageHead({
  kicker,
  title,
  subtitle,
  right,
  divider = true,
  className = '',
  style,
}: PageHeadProps) {
  return (
    <div
      /* ⚠ 2026-09-23 새벽 — 루트에 `v2-pagehead` 가 없어서 폰 `.sac-v3-page .v2-pagehead` 여백 규칙이 허공을 쳤다.
         경기 상세 폰에서 「경기」 제목이 x=0 에 붙었다 (찍어서 잡았다). 옛 판은 className 만 */
      className={`v2-pagehead ${className}`.trim()}
      style={{
        ...(title === '' ? wrapNoTitle : wrap),
        ...(divider ? { borderBottom: '1px solid var(--v2-head-divider)' } : {}),
        ...style,
      }}
    >
      <div style={left}>
        {kicker ? (
          <div style={ribbonRow}>
            <span style={ribbon} aria-hidden="true" />
            <span style={kickerStyle}>{kicker}</span>
          </div>
        ) : null}
        <div style={titleRow}>
          {/* ⚠ 제목이 비면 자리를 안 만든다 (2026-09-16) */}
          {title === '' ? null : (
            <h1 className="v2-pagehead__title" style={titleStyle}>{title}</h1>
          )}
          {subtitle ? <span style={subtitleStyle}>{subtitle}</span> : null}
        </div>
      </div>
      <span style={{ flex: 1 }} />
      {right ?? null}
    </div>
  )
}

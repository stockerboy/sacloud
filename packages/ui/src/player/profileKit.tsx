'use client'

/**
 * 프로필(플레이어 · 클랜) 공용 조각 — `적진` 팔레트.
 *
 * 3rd.supply 재현을 그만두고 새 디자인으로 넘어오면서 만든 것이다.
 * 원본의 흰 카드 / 파란 버튼 / 다색 승률 등급을 쓰지 않는다.
 *
 * 규칙
 * - 색은 **진홍(`--color-accent`) 하나뿐**이다. 나머지는 회색 계열이다.
 *   승률이 높다고 초록, 낮다고 빨강으로 칠하지 않는다 (`rateClass` 를 쓰지 않는 이유).
 * - 그림자 없음 · 모서리 2px · 표 얼룩무늬 없음.
 * - 숫자는 전부 `font-num` + `tabular-nums` 라 자릿수가 흔들리지 않는다.
 * - 값이 없으면 비워 두거나 `알수없음` 으로 적는다. **0 으로 그리지 않는다.**
 */

import Link from 'next/link'
import type { ReactNode } from 'react'

/** 카드·행 공통 — 각진 모서리 + 얇은 선. 그림자를 쓰지 않는다 */
export const PANEL = 'rounded-[2px] border border-line bg-card'

/** 섹션 사이 간격 (`--section-gap` 40px) */
export const SECTION = 'mt-[40px]'

/**
 * 섹션 제목.
 *
 * 위계: 제목 20px `--font-display` · 우측 보조설명 12px `--color-meta`.
 * 제목 줄은 아래에 얇은 선을 깔아 "여기서부터 다른 이야기" 를 만든다.
 */
export function SectionTitle({
  title,
  note,
  action,
}: {
  title: string
  /** 제목 옆의 조용한 보조 문구 (건수 · 단서 등) */
  note?: ReactNode
  /** 우측 끝 조작 (접기 등) */
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between border-b border-b-line-soft pb-3">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-[20px] leading-none text-text-strong">{title}</h2>
        {note ? <span className="text-[12px] text-meta">{note}</span> : null}
      </div>
      {action}
    </div>
  )
}

/**
 * 라벨 + 값 한 칸.
 *
 * 라벨 12px `--color-meta` 위, 값 15px 아래. 값이 `null` 이면 `--color-faint` 로 흐리게 적는다.
 */
export function Stat({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: ReactNode
  /** 그 줄에서 제일 중요한 값 하나에만 준다 */
  strong?: boolean
  /** 값이 없어 대체 문구를 적을 때 */
  muted?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] leading-none text-meta">{label}</div>
      <div
        className={`mt-1.5 font-num text-[15px] leading-none tabular-nums ${
          muted ? 'text-faint' : strong ? 'text-text-strong' : 'text-text'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

/**
 * 승/패 비율 막대.
 *
 * 진홍(승) + 회색(패) **두 색뿐**이다. 넓은 면을 진하게 칠하지 않으려고 높이를 2px 로 뒀다.
 * 표본이 0 이면 아예 그리지 않는다 — 빈 막대를 0% 처럼 보이게 두지 않기 위해서다.
 */
export function WinBar({ win, lose }: { win: number; lose: number }) {
  const total = win + lose
  if (total <= 0) return null
  const ratio = Math.max(0, Math.min(100, (win / total) * 100))
  return (
    <div
      className="flex h-[2px] w-full overflow-hidden bg-line"
      role="img"
      aria-label={`${win}승 ${lose}패`}
    >
      <div className="h-full bg-accent" style={{ width: `${ratio}%` }} />
    </div>
  )
}

/**
 * `공식` 배지.
 *
 * 원본의 검은 알약 + 노란 점을 쓰지 않는다 — 노랑은 팔레트에 없다.
 * 진홍 테두리 + 진홍 글자의 각진 배지로 바꾼다.
 */
export function OfficialTag() {
  return (
    <span className="inline-flex select-none items-center rounded-[2px] border border-accent px-1.5 py-0.5 text-[11px] leading-none text-accent">
      공식
    </span>
  )
}

/** 값이 없을 때의 조용한 표기. 문구를 지우지 않는다 */
export function Unknown({ text = '알수없음' }: { text?: string }) {
  return <span className="text-faint">{text}</span>
}

/** 목록이 비었을 때 */
export function ProfileEmpty({ message }: { message: string }) {
  return (
    <div className={`${PANEL} px-5 py-10 text-center text-[13px] text-meta`}>{message}</div>
  )
}

/** 불러오는 중 자리표시 — 얼룩무늬 대신 선만 남긴다 */
export function ProfileSkeleton({ rows = 2, height = 96 }: { rows?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className={`${PANEL} animate-pulse`}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  )
}

/**
 * 프로필 하위 탭 (기본정보 / 기록실 / 클랜원 / 지난시즌).
 *
 * 하는 일은 그대로다 — 링크를 누르면 그 경로로 간다.
 * 겉만 바꿨다: 면을 칠하지 않고 **진홍 밑줄 2px** 하나로 현재 위치를 말한다.
 */
export function ProfileNav({
  tabs,
  current,
}: {
  tabs: readonly { label: string; href: string }[]
  current: string
}) {
  return (
    <nav className="border-b border-b-line">
      <div className="pc-container flex items-center gap-7 max-md:gap-5 max-md:overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.href === current
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`group -mb-px whitespace-nowrap border-b-2 py-3.5 text-[14px] ${
                active ? 'border-b-accent' : 'border-b-transparent'
              }`}
            >
              {/*
                색은 **안쪽 `<span>`** 이 쓴다.
                `styles.css` 의 `a { color: inherit }` 가 레이어 밖에 있어서, `<a>` 에
                직접 준 Tailwind 색 유틸리티는 레이어 규칙이라 그대로 눌린다.
                실제로 활성 탭이 진홍으로 안 떴다.
              */}
              <span
                className={`transition-colors ${
                  active ? 'text-text-strong' : 'text-meta group-hover:text-text'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * `더 불러오기`.
 *
 * 하는 일은 공용 `LoadMoreButton` 과 같다 — 커서 다음 장을 가져온다.
 * 겉만 프로필 화면 팔레트(진홍 테두리)에 맞춘다. 채운 남색 버튼을 쓰지 않는다.
 */
export function ProfileLoadMore({
  onClick,
  loading,
}: {
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mt-4 h-11 w-full rounded-[2px] border border-line text-[13px] text-meta transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {loading ? '불러오는 중' : '더 불러오기'}
    </button>
  )
}

/**
 * 프로필 상단 신원 띠.
 *
 * 이름이 제일 크고(`--font-display`), 나머지는 전부 12~15px 로 눌러 둔다.
 * 한 화면을 꽉 채우지 않도록 위아래 여백을 넉넉히 준다.
 */
export function IdentityBand({
  mark,
  name,
  meta,
  action,
}: {
  mark: ReactNode
  name: string
  /** 이름 아래 한 줄 — 소속 · 클랜마스터 · 설립일 등 */
  meta: ReactNode
  /** 우측 조작 (갱신 버튼 등) */
  action?: ReactNode
}) {
  return (
    <div className="border-b border-b-line bg-card-2">
      <div className="pc-container flex items-start gap-6 py-[40px] max-md:gap-4 max-md:py-6">
        {/*
          `flex` 를 반드시 남긴다. `ClanMark` 가 `<span>` 이라 그냥 블록 안에 넣으면
          인라인 요소가 되어 `w-mark-max`(51px)가 통째로 무시되고 0×0 으로 찌그러진다.
          flex 자식이 되면 blockify 되어 크기가 산다. 실제로 한 번 찌그러뜨렸다.
        */}
        <div className="flex shrink-0">{mark}</div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[28px] leading-tight text-text-strong max-md:text-[22px]">
            {name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-meta">
            {meta}
          </div>
        </div>
        {action ? <div className="shrink-0 max-md:hidden">{action}</div> : null}
      </div>
      {/* 좁은 화면에서는 조작을 아래로 내린다 — 이름과 겹치면 둘 다 읽히지 않는다 */}
      {action ? (
        <div className="pc-container hidden pb-5 max-md:block">{action}</div>
      ) : null}
    </div>
  )
}

/** 신원 띠 안의 구분점 */
export function MetaDot() {
  return <span className="text-faint">·</span>
}

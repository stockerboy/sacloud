'use client'

import Link from 'next/link'
import { CompetitiveMark } from '@sacloud/ui'
import { HomeFeatureExample } from './HomeFeatureExample'
import { useState } from 'react'
import {
  LEAGUE_FEATURES,
  leagueFeature,
  leagueFeatureCount,
  leagueFeatureEndingCount,
  leagueFeatureRemaining,
} from '@sacloud/contract'

/**
 * ★첫 화면의 주인공 — 리그 셋과 «무엇을 주는가»★ (2026-09-16 사장님).
 *
 * > «메인화면에 최근경기 없애고 ★pl ipl 열산리그 세개로 카텍 나눠서★ 클릭하면
 * >  모든기능(경기분석 킬뎃그래프, 기록카드 플레이어분석 클랜분석등등) 깔아놓고
 * >  리그별로 제공하는 기능별 예시 전부 보여주고 ★제공되지 않는 기능은 미제공★ 이라고
 * >  해줘 그리고 ★마지막에 리그참가신청버튼★ 을 줘 각 리그별로»
 *
 * ── 무엇이 바뀌었나
 *   여태 첫 화면은 «최근 경기» 를 걸어 ★이미 우리를 아는 사람★ 만 쓸 수 있었다.
 *   처음 온 사람은 이 사이트가 무엇을 해 주는지 알 길이 없었다.
 *   이제 첫 화면이 ★리그를 고르게 하고, 고르면 받는 것을 전부 세어 보여 준다.★
 *
 * ── ★미제공을 감추지 않는다★
 *   리그마다 주는 게 다르다. 없는 것을 빼 버리면 «왜 내 리그엔 클랜랭킹이 없지» 를
 *   화면에서 알 수 없다. 그래서 ★여덟 줄을 늘 같은 차례로 다 그리고★ 안 주는 줄만
 *   흐리게 «미제공» 을 붙인다. 어느 리그를 눌러도 줄 수와 차례가 같아 눈이 안 흔들린다.
 *
 * ── 어디서 «주는가» 를 아나
 *   `packages/contract/src/leagueFeatures.ts` 한 곳이다. 이 화면은 표만 읽는다.
 *
 * ── 왜 한 화면에서 탭으로 바뀌나
 *   리그마다 페이지를 따로 두면 셋을 ★견주어 볼 수가 없다.★ 사장님이 «세개로 카텍
 *   나눠서 클릭하면» 이라 하신 대로 한 자리에서 눌러 갈아 끼운다.
 */

/**
 * ★곧 끊기는 기능의 색★ (2026-09-16 사장님: «전부 빨갛게 잘보이게»).
 * 리그 강조색과 섞이면 안 된다 — IPL 의 강조색이 파랑이라 경고가 묻혔다.
 */
const WARN = 'var(--v2-red, #e04b5a)'

/** 리그 강조색 — `tokens.css` 의 `.sac-spl`·`.sac-ipl`·`.sac-sanply` 와 같은 값이다 */
const TONE: Readonly<Record<string, string>> = {
  supply: 'var(--v2-red, #e04b5a)',
  nolink: 'var(--v2-blue, #5b8dff)',
  sanply: 'var(--v2-green, #3fb27f)',
}

interface Pick {
  slug: string
  /** 화면에 적는 이름 */
  label: string
  /** 한 줄 부제 */
  sub: string
  /** 참가 신청 화면이 미리 골라 둘 종류 (`APPLICATION_KINDS` 의 key) */
  applyKind: string
}

/**
 * 차례는 ★경쟁전이 먼저★ 다 — 서랍(`MOBILE_NAV_GROUPS`)과 같은 순서다.
 * `applyKind` 는 `contract/entities/leagueApplication.ts` 의 key 그대로다.
 * ★key 를 새로 짓지 않는다★ — 이미 들어온 신청서가 그 값을 들고 있다.
 */
/* 튜플로 적는다 — 첫 칸이 ★반드시 있다★ 를 타입이 알아야 기본값에 물음표가 안 붙는다 */
const PICKS: readonly [Pick, Pick, Pick] = [
  { slug: 'supply', label: 'PL', sub: '경쟁전 · 기록게임', applyKind: 'llm-new' },
  { slug: 'nolink', label: 'IPL', sub: '일반전 · 무소속 리그', applyKind: 'ipl-new' },
  { slug: 'sanply', label: '열산리그', sub: '일반전 · 고용 클랜', applyKind: 'ysl-new' },
]

/**
 * 경고 제목 — 글귀를 화면 한가운데 적지 않는다.
 *
 * ★남는 것으로 적는다★ — «6가지가 안 된다» 보다 «경기 분석만 된다» 가
 * 한 번에 읽힌다. 남는 게 셋을 넘으면 그때는 없어지는 수를 적는다.
 */
const endTitle = (league: string, kept: readonly string[], n: number): string =>
  kept.length > 0 && kept.length <= 3
    ? `${league} 은 10/1 부터 ${kept.join(' · ')}만 제공됩니다`
    : `${league} 은 10/1 부터 ${n}가지 기능이 제공되지 않습니다`

export function HomeLeagueFeatures() {
  const [slug, setSlug] = useState<string>('supply')
  /**
   * ★펼쳐 둔 기능들★ (2026-09-16 사장님: «펼치고 접지 않는 이상 계속 펼쳐놔»).
   *
   * ⚠ 처음에는 ★하나만★ 담았다 — 다른 줄을 누르면 앞의 것이 닫혔다.
   *   여덟 가지를 견주어 보려는 사람에게는 그게 방해다. 사장님이 바로잡으셨다.
   *   이제 누른 만큼 다 열려 있고 ★다시 누를 때만★ 닫힌다.
   */
  const [openKeys, setOpenKeys] = useState<readonly string[]>([])
  const toggleKey = (key: string) =>
    setOpenKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  const pick = PICKS.find((p) => p.slug === slug) ?? PICKS[0]
  const tone = TONE[pick.slug] ?? 'var(--v2-blue, #5b8dff)'
  const given = leagueFeatureCount(pick.slug)
  /** 곧 끊기는 기능 수 — 0 이면 경고 줄을 안 그린다 */
  const ending = leagueFeatureEndingCount(pick.slug)

  return (
    <section
      aria-label="리그 고르기"
      className="mx-auto mt-[24px] w-full max-w-[940px] max-md:mt-[16px]"
    >
      {/* ── 리그 셋 ─────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="리그"
        className="grid grid-cols-3 gap-[10px] max-md:gap-[6px]"
      >
        {PICKS.map((p) => {
          const on = p.slug === pick.slug
          const t = TONE[p.slug] ?? 'var(--v2-blue, #5b8dff)'
          return (
            <button
              key={p.slug}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setSlug(p.slug)
                /* 리그가 바뀌면 접는다 — 옛 리그의 예시가 새 이름 아래 남으면 거짓말이다 */
                setOpenKeys([])
              }}
              className="flex flex-col items-center gap-[2px] border px-[10px] py-[10px] text-center transition-colors duration-100 max-md:px-[4px] max-md:py-[8px]"
              style={{
                /* 고른 칸만 제 리그 색으로 선다. 나머지는 한 겹 죽인다 */
                borderColor: on ? t : 'var(--v2-head-divider, #1e2637)',
                /*
                 * ★불투명에 가깝게 깐다★ — 첫 화면은 뒤에 밤하늘 사진이 깔려 있다.
                 *   비워 두면 PC 에서 부제가 구름에 묻혀 안 읽혔다 (실측).
                 */
                background: on ? 'rgba(14, 22, 40, 0.94)' : 'rgba(9, 14, 24, 0.82)',
              }}
            >
              <span
                className="text-[17px] font-bold max-md:text-[14.5px]"
                style={{ color: on ? t : 'var(--v2-text-dim, #7b86a0)' }}
              >
                {p.label}
              </span>
              {/*
                ⚠ ★엠블럼이 붙으면 폰에서 부제가 두 줄로 깨진다★ (2026-09-16 실측).
                  탭 하나가 폰에서 110px 남짓인데 «경쟁전 · 구 서플라이» 열한 자에
                  엠블럼까지 얹으면 넘친다. 그래서 폰에서만 한 단계 더 줄이고
                  ★줄바꿈을 막는다★ — 두 줄이 되면 탭 셋의 높이가 어긋난다.
              */}
              <span className="flex items-center justify-center gap-[4px] whitespace-nowrap text-[11.5px] text-[var(--v2-text-dim)] max-md:gap-[3px] max-md:text-[9px]">
                {/* ★경쟁전에만 엠블럼★ (2026-09-16 사장님) — 일반전 둘에는 안 붙는다 */}
                {p.sub}
                {p.sub.startsWith('경쟁전') ? <CompetitiveMark size={12} /> : null}
              </span>
            </button>
          )
        })}
      </div>

      {/*
        ── 고른 리그가 주는 것 ────────────────────────────
        ★어두운 판 위에 올린다★ — 첫 화면 뒤에는 밤하늘 사진이 깔려 있어서
        판이 없으면 PC 에서 목록 글자가 구름에 묻힌다 (실측).
      */}
      <div
        className="mt-[8px] border border-[var(--v2-head-divider)] px-[18px] pb-[14px] pt-[13px] max-md:mt-[6px] max-md:px-[12px] max-md:pb-[11px] max-md:pt-[11px]"
        style={{ background: 'rgba(9, 14, 24, 0.86)' }}
      >
      {/*
        ⚠ ★2026-09-17 — 제목과 숫자를 붙였다★ (무한 QA 가 ★665px 빈틈★ 으로 잡았다).
          옛 모양은 `justify-between` 이라 940px 판에서 제목은 맨 왼쪽, 숫자는 맨 오른쪽 —
          그 사이가 통째로 비었다. 사장님 상시 지적 그대로다:
          «한눈에 들어오는걸 굳이 떨어뜨려 빈공간 만든다».

          ★폰에서는 원래 안 벌어졌다★ (칸이 좁아 저절로 붙는다) — 그래서 폰은 그대로다.
          ★되돌리려면★ 이 줄을 `flex items-baseline justify-between gap-[10px]` 로.
      */}
      <div className="flex items-baseline gap-[12px] max-md:justify-between max-md:gap-[10px]">
        <div className="shrink-0 text-[15px] font-bold text-[var(--v2-text-strong)] max-md:text-[13.5px]">
          <span style={{ color: tone }}>{pick.label}</span> 에서 볼 수 있는 것
        </div>
        <div className="shrink-0 text-[12px] text-[var(--v2-text-ghost)] max-md:text-right max-md:text-[11px]">
          {LEAGUE_FEATURES.length}가지 중 <span className="num">{given}</span>가지 제공
          {/* ★곧 끊기면 그 뒤도 같이 적는다★ — 안 그러면 위 숫자가 경고와 어긋나 보인다 */}
          {ending > 0 ? (
            <span className="block" style={{ color: WARN, fontWeight: 700 }}>
              10/1부터 <span className="num">{given - ending}</span>가지
            </span>
          ) : null}
        </div>
      </div>

      <ul className="mt-[10px] border-t border-[var(--v2-head-divider)]">
        {LEAGUE_FEATURES.map((f) => {
          const state = leagueFeature(pick.slug, f.key)
          const open = openKeys.includes(f.key)
          /* ★주는 것만 펼친다★ — 없는 기능은 보여 줄 예시가 없다 */
          const canOpen = state.given
          /*
           * ★안 주는 줄도 지우지 않는다★ — 빠지면 «왜 없는지» 를 화면에서 알 수 없다.
           * 대신 한 겹 죽이고 «미제공» 딱지와 까닭을 붙인다.
           */
          return (
            <li
              key={f.key}
              className="border-b border-[var(--v2-head-divider)] py-[9px] max-md:py-[8px]"
            >
            <div
              className="flex items-center gap-[12px] max-md:gap-[9px]"
              role={canOpen ? 'button' : undefined}
              tabIndex={canOpen ? 0 : undefined}
              aria-expanded={canOpen ? open : undefined}
              style={canOpen ? { cursor: 'pointer' } : undefined}
              onClick={canOpen ? () => toggleKey(f.key) : undefined}
              onKeyDown={
                canOpen
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleKey(f.key)
                      }
                    }
                  : undefined
              }
            >
              {/* 주는가 — 리그 색 점 / 안 주면 빈 점 */}
              <span
                aria-hidden
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{
                  background: state.given ? tone : 'transparent',
                  boxShadow: state.given ? 'none' : 'inset 0 0 0 1px var(--v2-text-ghost, #5c6580)',
                }}
              />

              <div className="min-w-0 flex-1">
                <div
                  className="text-[14px] font-bold max-md:text-[13px]"
                  style={{
                    color: state.given
                      ? 'var(--v2-text-strong, #e8edf7)'
                      : 'var(--v2-text-ghost, #5c6580)',
                  }}
                >
                  {f.label}
                </div>
                <div
                  className="mt-[3px] text-[12px] max-md:text-[11px]"
                  style={{
                    /* ★곧 끊기는 줄은 빨강★ — 사장님: «전부 빨갛게 잘보이게» */
                    color: state.endsOn
                      ? WARN
                      : state.given
                        ? 'var(--v2-text-dim, #7b86a0)'
                        : 'var(--v2-text-ghost, #5c6580)',
                    fontWeight: state.endsOn ? 700 : 400,
                  }}
                >
                  {/*
                   * 세 갈래다 —
                   *   ★곧 끊긴다★ 오늘은 있지만 그날부터 없다 (빨강)
                   *   준다        무엇인지 설명한다
                   *   안 준다     ★까닭★ 을 적는다
                   */}
                  {state.endsOn
                    ? `${state.endsOn}부터 ${pick.label} 리그에는 제공되지 않는 기능입니다`
                    : state.given
                      ? f.note
                      : (state.why ?? '이 리그에서는 제공하지 않습니다')}
                </div>
              </div>

              {/* 오른쪽 — 보러 가기 / 미제공 딱지 */}
              {state.endsOn ? (
                /*
                 * ★오늘은 있다★ — 그래서 예시도 그대로 펼쳐 보인다.
                 *   딱지만 빨갛게 «언제 끊기는지» 를 알린다.
                 */
                <span
                  className="shrink-0 whitespace-nowrap border px-[7px] py-[3px] text-[11px] font-bold max-md:text-[10px]"
                  style={{ color: WARN, borderColor: WARN }}
                >
                  {state.endsOn} 종료
                </span>
              ) : state.given ? (
                /*
                 * ★다른 화면으로 안 보낸다★ (2026-09-16 사장님).
                 *   여기서 펼친다 — 여덟 가지를 보려고 여덟 번 나갔다 오게 하지 않는다.
                 */
                <span
                  className="shrink-0 whitespace-nowrap text-[12px] font-bold max-md:text-[11px]"
                  style={{ color: tone }}
                >
                  예시 {open ? '▴' : '▾'}
                </span>
              ) : (
                <span className="shrink-0 whitespace-nowrap border border-[var(--v2-head-divider)] px-[7px] py-[3px] text-[11px] text-[var(--v2-text-ghost)] max-md:text-[10px]">
                  미제공
                </span>
              )}
            </div>

            {/*
              ★펼쳐진 예시★ — 눌렸을 때만 그린다.
              안 누르면 질의가 하나도 안 나간다 (`HomeFeatureExample` 주석 참고).
            */}
            {open ? (
              <HomeFeatureExample leagueSlug={pick.slug} featureKey={f.key} tone={tone} />
            ) : null}
            </li>
          )
        })}
      </ul>

      {/*
       * ── ★곧 끊기는 기능이 있으면 크게 알린다★ ─────────────
       *   사장님: «10/1 이후제공 안되는데 보여주는건 전부 다 (…) 이런식으로 써놔
       *   ★PL 참가하고싶게끔★». 그래서 경고로 끝내지 않고 ★갈 곳★ 을 같이 준다.
       */}
      {ending > 0 ? (
        <div
          className="mt-[18px] border px-[15px] py-[13px] max-md:mt-[14px] max-md:px-[12px] max-md:py-[11px]"
          style={{ borderColor: WARN, background: 'rgba(224, 75, 90, 0.07)' }}
        >
          <div
            className="text-[13.5px] font-bold max-md:text-[12.5px]"
            style={{ color: WARN }}
          >
            {endTitle(pick.label, leagueFeatureRemaining(pick.slug), ending)}
          </div>
          <div className="mt-[5px] text-[12px] leading-[1.6] text-[var(--v2-text-dim)] max-md:text-[11.5px]">
            같은 기록을 <b style={{ color: TONE.supply }}>PL</b> 에서는 계속 보실 수 있습니다.
            래더 점수와 클랜 랭킹도 <b style={{ color: TONE.supply }}>PL</b> 에만 있습니다.
          </div>
          <Link
            href="/apply?kind=llm-new"
            className="mt-[11px] inline-flex items-center border px-[13px] py-[8px] text-[12.5px] font-bold max-md:text-[12px]"
            style={{ borderColor: TONE.supply, color: TONE.supply }}
          >
            PL 참가 신청하기 →
          </Link>
        </div>
      ) : null}

      {/*
       * ── 마지막은 참가 신청 ───────────────────────────────
       *   사장님: «마지막에 리그참가신청버튼을 줘 ★각 리그별로★».
       *   `?kind=` 로 종류를 실어 보내면 신청 화면이 그 칸을 미리 골라 둔다.
       */}
      <Link
        href={`/apply?kind=${pick.applyKind}`}
        className="mt-[14px] flex items-center justify-center border py-[11px] text-[15px] font-bold transition-opacity duration-100 max-md:mt-[12px] max-md:py-[10px] max-md:text-[14px]"
        style={{ borderColor: tone, color: tone }}
      >
        {pick.label} 참가 신청하기
      </Link>
      </div>
    </section>
  )
}

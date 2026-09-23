'use client'

import { Fragment } from 'react'
import { rankColorByRatio } from '../record/playerHeadCopy'

/**
 * ★등수별로 닉네임·클랜명 색을 바꾸지 않는다★ (2026-09-20 사장님)
 *
 * > 「그 등수별로 닉네임이나 클랜명 색 다르게 하는 기능은 없애자」
 *
 * ⚠ ★코드를 지우지 않는다★ (`CLAUDE.md` 1-4) — 이 한 줄을 `true` 로 두면
 *   옛 모습이 그대로 돌아온다. 색을 계산하는 `rankColorByRatio` 도 그대로 있다.
 *   (순위 ★숫자★ 의 색은 이것과 별개다 — 거기는 그대로 둔다)
 */
const RANK_TINTS_NAMES = false

/** 스위치가 꺼져 있으면 «색 없음» 을 돌려준다 */
function nameTint(color: string | null | undefined): string | undefined {
  return RANK_TINTS_NAMES ? (color ?? undefined) : undefined
}
import Link from 'next/link'
import type { ClanMainPlayer, ClanRankRow, PlayerRankRow, RankColumns, RankWeapon } from '@sacloud/contract'
import { showsTier, leagueScreen } from '@sacloud/contract'
/* 2026-09-11 QA 회차 2: 랭킹표 마크가 빈 클랜(publicity·NeedBackup·Lyrical: …)이 있었다 — 상세처럼 원 크롭 마크(/assets/clans) 먼저, 없으면 옛 ClanMark(구름) */
import { MarkCircle, SniperMark } from '../v3/primitives'
/* 티어 구분선 라벨 — 공식리그면 `1부리그`, 무소속리그면 `1티어` (D-165) */
import { divisionLabel, tierGroupOf } from './divisionLabel'
/* 「알」 (`docs/EGG_SYSTEM_SPEC.md`) — 랭킹도 알로 덮는다 */
import { Egg } from '../egg/Egg'
import { useEggKnowledge } from '../egg/EggContext'
import { EggVeil, EggVeilLegend } from '../egg/EggVeil'
import type { EggState } from '../egg/eggState'
/* 승률·킬뎃 두 칸만 서플라이 등급색을 쓴다 (2026-08-30 사용자 지시) */
import { rateClass } from '../common/rate'
import { rankColor } from '../record/playerHeadCopy'
import { floorColor } from '../v3/rankColors'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import {
  formatCount,
  formatAverage,
  formatRate,
  formatRating,
  formatRatingPoint,
  formatRatingDelta,
} from '../common/format'
import { leagueClanPath, leaguePlayerPath } from '../common/paths'
import { ClanBadges } from './ClanBadges'
import { badgeOfAxis } from '@sacloud/contract'
/* ⚠ 옛 SVG 배지(`TraitEmblem.tsx`)는 그대로 있다 — 사장님 그림으로 바뀌었을 뿐이다 (`CLAUDE.md` 1-4) */
import { AxisBadge } from './BadgeArt'

/**
 * ★클랜 줄에 배지를 그릴 것인가★ (2026-09-17 사장님:
 * 「클랜랭킹에 그 특성 배찌 달아놓은거랑 승격유력 강등위기 배찌는 다 없애」).
 *
 * ── 왜 뗐나
 *   클랜명 옆에 ★칩이 셋까지★ 붙었다 — 특성 배지 · 승격유력/강등위기 · 티어.
 *   폰에서는 그것들이 이름 자리를 먹어 「-tsAr.nTc」 같은 이름이 잘렸고,
 *   PC 에서는 이름과 승률 사이가 배지로 어수선했다.
 *
 * ── 셈은 그대로 살아 있다
 *   `packages/contract/src/clanBadge.ts`(5위 컷 · ASTRA 보정)도,
 *   `row.note`(승격/강등 판정)도 한 줄도 안 지웠다. ★그리지만 않는다.★
 *   되살리려면 아래 둘을 `true` 로 두면 그대로 돌아온다.
 */
/*
 * ★클랜 줄의 배지★ — 2026-09-17 사장님이 다시 켜라 하셨다:
 * > «뱃지는 개인기록카드에 진열돼야함 그리고 개인랭킹에도 그리고 클랜랭킹에도»
 *
 * ⚠ 2026-09-17 낮에는 ★끄라★ 고 하셨었다 («클랜랭킹에 그 특성 배찌 달아놓은거랑
 *   승격유력 강등위기 배찌는 다 없애»). 그때는 ★글자 배지★ 라 줄이 지저분했다.
 *   이제 그림이라 다르다. ★승격유력·강등위기 배지는 계속 끈 채로 둔다★ (`CLAN_ROW_NOTE`).
 */
/*
 * ⚠ ★2026-09-20 — 사장님이 다시 끄라고 하셨다★
 * > 「클랜랭킹에 있는뱃지도 전부지워」
 *
 * 세 번째 뒤집힌 자리다. ★이력을 다 남긴다★ —
 *   2026-09-17 낮  끄라  («클랜랭킹에 그 특성 배찌 달아놓은거 (…) 다 없애»)
 *   2026-09-17 밤  켜라  («뱃지는 (…) 클랜랭킹에도»)
 *   2026-09-20     ★끄라★
 *
 * ★코드는 한 줄도 안 지웠다★ — `ClanBadges` 도 그 자리에 그대로 있다.
 * 되살리려면 ★이 한 글자를 `true` 로★ 바꾸면 된다 (CLAUDE.md 1-4).
 */
const CLAN_ROW_BADGES = false
/** 승격유력 · 강등위기 칩 (2026-09-11 사장님이 넣으셨고 2026-09-17 에 빼셨다) */
const CLAN_ROW_NOTE = false
import {
  COL_CLAN,
  COL_HIDDEN,
  COL_MAIN,
  COL_NAME,
  COL_RANK,
  COL_WL,
  COL_RATING,
  COL_STAT,
  COL_PSTAT,
  COL_PWL,
  COL_PRATING,
  SUB_PHONE_ONLY,
  HEAD,
  MARK,
  NUM,
  RANK_TOP,
  ROW,
  SUB,
} from './rankStyles'

/**
 * 클랜랭킹 / 개인랭킹 표.
 *
 * ── 칸을 줄였다 (2026-08-30, 사용자 지시)
 *   예전에는 원본 3rd.supply 의 칸 구성을 그대로 옮겨 개인랭킹이 여덟 칸이었다.
 *   한눈에 안 읽혀서 **핵심만 칸으로 세운다.**
 *
 *   | 표 | 지금 칸 | 접은 것 (없앤 것이 아니다) |
 *   |---|---|---|
 *   | 클랜랭킹 | 순위 · 클랜 · 승률 · 래더 | 승리/패배 → 승률 아래 `40승 25패` |
 *   | 개인랭킹 | 순위 · 닉네임 · 승률 · 킬뎃 · 래더 | 승리/패배 → 승률 아래, 평균킬 → 킬뎃 아래 |
 *
 *   데이터는 한 줄도 사라지지 않았다. 화면 위계만 바뀌었다.
 *   **모든 리그에 똑같이 적용한다.** 리그별로 칸을 감추는 분기는 두지 않는다.
 *
 * ── 색
 *   표 전체에서 빨강(`--color-accent`)은 **1위 숫자 하나**에만 쓴다.
 *   **승률과 킬뎃 두 칸만은 예외로 서플라이 등급색을 그대로 쓴다** (2026-08-30 사용자 지시:
 *   *"승률과 킬뎃은 서플라이의 색깔체계를 똑같이 따라해 나머지는 서플을 아무것도 따라하지마"*).
 *   50%↑ 초록 · 55%↑ 주황 · 60%↑ 파랑 · 65%↑ 노랑. 65 이상만 원본의 밝은배경용 빨강 대신
 *   어두운배경용 노랑을 쓴다 — 빨강은 강조색과 겹친다. 그 밖의 칸은 무채색이다.
 *
 * ── 「알」 (`docs/EGG_SYSTEM_SPEC.md` 5-2)
 *   *"개인랭킹이나 개인기록도 마찬가지야. 알로 일단 전부 씌워놓고 닉네임만 띄워놔"*
 *
 *   표를 알 모음집으로 바꾸지는 않는다 — 그러면 순위가 사라져 랭킹이 랭킹이 아니게 된다.
 *   대신 **행의 마크 자리를 알이 덮고**, 사양 2장이 가리라고 한 칸만 가린다.
 *   ```
 *   가리지 않는다  순위 · 닉네임/클랜명 · 래더
 *   가린다        승률 · N승N패 · 킬뎃
 *   ```
 *   판수(승+패)는 승률 아래에 접혀 있는 값이라 승률과 같이 덮인다. 판수 자체를 따로
 *   보여 주는 자리는 **기록실**이고 거기서는 가리지 않는다 (사양 2장).
 *
 * ── 모바일 (2026-08-28 실측 유지)
 *   좁은 화면에서는 `순위 · 이름 · 래더` 세 칸으로 줄인다.
 *   행 간격 36px · 클랜마크 1.4rem 리듬은 `rankStyles.ts` 가 들고 있다.
 */

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-0.5 text-xs text-faint">{children}</span>
}

/** 지표 한 칸 — 큰 숫자 + 그 아래 접어 둔 보조 수치 */
function Stat({
  value,
  unit,
  sub,
  className = '',
  /**
   * 승률·킬뎃 등급색 (2026-08-30 사용자 지시).
   *
   * *"승률과 킬뎃은 서플라이의 색깔체계를 똑같이 따라해"* — 그래서 이 두 칸만
   * `rateClass` 를 다시 붙인다. 나머지 칸(래더·순위·이름)은 무채색 그대로다.
   * 색 정의는 `packages/ui/src/common/rate.ts` 와 `styles.css` 의 `--color-rate-*` 다.
   */
  tone = '',
  lead,
}: {
  value: string
  unit?: string
  sub?: React.ReactNode
  className?: string
  tone?: string
  /** ★폰에서만★ 큰 숫자 앞에 작게 붙는 말 — 「12승 8패」 (2026-09-23 밤 사장님 「n승n패n%」) */
  lead?: React.ReactNode
}) {
  return (
    <div className={className}>
      {lead ? <span className="mr-1 text-[0.66rem] text-faint md:hidden">{lead}</span> : null}
      <span className={`${NUM} ${tone === '' ? 'text-text-strong' : tone}`}>{value}</span>
      {unit ? <Unit>{unit}</Unit> : null}
      {sub ? <span className={`${SUB} sac-sub-phone`}>{sub}</span> : null}
    </div>
  )
}

/**
 * **한 판도 안 뛴 줄의 승률 칸** (2026-09-03 · O-033).
 *
 * ══ 왜 필요한가 — 첫 20곳 중 9곳(45%)이 「0%  0승 0패」였다 ══
 *
 * 계약이 `win_rate: 0` 을 주는데 그건 **「0% 로 졌다」가 아니라 「표본이 없다」**는 뜻이다.
 * 0 으로 그리면 한 판도 안 뛴 클랜이 **꼴찌로 진 것처럼** 보인다. 색까지 붙어서 더 그렇다.
 *
 * ══ 새로 만든 판단이 아니다 ══
 *
 * 선수 화면이 이미 같은 규칙을 갖고 있다 — `PlayerProfile.tsx` 의
 * ```ts
 * const rated = games > 0     // 한 판도 안 뛴 참가자에게 `승률 0%` 를 적지 않는다
 * ```
 * **표에는 그 분기가 없었다.** 같은 말(`기록 없음`)을 쓴다.
 *
 * ⚠ **래더는 안 건드린다.** 3,000점은 **시작값**이지 없는 값이 아니다.
 * ⚠ 승/패가 하나라도 있으면 예전 그대로 그린다 — 승률이 사라지면 안 된다.
 */
function NoRecordStat({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <span className="text-sm text-meta">기록 없음</span>
    </div>
  )
}

/**
 * 제목 + 안내문구 줄.
 * 화면 순서: 제목줄 → (클랜랭킹만) 부리그 탭 → 표. 그래서 제목과 표를 분리해 둔다.
 */
export function RankHeader({ title, notice }: { title: string; notice: string }) {
  return (
    /* 좁은 화면에서는 한 줄에 나란히 두지 않는다 — 안내문구가 제목을 밀어 두 줄로 쪼갠다 */
    /*
      ⚠ ★제목이 없으면 제목 몫의 여백도 없앤다★ (2026-09-16 사장님:
        «바랑 내용 사이가 좀 떨어져있는거야»). 글자만 빼고 빈 칸을 남기면
        탭과 안내문 사이가 뜬다. 제목이 있는 화면은 그대로다.
    */
    <div
      className={`flex items-baseline max-md:flex-col max-md:items-start ${
        title === '' ? 'mb-3.5' : 'mb-6'
      }`}
    >
      {title === '' ? null : (
        <h1 className="sac-rank-title font-display text-3xl tracking-wide text-text-strong max-md:whitespace-nowrap max-md:text-2xl">
          {title}
        </h1>
      )}
      <div
        className={`sac-rank-note text-sm text-faint ${title === '' ? '' : 'ml-4 max-md:ml-0 max-md:mt-1.5'}`}
      >
        {notice}
      </div>
    </div>
  )
}

/** 표 테두리 박스 */
export function RankBox({ children }: { children: React.ReactNode }) {
  /* 좁은 화면에서는 표가 화면 끝까지 찬다 (`.mobile-bleed` — 컨테이너 좌우 여백을 음수 마진으로 되뺀다) */
  return (
    /*
     * ⚠ ★2026-09-22 — 경계를 보이게 했다★ (사장님: 「랭킹카드의 경계가 너무 안보여
     *   ★보드위에 올라와있는것처럼★ 해줘」).
     *
     *   옛 판은 `border border-line` 하나였다. 바탕이 어두울 때는 그 선이 보였지만
     *   ★흰 바탕(#f2f2f2)에서는 흰 표와 거의 같은 색★ 이라 테두리가 사라졌다.
     *   흰 면 + 또렷한 테두리 + 얕은 그림자 — 서플라이의 흰 카드와 같은 결이다.
     *   ★되돌리려면 이 줄을 `border border-line` 한 줄로 되돌린다★ (`CLAUDE.md` 1-4).
     *
     * ★`sac-rank-board`★ (2026-09-22 밤) — 서플라이 표는 판이 ★투명★ 이고
     *   줄 자체가 회색(#ececec)이다. 줄 사이 1px 틈으로 바탕이 비치면서
     *   그게 구분선 구실을 한다 (값은 `supply-skin.css`).
     */
    <div className="sac-board sac-rank-board mobile-bleed mt-6 max-md:mt-4">
      {children}
    </div>
  )
}

interface TableStateProps {
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  /** 표시할 대상이 하나도 없을 때 (배치고사는 폐지됐다 — 2026-09-01) */
  emptyMessage: string
  columns: number
}

function TableBody({
  loading,
  error,
  onRetry,
  emptyMessage,
  columns,
  isEmpty,
  children,
}: TableStateProps & { isEmpty: boolean; children: React.ReactNode }) {
  if (error) return <ErrorState message="랭킹을 불러오지 못했습니다." onRetry={onRetry} />
  if (loading) return <RankSkeleton columns={columns} />
  if (isEmpty) return <EmptyState message={emptyMessage} />
  return <>{children}</>
}

function RankSkeleton({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 20 }, (_, row) => (
        <div key={row} className={ROW}>
          {Array.from({ length: columns }, (_, col) => (
            <div key={col} className="flex-1 px-2">
              {/* 모바일 행 높이(36px)에 맞춘 막대 */}
              <Skeleton className="h-[22px] w-full max-md:h-[1.25rem]" />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/** 1위만 강조한다 — 표에서 빨강을 쓰는 자리는 여기 하나다 */
function rankClass(rank: number): string {
  return `${COL_RANK} ${NUM} ${rank === 1 ? RANK_TOP : 'text-meta'}`
}

/**
 * ★순위 칸에 등급 색을 입힌다★ (2026-09-07 · Part 10 ⑤ · 시안).
 *
 * 시안은 ★순위 숫자와 닉네임을 같은 등급 색★ 으로 칠한다 (`rankColor` · `nameColor`).
 * 경계값은 ★공통 함수 `rankTone` 한 곳★ 이 정한다 — 여기서 다시 적지 않는다.
 *
 * ⚠ ★옛 방식(`rankClass`)은 지우지 않았다★ — 1위만 강조색, 나머지는 흐림.
 *   `rankTone` prop 을 안 넘기면 지금까지의 표 그대로다 (`CLAUDE.md` 1-4).
 */
function rankToneClass(rank: number): string {
  return `${COL_RANK} ${NUM} ${rank <= 3 ? 'font-bold' : ''}`
}

/**
 * 칸을 하나도 감추지 않는 기본값 — **넘기지 않으면 지금까지의 표 그대로다.**
 *
 * 리그별로 무엇을 감출지는 화면이 아니라 `@sacloud/contract` 의 `leagueScreen()` 이 정한다
 * (2026-09-01). D-204 의 «리그별 분기를 흩뿌리지 마라» 를 지키는 방법이다 —
 * 분기가 없는 게 아니라 **한 곳에 모여 있다.**
 */
/**
 * ★승리·패배를 따로 칸으로★ (2026-09-22 사장님: 「몇승 몇패인지 적어줘」).
 * `false` 로 두면 옛 판 — 승률 아래 작은 글씨 — 으로 돌아간다 (`CLAUDE.md` 1-4).
 */
const WL_COL = true as boolean
/** 승률 아래에 「N승 N패」 를 접어 두던 옛 판. 칸을 따로 세운 지금은 끈다 */
const WL_SUB = false as boolean

const ALL_COLUMNS: RankColumns = { rank: true, winRate: true, kd: true, rating: true }

/** 실제로 그리는 칸 수 — 뼈대(skeleton)의 막대 개수를 맞춘다 */
function visibleCount(columns: RankColumns, withKd: boolean): number {
  return (
    1 /* 이름 칸은 항상 있다 */ +
    (columns.rank ? 1 : 0) +
    (columns.winRate ? 1 : 0) +
    (withKd && columns.kd ? 1 : 0) +
    (columns.rating ? 1 : 0)
  )
}

/* ------------------------------------------------------------------ 클랜 --- */

/**
 * 티어(부리그) 경계에 넣는 가로선 + 작은 라벨 (2026-09-01 사용자 지시).
 *
 * > "IPL도 세로로 일열 배열하는데 우리가 정해놨던 티어별로 선을 그어서 나눠줘"
 *
 * **배경을 칠하지 않는다.** 선 하나와 글자 하나뿐이다 (D-204 — 진홍은 아껴 쓴다).
 * 라벨 문자열은 `divisionLabel` 이 만든다 — 공식리그면 `1부리그`, 무소속리그면 `1티어`.
 */
function DivisionDivider({ division, leagueCategory }: { division: number; leagueCategory?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-b-line-soft px-4 pb-1.5 pt-3.5 max-md:px-3">
      <span className={`${NUM} text-[0.72rem] tracking-[0.18em] text-accent`}>
        {divisionLabel(division, leagueCategory)}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/**
 * 이 표가 **실제로 읽는 값**만 추린 것 (2026-09-02 · D-260).
 *
 * `ClanRankRow` 는 그대로 들어맞는다 — 넓힌 것이지 바꾼 것이 아니다.
 * 「고용가능 클랜」 화면은 랭킹 API 가 아니라 참가 클랜 API(`leagueClans`)에서 오는데,
 * 그쪽 응답에는 `category`(클랜 구분)가 없다. 표는 그 값을 **한 번도 쓰지 않으므로**
 * 없는 값을 빈 문자열로 지어내 채우는 대신 타입에서 요구하지 않게 했다.
 */
/** 승격·강등 표시 (2026-09-11 사장님) — 표는 받은 대로 그리고, 누가 위태로운지는 화면이 정한다 */
export type ClanRankNote = 'promote' | 'relegate' | null

/* -------------------------------------------------------------- 라이벌 --- */

/**
 * ★라이벌★ — 그 클랜이 시즌 0 에서 제일 많이 붙은 상대 (2026-09-17 사장님:
 * 「라이벌 클랜의 클랜마크 넣어줘 상대로 많이한 클랜」).
 *
 * ── 왜 메인멤버 대신인가
 *   그 자리는 원래 주요멤버 다섯이었는데 사장님이 「5명 다 안채워지는곳들도 있어서
 *   애매한거같은데」 하셨다. 라이벌은 ★한 클랜에 하나뿐★ 이라 그 문제가 없다.
 *   한 판이라도 붙었으면 반드시 있고, 안 붙었으면 그냥 빈다.
 *
 * ── 마크가 먼저다
 *   사장님이 원하신 것은 ★마크★ 다 (`CLAUDE.md` — 클랜명 앞에 항상 마크).
 *   이름은 좁은 화면에서 접고 마크만 남긴다. 몇 판 붙었는지는 뒤에 작게.
 *
 * 옛 판(주요멤버 다섯)은 `MainMembers` 로 그대로 살아 있다 — `SIDE_MODE` 를
 * `'members'` 로 두면 돌아오고, 이 라이벌 칸은 `'rival'` 로 돌아온다 (`CLAUDE.md` 1-4).
 */
function RivalCell({ rival, leagueSlug }: {
  rival: ClanRankTableRow['rival']
  leagueSlug: string
}) {
  /* 아직 한 판도 안 붙었으면 ★자리를 그냥 비운다★ — 「없음」 을 적지 않는다 */
  if (!rival) return null
  return (
    <Link prefetch={false}
      className="flex min-w-0 items-center gap-2 hover:text-text-strong"
      href={leagueClanPath(leagueSlug, rival.clan.slug)}
      title={`라이벌 ${rival.clan.name} · ${rival.games}판`}
    >
      <MarkCircle clan={rival.clan} size={22} title={rival.clan.name} />
      <span className="truncate text-[0.82rem] text-meta max-md:hidden">{rival.clan.name}</span>
      <span className="shrink-0 text-[0.72rem] text-faint">{rival.games}판</span>
    </Link>
  )
}

/* ------------------------------------------------------------ 메인멤버 --- */

/**
 * ★클랜랭킹의 「메인」 칸★ (2026-09-16 밤 사장님:
 * «클랜랭킹에서 클명이랑 승률사이에 메인 이라고 쓰고 메인멤버 5명을 써주든가
 *  암튼 개인기록카드도 그렇고 다 너무 공간낭비가 심해»).
 *
 * PC 1440px 에서 클랜명 끝과 승률 사이가 ★800px 비어 있었다.★ 그 자리를 메운다.
 *
 * ── ★글자를 자르지 않는다. 사람 수를 줄인다★ (총괄 지시)
 *   닉네임을 «…» 로 끊으면 사장님이 지적하신 「잘림」 이 여기서 또 생긴다.
 *   그래서 ★줄바꿈을 켜 두고 한 줄 높이만 남긴 채 넘치는 것을 감춘다.★
 *   자리가 모자라면 ★다섯째 사람이 통째로 사라진다★ — 이름은 언제나 온전하다.
 *   (`flex-wrap` + 한 줄 높이 + `overflow:hidden` — 재지 않고도 되는 방법이다)
 *
 * ── 지키는 것
 *   · ★폰에서는 통째로 감춘다★ — 390px 에 넣을 자리가 없다. 가로 스크롤은 절대 안 된다
 *   · 빈 배열이면 ★그냥 비운다.★ 「없음」 을 적지 않는다 (없는 말을 만들지 않는다)
 *   · ★클랜마크는 이름 앞에 항상★ (이 저장소 규칙). 모르면 `MarkCircle` 이 구름을 그린다
 *   · 스나는 `[S]` 로 표시한다 — 클랜 상세 카드가 「스나수」 라고 적는 것과 같은 사실이다
 */
/**
 * ★★메인스나 · 메인라플★★ (2026-09-22 사장님)
 *
 * > 「메인스나 메인라플 닉네임을 ★라이벌 자리★ 에 적어줘(★마크없이 닉네임만★,
 * >  누르면 기본정보로 가지게끔) 메인스나 메인라플 ★각 클랜에서 점수 젤 높은 스나수1명
 * >  점수젤 높은 라플수한명★ 골라서 넣어줘」
 *
 * ── ★새로 셈하지 않는다★
 *   `main_members` 가 이미 ★그 리그 안의 실력 점수 순★ 으로 온다 (계약 `ClanMainPlayer`).
 *   IPL 클랜이면 IPL 점수, Supply1.0 클랜이면 Supply1.0 점수다 —
 *   `LeaguePlayer` 자체가 리그별이라 ★경계가 저절로 맞는다.★
 *   여기서는 ★무기별 첫 사람★ 만 고른다 (이미 점수 내림차순이다).
 *
 * ── ★마크를 안 그린다★ — 사장님이 못박으신 것. 옆의 클랜 칸에 이미 마크가 있다.
 * ── 무기가 없는 클랜은 그 줄을 ★안 만든다★ — 「없음」 을 적지 않는다 (D-106).
 */
function MainDuo({ members, leagueSlug }: { members: readonly ClanMainPlayer[]; leagueSlug: string }) {
  /* 계약이 점수 내림차순으로 준다 — 무기별 ★첫 사람★ 이 곧 1등이다 */
  const sniper = members.find((m) => m.weapon === 1) ?? null
  const rifle = members.find((m) => m.weapon === 0) ?? null
  if (sniper === null && rifle === null) return null
  /*
   * ⚠ ★2026-09-22 밤 — 옆으로 나란히에서 ★두 줄★ 로★ (운영 화면을 찍어서 잡았다)
   *   한 줄로 놓으니 이 칸이 229px 을 먹어 ★클랜명이 잘렸다.★ 두 줄로 쌓으면
   *   160px 에 들어가고, 줄 높이 22px(11 + 11)은 ★그대로★ 라 표의 리듬이 안 흔들린다.
   */
  const one = (label: string, m: ClanMainPlayer | null) =>
    m === null ? null : (
      <span className="flex min-w-0 items-baseline gap-[5px] whitespace-nowrap leading-[11px]">
        <span className="shrink-0 text-[0.62rem] leading-[11px] text-faint">{label}</span>
        <Link
          prefetch={false}
          href={leaguePlayerPath(leagueSlug, m.player.id)}
          className="truncate text-[0.72rem] leading-[11px] text-meta hover:text-text-strong"
        >
          {m.player.name}
        </Link>
      </span>
    )
  return (
    <span aria-label="메인스나 메인라플" className="flex h-[22px] min-w-0 flex-col justify-center gap-0 overflow-hidden">
      {one('스나', sniper)}
      {one('라플', rifle)}
    </span>
  )
}

function MainMembers({ members, clan }: { members: readonly ClanMainPlayer[]; clan: ClanRankTableRow['clan'] }) {
  if (members.length === 0) return null
  return (
    <span
      aria-label="메인멤버"
      /* 한 줄 높이(22px)만 남기고 넘치는 사람은 아랫줄로 내려가 감춰진다 */
      className="flex h-[22px] flex-wrap content-start items-center gap-x-[14px] gap-y-1 overflow-hidden"
    >
      {members.map((m) => (
        <span key={m.player.id} className="flex shrink-0 items-center gap-[5px] whitespace-nowrap">
          <MarkCircle clan={clan} size={16} title={clan.name} />
          <span className="text-[0.8rem] leading-none text-meta">{m.player.name}</span>
          {m.weapon === 1 ? <SniperMark size={10} /> : null}
        </span>
      ))}
    </span>
  )
}

/**
 * `badges` 는 ★받아도 되고 안 받아도 된다★ (2026-09-14).
 * 안 넘기는 화면(옛 래더 표 등)은 한 픽셀도 안 바뀐다 (`CLAUDE.md` 1-4).
 */
export type ClanRankTableRow = {
  rank: number | null
  note?: ClanRankNote
  badges?: readonly string[]
  /**
   * ★주요멤버 다섯★ — 넘겨도 되고 안 넘겨도 된다 (2026-09-17).
   * 안 넘기는 화면(옛 래더 표 · 부리그 탭)은 한 픽셀도 안 바뀐다 (`CLAUDE.md` 1-4).
   */
  main_members?: readonly ClanMainPlayer[]
  /**
   * ★라이벌★ — 제일 많이 붙은 상대 (2026-09-17 사장님).
   * 주요멤버와 같은 자리를 쓴다. 안 넘기는 화면은 안 바뀜다.
   */
  rival?: ClanRankRow['rival']
} & Pick<
  ClanRankRow,
  'league_clan_id' | 'clan' | 'division' | 'win' | 'lose' | 'win_rate' | 'rating'
>

export interface ClanRankTableProps extends Omit<TableStateProps, 'columns' | 'emptyMessage'> {
  leagueSlug: string
  rows?: readonly ClanRankTableRow[]
  /**
   * 티어(부리그)가 바뀌는 자리마다 가로선을 넣는다 (2026-09-01).
   *
   * **기본값은 `false` 다 — 넘기지 않으면 예전 표 그대로다.** 부리그 탭 화면은
   * 한 부리그만 보여 주므로 선을 그을 경계 자체가 없다.
   * 행은 이미 `division` 오름차순으로 와 있어야 한다 (API `division=0` + 무소속리그).
   */
  groupByDivision?: boolean
  /** `official` | `independent` — 구분선 라벨 표기만 바꾼다 (D-165) */
  leagueCategory?: string
  /**
   * 행마다 클랜 이름 옆에 **티어 라벨**(`3티어`)을 붙인다 (2026-09-02 지시 #23).
   *
   * IPL 클랜랭킹은 래더 순으로 세우되(총괄 판단 — 티어 우선 정렬은 점수가 섞여 보였다)
   * 티어는 보여야 한다. 순서가 티어별이 아니면 경계선(`groupByDivision`)은 뜻이 없으므로
   * 라벨로 보인다. **기본값 `false` — 넘기지 않으면 예전 표 그대로다.**
   */
  showTierLabel?: boolean
  /**
   * ★모집단★ — 참가 클랜 수 (2026-09-16 사장님: «참가중인 인원수나 클랜수의
   * 상위비율로 하자»). 주면 순위 숫자·클랜명이 ★비율 색★ 이 된다.
   */
  rankTotal?: number | null
  /**
   * 보여 줄 칸 (2026-09-01). 넘기지 않으면 **지금까지의 표 그대로**다.
   *
   * 리그마다 다른 칸을 화면에서 `if (slug === …)` 로 가르지 않는다 —
   * 규칙은 `@sacloud/contract` 의 `leagueScreen()` 한 곳에 있다.
   */
  columns?: RankColumns
}

/**
 * ★클랜 인식표★ (2026-09-12 사장님)
 *
 * > «클랜도 아스트라 구간은 1,2,3등 인식표랑 (빨간색) 4등-6등(검은색) 7등이하(하얀색)
 * >  인식표 만들어줘 강등위기는 인식표 주지마»
 *
 * ASTRA 구간(division 1 · IPL)만 준다. 다른 구간·SPL·열산에는 없다.
 * ★강등위기(`note === 'relegate'`)는 등수와 상관없이 안 준다.★
 * 선수 인식표와 그림은 같고 경계만 다르다 (선수는 3 / 10 / 100).
 */
/**
 * ⚠ ★2026-09-14 저녁 — 인식표를 껐다★ (사장님: «IPL 인식표 일단 없애줘»).
 *
 *   «일단» 이라고 하셔서 ★규칙은 그대로 두고 스위치만★ 내린다.
 *   다시 켜려면 `CLAN_PLATE_ON = true` 로 두면 옛 모습이 그대로 돌아온다
 *   (ASTRA 1~3등 불 · 4~6등 먹구름 · 7등부터 흰구름 · `CLAUDE.md` 1-4).
 *
 *   ⚠ 인식표가 없어지면 그 줄에 걸어 둔 글자 그림자(`.v3-plate-row ~ *`)도 같이
 *     빠진다 — 그건 원래 «불꽃 위에서 숫자가 안 읽힌다» 를 고치려던 것이라 괜찮다.
 */
const CLAN_PLATE_ON = false

function clanPlateOf(row: { rank: number | null; division: number; note?: ClanRankNote }, leagueCategory?: string): 'fire' | 'dark' | 'light' | null {
  if (!CLAN_PLATE_ON) return null
  if (leagueCategory !== 'independent' || row.division !== 1) return null
  if (row.note === 'relegate') return null
  const rank = row.rank
  if (rank === null) return null
  if (rank <= 3) return 'fire'
  if (rank <= 6) return 'dark'
  return 'light'
}

export function ClanRankTable({
  leagueSlug,
  rows,
  loading,
  error,
  onRetry,
  groupByDivision = false,
  leagueCategory,
  columns = ALL_COLUMNS,
  showTierLabel = false,
  rankTotal = null,
}: ClanRankTableProps) {
  const { brokenClanSlugs } = useEggKnowledge()
  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)는 호출부가 뭐라 하든 선을 긋지 않는다.
     규칙은 `@sacloud/contract` 의 `leagueScreen` 한 곳이다. 행의 `division` 값 자체는 그대로 온다 */
  const divideByDivision = groupByDivision && showsTier(leagueSlug)
  /* 「메인」 칸은 ★자료가 온 표에만★ 선다 — 안 넘기는 화면은 칸 자체가 안 생긴다 (`CLAUDE.md` 1-4) */
  /*
   * ⚠ ★2026-09-22 — 이 칸이 세 번 바뀌었다★
   *   ① 라이벌 (9/17) → ② 통째로 껐다 (사장님: 「라이벌 저거 그냥 없애줘」)
   *   → ③ ★지금★ — 같은 자리에 ★메인스나·메인라플★ (사장님이 이어서 지정하심)
   *   `SIDE_MODE` 를 `'rival'` 이나 `'members'` 로 두면 ①·옛 「메인 다섯」이 돌아온다.
   *   ★`RivalCell` 도 `MainMembers` 도 안 지웠다★ (`CLAUDE.md` 1-4).
   */
  /* `as` 로 넓혀 둔다 — 안 그러면 TS 가 `'duo'` 하나로 좁혀서 나머지 갈래를 «닿지 않는 코드» 라고 막는다 */
  const SIDE_MODE = 'duo' as 'duo' | 'rival' | 'members' | 'off'
  const anyRivals = (rows ?? []).some((row) => row.rival != null)
  const anyMembers = (rows ?? []).some((row) => (row.main_members?.length ?? 0) > 0)
  const showSide =
    SIDE_MODE === 'off'
      ? false
      : SIDE_MODE === 'rival'
        ? anyRivals
        : anyMembers
  /* 바로 앞 행과 부리그가 다르면 그 위에 선을 긋는다. 첫 행에도 긋는다 —
     맨 위 묶음이 어느 티어인지 이름이 없으면 아래 묶음들만 이름이 붙어 이상해진다 */
  let lastDivision: number | null = null
  return (
    <>
      <div className={HEAD}>
        {columns.rank ? <div className={COL_RANK}>순위</div> : null}
        <div className={COL_NAME}>클랜</div>
        {/* 「메인」 머리글 — 한 줄이라도 멤버가 오면 세운다. 폰에서는 칸째로 없다 */}
        {showSide ? (
          <div className={COL_MAIN}>
            {SIDE_MODE === 'duo' ? '메인스나 · 메인라플' : SIDE_MODE === 'rival' ? '라이벌' : '메인'}
          </div>
        ) : null}
        {/*
          ★승리 · 패배 두 칸★ (2026-09-22 사장님: 「몇승 몇패인지 적어줘 저렇게
          노란표시 된곳처럼」 — 서플라이 클랜랭킹의 「승리 / 패배」 칸을 가리키셨다).
          옛 판은 승률 아래에 작게 접혀 있었다 (`WL_SUB` 로 되돌린다).
          ★폰에서는 칸째로 사라진다★ — 390px 에 여섯 칸은 안 들어간다. 그때는 접힌 판이 선다.
        */}
        {columns.winRate && WL_COL ? (
          <>
            <div className={COL_WL}>승리</div>
            <div className={COL_WL}>패배</div>
          </>
        ) : null}
        {columns.winRate ? <div className={COL_STAT}>승률</div> : null}
        {columns.rating ? <div className={COL_RATING}>래더</div> : null}
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={visibleCount(columns, false) + (columns.winRate && WL_COL ? 2 : 0)}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="아직 기록된 클랜이 없습니다."
      >
        {rows?.map((row) => {
          const egg: EggState = brokenClanSlugs.includes(row.clan.slug) ? 'broken' : 'sealed'
          /*
           * ★경계선은 「구간 묶음」이 바뀔 때만★ (2026-09-13 사장님:
           *   «Astra 는 따로 둬 챌린저1,2구분만 없애는거야»).
           *   옛 판은 `row.division !== lastDivision` — CHALLENGER 1 과 2 사이에도 선이 그였다.
           */
          const divider =
            divideByDivision &&
            (lastDivision === null || tierGroupOf(row.division) !== tierGroupOf(lastDivision))
          lastDivision = row.division
          return (
          <Fragment key={row.clan.id}>
          {divider ? (
            <DivisionDivider division={row.division} leagueCategory={leagueCategory} />
          ) : null}
          <div className={ROW} style={clanPlateOf(row, leagueCategory) ? { position: 'relative' } : undefined}>
            {/* ★인식표★ — ASTRA 1~3등 불 · 4~6등 먹구름 · 7등부터 흰구름 (2026-09-12 사장님).
                강등위기는 안 준다. 줄 뒤에 깔리고 글자 위로 안 올라온다 */}
            {(() => { const plate = clanPlateOf(row, leagueCategory); return plate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${plate}`} /> : null })()}
            {/* ★모집단을 알면 «비율» 로 칠한다★ (2026-09-16 사장님) */}
            {columns.rank ? (
              <div
                className={rankClass(row.rank ?? 0)}
                style={
                  rankTotal === null
                    ? undefined
                    : { color: nameTint(rankColorByRatio(row.rank ?? 0, rankTotal)) }
                }
              >
                {row.rank ?? '-'}
              </div>
            ) : null}
            <div className={COL_NAME}>
              <Link prefetch={false}
                className="flex min-w-0 items-center hover:text-text-strong"
                href={`/league/${leagueSlug}/clan/${row.clan.slug}`}
              >
                {/* 알이 마크를 덮는다. 깨졌으면 마크가 그대로 나오고 은은하게 빛난다 */}
                <Egg state={egg} size="xs" label={row.clan.name} className={MARK}>
                  <MarkCircle clan={row.clan} size={28} title={row.clan.name} />
                </Egg>
                <span
                  className="truncate"
                  style={
                    rankTotal === null
                      ? undefined
                      : { color: nameTint(rankColorByRatio(row.rank ?? 0, rankTotal)) }
                  }
                >
                  {row.clan.name}
                </span>
                {CLAN_ROW_NOTE && row.note ? (
                  <span
                    className="ml-2 shrink-0 rounded px-1.5 py-[2px] text-[10px] font-bold leading-none"
                    style={
                      row.note === 'promote'
                        ? { color: '#8ff0ff', background: 'rgba(143,240,255,.10)', border: '1px solid rgba(143,240,255,.45)' }
                        : { color: '#ff8a90', background: 'rgba(255,90,99,.10)', border: '1px solid rgba(255,90,99,.45)' }
                    }
                  >
                    {/* ★폰에서는 두 글자★ (2026-09-15 · 무한 QA) — 네 글자가 이름 자리를 먹어
                        «-tsAr.nTc» 가 «-t···» 로 잘렸다. 뜻은 title 이 채운다 */}
                    <span className="md:hidden" title={row.note === 'promote' ? '승격유력' : '강등위기'}>
                      {row.note === 'promote' ? '승격' : '강등'}
                    </span>
                    <span className="max-md:hidden">
                      {row.note === 'promote' ? '승격유력' : '강등위기'}
                    </span>
                  </span>
                ) : null}
                {/* ★뱃지★ — 육각 축 중 리그 5위 안에 든 것 (2026-09-14 사장님).
                    ⚠ 2026-09-17 사장님이 「다 없애」 하셔서 안 그린다. 셈은 그대로다 */}
                {CLAN_ROW_BADGES ? <ClanBadges badges={row.badges} leagueSlug={leagueSlug} /> : null}
                {/* 티어 라벨 — IPL 만 (지시 #23). 순서는 래더 순이라 경계선 대신 행마다 적는다 */}
                {showTierLabel ? (
                  <span className="ml-2 shrink-0 text-xs text-faint">
                    {divisionLabel(row.division, leagueCategory)}
                  </span>
                ) : null}
              </Link>
            </div>
            {/*
              ★「메인」 — 클랜명과 승률 사이의 빈 800px★ (2026-09-16 밤 사장님).
              알이 안 깨진 클랜은 기록을 가리는 중이므로 멤버도 안 보인다 (승률·래더와 같은 규칙).
              멤버가 없으면 `MainMembers` 가 `null` 을 내어 ★자리를 그냥 비운다★ — 「없음」 을 적지 않는다.
            */}
            {showSide ? (
              <div className={COL_MAIN}>
                {egg === 'sealed' ? null : SIDE_MODE === 'duo' ? (
                  <MainDuo members={row.main_members ?? []} leagueSlug={leagueSlug} />
                ) : SIDE_MODE === 'rival' ? (
                  <RivalCell rival={row.rival} leagueSlug={leagueSlug} />
                ) : (
                  <MainMembers members={row.main_members ?? []} clan={row.clan} />
                )}
              </div>
            ) : null}
            {/* 승/패는 없앤 것이 아니라 승률 아래로 접었다. 알이 있으면 둘 다 가린다 */}
            {!columns.winRate ? null : egg === 'sealed' ? (
              <div className={COL_STAT}>
                <EggVeil state={egg}>{null}</EggVeil>
              </div>
            ) : row.win + row.lose === 0 ? (
              /* 한 판도 안 뛰었다 — `0%  0승 0패` 로 그리지 않는다 (O-033 · 위 NoRecordStat) */
              <NoRecordStat className={COL_STAT} />
            ) : (
            <>
              {WL_COL ? (
                <>
                  <div className={`${COL_WL} ${NUM} text-text`}>{formatCount(row.win)}승</div>
                  <div className={`${COL_WL} ${NUM} text-text`}>{formatCount(row.lose)}패</div>
                </>
              ) : null}
              <Stat
                className={COL_STAT}
                value={formatRate(row.win_rate)}
                tone={rateClass(row.win_rate)}
                unit="%"
                /*
                 * ★PC 는 칸으로, 폰은 접어서★
                 *   PC 에서는 바로 왼쪽에 「승리 / 패배」 칸이 서 있으므로 ★여기 또 적지 않는다★
                 *   (같은 값이 두 번 보인다). 폰에서는 그 칸이 `max-md:hidden` 으로 사라지니
                 *   ★여기가 유일한 자리★ 다 — 그래서 `md:hidden` 으로 폰에서만 남긴다.
                 *   `WL_COL` 을 끄면 옛 판대로 PC 에서도 이 줄이 보인다.
                 */
                sub={
                  WL_SUB || !WL_COL ? (
                    <>
                      {formatCount(row.win)}승 {formatCount(row.lose)}패
                    </>
                  ) : (
                    <span className="md:hidden">
                      {formatCount(row.win)}승 {formatCount(row.lose)}패
                    </span>
                  )
                }
              />
            </>
            )}
            {/* ⚠ ★2026-09-21 — 클랜도 「점」 이다★ (개인과 같은 말 · 3부와 같은 표기).
                「32.5층」 은 ★같은 층이 둘 나와 순서가 안 보였고★, 사장님이 9/15 에
                「티어의 흔적」 이라 부르신 바로 그 말이다 */}
            {columns.rating ? (
              <div className={`${COL_RATING} ${NUM} text-text-strong`}>
                {formatRatingPoint(row.rating)}
              </div>
            ) : null}
          </div>
          </Fragment>
          )
        })}
      </TableBody>
      <EggVeilLegend />
    </>
  )
}

/* ---------------------------------------------------------------- 플레이어 --- */

export interface PlayerRankTableProps extends Omit<TableStateProps, 'columns' | 'emptyMessage'> {
  leagueSlug: string
  rows?: readonly PlayerRankRow[]
  /**
   * 무기 축 (D-169). 기본값 `all` — **넘기지 않으면 기존 개인랭킹 그대로다.**
   *
   * `sniper` / `rifle` 이면 마지막 칸이 통합 래더가 아니라
   * **그 무기로 얻은 래더 증감의 합**(`rating_delta`)이 된다.
   * 무기별 절대 점수를 지어내지 않는다 — 무기 분리는 기록만 나눈다 (`CLAUDE.md` 3-B).
   */
  weapon?: RankWeapon
  /**
   * 보여 줄 칸 (2026-09-01). 넘기지 않으면 **지금까지의 표 그대로**다.
   *
   * `10🏔️`(`sanply`)는 비공식이라 래더도 순위도 없어 두 칸이 빠진다.
   * 그 판단은 여기가 아니라 `@sacloud/contract` 의 `leagueScreen()` 이 한다.
   */
  columns?: RankColumns
  /**
   * **소속 클랜명**을 어떻게 적을 것인가 (2026-09-02 사장님 지시 #10 · #10-2).
   *
   * > "순위닉네임, 래더 사이에 소속클랜명을 적어라" · "전체랭킹에도 넣어라 깔끔하게 넣어라"
   *
   * ```
   * 'none'    안 적는다 — **기본값. 넘기지 않으면 지금까지의 표 그대로다**
   * 'line'    닉네임 **아래 작은 줄**로 적는다 — 전체 랭킹 · 홈이 쓴다 (#10-2)
   * 'column'  닉네임 옆 **별도 칸**으로 적는다 — #10 때 홈에 먼저 넣었던 방식. 지우지 않았다
   * ```
   *
   * ── 왜 칸이 아니라 줄인가 (#10-2)
   *   전체 랭킹의 SPL | IPL 반폭 칸은 고정폭(순위·승률·킬뎃·래더·여백)만 392px 이라
   *   닉네임 글자에 남는 폭이 이미 ~106px 이다. 여기에 칸을 하나 더 세우면 PC 에서도
   *   승률이나 킬뎃을 접어야 한다. 닉네임 아래 줄로 두면 **어느 폭에서도 값을 접지 않고**
   *   닉네임·클랜명이 둘 다 읽힌다 — 폰(390px)도 같다.
   *   옛 칸 방식(`'column'`)은 그대로 살아 있다 (`CLAUDE.md` 10-4).
   *
   * 클랜명은 그 리그의 클랜 기록실로 가는 링크다. 소속이 없으면(`clan === null`) `무소속`
   * 이라고 적는다 — 계약이 `null` 을 그 뜻으로 정해 두었다 (`PlayerRankRow.clan` 주석).
   * 값이 없는 것을 `-` 로 감추지 않는다.
   */
  clanName?: 'none' | 'line' | 'column'
  /**
   * ★순위·닉네임에 등급 색을 입힐 것인가★ (2026-09-07 · Part 10 ⑤ · 시안).
   *
   * `false`(기본) — 1위만 강조색, 나머지는 흐림. ★넘기지 않으면 지금까지의 표 그대로다.★
   * `true`        — 순위와 닉네임을 `rankTone` 등급 색으로 (3 / 20 / 40 / 100).
   *
   * 경계값은 ★공통 함수 한 곳★ 이 정한다 — 화면마다 복제하지 않는다 (사장님 지시).
   */
  rankTone?: boolean
  /**
   * ★모집단★ — 참가 중인 인원·클랜 수 (2026-09-16 사장님: «참가중인 인원수나
   * 클랜수의 상위비율로 하자»). 주면 등수 색이 ★비율★ 로 바뀐다.
   * 안 주면 지금까지처럼 절대 등수로 칠한다 (`CLAUDE.md` 1-4).
   */
  rankTotal?: number | null
}

/**
 * ★인식표★ (2026-09-11 사장님) — ★ASTRA 구간 선수만★ 준다.
 *
 * > «이 인식표는 1,2,3등은 먹구름 버전 4등부터 100등은 하얀구름 버전으로 뒷배경에 깐다»
 * > «인식표 1,2,3등 색깔만 불타는 색으로 (…) 4등부터 10등까지는 원래하던 검정색 (…) 11장부터는 그대로»
 *
 * 구간은 ★가장 많이 뛴 티어★(`home_tier`) 다 — 클랜 소속이 아니다.
 * 100등 밖이면 안 준다. 그림·규칙은 클랜 카드와 같다 (`.v3-plate`).
 */
/* ★층수 색★ 은 공통 함수 한 곳이 정한다 (2026-09-11 사장님) */
/* ⚠ 2026-09-14 저녁 — 클랜 쪽과 ★같이 껐다★ (사장님: «IPL 인식표 일단 없애줘»).
      개인랭킹 인식표도 같은 그림·같은 규칙이라 한쪽만 남기면 화면이 어긋난다.
      되살리려면 위 `CLAN_PLATE_ON` 과 같이 `true` 로 둔다 */
function plateOf(row: { rank: number; home_tier?: number | null }): 'fire' | 'dark' | 'light' | null {
  if (!CLAN_PLATE_ON) return null
  if (row.home_tier !== 1) return null
  if (row.rank > 100) return null
  if (row.rank <= 3) return 'fire'
  if (row.rank <= 10) return 'dark'
  return 'light'
}

export function PlayerRankTable({
  leagueSlug,
  rows,
  loading,
  error,
  onRetry,
  weapon = 'all',
  columns = ALL_COLUMNS,
  clanName = 'none',
  rankTone = false,
  rankTotal = null,
}: PlayerRankTableProps) {
  const clanColumn = clanName === 'column'
  const clanLine = clanName === 'line'
  /* 2026-09-11: 무기 탭도 ★같은 점수 순★ 이다 — 점수가 오면 점수 칸으로 그린다.
     래더증감 칸은 점수가 아예 없는 표(옛 방식)에서만 쓴다 */
  const byWeapon = weapon !== 'all' && !(rows ?? []).some((row) => row.score !== null && row.score !== undefined)
  const { brokenPlayerIds } = useEggKnowledge()

  /**
   * 좁은 화면에서 지표 칸을 숨기는 규칙 (2026-09-02 검수 결함 수정).
   *
   * 옛 규칙은 승률·킬뎃에 **무조건** `COL_HIDDEN` 이었다 — 「폰은 순위·이름·래더 세 칸」.
   * 그런데 래더가 없는 표(`10mountain` · `leagueScreen` 이 순위·래더를 뺀다)에서는
   * 그 규칙이 값을 **0개**로 만든다. 390px 실측: 닉네임만 남았다. 데이터가 사라지면
   * 결함이다 (`CLAUDE.md` 3장 8번).
   *
   * 그래서 **래더 칸이 없을 때만** 첫 지표(승률, 없으면 킬뎃)를 폰에서도 남긴다.
   * 래더가 있는 표는 옛 규칙 그대로다. 리그 이름을 보지 않는다 — 칸 구성만 본다.
   * 옛 동작으로 되돌리려면 아래 두 값을 `COL_HIDDEN` 상수로 바꾸면 된다 (`CLAUDE.md` 10-4).
   */
  /* 2026-09-11 QA(폰 최적화): 래더 칸이 있어도 ★승률은 폰에 남긴다★ — 순위·이름·점수만으로는 왜 그 등수인지 안 보였다.
     옛 규칙: columns.rating ? null : … */
  const keptStat = columns.winRate ? 'winRate' : columns.kd ? 'kd' : null
  /* 점수 표인가 — 한 줄이라도 점수가 있으면 점수 표. 점수 없는 줄은 래더로 채우지 않고 «측정 중» (QA 교차검토 · 기록 없음 선수가 «3,000점» 으로 보였다) */
  const scoreTable = !byWeapon && (leagueScreen(leagueSlug).scoreLeague || (rows ?? []).some((row) => row.score !== null && row.score !== undefined))
/**
 * ★★순위 칸에 무엇을 적나★★ (2026-09-21 사장님: 「★실력점수로 세워라★」)
 *
 * ── 왜 정해야 했나
 *
 *   ★줄을 세우는 값과 적히는 값이 달랐다.★
 *   ```
 *   줄 세움   LeaguePlayerHex.score     3397 · 3392 · 3374 …   (9/10 확정 공식)
 *   적힘      LeaguePlayer.scoreRating  13.4 · 13.6 · 12.9 …   (9/18 경기당 평균)
 *   ```
 *   그래서 사장님 화면에 «13.4가 1등인데 20.2가 16등» 이 떴고,
 *   「도대체 순위 어케 측정하는거냐」 가 여기서 나왔다.
 *
 * ── 고른 답 — ★줄을 세우는 값을 적는다★
 *   `'skill'`   실력점수를 ★층수★ 로 적는다 (3397 → 34.0층). ★지금 이것★
 *   `'average'` 경기당 점수(13.4). 2026-09-18 ~ 09-21 아침까지 쓰던 판 (`CLAUDE.md` 1-4)
 *
 * ⚠ 경기당 점수는 ★사라지지 않는다★ — 점수판·MVP 설명은 그대로 그 값을 쓴다.
 *   여기서 정하는 것은 ★랭킹 표의 그 한 칸★ 뿐이다.
 */
type ScoreColumn = 'ladder' | 'skill' | 'average'
/**
 * ⚠ ★2026-09-21 낮 — `ladder` 로 바꿨다★ (사장님: 3rd.supply 3부를 학습하라)
 *   3부 개인랭킹은 ★래더 점수★ 로 줄을 세우고 그 값을 적는다.
 *   `skill`(육각+승률+킬뎃)은 우리가 만든 공식이라 ★원본과 다르다.★
 */
const SCORE_COLUMN = 'ladder' as ScoreColumn

  /*
   * ★점수 래더★ (2026-09-18 사장님: «래더점수도 이걸로 계산해»).
   *
   * 한 줄이라도 값이 오면 이 칸은 ★경기당 점수★ 다 — 머리글도 바뀐다.
   * ⚠ ★층수 색을 쓰지 않는다★ — 그 색은 래더 3000 근처를 가정하고 나뉜다
   *   (45층~ 빨강 …). 점수는 20 근처라 전부 한 색으로 주저앉는다.
   *   없는 색을 지어내지 않고 ★기본 글자색★ 으로 둔다 (D-106).
   */
  const scoreLadder =
    SCORE_COLUMN === 'average' &&
    !byWeapon &&
    (rows ?? []).some((row) => row.score_rating !== null && row.score_rating !== undefined)
  const winRateHidden = keptStat === 'winRate' ? '' : COL_HIDDEN
  /* 2026-09-11 QA 교차검토 8번: 킬뎃도 폰에 남긴다 (옛 규칙: keptStat === 'kd' ? '' : COL_HIDDEN) */
  const kdHidden = ''

  return (
    <>
      <div className={HEAD}>
        {columns.rank ? <div className={COL_RANK}>순위</div> : null}
        <div className={COL_NAME}>닉네임</div>
        {clanColumn ? <div className={COL_CLAN}>클랜</div> : null}
        {/*
          ★서플라이 칸 여덟★ (2026-09-22 밤 · 실측) —
          순위 · 닉네임 · ★승리 · 패배★ · 승률 · 킬덩 · ★평균킬★ · 래더
          2026-08-30 에 우리가 「승률·킬덩 아래 작게」 접어 둔 칸들이다.
          사장님 지시가 ★서플라이와 똑같이★ 라 다시 펴다.
          ★폰에서는 그대로 접힌 판★ 이다 — `COL_PWL` 이 `max-md:hidden` 이다.
        */}
        {columns.winRate ? <div className={COL_PWL}>승리</div> : null}
        {columns.winRate ? <div className={COL_PWL}>패배</div> : null}
        {columns.winRate ? <div className={`${COL_PSTAT} ${winRateHidden} max-md:!w-[104px]`}>승률</div> : null}
        {columns.kd ? <div className={`${COL_PSTAT} ${kdHidden}`}>킬뎃</div> : null}
        {columns.kd ? <div className={COL_PWL}>평균킬</div> : null}
        {/* 무기 탭에서는 통합 래더가 아니라 **그 무기로 얻은 래더 증감의 합**이다 (D-169).
            머리글을 그대로 `래더` 로 두면 같은 자리에 다른 뜻의 숫자가 들어가 거짓말이 된다. */}
        {/* ★통합 개인랭킹은 실력 점수 순★ (2026-09-10 · 사장님 확정). 점수가 온 줄이 하나라도 있으면
            머리글도 «실력 점수» 다. 점수 표가 아직 비어 옛 래더 순으로 왔으면 «래더» 그대로다 */}
        {/* ⚠ ★2026-09-21 — `ladder` 면 머리글도 「래더」다★ (3부와 같은 말).
            그 칸에 적히는 값이 ★래더 점수★ 이므로 「실력 점수」 라 적으면 거짓말이 된다 */}
        {columns.rating ? (
          <div className={COL_PRATING}>
            {byWeapon
              ? '래더증감'
              : SCORE_COLUMN === 'ladder'
                ? '래더'
                : scoreLadder
                  ? '점수'
                  : scoreTable
                    ? '실력 점수'
                    : '래더'}
          </div>
        ) : null}
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={visibleCount(columns, true) + (clanColumn ? 1 : 0)}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="아직 기록된 플레이어가 없습니다."
      >
        {rows?.map((row) => {
          /* 개인 알 — 본인이 인증해 깬 선수만 기록이 열린다 (사양 3장) */
          const egg: EggState = brokenPlayerIds.includes(row.player.id) ? 'broken' : 'sealed'
          const plate = plateOf(row)
          return (
          <div key={row.player.id} className={ROW} style={plate ? { position: 'relative' } : undefined}>
            {/* ★인식표★ — 줄 뒤에 깐다. 글자 위로 올라오지 않는다 (2026-09-11 사장님) */}
            {plate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${plate}`} /> : null}
            {columns.rank ? (
              <div
                className={rankTone ? rankToneClass(row.rank) : rankClass(row.rank)}
                /* ★모집단을 알면 «비율» 로 칠한다★ (2026-09-16 사장님) */
                style={
                  rankTotal !== null
                    ? { color: nameTint(rankColorByRatio(row.rank, rankTotal)) }
                    : rankTone
                      ? { color: nameTint(rankColor(row.rank)) }
                      : undefined
                }
              >
                {row.rank}
              </div>
            ) : null}
            {clanLine ? (
              /* 닉네임 + 그 아래 클랜명 줄 (#10-2). 링크가 둘이라 한 `<Link prefetch={false}>` 로 감싸지 못한다 —
                 마크·닉네임은 선수 기록실로, 클랜명 줄은 클랜 기록실로 간다 */
              <div className={COL_NAME}>
                <Link prefetch={false}
                  className="flex shrink-0 items-center"
                  href={leaguePlayerPath(leagueSlug, row.player.id)}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <Egg state={egg} size="xs" label={row.player.name} className={MARK}>
                    <span className="sac-rank-mark"><MarkCircle clan={row.clan} size={28} title={row.clan?.name ?? ''} /></span>
                  </Egg>
                </Link>
                {/*
                  * ★이름 칸을 PC 에서 고정폭으로★ (2026-09-17 사장님: «줄도 안맞아»).
                  *   배지가 이름 바로 뒤에 붙는데 이름 길이가 제각각이라 배지 시작점이 흔들렸다.
                  *   ⚠ `mx-auto` 로 가운데를 맞추려 했던 것이 원인이다 — 남는 자리를 반씩 나누니
                  *     이름이 길면 배지가 오른쪽으로 밀렸다. 사장님이 두 번 짚으신 그 함정이다.
                  *   이름 칸을 고정하고 배지는 그 뒤에서 ★왼쪽부터★ 채운다. 그래야
                  *   첫째끼리 · 둘째끼리 세로로 맞는다. 폰은 자리가 좁아 그대로 둔다.
                  */}
                {/*
                  * ⚠ ★2026-09-22 밤 — PC 에서는 ★한 줄★ 로 둔다★ (서플라이 줄 높이 49px)
                  *   닉네임 밑에 소속 클러명을 두 줄로 쌓으면 줄이 ★65px★ 으로 부풀어
                  *   서플라이(49px)와 한 눈에 다르게 보였다. ★값을 없애지 않고 옆으로 옮긴다.★
                  *   폰은 그대로 두 줄이다 — 거기는 자리가 없고, 사장님이 따로 맞추신 판이다.
                  */}
                {/* 2026-09-23 새벽 — 폰도 한 줄 (서플라이 폰 줄 36px). 클랜명은 닉네임 옆에 작게 */}
                <div className="flex min-w-0 items-baseline gap-2 md:w-[210px] md:shrink-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {/* ★누름 영역★ — 글자 높이가 19px 라 손가락으로 집기 어려웠다
                        (2026-09-15 · 무한 QA). 위아래 여백을 주고 같은 만큼 당겨
                        ★보이는 크기는 그대로★ 두면서 누를 면만 넓힌다 */}
                    <Link prefetch={false}
                      className="-my-2 block truncate py-2 hover:text-text-strong"
                      href={leaguePlayerPath(leagueSlug, row.player.id)}
                    >
                      {/* `a { color: inherit }` — 색은 안쪽 span 에 준다 (D-231) */}
                      <span
                        style={
                          rankTotal !== null
                            ? { color: nameTint(rankColorByRatio(row.rank, rankTotal)) }
                            : rankTone
                              ? { color: nameTint(rankColor(row.rank)) }
                              : undefined
                        }
                      >
                        {row.player.name}
                      </span>
                    </Link>
                    {/* ★스나이퍼만★ 닉네임 옆에 스코프 (2026-09-11 사장님) */}
                    {row.score_weapon === 1 ? <SniperMark size={12} /> : null}
                  </div>
                  {row.clan ? (
                    <Link prefetch={false}
                      /* ⚠ 2026-09-16 — 10.8 → 11.7px (사장님: 랭킹 글씨를 키움). 옛 값 `text-[0.72rem]` */
                      /* 2026-09-23 밤 사장님 「클랜명은 모바일에서는 굳이 쓰지 마」 — 마크가 소속을 말한다. PC 는 그대로 */
                      className="-my-1.5 block shrink truncate py-1.5 text-[0.78rem] leading-none text-meta hover:text-text-strong max-md:hidden"
                      href={leagueClanPath(leagueSlug, row.clan.slug)}
                      title={row.clan.name}
                    >
                      {row.clan.name}
                    </Link>
                  ) : (
                    <span className="block shrink truncate text-[0.78rem] leading-none text-faint max-md:hidden">
                      무소속
                    </span>
                  )}
                </div>
                {/*
                  * ★특성 앨블럼★ (2026-09-17 사장님:
                  *   «상위 10프로 안에 드는 특성들은 앨블럼을 줘
                  *    피파 그 파워헤더 같은 특성들처럼 육각형 모양 앨블럼 특징에 맞게 넣어줘»).
                  *
                  *   닉네임과 수치 사이가 비어 보였던 그 자리다 —
                  *   ★빈 자리를 없애는 것이 아니라 채우는 것이 답이다.★
                  *
                  *   서버가 이미 갈라 보낸다 (`traitTierOf`) — 화면은 그리기만 한다.
                  *   보통 0~2개라 줄이 안 부푸다. 폰에서 자리가 모자라면 줄바꿈하지 않고
                  *   ★숨는다★ — 줄 높이가 틀어지면 표 리듬이 깨진다.
                  */}
                {/*
                  * ★특성 앨블럼★ (2026-09-17 사장님).
                  *
                  * ⚠ ★줄이 안 맞는다★ — 사장님이 바로 잡으셨다.
                  *   첫 판은 `mx-auto` 로 가운데 정렬만 했다. 그러면 앨블럼이
                  *   둘인 줄과 하나인 줄의 ★시작점이 달라★ 세로로 듬넣날럭했다.
                  *   칸 폭을 ★고정★ 하고 그 안에서 ★왼쪽부터★ 채운다.
                  *   ⚠ 가운데 정렬(`justify-center`)은 안 된다 — 둘인 줄과 하나인 줄의
                  *     ★첫 앨블럼 x 가 여전히 달라진다.★ 사장님이 두 번 짚으셨다.
                  *     왼쪽 기준이어야 첫째끼리 · 둘째끼리 세로로 맞는다.
                  *
                  *   이름은 PC 에만 적는다 — «세이브 머신» 이 여섯 자라 폰 390px 에서는
                  *   세 개를 놓을 자리가 없다. 폰은 그림만, 뜻은 누르면 뜨는 이름이 말한다.
                  */}
                {(row.trait_emblems ?? []).length > 0 ? (
                  /* ⚠ ★폰 104 → 112px★ (2026-09-18) — 한 칸을 32 → 36 으로 넓혀
                     ★배지 밑 이름★ 이 두 줄로 들어가게 했다 (사장님: 「배찌밑에 이름 달아줘」) */
                  /*
                   * ⚠ ★2026-09-21 밤 — 폰에서는 배지를 통째로 감춘다★ (사장님: 「저 뱃지들
   *   ★모바일에서는 전부 다 숨겨★ 닉네임이 안보이잖아」)
   *
   *   낮에 폭을 116 → 76px 로 줄였지만 ★그래도 닉네임이 잘렸다.★ 390px 한 줄에
   *   클랜마크 · 닉네임 · 승률 · 킬뎃 · 래더까지 들어가야 해서 ★배지가 설 자리가 없다.★
   *   ★PC 에서는 그대로 나온다★ — 자리가 넉넉하다.
   *
   * ⚠ 아래는 그 낮의 기록이다
   *   ★2026-09-21 낮 — 폰 폭을 116 → 76px 로 줄였다★ (사장님: 「가려지네 닉네임」)
                   *   390px 폰에서 ★배지 칸이 116px 를 고정으로 먹어★ 이름 칸(`min-w-0`)이
                   *   0 까지 눌렸다 — ★배지가 있는 줄만 닉네임이 통째로 사라졌다.★
                   *   배지 밑 이름은 PC 에만 적고(원래 주석의 의도였다), 폰은 그림만 둔다.
                   */
                  <span className="flex shrink-0 items-start justify-start gap-1 max-md:hidden md:ml-3 md:w-[200px] md:gap-2">
                    {/*
                      * ⚠ ★2026-09-17 — 손으로 그리던 SVG 배지를 사장님 그림으로 바꿨다★.
                      *   옛 판(`TraitEmblem`)은 지우지 않았다 — 파일이 그대로 있고 이 줄만
                      *   `AxisBadge` 로 바뀌었다 (`CLAUDE.md` 1-4).
                      *   그리고 ★누르면 배지 페이지로 간다★ (사장님: «뱃지 클릭하면 (…)
                      *   누구누구가 이 뱃지 가지고있는지»).
                      */}
                    {(row.trait_emblems ?? []).slice(0, 3).map((e) => {
                      const axis = e.axis as Parameters<typeof AxisBadge>[0]['axis']
                      const name = badgeOfAxis(axis, e.weapon)?.label ?? ''
                      return (
                        <span
                          key={`${e.axis}-${e.weapon}`}
                          className="flex flex-col items-center gap-[3px] max-md:w-[34px] md:w-[58px]"
                        >
                          {/* ★2026-09-17 사장님 — «크기를 좀 키워줘 잘 안보여»★ 22 → 30 (PC 40) */}
                          <AxisBadge
                            axis={axis}
                            weapon={e.weapon}
                            tier={e.tier}
                            size={30}
                            leagueSlug={leagueSlug}
                            className="md:[&_img]:!h-[40px] md:[&_img]:!w-[40px]"
                          />
                          {/*
                            * ★배지 밑에 이름★ (2026-09-18 사장님: 「배찌밑에 이름 달아줘」).
                            *
                            * ⚠ 폰에서는 ★잘라서는 안 된다★ — 「스나싸움마스터」 일곱 자가
                            *   36px 한 줄에 안 들어간다. `truncate` 를 빼고 ★두 줄로 접는다★.
                            *   `break-keep` 이라야 한글이 낱자로 안 쪼개진다.
                            * ⚠ 줄 높이를 1.15 로 눌러 두 줄이 되어도 줄 리듬이 덜 흔들린다.
                            *   PC 는 한 줄로 충분해 그대로 잘라 쓴다.
                            */}
                          {/* ⚠ ★폰에서는 이름을 숨긴다★ (2026-09-21) — 「스나싸움마스터」 일곱 자가
                              자리를 먹어 ★닉네임을 밀어냈다.★ 배지 그림만으로도 무엇인지 보이고,
                              눌러 들어가면 이름이 나온다. PC 는 자리가 넉넉해 그대로 적는다 */}
                          <span className="hidden w-full break-keep text-center text-faint md:block md:truncate md:text-[9.5px] md:leading-none">
                            {name}
                          </span>
                        </span>
                      )
                    })}
                  </span>
                ) : (
                  /* ★앨블럼이 없어도 자리를 비워 둔다★ — 그래야 아래윗줄 수치가 같은 자리에 선다 */
                  <span aria-hidden className="shrink-0 max-md:w-0 md:ml-3 md:w-[200px]" />
                )}
              </div>
            ) : (
            <div className={COL_NAME}>
              <Link prefetch={false}
                className="flex min-w-0 items-center hover:text-text-strong"
                href={leaguePlayerPath(leagueSlug, row.player.id)}
              >
                {/* 무소속이어도 **자리를 비우지 않는다** — fallback 마크를 그린다 (D-146).
                    `clan ? ... : null` 로 감싸면 소속 없는 선수 옆이 통째로 빈다.
                    그 위를 알이 덮는다 — 닉네임은 그대로 보인다 (사양 5-2). */}
                <Egg state={egg} size="xs" label={row.player.name} className={MARK}>
                  <span className="sac-rank-mark"><MarkCircle clan={row.clan} size={28} title={row.clan?.name ?? ''} /></span>
                </Egg>
                <span className="truncate">{row.player.name}</span>
              </Link>
            </div>
            )}
            {/* 소속 클랜명 — 사장님 지시 #10. 색은 안쪽 `span` 에 준다 (`a { color: inherit }`) */}
            {clanColumn ? (
              <div className={COL_CLAN}>
                {row.clan ? (
                  <Link prefetch={false}
                    className="block truncate hover:text-text-strong"
                    href={leagueClanPath(leagueSlug, row.clan.slug)}
                    title={row.clan.name}
                  >
                    <span className="text-sm text-meta">{row.clan.name}</span>
                  </Link>
                ) : (
                  <span className="block truncate text-sm text-faint">무소속</span>
                )}
              </div>
            ) : null}
            {/*
              ★승리 · 패배 칸★ (2026-09-22 밤) — 서플라이와 같은 자리다.
                값은 이미 있던 것(`row.win` · `row.lose`)이다 — ★새로 세지 않았다.★
                아래 승률 칸의 접힌 판(`sub`)과 ★같은 숫자★ 이고, PC 에서는 그쪽이 숨는다.
                폰에서는 이 칸이 사라지고 접힌 판이 선다 — 값이 없어지는 순간은 없다.
            */}
            {columns.winRate ? (
              <div className={`${COL_PWL} ${NUM}`}>
                {row.win + row.lose === 0 ? <span className="text-faint">-</span> : <>{formatCount(row.win)}승</>}
              </div>
            ) : null}
            {columns.winRate ? (
              <div className={`${COL_PWL} ${NUM}`}>
                {row.win + row.lose === 0 ? <span className="text-faint">-</span> : <>{formatCount(row.lose)}패</>}
              </div>
            ) : null}
            {!columns.winRate ? null : egg === 'sealed' ? (
              <div className={`${COL_PSTAT} ${winRateHidden}`}>
                <EggVeil state={egg}>{null}</EggVeil>
              </div>
            ) : row.win + row.lose === 0 ? (
              /* 한 판도 안 뛰었다 — 클랜 표와 같은 규칙이다 (O-033) */
              <NoRecordStat className={`${COL_PSTAT} ${winRateHidden}`} />
            ) : (
            <Stat
              /* 2026-09-23 밤 사장님 — 폰은 한 칸에 「n승 n패 n%」. 폭 50 → 104 (킬뎃은 %만 · 래더 그대로) */
              className={`${COL_PSTAT} ${winRateHidden} max-md:!w-[104px]`}
              value={formatRate(row.win_rate)}
              tone={rateClass(row.win_rate)}
              unit="%"
              lead={<>{formatCount(row.win)}승 {formatCount(row.lose)}패</>}
              sub={
                <span className={SUB_PHONE_ONLY}>
                  {formatCount(row.win)}승 {formatCount(row.lose)}패
                </span>
              }
            />
            )}
            {/* 무소속리그는 누적 킬뎃을 공개하지 않는다. 값이 없으면 칸을 비운다 (D-107).
                IPL 은 원래 킬뎃이 없어 알과 무관하다 (사양 2장) */}
            {!columns.kd ? null : row.kd_rate === null ? (
              <div className={`${COL_PSTAT} ${kdHidden} text-faint`}>-</div>
            ) : egg === 'sealed' ? (
              <div className={`${COL_PSTAT} ${kdHidden}`}>
                <EggVeil state={egg}>{null}</EggVeil>
              </div>
            ) : (
              /* 평균킬은 킬뎃 아래로 접었다 */
              <Stat
                className={`${COL_PSTAT} ${kdHidden}`}
                value={formatRate(row.kd_rate)}
                tone={rateClass(row.kd_rate)}
                unit="%"
                sub={<span className={SUB_PHONE_ONLY}>{formatAverage(row.kill_per_match)}킬</span>}
              />
            )}
            {/*
              ★평균킬 칸★ (2026-09-22 밤) — 서플라이의 여덟째 칸이다 (「7.7킬」).
                이 값도 바로 위 칸 아래에 접혀 있던 것이다 — ★자리만 바뀜다.★
            */}
            {columns.kd ? (
              <div className={`${COL_PWL} ${NUM}`}>
                {row.kd_rate === null ? <span className="text-faint">-</span> : <>{formatAverage(row.kill_per_match)}킬</>}
              </div>
            ) : null}
            {columns.rating ? (
              /* ★층수마다 색이 다르다★ (2026-09-11 사장님: 45층~ 빨강 · 40 노랑 · 35 하늘 · 30 초록 · 그 아래 하양).
                 옛 모양은 한 색(청록 `text-accent`)이었다 — 자리·크기는 그대로다 */
              <div
                className={`${COL_PRATING} ${NUM}`}
                style={byWeapon || scoreLadder ? undefined : { color: floorColor(row.score ?? row.rating) }}
              >
                {byWeapon
                  ? formatRatingDelta(row.rating_delta ?? 0)
                  : SCORE_COLUMN === 'ladder'
                    ? /* ★래더 점수★ — 3부와 같은 잣대·같은 표기 (2026-09-21).
                         ⚠ 「34층」 이 아니라 ★「3,462점」★ 이다 — 층은 등급처럼 읽혀
                         사장님이 9/15 에 「티어의 흔적」 이라 부르신 그 말이다 */
                      formatRatingPoint(row.rating)
                  : scoreLadder
                    ? (row.score_rating === null || row.score_rating === undefined
                        ? <span className="text-[11px] font-normal text-faint">측정 중</span>
                        : <>
                            {row.score_rating.toFixed(1)}
                            {/* ★상위권 보정★ 을 숨기지 않는다 — 얼마를 더 받았는지 적는다 */}
                            {(row.score_bonus ?? 0) > 0 ? (
                              <span className="ml-1 text-[10px] font-bold text-[#d9b44a]">
                                +{row.score_bonus}
                              </span>
                            ) : null}
                          </>)
                    : scoreTable && (row.score === null || row.score === undefined)
                      ? <span className="text-[11px] font-normal text-faint">측정 중</span>
                      : formatRating(row.score ?? row.rating)}
                {/* 2026-09-11 사장님: 점수 뒤 포지션 글자는 뺀다 — 스나이퍼만 닉네임 옆에 스코프를 단다 */}
                {/* ★미참여 감점★ — 오래 안 뛰어 깎였으면 적는다 (2026-09-11 사장님) */}
                {(row.activity_penalty ?? 0) > 0 ? (
                  <div className="mt-0.5 text-[10px] font-bold leading-none text-[#ff8a90]">
                    미참여 −{Math.round(row.activity_penalty as number)}점
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          )
        })}
      </TableBody>
      <EggVeilLegend />
    </>
  )
}

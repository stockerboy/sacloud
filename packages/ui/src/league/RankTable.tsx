'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import type { ClanRankRow, PlayerRankRow, RankColumns, RankWeapon } from '@sacloud/contract'
import { showsTier } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
/* 티어 구분선 라벨 — 공식리그면 `1부리그`, 무소속리그면 `1티어` (D-165) */
import { divisionLabel } from './divisionLabel'
/* 「알」 (`docs/EGG_SYSTEM_SPEC.md`) — 랭킹도 알로 덮는다 */
import { Egg } from '../egg/Egg'
import { useEggKnowledge } from '../egg/EggContext'
import { EggVeil, EggVeilLegend } from '../egg/EggVeil'
import type { EggState } from '../egg/eggState'
/* 승률·킬뎃 두 칸만 서플라이 등급색을 쓴다 (2026-08-30 사용자 지시) */
import { rateClass } from '../common/rate'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import {
  formatCount,
  formatAverage,
  formatRate,
  formatRating,
  formatRatingDelta,
} from '../common/format'
import { leagueClanPath, leaguePlayerPath } from '../common/paths'
import {
  COL_CLAN,
  COL_HIDDEN,
  COL_NAME,
  COL_RANK,
  COL_RATING,
  COL_STAT,
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
}: {
  value: string
  unit?: string
  sub?: React.ReactNode
  className?: string
  tone?: string
}) {
  return (
    <div className={className}>
      <span className={`${NUM} ${tone === '' ? 'text-text-strong' : tone}`}>{value}</span>
      {unit ? <Unit>{unit}</Unit> : null}
      {sub ? <span className={SUB}>{sub}</span> : null}
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
    <div className="mb-6 flex items-baseline max-md:flex-col max-md:items-start">
      <h1 className="font-display text-3xl tracking-wide text-text-strong max-md:whitespace-nowrap max-md:text-2xl">
        {title}
      </h1>
      <div className="ml-4 text-sm text-faint max-md:ml-0 max-md:mt-1.5">{notice}</div>
    </div>
  )
}

/** 표 테두리 박스 */
export function RankBox({ children }: { children: React.ReactNode }) {
  /* 좁은 화면에서는 표가 화면 끝까지 찬다 (`.mobile-bleed` — 컨테이너 좌우 여백을 음수 마진으로 되뺀다) */
  return (
    <div className="mobile-bleed mt-6 rounded-[var(--radius)] border border-line max-md:mt-4">
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
 * 칸을 하나도 감추지 않는 기본값 — **넘기지 않으면 지금까지의 표 그대로다.**
 *
 * 리그별로 무엇을 감출지는 화면이 아니라 `@sacloud/contract` 의 `leagueScreen()` 이 정한다
 * (2026-09-01). D-204 의 «리그별 분기를 흩뿌리지 마라» 를 지키는 방법이다 —
 * 분기가 없는 게 아니라 **한 곳에 모여 있다.**
 */
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
export type ClanRankTableRow = Pick<
  ClanRankRow,
  'rank' | 'league_clan_id' | 'clan' | 'division' | 'win' | 'lose' | 'win_rate' | 'rating'
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
   * 보여 줄 칸 (2026-09-01). 넘기지 않으면 **지금까지의 표 그대로**다.
   *
   * 리그마다 다른 칸을 화면에서 `if (slug === …)` 로 가르지 않는다 —
   * 규칙은 `@sacloud/contract` 의 `leagueScreen()` 한 곳에 있다.
   */
  columns?: RankColumns
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
}: ClanRankTableProps) {
  const { brokenClanSlugs } = useEggKnowledge()
  /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③)는 호출부가 뭐라 하든 선을 긋지 않는다.
     규칙은 `@sacloud/contract` 의 `leagueScreen` 한 곳이다. 행의 `division` 값 자체는 그대로 온다 */
  const divideByDivision = groupByDivision && showsTier(leagueSlug)
  /* 바로 앞 행과 부리그가 다르면 그 위에 선을 긋는다. 첫 행에도 긋는다 —
     맨 위 묶음이 어느 티어인지 이름이 없으면 아래 묶음들만 이름이 붙어 이상해진다 */
  let lastDivision: number | null = null
  return (
    <>
      <div className={HEAD}>
        {columns.rank ? <div className={COL_RANK}>순위</div> : null}
        <div className={COL_NAME}>클랜</div>
        {columns.winRate ? <div className={`${COL_STAT} ${COL_HIDDEN}`}>승률</div> : null}
        {columns.rating ? <div className={COL_RATING}>래더</div> : null}
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={visibleCount(columns, false)}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="아직 기록된 클랜이 없습니다."
      >
        {rows?.map((row) => {
          const egg: EggState = brokenClanSlugs.includes(row.clan.slug) ? 'broken' : 'sealed'
          const divider = divideByDivision && row.division !== lastDivision
          lastDivision = row.division
          return (
          <Fragment key={row.clan.id}>
          {divider ? (
            <DivisionDivider division={row.division} leagueCategory={leagueCategory} />
          ) : null}
          <div className={ROW}>
            {columns.rank ? <div className={rankClass(row.rank)}>{row.rank}</div> : null}
            <div className={COL_NAME}>
              <Link
                className="flex min-w-0 items-center hover:text-text-strong"
                href={`/league/${leagueSlug}/clan/${row.clan.slug}`}
              >
                {/* 알이 마크를 덮는다. 깨졌으면 마크가 그대로 나오고 은은하게 빛난다 */}
                <Egg state={egg} size="xs" label={row.clan.name} className={MARK}>
                  <ClanMark mark={row.clan.mark} alt={row.clan.name} />
                </Egg>
                <span className="truncate">{row.clan.name}</span>
                {/* 티어 라벨 — IPL 만 (지시 #23). 순서는 래더 순이라 경계선 대신 행마다 적는다 */}
                {showTierLabel ? (
                  <span className="ml-2 shrink-0 text-xs text-faint">
                    {divisionLabel(row.division, leagueCategory)}
                  </span>
                ) : null}
              </Link>
            </div>
            {/* 승/패는 없앤 것이 아니라 승률 아래로 접었다. 알이 있으면 둘 다 가린다 */}
            {!columns.winRate ? null : egg === 'sealed' ? (
              <div className={`${COL_STAT} ${COL_HIDDEN}`}>
                <EggVeil state={egg}>{null}</EggVeil>
              </div>
            ) : row.win + row.lose === 0 ? (
              /* 한 판도 안 뛰었다 — `0%  0승 0패` 로 그리지 않는다 (O-033 · 위 NoRecordStat) */
              <NoRecordStat className={`${COL_STAT} ${COL_HIDDEN}`} />
            ) : (
            <Stat
              className={`${COL_STAT} ${COL_HIDDEN}`}
              value={formatRate(row.win_rate)}
              tone={rateClass(row.win_rate)}
              unit="%"
              sub={
                <>
                  {formatCount(row.win)}승 {formatCount(row.lose)}패
                </>
              }
            />
            )}
            {columns.rating ? (
              <div className={`${COL_RATING} ${NUM} text-text-strong`}>
                {formatRating(row.rating)}
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
}: PlayerRankTableProps) {
  const clanColumn = clanName === 'column'
  const clanLine = clanName === 'line'
  const byWeapon = weapon !== 'all'
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
  const keptStat = columns.rating ? null : columns.winRate ? 'winRate' : columns.kd ? 'kd' : null
  const winRateHidden = keptStat === 'winRate' ? '' : COL_HIDDEN
  const kdHidden = keptStat === 'kd' ? '' : COL_HIDDEN

  return (
    <>
      <div className={HEAD}>
        {columns.rank ? <div className={COL_RANK}>순위</div> : null}
        <div className={COL_NAME}>닉네임</div>
        {clanColumn ? <div className={COL_CLAN}>클랜</div> : null}
        {columns.winRate ? <div className={`${COL_STAT} ${winRateHidden}`}>승률</div> : null}
        {columns.kd ? <div className={`${COL_STAT} ${kdHidden}`}>킬뎃</div> : null}
        {/* 무기 탭에서는 통합 래더가 아니라 **그 무기로 얻은 래더 증감의 합**이다 (D-169).
            머리글을 그대로 `래더` 로 두면 같은 자리에 다른 뜻의 숫자가 들어가 거짓말이 된다. */}
        {columns.rating ? (
          <div className={COL_RATING}>{byWeapon ? '래더증감' : '래더'}</div>
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
          return (
          <div key={row.player.id} className={ROW}>
            {columns.rank ? <div className={rankClass(row.rank)}>{row.rank}</div> : null}
            {clanLine ? (
              /* 닉네임 + 그 아래 클랜명 줄 (#10-2). 링크가 둘이라 한 `<Link>` 로 감싸지 못한다 —
                 마크·닉네임은 선수 기록실로, 클랜명 줄은 클랜 기록실로 간다 */
              <div className={COL_NAME}>
                <Link
                  className="flex shrink-0 items-center"
                  href={leaguePlayerPath(leagueSlug, row.player.id)}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <Egg state={egg} size="xs" label={row.player.name} className={MARK}>
                    <ClanMark clan={row.clan} alt={row.clan?.name ?? ''} />
                  </Egg>
                </Link>
                <div className="min-w-0">
                  <Link
                    className="block truncate hover:text-text-strong"
                    href={leaguePlayerPath(leagueSlug, row.player.id)}
                  >
                    {row.player.name}
                  </Link>
                  {row.clan ? (
                    <Link
                      className="mt-0.5 block truncate text-[0.72rem] leading-none text-meta hover:text-text-strong"
                      href={leagueClanPath(leagueSlug, row.clan.slug)}
                      title={row.clan.name}
                    >
                      {row.clan.name}
                    </Link>
                  ) : (
                    <span className="mt-0.5 block truncate text-[0.72rem] leading-none text-faint">
                      무소속
                    </span>
                  )}
                </div>
              </div>
            ) : (
            <div className={COL_NAME}>
              <Link
                className="flex min-w-0 items-center hover:text-text-strong"
                href={leaguePlayerPath(leagueSlug, row.player.id)}
              >
                {/* 무소속이어도 **자리를 비우지 않는다** — fallback 마크를 그린다 (D-146).
                    `clan ? ... : null` 로 감싸면 소속 없는 선수 옆이 통째로 빈다.
                    그 위를 알이 덮는다 — 닉네임은 그대로 보인다 (사양 5-2). */}
                <Egg state={egg} size="xs" label={row.player.name} className={MARK}>
                  <ClanMark clan={row.clan} alt={row.clan?.name ?? ''} />
                </Egg>
                <span className="truncate">{row.player.name}</span>
              </Link>
            </div>
            )}
            {/* 소속 클랜명 — 사장님 지시 #10. 색은 안쪽 `span` 에 준다 (`a { color: inherit }`) */}
            {clanColumn ? (
              <div className={COL_CLAN}>
                {row.clan ? (
                  <Link
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
            {!columns.winRate ? null : egg === 'sealed' ? (
              <div className={`${COL_STAT} ${winRateHidden}`}>
                <EggVeil state={egg}>{null}</EggVeil>
              </div>
            ) : row.win + row.lose === 0 ? (
              /* 한 판도 안 뛰었다 — 클랜 표와 같은 규칙이다 (O-033) */
              <NoRecordStat className={`${COL_STAT} ${winRateHidden}`} />
            ) : (
            <Stat
              className={`${COL_STAT} ${winRateHidden}`}
              value={formatRate(row.win_rate)}
              tone={rateClass(row.win_rate)}
              unit="%"
              sub={
                <>
                  {formatCount(row.win)}승 {formatCount(row.lose)}패
                </>
              }
            />
            )}
            {/* 무소속리그는 누적 킬뎃을 공개하지 않는다. 값이 없으면 칸을 비운다 (D-107).
                IPL 은 원래 킬뎃이 없어 알과 무관하다 (사양 2장) */}
            {!columns.kd ? null : row.kd_rate === null ? (
              <div className={`${COL_STAT} ${kdHidden} text-faint`}>-</div>
            ) : egg === 'sealed' ? (
              <div className={`${COL_STAT} ${kdHidden}`}>
                <EggVeil state={egg}>{null}</EggVeil>
              </div>
            ) : (
              /* 평균킬은 킬뎃 아래로 접었다 */
              <Stat
                className={`${COL_STAT} ${kdHidden}`}
                value={formatRate(row.kd_rate)}
                tone={rateClass(row.kd_rate)}
                unit="%"
                sub={<>{formatAverage(row.kill_per_match)}킬</>}
              />
            )}
            {columns.rating ? (
              <div className={`${COL_RATING} ${NUM} text-text-strong`}>
                {byWeapon ? formatRatingDelta(row.rating_delta ?? 0) : formatRating(row.rating)}
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

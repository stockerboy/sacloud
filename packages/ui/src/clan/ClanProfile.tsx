'use client'

import Link from 'next/link'
import type { ClanLeagueEntry, ClanPlayer } from '@sacloud/contract'
import { isLeagueListed, isOfficialLeague, showsDivision } from '@sacloud/contract'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
/* 「알」 (`docs/EGG_SYSTEM_SPEC.md`) — 클랜마크를 알이 덮고, 승률·승패를 가린다 */
import { Egg } from '../egg/Egg'
import { useClanEgg } from '../egg/EggContext'
import { EggVeil } from '../egg/EggVeil'
import { formatCount, formatDate, formatRate } from '../common/format'
import { divisionLabel } from '../league/divisionLabel'
import { leagueClanPath } from '../common/paths'
import {
  IdentityBand,
  MetaDot,
  OfficialTag,
  PANEL,
  ProfileEmpty,
  ProfileSkeleton,
  SectionTitle,
  Stat,
  WinBar,
} from '../player/profileKit'

/**
 * 클랜 프로필 `/clan/{clanSlug}` — `적진` 팔레트.
 *
 * 읽는 순서
 * ```
 * 1) 어떤 클랜인가   신원 띠 — 마크 · 클랜명 · 클랜마스터 · 설립일 · 인원
 * 2) 무엇을 하는가   탭 (리그정보 / 클랜원)
 * 3-a) 리그정보      리그마다 래더 하나를 크게, 부리그·전적·승률·순위는 눌러서
 * 3-b) 클랜원        **포지션별로 묶은 명단.** 포지션이 없으면 `포지션 미정` 묶음에 둔다
 * ```
 *
 * 클랜 지표(육각형 · 라운드 지표 · 포지션 판정)는 **리그 클랜 기록실**
 * (`/league/{slug}/clan/{slug}`) 응답에만 있다. 여기서 지어내지 않는다.
 */

/* ------------------------------------------------------------------ 신원 --- */

export function ClanIdentity({
  name,
  slug,
  mark,
  master,
  establishedAt,
  memberCount,
}: {
  name: string
  /**
   * 클랜 slug — **「알」이 깨졌는지 물어보는 데 쓴다** (`docs/EGG_SYSTEM_SPEC.md`).
   * 넘기지 않으면 안 깨진 것으로 본다.
   */
  slug?: string | null
  mark: ClanMarkSource
  master: { id: string; name: string } | null
  establishedAt: string | null
  memberCount?: number | null
}) {
  /* 깨진 클랜은 마크가 **계속** 은은하게 빛난다 (사양 3장) */
  const egg = useClanEgg(slug)

  return (
    <IdentityBand
      mark={
        <Egg state={egg} size="sm" label={name}>
          <ClanMark mark={mark} size="max" alt={name} />
        </Egg>
      }
      name={name}
      meta={
        <>
          <span className="flex items-center gap-2">
            <span className="text-faint">클랜마스터</span>
            {master ? (
              /* 색은 안쪽 `<span>` 에 준다 — `a { color: inherit }` 가 레이어 밖이다 */
              <Link href={`/player/${master.id}`} className="group">
                <span className="text-text transition-colors group-hover:text-accent">
                  {master.name}
                </span>
              </Link>
            ) : (
              <span className="text-faint">알수없음</span>
            )}
          </span>
          <MetaDot />
          <span className="flex items-center gap-2">
            <span className="text-faint">설립</span>
            {establishedAt ? (
              <span className="font-num text-text tabular-nums">
                {formatDate(establishedAt)}
              </span>
            ) : (
              <span className="text-faint">알수없음</span>
            )}
          </span>
          {memberCount === null || memberCount === undefined ? null : (
            <>
              <MetaDot />
              <span className="flex items-center gap-2">
                <span className="text-faint">클랜원</span>
                <span className="font-num text-text tabular-nums">
                  {formatCount(memberCount)}명
                </span>
              </span>
            </>
          )}
        </>
      }
    />
  )
}

/**
 * 클랜 프로필 탭.
 *
 * 리그 기록실 탭과 **같은 것**이다 — 진홍 밑줄 2px 하나. 이름만 남겨 둔다.
 */
export { ProfileNav as ClanProfileNav } from '../player/profileKit'

/* --------------------------------------------------------------- 리그 목록 --- */

function ClanLeagueRow({ entry, clanSlug }: { entry: ClanLeagueEntry; clanSlug: string }) {
  const games = entry.win + entry.lose
  /* 한 판도 안 치른 클랜에게 `승률 0%` 를 적지 않는다 — 표본이 없다는 뜻이지 전패가 아니다 */
  const rated = games > 0
  /* 클랜 알 — 승률 · 승패를 가린다. **전적(판수) · 래더 · 순위는 가리지 않는다** (사양 2장) */
  const egg = useClanEgg(clanSlug)
  const sealed = egg === 'sealed'
  return (
    <Link
      href={leagueClanPath(entry.league.slug, clanSlug)}
      className={`${PANEL} block px-5 py-4 transition-colors hover:border-accent`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] text-text-strong">{entry.league.name}</span>
            {/* 공식 표기는 계약의 표가 정한다 (#17). 옛 값: `entry.league.official` */}
            {isOfficialLeague(entry.league.slug) ? <OfficialTag /> : null}
          </div>
          <div className="mt-1.5 text-[12px] text-meta">
            {/* 무소속리그는 `1부리그` 가 아니라 `1티어` 로 적는다 (D-165).
                부리그를 화면에 내지 않는 리그(지시 #9)는 «참여중» 만 적는다 */}
            {showsDivision(entry.league.slug) && entry.league.division_count > 1
              ? `${divisionLabel(entry.division, entry.league.category)}로 참여중`
              : /* 단일리그(부리그 1개)도 «참여중» 만 — 헤더의 `divisionCount <= 1` 규칙과 같다 (#17-2) */
                '참여중'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] leading-none text-meta">래더</div>
          {/* 배치고사 폐지 (2026-09-01) — `placement` 는 이제 「이 창에 0판」이라는 뜻이다 */}
          {entry.placement ? (
            <div className="mt-1.5 text-[15px] leading-none text-meta">기록 없음</div>
          ) : (
            <div className="mt-1 font-num text-[26px] leading-none tabular-nums text-text-strong">
              {formatCount(entry.rating)}
              <span className="ml-1 text-[12px] text-meta">점</span>
            </div>
          )}
        </div>
      </div>

      {sealed ? null : (
        <div className="mt-4">
          <WinBar win={entry.win} lose={entry.lose} />
        </div>
      )}

      <div className="mt-3.5 grid grid-cols-4 gap-4 max-md:grid-cols-2 max-md:gap-y-3">
        {/* 판수는 가리지 않는다 (사양 2장) */}
        <Stat label="전적" value={`${formatCount(games)}전`} />
        {sealed ? (
          <Stat label="승 · 패" value={<EggVeil state={egg}>{null}</EggVeil>} />
        ) : (
          <Stat
            label="승 · 패"
            value={`${formatCount(entry.win)} · ${formatCount(entry.lose)}`}
          />
        )}
        {sealed ? (
          <Stat label="승률" value={<EggVeil state={egg}>{null}</EggVeil>} />
        ) : rated ? (
          <Stat label="승률" value={`${formatRate(entry.win_rate)}%`} strong />
        ) : (
          <Stat label="승률" value="기록 없음" muted />
        )}
        {entry.rank !== null && entry.rank_count !== null ? (
          <Stat
            label="순위"
            value={`${formatCount(entry.rank_count)}팀중 ${formatCount(entry.rank)}위`}
          />
        ) : (
          <Stat label="순위" value="없음" muted />
        )}
      </div>
    </Link>
  )
}

export function ClanLeagueList({
  clanSlug,
  entries,
  loading,
}: {
  clanSlug: string
  entries?: readonly ClanLeagueEntry[]
  loading?: boolean
}) {
  if (loading) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="참여중인 리그" />
        <div className="mt-4">
          <ProfileSkeleton rows={2} height={148} />
        </div>
      </section>
    )
  }

  /* 닫힌 리그(대룰리그 · 지시 #22)는 목록에서 뺀다. 데이터는 그대로다 — 화면에서만 거른다 */
  const listed = entries?.filter((entry) => isLeagueListed(entry.league.slug))
  if (!listed || listed.length === 0) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="참여중인 리그" />
        <div className="mt-4">
          <ProfileEmpty message="참여중인 리그가 없습니다." />
        </div>
      </section>
    )
  }

  return (
    <section className="mt-[40px]">
      <SectionTitle title="참여중인 리그" note={`${formatCount(listed.length)}개`} />
      <div className="mt-4 flex flex-col gap-3">
        {listed.map((entry) => (
          <ClanLeagueRow key={entry.league.id} entry={entry} clanSlug={clanSlug} />
        ))}
      </div>
      <p className="mt-4 text-[12px] text-faint">
        리그를 누르면 그 리그의 클랜 기록실로 갑니다 — 클랜 육각형 · 라운드 지표는
        리그마다 따로 쌓입니다.
      </p>
    </section>
  )
}

/* --------------------------------------------------------------- 클랜원 --- */

/** 포지션이 비어 있는 클랜원을 담는 묶음 이름. **지어내지 않고 모른다고 적는다** */
const UNASSIGNED = '포지션 미정'

/**
 * 클랜원을 포지션으로 묶는다.
 *
 * `position` 은 자유 입력 메모다(원본 관측: `2층`, `B 사이트`). 값을 해석하거나
 * 정규화하지 않는다 — 적힌 그대로를 묶음 이름으로 쓴다. 앞뒤 공백만 턴다.
 * 비어 있으면 `포지션 미정` 묶음으로 간다.
 *
 * 묶음 순서는 **인원이 많은 순**, 같으면 이름 순이다.
 * `포지션 미정` 은 크기와 상관없이 항상 맨 뒤에 둔다.
 */
export function groupByPosition(
  members: readonly ClanPlayer[],
): { position: string; members: ClanPlayer[] }[] {
  const buckets = new Map<string, ClanPlayer[]>()
  for (const member of members) {
    const key = member.position?.trim() ? member.position.trim() : UNASSIGNED
    const bucket = buckets.get(key)
    if (bucket) bucket.push(member)
    else buckets.set(key, [member])
  }
  return [...buckets.entries()]
    .map(([position, list]) => ({ position, members: list }))
    .sort((a, b) => {
      if (a.position === UNASSIGNED) return 1
      if (b.position === UNASSIGNED) return -1
      if (a.members.length !== b.members.length) return b.members.length - a.members.length
      return a.position.localeCompare(b.position, 'ko-KR')
    })
}

function MemberChip({ member }: { member: ClanPlayer }) {
  return (
    <Link
      href={`/player/${member.id}`}
      className="group flex items-center gap-2 rounded-[2px] border border-line-soft px-3 py-2 text-[14px] transition-colors hover:border-accent"
    >
      {/* 글자색은 `<a>` 가 아니라 안쪽에서 준다 (`a { color: inherit }` 회피) */}
      <span className="min-w-0 truncate text-text transition-colors group-hover:text-accent">
        {member.name}
      </span>
      {member.master ? (
        <span className="shrink-0 text-[11px] text-accent">클랜마스터</span>
      ) : null}
    </Link>
  )
}

/**
 * 포지션별 클랜원 명단.
 *
 * 예전에는 `닉네임 | 포지션` 2열 표였다. 같은 포지션이 여기저기 흩어져 있어서
 * "누가 어디를 보는가" 를 표에서 읽어 내야 했다. 묶어서 보여 주면 한 번에 읽힌다.
 * **데이터는 그대로다** — 묶는 기준도 화면도 `position` 문자열 하나뿐이다.
 */
export function ClanRosterByPosition({
  members,
  loading,
  error,
}: {
  members?: readonly ClanPlayer[]
  loading?: boolean
  error?: boolean
}) {
  if (error) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="클랜원" />
        <div className="mt-4">
          <ProfileEmpty message="클랜원 목록을 불러오지 못했습니다." />
        </div>
      </section>
    )
  }

  if (loading && (!members || members.length === 0)) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="클랜원" />
        <div className="mt-4">
          <ProfileSkeleton rows={2} height={120} />
        </div>
      </section>
    )
  }

  if (!members || members.length === 0) {
    return (
      <section className="mt-[40px]">
        <SectionTitle title="클랜원" />
        <div className="mt-4">
          <ProfileEmpty message="클랜원이 없습니다." />
        </div>
      </section>
    )
  }

  const groups = groupByPosition(members)
  const unassigned = groups.find((group) => group.position === UNASSIGNED)

  return (
    <section className="mt-[40px]">
      <SectionTitle
        title="클랜원"
        note={`${formatCount(members.length)}명`}
        action={
          unassigned ? (
            <span className="text-[12px] text-faint">
              {formatCount(unassigned.members.length)}명 포지션 미정
            </span>
          ) : null
        }
      />
      <div className="mt-4 flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.position} className={`${PANEL} px-5 py-4`}>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-[13px] ${
                  group.position === UNASSIGNED ? 'text-faint' : 'text-text-strong'
                }`}
              >
                {group.position}
              </span>
              <span className="font-num text-[12px] text-meta tabular-nums">
                {formatCount(group.members.length)}명
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 max-md:grid-cols-2">
              {group.members.map((member) => (
                <MemberChip key={member.id} member={member} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

import Link from 'next/link'
import type { ClanRoster as ClanRosterData, ClanRosterGroup, ClanRosterMember } from '@sacloud/contract'
import { CLAN_ROSTER_FIRST_SQUAD_SIZE } from '@sacloud/contract'
import { formatCount } from '../common/format'
import { ratingClass } from '../common/rating'
import { leaguePlayerPath } from '../common/paths'

/**
 * 클랜페이지 **클랜원 목록**.
 *
 * ```
 * 클랜원                                            27명 · 20:25 기준
 * ─────────────────────────────────────────────────────────────────
 *  1  nudi        3,412점  102판        ● 접속중   ○ 미접속
 *  2  차값        3,388점   88판        ○ 접속중   ● 미접속
 *  3  쨔잉나      3,301점   12판        ○ 접속중   ○ 미접속   ← 알수없음
 * ```
 *
 * **원본(3rd.supply)에 없는 블록이다.** 사용자 지시로 만든 신규 기능이고
 * 원본과 동일함이 검증되지 않았다 (`CLAUDE.md` 3장 7번).
 *
 * ── 2026-09-01: **포지션을 걷어내고 목록으로 바꿨다** (사용자 지시)
 *   > "클랜원 포지션 없애고 클랜원 목록 파트만 만들어 오른쪽에 접속중 미접속 표시 만들고
 *   >  접속중이면 초록불 들어오고 미접이면 미접속에 빨간불 반대편은 꺼진불로 표시 항상"
 *
 *   앞 버전(포지션별 1군/2군)은 **지우지 않았다.** `variant="position"` 으로 그대로 살아 있고
 *   계약도 `squads` 를 계속 내려 준다 — 방식을 바꿀 때 앞 버전도 남긴다는 사용자 지시다
 *   (`CLAUDE.md` 10-4 · `TraitHexagon` 의 `variant` 와 같은 방식).
 *
 * ── 나누는 판단은 하나도 여기서 하지 않는다
 *   정렬·1군/2군·포지션 묶음은 전부 계약(`packages/contract/src/clanRoster.ts`)이
 *   정해서 내려 준다. 화면이 다시 나누면 mock↔live 가 갈린다.
 *
 * 카드 모양(1px 선 + 여백)은 바로 아래 `ClanMetrics` 와 같다. `적진` 은 그림자를 쓰지 않는다.
 */

/* -------------------------------------------------------------------------- */
/* 접속 표시                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * **접속중 / 미접속 불** — 둘 다 **항상** 그린다 (사용자 지시).
 *
 * ```
 * online === true   ● 접속중(초록)   ○ 미접속(꺼짐)
 * online === false  ○ 접속중(꺼짐)   ● 미접속(진홍)
 * online === null   ○ 접속중(꺼짐)   ○ 미접속(꺼짐)   ← 알수없음
 * ```
 *
 * ── `null` 을 미접속으로 접지 않는다
 *   출처(병영수첩 클랜원 명단)와 우리 선수가 이어지지 않은 사람은 **모르는 것**이지
 *   미접속인 것이 아니다. 접으면 없는 사실을 만든다 (`CLAUDE.md` 3장 7번).
 *   그래서 양쪽 다 꺼진 줄이 나올 수 있고, **그게 맞는 화면이다.**
 *
 * ── 글자도 같이 죽인다 — 다만 **읽히는 선까지만**
 *   불만 끄고 글자를 그대로 두면 세 상태가 한눈에 안 갈린다.
 *   켜진 쪽은 본문색, 꺼진 쪽은 한 단 죽인다.
 *
 *   ⚠ 처음엔 `--color-faint` 를 썼는데 카드 위에서 **대비 2.82:1** 이다 (D팀 실측).
 *     장식이면 몰라도 **`접속중`/`미접속` 은 뜻을 가진 라벨**이라 읽혀야 한다.
 *     `--color-meta`(5.35:1)로 올렸다 — 켜진 쪽과는 여전히 갈리고, 읽히기는 한다.
 *     **꺼진 불(`--color-lamp-off`)은 그대로 둔다.** 그건 장식이고, 안 묻히는 것이
 *     실측으로 확인됐다.
 */
function Lamp({ on, tone }: { on: boolean; tone: 'online' | 'offline' }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-1.5 rounded-full ${
        on ? (tone === 'online' ? 'bg-online' : 'bg-offline') : 'bg-lamp-off'
      }`}
    />
  )
}

function OnlineCell({ online }: { online: boolean | null }) {
  const label =
    online === null ? '접속 여부를 모릅니다' : online ? '접속중' : '미접속'
  return (
    <span className="flex shrink-0 items-center gap-3 text-xs" title={label}>
      <span className={`flex items-center gap-1 ${online === true ? 'text-text' : 'text-meta'}`}>
        <Lamp on={online === true} tone="online" />
        접속중
      </span>
      <span className={`flex items-center gap-1 ${online === false ? 'text-text' : 'text-meta'}`}>
        <Lamp on={online === false} tone="offline" />
        미접속
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* 목록 (기본)                                                                  */
/* -------------------------------------------------------------------------- */

/** 관측 시각을 `20:25` 로 줄여 쓴다. 날짜가 오늘이 아니면 `08-31 20:25` */
function shortTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return sameDay ? clock : `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock}`
}

function Row({
  member,
  rank,
  leagueSlug,
}: {
  member: ClanRosterMember
  rank: number
  leagueSlug: string
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-b-line-soft py-1.5 last:border-b-0">
      <span className="num w-6 shrink-0 text-right text-xs text-faint">{rank}</span>

      <Link
        href={leaguePlayerPath(leagueSlug, member.player.id)}
        className="min-w-0 flex-grow truncate text-sm"
      >
        {/* `a { color: inherit }` 때문에 링크에 직접 준 색은 눌린다. 안쪽 span 으로 옮긴다 (D-204) */}
        <span className="text-text-strong hover:underline">{member.player.name}</span>
      </Link>

      {member.placement ? (
        /* 배치고사 중이면 래더 자리에 `배치고사` 를 쓴다 (CLAUDE.md 6장) */
        <span className="shrink-0 text-xs text-meta">배치고사</span>
      ) : (
        <span className={`num shrink-0 text-sm ${ratingClass(member.rating)}`}>
          {formatCount(member.rating)}점
        </span>
      )}

      <span className="num w-14 shrink-0 text-right text-xs text-meta">
        {formatCount(member.games)}판
      </span>

      <OnlineCell online={member.online} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* 포지션별 (앞 버전 · 지우지 않는다 · CLAUDE.md 10-4)                             */
/* -------------------------------------------------------------------------- */

/** 한 사람 — `닉네임 3,412점`. 닉네임을 누르면 그 선수 기록실로 간다 */
function Member({
  member,
  leagueSlug,
  showLabel,
}: {
  member: ClanRosterGroup['members'][number]
  leagueSlug: string
  /**
   * `포지션 미정` 묶음에서만 켠다.
   *
   * 선수가 **우리 코드가 아닌 말**로 자리를 직접 적어 둔 경우가 있다 (`돌격` · `후방` 등).
   * 그 사람은 네 묶음 어디에도 못 들어가지만, **적은 말은 그대로 보여 준다** —
   * 사람이 정한 값은 언제나 이긴다 (D-199). 우리 표기로 고쳐 쓰지도, 버리지도 않는다.
   */
  showLabel?: boolean
}) {
  const ownLabel = showLabel ? member.position_label?.trim() : undefined
  return (
    <span className="mr-3 inline-block whitespace-nowrap">
      <Link href={leaguePlayerPath(leagueSlug, member.player.id)} className="mr-1 hover:underline">
        {member.player.name}
      </Link>
      {ownLabel ? <span className="mr-1 text-xs text-meta">{ownLabel}</span> : null}
      {member.placement ? (
        <span className="text-xs text-meta">배치고사</span>
      ) : (
        <span className={`num text-xs ${ratingClass(member.rating)}`}>
          {formatCount(member.rating)}점
        </span>
      )}
    </span>
  )
}

/** 포지션 한 줄 */
function Group({ group, leagueSlug }: { group: ClanRosterGroup; leagueSlug: string }) {
  return (
    <div className="flex items-baseline border-b border-b-line-soft py-1.5 last:border-b-0">
      <div className="w-24 shrink-0 text-sm text-meta">
        {group.label}
        {/* 한 팀에 몇 자리인가. `포지션 미정` 은 정원이라는 개념이 없어 적지 않는다 */}
        {group.slots === null ? null : <span className="num ml-1 text-xs">{group.slots}자리</span>}
      </div>
      <div className="min-w-0 flex-grow text-sm">
        {group.members.length === 0 ? (
          /* 아무도 없다. 남는 선수로 메우지 않는다 (D-106) */
          <span className="text-meta">—</span>
        ) : (
          group.members.map((member) => (
            <Member
              key={member.league_player_id}
              member={member}
              leagueSlug={leagueSlug}
              showLabel={group.position === null}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function ClanRoster({
  roster,
  leagueSlug,
  variant = 'list',
}: {
  roster: ClanRosterData
  leagueSlug: string
  /**
   * `list`(기본) 클랜원 목록 + 접속 표시 — 2026-09-01 사용자 지시
   * `position` 포지션별 1군/2군 — **앞 버전. 지우지 않는다** (`CLAUDE.md` 10-4)
   */
  variant?: 'list' | 'position'
}) {
  if (variant === 'position') {
    return (
      <div className="mt-2 rounded-[2px] border border-line bg-card px-5 py-4">
        <div className="flex items-baseline justify-between">
          <div className="text-lg">클랜원 포지션</div>
          <div className="text-xs text-meta">
            {formatCount(roster.member_count)}명
            <span className="ml-1">
              · {roster.first_squad_min_games}판 이상 뛴 상위 {CLAN_ROSTER_FIRST_SQUAD_SIZE}명이 1군
            </span>
          </div>
        </div>

        {roster.squads.map((squad) => (
          <div key={squad.squad} className="mt-3">
            <div className="flex items-baseline justify-between">
              <div className="text-base">{squad.label}</div>
              <div className="num text-xs text-meta">{formatCount(squad.count)}명</div>
            </div>
            {squad.count === 0 ? (
              <div className="mt-2 text-sm text-meta">해당하는 클랜원이 없습니다.</div>
            ) : (
              <div className="mt-1">
                {squad.groups.map((group) => (
                  <Group key={group.position ?? 'unknown'} group={group} leagueSlug={leagueSlug} />
                ))}
              </div>
            )}
          </div>
        ))}

        {roster.unknown_position_count > 0 ? (
          <div className="mt-3 border-t border-t-line-soft pt-2 text-xs text-meta">
            포지션 미정 {formatCount(roster.unknown_position_count)}명 — 판정할 기록이 모자라거나
            자리가 갈리지 않는 선수입니다.
          </div>
        ) : null}
      </div>
    )
  }

  /* 접속 여부를 **한 명이라도** 아는가. 아무도 모르면 그 사실을 한 줄로 밝힌다 —
     불이 전부 꺼진 화면을 설명 없이 두면 고장으로 보인다 */
  const knownAny = roster.members.some((member) => member.online !== null)

  return (
    <div className="mt-2 rounded-[2px] border border-line bg-card px-5 py-4">
      <div className="flex items-baseline justify-between">
        <div className="text-lg">클랜원</div>
        <div className="text-xs text-meta">
          {formatCount(roster.member_count)}명
          {/* **실시간이 아니다.** 언제 본 값인지 적지 않으면 지금 이 순간으로 읽힌다 */}
          {knownAny && roster.online_observed_at ? (
            <span className="num ml-1">· 접속 {shortTime(roster.online_observed_at)} 기준</span>
          ) : null}
        </div>
      </div>

      <div className="mt-2">
        {roster.members.map((member, index) => (
          <Row
            key={member.league_player_id}
            member={member}
            rank={index + 1}
            leagueSlug={leagueSlug}
          />
        ))}
      </div>

      {knownAny ? null : (
        /* 왜 불이 다 꺼져 있는지 밝힌다. 이 줄이 없으면 고장으로 보인다 */
        <div className="mt-3 border-t border-t-line-soft pt-2 text-xs text-meta">
          접속 여부는 아직 모릅니다 — 클랜원 명단과 선수가 아직 이어지지 않았습니다.
        </div>
      )}
    </div>
  )
}

import Link from 'next/link'
import type { ClanRoster as ClanRosterData, ClanRosterGroup } from '@sacloud/contract'
import { CLAN_ROSTER_FIRST_SQUAD_SIZE } from '@sacloud/contract'
import { formatCount } from '../common/format'
import { ratingClass } from '../common/rating'
import { leaguePlayerPath } from '../common/paths'

/**
 * 클랜페이지 **클랜원 정리** — 포지션별 · 1군/2군 (`docs/SITE_SPEC_V2.md` 5-2).
 *
 * ```
 * 클랜원 포지션                       27명 · 상위 5명을 1군으로 봅니다
 * ─────────────────────────────────────────────────────────────────
 * 1군                                                          5명
 *   숏포지 1자리   nudi 3,412점
 *   2F     1자리   쨔잉나 3,301점
 *   스나수 1자리   —
 *   B리베  2자리   차값 3,388점 · yuhwan 3,150점
 * 2군                                                         22명
 *   …
 *   포지션 미정    …
 * ```
 *
 * **원본(3rd.supply)에 없는 블록이다.** 사용자 지시로 만든 신규 기능이고
 * 원본과 동일함이 검증되지 않았다 (`CLAUDE.md` 3장 7번).
 *
 * ── 기존 클랜원 목록을 **대체하지 않는다**
 *   `/league/{slug}/clan/{slug}/player` 의 표는 그대로 있다. 이 카드는 그 위에 얹은
 *   새 섹터다 — 방식을 바꿀 때 앞 버전도 남긴다는 사용자 지시다.
 *
 * ── 나누는 판단은 하나도 여기서 하지 않는다
 *   1군/2군 · 포지션 묶음 · 정렬은 전부 계약(`packages/contract/src/clanRoster.ts`)이
 *   정해서 내려 준다. 화면이 다시 나누면 mock↔live 가 갈린다
 *   (`ClanMetrics` · `TierBreakdown` 과 같은 원칙이다).
 *
 * ── 빈 자리를 채우지 않는다 (D-106)
 *   `스나수` 가 아무도 없으면 `—` 다. 남는 선수를 끌어다 자리를 메우지 않고,
 *   `포지션 미정` 인 선수를 그럴듯한 자리에 넣지도 않는다.
 *   `1자리` / `2자리` 는 한 팀이 서는 정원이라 **실제 인원과 다를 수 있고**,
 *   다르면 다른 대로 보이는 것이 맞다.
 *
 * 카드 모양(`bg-card` · `shadow-card` · 구분선)은 바로 아래 `ClanMetrics` 와 같다.
 * 새 색·새 스타일을 만들지 않는다.
 */

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
      <Link
        href={leaguePlayerPath(leagueSlug, member.player.id)}
        className="mr-1 hover:underline"
      >
        {member.player.name}
      </Link>
      {ownLabel ? <span className="mr-1 text-xs text-meta">{ownLabel}</span> : null}
      {member.placement ? (
        /* 배치고사 중이면 래더 자리에 `배치고사` 를 쓴다 (CLAUDE.md 6장) */
        <span className="text-xs text-meta">배치고사</span>
      ) : (
        <span className={`text-xs ${ratingClass(member.rating)}`}>
          {formatCount(member.rating)}점
        </span>
      )}
    </span>
  )
}

/** 포지션 한 줄 */
function Group({ group, leagueSlug }: { group: ClanRosterGroup; leagueSlug: string }) {
  return (
    <div className="flex items-baseline border-b border-b-divider py-1.5 last:border-b-0">
      <div className="w-24 shrink-0 text-sm text-meta">
        {group.label}
        {/* 한 팀에 몇 자리인가. `포지션 미정` 은 정원이라는 개념이 없어 적지 않는다 */}
        {group.slots === null ? null : (
          <span className="ml-1 text-xs">{group.slots}자리</span>
        )}
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

export function ClanRoster({
  roster,
  leagueSlug,
}: {
  roster: ClanRosterData
  leagueSlug: string
}) {
  return (
    <div className="mt-2 bg-card px-3 py-3 shadow-card">
      <div className="flex items-baseline justify-between">
        <div className="text-lg">클랜원 포지션</div>
        <div className="text-xs text-meta">
          {formatCount(roster.member_count)}명
          {/* 1군을 어떻게 골랐는지 숨기지 않는다 — 안 적으면 순서가 자의적으로 보인다 */}
          <span className="ml-1">
            · {roster.first_squad_min_games}판 이상 뛴 상위 {CLAN_ROSTER_FIRST_SQUAD_SIZE}명이 1군
          </span>
        </div>
      </div>

      {roster.squads.map((squad) => (
        <div key={squad.squad} className="mt-3">
          <div className="flex items-baseline justify-between">
            <div className="text-base">{squad.label}</div>
            <div className="text-xs text-meta">{formatCount(squad.count)}명</div>
          </div>
          {squad.count === 0 ? (
            <div className="mt-2 text-sm text-meta">해당하는 클랜원이 없습니다.</div>
          ) : (
            <div className="mt-1">
              {squad.groups.map((group) => (
                <Group
                  key={group.position ?? 'unknown'}
                  group={group}
                  leagueSlug={leagueSlug}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 왜 `포지션 미정` 이 있는지 밝힌다. 이 줄이 없으면 고장으로 보인다.
          좌표 판정이 없거나 1·2등 격차가 좁은 선수다 — 틀린 자리를 적느니 비운다 (D-199) */}
      {roster.unknown_position_count > 0 ? (
        <div className="mt-3 border-t border-t-divider pt-2 text-xs text-meta">
          포지션 미정 {formatCount(roster.unknown_position_count)}명 — 판정할 기록이
          모자라거나 자리가 갈리지 않는 선수입니다.
        </div>
      ) : null}
    </div>
  )
}

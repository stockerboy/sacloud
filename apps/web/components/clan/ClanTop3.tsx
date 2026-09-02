'use client'

import Link from 'next/link'
import type { ClanRosterMember } from '@sacloud/contract'

/**
 * **클랜 TOP3** — 육각형 카드 왼쪽 윗공간 (2026-09-02 사장님 그림 지시 #27).
 *
 * ```
 * 1위  ○○○님이 ○○○클랜의 심장입니다
 * 2위  ○○○님이 ○○○클랜의 오른팔입니다
 * 3위  ○○○님이 ○○○클랜의 왼팔입니다
 * ```
 * 문구는 지시 **그대로**다. 앞은 선수 닉네임(선수 기록실 링크), 뒤는 그 클랜 이름.
 *
 * ── 어디서 뽑나
 *   클랜 기록실이 **이미 읽는 명단**(`roster.members` · 래더 높은 순)에서 뽑는다 — DB 왕복을 늘리지 않는다.
 *   「소속」 판정은 그 명단이 이미 D-160(가장 최근 경기 기준)으로 해 둔 것이다. 여기서 다시 판정하지 않는다.
 *
 * ── 규칙
 *   - 래더 상위 3명. **동점이면 이름순**(`localeCompare('ko')`)으로 안정 정렬 — 매번 순서가 바뀌면 안 된다
 *   - 배치고사 중(`placement`)인 사람은 뺀다 — 그때 `rating` 은 «아직 실력이 아니다» (계약 주석).
 *     그래서 3명이 안 될 수 있다 — **있는 만큼만** 적는다
 *   - 0명이면 아무것도 그리지 않는다. 다른 것으로 채우지 않는다 (`CLAUDE.md` 3장 7번)
 */

const ROLE = ['심장', '오른팔', '왼팔'] as const

export function ClanTop3({
  clanName,
  members,
  leagueSlug,
}: {
  clanName: string
  members: readonly ClanRosterMember[]
  leagueSlug: string
}) {
  const top = members
    .filter((member) => !member.placement)
    .sort(
      (a, b) =>
        b.rating - a.rating || a.player.name.localeCompare(b.player.name, 'ko'),
    )
    .slice(0, ROLE.length)

  if (top.length === 0) return null

  return (
    <div>
      <div className="text-sm text-text-strong">클랜 TOP3</div>
      <ol className="mt-1.5 space-y-1.5 text-[13px] text-text">
        {top.map((member, index) => (
          <li key={member.league_player_id} className="flex items-baseline gap-2">
            <span className="num w-7 shrink-0 text-xs text-meta">{index + 1}위</span>
            <span className="min-w-0">
              <Link
                href={`/league/${leagueSlug}/player/${member.player.id}`}
                className="hover:underline"
              >
                {/* `a { color: inherit }` — 색은 안쪽 span (D-204) */}
                <span className="text-text-strong">{member.player.name}</span>
              </Link>
              님이 {clanName}클랜의 {ROLE[index]}입니다
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

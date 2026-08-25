'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MatchDetail, MatchListItem, MatchPlayerStat } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'

/**
 * 경기 당시 소속 클랜 (D-131).
 *
 * **현재 소속이 아니다.** 선수가 이적해도 과거 경기 화면은 변하지 않아야 한다.
 * 근거가 없으면 `null`이고, 그때는 마크를 그리지 않는다 — 현재 소속으로 메우지 않는다.
 */
export interface MatchTimeClan {
  name: string
  mark: { bg: string | null; front: string | null }
}
import { RelativeTime } from '../common/RelativeTime'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { leagueClanPath, leaguePlayerPath } from '../common/paths'
import {
  COMPOSITION_NOTICE,
  NOT_RATED_BADGE,
  NOT_RATED_BADGE_TITLE,
  isRated,
  ladderNotice,
  UNOFFICIAL_BADGE,
  UNOFFICIAL_BADGE_TITLE,
} from './officialCopy'

/**
 * 매치 카드 (기록실 목록의 한 줄, 아코디언).
 *
 * 원본 실측 구조 — 접힌 상태 (2026-08-20)
 * ```
 * <div class="flex items-stretch min-h-28 mt-2 border-t border-r border-b
 *             bg-sky-100 border-sky-200">              승리 (패배는 red 계열)
 *   <div class="w-2 bg-sky-500"></div>                 왼쪽 색 막대
 *   <div class="w-24 text-center text-gray-700">       맵 / 플레이시간 / 승패 / 상대시간
 *   <div class="w-20">래더 <span class="text-sky-500">+9점</span>
 *   <div class="w-32">7 / <span class="text-red-500">5</span> / 4  (58.3%)
 *   <div class="w-88">                                 양팀 클랜 (마크·이름·부리그·래더)
 *   <div class="w-40"> × 2                             양팀 라인업 (스나이퍼는 [S])
 *   <div class="flex flex-row-reverse flex-grow">상세보기</div>
 * ```
 * 실측 색 — 승: 배경 #E0F2FE · 테두리 #BAE6FD · 막대 #0EA5E9 · 글자 #0284C7 · 래더 #0EA5E9
 *          패: 배경 #FEE2E2 · 테두리 #FECACA · 막대 #F87171 · 글자/래더 #EF4444
 * 카드 최소 높이 7rem(98px), 실측 렌더 높이 105px.
 *
 * **펼친 상태는 원본에서 확인하지 못했다 `[미확인]`.**
 * 자동화로 아코디언을 열 수 없었다(클릭이 전달되지 않음). 아래 구현은
 * `docs/3rd-supply-structure.md` 7장에 기록된 관측 내용과 `MatchDetail` 계약을 근거로 만들었다:
 * 선레드·선블루 / 게임시작시간 / N vs N / 팀별 표 `플레이어 | 래더 | kda | 무기 | 딜량 | 헤드샷`.
 * 상세 배치·간격은 원본과 동일함이 검증되지 않았다.
 */

/** 초 → `10분 36초` (원본 표기) */
export function formatPlayTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

/** 래더 증감 → `+9점` / `-16점` (원본 표기) */
export function formatRatingUpdate(value: number): string {
  return `${value > 0 ? '+' : ''}${value}점`
}

function Lineup({
  entries,
  leagueSlug,
}: {
  entries: readonly {
    player_id: string
    name: string
    /** 수집원이 무기를 주지 않으면 null — `[S]`를 붙일 근거가 없다 (D-034) */
    weapon: number | null
    dropout: boolean | null
    /** **그 경기 당시** 소속 클랜. 현재 소속이 아니다 (D-131) */
    match_time_clan: MatchTimeClan | null
  }[]
  leagueSlug: string
}) {
  return (
    <div className="flex w-48 items-center py-1 text-sm text-meta">
      <div>
        {entries.map((entry) => (
          <div key={entry.player_id} className="flex items-center">
            {/* 경기 당시 소속 클랜마크. 근거가 없으면 아무것도 그리지 않는다 —
                현재 소속으로 대신 채우지 않는다 (D-131) */}
            {entry.match_time_clan ? (
              <ClanMark
                mark={entry.match_time_clan.mark}
                alt={entry.match_time_clan.name}
                size="xxs"
                className="mr-1"
              />
            ) : null}
            <Link className="inline-block" href={leaguePlayerPath(leagueSlug, entry.player_id)}>
              <span className={entry.dropout ? 'line-through' : ''}>{entry.name}</span>
              {/* 무기: 0 = 라이플, 1 = 스나이퍼 → 스나이퍼만 [S] 표기 (원본 규칙).
                  null(알 수 없음)이면 아무 표기도 하지 않는다 */}
              {entry.weapon === 1 ? <span>[S]</span> : null}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClanSide({
  snapshot,
  leagueSlug,
  align,
}: {
  snapshot: MatchListItem['league_clan']
  leagueSlug: string
  align: 'left' | 'right'
}) {
  return (
    <div className={`w-42 ${align === 'right' ? 'flex flex-row-reverse' : ''}`}>
      <div className={`text-base ${align === 'right' ? 'text-right' : ''}`}>
        <Link className="inline-block" href={leagueClanPath(leagueSlug, snapshot.clan.slug)}>
          <ClanMark
            mark={snapshot.clan.mark}
            size="xs"
            className="mr-1 inline-block align-middle"
            alt={snapshot.clan.name}
          />
          <span className="inline-block max-w-[100px] truncate align-middle">
            {snapshot.clan.name}
          </span>
        </Link>
        <div className="text-sm text-meta">
          {snapshot.division}부리그{' '}
          {snapshot.placement ? (
            '배치고사'
          ) : snapshot.rating === null ? (
            /* 래더에 반영되지 않은 경기는 그 시점 클랜 점수 자체가 없다 (D-146).
               `0점` 으로 그리면 클랜 점수가 0이었던 것처럼 읽힌다. */
            <span className="text-unknown">알수없음</span>
          ) : (
            `${formatCount(snapshot.rating)}점`
          )}
        </div>
      </div>
    </div>
  )
}

export function MatchCard({
  match,
  leagueSlug,
  detail,
  onExpand,
}: {
  match: MatchListItem
  leagueSlug: string
  /** 펼쳤을 때 지연 로드된 상세 (없으면 로딩 중) */
  detail?: MatchDetail
  /** 아코디언을 펼칠 때 상세를 요청한다. 어느 기록실에서 펼쳤는지는 매치가 알고 있다. */
  onExpand?: (match: MatchListItem) => void
}) {
  const [open, setOpen] = useState(false)
  const win = match.win
  const stat = match.player_stat

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) onExpand?.(match)
  }

  return (
    <div>
      <div
        className={`mt-2 flex min-h-28 items-stretch border-b border-r border-t ${
          win ? 'border-win-line bg-win-bg' : 'border-lose-line bg-lose-bg'
        }`}
      >
        <div className={`w-2 ${win ? 'bg-win-bar' : 'bg-lose-bar'}`} />

        {/* 두 가지를 **따로** 보여 준다 (D-145).
            `비공식`은 클랜원 구성에 대한 역사적 라벨이고 래더와 무관하다.
            래더 반영 여부는 **정상 5v5 인가**로만 정해진다. 둘을 한 배지에 묶으면
            "비공식이라 래더 미반영" 이라는 폐기된 규칙을 다시 말하게 된다. */}
        {match.official && isRated(match.participant_completeness) ? null : (
          <div className="flex w-16 flex-col items-center justify-center gap-0.5">
            {match.official ? null : (
              <div
                className="rounded border border-line px-1 py-0.5 text-center text-[10px] leading-tight text-meta"
                title={UNOFFICIAL_BADGE_TITLE}
              >
                {UNOFFICIAL_BADGE}
              </div>
            )}
            {isRated(match.participant_completeness) ? null : (
              <div
                className="rounded border border-lose-line px-1 py-0.5 text-center text-[10px] leading-tight text-lose"
                title={NOT_RATED_BADGE_TITLE}
              >
                {NOT_RATED_BADGE}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center">
          <div className="w-24 text-center text-meta">
            <div className="text-sm font-semibold">{match.map.name}</div>
            <div className="mb-1 text-sm">
              {match.play_time === null ? (
                <span className="text-unknown">알수없음</span>
              ) : (
                formatPlayTime(match.play_time)
              )}
            </div>
            <div className={`font-bold ${win ? 'text-win' : 'text-lose'}`}>
              {win ? '승리' : '패배'}
            </div>
            <div className="text-sm">
              <RelativeTime value={match.start_at} />
            </div>
          </div>
        </div>

        <div className="flex w-20 items-center justify-center">
          <div className="text-center text-sm">
            <div className="mb-1">래더</div>
            {/* 배치고사 중이면 래더 증감 대신 `배치고사` (원본 규칙) */}
            {match.placement ? (
              <div className="font-semibold">배치고사</div>
            ) : match.rating_update !== null ? (
              <div className={`font-semibold ${win ? 'text-win-bar' : 'text-lose'}`}>
                {formatRatingUpdate(match.rating_update)}
              </div>
            ) : (
              <div className="font-semibold text-unknown">알수없음</div>
            )}
          </div>
        </div>

        {/* 개인 기록실에서만 본인 K/D/A가 표시된다 (클랜 기록실에서는 null) */}
        {stat ? (
          <div className="flex w-32 items-center justify-center text-meta">
            <div className="text-center">
              <div className="h-5">{stat.mvp ? <span className="text-mvp">MVP</span> : null}</div>
              <div className="text-xl font-semibold">
                {stat.kill} / <span className="text-lose">{stat.death}</span> / {stat.assist}
              </div>
              <div className={`text-sm ${rateClass(stat.kd_rate)}`}>
                ({formatRate(stat.kd_rate)}%)
              </div>
              <div className="h-5">
                {stat.dropout ? <span className="text-sm text-lose">탈주</span> : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex w-88 items-center">
          <ClanSide snapshot={match.league_clan} leagueSlug={leagueSlug} align="right" />
          <div className="px-2 text-sm text-meta">vs</div>
          <ClanSide snapshot={match.opponent} leagueSlug={leagueSlug} align="left" />
        </div>

        <Lineup entries={match.red} leagueSlug={leagueSlug} />
        <Lineup entries={match.blue} leagueSlug={leagueSlug} />

        <div className="flex flex-grow flex-row-reverse">
          <button
            type="button"
            onClick={toggle}
            className="mb-2 cursor-pointer self-end whitespace-nowrap px-2 text-sm"
          >
            {open ? '접기' : '상세보기'}
          </button>
        </div>
      </div>

      {open ? <MatchDetailPanel match={match} detail={detail} /> : null}
    </div>
  )
}

/* --------------------------------------------------------------- 펼친 상세 --- */

function StatTable({ title, stats }: { title: string; stats: readonly MatchPlayerStat[] }) {
  return (
    <div className="mt-2">
      <div className="px-2 py-1 text-sm font-semibold">{title}</div>
      <div className="flex items-center border-b border-b-line py-1 text-sm text-meta">
        <div className="w-40 px-2">플레이어</div>
        <div className="w-24 text-center">래더</div>
        <div className="w-28 text-center">kda</div>
        <div className="w-20 text-center">무기</div>
        <div className="w-24 text-center">딜량</div>
        <div className="w-24 text-center">헤드샷</div>
      </div>
      {stats.map((stat) => (
        <div
          key={stat.player_id}
          className="flex items-center border-b border-b-line py-1 text-sm last:border-b-0"
        >
          <div className="flex w-40 items-center px-2">
            {/* 경기 당시 소속 클랜 (D-131). 지금 어느 클랜인지가 아니다 */}
            {stat.match_time_clan ? (
              <ClanMark
                mark={stat.match_time_clan.mark}
                alt={stat.match_time_clan.name}
                size="xxs"
                className="mr-1"
              />
            ) : null}
            <span className={stat.dropout ? 'line-through' : ''}>{stat.name}</span>
            {stat.mvp ? <span className="ml-1 text-mvp">MVP</span> : null}
          </div>
          <div className="w-24 text-center">
            {stat.placement ? '배치고사' : `${formatCount(stat.rating ?? 0)}점`}
          </div>
          <div className="w-28 text-center">
            {stat.kill} / {stat.death} / {stat.assist}
          </div>
          <div className="w-20 text-center">
            {stat.weapon === null ? (
              <span className="text-unknown">알수없음</span>
            ) : stat.weapon === 1 ? (
              '스나이퍼'
            ) : (
              '라이플'
            )}
          </div>
          {/* 상대 클랜 소속은 딜량·헤드샷이 결측된다 → `알수없음` (원본 규칙) */}
          <div className="w-24 px-1 text-center">
            {stat.damage === null ? (
              <span className="text-unknown">알수없음</span>
            ) : (
              <>
                <div>{formatCount(stat.damage)}</div>
                {/* 팀 내 딜량 비중 막대 — 숫자만으로는 기여도가 안 읽힌다 */}
                {stat.damage_percent === null ? null : (
                  <div className="mt-0.5 h-1 w-full rounded bg-line">
                    <div
                      className="h-full rounded bg-accent"
                      style={{ width: `${Math.min(100, Math.max(0, stat.damage_percent))}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="w-24 text-center">
            {stat.headshot === null ? (
              <span className="text-unknown">알수없음</span>
            ) : (
              formatCount(stat.headshot)
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchDetailPanel({
  match,
  detail,
}: {
  match: MatchListItem
  detail?: MatchDetail
}) {
  return (
    <div className="border-x border-b border-line bg-card px-4 py-3">
      <div className="flex items-center text-sm text-meta">
        {/* `blue_team`의 정확한 의미는 [미확인] — 계약 주석 참조.
            null이면 선공 진영을 모르는 것이므로 **표기하지 않는다** (false로 단정하지 않는다) */}
        {match.blue_team === null ? null : (
          <div className="mr-4">{match.blue_team ? '선블루' : '선레드'}</div>
        )}
        <div className="mr-4">
          {new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(match.start_at))}
        </div>
        <div>
          {match.player_count} vs {match.player_count}
        </div>
        {/* 재구성 경기는 **우리가 몇 명을 확인했는지**를 숨기지 않는다 (D-068).
            5명 전원을 확인한 경기와 3명만 확인한 경기는 신뢰도가 다르다. */}
        {match.participant_completeness === null ? null : (
          <div
            className="ml-4 rounded border border-line px-1.5 py-0.5 text-xs text-meta"
            title="넥슨이 참가자 전원을 주지 않아, 확인된 인원만 표기한다"
          >
            확인 {match.participant_completeness}
            {match.evidence_confidence === 'low' ? ' · 일부' : null}
          </div>
        )}
      </div>
      {/* 구성(클랜원/용병)은 그대로 보여 준다. **반영률(100/70/40/0%)은 폐기됐다** (D-145) —
          클랜원 수가 그 경기의 증감을 깎지 않기 때문에 "이 경기의 반영률" 이라는 값 자체가 없다. */}
      {match.league_clan.clan_weight === null ? null : (
        <div className="mt-2 flex flex-wrap gap-4 border-b border-divider pb-2 text-sm text-meta">
          {[match.league_clan, match.opponent].map((snapshot) => (
            <div key={snapshot.league_clan_id}>
              <span className="font-semibold text-ink">{snapshot.clan.name}</span>{' '}
              클랜원 {snapshot.members_confirmed ?? 0} / 용병 {snapshot.mercenaries_confirmed ?? 0}
            </div>
          ))}
          <div className={isRated(match.participant_completeness) ? undefined : 'text-lose'}>
            {ladderNotice(match.participant_completeness)}
          </div>
          <div className="basis-full text-xs">{COMPOSITION_NOTICE}</div>
        </div>
      )}
      {detail ? (
        <>
          <StatTable title="레드" stats={detail.red_stats} />
          <StatTable title="블루" stats={detail.blue_stats} />
        </>
      ) : (
        <div className="py-4 text-center text-sm text-meta">불러오는 중…</div>
      )}
    </div>
  )
}

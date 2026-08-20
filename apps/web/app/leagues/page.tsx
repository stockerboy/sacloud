'use client'

import Link from 'next/link'
import type { LeagueListItem } from '@sacloud/contract'
import { LeagueListTable, LoadMoreButton } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 리그 목록 `/leagues`.
 *
 * 원본 실측 구조
 * ```
 * <div class="bg-white"><div class="pc-container"><div class="flex pt-10">
 *   <div class="flex-shrink-0 w-1/2">
 *     <div class="px-10 py-7 h-128 border-2 border-black rounded-lg shadow-xl">
 *       <div class="font-bold text-6xl leading-relaxed tracking-wider">{환영 문구}</div>
 *       <div class="mt-10 text-coolGray-600 text-3xl leading-10">{안내}</div>
 *       <div class="mt-12">{리그만들기 버튼}</div>
 *   <div class="flex-grow w-1/2"><div class="px-10 py-6 text-coolGray-900">
 *       (제목 text-3xl + .description) × 3
 * <div class="pc-container bg-white min-h-600px px-6 py-6">
 *   <div class="text-3xl">{대표리그 제목}</div>
 *   <리그 목록 표>
 * ```
 * 실측: 좌측 카드 높이 32rem(448px) · 테두리 2px 검정 · 큰 그림자
 *
 * 문구는 원본 카피를 쓰지 않고 같은 정보 구조로 새로 썼다 (CLAUDE.md 3장 4번).
 */

const GUIDE = [
  {
    title: 'SACLOUD 리그란?',
    body: '원하는 클랜들을 모아 직접 리그를 만들고, 그 안에서 치른 클랜전만 따로 집계해 순위를 매기는 기능입니다. 리그마다 맵과 대전인원을 정할 수 있고, 조건에 맞는 경기만 기록됩니다.',
  },
  {
    title: '어떻게 만드나요?',
    body: '서든어택 계정 연동을 마친 회원이면 누구나 리그를 만들 수 있습니다. 리그 이름과 주소, 부리그 수, 사용할 맵과 대전인원을 정하면 바로 개설됩니다.',
  },
  {
    title: '어떻게 참여하나요?',
    body: '리그 관리자가 보낸 초대를 클랜 마스터가 수락하면 참여가 시작됩니다. 참여 이후에 치른 경기부터 리그 기록에 반영됩니다.',
  },
]

export default function LeaguesPage() {
  const leagues = useCursorQuery<LeagueListItem>('leagueList', ['leagues'])

  return (
    <div className="pb-10">
      <div className="bg-card">
        <div className="pc-container">
          <div className="flex pt-10">
            <div className="w-1/2 flex-shrink-0">
              <div className="h-128 rounded-lg border-2 border-black px-10 py-7 shadow-xl">
                <div className="text-6xl font-bold leading-relaxed tracking-wider">
                  SACLOUD 리그에
                  <br />
                  오신 걸 환영합니다.
                </div>
                <div className="mt-10 text-3xl leading-10 text-lede">
                  지금 바로 리그를 만들고
                  <br />
                  직접 운영해보세요.
                </div>
                <div className="mt-12">
                  <Link
                    href="/leagues/create"
                    className="inline-flex items-center rounded bg-more px-6 py-3 text-xl text-white"
                  >
                    리그만들기
                  </Link>
                </div>
              </div>
            </div>
            <div className="w-1/2 flex-grow">
              <div className="px-10 py-6">
                {GUIDE.map((item, index) => (
                  <div key={item.title}>
                    <div
                      className={`flex items-center text-3xl ${index === 0 ? '' : 'mt-7'}`}
                    >
                      {item.title}
                    </div>
                    <div className="mt-2 text-lede">{item.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pc-container min-h-[600px] bg-card px-6 py-6">
        <div className="text-3xl">SACLOUD 대표리그</div>
        <LeagueListTable
          items={leagues.items}
          loading={leagues.loading}
          error={leagues.error}
          onRetry={leagues.retry}
        />
        {leagues.hasMore ? (
          <LoadMoreButton onClick={leagues.loadMore} loading={leagues.loadingMore} />
        ) : null}
      </div>
    </div>
  )
}

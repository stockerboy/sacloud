'use client'

import Link from 'next/link'
import type { LeagueListItem } from '@sacloud/contract'
import { LeagueListTable, LoadMoreButton } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 리그 목록 `/leagues`.
 *
 * `적진` 톤 (2026-08-30) — 흰 카드·큰 그림자·2px 검정 테두리를 전부 걷어냈다.
 * 히어로는 상자가 아니라 **여백 위에 세운 큰 제목**이고, 오른쪽 안내는 1px 선으로만 나눈다.
 * 화면을 꽉 채우지 않는다 (본문 최대 폭은 `.pc-container`).
 *
 * 문구와 이동 경로(`/leagues/create`, 각 리그 링크)는 그대로다.
 */

const GUIDE = [
  {
    title: '3rd cloud 리그란?',
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
    <div className="pc-container py-[var(--section-gap)] pb-20">
      <div className="flex gap-16 max-md:flex-col max-md:gap-10">
        <div className="w-1/2 shrink-0 max-md:w-full">
          <h1 className="font-display text-5xl leading-tight tracking-wide text-text-strong max-md:text-4xl">
            3rd cloud 리그에
            <br />
            오신 걸 환영합니다.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-meta">
            지금 바로 리그를 만들고
            <br />
            직접 운영해보세요.
          </p>
          <Link
            href="/leagues/create"
            className="mt-10 inline-flex h-12 items-center rounded-[var(--radius)] bg-accent px-8 font-semibold tracking-wide text-text-strong"
          >
            리그만들기
          </Link>
        </div>

        <div className="min-w-0 flex-1">
          {GUIDE.map((item, index) => (
            <div
              key={item.title}
              className={`border-b border-b-line-soft pb-6 ${index === 0 ? '' : 'pt-6'}`}
            >
              <div className="text-lg font-semibold text-text-strong">{item.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-meta">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[var(--section-gap)]">
        <h2 className="font-display text-2xl tracking-wide text-text-strong">3rd cloud 대표리그</h2>
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

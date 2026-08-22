'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AdminCard, AdminDenied, Stat } from './AdminShell'
import { adminFetch, AdminError } from './lib'

interface Summary {
  activeSeasons: { league: string; number: number; startedAt: string; mock: boolean }[]
  clans: { total: number; official: number; independent: number; inactive: number }
  roster: { memberships: number; verified: number; players: number }
  matches: {
    staged: number
    reconstructed: number
    official: number
    reference: number
    pending: number
    skipped: number
  }
  rating: { ratedStats: number; lastFormulaVersion: string | null }
  poll: { targets: number; due: number; lastRunAt: string | null }
  betaOpenedAt: string | null
}

interface AuditRow {
  id: string
  userEmail: string
  action: string
  targetType: string
  targetId: string
  note: string | null
  createdAt: string
}

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: () => adminFetch<{ summary: Summary; audit: AuditRow[] }>('/summary'),
    retry: false,
  })

  if (query.error instanceof AdminError) return <AdminDenied message={query.error.message} />
  if (!query.data) return <div className="text-meta">불러오는 중…</div>

  const { summary, audit } = query.data

  return (
    <>
      <AdminCard title="시즌">
        <div className="flex flex-wrap gap-3">
          {summary.activeSeasons.length === 0 ? (
            <Stat label="활성 시즌" value="없음" />
          ) : (
            summary.activeSeasons.map((season) => (
              <Stat
                key={season.league}
                label={`${season.league}${season.mock ? ' (MOCK)' : ''}`}
                value={`Season ${season.number}`}
                hint={new Date(season.startedAt).toLocaleDateString('ko-KR')}
              />
            ))
          )}
          <Stat label="베타오픈 시각" value={summary.betaOpenedAt ?? '미설정'} />
        </div>
        <div className="mt-2 text-sm text-meta">
          MOCK 표시는 개발용 시드 리그다. 실운영 판단에 쓰지 않는다.
        </div>
        <div className="mt-3 text-sm text-meta">
          시즌 전환은 <Link className="underline" href="/admin/seasons">시즌 화면</Link>에서
          운영자가 직접 실행할 때만 일어난다. 날짜·배포로 자동 전환되지 않는다.
        </div>
      </AdminCard>

      <AdminCard title="클랜 · 로스터">
        <div className="flex flex-wrap gap-3">
          <Stat label="전체 클랜" value={summary.clans.total} />
          <Stat label="공식리그" value={summary.clans.official} />
          <Stat label="무소속" value={summary.clans.independent} />
          <Stat label="비활성" value={summary.clans.inactive} />
          <Stat label="로스터 등록" value={summary.roster.memberships} hint={`확인됨 ${summary.roster.verified}`} />
          <Stat label="등록 선수" value={summary.roster.players} />
        </div>
      </AdminCard>

      <AdminCard title="수집 · 경기">
        <div className="flex flex-wrap gap-3">
          <Stat label="수집 경기(스테이징)" value={summary.matches.staged} />
          <Stat label="재구성 판정" value={summary.matches.reconstructed} />
          <Stat label="공식 경기" value={summary.matches.official} />
          <Stat label="참고 기록" value={summary.matches.reference} hint="통계 미반영" />
          <Stat label="대기" value={summary.matches.pending} />
          <Stat label="보류" value={summary.matches.skipped} />
        </div>
      </AdminCard>

      <AdminCard title="래더 · 수집기">
        <div className="flex flex-wrap gap-3">
          <Stat label="래더 반영 기록" value={summary.rating.ratedStats} hint={summary.rating.lastFormulaVersion ?? '-'} />
          <Stat label="폴링 대상" value={summary.poll.targets} hint={`조회 예정 ${summary.poll.due}`} />
          <Stat
            label="마지막 수집"
            value={summary.poll.lastRunAt ? new Date(summary.poll.lastRunAt).toLocaleString('ko-KR') : '없음'}
          />
        </div>
      </AdminCard>

      <AdminCard title="최근 변경 이력">
        {audit.length === 0 ? (
          <div className="text-meta">아직 기록된 변경이 없다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-meta">
              <tr>
                <th className="py-1 text-left">시각</th>
                <th className="text-left">실행자</th>
                <th className="text-left">작업</th>
                <th className="text-left">대상</th>
                <th className="text-left">메모</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id} className="border-t border-divider">
                  <td className="py-1">{new Date(row.createdAt).toLocaleString('ko-KR')}</td>
                  <td>{row.userEmail}</td>
                  <td>{row.action}</td>
                  <td>{row.targetType}/{row.targetId}</td>
                  <td className="text-meta">{row.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>
    </>
  )
}

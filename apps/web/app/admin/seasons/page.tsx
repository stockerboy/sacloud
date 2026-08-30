'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminCard, AdminDenied, Stat } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

interface Overview {
  leagueSlug: string
  leagueName: string
  divisionCount: number
  activeSeason: { number: number; startedAt: string; endedAt: string | null; status: string } | null
  seasons: {
    number: number
    startedAt: string
    endedAt: string | null
    status: string
    hasClanSnapshot: boolean
    hasPlayerSnapshot: boolean
  }[]
  divisions: { division: number; clans: number }[]
  matchesInSeason: number
  officialMatches: number
  referenceMatches: number
}

interface ClosePreview {
  preview: {
    ok: boolean
    season: number | null
    clanRows: number
    playerRows: number
    divisionLeaders: { division: number; clan: string; rating: number }[]
  }
  executed: boolean
}

interface StartPreview {
  preview: {
    ok: boolean
    nextNumber: number
    promoted: { clan: string; rating: number } | null
    relegated: { clan: string; rating: number } | null
    players: number
    clans: number
    baseline: number
  }
  executed: boolean
}

export default function AdminSeasonsPage() {
  const client = useQueryClient()
  const [league, setLeague] = useState('officialmain')
  const [closePreview, setClosePreview] = useState<ClosePreview | null>(null)
  const [startPreview, setStartPreview] = useState<StartPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const overview = useQuery({
    queryKey: ['admin', 'seasons', league],
    queryFn: () => adminFetch<Overview>(`/seasons/${league}`),
    retry: false,
  })

  const call = async <T,>(path: string, body: unknown): Promise<T | null> => {
    try {
      return await adminFetch<T>(path, { method: 'POST', body })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '실패')
      return null
    }
  }

  if (overview.error instanceof AdminError) return <AdminDenied message={overview.error.message} />

  return (
    <>
      <AdminCard title="리그 선택">
        <input
          className="w-48 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
          value={league}
          onChange={(event) => setLeague(event.target.value)}
        />
        {message ? <span className="ml-3 text-sm text-accent">{message}</span> : null}
      </AdminCard>

      {!overview.data ? (
        <div className="text-meta">불러오는 중…</div>
      ) : (
        <>
          <AdminCard title={`${overview.data.leagueName} 시즌 현황`}>
            <div className="flex flex-wrap gap-3">
              <Stat
                label="활성 시즌"
                value={
                  overview.data.activeSeason ? `Season ${overview.data.activeSeason.number}` : '없음'
                }
                hint={
                  overview.data.activeSeason
                    ? new Date(overview.data.activeSeason.startedAt).toLocaleString('ko-KR')
                    : undefined
                }
              />
              <Stat label="시즌 경기" value={overview.data.matchesInSeason} />
              <Stat label="공식" value={overview.data.officialMatches} />
              <Stat label="비공식" value={overview.data.referenceMatches} />
              {overview.data.divisions.map((division) => (
                <Stat
                  key={division.division}
                  label={`${division.division}부 클랜`}
                  value={division.clans}
                />
              ))}
            </div>

            <table className="mt-4 w-full text-sm">
              <thead className="text-xs text-meta">
                <tr>
                  <th className="py-1 text-left">시즌</th>
                  <th className="text-left">시작</th>
                  <th className="text-left">종료</th>
                  <th className="text-left">상태</th>
                  <th className="text-left">최종 랭킹 스냅샷</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.seasons.map((season) => (
                  <tr key={season.number} className="border-t border-line-soft">
                    <td className="py-1">Season {season.number}</td>
                    <td>{new Date(season.startedAt).toLocaleDateString('ko-KR')}</td>
                    <td>{season.endedAt ? new Date(season.endedAt).toLocaleDateString('ko-KR') : '-'}</td>
                    <td>{season.status === 'active' ? '진행 중' : '종료'}</td>
                    <td>
                      {season.hasClanSnapshot ? '클랜 ✓' : '클랜 -'} /{' '}
                      {season.hasPlayerSnapshot ? '개인 ✓' : '개인 -'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>

          <AdminCard title="시즌 종료">
            <p className="mb-2 text-sm text-meta">
              최종 랭킹을 스냅샷으로 굳히고 시즌을 닫는다. 경기·시즌 통계는 그대로 보존된다.
            </p>
            <button
              type="button"
              className="btn-line h-9 px-4 text-sm disabled:opacity-50"
              onClick={async () => {
                setMessage(null)
                const result = await call<ClosePreview>(`/seasons/${league}/close`, {
                  confirm: false,
                })
                setClosePreview(result)
              }}
            >
              종료 미리보기
            </button>

            {closePreview?.preview.ok ? (
              <div className="mt-4 border-l-2 border-accent py-1 pl-3 text-sm">
                <div className="font-bold text-accent">
                  Season {closePreview.preview.season}을 종료하시겠습니까?
                </div>
                <ul className="mt-2 text-text-strong">
                  <li>클랜 스냅샷 {closePreview.preview.clanRows}개</li>
                  <li>개인 스냅샷 {closePreview.preview.playerRows}명</li>
                  {closePreview.preview.divisionLeaders.map((leader) => (
                    <li key={leader.division}>
                      {leader.division}부 1위 {leader.clan} ({leader.rating}점)
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-line h-9 border-accent px-4 text-sm text-text-strong disabled:opacity-50"
                    onClick={async () => {
                      const result = await call<ClosePreview>(`/seasons/${league}/close`, {
                        confirm: true,
                      })
                      if (result?.executed) {
                        setMessage(`Season ${result.preview.season} 종료됨`)
                        setClosePreview(null)
                        void client.invalidateQueries({ queryKey: ['admin', 'seasons'] })
                      }
                    }}
                  >
                    확정하고 종료
                  </button>
                  <button
                    type="button"
                    className="btn-line h-9 px-4 text-sm disabled:opacity-50"
                    onClick={() => setClosePreview(null)}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : null}
          </AdminCard>

          <AdminCard title="새 시즌 시작">
            <p className="mb-2 text-sm text-meta">
              승강(1부 최하위 ↔ 2부 최상위)을 반영하고 개인·클랜 래더를 전원 같은 점수로 시작한다.
              이전 시즌 점수는 승계되지 않는다.
            </p>
            <button
              type="button"
              className="btn-line h-9 px-4 text-sm disabled:opacity-50"
              onClick={async () => {
                setMessage(null)
                const result = await call<StartPreview>(`/seasons/${league}/start`, {
                  confirm: false,
                })
                setStartPreview(result)
              }}
            >
              시작 미리보기
            </button>

            {startPreview?.preview.ok ? (
              <div className="mt-4 border-l-2 border-accent py-1 pl-3 text-sm">
                <div className="font-bold text-accent">
                  Season {startPreview.preview.nextNumber}을 시작하시겠습니까?
                </div>
                <ul className="mt-2 text-text-strong">
                  <li>승격 {startPreview.preview.promoted?.clan ?? '없음'}</li>
                  <li>강등 {startPreview.preview.relegated?.clan ?? '없음'}</li>
                  <li>
                    선수 {startPreview.preview.players}명 · 클랜 {startPreview.preview.clans}곳 전부{' '}
                    {startPreview.preview.baseline}점에서 시작
                  </li>
                </ul>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-line h-9 border-accent px-4 text-sm text-text-strong disabled:opacity-50"
                    onClick={async () => {
                      const result = await call<StartPreview>(`/seasons/${league}/start`, {
                        confirm: true,
                      })
                      if (result?.executed) {
                        setMessage(`Season ${result.preview.nextNumber} 시작됨`)
                        setStartPreview(null)
                        void client.invalidateQueries({ queryKey: ['admin', 'seasons'] })
                      }
                    }}
                  >
                    확정하고 시작
                  </button>
                  <button
                    type="button"
                    className="btn-line h-9 px-4 text-sm disabled:opacity-50"
                    onClick={() => setStartPreview(null)}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : null}
          </AdminCard>
        </>
      )}
    </>
  )
}

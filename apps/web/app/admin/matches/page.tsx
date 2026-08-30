'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminCard, AdminDenied } from '../AdminShell'
import { adminFetch, AdminError, originLabel } from '../lib'

interface MatchRow {
  id: string
  sourceMatchId: string | null
  startAt: string
  league: string
  map: string
  official: boolean
  origin: string
  completeness: string | null
  confidence: string | null
  red: { clan: string; rating: number | null; update: number | null }
  blue: { clan: string; rating: number | null; update: number | null }
  stats: number
}

export default function AdminMatchesPage() {
  const client = useQueryClient()
  const [official, setOfficial] = useState('')
  const [sourceMatchId, setSourceMatchId] = useState('')
  const [clan, setClan] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['admin', 'matches', official, sourceMatchId, clan],
    queryFn: () =>
      adminFetch<MatchRow[]>(
        `/matches?official=${official}&sourceMatchId=${encodeURIComponent(
          sourceMatchId,
        )}&clan=${encodeURIComponent(clan)}`,
      ),
    retry: false,
  })

  if (list.error instanceof AdminError) return <AdminDenied message={list.error.message} />

  const toggle = async (row: MatchRow) => {
    const next = !row.official
    const reason = next
      ? window.prompt('비공식 경기를 공식으로 바꾸는 근거를 적어주세요 (필수)')
      : window.prompt('공식에서 비공식으로 내리는 사유 (선택)') ?? ''
    if (next && !reason) return
    try {
      await adminFetch(`/matches/${row.id}`, {
        method: 'PATCH',
        body: { official: next, reason },
      })
      setMessage(`${row.id} → ${next ? '공식' : '비공식'} (래더 반영은 재계산이 필요하다)`)
      void client.invalidateQueries({ queryKey: ['admin', 'matches'] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '실패')
    }
  }

  return (
    <AdminCard title="경기 관리">
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
          value={official}
          onChange={(event) => setOfficial(event.target.value)}
        >
          <option value="">전체</option>
          <option value="true">공식 경기</option>
          <option value="false">비공식 경기</option>
        </select>
        <input
          className="w-56 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
          placeholder="sourceMatchId"
          value={sourceMatchId}
          onChange={(event) => setSourceMatchId(event.target.value)}
        />
        <input
          className="w-40 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
          placeholder="클랜 slug"
          value={clan}
          onChange={(event) => setClan(event.target.value)}
        />
      </div>
      {message ? <div className="mb-2 text-sm text-meta">{message}</div> : null}

      {!list.data ? (
        <div className="text-meta">불러오는 중…</div>
      ) : list.data.length === 0 ? (
        <div className="text-meta">조건에 맞는 경기가 없다.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-meta">
            <tr>
              <th className="py-1 text-left">경기</th>
              <th className="text-left">출처</th>
              <th className="text-left">일시</th>
              <th className="text-left">대진</th>
              <th className="text-left">확인</th>
              <th className="text-left">상태</th>
              <th className="text-left">래더</th>
              <th className="text-left">조작</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((row) => {
              const origin = originLabel(row.origin)
              return (
                <tr key={row.id} className="border-t border-line-soft">
                  <td className="py-1">
                    <div>{row.id}</div>
                    <div className="text-xs text-meta">{row.sourceMatchId ?? '-'}</div>
                  </td>
                  <td>
                    <span className={`rounded border px-1.5 py-0.5 text-xs ${origin.className}`}>
                      {origin.text}
                    </span>
                  </td>
                  <td>{new Date(row.startAt).toLocaleString('ko-KR')}</td>
                  <td>
                    {row.red.clan} vs {row.blue.clan}
                    <div className="text-xs text-meta">{row.map} · 참가 {row.stats}명</div>
                  </td>
                  <td>
                    {row.completeness ?? '-'}
                    <div className="text-xs text-meta">{row.confidence ?? ''}</div>
                  </td>
                  <td>
                    {row.official ? (
                      <span className="text-text-strong">공식</span>
                    ) : (
                      <span className="text-accent">비공식</span>
                    )}
                  </td>
                  <td className="text-xs text-meta">
                    {row.red.update === null && row.blue.update === null
                      ? '미반영'
                      : `${row.red.update ?? '-'} / ${row.blue.update ?? '-'}`}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-meta underline underline-offset-4 hover:text-accent"
                      onClick={() => void toggle(row)}
                    >
                      {row.official ? '비공식으로' : '공식으로'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </AdminCard>
  )
}

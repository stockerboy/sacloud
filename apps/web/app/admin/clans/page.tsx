'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminCard, AdminDenied } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

interface ClanRow {
  slug: string
  name: string
  category: string
  tier: number | null
  active: boolean
  aliases: string[]
  leagues: { league: string; division: number; rating: number; roster: number }[]
}

export default function AdminClansPage() {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [form, setForm] = useState({ slug: '', name: '', category: 'official', tier: '' })
  const [message, setMessage] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['admin', 'clans', query, category],
    queryFn: () =>
      adminFetch<ClanRow[]>(
        `/clans?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,
      ),
    retry: false,
  })

  const create = useMutation({
    mutationFn: () =>
      adminFetch<ClanRow>('/clans', {
        method: 'POST',
        body: {
          slug: form.slug,
          name: form.name,
          category: form.category,
          tier: form.tier ? Number(form.tier) : null,
        },
      }),
    onSuccess: () => {
      setMessage(`${form.name} 등록 완료`)
      setForm({ slug: '', name: '', category: 'official', tier: '' })
      void client.invalidateQueries({ queryKey: ['admin', 'clans'] })
    },
    onError: (error: unknown) => setMessage(error instanceof Error ? error.message : '실패'),
  })

  if (list.error instanceof AdminError) return <AdminDenied message={list.error.message} />

  return (
    <>
      <AdminCard title="클랜 등록">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <div className="text-meta">slug</div>
            <input
              className="w-40 border border-divider px-2 py-1"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </label>
          <label className="text-sm">
            <div className="text-meta">클랜명</div>
            <input
              className="w-48 border border-divider px-2 py-1"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="text-sm">
            <div className="text-meta">구분</div>
            <select
              className="border border-divider px-2 py-1"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              <option value="official">공식리그</option>
              <option value="independent">무소속</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-meta">무소속 티어</div>
            <input
              className="w-20 border border-divider px-2 py-1"
              value={form.tier}
              placeholder="1~5"
              onChange={(event) => setForm({ ...form, tier: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="cursor-pointer border border-divider bg-card px-3 py-1"
            disabled={create.isPending || !form.slug || !form.name}
            onClick={() => create.mutate()}
          >
            등록
          </button>
          {message ? <span className="text-sm text-meta">{message}</span> : null}
        </div>
        <p className="mt-2 text-xs text-meta">
          이름이 비슷하다고 기존 클랜에 자동으로 붙이지 않는다. 병합은 운영자가 명시적으로 실행한다.
        </p>
      </AdminCard>

      <AdminCard title="클랜 목록">
        <div className="mb-3 flex gap-2">
          <input
            className="w-60 border border-divider px-2 py-1"
            placeholder="클랜명 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="border border-divider px-2 py-1"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">전체</option>
            <option value="official">공식리그</option>
            <option value="independent">무소속</option>
          </select>
        </div>

        {!list.data ? (
          <div className="text-meta">불러오는 중…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-meta">
              <tr>
                <th className="py-1 text-left">클랜</th>
                <th className="text-left">구분</th>
                <th className="text-left">티어</th>
                <th className="text-left">리그 / 부리그</th>
                <th className="text-left">로스터</th>
                <th className="text-left">별칭</th>
                <th className="text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((clan) => (
                <tr key={clan.slug} className="border-t border-divider">
                  <td className="py-1">
                    <Link className="underline" href={`/admin/clans/${clan.slug}`}>
                      {clan.name}
                    </Link>
                    <span className="ml-2 text-xs text-meta">{clan.slug}</span>
                  </td>
                  <td>{clan.category === 'independent' ? '무소속' : '공식리그'}</td>
                  <td>{clan.tier ?? '-'}</td>
                  <td>
                    {clan.leagues.length === 0
                      ? '-'
                      : clan.leagues.map((entry) => `${entry.league} ${entry.division}부`).join(', ')}
                  </td>
                  <td>{clan.leagues.reduce((sum, entry) => sum + entry.roster, 0)}</td>
                  <td className="text-meta">{clan.aliases.join(', ') || '-'}</td>
                  <td>{clan.active ? '활성' : '비활성'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>
    </>
  )
}

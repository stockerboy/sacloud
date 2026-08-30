'use client'

import { use, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminCard, AdminDenied } from '../../AdminShell'
import { adminFetch, AdminError } from '../../lib'

interface ClanDetail {
  id: string
  slug: string
  name: string
  category: string
  tier: number | null
  active: boolean
  aliases: { id: string; alias: string; source: string }[]
  leagueClans: {
    id: string
    division: number
    rating: number
    placement: boolean
    league: { slug: string; name: string; divisionCount: number }
    rosterMemberships: {
      id: string
      joinedAt: string
      leftAt: string | null
      verified: boolean
      source: string
      player: {
        id: string
        name: string
        nexonIdentities: { ouid: string; status: string; userName: string | null }[]
      }
    }[]
  }[]
}

export default function AdminClanDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const client = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [rosterForm, setRosterForm] = useState({ leagueSlug: '', playerId: '', joinedAt: '' })
  const [aliasInput, setAliasInput] = useState('')

  const detail = useQuery({
    queryKey: ['admin', 'clan', slug],
    queryFn: () => adminFetch<ClanDetail>(`/clans/${slug}`),
    retry: false,
  })

  const refresh = () => void client.invalidateQueries({ queryKey: ['admin', 'clan', slug] })
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      setMessage(done)
      refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '실패')
    }
  }

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminFetch(`/clans/${slug}`, { method: 'PATCH', body }),
  })

  if (detail.error instanceof AdminError) return <AdminDenied message={detail.error.message} />
  if (!detail.data) return <div className="text-meta">불러오는 중…</div>
  const clan = detail.data

  return (
    <>
      {message ? <div className="mb-3 text-sm text-meta">{message}</div> : null}

      <AdminCard title={`${clan.name} (${clan.slug})`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="text-meta">클랜명</div>
            <input
              className="w-48 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
              defaultValue={clan.name}
              onBlur={(event) => {
                if (event.target.value !== clan.name) {
                  void run(() => update.mutateAsync({ name: event.target.value }), '클랜명 변경됨')
                }
              }}
            />
          </label>
          <label className="text-sm">
            <div className="text-meta">구분</div>
            <select
              className="h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
              value={clan.category}
              onChange={(event) =>
                void run(() => update.mutateAsync({ category: event.target.value }), '구분 변경됨')
              }
            >
              <option value="official">공식리그</option>
              <option value="independent">무소속</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="text-meta">무소속 티어 (자동 승강 없음)</div>
            <select
              className="h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
              value={clan.tier ?? ''}
              onChange={(event) =>
                void run(
                  () =>
                    update.mutateAsync({
                      tier: event.target.value ? Number(event.target.value) : null,
                    }),
                  '티어 변경됨',
                )
              }
            >
              <option value="">-</option>
              {[1, 2, 3, 4, 5].map((tier) => (
                <option key={tier} value={tier}>
                  Tier {tier}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-line h-9 px-4 text-sm disabled:opacity-50"
            onClick={() =>
              void run(
                () => update.mutateAsync({ active: !clan.active }),
                clan.active ? '비활성으로 바꿨다' : '활성으로 바꿨다',
              )
            }
          >
            {clan.active ? '비활성으로' : '활성으로'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="넥슨 클랜명(guild_name) 연결">
        <div className="mb-2 flex gap-2">
          <input
            className="w-60 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
            placeholder="넥슨에 보이는 클랜명 그대로"
            value={aliasInput}
            onChange={(event) => setAliasInput(event.target.value)}
          />
          <button
            type="button"
            className="btn-line h-9 px-4 text-sm disabled:opacity-50"
            disabled={!aliasInput}
            onClick={() =>
              void run(async () => {
                await adminFetch(`/clans/${slug}/aliases`, {
                  method: 'POST',
                  body: { alias: aliasInput },
                })
                setAliasInput('')
              }, '별칭 등록됨')
            }
          >
            등록
          </button>
        </div>
        {clan.aliases.length === 0 ? (
          <div className="text-sm text-meta">
            등록된 별칭이 없다. 넥슨 상세의 클랜명이 우리 클랜명과 다르면 여기에 등록해야 팀 식별에 쓰인다.
          </div>
        ) : (
          <ul className="text-sm">
            {clan.aliases.map((alias) => (
              <li key={alias.id} className="flex items-center gap-2 py-1">
                <span>{alias.alias}</span>
                <span className="text-xs text-meta">{alias.source}</span>
                <button
                  type="button"
                  className="cursor-pointer text-xs text-accent underline underline-offset-4"
                  onClick={() =>
                    void run(
                      () =>
                        adminFetch(`/clans/${slug}/aliases?id=${alias.id}`, { method: 'DELETE' }),
                      '별칭 삭제됨',
                    )
                  }
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {clan.leagueClans.map((entry) => (
        <AdminCard key={entry.id} title={`${entry.league.name} — 로스터`}>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <div className="text-meta">부리그 (래더 공식과 무관)</div>
              <select
                className="h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
                value={entry.division}
                onChange={(event) =>
                  void run(
                    () =>
                      adminFetch(`/clans/${slug}/division`, {
                        method: 'PUT',
                        body: {
                          leagueSlug: entry.league.slug,
                          division: Number(event.target.value),
                        },
                      }),
                    '부리그 변경됨',
                  )
                }
              >
                {Array.from({ length: Math.max(1, entry.league.divisionCount) }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}부
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm text-meta">
              래더 {entry.rating}점 {entry.placement ? '(배치고사)' : ''}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="text-xs text-meta">
              <tr>
                <th className="py-1 text-left">선수</th>
                <th className="text-left">Nexon 신원</th>
                <th className="text-left">등록</th>
                <th className="text-left">종료</th>
                <th className="text-left">확인</th>
                <th className="text-left">조작</th>
              </tr>
            </thead>
            <tbody>
              {entry.rosterMemberships.map((row) => (
                <tr key={row.id} className="border-t border-line-soft">
                  <td className="py-1">
                    {row.player.name}
                    <span className="ml-2 text-xs text-meta">{row.player.id}</span>
                  </td>
                  <td className="text-xs text-meta">
                    {row.player.nexonIdentities.length === 0
                      ? '연결 없음'
                      : row.player.nexonIdentities
                          .map((identity) => `${identity.userName ?? '-'} (${identity.status})`)
                          .join(', ')}
                  </td>
                  <td>{new Date(row.joinedAt).toLocaleDateString('ko-KR')}</td>
                  <td>{row.leftAt ? new Date(row.leftAt).toLocaleDateString('ko-KR') : '-'}</td>
                  <td>{row.verified ? '확인됨' : '미확인'}</td>
                  <td className="flex gap-2 py-1">
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-meta underline underline-offset-4 hover:text-accent"
                      onClick={() =>
                        void run(
                          () =>
                            adminFetch('/roster', {
                              method: 'PATCH',
                              body: { membershipId: row.id, verified: !row.verified },
                            }),
                          '확인 상태 변경됨',
                        )
                      }
                    >
                      {row.verified ? '확인 해제' : '확인'}
                    </button>
                    {row.leftAt ? null : (
                      <button
                        type="button"
                        className="cursor-pointer text-xs text-accent underline underline-offset-4"
                        onClick={() =>
                          void run(
                            () =>
                              adminFetch('/roster', {
                                method: 'PATCH',
                                body: { membershipId: row.id, leftAt: new Date().toISOString() },
                              }),
                            '로스터 종료됨 (기록은 남는다)',
                          )
                        }
                      >
                        로스터 종료
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="text-meta">playerId</div>
              <input
                className="w-48 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
                value={rosterForm.playerId}
                onChange={(event) =>
                  setRosterForm({ ...rosterForm, playerId: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              <div className="text-meta">등록 시작 (비우면 지금)</div>
              <input
                className="w-48 h-9 rounded border border-line bg-card-2 px-2 text-sm text-text transition-colors duration-100 placeholder:text-faint focus:border-accent focus:outline-none"
                placeholder="2026-08-01"
                value={rosterForm.joinedAt}
                onChange={(event) =>
                  setRosterForm({ ...rosterForm, joinedAt: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className="btn-line h-9 px-4 text-sm disabled:opacity-50"
              disabled={!rosterForm.playerId}
              onClick={() =>
                void run(async () => {
                  await adminFetch('/roster', {
                    method: 'POST',
                    body: {
                      leagueSlug: entry.league.slug,
                      clanSlug: slug,
                      playerId: rosterForm.playerId,
                      joinedAt: rosterForm.joinedAt || undefined,
                      verified: true,
                    },
                  })
                  setRosterForm({ ...rosterForm, playerId: '' })
                }, '로스터에 추가됨')
              }
            >
              로스터 추가
            </button>
          </div>
          <p className="mt-2 text-xs text-meta">
            로스터는 “이 선수를 우선 확인해야 한다”는 후보 목록이다. 등록만으로 출전 처리되지 않는다.
          </p>
        </AdminCard>
      ))}
    </>
  )
}

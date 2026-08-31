'use client'

/**
 * `/admin/eggs` — **알을 하나씩 깨 보는 화면** (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * ── 왜 있는가
 *   정상 경로는 «본인 인증 → 자기 알이 깨진다» 인데 그 인증(칭호 인증 · 사양 4장)이 아직 없다.
 *   그 사이에도 «깨진 화면» 을 눈으로 봐야 하므로 관리자가 강제로 깬다.
 *
 * ── ⚠ 여기서 깬 것은 **시험용이다. 진짜 근거가 아니다**
 *   서버가 `reason='admin'` 으로 남긴다. 인증 체계가 들어오면 그 기록만 골라 지우면 된다.
 *   그래서 화면에도 사유를 그대로 찍는다 — 나중에 «이건 왜 깨져 있지» 를 묻지 않게.
 *
 * ── 되돌릴 수 있다
 *   `되잠금` 을 누르면 기록이 지워지고 알이 다시 씌워진다. 그래서 `danger` 로 두지 않았다 —
 *   진홍 테두리는 되돌릴 수 없는 것에만 쓴다 (`AdminShell` 주석).
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminButton, AdminCard, AdminDenied, AdminInput, AdminSelect, Stat } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

type Kind = 'clan' | 'player'

interface EggRow {
  kind: Kind
  id: string
  name: string
  league: string
  leagueName: string
  division?: number
  mark?: string | null
  clanName?: string | null
  broken: boolean
  reason: string | null
  brokenAt: string | null
  note: string | null
}

/** 사유를 사람 말로. `admin` 만 눈에 띄게 둔다 — 그것이 「진짜가 아닌」 것이다 */
function reasonLabel(reason: string | null): { text: string; className: string } {
  switch (reason) {
    case 'admin':
      return { text: '관리자 강제', className: 'border-accent text-accent' }
    case 'verified':
      return { text: '본인 인증', className: 'border-line text-text' }
    case 'master':
      return { text: '클랜마스터', className: 'border-line text-text' }
    case 'quorum':
      return { text: '클랜원 30%', className: 'border-line text-text' }
    default:
      return { text: '잠김', className: 'border-line-soft text-faint' }
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AdminEggsPage() {
  const client = useQueryClient()
  const [kind, setKind] = useState<Kind>('clan')
  const [league, setLeague] = useState('')
  /* 입력 즉시 조회하지 않는다 — 500건짜리 질의를 글자마다 던지지 않기 위해서다 */
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['admin', 'eggs', kind, league, query],
    queryFn: () =>
      adminFetch<EggRow[]>(
        `/eggs?kind=${kind}&league=${encodeURIComponent(league)}&query=${encodeURIComponent(query)}`,
      ),
    retry: false,
  })

  const rows = list.data ?? []
  const brokenCount = rows.filter((row) => row.broken).length

  const toggle = useMutation({
    mutationFn: ({ row }: { row: EggRow }) =>
      adminFetch<unknown>(`/eggs/${row.kind}/${encodeURIComponent(row.id)}`, {
        method: row.broken ? 'DELETE' : 'POST',
        ...(row.broken ? {} : { body: { note: '관리자 화면에서 시험 삼아' } }),
      }),
    onSuccess: (_data, { row }) => {
      setMessage(`${row.name} — ${row.broken ? '다시 잠갔습니다' : '알을 깼습니다'}`)
      void client.invalidateQueries({ queryKey: ['admin', 'eggs'] })
      /* 공개 목록도 같이 갈아 준다 — 관리 화면과 실제 화면이 다르면 깬 줄 모른다 */
      void client.invalidateQueries({ queryKey: ['eggs', 'broken'] })
    },
    onError: (error: unknown) => setMessage(error instanceof Error ? error.message : '실패'),
  })

  if (list.error instanceof AdminError) return <AdminDenied message={list.error.message} />

  return (
    <>
      <AdminCard title="알 상태">
        <div className="flex flex-wrap gap-6">
          <Stat label="대상" value={rows.length} hint="최대 500건" />
          <Stat label="깨짐" value={brokenCount} />
          <Stat label="잠김" value={rows.length - brokenCount} />
        </div>
        <p className="mt-6 border-l-2 border-accent py-1 pl-4 text-xs leading-relaxed text-meta">
          여기서 깨는 것은 <strong className="text-text">시험용</strong>이다. 사유가{' '}
          <code className="text-accent">관리자 강제</code>로 남으므로, 나중에 칭호 인증이 들어오면 이
          기록만 골라 지우면 된다. 이미 인증으로 깨진 알은 다시 눌러도 사유가 덮이지 않는다.
        </p>
      </AdminCard>

      <AdminCard title="찾기">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <div className="text-meta">구분</div>
            <AdminSelect
              value={kind}
              onChange={(event) => setKind(event.target.value as Kind)}
              className="w-32"
            >
              <option value="clan">클랜</option>
              <option value="player">선수</option>
            </AdminSelect>
          </label>
          <label className="text-sm">
            <div className="text-meta">리그</div>
            <AdminSelect
              value={league}
              onChange={(event) => setLeague(event.target.value)}
              className="w-36"
            >
              <option value="">전체</option>
              <option value="supply">DPL</option>
              <option value="nolink">IPL</option>
              <option value="sanply">열산</option>
            </AdminSelect>
          </label>
          <label className="text-sm">
            <div className="text-meta">이름</div>
            <AdminInput
              value={queryInput}
              placeholder={kind === 'clan' ? '클랜명' : '닉네임'}
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setQuery(queryInput)
              }}
              className="w-48"
            />
          </label>
          <AdminButton onClick={() => setQuery(queryInput)}>검색</AdminButton>
        </div>
        {message ? <p className="mt-4 text-sm text-text">{message}</p> : null}
      </AdminCard>

      <AdminCard title={kind === 'clan' ? '클랜 알' : '선수 알'}>
        {list.isPending ? (
          <p className="text-sm text-meta">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-meta">해당하는 대상이 없습니다.</p>
        ) : (
          <>
            {/*
              ⚠ 모바일에서는 **표를 쓰지 않는다** (2026-09-01).
              처음엔 `min-w-[720px]` 표 하나로 만들었는데, 폰(390px)에서는
              **[깨기] 버튼이 화면 밖**에 있어 가로로 밀어야 닿았다.
              「관리자가 알을 하나 깨 본다」가 이 화면의 목적인데 그 버튼이 안 보였다.
              그래서 좁은 화면에서는 **한 줄에 한 명씩 쌓고 버튼을 바로 옆에** 둔다.
            */}
            <div className="md:hidden">
              {rows.map((row) => {
                const badge = reasonLabel(row.broken ? row.reason : null)
                const busy = toggle.isPending && toggle.variables?.row.id === row.id
                return (
                  <div
                    key={`m:${row.kind}:${row.id}`}
                    className="flex items-center gap-3 border-b border-line-soft py-3"
                  >
                    <div className="min-w-0 flex-grow">
                      <div className="truncate text-sm text-text-strong">{row.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-meta">
                        <span>{row.leagueName}</span>
                        <span>{kind === 'clan' ? `${row.division ?? '—'}부` : (row.clanName ?? '—')}</span>
                        <span className={`rounded border px-1.5 py-0.5 ${badge.className}`}>
                          {badge.text}
                        </span>
                      </div>
                    </div>
                    <AdminButton disabled={busy} onClick={() => toggle.mutate({ row })}>
                      {busy ? '…' : row.broken ? '되잠금' : '깨기'}
                    </AdminButton>
                  </div>
                )
              })}
            </div>

            {/* 넓은 화면에서는 그대로 표를 쓴다 — 한눈에 여럿을 견주기 좋다 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-meta">
                    <th className="py-2 pr-3 font-normal">이름</th>
                    <th className="py-2 pr-3 font-normal">리그</th>
                    <th className="py-2 pr-3 font-normal">{kind === 'clan' ? '부' : '클랜'}</th>
                    <th className="py-2 pr-3 font-normal">상태</th>
                    <th className="py-2 pr-3 font-normal">깨진 때</th>
                    <th className="py-2 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const badge = reasonLabel(row.broken ? row.reason : null)
                    const busy = toggle.isPending && toggle.variables?.row.id === row.id
                    return (
                      <tr key={`${row.kind}:${row.id}`} className="border-b border-line-soft">
                        <td className="py-2 pr-3 text-text-strong">{row.name}</td>
                        <td className="py-2 pr-3 text-meta">{row.leagueName}</td>
                        <td className="num py-2 pr-3 text-meta">
                          {kind === 'clan' ? (row.division ?? '—') : (row.clanName ?? '—')}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`rounded border px-2 py-0.5 text-xs ${badge.className}`}>
                            {badge.text}
                          </span>
                          {row.note ? <span className="ml-2 text-xs text-faint">{row.note}</span> : null}
                        </td>
                        <td className="num py-2 pr-3 text-xs text-faint">{formatDate(row.brokenAt)}</td>
                        <td className="py-2 text-right">
                          <AdminButton disabled={busy} onClick={() => toggle.mutate({ row })}>
                            {busy ? '…' : row.broken ? '되잠금' : '깨기'}
                          </AdminButton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>
    </>
  )
}

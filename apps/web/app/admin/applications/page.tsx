'use client'

/**
 * ★리그 참가 신청★ — 관리자 화면 (2026-09-14 사장님:
 * «신청방식은 내가 관리자 대시보드에서 볼 수 있게 해줘»).
 *
 * ── 무엇을 보여 주나
 *   대기가 맨 위다. 관리자가 볼 것은 ★처리할 것★ 이지 처리한 것이 아니다.
 *   줄마다 클랜명·리그·병영수첩과 다섯 자리 멤버가 그대로 있고, 병영수첩은
 *   ★새 창으로 열린다★ — 확인은 넥슨 쪽에서 해야 한다.
 *
 * ── 신청을 지우지 않는다
 *   승인·반려는 `status` 만 움직인다. 되돌릴 수 있게 «대기로» 도 둔다.
 *   메모는 신청자에게 안 보인다 — 관리자끼리 남기는 말이다.
 *
 * 권한 판정은 서버가 한다 (정책 22). 여기서 403 을 받으면 그대로 적는다.
 */
import { useCallback, useEffect, useState } from 'react'
import { APPLICATION_STATUS, APPLICATION_STATUS_LABEL } from '@sacloud/contract'
import { AdminError, adminFetch } from '../lib'

interface Member {
  position: string
  name: string
  url: string
}
interface Row {
  id: string
  league: string
  clan_name: string
  clan_url: string
  members: Member[]
  note: string | null
  status: number
  admin_note: string | null
  created_at: string
  handled_at: string | null
}
interface List {
  rows: Row[]
  total: number
  pending: number
}

const LEAGUE_LABEL: Readonly<Record<string, string>> = {
  nolink: 'IPL',
  supply: 'SPL',
  sanply: '10mountain',
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '전체' },
  { key: String(APPLICATION_STATUS.pending), label: '대기' },
  { key: String(APPLICATION_STATUS.accepted), label: '승인' },
  { key: String(APPLICATION_STATUS.rejected), label: '반려' },
]

export default function AdminApplicationsPage() {
  const [filter, setFilter] = useState('')
  const [data, setData] = useState<List | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await adminFetch<List>(`/applications${filter === '' ? '' : `?status=${filter}`}`))
    } catch (e) {
      setError(e instanceof AdminError ? e.message : '불러오지 못했습니다')
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(id: string, status: number) {
    setBusy(id)
    try {
      await adminFetch(`/applications/${id}/status`, { method: 'PATCH', body: { status } })
      await load()
    } catch (e) {
      setError(e instanceof AdminError ? e.message : '바꾸지 못했습니다')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="section-stack">
      <header className="flex items-baseline gap-3">
        <h1 className="display text-xl">리그 참가 신청</h1>
        {data === null ? null : (
          <span className="text-xs text-meta">
            전체 {data.total}건 · <b className="text-accent">대기 {data.pending}건</b>
          </span>
        )}
      </header>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`btn-line text-xs ${filter === f.key ? 'text-text-strong' : 'text-meta'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error === null ? null : <p className="text-sm text-accent">{error}</p>}

      {data === null ? (
        <p className="text-sm text-meta">불러오는 중…</p>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-meta">해당하는 신청이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.rows.map((row) => (
            <article key={row.id} className="border border-line-soft p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-bold text-accent">
                  {LEAGUE_LABEL[row.league] ?? row.league}
                </span>
                <a
                  href={row.clan_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-base font-bold text-text-strong underline decoration-line"
                >
                  {row.clan_name}
                </a>
                <span className="text-xs text-faint">
                  {APPLICATION_STATUS_LABEL[row.status] ?? row.status}
                </span>
                <div className="flex-1" />
                <span className="text-xs text-faint">{row.created_at.slice(0, 16).replace('T', ' ')}</span>
              </div>

              <ul className="mt-3 flex flex-col gap-1">
                {row.members.map((m) => (
                  <li key={m.position} className="flex items-baseline gap-2 text-xs">
                    <span className="w-12 shrink-0 font-bold text-meta">{m.position}</span>
                    <span className="text-text">{m.name}</span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-faint underline decoration-line"
                    >
                      {m.url}
                    </a>
                  </li>
                ))}
              </ul>

              {row.note === null ? null : (
                <p className="mt-3 text-xs leading-relaxed text-meta">남긴 말 — {row.note}</p>
              )}
              {row.admin_note === null ? null : (
                <p className="mt-1 text-xs leading-relaxed text-faint">관리자 메모 — {row.admin_note}</p>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy === row.id || row.status === APPLICATION_STATUS.accepted}
                  onClick={() => void setStatus(row.id, APPLICATION_STATUS.accepted)}
                  className="btn-line text-xs"
                >
                  승인
                </button>
                <button
                  type="button"
                  disabled={busy === row.id || row.status === APPLICATION_STATUS.rejected}
                  onClick={() => void setStatus(row.id, APPLICATION_STATUS.rejected)}
                  className="btn-line text-xs"
                >
                  반려
                </button>
                {row.status === APPLICATION_STATUS.pending ? null : (
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void setStatus(row.id, APPLICATION_STATUS.pending)}
                    className="btn-line text-xs text-meta"
                  >
                    대기로 되돌리기
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

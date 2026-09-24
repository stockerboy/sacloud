'use client'

/**
 * ★DB 관리★ — 「참여중인 리그」 옆 메뉴에 추가된 자리 (2026-09-24 사장님
 * 「db관리 이런것도 다 할 수 있는 전지전능 대시보드」).
 *
 * 무엇을 하는 화면인지, 무엇을 일부러 안 넣었는지는 `lib/server/admin/dbBrowser.ts`
 * 머리말에 적었다 — 여기는 그 표를 그대로 그린다.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AdminButton, AdminCard, AdminDenied, AdminInput } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

interface DbTableList {
  key: string
  label: string
  count: number
}

interface DbRow {
  [key: string]: unknown
}

interface DbTablePage {
  columns: string[]
  rows: DbRow[]
  total: number
  cursor: number
  size: number
}

interface DbRowDetail {
  row: DbRow | null
  adminScreenPath: string | null
}

const PAGE_SIZE = 20

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AdminDbPage() {
  const [table, setTable] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [qInput, setQInput] = useState('')
  const [cursor, setCursor] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const tables = useQuery({
    queryKey: ['admin', 'db', 'tables'],
    queryFn: () => adminFetch<{ tables: DbTableList[] }>('/db/tables'),
    retry: false,
  })

  const page = useQuery({
    queryKey: ['admin', 'db', table, q, cursor],
    queryFn: () =>
      adminFetch<DbTablePage>(
        `/db/tables/${table}?q=${encodeURIComponent(q)}&cursor=${cursor}&size=${PAGE_SIZE}`,
      ),
    enabled: table !== null,
    retry: false,
  })

  const detail = useQuery({
    queryKey: ['admin', 'db', table, 'row', openId],
    queryFn: () => adminFetch<DbRowDetail>(`/db/tables/${table}/${openId}`),
    enabled: table !== null && openId !== null,
    retry: false,
  })

  if (tables.error instanceof AdminError) return <AdminDenied message={tables.error.message} />
  if (!tables.data) return <div className="text-meta">불러오는 중…</div>

  const chooseTable = (key: string) => {
    setTable(key)
    setQ('')
    setQInput('')
    setCursor(0)
    setOpenId(null)
  }

  return (
    <>
      <AdminCard title="표 고르기">
        <div className="flex flex-wrap gap-2">
          {tables.data.tables.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => chooseTable(t.key)}
              className={`btn-line h-9 px-4 text-sm ${
                table === t.key ? 'border-accent text-text-strong' : ''
              }`}
            >
              {t.label} <span className="ml-1.5 text-faint">{t.count.toLocaleString('ko-KR')}</span>
            </button>
          ))}
        </div>
      </AdminCard>

      {table ? (
        <AdminCard title={tables.data.tables.find((t) => t.key === table)?.label ?? table}>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setQ(qInput)
              setCursor(0)
              setOpenId(null)
            }}
          >
            <AdminInput
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={tables.data?.tables.find((t) => t.key === table) ? '검색' : '검색'}
              className="w-64"
            />
            <AdminButton onClick={() => { setQ(qInput); setCursor(0); setOpenId(null) }}>찾기</AdminButton>
            {q ? (
              <AdminButton
                onClick={() => { setQ(''); setQInput(''); setCursor(0); setOpenId(null) }}
              >
                지우기
              </AdminButton>
            ) : null}
          </form>

          {page.error instanceof AdminError ? (
            <AdminDenied message={page.error.message} />
          ) : !page.data ? (
            <div className="text-meta">불러오는 중…</div>
          ) : page.data.rows.length === 0 ? (
            <div className="text-meta">결과가 없습니다.</div>
          ) : (
            <>
              <div className="mb-2 text-xs text-faint">
                {page.data.total.toLocaleString('ko-KR')}줄 중 {cursor + 1}~
                {Math.min(cursor + page.data.rows.length, page.data.total)}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-faint">
                      {page.data.columns.map((c) => (
                        <th key={c} className="px-3 py-2 font-normal">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.data.rows.map((row) => (
                      <tr
                        key={String(row.id)}
                        className="cursor-pointer border-b border-line-soft hover:bg-card-2"
                        onClick={() => setOpenId(openId === String(row.id) ? null : String(row.id))}
                      >
                        {page.data!.columns.map((c) => (
                          <td key={c} className="max-w-[220px] truncate px-3 py-2 text-text">
                            {cellText(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <AdminButton
                  disabled={cursor === 0}
                  onClick={() => { setCursor(Math.max(0, cursor - PAGE_SIZE)); setOpenId(null) }}
                >
                  이전
                </AdminButton>
                <AdminButton
                  disabled={cursor + page.data.rows.length >= page.data.total}
                  onClick={() => { setCursor(cursor + PAGE_SIZE); setOpenId(null) }}
                >
                  다음
                </AdminButton>
              </div>

              {openId ? (
                <div className="mt-6 rounded border border-line bg-card-2 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-bold text-text-strong">줄 전체 — {openId}</div>
                    {detail.data?.adminScreenPath ? (
                      <Link
                        prefetch={false}
                        href={detail.data.adminScreenPath}
                        target="_blank"
                        className="text-xs text-accent hover:underline"
                      >
                        이 줄을 고칠 수 있는 관리 화면 열기 →
                      </Link>
                    ) : null}
                  </div>
                  {!detail.data ? (
                    <div className="text-meta">불러오는 중…</div>
                  ) : !detail.data.row ? (
                    <div className="text-meta">찾을 수 없습니다.</div>
                  ) : (
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all text-xs text-text">
                      {JSON.stringify(detail.data.row, null, 2)}
                    </pre>
                  )}
                </div>
              ) : null}
            </>
          )}
        </AdminCard>
      ) : (
        <div className="text-meta">위에서 표를 고르면 목록이 뜹니다.</div>
      )}
    </>
  )
}

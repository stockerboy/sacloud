'use client'

/**
 * `/admin/clan-master-claims` — **클랜 마스터 인증 심사** (2026-09-01 · D-253).
 *
 * ── 사용자 지시
 *   *"마스터 인증하기 를 누르면 관리자 페이지에서 내가 직접 심사하고 승인 거부 결정한다."*
 *
 * ── 이 화면의 일은 하나다: **사진을 크게 보여 주는 것**
 *   판정 근거가 사진 하나뿐이다. 그래서 표에 사진을 작게 끼워 넣지 않고,
 *   행을 펼치면 **원본 크기로** 연다. 작게 보고 누르는 사고를 막는다.
 *
 * ── 사진은 행마다 따로 받는다
 *   목록 응답에는 경로(`image_url`)만 실린다. 200건 × 3MB 를 한 번에 보내지 않는다.
 *
 * ── 되돌릴 수 있다
 *   승인한 뒤에도 `해제` 로 되돌린다. 행을 지우지 않고 `revoked` 로 남긴다 —
 *   **왜 권한이 있었는지**를 나중에 설명할 수 있어야 한다.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminButton, AdminCard, AdminDenied, AdminInput, AdminSelect, Stat } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked'

interface ClaimRow {
  id: string
  status: string
  created_at: string
  note: string | null
  decided_at: string | null
  decision_note: string | null
  decided_by_email: string | null
  user: { id: string; username: string | null; email: string | null; nickname: string }
  clan: { id: string; slug: string; name: string }
  image_url: string | null
  image_byte_size: number | null
}

/** 상태를 사람 말로. `심사중` 만 눈에 띄게 둔다 — **손이 가야 하는 것**이 그것이다 */
function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'pending':
      return { text: '심사중', className: 'border-accent text-accent' }
    case 'approved':
      return { text: '승인', className: 'border-line text-text' }
    case 'rejected':
      return { text: '거부', className: 'border-line text-meta' }
    case 'cancelled':
      return { text: '취소', className: 'border-line-soft text-faint' }
    case 'revoked':
      return { text: '해제', className: 'border-line text-meta' }
    default:
      return { text: status, className: 'border-line-soft text-faint' }
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatBytes(value: number | null): string {
  if (value === null) return '—'
  return `${(value / 1024).toFixed(0)}KB`
}

/** 신청자 표시 — 아이디가 있으면 아이디, 없으면 이메일 (D-252 이후 가입은 아이디다) */
function userLabel(user: ClaimRow['user']): string {
  return user.username ?? user.email ?? user.id
}

export default function AdminClanMasterClaimsPage() {
  const client = useQueryClient()
  const [status, setStatus] = useState<Status>('pending')
  /** 펼친 행. **사진은 펼친 것만 받는다** */
  const [openId, setOpenId] = useState<string | null>(null)
  /** 거부 사유 입력. 행마다 따로 둔다 */
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['admin', 'clan-master-claims', status],
    queryFn: () => adminFetch<ClaimRow[]>(`/clan-master-claims?status=${status}`),
    retry: false,
  })

  const decide = useMutation({
    mutationFn: ({ row, action }: { row: ClaimRow; action: 'approve' | 'reject' | 'revoke' }) =>
      adminFetch<{ message: string }>(`/clan-master-claims/${row.id}`, {
        method: 'PATCH',
        body: { action, note: notes[row.id] ?? null },
      }),
    onSuccess: (data) => {
      setMessage(data.message)
      void client.invalidateQueries({ queryKey: ['admin', 'clan-master-claims'] })
    },
    onError: (error: unknown) => setMessage(error instanceof Error ? error.message : '실패'),
  })

  if (list.error instanceof AdminError) return <AdminDenied message={list.error.message} />

  const rows = list.data ?? []

  return (
    <>
      <AdminCard title="클랜 마스터 인증">
        <div className="flex flex-wrap gap-6">
          <Stat label="목록" value={rows.length} hint="최대 200건" />
        </div>
        <p className="mt-6 border-l-2 border-accent py-1 pl-4 text-xs leading-relaxed text-meta">
          판정 근거는 <strong className="text-text">사진 하나</strong>다. 넥슨은 「이 계정이 그
          클랜의 마스터인가」를 알려 주지 않는다. 승인하면 그 회원에게{' '}
          <strong className="text-text">그 클랜의 설정 권한</strong>이 열린다. 클랜 하나에 승인은{' '}
          <strong className="text-text">한 명</strong>뿐이다.
        </p>
      </AdminCard>

      <AdminCard title="찾기">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <div className="text-meta">상태</div>
            <AdminSelect
              className="mt-1"
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              <option value="pending">심사중</option>
              <option value="approved">승인</option>
              <option value="rejected">거부</option>
              <option value="cancelled">취소</option>
              <option value="revoked">해제</option>
            </AdminSelect>
          </label>
        </div>
        {message ? <p className="mt-4 text-sm text-text-strong">{message}</p> : null}
      </AdminCard>

      <AdminCard title="신청">
        {rows.length === 0 ? (
          <p className="text-sm text-meta">해당하는 신청이 없습니다.</p>
        ) : (
          <div className="text-sm">
            {rows.map((row) => {
              const badge = statusLabel(row.status)
              const open = openId === row.id
              return (
                <div key={row.id} className="border-b border-line-soft py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded border px-2 py-0.5 text-xs ${badge.className}`}>
                      {badge.text}
                    </span>
                    <span className="text-text-strong">{row.clan.name}</span>
                    <span className="text-xs text-faint">{row.clan.slug}</span>
                    <span className="text-meta">{userLabel(row.user)}</span>
                    <span className="num text-xs text-faint">{formatDate(row.created_at)}</span>
                    <span className="num text-xs text-faint">
                      {formatBytes(row.image_byte_size)}
                    </span>
                    <AdminButton onClick={() => setOpenId(open ? null : row.id)}>
                      {open ? '사진 접기' : '사진 보기'}
                    </AdminButton>
                  </div>

                  {row.note ? (
                    <p className="mt-2 text-xs leading-relaxed text-meta">
                      신청자 메모 — {row.note}
                    </p>
                  ) : null}
                  {row.decision_note ? (
                    <p className="mt-2 text-xs leading-relaxed text-meta">
                      처리 사유 — {row.decision_note}
                      {row.decided_by_email ? ` (${row.decided_by_email})` : ''}
                    </p>
                  ) : null}

                  {/* 사진은 펼친 행만 받는다. 목록에 미리 끼워 넣지 않는다 */}
                  {open ? (
                    row.image_url ? (
                      <img
                        src={row.image_url}
                        alt={`${row.clan.name} 마스터 인증 스크린샷`}
                        className="mt-4 w-auto max-w-full rounded border border-line"
                      />
                    ) : (
                      <p className="mt-4 text-xs text-accent">
                        사진이 없습니다. 사진 없는 신청은 승인할 수 없습니다.
                      </p>
                    )
                  ) : null}

                  {row.status === 'pending' ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <AdminInput
                        placeholder="사유 (거부하면 신청자에게 그대로 보인다)"
                        className="w-[360px]"
                        value={notes[row.id] ?? ''}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                      />
                      <AdminButton
                        disabled={decide.isPending || !row.image_url}
                        onClick={() => decide.mutate({ row, action: 'approve' })}
                      >
                        승인
                      </AdminButton>
                      <AdminButton
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ row, action: 'reject' })}
                      >
                        거부
                      </AdminButton>
                    </div>
                  ) : null}

                  {row.status === 'approved' ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <AdminInput
                        placeholder="해제 사유"
                        className="w-[360px]"
                        value={notes[row.id] ?? ''}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                      />
                      {/* 되돌리기는 권한을 뺏는 동작이다. 진홍 테두리로 둔다 */}
                      <AdminButton
                        tone="danger"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ row, action: 'revoke' })}
                      >
                        권한 해제
                      </AdminButton>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </AdminCard>
    </>
  )
}

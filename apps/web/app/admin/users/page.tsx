'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { AdminButton, AdminCard, AdminDenied, AdminInput, Stat } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

/**
 * ★회원 관리★ (2026-09-13 사장님: «관리자 페이지도 알잘딱갈센으로 만들고»).
 *
 * 회원가입과 서든 계정연동을 연 날 만들었다. 그 전까지 관리자 화면에서
 * **회원을 볼 자리가 없었다.**
 *
 * 한 줄에 담는 것 — 아이디 · 닉네임 · 연동 선수/클랜 · 칭호 도전 상태 · 글/댓글 수 · 가입일.
 * 할 수 있는 것 — 검색, 쪽 넘기기, 운영자 권한 올리기·내리기.
 *
 * ⚠ **정지·탈퇴 단추를 만들지 않았다.** `User` 표에 그런 칸이 없다 —
 *   없는 기능의 단추를 먼저 그려 두면 눌렀을 때 아무 일도 안 일어난다.
 *   (`lib/server/admin/users.ts` 머리말에 이유를 적어 두었다)
 */

interface UserRow {
  id: string
  username: string | null
  nickname: string
  email: string | null
  role: number
  createdAt: string
  player: { id: string; name: string } | null
  clan: { slug: string; name: string } | null
  titleChallenge: { status: string; expectedTitle: string; lastSeenTitle: string | null } | null
  postCount: number
  commentCount: number
}

interface UserList {
  rows: UserRow[]
  total: number
  adminCount: number
}

const PAGE_SIZE = 30

/** 칭호 도전 상태 → 사람 말. 서버가 주는 값 그대로를 화면에 내보내지 않는다 */
const CHALLENGE_TEXT: Readonly<Record<string, string>> = {
  pending: '진행중',
  verified: '완료',
  expired: '만료',
  exhausted: '시도초과',
  cancelled: '취소',
}

function linkText(row: UserRow): string {
  if (row.player) return '연동됨'
  if (row.titleChallenge) return CHALLENGE_TEXT[row.titleChallenge.status] ?? row.titleChallenge.status
  return '없음'
}

export default function AdminUsersPage() {
  /* 입력 칸과 실제 검색어를 나눈다 — 한 글자마다 서버를 두드리지 않는다 */
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const key = ['admin', 'users', q, offset] as const
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      adminFetch<UserList>(
        `/users?offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    retry: false,
  })

  const setRole = useMutation({
    mutationFn: (input: { userId: string; role: number }) =>
      adminFetch<{ role: number }>(`/users/${input.userId}/role`, {
        method: 'PATCH',
        body: { role: input.role },
      }),
    onSuccess: () => {
      setNotice(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    /* 막힌 이유(«마지막 운영자는 내릴 수 없습니다»)를 그대로 보여 준다 */
    onError: (error) => setNotice(error instanceof AdminError ? error.message : '실패했습니다'),
  })

  if (query.error instanceof AdminError) return <AdminDenied message={query.error.message} />

  const data = query.data
  const search = () => {
    setOffset(0)
    setQ(draft.trim())
  }

  return (
    <>
      <AdminCard title="회원">
        <div className="flex flex-wrap gap-4">
          <Stat label="검색 결과" value={data ? data.total : '…'} hint={q ? `“${q}”` : '전체'} />
          <Stat label="운영자" value={data ? data.adminCount : '…'} hint="role 2" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <AdminInput
            value={draft}
            placeholder="아이디 · 닉네임 · 이메일"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') search()
            }}
            className="w-64"
          />
          <AdminButton onClick={search}>검색</AdminButton>
          {q ? (
            <AdminButton
              onClick={() => {
                setDraft('')
                setQ('')
                setOffset(0)
              }}
            >
              초기화
            </AdminButton>
          ) : null}
        </div>

        {notice ? (
          <div className="mt-4 border-l-2 border-accent py-1 pl-4 text-sm text-text">{notice}</div>
        ) : null}
      </AdminCard>

      <AdminCard title="목록">
        {!data ? (
          <div className="text-meta">불러오는 중…</div>
        ) : data.rows.length === 0 ? (
          <div className="text-meta">해당하는 회원이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-meta">
                  <th className="py-2 pr-3 font-normal">아이디</th>
                  <th className="py-2 pr-3 font-normal">닉네임</th>
                  <th className="py-2 pr-3 font-normal">연동</th>
                  <th className="py-2 pr-3 font-normal">클랜</th>
                  <th className="py-2 pr-3 text-right font-normal">글</th>
                  <th className="py-2 pr-3 text-right font-normal">댓글</th>
                  <th className="py-2 pr-3 font-normal">가입</th>
                  <th className="py-2 font-normal">권한</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-line-soft align-middle">
                    <td className="py-2 pr-3 text-text-strong">{row.username ?? '—'}</td>
                    <td className="py-2 pr-3 text-text">{row.nickname}</td>
                    <td className="py-2 pr-3 text-meta">
                      {row.player ? (
                        <Link href={`/player/${row.player.id}`}>
                          {/* 색은 안쪽 span 이 가진다 — `a { color: inherit }` 가 유틸리티를 누른다 */}
                          <span className="text-text underline underline-offset-4">
                            {row.player.name}
                          </span>
                        </Link>
                      ) : (
                        linkText(row)
                      )}
                    </td>
                    <td className="py-2 pr-3 text-meta">{row.clan?.name ?? '—'}</td>
                    <td className="num py-2 pr-3 text-right text-text">{row.postCount}</td>
                    <td className="num py-2 pr-3 text-right text-text">{row.commentCount}</td>
                    <td className="num py-2 pr-3 text-faint">
                      {new Date(row.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="py-2">
                      {row.role === 2 ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded border border-accent px-1.5 text-xs text-text-strong">
                            운영자
                          </span>
                          <AdminButton
                            tone="danger"
                            disabled={setRole.isPending}
                            onClick={() => setRole.mutate({ userId: row.id, role: 0 })}
                          >
                            내리기
                          </AdminButton>
                        </div>
                      ) : (
                        <AdminButton
                          disabled={setRole.isPending}
                          onClick={() => setRole.mutate({ userId: row.id, role: 2 })}
                        >
                          운영자로
                        </AdminButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > PAGE_SIZE ? (
          <div className="mt-6 flex items-center gap-3 text-sm">
            <AdminButton
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
            >
              이전
            </AdminButton>
            <span className="num text-meta">
              {offset + 1} – {Math.min(offset + PAGE_SIZE, data.total)} / {data.total}
            </span>
            <AdminButton
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              다음
            </AdminButton>
          </div>
        ) : null}
      </AdminCard>
    </>
  )
}

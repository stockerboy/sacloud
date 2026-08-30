'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Skeleton, formatDate } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { MePanel } from './ui'

/** 내 정보 `/me`. */
export default function MePage() {
  const ready = useApiReady()

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet('meShow'),
    enabled: ready,
  })

  if (!me.data) return <Skeleton className="h-[200px] w-full" />
  const user = me.data.data

  return (
    <MePanel className="max-w-[720px]">
      <Row label="이메일" value={user.email} />
      <Row label="닉네임" value={user.nickname} />
      <Row
        label="이메일 인증"
        value={user.email_verified_at ? `완료 (${formatDate(user.email_verified_at)})` : '미완료'}
      />
      <Row
        label="서든어택 계정"
        value={
          user.player ? (
            <Link
              href={`/player/${user.player.id}`}
              className="text-text-strong underline underline-offset-4"
            >
              {user.player.name}
            </Link>
          ) : (
            <Link href="/me/link" className="text-text-strong underline underline-offset-4">
              연동하기
            </Link>
          )
        }
      />
      <Row label="가입일" value={formatDate(user.created_at)} />
    </MePanel>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    /* 행 구분은 아주 옅은 선 하나다. 표처럼 보이지 않게 한다 */
    <div className="flex border-b border-line-soft py-3.5 text-sm last:border-b-0">
      <div className="w-44 shrink-0 text-meta">{label}</div>
      <div className="grow text-text">{value}</div>
    </div>
  )
}

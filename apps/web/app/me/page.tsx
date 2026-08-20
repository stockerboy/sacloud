'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Skeleton, formatDate } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

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
    <div className="rounded bg-card px-6 py-6 shadow-card">
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
            <Link href={`/player/${user.player.id}`} className="underline">
              {user.player.name}
            </Link>
          ) : (
            <Link href="/me/link" className="underline">
              연동하기
            </Link>
          )
        }
      />
      <Row label="가입일" value={formatDate(user.created_at)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex border-b border-b-divider py-3 last:border-b-0">
      <div className="w-48 font-semibold">{label}</div>
      <div className="flex-grow">{value}</div>
    </div>
  )
}

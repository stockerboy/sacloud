'use client'

import { CLAIM_DOORS_OPEN } from '@sacloud/contract'
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
      {/*
        ⚠ ★이메일 인증 줄은 뺐다★ (2026-09-20 사장님: 「이거 이메일 인증없애」).
          ★기능을 지운 것이 아니다★ — `email_verified_at` 은 그대로 오고, 값도 그대로 있다.
          ★이 화면에서만★ 안 보인다. 우리는 메일을 보내지 않으므로 늘 「미완료」 였고,
          그러면 ★뭔가 덜 된 계정처럼 보인다.★ 되살리려면 이 주석을 지우고 아래를 켠다:

            <Row
              label="이메일 인증"
              value={user.email_verified_at ? `완료 (${formatDate(user.email_verified_at)})` : '미완료'}
            />
      */}
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
          ) : CLAIM_DOORS_OPEN ? (
            <Link href="/me/link">
              {/* 색·밑줄은 안쪽 span 이 가진다 (레이어 밖 `a` 규칙이 `<a>` 유틸리티를 누른다) */}
              <span className="text-text-strong underline underline-offset-4">연동하기</span>
            </Link>
          ) : (
            /* ★2026-09-03 (O-024) — 링크를 내렸다★
               **승인할 사람이 자리에 없다** (`O-008` ⑥). 누르면 기다리게만 된다.
               ⚠ 값은 그대로 보여 준다 — 「연동 안 됨」은 사실이다. 사실을 감추는 게 아니라
                 **없는 창구로 보내지 않는 것**이다. `CLAIM_DOORS_OPEN` 이 되돌린다 */
            <span className="text-meta">준비중</span>
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

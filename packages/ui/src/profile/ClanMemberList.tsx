import Link from 'next/link'
import type { ClanPlayer } from '@sacloud/contract'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/Skeleton'

/**
 * 클랜원 목록 (`/clan/{slug}/player`).
 *
 * 원본은 닉네임과 포지션 메모("2층", "B 사이트")를 함께 보여준다.
 * 클랜마스터는 별도 표기한다.
 * 표 컬럼 구성은 랭킹 표와 같은 뼈대(머리글 + 행)를 쓴다.
 */
export function ClanMemberList({
  members,
  loading,
  error,
}: {
  members?: readonly ClanPlayer[]
  loading?: boolean
  error?: boolean
}) {
  return (
    <div className="mt-10 border border-line">
      <div className="flex items-center border-b border-b-line py-2 text-meta">
        <div className="w-96 px-6">닉네임</div>
        <div className="flex-grow px-6">포지션</div>
      </div>
      {error ? (
        <EmptyState message="클랜원 목록을 불러오지 못했습니다." />
      ) : loading ? (
        <>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center border-b border-b-line bg-row py-3">
              <Skeleton className="mx-6 h-[25px] w-full" />
            </div>
          ))}
        </>
      ) : !members || members.length === 0 ? (
        <EmptyState message="클랜원이 없습니다." />
      ) : (
        members.map((member) => (
          <div
            key={member.id}
            className="flex items-center border-b border-b-line bg-row py-3 text-lg text-meta last:border-b-0"
          >
            <div className="w-96 px-6">
              <Link href={`/player/${member.id}`}>{member.name}</Link>
              {member.master ? <span className="ml-2 text-sm">클랜마스터</span> : null}
            </div>
            <div className="flex-grow px-6">{member.position ?? ''}</div>
          </div>
        ))
      )}
    </div>
  )
}

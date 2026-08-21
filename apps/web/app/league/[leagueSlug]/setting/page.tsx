'use client'

import { use, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LeagueClan } from '@sacloud/contract'
import { EXPEL_CONFIRM_PHRASE } from '@sacloud/contract'
import { ClanMark, ConfirmTypeToProceed, LoadMoreButton, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 리그 관리 `/league/{slug}/setting` — 리그 관리자 전용.
 *
 * 원본 관측 기능 (`docs/3rd-supply-structure.md` 6장)
 * - 클랜 초대 (넥슨 병영수첩 클랜 주소 입력 → 조회 → 초대링크 발급)
 * - 부리그 변경
 * - 클랜변경(승계) — 새 클랜 마스터의 수락 필요
 * - 클랜삭제 — 삭제대기 후 1주일 뒤 자동 삭제
 * - 추방 — `추방합니다` 입력 확인 필요, 되돌릴 수 없음
 *
 * 엔드포인트 경로·본문은 관측되지 않아 우리가 설계했다 (docs/DECISIONS.md D-003).
 * 화면 배치도 원본을 확인하지 못했다 `[미확인]` — 기능 구성만 맞췄다.
 */
function SettingBody({ leagueSlug }: { leagueSlug: string }) {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [inviteUrl, setInviteUrl] = useState('')
  const [expelTarget, setExpelTarget] = useState<LeagueClan | null>(null)

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
  })

  const clans = useCursorQuery<LeagueClan>('leagueClans', ['league', leagueSlug, 'clans'], {
    params: { leagueSlug },
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['league', leagueSlug] })

  const lookup = useMutation({
    mutationFn: () => apiSend('leagueClanLookup', { params: { leagueSlug }, body: { url: inviteUrl } }),
  })

  const invite = useMutation({
    mutationFn: (clanSlug: string) =>
      apiSend('leagueInvite', { params: { leagueSlug }, body: { clan_slug: clanSlug, division: 1 } }),
    onSuccess: refresh,
  })

  const changeDivision = useMutation({
    mutationFn: (input: { leagueClanId: string; division: number }) =>
      apiSend('leagueClanDivisionUpdate', {
        params: { leagueSlug, leagueClanId: input.leagueClanId },
        body: { division: input.division },
      }),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (leagueClanId: string) =>
      apiSend('leagueClanDelete', { params: { leagueSlug, leagueClanId } }),
    onSuccess: refresh,
  })

  const expel = useMutation({
    mutationFn: (leagueClanId: string) =>
      apiSend('leagueClanExpel', {
        params: { leagueSlug, leagueClanId },
        body: { confirm: EXPEL_CONFIRM_PHRASE },
      }),
    onSuccess: refresh,
  })

  if (!league.data || !infos.data) return <Skeleton className="mt-10 h-[300px] w-full" />

  const data = league.data.data
  const me = infos.data.data.user
  // 리그 관리자만 접근할 수 있다 (원본: 관리자 전용 화면)
  const isOwner = !!me && data.user?.id === me.id

  if (!isOwner) {
    // 갱신 중이면 아직 판정하지 않는다 — 방금 로그인한 관리자에게
    // "관리자만 접근할 수 있습니다"가 잠깐 스치는 것을 막는다.
    // (관리자일 때는 이 분기를 타지 않으므로 화면이 다시 마운트되지 않는다)
    if (infos.isFetching) return <Skeleton className="mt-10 h-[300px] w-full" />
    return (
      <div className="pc-container mt-10 rounded bg-card px-6 py-10 text-center shadow-card">
        <div className="text-xl">이 리그의 관리자만 접근할 수 있습니다.</div>
      </div>
    )
  }

  return (
    <div className="pc-container mt-10 pb-10">
      <div className="text-3xl">{data.name} 리그 관리</div>

      <section className="mt-6 rounded bg-card px-6 py-6 shadow-card">
        <div className="text-xl font-semibold">클랜 초대</div>
        <div className="mt-2 text-sm text-meta">
          넥슨 병영수첩의 클랜 주소를 붙여넣어 클랜을 찾은 뒤 초대합니다.
        </div>
        <div className="mt-3 flex items-center">
          <input
            value={inviteUrl}
            onChange={(event) => setInviteUrl(event.target.value)}
            placeholder="https://barracks.sa.nexon.com/clan/..."
            className="h-11 flex-grow rounded border border-line px-3"
          />
          <button
            type="button"
            disabled={!inviteUrl.trim() || lookup.isPending}
            onClick={() => lookup.mutate()}
            className="ml-3 h-11 w-24 rounded bg-more text-white disabled:opacity-60"
          >
            조회
          </button>
        </div>

        {lookup.data ? (
          <div className="mt-4 flex items-center rounded border border-line px-4 py-3">
            <ClanMark mark={lookup.data.data.mark} className="mr-2" alt={lookup.data.data.name} />
            <span className="font-semibold">{lookup.data.data.name}</span>
            <button
              type="button"
              onClick={() => invite.mutate(lookup.data.data.slug)}
              className="ml-auto h-9 w-24 rounded bg-more text-white"
            >
              초대
            </button>
          </div>
        ) : null}
        {lookup.isError ? <div className="mt-3 text-lose">클랜을 찾지 못했습니다.</div> : null}
        {invite.data ? (
          <div className="mt-3 text-sm">
            초대링크: <span className="underline">{invite.data.data.invite_url}</span>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded bg-card px-6 py-6 shadow-card">
        <div className="text-xl font-semibold">참여 클랜 관리</div>
        <div className="mt-4 border border-line">
          <div className="flex items-center border-b border-b-line py-2 text-meta">
            <div className="w-72 px-4">클랜</div>
            <div className="w-40 text-center">부리그</div>
            <div className="flex-grow text-center">작업</div>
          </div>
          {clans.loading ? (
            <Skeleton className="m-4 h-[25px]" />
          ) : (
            clans.items.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center border-b border-b-line bg-row py-3 last:border-b-0"
              >
                <div className="flex w-72 items-center px-4">
                  <ClanMark mark={entry.clan.mark} className="mr-2" alt={entry.clan.name} />
                  {entry.clan.name}
                </div>
                <div className="w-40 text-center">
                  <select
                    value={entry.division}
                    onChange={(event) =>
                      changeDivision.mutate({
                        leagueClanId: entry.id,
                        division: Number(event.target.value),
                      })
                    }
                    className="h-9 rounded border border-line bg-card px-2"
                  >
                    {Array.from({ length: data.division_count }, (_, index) => index + 1).map(
                      (division) => (
                        <option key={division} value={division}>
                          {division}부리그
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="flex flex-grow items-center justify-center">
                  <button
                    type="button"
                    onClick={() => remove.mutate(entry.id)}
                    className="mr-2 h-9 rounded border border-line px-3"
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpelTarget(entry)}
                    className="h-9 rounded border border-lose px-3 text-lose"
                  >
                    추방
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        {clans.hasMore ? (
          <LoadMoreButton onClick={clans.loadMore} loading={clans.loadingMore} />
        ) : null}
      </section>

      {expelTarget ? (
        <ConfirmTypeToProceed
          title={`${expelTarget.clan.name} 추방`}
          description="추방하면 되돌릴 수 없고 다시 참여할 수 없습니다."
          phrase={EXPEL_CONFIRM_PHRASE}
          actionLabel="추방"
          onCancel={() => setExpelTarget(null)}
          onConfirm={() => {
            expel.mutate(expelTarget.id)
            setExpelTarget(null)
          }}
        />
      ) : null}
    </div>
  )
}

export default function LeagueSettingPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  return (
    <AuthGuard>
      <SettingBody leagueSlug={leagueSlug} />
    </AuthGuard>
  )
}

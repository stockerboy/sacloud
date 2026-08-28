'use client'

import { use, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClanSummary, LeagueClan } from '@sacloud/contract'
import { EXPEL_CONFIRM_PHRASE } from '@sacloud/contract'
import {
  ClanMark,
  ConfirmTypeToProceed,
  divisionLabel,
  divisionUnit,
  LoadMoreButton,
  Skeleton,
} from '@sacloud/ui'
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
 *
 * ── 무소속리그 티어 편성 (D-165 · 사용자 지시로 추가된 신규 기능)
 *   무소속리그에서는 `부리그` 자리가 `티어`다. 값은 같은 `LeagueClan.division` 이고
 *   **표기만** 바뀐다. 그리고 초대 링크 대신 **관리자가 클랜을 직접 티어에 넣는다.**
 *   승강은 자동이 아니다 — 운영자가 고른 티어 그대로다 (D-104 ①).
 *   이 등록 칸은 무소속리그에서만 나온다. 공식리그 관리 화면은 원본 그대로 둔다.
 */
function SettingBody({ leagueSlug }: { leagueSlug: string }) {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [inviteUrl, setInviteUrl] = useState('')
  const [expelTarget, setExpelTarget] = useState<LeagueClan | null>(null)
  const [clanQuery, setClanQuery] = useState('')
  const [pickedClan, setPickedClan] = useState<ClanSummary | null>(null)
  const [registerTier, setRegisterTier] = useState(1)

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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['league', leagueSlug] })
    // 참여 클랜 목록은 별도 키다. 등록·이동 결과가 바로 보이려면 같이 무효화해야 한다
    void queryClient.invalidateQueries({ queryKey: ['league', leagueSlug, 'clans'] })
  }

  /** 클랜 자동완성 — 등록할 클랜을 이름·slug 로 찾는다 */
  const clanSearch = useQuery({
    queryKey: ['clans', 'search', clanQuery],
    queryFn: () => apiGet('clansSearch', { params: { q: clanQuery } }),
    enabled: ready && clanQuery.trim().length > 0,
  })

  const registerClan = useMutation({
    mutationFn: (input: { clanSlug: string; division: number }) =>
      apiSend('leagueClanRegister', {
        params: { leagueSlug },
        body: { clan_slug: input.clanSlug, division: input.division },
      }),
    onSuccess: () => {
      setPickedClan(null)
      setClanQuery('')
      refresh()
    },
  })

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

      {/* --- 무소속리그 전용: 티어 편성 (D-165). 공식리그 화면은 원본 그대로 둔다 --- */}
      {data.category === 'independent' ? (
        <section className="mt-6 rounded bg-card px-6 py-6 shadow-card">
          <div className="text-xl font-semibold">티어 등록</div>
          <div className="mt-2 text-sm text-meta">
            클랜을 찾아 1티어 ~ {data.division_count}티어 중 하나에 등록합니다. 티어는 성적으로
            자동으로 바뀌지 않습니다.
          </div>
          <div className="mt-3 flex items-center">
            <input
              value={clanQuery}
              onChange={(event) => {
                setClanQuery(event.target.value)
                setPickedClan(null)
              }}
              placeholder="클랜 이름 또는 영문이름"
              className="h-11 flex-grow rounded border border-line px-3"
            />
            <select
              value={registerTier}
              onChange={(event) => setRegisterTier(Number(event.target.value))}
              className="ml-3 h-11 rounded border border-line bg-card px-2"
            >
              {Array.from({ length: data.division_count }, (_, index) => index + 1).map((tier) => (
                <option key={tier} value={tier}>
                  {divisionLabel(tier, data.category)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pickedClan || registerClan.isPending}
              onClick={() =>
                pickedClan &&
                registerClan.mutate({ clanSlug: pickedClan.slug, division: registerTier })
              }
              className="ml-3 h-11 w-24 rounded bg-more text-white disabled:opacity-60"
            >
              등록
            </button>
          </div>

          {clanQuery.trim() && clanSearch.data ? (
            <div className="mt-3 border border-line">
              {clanSearch.data.data.length === 0 ? (
                <div className="px-4 py-3 text-meta">찾는 클랜이 없습니다.</div>
              ) : (
                clanSearch.data.data.slice(0, 10).map((clan) => (
                  <button
                    key={clan.id}
                    type="button"
                    onClick={() => setPickedClan(clan)}
                    className={`flex w-full items-center border-b border-b-line px-4 py-2 text-left last:border-b-0 ${
                      pickedClan?.id === clan.id ? 'bg-row font-semibold' : ''
                    }`}
                  >
                    <ClanMark mark={clan.mark} className="mr-2" alt={clan.name} />
                    <span className="truncate">{clan.name}</span>
                    <span className="ml-2 text-sm text-meta">{clan.slug}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
          {registerClan.isError ? (
            <div className="mt-3 text-lose">등록하지 못했습니다.</div>
          ) : null}
        </section>
      ) : null}

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
            {/* 무소속리그에서는 이 칸이 `티어`다. 값은 같은 division 이다 (D-165) */}
            <div className="w-40 text-center">{divisionUnit(data.category)}</div>
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
                          {divisionLabel(division, data.category)}
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

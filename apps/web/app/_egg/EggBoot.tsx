'use client'

/**
 * 「알」이 깨졌는지를 실제로 알아 오는 자리 (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * `packages/ui` 의 `EggProvider` 는 목록을 받기만 한다. **그 목록을 채우는 일은 여기서** 한다.
 *
 * ── 지금 알 수 있는 것 / 아직 없는 것
 * ```
 * 깨진 목록  `GET /eggs/broken` — DB(`EggBreak`)에 남은 것 전부 ← 관리자가 깬 것도 여기 온다
 * 개인 알    로그인한 사람이 연동한 선수 하나
 * 클랜 알    그 선수가 그 클랜의 **마스터**일 때만    ← 사양 3장의 "클랜마스터가 직접 깬다"
 * 30% 집계   없다. 누가 인증했는지를 저장하는 곳이 없다
 * 칭호 인증   없다. 사양 4장 — 넥슨 폴링(worker)과 DB 가 있어야 한다
 * ```
 *
 * ── 두 갈래를 **합친다**
 *   ① 서버에 남은 기록(`EggBreak`) — 관리자 강제 · 앞으로 들어올 인증 결과
 *   ② 지금 로그인한 사람의 임시 배선 — 아래 ①~③
 *   ②는 서버에 아무것도 남기지 않는다. 칭호 인증이 들어오면 ②를 지우고 ①만 남긴다.
 *   **그때 화면은 한 줄도 안 고친다.**
 *
 * ── ⚠ 지금의 `연동`은 **소유권 증명이 아니다**
 *   `GET /me/link` 는 닉네임으로 선수를 이어 줄 뿐, 그 계정이 본인 것인지 확인하지 않는다
 *   (`CLAUDE.md` 8장 「Phase 7에서 남긴 숙제」 · `/api/me/link` 주석).
 *   그래서 이 배선은 **사양 4장의 칭호 인증이 들어올 때까지 쓰는 임시 배선**이다.
 *   그때가 오면 아래 두 줄이 인증 결과를 읽는 것으로 바뀌고, **화면은 한 줄도 안 고친다.**
 *
 * ── 실패는 조용히 넘긴다
 *   비로그인이면 `/me/link` 가 401 이다. 그건 오류가 아니라 **알이 안 깨진 상태**다.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EggProvider, type EggKnowledge } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

const NONE: readonly string[] = []

export function EggBoot({ children }: { children: React.ReactNode }) {
  const ready = useApiReady()

  /* 0) 서버에 남은 깨짐 기록 — 로그인과 무관하다. 비로그인도 빛나는 마크를 본다 */
  const broken = useQuery({
    queryKey: ['eggs', 'broken'],
    queryFn: () => apiGet('eggsBroken'),
    enabled: ready,
    retry: false,
    /* 방금 깬 것이 안 보이면 «안 깨졌다» 로 읽힌다. 오래 들고 있지 않는다 */
    staleTime: 30_000,
  })

  /* 1) 나는 어느 선수인가 — 비로그인·미연동이면 여기서 끝이다 */
  const link = useQuery({
    queryKey: ['me', 'link', 'egg'],
    queryFn: () => apiGet('meLinkShow'),
    enabled: ready,
    retry: false,
  })

  const myPlayerId = link.data?.data.linked ? (link.data.data.player?.id ?? null) : null

  /* 2) 그 선수의 소속 클랜 */
  const me = useQuery({
    queryKey: ['player', myPlayerId, 'egg'],
    queryFn: () => apiGet('playerShow', { params: { playerId: myPlayerId as string } }),
    enabled: ready && myPlayerId !== null,
    retry: false,
  })

  const myClanSlug = me.data?.data.clan?.slug ?? null

  /* 3) 내가 그 클랜의 마스터인가 — 마스터면 **혼자서도** 클랜 알을 깬다 (사양 3장) */
  const clan = useQuery({
    queryKey: ['clan', myClanSlug, 'egg'],
    queryFn: () => apiGet('clanShow', { params: { clanSlug: myClanSlug as string } }),
    enabled: ready && myClanSlug !== null,
    retry: false,
  })

  const isMaster =
    myPlayerId !== null && clan.data?.data.master?.id === myPlayerId

  const serverPlayers = broken.data?.data.players
  const serverClans = broken.data?.data.clans

  const value = useMemo<EggKnowledge>(() => {
    const players = new Set(serverPlayers ?? NONE)
    const clans = new Set(serverClans ?? NONE)
    if (myPlayerId) players.add(myPlayerId)
    if (isMaster && myClanSlug) clans.add(myClanSlug)
    return {
      brokenPlayerIds: [...players],
      brokenClanSlugs: [...clans],
      /* 아직 물어보는 중이면 화면은 알을 씌운 채로 둔다 */
      loading: !ready || broken.isPending || link.isPending,
    }
  }, [serverPlayers, serverClans, myPlayerId, myClanSlug, isMaster, ready, broken.isPending, link.isPending])

  return <EggProvider value={value}>{children}</EggProvider>
}

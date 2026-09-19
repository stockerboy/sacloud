'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import type { EndpointKey } from '@sacloud/contract'
import { apiGet, type ApiGetOptions } from './api'
import { useApiReady } from '@/app/providers'

/**
 * 커서 기반 `더 불러오기` 목록.
 *
 * 원본은 페이지 번호가 없고 `metadata.cursor.next` 를 따라가는 방식만 쓴다.
 * (랭킹 20건 / 게시판 15건 단위 — `PAGE_SIZE`)
 */

interface CursorPage {
  metadata: { cursor: { prev: string | null; next: string | null } }
  data: unknown[]
}

export function useCursorQuery<T>(
  key: EndpointKey,
  queryKey: readonly unknown[],
  options: ApiGetOptions = {},
  /** 상위 쿼리(예: 클랜 상세)가 끝나야 필요한 params가 채워지는 경우 false로 대기시킨다 */
  enabled = true,
) {
  const ready = useApiReady()

  const query = useInfiniteQuery({
    queryKey,
    enabled: ready && enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiGet(key, {
        ...options,
        search: { ...options.search, cursor: pageParam ?? undefined },
      }) as Promise<CursorPage>,
    getNextPageParam: (last) => last.metadata.cursor.next,
  })

  const items = (query.data?.pages.flatMap((page) => page.data) ?? []) as T[]

  /**
   * ★「멈춰 선 것」을 「받아오는 중」이라고 말하지 않는다★
   * (2026-09-19 · 사장님: «이거 개인페이지 들어가서 최근경기 보면 스코어가 안떠»)
   *
   * ── 무슨 일이 있었나
   *   선수 상세의 「최근 경기」 칸이 ★「불러오는 중…」 에서 영영 멈춰★ 있었다.
   *   그 글자는 여기 `loading` 하나로만 정해지는데, 그 값이 `query.isPending` 이었다.
   *
   * ── ★`isPending` 하나로는 모자라다★ — 이 저장소가 ★두 번★ 겪은 함정이다
   *   `app/clan/[clanSlug]/layout.tsx` 의 긴 주석과 D-117 이 같은 말을 한다:
   *   ```
   *   pending=true error=false data=no status=pending fetch=paused
   *   ```
   *   조회가 실패해 재시도를 기다리는데 그 순간 연결이 끊겨 있으면
   *   react-query 가 재시도를 ★`paused`★ 로 세워 둔다. 그러면 `isPending` 이
   *   ★영영 참★ 이고 화면은 영원히 「불러오는 중…」 이다.
   *   (이 PC 는 문서보안 드라이버(i-Defense3 / KingsNet.sys)가 소켓을 끊는 일이 잦다 —
   *    `docs/DECISIONS.md:14522`. 그래서 「연결이 끊긴 순간」 이 남 일이 아니다.)
   *
   *   ★화면 둘(클랜 레이아웃·선수 레이아웃)은 고쳤는데 이 공용 훅만 안 고쳐져 있었다.★
   *   커서 목록을 쓰는 화면이 20곳이 넘으니 여기가 마지막 구멍이었다.
   *
   * ── ★`loading` 은 한 글자도 안 바꿨다★ (`CLAUDE.md` 1-4)
   *   이 훅을 쓰는 화면이 ★20곳이 넘는다.★ 여기서 뜻을 바꾸면 그 화면들이
   *   전부 같이 흔들린다 (멈춘 목록이 「없습니다」 로 바뀐다 — 그것도 거짓말이다).
   *   그래서 ★값을 하나 더 내보내기만 한다★ — `stalled`.
   *   고친 것은 ★선수 상세 화면 하나★ 다: 거기서 `stalled`·`error` 를 ★먼저★ 보고
   *   「불러오지 못했습니다 · 다시 시도」 를 그린다.
   *   나머지 화면은 아직 옛 동작 그대로다 (`docs/ORDERS.md` 감).
   *
   * ⚠ ★사장님 화면에서 셋 중 어느 쪽이었는지는 「모름」★ 이다. 운영 화면은 로그인 문
   *   (`middleware.ts`) 뒤에 있어 내가 직접 못 봤다. 다만 「불러오는 중…」 에서
   *   멈추는 길은 ★이 한 줄뿐★ 이고, 세 갈래(느리다·실패했다·멈춰 섰다) 가운데
   *   ★두 갈래가 아무 말도 못 하던 것★ 은 확실하다. 그 둘을 말하게 만들었다.
   */
  const paused = query.fetchStatus === 'paused'

  return {
    items,
    /** 첫 페이지를 아직 못 받은 상태 (옛 판 그대로 — 뜻을 바꾸지 않았다) */
    loading: !ready || query.isPending,
    /** 첫 페이지를 못 받았는데 ★재시도가 멈춰 서 있다★ (연결 끊김 등). 화면은 말을 해야 한다 */
    stalled: paused && query.isPending,
    error: query.isError,
    retry: () => void query.refetch(),
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  }
}

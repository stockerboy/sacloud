import { ApplyScreen } from './ApplyScreen'

/**
 * `/apply` — ★리그 참가 신청★ (2026-09-14 사장님).
 *
 * 로그인 없이 들어올 수 있는 화면이다. 소개 페이지(`/about`)의 마지막에서
 * 여기로 온다 — «어느 리그에 참가하시겠습니까».
 */
export const metadata = { title: '리그 참가 신청' }

/**
 * ★`?kind=` 를 받는다★ (2026-09-16 사장님 «리그참가신청버튼을 각 리그별로»).
 * 첫 화면의 리그별 단추가 종류를 실어 보내면 그 칸이 미리 골라진 채 열린다.
 * Next 15 에서 `searchParams` 는 ★약속(Promise)★ 이다 — 기다려서 읽는다.
 */
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const q = await searchParams
  const kind = typeof q.kind === 'string' ? q.kind : null
  return <ApplyScreen initialKind={kind} />
}

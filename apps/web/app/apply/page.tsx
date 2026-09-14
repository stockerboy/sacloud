import { ApplyScreen } from './ApplyScreen'

/**
 * `/apply` — ★리그 참가 신청★ (2026-09-14 사장님).
 *
 * 로그인 없이 들어올 수 있는 화면이다. 소개 페이지(`/about`)의 마지막에서
 * 여기로 온다 — «어느 리그에 참가하시겠습니까».
 */
export const metadata = { title: '리그 참가 신청' }

export default function ApplyPage() {
  return <ApplyScreen />
}

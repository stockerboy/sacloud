import { AboutScreen } from './AboutScreen'

/**
 * `/about` — ★사이트 소개★ (2026-09-14 사장님).
 *
 * 「기록 사이트가 아니라 경기·선수 분석 사이트다」 를 실제 기록으로 보여 준다.
 * 마지막이 «어느 리그에 참가하시겠습니까» 이고 `/apply` 로 이어진다.
 *
 * ★지금은 관리자만 본다★ (사장님: «빼기전에 일단 관리자로 로그인해서 나부터 볼 수 있게»).
 * 자물쇠는 `lib/aboutGate.ts` 의 `ABOUT_PUBLIC` 한 줄이다 — API 가 그 값을 본다.
 */
export const metadata = { title: 'SA CLOUD 소개' }

export default function AboutPage() {
  return <AboutScreen />
}

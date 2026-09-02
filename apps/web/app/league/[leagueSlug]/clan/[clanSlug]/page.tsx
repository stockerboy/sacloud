import LeagueClanRecordPage from './LeagueClanRecordScreen'

/**
 * `/league/{leagueSlug}/clan/{clanSlug}` **껍데기를 굳힌다** (2026-09-03 · O-016).
 *
 * 화면 코드는 **한 글자도 안 바뀌었다** — `LeagueClanRecordScreen.tsx` 가 그대로 그 파일이다.
 * 여기 있는 것은 **얇은 서버 껍데기** 하나뿐이다. 자세한 이유는
 * `app/player/[playerId]/page.tsx` 에 한 번만 적어 두었다. 요약하면
 *
 * ```
 * 전   ƒ  방문 한 번마다 람다가 깨어나 「모두에게 똑같은 빈 껍데기」를 만든다
 * 후   ●  첫 사람의 요청으로 껍데기가 만들어져 캐시된다. 그다음부터 람다가 안 깬다
 * ```
 *
 * ⚠ **재수출(`export default LeagueClanRecordPage`)로는 안 된다.** 그러면 Next 가 이 파일을
 *   클라이언트 경계로 보고 `generateStaticParams` 를 **한 번도 부르지 않는다.**
 *   실제로 그렇게 해 보고 빌드 로그로 확인했다. **진짜 서버 함수**여야 한다.
 */

/** 빈 배열이다 — 미리 만들 목록이 없다. 빌드에서 DB 를 보지 않는다 */
export function generateStaticParams(): { leagueSlug: string; clanSlug: string }[] {
  return []
}

/** 목록에 없는 값도 열린다. 첫 요청 때 만들어져 캐시된다 */
export const dynamicParams = true

export default function Page({ params }: { params: Promise<{ leagueSlug: string; clanSlug: string }> }) {
  return <LeagueClanRecordPage params={params} />
}

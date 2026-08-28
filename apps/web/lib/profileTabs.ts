/**
 * 리그 기록실 탭 구성.
 *
 * 원본 실측 (2026-08-27)
 * - 클랜: `기록실` `클랜원` `지난시즌` — **3개**
 * - 선수: `기록실` `지난시즌` — 2개
 *
 * 두 가지를 고쳤다.
 * 1. `클랜원` 탭이 빠져 있었다 (UI_PARITY_AUDIT 5-1). 화면(`.../clan/{slug}/player`)은
 *    이미 있었는데 탭 목록에만 없어서 들어갈 길이 없었다.
 * 2. `기본정보` 는 원본에서 **탭이 아니라 헤더의 버튼**이다. 탭에서 빼고
 *    `LeagueClanRecordHeader` / `LeaguePlayerRecordHeader` 로 옮겼다.
 *
 * 세 화면(기록실·클랜원·지난시즌)이 같은 목록을 써야 탭이 갈라지지 않으므로 여기 모은다.
 */

export interface ProfileTab {
  label: string
  href: string
}

export function leagueClanTabs(leagueSlug: string, clanSlug: string): readonly ProfileTab[] {
  const base = `/league/${leagueSlug}/clan/${clanSlug}`
  return [
    { label: '기록실', href: base },
    { label: '클랜원', href: `${base}/player` },
    { label: '지난시즌', href: `${base}/season` },
  ]
}

export function leaguePlayerTabs(leagueSlug: string, playerId: string): readonly ProfileTab[] {
  const base = `/league/${leagueSlug}/player/${playerId}`
  return [
    { label: '기록실', href: base },
    { label: '지난시즌', href: `${base}/season` },
  ]
}

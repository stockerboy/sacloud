import { EmptyState } from '../common/EmptyState'
import { sanitizeLeagueDescription } from './sanitize'

/**
 * 리그소개 — 리그 관리자가 저장한 HTML을 렌더한다.
 * 새니타이즈 정책은 `./sanitize.ts`에 있다 (테스트가 JSX를 끌어오지 않도록 분리했다).
 */
export function LeagueDescription({ html }: { html: string | null }) {
  const clean = html ? sanitizeLeagueDescription(html) : ''
  if (!clean.trim()) return <EmptyState message="등록된 리그소개가 없습니다." />

  return (
    <div
      className="border-b border-line-soft px-8 py-8 leading-relaxed text-text max-md:px-4"
      // sanitizeLeagueDescription 을 거친 문자열만 들어온다
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}

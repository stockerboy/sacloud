import { betaNoticeFor } from './betaNoticeText'

/**
 * 베타 시즌 안내.
 *
 * 리그홈 헤더 **바로 아래에 한 번만** 놓는다. 모든 페이지에 반복해 띄우지 않는다 —
 * 베타라는 사실은 서브내비 배지가 이미 상시로 알려 준다 (`BetaBadge`).
 *
 * 경고색(진홍)을 쓰지 않는다. 베타는 사고가 아니라 공개 운영 상태다.
 */
export function BetaNotice({
  seasonType,
}: {
  seasonType?: 'legacy' | 'beta' | 'official' | null
}) {
  const content = betaNoticeFor(seasonType)
  if (!content) return null

  return (
    <section
      className="border-b border-line-soft px-8 py-4 text-sm leading-6 max-md:px-4"
      aria-label={content.headline}
    >
      <p className="font-bold text-text-strong">{content.headline}</p>
      {content.lines.map((line) => (
        <p key={line} className="text-meta">
          {line}
        </p>
      ))}
    </section>
  )
}

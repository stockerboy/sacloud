import Link from 'next/link'

import { listBoards } from '@/lib/server/queries/boards'

/**
 * ★★메인의 Hot게시판★★ (2026-09-21 사장님: 「메인화면에 ★HOT게시판을 걸어★」)
 *
 * ── 무엇을 거나
 *   ★공지가 먼저, 그다음 Hot 글★ 이다. 사장님이 공지 넷을 여기 걸 예정이다 —
 *   CPL 모집 · IPL 기록 중단 · PL 삭제 · 사이트 소개.
 *
 * ── ★서버에서 그린다★
 *   상태가 없다. 글 목록 하나를 읽어 그대로 그린다 —
 *   브라우저가 다시 물어보지 않으므로 ★첫 그림에 글이 들어 있다.★
 *
 * ⚠ ★글이 없으면 이 구역을 통째로 안 그린다★ — 빈 상자를 남기지 않는다.
 */

/** 몇 줄까지 걸까 — 공지 넷 + Hot 몇 줄이면 메인에 알맞다 */
const ROWS = 6

interface Row {
  id: string
  title: string
  notice: boolean
  commentCount: number
  likeCount: number
  category: string
}

async function loadRows(): Promise<Row[]> {
  /* ★공지가 먼저다★ — 따로 읽어 맨 위에 붙인다 (게시판 목록과 같은 규칙) */
  const [notices, hot] = await Promise.all([
    listBoards({ category: 'notice', cursor: null, size: ROWS }).catch(() => null),
    listBoards({ category: 'hot', cursor: null, size: ROWS }).catch(() => null),
  ])

  const take = (page: Awaited<ReturnType<typeof listBoards>> | null, notice: boolean): Row[] =>
    (page?.items ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      notice,
      commentCount: b.comment_count ?? 0,
      likeCount: b.like_count ?? 0,
      category: notice ? 'notice' : (b.category ?? 'hot'),
    }))

  const rows = [...take(notices, true), ...take(hot, false)]
  return rows.slice(0, ROWS)
}

export async function HomeHotBoard() {
  const rows = await loadRows().catch(() => [])
  if (rows.length === 0) return null

  return (
    <section className="mt-[var(--section-gap)]">
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line-soft pb-2">
        <h2 className="text-[16px] font-bold text-text-strong">Hot게시판</h2>
        <Link
          prefetch={false}
          href="/board/hot"
          className="text-[12px] text-meta transition-colors hover:text-accent"
        >
          더 보기
        </Link>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line-soft last:border-b-0">
            <Link
              prefetch={false}
              href={`/board/${r.category}/${r.id}`}
              className="flex items-center gap-2 py-2.5 transition-colors hover:text-accent"
            >
              {r.notice ? (
                /* 공지 — 진홍 테두리 표식 하나. 넓은 면에 칠하지 않는다 */
                <span className="shrink-0 rounded-[var(--radius)] border border-accent px-1.5 py-0.5 text-[11px] text-accent">
                  공지
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[14px] text-text">{r.title}</span>
              {r.commentCount > 0 ? (
                <span className="shrink-0 font-num text-[12px] tabular-nums text-faint">
                  [{r.commentCount}]
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

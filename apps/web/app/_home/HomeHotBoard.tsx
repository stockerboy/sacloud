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

/**
 * ★몇 줄까지 거나★ — 2026-09-21 사장님: 「핫게시판 ★딱 이 정도 사이즈로 맞춰★
 * 장난하냐 저게 게시판이냐」. 원본 게시판은 ★열 줄★ 이다.
 * ⚠ 옛 값(6줄)은 아래에 남긴다 (`CLAUDE.md` 1-4).
 */
export const ROWS_V1 = 6
/** 2026-09-24 사장님 「우리는 8개를 핫게시물로 메인페이지에」 (옛 값 10 = ROWS_V2) */
export const ROWS_V2 = 10
/** ★핫 글 자체를 최대 몇 개까지★ (2026-09-26 사장님 「hot 게시물은 최대 8개까지」) — 공지는 이 수를 안 먹는다 (아래) */
const ROWS = 8
/**
 * ⚠ ★2026-09-26 폐지★ (사장님 「세번째 쓴 공지가 핫게로 안넘어와 메인화면에서」 —
 * 공지를 「무조건 누적」(같은 날 앞서 지시) 하기로 한 것과 이 상한이 부딪혔다. 공지
 * 셋째부터 여기서 잘렸다. 이제 공지는 ★전부★ 걸고, `ROWS` 예산은 안 먹는다(아래
 * `loadRows`) — 옛 값(2)은 지우지 않는다, 되돌리려면 `take(notices, true).slice(0, NOTICE_ROWS_MAX)`.
 */
export const NOTICE_ROWS_MAX = 2

interface Row {
  id: string
  title: string
  notice: boolean
  commentCount: number
  likeCount: number
  category: string
  /** 「09/23」 — 에타처럼 제목 밑에 날짜 */
  date: string
}

/** ISO → 「09/23」 (KST) */
function mmdd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const k = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${String(k.getUTCMonth() + 1).padStart(2, '0')}/${String(k.getUTCDate()).padStart(2, '0')}`
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
      date: mmdd(b.created_at),
    }))

  /*
   * ★공지는 전부 · Hot 글은 최대 ROWS개★ (2026-09-26 정정) — 공지가 셋 이상이면
   * 셋째부터 안 보이던 것을 고쳤다(위 NOTICE_ROWS_MAX 주석). 공지는 `ROWS` 예산을
   * 안 먹는다 — Hot 글 쪽만 여덟 개로 자른다.
   */
  return [...take(notices, true), ...take(hot, false).slice(0, ROWS)]
}

export async function HomeHotBoard() {
  const rows = await loadRows().catch(() => [])
  if (rows.length === 0) return null

  return (
    /* 2026-09-24 사장님 「게시판 위로 더 올려줘(피씨온리)」 — PC 만 --section-gap(40px)에서 28px 로. 폰은 그대로 */
    <section className="mt-[var(--section-gap)] md:mt-[28px]">
      {/* ★에타 「HOT 게시물」 카드★ (사장님 2026-09-24 사진) — 제목 · 밑에 날짜 · 오른쪽 👍 💬. 옛 판(줄 목록)은 HOME_HOT_ETA=false */}
      {HOME_HOT_ETA ? (
        <>
          {/* 2026-09-24 사장님 「게시판 글자 크기좀 줄여」(폰 캡쳐) — 폰만 줄인다(max-md:). PC 는 그대로 */}
          <div className="flex items-baseline justify-between px-1 pb-3">
            {/* 2026-09-25 사장님 「이 임티 달아줘」(🔥) */}
            <h2 className="text-[22px] font-black tracking-tight text-text-strong max-md:text-[18px]"><span className="mr-1.5">HOT</span><span className="font-bold">게시물</span><span className="ml-1.5">🔥</span></h2>
            <Link prefetch={false} href="/board/hot" className="text-[13px] text-meta transition-colors hover:text-accent max-md:text-[12px]">더 보기 ›</Link>
          </div>
          <ul className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1c1c1c]">
            {rows.map((r) => (
              <li key={r.id} className="border-b border-[#2a2a2a] last:border-b-0">
                <Link prefetch={false} href={`/board/${r.category}/${r.id}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#242424] max-md:px-4 max-md:py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-[#f2f2f2] max-md:text-[13.5px]">{r.notice ? <span className="mr-1.5 text-[#5c80e0]">[공지]</span> : null}{r.title}</span>
                    <span className="mt-1 block text-[13px] text-[#8a8a8a] max-md:text-[11px]">{r.date}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-[15px] font-bold tabular-nums max-md:text-[12.5px] max-md:gap-2">
                    <span className="inline-flex items-center gap-1 text-[#ff5a4a]"><ThumbGlyph />{r.likeCount}</span>
                    <span className="inline-flex items-center gap-1 text-[#3cc6c6]"><BubbleGlyph />{r.commentCount}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
      <div className="rounded-[var(--radius)] border border-line-soft">
        <div className="flex items-baseline justify-between gap-4 border-b border-line-soft px-4 py-3">
          <h2 className="text-[17px] font-bold text-text-strong">HOT게시판</h2>
          <Link
            prefetch={false}
            href="/board/hot"
            className="text-[12.5px] text-meta transition-colors hover:text-accent"
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
                className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:text-accent"
              >
                {r.notice ? (
                  <span className="shrink-0 rounded-[var(--radius)] border border-accent px-1.5 py-0.5 text-[11px] leading-none text-accent">
                    공지
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-[15px] text-text">{r.title}</span>
                {r.commentCount > 0 ? (
                  <span className="shrink-0 font-num text-[12.5px] tabular-nums text-faint">
                    [{r.commentCount}]
                  </span>
                ) : null}
                {r.likeCount > 0 ? (
                  <span className="shrink-0 font-num text-[12.5px] tabular-nums text-meta">
                    ♥{r.likeCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      )}
    </section>
  )
}

const HOME_HOT_ETA = true

function ThumbGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 7h3v7H2zM5 7l3-5c1 0 2 .8 2 2v3h3.2c.9 0 1.5.8 1.3 1.6l-1 4.4c-.1.6-.6 1-1.2 1H5" strokeLinejoin="round" />
    </svg>
  )
}
function BubbleGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 3h12v8H7l-3.5 3V11H2z" strokeLinejoin="round" />
    </svg>
  )
}

import { ClanMark } from '@sacloud/ui'
import { restoreClanMark } from '@sacloud/contract'

/**
 * ★★무소속 14 vs 서플라이 14★★ (2026-09-21~22 사장님)
 *
 * > 「CPL 14개 PL14개니까 ★둘이 대결구도 존나 간지나게★ 만들어
 * >  ★마크를 양쪽에 두고 vs★ 이런식으로
 * >  ★무소속은 무소속섹터에 서플라이는 서플라이 섹터에★ 따로 두고 둘이 비교되게끔 진열해」
 * > 「서플라이 클랜이랑 무소속 클랜 ★두 섹터로 나눠서 분리하고 vs로 대결구도처럼★ 만들어줘」
 *
 * ── 어떻게 세우나
 *   ```
 *   무소속                    VS                    서플라이
 *   ⬤ sometimes           │              -tsAr.nTc ⬤
 *   ⬤ grave               │              One.PoinT ⬤
 *   ```
 *   ★가운데 세로선★ 을 두고 왼쪽은 마크가 이름 앞, 오른쪽은 이름 뒤다 —
 *   두 줄이 ★가운데를 마주 보게★ 서서 대결로 읽힌다.
 *
 * ── ⚠ ★폰에서도 마주 본다★ (2026-09-22 고침)
 *   처음에는 폰에서 두 섹터를 위아래로 쌓았다. 그러면 ★대결로 안 보인다★ —
 *   사장님이 보신 것이 그 모습이다. 대신 ★마크와 글자를 줄이고 이름을 자른다★.
 *   한 줄에 마크 둘 + 이름 둘이 390px 안에 들어간다.
 *
 * ⚠ ★어느 쪽도 아닌 클랜은 밑에 따로 둔다★ — 진영을 지어내지 않는다 (D-106).
 */

export interface WallClan {
  slug: string
  name: string
  bg: string | null
  front: string | null
}

/** 무소속 쪽 색 — 금빛 */
const LEFT_TONE = '#ffd83d'
/** 서플라이 쪽 색 — 푸른빛 */
const RIGHT_TONE = '#9cc0ff'

export function VersusWall({
  left,
  right,
  other = [],
}: {
  left: WallClan[]
  right: WallClan[]
  other?: WallClan[]
}) {
  const rows = Math.max(left.length, right.length)
  if (rows === 0 && other.length === 0) return null

  return (
    <section className="mt-10">
      {/* ── 머리 — 두 진영 이름과 VS ─────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line-soft pb-3 sm:gap-3">
        <div className="min-w-0 text-left">
          <div
            className="truncate text-[14px] font-extrabold sm:text-[16px]"
            style={{ color: LEFT_TONE }}
          >
            무소속
          </div>
          <div className="font-num text-[11.5px] tabular-nums text-faint sm:text-[12px]">
            {left.length}곳
          </div>
        </div>
        <div
          className="px-1 text-[20px] font-extrabold italic leading-none tracking-[.06em] text-text-strong sm:px-3 sm:text-[26px]"
          aria-label="대"
        >
          VS
        </div>
        <div className="min-w-0 text-right">
          <div
            className="truncate text-[14px] font-extrabold sm:text-[16px]"
            style={{ color: RIGHT_TONE }}
          >
            서플라이
          </div>
          <div className="font-num text-[11.5px] tabular-nums text-faint sm:text-[12px]">
            {right.length}곳
          </div>
        </div>
      </div>

      {/* ── 줄 — 가운데 선을 마주 본다 (폰에서도 그대로) ───────── */}
      <ul className="mt-1 flex flex-col">
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line-soft py-2 last:border-b-0 sm:gap-3 sm:py-2.5"
          >
            <Side clan={left[i]} align="left" tone={LEFT_TONE} />
            {/* 가운데 세로선 — 두 진영을 가르는 자리 */}
            <span aria-hidden className="h-5 w-px bg-line sm:h-6" />
            <Side clan={right[i]} align="right" tone={RIGHT_TONE} />
          </li>
        ))}
      </ul>

      {/* ── 어느 쪽도 아닌 클랜 — ★진영을 지어내지 않는다★ ────── */}
      {other.length > 0 ? (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline gap-2 border-b border-line-soft pb-1.5">
            <span className="text-[13px] font-bold text-meta">그 밖의 참가 클랜</span>
            <span className="font-num text-[11.5px] tabular-nums text-faint">
              {other.length}곳
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4">
            {other.map((c) => (
              <li key={c.slug} className="flex min-w-0 items-center gap-1.5">
                <ClanMark mark={restoreClanMark({ bg: c.bg, front: c.front })} size="sm" />
                <span className="min-w-0 truncate text-[13px] text-text">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function Side({
  clan,
  align,
  tone,
}: {
  clan: WallClan | undefined
  align: 'left' | 'right'
  tone: string
}) {
  /* 한쪽이 한 곳 더 많을 때 — ★빈 자리를 티 내지 않는다★ */
  if (clan === undefined) return <span />

  /* ★클랜명 앞에는 반드시 마크★ (사장님 상시 지시) — 오른쪽 진영은 마주 보도록 뒤에 */
  const mark = <ClanMark mark={restoreClanMark({ bg: clan.bg, front: clan.front })} size="sm" />
  const name = (
    <span
      className="min-w-0 truncate text-[13px] font-semibold sm:text-[15px]"
      style={{ color: tone }}
    >
      {clan.name}
    </span>
  )
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${align === 'right' ? 'justify-end' : ''}`}
    >
      {align === 'left' ? (
        <>
          {mark}
          {name}
        </>
      ) : (
        <>
          {name}
          {mark}
        </>
      )}
    </span>
  )
}

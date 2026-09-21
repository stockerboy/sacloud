import { ClanMark } from '@sacloud/ui'
import { restoreClanMark } from '@sacloud/contract'

/**
 * ★★무소속 14 vs 서플라이 14★★ (2026-09-21 사장님)
 *
 * > 「CPL 14개 PL14개니까 ★둘이 대결구도 존나 간지나게★ 만들어
 * >  ★마크를 양쪽에 두고 vs★ 이런식으로
 * >  ★무소속은 무소속섹터에 서플라이는 서플라이 섹터에★ 따로 두고 둘이 비교되게끔 진열해」
 *
 * ── 어떻게 세우나
 *   ```
 *   무소속                    VS                    서플라이
 *   ⬤ sometimes                              -tsAr.nTc ⬤
 *   ⬤ grave                                  One.PoinT ⬤
 *   …                                                …
 *   ```
 *   ★가운데 세로선★ 을 두고 왼쪽은 마크가 이름 앞, 오른쪽은 이름 뒤다 —
 *   두 줄이 ★가운데를 마주 보게★ 서서 대결로 읽힌다.
 *
 * ⚠ ★폰에서는 두 칸이 위아래로 쌓인다★ — 390px 에 마크 둘과 이름 둘을 넣으면
 *   이름이 잘린다 (사장님이 랭킹에서 「가려지네 닉네임」 으로 잡으신 그 병).
 *   대신 섹터 제목을 각각 붙여 ★어느 쪽인지★ 는 잃지 않는다.
 */

export interface WallClan {
  slug: string
  name: string
  bg: string | null
  front: string | null
}

export function VersusWall({ left, right }: { left: WallClan[]; right: WallClan[] }) {
  const rows = Math.max(left.length, right.length)
  if (rows === 0) return null

  return (
    <section className="mt-10">
      {/* ── 머리 — 두 진영 이름과 VS ─────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line-soft pb-3">
        <div className="text-left">
          <div className="text-[15px] font-extrabold text-[#ffd83d]">무소속</div>
          <div className="font-num text-[12px] tabular-nums text-faint">{left.length}곳</div>
        </div>
        <div className="px-2 text-[22px] font-extrabold italic tracking-[.06em] text-text-strong">
          VS
        </div>
        <div className="text-right">
          <div className="text-[15px] font-extrabold text-[#9cc0ff]">서플라이</div>
          <div className="font-num text-[12px] tabular-nums text-faint">{right.length}곳</div>
        </div>
      </div>

      {/* ── 줄 — 가운데 선을 마주 본다 (PC) ───────────────────── */}
      <ul className="mt-2 hidden flex-col md:flex">
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line-soft py-2 last:border-b-0"
          >
            <Side clan={left[i]} align="left" tone="#ffd83d" />
            <span aria-hidden className="h-5 w-px bg-line" />
            <Side clan={right[i]} align="right" tone="#9cc0ff" />
          </li>
        ))}
      </ul>

      {/* ── 폰 — 두 진영을 위아래로 ───────────────────────────── */}
      <div className="mt-3 flex flex-col gap-5 md:hidden">
        <Sector title="무소속" tone="#ffd83d" clans={left} />
        <Sector title="서플라이" tone="#9cc0ff" clans={right} />
      </div>
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
  if (clan === undefined) return <span />
  const mark = (
    <ClanMark mark={restoreClanMark({ bg: clan.bg, front: clan.front })} size="sm" />
  )
  const name = (
    <span className="min-w-0 truncate text-[14px] font-semibold" style={{ color: tone }}>
      {clan.name}
    </span>
  )
  return (
    <span
      className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}
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

function Sector({
  title,
  tone,
  clans,
}: {
  title: string
  tone: string
  clans: WallClan[]
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2 border-b border-line-soft pb-1.5">
        <span className="text-[14px] font-extrabold" style={{ color: tone }}>
          {title}
        </span>
        <span className="font-num text-[11.5px] tabular-nums text-faint">{clans.length}곳</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
        {clans.map((c) => (
          <li key={c.slug} className="flex min-w-0 items-center gap-1.5">
            <ClanMark mark={restoreClanMark({ bg: c.bg, front: c.front })} size="xs" />
            <span className="min-w-0 truncate text-[13px] text-text">{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

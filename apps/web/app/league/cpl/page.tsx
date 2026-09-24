import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { prisma } from '@sacloud/db'
import { cplSectorOf } from '@sacloud/contract'
import { VersusWall } from './VersusWall'
import { CplGuideLegacy } from './CplGuideLegacy'

/**
 * Supply 2.0(옛 CPL) 안내 페이지.
 *
 * ★2026-09-24 사장님 「서플라이 2.0 설명서 좀 바꿔 훨씬 간략하게」★ — 사장님이 적어 주신 여섯 줄 그대로다:
 * ```
 *   Supply 2.0
 *   시즌1 10/1~2/1
 *   10/1-11/1 배치고사 및 자격미달 클랜 탈락
 *   리그 참가 신청서(자격제한 있음)
 *   무소속 3부 서플라이 1부 2부 상관없이 신청 가능
 *   심사 후 승인
 * ```
 * 옛 긴 설명서(시즌 cloud1/2 · 알려드립니다 · 대학생 문구)는 `CplGuideLegacy.tsx` 에 그대로 있다 — 아래 스위치를 false 로 두면 돌아온다.
 */
const CPL_GUIDE_SHORT = true

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Supply 2.0 — 모집중 | log in SA CLOUD',
  description:
    'Supply 2.0 시즌1 은 2026년 10월 1일 ~ 2027년 2월 1일. 10/1~11/1 배치고사. 무소속·3부·서플라이 1부·2부 상관없이 신청, 심사 후 승인.',
}

/** 참가 클랜 한 줄에 필요한 것만 */
interface Entry {
  slug: string
  name: string
  bg: string | null
  front: string | null
}

async function loadClans(): Promise<Entry[]> {
  const rows = await prisma.leagueClan.findMany({
    /* ★내린 클랜은 안 보인다★ — 지운 게 아니라 `expelledAt` 만 찍힌 것이다 */
    where: { league: { slug: 'cpl' }, expelledAt: null, clan: { active: true } },
    select: {
      clan: { select: { slug: true, name: true, markBgUrl: true, markFrontUrl: true } },
    },
  })
  return rows
    .map((r) => ({
      slug: r.clan.slug,
      name: r.clan.name,
      bg: r.clan.markBgUrl,
      front: r.clan.markFrontUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export default async function CplPage() {
  const clans = await loadClans()

  return (
    <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 pb-16 pt-6">
      {/* ── 머리 — 로고와 상태 ─────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-line-soft pb-6">
        <div className="flex flex-wrap items-center gap-4">
          <Image
            src="/brand/league-cpl.webp"
            alt="Supply 2.0"
            width={640}
            height={129}
            priority
            className="h-[42px] w-auto md:h-[56px]"
          />
          <span className="text-[22px] font-black tracking-[-.01em] text-text-strong md:text-[26px]">Supply 2.0</span>
          {/* ★사장님이 정하신 말★ — 「개막전」 이 아니라 「모집중」 이다 */}
          <span className="rounded-[var(--radius)] border border-[#ffd83d] px-2.5 py-1 text-[12px] font-bold tracking-[.08em] text-[#ffd83d]">
            모집중
          </span>
        </div>
      </header>

      {CPL_GUIDE_SHORT ? (
        <>
          {/* ── 사장님 여섯 줄 — 더 보태지 않는다 ─────────────────── */}
          <section className="mt-8 grid gap-3 md:grid-cols-2">
            <Card k="시즌 1" v="2026. 10. 1 ~ 2027. 2. 1" />
            <Card k="배치고사" v="10. 1 ~ 11. 1" sub="자격미달 클랜은 탈락" />
            <Card k="참가 신청서" v="자격제한 있음" sub="무소속 · 3부 · 서플라이 1부 · 2부 상관없이 신청 가능" />
            <Card k="승인" v="심사 후 승인" />
          </section>

          <div className="mt-6">
            <Link
              prefetch={false}
              href="/apply?kind=cpl-new"
              className="inline-flex items-center rounded-[var(--radius)] border border-[#ffd83d] bg-[#ffd83d] px-5 py-2.5 text-[15px] font-bold text-[#1a1204] transition-opacity hover:opacity-90"
            >
              리그 참가 신청서 쓰기
            </Link>
          </div>
        </>
      ) : (
        <CplGuideLegacy />
      )}

      {/* ── 참가 클랜 — ★두 진영이 마주 본다★ ──────────────────── */}
      <VersusWall
        left={clans.filter((c) => cplSectorOf(c.slug) === 'independent')}
        right={clans.filter((c) => cplSectorOf(c.slug) === 'supply')}
        other={clans.filter((c) => cplSectorOf(c.slug) === null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ 부품 --- */

function Card({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-[10px] border border-line-soft bg-card px-4 py-3.5">
      <div className="text-[12px] font-bold tracking-[.06em] text-[#ffd83d]">{k}</div>
      <div className="mt-1 font-num text-[18px] font-extrabold tabular-nums text-text-strong">{v}</div>
      {sub ? <div className="mt-1 text-[13px] leading-[1.6] text-meta">{sub}</div> : null}
    </div>
  )
}

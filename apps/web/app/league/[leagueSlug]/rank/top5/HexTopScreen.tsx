'use client'

/**
 * ★분야별 TOP5★ — 육각 여섯 축마다 그 리그의 다섯 손가락 (2026-09-14 사장님).
 *
 *   «추가로 페이지 하나 더 만들자 여기서는 클랜 , 개인6각 top5 보여주자 각 분야별 top5»
 *
 * ── 이 화면이 하는 말
 *   종합 순위는 이미 랭킹 탭이 한다. 여기는 ★«세이브는 누가 제일 잘하나»★ 다.
 *   그래서 ★축이 먼저★ 이고 순위가 그 아래다. 기록 사이트가 아니라 분석 사이트라는
 *   사장님 말씀이 이 화면의 뜻이다.
 *
 * ── 판정을 여기서 하지 않는다
 *   다섯 줄을 고르는 일도, 값을 글자로 만드는 일도 서버가 이미 끝냈다.
 *   화면은 ★받은 대로 그린다.★ 화면이 또 세면 랭킹 탭과 다른 말을 하게 된다.
 *
 * ── 자리가 안 차면 안 찬 대로
 *   표본이 모자라 못 잰 줄은 애초에 안 온다 (D-106). 다섯 칸을 «-» 로 채우지 않는다.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { HexTopAxis, HexTopRow } from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
import {
  Card,
  CardHead,
  MarkCircle,
  V3,
  leagueClanPath,
  leaguePlayerPath,
  rankColor,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

type Side = 'clan' | 'player'

export function HexTopScreen({
  leagueSlug,
  /**
   * ★홈 안에 얹을 때는 머리글을 끈다★ (2026-09-15 사장님: «각리그 홈에다가 top5를 합쳐줘»).
   * 홈은 이미 자기 제목을 갖고 있어서, 여기 h1 이 또 나오면 제목이 둘이 된다.
   */
  embedded = false,
}: {
  leagueSlug: string
  embedded?: boolean
}) {
  const ready = useApiReady()
  const showsClan = leagueScreen(leagueSlug).clanRank
  const [side, setSide] = useState<Side>(showsClan ? 'clan' : 'player')

  const top = useQuery({
    queryKey: ['league', leagueSlug, 'hex-top'],
    queryFn: () => apiGet('leagueHexTop', { params: { leagueId: leagueSlug } }),
    enabled: ready,
  })

  const axes: HexTopAxis[] = (side === 'clan' ? top.data?.data.clan : top.data?.data.player) ?? []

  /*
   * ★축을 가로 탭으로★ (2026-09-15 · 무한 QA ①).
   *
   * 여섯 축을 한꺼번에 펼치니 홈이 6,834px 이 됐다 — 폰에서 스크롤 아홉 번이다.
   * 사장님은 «10명을 다 분석하는 게 너무 정신없» 다고 하신 성향이라, 한 번에
   * ★한 축만★ 보여 준다. 세로가 6분의 1로 준다.
   *
   * ⚠ ★따로 선 화면(`/rank/top5`)에서는 다 펼친다★ — 거기는 «분야별로 파고드는»
   *   자리라 한눈에 견주는 게 낫다. 홈(`embedded`)에서만 탭을 쓴다.
   */
  const [axisKey, setAxisKey] = useState<string | null>(null)
  /*
   * ★폰만 탭, PC 는 다 펼친다★ (2026-09-15 · 무한 QA ②).
   *
   * PC(1440px)에서 한 축만 보이니 카드가 왼쪽 3분의 1만 쓰고 오른쪽이 텅 비었다.
   * 폰은 세로가 아까워서 탭이 맞고, PC 는 가로가 남아서 격자가 맞다.
   *
   * ⚠ 서버에서 그릴 때는 ★폰으로 친다★ — 좁은 쪽으로 그려 두면 넓은 화면에서
   *   한 번 더 그려도 글자가 안 넘친다. 반대로 하면 폰에서 잠깐 삐져나온다.
   */
  const [narrow, setNarrow] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const tabbed = embedded && narrow
  const picked = tabbed ? (axes.find((a) => a.key === axisKey) ?? axes[0] ?? null) : null
  const shown = tabbed ? (picked === null ? [] : [picked]) : axes

  return (
    <div className={embedded ? '' : 'pc-container pb-[var(--section-gap)]'}>
      {embedded ? null : (
        <header style={{ padding: '22px 2px 14px' }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>
            분야별 TOP 5
          </h1>
          <p style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7, color: V3.textFaint }}>
            여섯 가지 플레이 성향을 따로 재서, 분야마다 가장 잘하는 다섯을 세웁니다.
            <br />
            종합 등수가 아니라 <b style={{ color: '#9cc0ff' }}>«이건 누가 제일 잘하나»</b> 를 봅니다.
          </p>
        </header>
      )}

      {/* 클랜 / 개인 — 클랜 기록을 안 주는 리그는 칸 자체가 없다 */}
      {showsClan ? (
        <div style={{ display: 'flex', gap: 6, padding: '0 2px 14px' }}>
          {(['clan', 'player'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSide(k)}
              style={{
                padding: '7px 16px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                color: side === k ? '#0b1220' : V3.textFaint,
                background: side === k ? '#9cc0ff' : 'transparent',
                border: `1px solid ${side === k ? '#9cc0ff' : V3.divider}`,
              }}
            >
              {k === 'clan' ? '클랜' : '개인'}
            </button>
          ))}
        </div>
      ) : null}

      {/*
        * 축 탭 — 홈에 얹었을 때만 나온다 (2026-09-15 · 무한 QA).
        * 여섯을 한꺼번에 펼치면 홈이 6,834px 이 된다. 한 번에 하나만 본다.
        */}
      {tabbed && axes.length > 1 ? (
        <div
          style={{
            display: 'flex',
            gap: 5,
            overflowX: 'auto',
            padding: '0 2px 12px',
            scrollbarWidth: 'none',
          }}
        >
          {axes.map((a) => {
            const on = (picked?.key ?? '') === a.key
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setAxisKey(a.key)}
                style={{
                  flex: 'none',
                  fontSize: 11.5,
                  fontWeight: on ? 700 : 500,
                  padding: '6px 11px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  color: on ? '#cfe0ff' : V3.textDim,
                  border: `1px solid ${on ? 'rgba(159,192,255,.55)' : V3.rowDivider}`,
                  background: on ? 'rgba(91,141,255,.16)' : 'transparent',
                }}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {top.isLoading ? (
        <p style={{ padding: '30px 2px', fontSize: 12.5, color: V3.textGhost }}>불러오는 중…</p>
      ) : axes.length === 0 || axes.every((a) => a.rows.length === 0) ? (
        <p style={{ padding: '30px 2px', fontSize: 12.5, color: V3.textGhost, lineHeight: 1.8 }}>
          아직 순위를 낼 만큼 경기가 쌓이지 않았습니다.
          <br />
          경기가 들어오면 저절로 채워집니다.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {shown.map((axis) => (
            <AxisCard key={axis.key} axis={axis} leagueSlug={leagueSlug} side={side} />
          ))}
        </div>
      )}
    </div>
  )
}

function AxisCard({ axis, leagueSlug, side }: { axis: HexTopAxis; leagueSlug: string; side: Side }) {
  return (
    <Card>
      <CardHead
        title={axis.label}
        ribbon="#ffd98a"
        right={
          axis.total === null ? null : (
            <span style={{ fontSize: 11, color: V3.textGhost2, whiteSpace: 'nowrap' }}>
              {/* 클랜은 «곳», 사람은 «명». 서버가 세어 준 모집단 크기를 그대로 적는다 */}
              {axis.total.toLocaleString()}
              {side === 'clan' ? '곳' : '명'} 중
            </span>
          )
        }
      />
      {axis.rows.length === 0 ? (
        <p style={{ padding: '14px 18px 16px', fontSize: 11.5, color: V3.textGhost2 }}>
          아직 잴 만큼 경기가 없습니다
        </p>
      ) : (
        <ol style={{ padding: '6px 0 8px' }}>
          {axis.rows.map((row) => (
            <TopRow key={`${row.league_player_id ?? row.league_clan_id}`} row={row} leagueSlug={leagueSlug} />
          ))}
        </ol>
      )}
    </Card>
  )
}

function TopRow({ row, leagueSlug }: { row: HexTopRow; leagueSlug: string }) {
  /* 사람 줄이면 사람 이름이 크고 클랜이 작게, 클랜 줄이면 클랜 이름 하나다 */
  const isPlayer = row.player !== null
  const href = isPlayer
    ? row.league_player_id === null
      ? null
      : leaguePlayerPath(leagueSlug, row.league_player_id)
    : row.clan === null
      ? null
      : leagueClanPath(leagueSlug, row.clan.slug)

  const body = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 18px',
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 18,
          flexShrink: 0,
          fontSize: 13,
          fontWeight: 800,
          textAlign: 'right',
          color: rankColor(row.rank) ?? V3.textFaint,
        }}
      >
        {row.rank}
      </span>
      <MarkCircle
        clan={row.clan === null ? null : { slug: row.clan.slug, mark: row.clan.mark }}
        size={22}
        title={row.clan?.name ?? undefined}
      />
      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: V3.textStrong,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isPlayer ? row.player?.name : row.clan?.name}
        </span>
        {isPlayer && row.clan !== null ? (
          <span
            style={{
              fontSize: 10.5,
              color: V3.textGhost2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.clan.name}
          </span>
        ) : null}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 13,
          fontWeight: 700,
          color: '#ffd98a',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {row.value}
      </span>
    </div>
  )

  return (
    <li>
      {href === null ? (
        body
      ) : (
        <Link href={href} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
          {body}
        </Link>
      )}
    </li>
  )
}

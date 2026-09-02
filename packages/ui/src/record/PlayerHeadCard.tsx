import { INDEPENDENT_KD_NOTE } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { formatAverage, formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { ratingClass } from '../common/rating'
import { positionLine, rankColor } from './playerHeadCopy'

/**
 * **선수 정보줄** — 그래프 카드 바로 밑 (2026-09-02 사용자 지시).
 *
 * > "그래프 카드 밑에
 * >  래더 / 닉네임/포지션 / 승률 /
 * >  킬데스-두개분리 위쪽이스나킬뎃 밑에가 라플킬뎃-판킬도 분리해서 적어줘 /
 * >  순위 / 클랜: 클랜마크/클랜명"
 *
 * ── 옛 `PlayerStatSidebar` 를 **지우지 않았다** (`CLAUDE.md` 10-4)
 *   그쪽은 그대로 살아 있고, 화면이 이 카드를 부르도록 바꿨을 뿐이다.
 *   순서와 항목이 사용자 지시대로 다시 짜였고, 킬뎃이 **언제나 두 줄**이라는 점이 다르다 —
 *   옛 카드는 주무기 하나만 크게 보여 주고 나머지를 작게 붙였다.
 *
 * ── 킬뎃 두 줄은 **자리를 지킨다**
 *   스나를 한 판도 안 든 선수도 `스나 킬뎃` 줄이 남고 값 자리에 `집계 없음` 이 온다.
 *   줄을 없애면 「위가 스나, 아래가 라플」이라는 약속이 선수마다 달라진다.
 *
 * ── 무소속리그(IPL)는 **순위로** 갈린다
 *   top100 안이면 값이 오고, 밖이면 서버가 `null` 을 준다. 화면은 그 자리에
 *   «IPL은 top100만 킬뎃이 보입니다» 를 적는다 — 값이 **없는 것이 아니라 안 보이는 것**이다.
 *   문구는 계약(`INDEPENDENT_KD_NOTE`) 한 곳에서만 온다.
 */

export interface PlayerHeadCardProps {
  playerName: string
  rating: number
  /** 이 시즌 창에 0판이면 참 — 래더 자리에 `기록 없음` */
  placement: boolean
  win: number
  lose: number
  winRate: number
  /** `0 = 라이플` · `1 = 스나이퍼` · `null = 모름/반반` */
  mainWeapon: 0 | 1 | null
  positionLabel: string | null
  positionSource: 'user' | 'weapon' | 'coords' | null
  /** 킬은 `null` 일 수 있다 — K/D 를 아는 경기가 하나도 없으면 **모르는 값**이다 (D-176) */
  sniper: { games: number; knownGames: number; kill: number | null; kdRate: number | null }
  rifle: { games: number; knownGames: number; kill: number | null; kdRate: number | null }
  rank: number | null
  rankCount: number | null
  /** `ClanSummary` 를 그대로 넘긴다 — 마크는 등록 여부까지 보고 그려진다 */
  clan: {
    id: string
    slug: string
    name: string
    mark: { bg: string | null; front: string | null }
    is_official_clan: boolean
  } | null
  /** 이 리그가 누적 킬뎃에 제한을 두나 (무소속리그) */
  restrictsKd: boolean
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[12px] text-meta">{label}</span>
      <span className="min-w-0 text-right text-[15px]">{children}</span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-line-soft" />
}

/** 한 무기 줄 — `52.4%  12.1킬` */
function WeaponLine({
  name,
  stat,
  hidden,
}: {
  name: string
  stat: PlayerHeadCardProps['sniper']
  hidden: boolean
}) {
  if (hidden) {
    /* 값이 없는 게 아니라 **안 보여 주는** 것이다. 0 으로 채우지 않는다 */
    return <span className="text-[13px] text-faint">{INDEPENDENT_KD_NOTE}</span>
  }
  if (stat.games <= 0) {
    return <span className="text-[13px] text-faint">집계 없음</span>
  }
  if (stat.knownGames <= 0 || stat.kdRate === null || stat.kill === null) {
    /* 뛰었지만 K/D 를 하나도 모른다 — 전 수는 보여 주고 K/D 자리는 비운다 (D-148) */
    return (
      <>
        <span className="num text-[13px] text-meta">{formatCount(stat.games)}전</span>
        <span className="ml-2 text-[13px] text-faint">알수없음</span>
      </>
    )
  }
  return (
    <>
      <span className={`num ${rateClass(stat.kdRate)}`}>{formatRate(stat.kdRate)}%</span>
      <span className="num ml-2 text-[13px] text-meta">
        {formatAverage(stat.kill / stat.knownGames)}킬
      </span>
      <span className="sr-only"> {name}</span>
    </>
  )
}

export function PlayerHeadCard(props: PlayerHeadCardProps) {
  const position = positionLine({
    mainWeapon: props.mainWeapon,
    positionLabel: props.positionLabel,
    positionSource: props.positionSource,
  })
  const color = rankColor(props.rank)
  /* 서버가 이미 순위로 갈라 `null` 을 준다. 화면은 그 사실을 문구로만 옮긴다 */
  const kdHidden = props.restrictsKd && props.sniper.kdRate === null && props.rifle.kdRate === null

  return (
    <section className="rounded-[2px] border border-line bg-card px-4 py-3 text-text">
      <Row label="래더">
        <span className={ratingClass(props.rating)}>
          {/* 배치고사 폐지 (2026-09-01) — 이 창에 0판이라는 뜻이다 */}
          {props.placement ? '기록 없음' : `${formatCount(props.rating)}점`}
        </span>
      </Row>
      <Divider />

      <Row label="닉네임">
        <span className="text-text-strong">{props.playerName}</span>
        {position === null ? null : (
          <span className="ml-2 text-[13px] text-meta">{position}</span>
        )}
      </Row>
      <Divider />

      <Row label="승률">
        <span className="num mr-2 text-[13px] text-meta">
          {formatCount(props.win)}승 {formatCount(props.lose)}패
        </span>
        <span className={`num ${rateClass(props.winRate)}`}>{formatRate(props.winRate)}%</span>
      </Row>
      <Divider />

      {/* ★킬데스는 언제나 두 줄이다 — 위가 스나, 아래가 라플★ */}
      <Row label="스나 킬뎃">
        <WeaponLine name="스나이퍼" stat={props.sniper} hidden={kdHidden} />
      </Row>
      <Row label="라플 킬뎃">
        <WeaponLine name="라이플" stat={props.rifle} hidden={kdHidden} />
      </Row>
      <Divider />

      <Row label="순위">
        {props.rank === null ? (
          <span className="text-faint">순위 없음</span>
        ) : (
          <>
            {props.rankCount === null ? null : (
              <span className="num mr-2 text-[13px] text-meta">
                {formatCount(props.rankCount)}명중
              </span>
            )}
            <span className="num text-[17px] font-medium" style={color ? { color } : undefined}>
              {formatCount(props.rank)}위
            </span>
          </>
        )}
      </Row>
      <Divider />

      <Row label="클랜">
        {props.clan === null ? (
          <span className="text-faint">무소속</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <ClanMark clan={props.clan} size="sm" alt="" />
            <span className="text-text-strong">{props.clan.name}</span>
          </span>
        )}
      </Row>
    </section>
  )
}

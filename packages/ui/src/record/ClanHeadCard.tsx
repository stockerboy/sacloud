import { ClanMark } from '../common/ClanMark'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { ratingClass } from '../common/rating'
import { divisionLabel } from '../league/divisionLabel'
import { rankColor } from './playerHeadCopy'

/**
 * **클랜 정보줄** — 그래프 카드 바로 밑 (2026-09-02 사용자 지시).
 *
 * > "클랜마크/클랜명/소속(SPL or IPL) / 래더 / 승률-통합(일주일단위x) /
 * >  순위-색깔체계 선수카드와 동일"
 *
 * ── 선수 카드와 **같은 순위 색**을 쓴다
 *   «순위-색깔체계 선수카드와 동일» 이라고 못박아 주셨다. 그래서 색을 여기서 새로 정하지 않고
 *   `rankColor()` 를 그대로 부른다 — 경계값은 계약(`rankTone`) 한 곳에만 있다.
 *
 * ── 승률은 **통합 하나**다
 *   «승률-통합(일주일단위x)». 주 단위 승률은 위 그래프 카드가 이미 보여 준다.
 *   여기서 또 쪼개면 같은 값을 두 번 다르게 말하게 된다.
 *
 * ── 옛 `ClanStatSidebar` 를 **지우지 않았다** (`CLAUDE.md` 10-4)
 *   그쪽은 그대로 살아 있고 화면이 이 카드를 부를 뿐이다.
 */

export interface ClanHeadCardProps {
  clan: {
    id: string
    slug: string
    name: string
    mark: { bg: string | null; front: string | null }
    is_official_clan: boolean
  }
  /** 소속 리그 이름 — `SPL` · `IPL` · `10mountain` */
  leagueName: string
  /** `independent` 면 부리그를 `티어` 라고 쓴다 (D-165) */
  leagueCategory?: string
  division: number
  rating: number
  /** 이 시즌 창에 0판이면 참 — 래더 자리에 `기록 없음` */
  placement: boolean
  win: number
  lose: number
  winRate: number
  rank: number | null
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

export function ClanHeadCard(props: ClanHeadCardProps) {
  const color = rankColor(props.rank)

  return (
    <section className="rounded-[2px] border border-line bg-card px-4 py-3 text-text">
      {/* 마크 · 이름 · 소속 — 한 줄에 셋 */}
      <div className="flex items-center gap-3 pb-3">
        <ClanMark clan={props.clan} size="md" alt="" />
        <div className="min-w-0">
          <div className="truncate text-[17px] text-text-strong">{props.clan.name}</div>
          <div className="text-[12px] text-meta">
            {props.leagueName}
            <span className="mx-1.5 text-faint">·</span>
            {divisionLabel(props.division, props.leagueCategory)}
          </div>
        </div>
      </div>
      <Divider />

      <Row label="래더">
        <span className={ratingClass(props.rating)}>
          {/* 배치고사 폐지 (2026-09-01) — 이 창에 0판이라는 뜻이다 */}
          {props.placement ? '기록 없음' : `${formatCount(props.rating)}점`}
        </span>
      </Row>
      <Divider />

      <Row label="승률">
        <span className="num mr-2 text-[13px] text-meta">
          {formatCount(props.win)}승 {formatCount(props.lose)}패
        </span>
        <span className={`num ${rateClass(props.winRate)}`}>{formatRate(props.winRate)}%</span>
      </Row>
      <Divider />

      <Row label="순위">
        {props.rank === null ? (
          <span className="text-faint">순위 없음</span>
        ) : (
          <span className="num text-[17px] font-medium" style={color ? { color } : undefined}>
            {formatCount(props.rank)}위
          </span>
        )}
      </Row>
    </section>
  )
}

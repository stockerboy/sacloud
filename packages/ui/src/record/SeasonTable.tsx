import type { LeagueClanSeason, LeaguePlayerSeason } from '@sacloud/contract'
import { EmptyState } from '../common/EmptyState'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'

/**
 * 지난시즌 **카드** — `/league/{slug}/player/{id}/season`, `/league/{slug}/clan/{slug}/season`.
 *
 * ── 원본 관측 (2026-08-28 · 모바일 화면)
 *   ```
 *   ┌──────────────────────────────────────────┐
 *   │ 서플라이공식리그                  시즌 6  │
 *   │ ──────────────────────────────────────── │  ← 옅은 가로 구분선
 *   │                     6,934명중     1위    │
 *   │  967승 578패          승률     62.6%     │
 *   │  16,875킬 10,605데스   킬뎃     61.4%    │
 *   └──────────────────────────────────────────┘
 *   ```
 *   어두운 남색 배경 · 흰 글자 · 카드가 세로로 쌓인다. PC 는 2열 격자로 관측됐다.
 *   예전에는 표(表)로 그렸는데, 그건 관측 전에 랭킹 표 뼈대를 재사용한 `[미확인]` 추정이었다.
 *
 * ── 없는 값은 **줄 자체를 없앤다**
 *   시즌 6·5 는 승패·킬데스가 있지만 **시즌 4·3·2·1 은 없다**(원본이 비율만 준다).
 *   그 카드는 `{모수}명중 {순위}위 · 승률 · 킬뎃` 세 줄뿐이다.
 *   0 이나 `-` 로 채우지 않고 줄을 생략한다 (D-099 · D-106).
 *
 * ── 색
 *   승률·킬뎃은 `rateClass` 를 그대로 쓴다 (원본 실측 규칙).
 *   관측 대조: 62.6%·63% 파랑(`rate-3`) · 58.4%·56.9%·55.8%·59.2% 주황(`rate-2`) — 일치한다.
 *   **순위 색은 `[미확인]`** 이다. `1위`·`17위`·`30위`·`31위` 는 노랑, `122위` 는 파랑으로
 *   보였지만 경계를 모른다. 임의로 100 같은 값을 만들지 않고 기본색(흰색)으로 둔다.
 *
 * ── 순위 0 = 배치고사
 *   원본은 `rank: null` 을 주지 않는다. **`0`** 을 준다.
 *   수집분 14,441줄을 대조해 보니 `rank = 0` 인 줄은 **판수가 전부 9판 이하**였고
 *   (`sanply` 922줄 최대 9 · `supply` 1,280줄 최대 9), `rank > 0` 은 10판 이상이었다.
 *   즉 배치고사(10판 미만)라 순위를 매기지 않은 상태다.
 *   그래서 `0위` 라고 쓰지 않고 우리가 이미 쓰는 표기 `배치고사` 로 그린다.
 *   그 줄에 `{모수}명중` 을 함께 쓰는지는 `[미확인]` — 순위가 없으므로 함께 쓰지 않는다.
 *   DB 에는 **원본값 0 을 그대로** 저장한다. 해석은 화면에서만 한다 (3-A 2번).
 */

/** 한 줄 — 왼쪽 원시 수치 / 오른쪽 `라벨 + 값`. 양쪽 다 없으면 아예 그리지 않는다 */
function StatLine({
  raw,
  label,
  value,
  valueClass = '',
}: {
  raw: string | null
  label: string
  value: string | null
  valueClass?: string
}) {
  if (raw === null && value === null) return null
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3">
      <div className="text-base">{raw ?? ''}</div>
      {value === null ? null : (
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-input-placeholder">{label}</span>
          <span className={`text-base ${valueClass}`}>{value}</span>
        </div>
      )}
    </div>
  )
}

export function SeasonTable({
  seasons,
  kind,
  leagueName,
  hidesCumulativeKd = false,
}: {
  seasons?: readonly (LeaguePlayerSeason | LeagueClanSeason)[]
  kind: 'player' | 'clan'
  /** 카드 왼쪽 위에 그대로 쓰는 리그 이름 (`서플라이공식리그`) */
  leagueName?: string | undefined
  /**
   * 무소속리그인가 (D-107). `true`면 **킬뎃 줄 자체를 없앤다.**
   *
   * `알수없음`으로 두지 않는 이유: 그건 "원본이 값을 안 줬다"는 뜻이고(D-106),
   * 여기는 "공개하지 않는다"는 뜻이라 서로 다른 상태다.
   */
  hidesCumulativeKd?: boolean
}) {
  if (!seasons || seasons.length === 0) {
    /* 어느 쪽 지난시즌인지는 `kind` 가 말해 준다. 값 판정은 아래에서 `in` 으로 하지만
       빈 화면 문구는 데이터가 없어 판정할 수 없으므로 이 값을 쓴다 */
    return <EmptyState message={`지난시즌 ${kind === 'clan' ? '클랜 ' : ''}기록이 없습니다.`} />
  }

  /* PC 는 2열 격자, 모바일은 한 장씩 화면 폭을 꽉 채운다.
     `.pc-container` 안이므로 PC 레이아웃 폭은 그대로다. */
  return (
    <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
      {seasons.map((season) => {
        const isPlayer = 'kd_rate' in season
        const showKd = isPlayer && !hidesCumulativeKd

        const winLose =
          season.win === null || season.lose === null
            ? null
            : `${formatCount(season.win)}승 ${formatCount(season.lose)}패`
        const killDeath =
          !isPlayer || season.kill === null || season.death === null
            ? null
            : `${formatCount(season.kill)}킬 ${formatCount(season.death)}데스`

        return (
          <div
            key={season.season}
            className="w-full bg-side px-4 py-3 text-white shadow-card"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-lg font-bold">{leagueName ?? ''}</div>
              <div className="text-lg">{season.season_label}</div>
            </div>
            <div className="mt-2 border-t border-side-line" />

            {/* 순위 — 오른쪽에만 온다. `{모수}명중` 은 작은 회색, 순위는 크다.
                `null`(우리 카드)과 `0`(3rd.supply 카드) 둘 다 배치고사다 */}
            <div className="mt-2 flex items-baseline justify-end gap-2">
              {season.rank === null || season.rank === 0 ? (
                <span className="text-xl font-bold">배치고사</span>
              ) : (
                <>
                  {season.rank_count === null ? null : (
                    <span className="text-sm text-input-placeholder">
                      {formatCount(season.rank_count)}명중
                    </span>
                  )}
                  <span className="text-xl font-bold">{formatCount(season.rank)}위</span>
                </>
              )}
            </div>

            <StatLine
              raw={winLose}
              label="승률"
              value={season.win_rate === null ? null : `${formatRate(season.win_rate)}%`}
              valueClass={rateClass(season.win_rate)}
            />

            {showKd ? (
              <StatLine
                raw={killDeath}
                label="킬뎃"
                value={season.kd_rate === null ? null : `${formatRate(season.kd_rate)}%`}
                valueClass={rateClass(season.kd_rate)}
              />
            ) : null}

            {/* 원본 지난시즌 카드에는 래더가 **없다** (D-099).
                SACLOUD 가 계산한 카드에는 있으므로, 값이 있을 때만 한 줄 붙인다 */}
            <StatLine
              raw={null}
              label="래더"
              value={season.rating === null ? null : `${formatCount(season.rating)}점`}
            />
          </div>
        )
      })}
    </div>
  )
}

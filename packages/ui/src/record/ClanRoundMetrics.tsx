import type { ClanRoundMetrics as ClanRoundMetricsData } from '@sacloud/contract'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'

/**
 * 클랜페이지 **배틀로그 지표** — 소수싸움 · 블루방어율 · 어택성공률 · 조직력 · 폭발력 ·
 * 게임템포 · 클린시트 (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * ```
 * 배틀로그 지표                        25판 · 진영 아는 라운드 229/2,020
 * ─────────────────────────────────────────────────────────────────────
 * 소수싸움     51.5%   839회중 432회 승리
 *                     숫자가 밀린 839라운드 · 진영을 가리지 않는다
 * 블루방어율   71.6%   블루 5라운드중 1.4라운드 허용
 *                     수비 109라운드 · 31라운드 내줌
 * 어택성공률   46.6%   레드 5라운드중 2.3라운드 · 폭탄설치 1.9번
 *                     공격 118라운드 · 설치 45/120라운드
 * 조직력        1회    5라운드당 0.04회 · 공격 120라운드
 * 폭발력        2회    5라운드당 0.08회 · 공격 120라운드
 * 게임템포     81.3%   라운드 중앙값 70초 · 같은 리그 8팀 중
 * 클린시트      1회    18판중 5.6%
 * ```
 * (2026-08-30 실측 · `sanply` 리그 한 클랜)
 *
 * `ClanMetrics`(같은 폴더) **바로 아래**에 붙는다. 카드·제목·글자 크기를 그쪽과
 * 똑같이 맞췄다 — 새 색이나 새 스타일을 만들지 않는다 (`CLAUDE.md` 3장 2번).
 *
 * **원본(3rd.supply)에 없는 블록이다.** 사용자 지시로 만든 신규 지표이고
 * 원본과 동일함이 검증되지 않았다 (3장 7번).
 *
 * ── 결측 (D-106)
 *   진영을 모르는 라운드는 **분모에서도 뺐다.** 그래서 표본이 얇고, 최소치에 못 미치면
 *   값이 `null` 로 온다. 그때는 `측정중` 이라고 적고 **숫자를 적지 않는다** —
 *   `0%` 로 찍으면 "한 라운드도 못 막았다" 가 되어 못 잰 클랜이 최악으로 보인다.
 *
 * ── 표본을 숨기지 않는다
 *   줄마다 오른쪽에 그 값을 만든 라운드 수를 적는다. 머리에는 몇 판을 봤고 그중
 *   진영을 아는 라운드가 몇인지 적는다. `10라운드로 잰 82%` 와 `500라운드로 잰 82%` 는
 *   같은 숫자지만 같은 뜻이 아니다.
 *
 * ── 소수싸움만 표본이 크다
 *   그 축은 **진영을 보지 않아서**(`packages/nexon/src/clanRound.ts`) 교대를 못 본
 *   경기에서도 세어진다. 머리의 `진영 아는 라운드` 와 앞뒤가 안 맞아 보이는 것이
 *   정상이라, 그 줄의 표본에 `진영을 가리지 않는다` 를 함께 적는다.
 */

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="text-base">{title}</div>
      {note ? <div className="text-xs text-meta">{note}</div> : null}
    </div>
  )
}

/** 아직 못 잰 값. 숫자를 적지 않는다 (D-106) */
function Measuring({ note }: { note: string }) {
  return (
    <div className="text-sm text-meta">
      측정중
      <span className="ml-2 text-xs">{note}</span>
    </div>
  )
}

/**
 * 지표 한 줄 — 큰 값 + 설명 + 표본.
 *
 * `value` 가 `null` 이면 `측정중` 을 대신 그린다.
 */
function MetricRow({
  value,
  unit,
  tone,
  detail,
  sample,
}: {
  value: string | null
  unit: string
  /** 승률과 같은 색 등급을 입힐 값 (0~100). 등급을 안 쓰면 넘기지 않는다 */
  tone?: number | null
  detail: string
  sample: string
}) {
  if (value === null) return <Measuring note={sample} />
  return (
    <div className="text-sm">
      <span className={`text-lg ${tone === undefined ? '' : rateClass(tone)}`}>{value}</span>
      <span className="ml-0.5">{unit}</span>
      <span className="ml-2 text-xs text-meta">{detail}</span>
      <div className="mt-0.5 text-xs text-meta">{sample}</div>
    </div>
  )
}

/** 블루방어율 — 원문: `평균적으로 블루 5라운드중 1.7라운드를 허용` */
function BlueDefense({ defense }: { defense: ClanRoundMetricsData['blue_defense'] }) {
  return (
    <MetricRow
      value={defense.rate === null ? null : formatRate(defense.rate)}
      unit="%"
      tone={defense.rate}
      detail={
        defense.conceded_per5 === null ? '' : `블루 5라운드중 ${defense.conceded_per5}라운드 허용`
      }
      sample={`수비 ${formatCount(defense.rounds)}라운드 · ${formatCount(defense.conceded)}라운드 내줌`}
    />
  )
}

/** 어택성공률 — 원문: `레드 5라운드중 2.6라운드를 따고 폭탄설치 1.4번 성공` */
function Attack({ attack }: { attack: ClanRoundMetricsData['attack'] }) {
  const plant = attack.plant_per5 === null ? '' : ` · 폭탄설치 ${attack.plant_per5}번`
  return (
    <MetricRow
      value={attack.rate === null ? null : formatRate(attack.rate)}
      unit="%"
      tone={attack.rate}
      detail={attack.won_per5 === null ? '' : `레드 5라운드중 ${attack.won_per5}라운드${plant}`}
      sample={`공격 ${formatCount(attack.rounds)}라운드 · 설치 ${formatCount(attack.plants)}/${formatCount(attack.plant_rounds)}라운드`}
    />
  )
}

/**
 * 조직력 · 폭발력 — 원문이 **횟수**다.
 *
 * 횟수만으로는 클랜끼리 견줄 수 없어(많이 뛴 클랜이 무조건 크다) 5라운드당 값을
 * 같이 적는다. 색 등급은 입히지 않는다 — 승률이 아니라 횟수라 50/55/60 경계가 뜻이 없다.
 */
function EventRate({
  metric,
  sampleLabel,
}: {
  metric: ClanRoundMetricsData['organized']
  sampleLabel: string
}) {
  return (
    <MetricRow
      value={metric.per5 === null ? null : formatCount(metric.count)}
      unit="회"
      detail={metric.per5 === null ? '' : `5라운드당 ${metric.per5}회`}
      sample={`${sampleLabel} ${formatCount(metric.rounds)}라운드`}
    />
  )
}

/**
 * 게임템포 — 라운드 길이 **중앙값**의 리그 안 백분위. 빠를수록 높다.
 *
 * 중앙값(초)도 함께 적는다. 백분위만 적으면 무엇을 재서 나온 순위인지 알 수 없다.
 */
function Tempo({ tempo }: { tempo: ClanRoundMetricsData['tempo'] }) {
  if (tempo.percentile === null) {
    return (
      <Measuring
        note={
          tempo.median_seconds === null
            ? `템포를 잰 ${formatCount(tempo.rounds)}라운드`
            : `라운드 중앙값 ${tempo.median_seconds}초 · 견줄 클랜 ${formatCount(tempo.cohort)}팀`
        }
      />
    )
  }
  return (
    <MetricRow
      value={formatRate(tempo.percentile)}
      unit="%"
      tone={tempo.percentile}
      detail={tempo.median_seconds === null ? '' : `라운드 중앙값 ${tempo.median_seconds}초`}
      sample={`템포 ${formatCount(tempo.rounds)}라운드 · 같은 리그 ${formatCount(tempo.cohort)}팀 중`}
    />
  )
}

/**
 * 소수싸움 — 원문: `소수싸움:839회중 432회 승리 n%`.
 *
 * 문구를 원문 형식 그대로 쓴다. 큰 값이 비율이고, 옆에 `839회중 432회 승리` 가 붙는다.
 *
 * ── 표본이 다른 줄보다 **훨씬 크다**
 *   이 축만 진영을 보지 않는다 (`packages/nexon/src/clanRound.ts`). 그래서 `수비
 *   109라운드` 옆에 `소수싸움 839회` 가 나란히 서도 어긋난 것이 아니다. 왜 큰지를
 *   표본 줄에 한마디로 적어 둔다 — 안 적으면 다른 줄과 견주다 숫자를 의심하게 된다.
 */
function Outnumbered({ outnumbered }: { outnumbered: ClanRoundMetricsData['outnumbered'] }) {
  return (
    <MetricRow
      value={outnumbered.rate === null ? null : formatRate(outnumbered.rate)}
      unit="%"
      tone={outnumbered.rate}
      detail={`${formatCount(outnumbered.rounds)}회중 ${formatCount(outnumbered.won)}회 승리`}
      sample={`숫자가 밀린 ${formatCount(outnumbered.rounds)}라운드 · 진영을 가리지 않는다`}
    />
  )
}

/** 반코트 — 원문: `800판중 120회 n%` (옛 제목 「클린시트」 · O-040 ⑦) */
function CleanSheet({ sheet }: { sheet: ClanRoundMetricsData['clean_sheet'] }) {
  return (
    <MetricRow
      value={sheet.rate === null ? null : formatCount(sheet.count)}
      unit="회"
      detail={
        sheet.rate === null ? '' : `${formatCount(sheet.matches)}판중 ${formatRate(sheet.rate)}%`
      }
      sample={`판정한 ${formatCount(sheet.matches)}판`}
    />
  )
}

export function ClanRoundMetrics({ metrics }: { metrics: ClanRoundMetricsData }) {
  const { sample } = metrics
  return (
    <div className="mt-2 rounded-[2px] border border-line bg-card px-5 py-4">
      <div className="flex items-baseline justify-between">
        <div className="text-lg">배틀로그 지표</div>
        {/* 표본을 머리에 박아 둔다. 아래 값들이 몇 판을 보고 나온 것인지 숨기지 않는다 */}
        <div className="text-xs text-meta">
          {formatCount(sample.sided_matches)}판 · 진영 아는 라운드{' '}
          {formatCount(sample.rounds_known)}/{formatCount(sample.rounds_total)}
        </div>
      </div>

      {/* 진영을 모르는 라운드를 왜 뺐는지 한 줄로 밝힌다 — 표본이 얇은 이유가 여기 있다 */}
      <div className="mt-1 text-xs text-meta">
        라운드별 진영은 폭탄 이벤트로 되짚는다. 진영을 모르는 라운드는 분모에서도 뺐다.
      </div>

      {/* 사양 원문에서 소수싸움이 블루방어율보다 **앞**에 있다. 순서를 그대로 둔다 */}
      <div className="mt-3 border-t border-t-line-soft pt-3">
        <SectionTitle title="소수싸움" note="숫자가 밀린 라운드를 이겨 낸 비율" />
        <div className="mt-2">
          <Outnumbered outnumbered={metrics.outnumbered} />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="블루방어율" note="수비 라운드를 지킨 비율" />
        <div className="mt-2">
          <BlueDefense defense={metrics.blue_defense} />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="어택성공률" note="공격 라운드를 딴 비율" />
        <div className="mt-2">
          <Attack attack={metrics.attack} />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="조직력" note="라운드 시작 후 30초 넘게 아무도 안 죽은 횟수" />
        <div className="mt-2">
          <EventRate metric={metrics.organized} sampleLabel="공격" />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="폭발력" note="2초 이하 간격으로 3명 이상 제거한 횟수" />
        <div className="mt-2">
          <EventRate metric={metrics.burst} sampleLabel="공격" />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle title="게임템포" note="라운드가 빨리 끝날수록 높다" />
        <div className="mt-2">
          <Tempo tempo={metrics.tempo} />
        </div>
      </div>

      <div className="mt-4">
        {/* O-040 ⑦ — 옛 제목 「클린시트」. ★답이 괄호 안에 있는데 제목이 축구 말이었다★
            (강민재). 설명에서 괄호를 떼고 제목을 「반코트」로 올렸다 */}
        <SectionTitle title="반코트" note="한 진영에서 5라운드 전승" />
        <div className="mt-2">
          <CleanSheet sheet={metrics.clean_sheet} />
        </div>
      </div>
    </div>
  )
}

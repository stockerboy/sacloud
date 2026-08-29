import type { PlayerTodayPerformance } from '@sacloud/contract'
import { FORM_TREND_CLASS } from './formCopy'

/**
 * `오늘 퍼포먼스` 한 줄 (`docs/PLAYER_TRAITS_SPEC.md` 10절 · D-182 · D-185).
 *
 * ```
 * 오늘   6전 2승 4패로 승률은 47퍼, 킬데스 42퍼로 폼이 하락중입니다
 * ```
 *
 * **문구는 계약이 만들어 온다** (`buildTodayPerformance()`). 화면은 그것을 그대로 적고
 * 판정에 따라 색만 준다 — 여기서 문장을 다시 조립하면 mock↔live 가 갈린다.
 *
 * 색 등급은 `최근 폼`(D-167)이 이미 쓰는 `FORM_TREND_CLASS` 를 그대로 쓴다.
 * 두 블록이 같은 `PlayerFormTrend` 를 쓰므로 새 색 규칙을 만들지 않는다.
 */
export function TodayPerformance({ today }: { today: PlayerTodayPerformance }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-lg">오늘</div>
        {/* 하루가 언제 바뀌는지 밝힌다 — 자정이 아니라 오전 7시다 (D-186).
            이걸 안 적으면 새벽 3시에 뛴 판이 왜 어제로 잡히는지 아무도 모른다 */}
        <div className="text-xs text-meta">오전 7시 기준 · 다음날 오전 7시에 초기화</div>
      </div>
      <div className={`mt-2 ${FORM_TREND_CLASS[today.trend]}`}>{today.sentence}</div>
    </div>
  )
}

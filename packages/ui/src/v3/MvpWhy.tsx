import { Fragment } from 'react'
import type { MatchDetail } from '@sacloud/contract'
import { V3 } from './tokens'

/**
 * ★MVP 가 MVP 인 이유★ (2026-09-18 사장님:
 *   「MVP가 mvp인 이유를 설명해줘 (…) 라운드마다 콕콕 찝어서 다넣어」).
 *
 * ⚠ ★평범한 1점짜리 라플킬은 안 적는다★ — 워커가 애초에 안 담는다.
 * ⚠ 줄이 하나도 없으면 ★아무것도 안 그린다★ — 「없다」 고 적는 것보다 조용한 편이 낫다.
 */
/*
 * ⚠ ★「스나싸움 승」 이라 적으면 안 된다★ (2026-09-18 사장님:
 *   「이거는 그냥 위치 상관없이 잡으면 스나싸움 이겼다고 판단하고 점수 주는거야 혹시?
 *    그런거면 스나싸움 승 이렇게 적지말고 스나다운이라고 적고」).
 *
 * ★두 가지가 서로 다른 것을 잰다.★
 *   여기(MVP 이유)  ★자리를 안 본다★ — 어디서든 스나를 잡으면 점수다
 *   육각의 스나싸움  ★A롱·B롱 안★ 에서 스나끼리 붙은 것만 센다
 * 같은 이름을 쓰면 「롱에서만 이긴 것」 으로 읽힌다. 그래서 ★스나 다운★ 이라 적는다.
 *
 * ⚠ 잡은 총(라플·스나)으로 줄을 나누지 않는다 — 보는 사람에게는 ★스나를 잡았다★ 가
 *   하나의 사건이다. 값이 다른 것은 점수가 말해 준다.
 */
const MVP_WHY_LABEL: Record<string, string> = {
  /*
   * ⚠ ★「경기초반」 이 아니라 「라운드초반」 이다★ (2026-09-18 사장님).
   *   순번(`rank`)은 ★그 라운드에서 우리 팀이 몇 번째로 잡았나★ 다 — 경기 전체가 아니다.
   *   13라운드에 난 킬도 그 라운드의 첫 킬이면 `Early` 라, 「경기초반」 은 거짓말이었다.
   */
  rifleVsSniperEarly: '라운드초반 스나 다운',
  rifleVsSniperLate: '스나 다운',
  sniperVsSniperEarly: '라운드초반 스나 다운',
  sniperVsSniperLate: '스나 다운',
  bombWin: '폭탄설치 후 승리',
  bombLossB: '폭탄설치(B) 후 패배',
  bombLoss: '폭탄설치(A) 후 패배',
  save1: '1대1 세이브',
  save2: '1대2 세이브',
  save3: '1대3 세이브',
  save4: '1대4 세이브',
  /*
   * ★한 라운드에 셋 이상 잡은 장면★ (2026-09-20 사장님: 「mvp설명 없는 판도 있네」).
   *
   *   실측 — MVP 가 있는 경기 ★757건 중 31건★ 에 설명이 한 줄도 없었고,
   *   그중 ★89%★ 가 ★라플킬만 쌓은 MVP★ 였다 (13킬을 하고도 빈 판이 있었다).
   * ⚠ ★평범한 라플킬을 적는 것이 아니다★ — 사장님이 그건 세지 말라 하셨다.
   *   ★한 라운드 셋 이상★ 만 «굵직한 장면» 으로 본다.
   */
  multi3: '한 라운드 3킬',
  multi4: '한 라운드 4킬',
  multi5: '한 라운드 5킬',
}
/** 값이 큰 것부터 위에 둔다 — 눈이 먼저 가는 자리에 굵직한 장면이 온다 */
const MVP_WHY_ORDER = [
  /* ★한 라운드 5킬은 어떤 스나 다운보다 굵다★ — 맨 위에 둔다 */
  'multi5', 'multi4',
  'rifleVsSniperEarly', 'rifleVsSniperLate',
  'sniperVsSniperEarly', 'sniperVsSniperLate',
  'save4', 'save3', 'save2', 'save1',
  /* 3킬은 흔한 축이라 스나 다운·세이브 아래에 둔다 */
  'multi3',
  'bombWin', 'bombLossB', 'bombLoss',
]

/**
 * ★마지막 라운드는 「12(매치)」 로 적고 빨갛게 칠한다★ (2026-09-18 사장님:
 *   「매치라운드라고만 적지 말고 빨간색으로 만약 매치라운드가 12라운드였으면
 *    12(매치)라운드 이렇게 적아줘」).
 *
 * > 「그냥 게임이 끝난 라운드=매치라운드(맨마지막라운드)」
 *
 * ⚠ 처음에는 숫자를 통째로 「매치」 로 바꿨는데 ★몇 라운드였는지가 사라졌다.★
 *   숫자를 남기고 괄호로 덧붙인다.
 * ⚠ 라운드 수를 모르면 ★숫자 그대로★ 둔다 — 없는 말을 지어내지 않는다 (D-106).
 */
const MATCH_ROUND_COLOR = '#ff6b72'

function RoundsText({ rounds, last }: { rounds: readonly number[]; last: number | null }) {
  return (
    <>
      {rounds.map((r, i) => (
        <Fragment key={r}>
          {i > 0 ? ',' : null}
          {last !== null && r === last ? (
            <span style={{ color: MATCH_ROUND_COLOR }}>{r}(매치)</span>
          ) : (
            r
          )}
        </Fragment>
      ))}
      라운드
    </>
  )
}

export function MvpWhy({ detail }: { detail: MatchDetail }) {
  const why = detail.mvp_why ?? []
  /*
   * ⚠ ★두 팀 라운드를 더하면 안 된다★ (2026-09-19 검수에서 잡았다).
   *   `red_rounds`·`blue_rounds` 는 «이긴 라운드» 수인데 ★승패를 모르는 라운드는
   *   어느 쪽도 안 센다.★ 13라운드 경기에서 둘을 모르면 합이 11 이 되어
   *   ★11라운드에 「(매치)」 가 찍힌다.★
   *   `total_rounds` 는 ★이벤트로 확인된 라운드 수★ 라 그런 라운드도 센다.
   * ⚠ 모르면 `null` — ★아무 라운드도 안 칠한다.★ 없는 말을 지어내지 않는다 (D-106).
   */
  const lastRound = detail.total_rounds
  if (why.length === 0) return null
  const name = [...detail.red, ...detail.blue].find((e) => e.player_id === detail.mvp_player_id)?.name ?? null
  if (name === null) return null
  const rows = MVP_WHY_ORDER.filter((k) => why.some((w) => w.kind === k)).map((k) => {
    const hit = why.find((w) => w.kind === k) as { rounds: number[]; points: number }
    return { key: k, rounds: hit.rounds, points: hit.points }
  })
  return (
    <div style={{ margin: '10px 14px 14px', border: `1px solid ${V3.gold}`, borderRadius: 3, background: 'linear-gradient(180deg, rgba(255,216,61,.08), rgba(255,216,61,.02))', padding: '11px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '.1em', color: V3.gold }}>MVP</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#ffe89a' }}>{name}</span>
        <span style={{ fontSize: 11, color: '#6b7794' }}>왜 MVP 인가</span>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '3px 12px', fontSize: 12 }}>
        {rows.map((r) => (
          <Fragment key={r.key}>
            <span style={{ color: V3.gold, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              <RoundsText rounds={r.rounds} last={lastRound} />
            </span>
            <span style={{ color: '#9aa6bf' }}>{MVP_WHY_LABEL[r.key] ?? r.key}</span>
            <span style={{ color: '#e2e5ee', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              +{r.points}점
            </span>
          </Fragment>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 10.5, color: '#6b7794' }}>
        평범한 1점짜리 라플킬은 빼고, 값이 큰 것만 적었습니다.
      </p>
    </div>
  )
}


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
  /*
   * ★선짤 점수★ (2026-09-20 사장님) — 레드/블루마다 상벌이 다르다.
   *
   * ⚠ ★「선짤」 이라는 말만으로는 뜻이 안 통한다★ — 같은 선짤이라도 레드에서 낸 것과
   *   블루에서 스나를 잡은 것은 ★받는 점수가 다르다.★ 그래서 진영을 함께 적는다.
   * ⚠ ★0점짜리는 애초에 안 담긴다★ (워커) — 22초를 넘겼거나 라플을 잡아 상이 없는 줄은
   *   적어 봐야 줄만 길어진다. 「평범한 1점짜리 라플킬은 세지 마라」 와 같은 규칙이다.
   */
  openRedKill: '레드 라운드초반 선짤',
  openRedDeath: '레드 라운드초반 선짤당함',
  openBlueSniperKill: '블루 상대 스나 선짤',
  openBlueSniperDeath: '블루 스나가 선짤당함',
  openBlueRifleDeath: '블루 라플이 선짤당함',
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
  /* ★선짤★ (2026-09-20) — 벌점이 먼저 눈에 띄게 아래쪽에 둔다 */
  'openBlueSniperKill', 'openRedKill',
  'openBlueSniperDeath', 'openRedDeath', 'openBlueRifleDeath',
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

/**
 * ★전반/후반을 앞에 적는다★ (2026-09-20 사장님:
 *   「전반1라운드 후반12라운드 이런식으로 ★전반전인지 후반전인지★ 써줘」).
 *
 *   `secondHalfFrom` 이 8 이면 ★1~7이 전반, 8부터 후반★ 이다.
 *
 * ⚠ ★모르면 안 적는다★ (D-106) — 틀린 반을 적느니 숫자만 적는 편이 낫다.
 * ⚠ ★한 줄에 전·후반이 섞이면 반을 안 적는다★ — 「전반 5,12라운드」 는 거짓이다.
 *   그런 줄은 숫자만 적는다.
 */
export function halfLabelOf(rounds: readonly number[], from: number | null): string | null {
  if (from === null || rounds.length === 0) return null
  const firsts = rounds.filter((r) => r < from).length
  if (firsts === rounds.length) return '전반'
  if (firsts === 0) return '후반'
  return null
}

function RoundsText({
  rounds,
  last,
  secondHalfFrom,
}: {
  rounds: readonly number[]
  last: number | null
  secondHalfFrom: number | null
}) {
  const half = halfLabelOf(rounds, secondHalfFrom)
  return (
    <>
      {half === null ? null : <span style={{ color: HALF_COLOR }}>{half} </span>}
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

/** 전반/후반 글자색 — 금색(라운드 숫자)보다 조용하게 둔다 */
const HALF_COLOR = V3.textDim

/**
 * ★부호를 한 번만 붙인다★ (2026-09-20 사장님: 「왜 +-로 돼있어 선짤이」).
 *
 * 옛 판은 `+{점수}점` 이라 값이 `-1` 이면 ★「+-1점」★ 이 됐다.
 * 선짤이 들어오기 전에는 점수가 늘 양수라 안 드러났다.
 */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
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
  /*
   * ★★점수 큰 것부터 · 0점은 한 줄로 몰아서★★ (2026-09-20 사장님: 「가) 로 하고」)
   *
   * ── 무엇이 부산스러웠나 (사장님이 화면을 보고 짚으셨다)
   *
   *     전반 8라운드     한 라운드 4킬             ★+0점★
   *     전반 6,8라운드   라운드초반 스나 다운       +10점
   *     후반 11라운드    스나 다운                  +3점
   *     전반 2라운드     한 라운드 3킬             ★+0점★
   *     전반 1라운드     레드 라운드초반 선짤당함   ★+-1점★
   *
   *   ① 다섯 줄이 ★같은 무게★ 로 보여 무엇이 중요한지 안 보였다
   *   ② ★「+0점」 이 세 줄★ — 「한 라운드 4킬」 은 점수가 아니라 ★장면★ 인데
   *      점수 칸에 앉아 있었다
   *   ③ 「전반」 이 ★네 번★ 반복됐다
   *   ④ 라운드·설명·점수가 ★세 칸으로 흩어져★ 눈이 좌우로 오갔다
   *
   * ── (가) 안
   *
   *     ★점수를 왼쪽★ 에 둔다 — 눈이 ★세로로만★ 움직인다
   *     ★큰 것부터★ — 위 두 줄만 봐도 왜 MVP 인지 안다
   *     ★0점짜리는 맨 아래 한 줄★ 로 몬다 (「·」 로 표시)
   *     라운드는 ★오른쪽 작은 글씨★ — 궁금할 때만 본다
   */
  const all = MVP_WHY_ORDER.filter((k) => why.some((w) => w.kind === k)).map((k) => {
    const hit = why.find((w) => w.kind === k) as { rounds: number[]; points: number }
    return { key: k, rounds: hit.rounds, points: hit.points }
  })
  /* 점수가 있는 줄 — ★큰 것부터★. 같으면 원래 차례(값의 무게순)를 지킨다 */
  const scored = all.filter((r) => r.points !== 0).sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
  /* 점수가 0인 줄 — ★굵직한 장면★ 이지 점수가 아니다. 맨 아래 한 줄로 몬다 */
  const scenes = all.filter((r) => r.points === 0)
  const total = scored.reduce((sum, r) => sum + r.points, 0)

  return (
    <div style={{ margin: '10px 14px 14px', border: `1px solid ${V3.gold}`, borderRadius: 3, background: 'linear-gradient(180deg, rgba(255,216,61,.08), rgba(255,216,61,.02))', padding: '11px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '.1em', color: V3.gold }}>MVP</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#8a6a12' }}>{name}</span>
        <span style={{ fontSize: 11, color: V3.textMuted }}>왜 MVP 인가</span>
      </div>

      {/*
        ★한 문장 먼저★ — 줄을 읽기 전에 「무엇으로 벌었나」 를 먼저 안다.
        ⚠ ★없는 말을 지어내지 않는다★ — 가장 크게 번 줄의 이름을 그대로 쓴다.
      */}
      {scored.length > 0 && scored[0] !== undefined ? (
        <p style={{ margin: '5px 0 0', fontSize: 13, fontWeight: 700, color: '#8a6a12' }}>
          {MVP_WHY_LABEL[scored[0].key] ?? scored[0].key}
          {scored[0].rounds.length > 1 ? ` ${scored[0].rounds.length}회` : ''}
          <span style={{ color: V3.textDim, fontWeight: 400 }}> · 합 {signed(total)}점</span>
        </p>
      ) : null}

      {/* ★점수를 왼쪽에★ — 눈이 세로로만 움직인다 */}
      <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '4px 10px', fontSize: 12, alignItems: 'baseline' }}>
        {scored.map((r) => (
          <Fragment key={r.key}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                textAlign: 'right',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                color: r.points < 0 ? MATCH_ROUND_COLOR : V3.textStrong,
              }}
            >
              {signed(r.points)}
            </span>
            <span style={{ color: V3.textDim, wordBreak: 'keep-all' }}>{MVP_WHY_LABEL[r.key] ?? r.key}</span>
            <span style={{ fontSize: 10.5, color: V3.textMuted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              <RoundsText rounds={r.rounds} last={lastRound} secondHalfFrom={detail.second_half_from ?? null} />
            </span>
          </Fragment>
        ))}
        {scenes.length > 0 ? (
          <Fragment>
            <span style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', color: V3.textFaint }}>·</span>
            <span style={{ color: V3.textMuted, wordBreak: 'keep-all' }}>
              {scenes.map((r) => MVP_WHY_LABEL[r.key] ?? r.key).join(' · ')}
            </span>
            <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              <RoundsText
                rounds={[...new Set(scenes.flatMap((r) => r.rounds))].sort((a, b) => a - b)}
                last={lastRound}
                secondHalfFrom={detail.second_half_from ?? null}
              />
            </span>
          </Fragment>
        ) : null}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 10.5, color: V3.textMuted }}>
        평범한 1점짜리 라플킬은 빼고, 값이 큰 것만 적었습니다.
      </p>
    </div>
  )
}


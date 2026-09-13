/**
 * ★★IPL 티어 — 사장님이 직접 나눈 것★★ (2026-09-10 확정)
 *
 * > «티어는 네개 Spectra Astra challenger1 challenger2» → 회의 중 SPECTRA 를 없애고
 * > ★셋으로 확정★ 했다. «hing 아스트라에 넣고 아더에러 챌린저로 내리고 셀레셜도 챌린저로 내려»
 * > «아이딜릭 빼라 힝은 살려» · «걍 아예 삭제해 필요없어»
 *
 * ── ★값을 여기 한 곳에만 둔다★
 *   화면·집계·순위가 전부 이 파일을 본다. 두 곳에 적으면 조용히 갈라진다.
 *
 * ── ⚠ 옛 티어(6단계)는 `LeagueClan.division` 에 그대로 있었다.
 *   이제 ★1=ASTRA · 2=CHALLENGER1 · 3=CHALLENGER2★ 로 다시 쓴다.
 *   옛 값은 반영 전에 백업 파일로 남긴다.
 */

/** 화면에 쓰는 이름 */
export const TIER_NAME = {
  1: 'ASTRA',
  2: 'CHALLENGER1',
  3: 'CHALLENGER2',
} as const

export type TierNo = 1 | 2 | 3

/** ASTRA — 12곳 */
export const ASTRA: readonly string[] = [
  'igloo',
  'deluxe',
  'vuvuzela',
  'sometimes',
  'hardcores',
  'grave',
  '〃veritas',
  'methodcrew',
  'evermore',
  'luvme',
  'amaryllis',
  'hingˇ',
]

/** CHALLENGER1 — 16곳 */
export const CHALLENGER1: readonly string[] = [
  'pleniIune',
  'dominator:',
  'Рromise',
  'whitelie:',
  'izmir-',
  'Major-',
  'vAN`kA',
  'crucialrz',
  'nightbloom',
  'imperium:',
  'reBelIion',
  'QuasaR-',
  '레트로폭탄',
  'Atraxia',
  'adererror',
  'ceIestial',
]

/** CHALLENGER2 — 14곳 */
export const CHALLENGER2: readonly string[] = [
  'souffler',
  'publicity',
  'romantico',
  'Envy',
  'supernova^',
  'recent.wct-',
  'NeedΒackup',
  "Raze'",
  'Lyrical:',
  'overstep',
  '베이직',
  'everwhite',
  'FlexibIe',
  'Asterisk',
]

/** ★IPL 에서 뺀 클랜★ — 사장님 «아이딜릭 빼라» · «걍 아예 삭제해» */
export const REMOVED: readonly string[] = ['idylic']

/** 클랜 이름 → 티어 번호 */
export const TIER_OF: ReadonlyMap<string, TierNo> = new Map<string, TierNo>([
  ...ASTRA.map((n) => [n, 1] as [string, TierNo]),
  ...CHALLENGER1.map((n) => [n, 2] as [string, TierNo]),
  ...CHALLENGER2.map((n) => [n, 3] as [string, TierNo]),
])

/**
 * ★개인 점수의 티어 가중치★ (사장님 «맞음»).
 *
 * 옛 값은 네 등급이었다 — Spectra TOP3 1.000 · Spectra 0.991 · Astra 0.367 · Bedrock 0.347.
 * SPECTRA 를 없앴으므로 ★한 칸씩 올린다.★ TOP3 특별대우는 뺐다.
 *
 * 뜻: ★ASTRA 를 상대한 한 판이 CHALLENGER 를 상대한 한 판의 2.7배★ 다.
 */
export const TIER_WEIGHT: Readonly<Record<TierNo, number>> = { 1: 1.0, 2: 0.367, 3: 0.347 }

/** ★클랜 점수의 티어 기준점★ — 간격 200 (사장님 «200으로해») */
export const TIER_ANCHOR: Readonly<Record<TierNo, number>> = { 1: 3200, 2: 3000, 3: 2800 }

/**
 * ★개인 점수의 출발점★ (사장님 «3000시작»).
 *
 * 공식이 내는 원점수는 145 · 141 처럼 작은 수라 화면의 다른 점수와 자릿수가 다르다.
 * 그래서 3000 을 더해 ★3145점★ 처럼 보이게 한다. ★줄 세우는 순서는 하나도 안 바뀐다.★
 */
export const PLAYER_BASE = 3000

/* ── 공식 상수 — `docs/RANKING_V3_SPEC.md` 의 후보 D. 언덕오르기로 맞춘 값이다 ── */
export const ELO_K = 50
export const ELO_DIV = 400
export const ELO_INIT = 3000
export const ELO_FLOOR = 1000
/** 판수 항 */
export const VOLUME_COEF = 13.6
export const VOLUME_POW = 0.67
/** 성적 항 — `승 − 0.5 × 판수` */
export const RESULT_COEF = 6.4
/** 총 판수 브레이크 (음수다 — 많이 뛴다고 오르지 않게) */
export const TOTAL_PENALTY = 18.6
/** 클랜 점수의 경기수 보정 분모 */
export const CLAN_GAMES_DIV = 50

/** 그 선수의 원점수 (3000 을 더하기 전) */
export function playerRawScore(byTier: Partial<Record<TierNo, { games: number; win: number }>>): number {
  let score = 0
  let total = 0
  for (const key of [1, 2, 3] as const) {
    const v = byTier[key]
    if (!v || v.games === 0) continue
    score +=
      TIER_WEIGHT[key] *
      (VOLUME_COEF * Math.pow(v.games, VOLUME_POW) + RESULT_COEF * (v.win - 0.5 * v.games))
    total += v.games
  }
  if (total === 0) return 0
  return score - TOTAL_PENALTY * Math.sqrt(total)
}

/**
 * ★도전 가산★ (2026-09-12 사장님: «지더라도 가산을 좀 주긴 해야해 윗구간이랑 하는건»)
 *
 * ── 왜 Elo 안에 안 넣었나
 *   K 를 승패에 따라 다르게 주면 ★주고받는 총합이 0 이 아니게 되어 점수가 통째로 부푼다.★
 *   실측 — 윗 구간 승 ×1.3 / 패 ×0.7 로 돌리니 CHALLENGER1 1위가 31.8층 → 33.6층이 됐다.
 *   층 눈금(2층마다 색)이 통째로 흔들린다. 그래서 ★Elo 는 한 글자도 안 건드리고★
 *   점수 식 밖에 따로 더한다.
 *
 * ── 무엇을 세나
 *   ★윗 구간 클랜과 붙은 판수★ 다. 이기고 지고는 안 본다 — 이긴 값은 Elo 가 이미 센다.
 *   사장님 말대로 ★지더라도★ 도전 자체를 쳐 주는 자리다.
 *
 * ── 왜 제곱근인가
 *   많이 붙을수록 오르되 ★점점 덜 오른다.★ 일부러 윗 구간에 져 주며 점수를 벌 수 없다.
 *   실측(2026-09-12 · CHALLENGER1) — 윗 판이 가장 많은 Atraxia 가 63판이라 가산 111점(1.1층)이다.
 *   윗 구간과 한 판도 안 붙은 vAN`kA 는 ★0점★ 이라 5위에서 8위 밖으로 밀린다.
 *
 * ⚠ ★지금은 0 이라 아무 일도 안 한다.★ 사장님이 세기를 고르면 켠다 —
 *   약하게 8 · 세게 20 두 안을 실측으로 보여 드렸고 (2026-09-12), 아직 답을 안 받았다.
 *   0 이면 옛 판과 한 점도 다르지 않다 (`CLAUDE.md` 1-4).
 */
export const CHALLENGE_BONUS = 0

/**
 * ★인원수 규칙★ (2026-09-12 사장님)
 *
 * > «a팀은 클원2 b팀 클원3 이건 정상 기록, 근데 a팀2 b팀2 or a팀1 b팀3 이건
 * >  원래 받을 점수의 10퍼센트만 줘버려 (IPL에만 적용) 클랜점수와 개인점수 모두»
 *
 * 사장님이 ㉠ 로 확정 — ★양 팀 클랜원을 합쳐 `MIN_MEMBERS` 명 이상이면 정상★ 이다.
 * 2+3=5 정상 · 2+2=4 깎임 · 1+3=4 깎임 — 주신 예 셋이 이 규칙으로 전부 맞는다.
 *
 * 클랜원 = 그 경기에서 선 팀의 클랜이 ★자기 도장(`MatchPlayerStat.playerClanId`)★ 인 사람.
 * 용병은 안 센다. 도장이 없으면 클랜원이 아니다 (지어내지 않는다).
 *
 * 실측 (2026-09-12 · IPL 시즌0 2,889판) — 깎이는 판 ★53판 (1.8%)★.
 * 5:5 가 1,199판 · 4:5 가 867판이라 대부분은 그대로다.
 *
 * ⚠ IPL(`nolink`) 에만 먹인다. SPL·열산은 손대지 않는다.
 * ⚠ `WEIGHT` 를 1 로 두면 규칙이 꺼진다 (`CLAUDE.md` 1-4).
 */
export const MIN_MEMBERS = 5
export const SHORT_MEMBER_WEIGHT = 0.1

/**
 * ★클랜 점수 — 구간 안 백분위 셋을 섞는다★ (2026-09-12 사장님 확정)
 *
 * ── 왜 바꿨나
 *   사장님이 클랜 순위를 ★손으로 직접 세워★ 두 번 저장해 주셨다. 그 차례를 읽어 보니
 *   윗 구간과 얼마나 붙었나가 제일 크다 · 판수가 적으면 위로 못 간다 · 승률은 거의 안 본다
 *   CHALLENGER2 는 ★윗판 많은 순과 한 짝도 안 틀렸다.★
 *   옛 공식(Elo × √(판수/50))으로 낸 차례는 사장님 차례와 47% 가 뒤집혀 있었다.
 *
 * ── 왜 백분위인가
 *   Elo·윗판·판수는 단위가 달라 그냥 못 더한다. 또 가산을 크게 얹으면
 *   ★층수가 48층까지 부풀어★ 2층마다 정한 색이 통째로 깨진다 (실측).
 *   구간 안에서 몇 등인지(−1~+1)로 바꿔 섞으면 점수가 ★기준점 ±3층★ 안에 머문다.
 *   실측 — 25.4~32.0층. 옛 판(26.5~34.6층)과 거의 같다.
 *
 * ── 얼마나 맞나
 *   사장님 차례와 ★85.5% 일치★ (뒤집힌 짝 30/207). 옛 공식은 52.7% 였다.
 *   CHALLENGER1 아래 넷과 CHALLENGER2 여섯 자리가 정확히 같다.
 *
 * ⚠ 옛 공식은 `clanScoreV1` 로 남긴다 (`CLAUDE.md` 1-4).
 */
export const CLAN_SPREAD = 300
/**
 * ⚠ ★2026-09-13 — 실력(래더) 몫을 올렸다★ (사장님: «승률비중 0.35로 올린»).
 *
 * 사장님이 클랜랭킹을 보고 «승률 낮은 클랜이 왜 위에 있나» 를 물으셨다. 까닭은
 * 윗판(0.65)이 너무 커서였다 — 센 상대와 많이 붙은 쪽이 승률을 눌렀다.
 * 실력을 0.20 → 0.35 로 올리고 남은 0.65 를 윗판·판수에 ★같은 비율로★ 나눴다.
 *
 *   옛 값: 실력 0.20 · 윗판 0.65 · 판수 0.15  (2026-09-12, 사장님이 손으로 매긴 순위에서 역산)
 *   지금:  실력 0.35 · 윗판 0.53 · 판수 0.12
 *
 * 세 값의 합은 ★1.00 이어야 한다.★ 안 그러면 구간 기준점에서 벗어난다.
 */
/**
 * ⚠ ★2026-09-13 — 사장님이 35곳을 손으로 다시 세우셨고, 거기에 맞춰 다시 짰다.★
 *
 *   조절판(아티팩트)에서 구간별로 직접 차례를 세워 저장해 주셨다. 그 차례에
 *   비중을 0.05 칸으로 전부 훑어 맞췄다 (뒤집힌 짝이 가장 적은 조합).
 *   ⚠ 동점은 ★0.5 틀림★ 으로 센다 — ASTRA 는 윗판이 전원 0 이라 동점을 「맞음」 으로
 *     세면 «윗판만 써도 88.9% 일치» 같은 거짓말이 나온다. 실제로 한 번 그랬다.
 *
 * ── 나온 것 (사장님 차례와 얼마나 맞나)
 *   ```
 *   옛 공식 (0.20/0.65/0.15)                  78.5%
 *   어제 값 (0.35/0.53/0.12)                  72.9%   ← 오히려 더 멀어졌다
 *   지금    (아래 값 + 판수 벌점)              93.7%   (ASTRA 98 · C1 90 · C2 100)
 *   ```
 *
 * ── 배운 것 셋
 *   ① ★승률을 실제로 보고 계셨다.★ 지금까지 공식에 ★아예 안 들어가 있었다.★
 *      그래서 «승률 낮은 클랜이 왜 위에 있나» 가 계속 나왔던 것이다.
 *   ② ★Elo(실력)는 거의 안 보신다.★ Elo 하나로만 세우면 53.6% — 동전 던지기와 비슷하다.
 *      0.05 만 남겼다. 0.10 을 줘도 92.8% 라 크게 다르지 않지만, 데이터가 말하는 대로 둔다.
 *   ③ ★판수는 「많아서 올라가는」 게 아니라 「적으면 내려가는」 것이다.★
 *      hingˇ 는 Elo 3182(ASTRA 2위) · 승률 63% 인데 ★30판★ 이라 사장님이 ★꼴찌★ 로 두셨다.
 *      더하는 축(`CLAN_W_GAMES`)으로는 이게 안 나온다 — 벌점이라야 나온다.
 */
export const CLAN_W_ELO = 0.05
export const CLAN_W_UP = 0.65
export const CLAN_W_GAMES = 0.05
/** ★새 축★ — 구간 안 승률 백분위 (2026-09-13). 0 으로 두면 옛 판처럼 승률을 안 본다 */
export const CLAN_W_RATE = 0.25

/**
 * ★판수 벌점★ — 판이 모자란 만큼만 ★아래로 당긴다★ (2026-09-13).
 *
 *   당김 = `CLAN_SHY_PULL × max(0, 1 − 판수 / CLAN_SHY_GAMES)`
 *
 * 80판을 채우면 벌점이 0 이고, 0판이면 −1.2(섞은 값의 전체 폭보다 크다)다.
 * 벼랑(문턱)이 아니라 ★비스듬한 언덕★ 이라 79판과 81판이 확 안 갈린다.
 * `CLAN_SHY_PULL` 을 0 으로 두면 규칙이 꺼진다 (`CLAUDE.md` 1-4).
 *
 * ── ⚠ 층수 폭이 넓어졌다 (실측 2026-09-13)
 *   21.9 ~ 32.8층. 벌점이 없던 옛 판은 25.4~32.0 이었다.
 *   아래로 벌어진 것은 ★열 판 안팎만 뛴 클랜 넷★ 이다 (NeedΒackup 9판 · recent.wct- 10판 ·
 *   romantico 11판 · nightbloom 15판). 사장님이 직접 꼴찌로 두신 클랜들이라 ★맞는 방향★ 이고,
 *   26층 아래는 `FLOOR_BELOW`(회색)가 이미 맡고 있어 색이 깨지지 않는다 —
 *   오히려 «아직 판이 모자란다» 가 색으로 드러난다.
 *   위쪽은 32.8층이라 색표(46층까지) 안에 넉넉히 들어간다.
 */
export const CLAN_SHY_GAMES = 80
export const CLAN_SHY_PULL = 1.2

/** ★옛 값★ (2026-09-12) — 되돌릴 때 이 셋을 위에 넣고 `CLAN_SHY_PULL` 을 0 으로 */
export const CLAN_W_V2 = { elo: 0.2, up: 0.65, games: 0.15 } as const
/** ★어제 값★ (2026-09-13 낮) — 실력 0.35. 사장님 차례와 72.9% 였다 */
export const CLAN_W_V3 = { elo: 0.35, up: 0.53, games: 0.12 } as const

/**
 * `unit*` 넷은 ★그 구간 안 백분위★ 를 −1~+1 로 편 값이다.
 * 부르는 쪽(`iplRankApply`)이 구간마다 한 번 계산해서 넘긴다.
 * `games` 만 ★백분위가 아니라 진짜 판수★ 다 — 벌점이 「몇 판 뛰었나」를 직접 보기 때문이다.
 */
export function clanScore(
  tier: TierNo,
  unitElo: number,
  unitUp: number,
  unitGames: number,
  unitRate = 0,
  games = Number.POSITIVE_INFINITY,
): number {
  const mix =
    CLAN_W_ELO * unitElo +
    CLAN_W_UP * unitUp +
    CLAN_W_GAMES * unitGames +
    CLAN_W_RATE * unitRate
  /* 판이 모자란 만큼 아래로. 다 채웠으면 0 이다 */
  const shy = CLAN_SHY_PULL * Math.max(0, 1 - games / CLAN_SHY_GAMES)
  return TIER_ANCHOR[tier] + CLAN_SPREAD * (mix - shy)
}

/**
 * ★어제 판★ — 승률도 판수 벌점도 없던 셋뿐인 공식 (2026-09-13 낮). 지우지 않는다.
 */
export function clanScoreV3(tier: TierNo, unitElo: number, unitUp: number, unitGames: number): number {
  return (
    TIER_ANCHOR[tier] +
    CLAN_SPREAD * (CLAN_W_V3.elo * unitElo + CLAN_W_V3.up * unitUp + CLAN_W_V3.games * unitGames)
  )
}

/**
 * ★옛 공식★ — 기준점 + (Elo − 3000) × √(판수/50) + 도전가산. 지우지 않는다.
 */
export function clanScoreV1(tier: TierNo, elo: number, games: number, upGames = 0): number {
  return (
    TIER_ANCHOR[tier] +
    (elo - ELO_INIT) * Math.sqrt(games / CLAN_GAMES_DIV) +
    CHALLENGE_BONUS * Math.sqrt(Math.max(0, upGames))
  )
}

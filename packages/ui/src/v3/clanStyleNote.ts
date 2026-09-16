/**
 * ★클랜평 세 마디★ — 유형 · 템포 · 강한 축 (2026-09-12 사장님 확정)
 *
 * > «유형 템포 강한 축 ㄱㄱ / 유형이름을 완성형 · 오더플레이 · 스나중심 ·
 * >  성장가능성 - 그나마 높은 성향을 칭찬해줘»
 *
 * ── 왜 이렇게 갈랐나 (IPL 41개 클랜 실측 · 2026-09-12)
 *   여섯 축 중 ★다섯이 한 덩어리★ 다 — 소수싸움·세이브·라이플화력·선짤·교환율이
 *   (옛 넷째는 게임템포였다 · 2026-09-15 에 바뀜)
 *   서로 r = 0.41 ~ 0.74 로 붙어 다닌다. 잘하는 클랜은 다섯이 같이 높다.
 *   그 다섯을 「운영」 하나로 묶는다.
 *
 *   ★스나싸움만 따로 논다★ — 다른 축과 r ≤ 0.35, 승률과는 r = 0.22 뿐이다.
 *   레트로폭탄은 스나 96 · 운영 23, nightbloom 은 스나 4 · 운영 54 다.
 *   그래서 두 번째 축으로 세운다.
 *
 *   두 축을 50% 에서 자르면 41개가 12 / 10 / 9 / 10 으로 갈린다 — 한쪽으로 안 쏠린다.
 *
 * ⚠ 사장님이 주신 넷째 템포 문장은 원래 «…빠른편이며 소수싸움이 강합니다» 였다.
 *   뒷말을 뗐다 — ③ 강한 축이 이미 그 말을 하고, 템포만 빠르고 소수싸움이 하위권인
 *   클랜에도 붙어 거짓이 되기 때문이다. 원문은 아래 \`TEMPO_LINES_V1\` 에 남긴다.
 */
import type { ClanHexagonV2 } from '@sacloud/contract'

/** 「운영」을 이루는 다섯 축 — 스나싸움만 뺀 전부 */
/* ⚠ ★2026-09-15★ — `tempo` → `riflePower` (사장님이 ④ 를 바꿈). 옛 배열은 `CLAN_CORE_AXES_V1` */
/* ⚠ 2026-09-16 — ⑤ 가 선짤에서 스나영향력으로 (사장님). 옛 판은 아래 `_V1` */
export const CLAN_CORE_AXES = ['outnumbered', 'save', 'riflePower', 'sniperInfluence', 'trade'] as const
/** 2026-09-15 까지 쓰던 다섯. **지우지 않는다** (`CLAUDE.md` 1-4) */
export const CLAN_CORE_AXES_V1 = ['outnumbered', 'save', 'tempo', 'firstBlood', 'trade'] as const

/** 유형을 가르는 경계 (백분위 %) */
export const CLAN_TYPE_CUT = 50

export const CLAN_AXIS_LABEL: Readonly<Record<string, string>> = {
  sniperDuel: '스나싸움',
  outnumbered: '소수싸움',
  save: '세이브',
  riflePower: '라이플화력',
  sniperInfluence: '스나영향력',
  trade: '백어택성공률(2턴)',
}

/**
 * ★둘째 마디 다섯 칸★ — 위에서부터 [백분위 하한, 문장].
 *
 * ⚠ ★2026-09-15 — 무엇을 말하는 줄인지가 바뀌었다★
 *   사장님이 ④ 를 게임템포에서 **라이플화력**으로 바꿨다. 둘째 마디를 옛 문장
 *   («어택속도가 빠른편입니다»)으로 두면 ★이제 아무 데이터도 안 보고 말하는 줄★ 이
 *   된다 — 게임템포 백분위가 육각에 없으니 늘 맨 아래 칸으로 굳는다.
 *   그래서 문장을 **새 축이 실제로 재는 것**으로 갈았다. 옛 문장은 아래에 남는다.
 *
 *   ★가정★: 사장님은 «게임템포를 삭제» 라고 하셨으므로 그 축이 하던 말도 함께
 *   내린다고 봤다. 세 마디 틀(유형 · 둘째 · 강한 축)은 그대로다.
 */
export const TEMPO_LINES: readonly (readonly [number, string])[] = [
  [80, '스나가 지워져도 라플들이 라운드를 되찾아옵니다'],
  [60, '스나가 무너진 뒤에도 라이플이 버텨 줍니다'],
  [40, '스나가 빠지면 버티는 힘이 보통입니다'],
  [20, '스나가 일찍 빠지면 라운드가 흔들립니다'],
  [0, '스나가 지워지면 라운드를 거의 놓칩니다'],
]

/** ★2026-09-15 까지 쓰던 «어택속도» 문장★ — 게임템포가 ④ 이던 때의 것이다 */
export const TEMPO_LINES_V2: readonly (readonly [number, string])[] = [
  [80, '어택속도가 매우빠르고 바로바로 결과를 내는 것을 선호합니다'],
  [60, '어택속도와 게임전개가 빠른편입니다'],
  [40, '어택속도와 게임전개가 보통입니다'],
  [20, '어택속도와 게임전개가 느린편입니다'],
  [0, '어택속도가 느리고 결과에 따른 침착한 전개를 선호합니다'],
]

/** ★사장님 원문★ — 넷째 줄에 «소수싸움이 강합니다» 가 붙어 있었다 (2026-09-12) */
export const TEMPO_LINES_V1: readonly (readonly [number, string])[] = [
  [80, '어택속도가 매우빠르고 바로바로 결과를 내는 것을 선호합니다'],
  [60, '어택속도와 게임전개가 빠른편이며 소수싸움이 강합니다'],
  [40, '어택속도와 게임전개가 보통입니다'],
  [20, '어택속도와 게임전개가 느린편입니다'],
  [0, '어택속도가 느리고 결과에 따른 침착한 전개를 선호합니다'],
]

export type ClanStyleType = '완성형' | '오더플레이' | '스나중심' | '성장가능성'

export interface ClanStyleNote {
  type: ClanStyleType
  /** 유형 한 줄 설명 */
  typeNote: string
  tempo: string
  /** 「특히 소수싸움이 강합니다」 · 성장가능성이면 「그중 …가 가장 낫습니다」 */
  praise: string
}

const TYPE_NOTE: Readonly<Record<ClanStyleType, string>> = {
  완성형: '모든 상황에서 고르게 강합니다',
  오더플레이: '스나 싸움에 기대지 않고 팀 단위 운영으로 이깁니다',
  스나중심: '스나가 열리면 흐름을 가져옵니다',
  성장가능성: '아직 표본이 쌓이는 중입니다',
}

/**
 * 여섯 축을 받아 세 마디를 만든다. ★한 축이라도 못 쟀으면 \`null\`★ —
 * 반쪽 자료로 클랜을 평하지 않는다 (D-106).
 */
export function clanStyleNote(hex: ClanHexagonV2 | null): ClanStyleNote | null {
  if (!hex) return null
  const pct = new Map<string, number>()
  for (const axis of hex.axes) if (axis.value !== null) pct.set(axis.key, axis.value * 100)
  if (pct.size < 6) return null

  const core = CLAN_CORE_AXES.reduce((sum, key) => sum + (pct.get(key) ?? 0), 0) / CLAN_CORE_AXES.length
  const sniper = pct.get('sniperDuel') ?? 0
  const type: ClanStyleType =
    core >= CLAN_TYPE_CUT ? (sniper >= CLAN_TYPE_CUT ? '완성형' : '오더플레이') : sniper >= CLAN_TYPE_CUT ? '스나중심' : '성장가능성'

  const tempoPct = pct.get('riflePower') ?? 0
  const tempo = TEMPO_LINES.find(([low]) => tempoPct >= low)?.[1] ?? TEMPO_LINES[TEMPO_LINES.length - 1]![1]

  /* 제일 높은 축 하나. 같은 값이면 앞선 축이 이긴다 (차례는 계약이 정한 그대로) */
  let best = hex.axes[0] ?? null
  for (const axis of hex.axes) {
    if (axis.value === null) continue
    if (best === null || best.value === null || axis.value > best.value) best = axis
  }
  if (best === null) return null
  const label = CLAN_AXIS_LABEL[best.key] ?? best.label
  /**
   * ★성장가능성은 「낫다」가 아니라 「자란다」★ (2026-09-12 사장님:
   * «그중 교환율이 가장 낮습니다 빼고 / 교환율에서 성장가능성을 보입니다 라고 써줘»).
   *
   * 하위권 클랜의 «제일 나은 축» 도 리그에서 보면 여전히 아래쪽이다 — 등수를 붙이면
   * 칭찬이 아니라 지적이 된다. 그래서 이 유형만 등수를 안 적는다.
   */
  const praise =
    type === '성장가능성'
      ? `${label}에서 성장가능성을 보입니다`
      : `특히 ${label}이 강합니다${best.rank === null ? '' : ` (${best.rank}위)`}`

  return { type, typeNote: TYPE_NOTE[type], tempo, praise }
}

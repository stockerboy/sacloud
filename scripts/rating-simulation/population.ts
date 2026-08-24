/**
 * 가상 선수·클랜 생성.
 *
 * ── 핵심 규칙: **hidden skill 은 rating 공식이 볼 수 없다**
 *   실력은 오직 경기 결과를 통해서만 추정돼야 한다. 공식이 latent 값을 직접 읽으면
 *   "잘하는 사람이 위에 온다"는 결론은 동어반복이 된다.
 *   그래서 `latentSkill` 은 경기 생성에만 쓰고, 채점에는 절대 넘기지 않는다.
 *
 * ── 역할군을 두는 이유
 *   스나이퍼는 구조적으로 킬·KD·MVP 가 유리할 수 있다. 같은 실력인데 포지션만으로
 *   순위가 올라간다면 그건 퍼포먼스 공식의 결함이다. 검사하려면 역할이 있어야 한다.
 */
import type { Rng } from './rng.js'

export type Role = 'rifler' | 'sniper' | 'support'

export interface SimPlayer {
  id: string
  name: string
  /** **공식이 보면 안 되는** 진짜 실력. 3000 기준 Elo 스케일 */
  latentSkill: number
  role: Role
  /** 이 선수가 소속된 클랜 (없으면 무소속) */
  clanId: string | null
  /** 이번 시즌에 뛸 목표 경기 수 */
  targetGames: number
  /** 시나리오 검증용 꼬리표. 없으면 일반 모집단 */
  archetype?: string
  /** 상대를 고르는 성향 — 1이면 강자를 자주 만나고, -1이면 약자만 만난다 */
  opponentBias: number
}

export interface SimClan {
  id: string
  name: string
  /** 공식이 보면 안 되는 클랜 실제 전력 */
  latentStrength: number
  /** 이 클랜이 한 경기에 데려오는 평균 본클랜원 수 (1~5) */
  avgMembers: number
  memberIds: string[]
  targetGames: number
  opponentBias: number
  archetype?: string
}

const ROLES: Role[] = ['rifler', 'sniper', 'support']

/** 실력 계층 — 현실적인 피라미드 (상위가 얇다) */
const SKILL_TIERS: { name: string; share: number; mean: number; sd: number }[] = [
  { name: 'elite', share: 0.04, mean: 3520, sd: 90 },
  { name: 'very strong', share: 0.1, mean: 3300, sd: 80 },
  { name: 'strong', share: 0.18, mean: 3150, sd: 70 },
  { name: 'average', share: 0.4, mean: 3000, sd: 70 },
  { name: 'below average', share: 0.2, mean: 2860, sd: 70 },
  { name: 'weak', share: 0.08, mean: 2700, sd: 90 },
]

const GAME_COUNTS = [20, 30, 40, 60, 90, 120, 150, 180, 250, 400, 600, 1000]

function tierFor(rng: Rng): { mean: number; sd: number } {
  const roll = rng.next()
  let acc = 0
  for (const tier of SKILL_TIERS) {
    acc += tier.share
    if (roll <= acc) return tier
  }
  return SKILL_TIERS[SKILL_TIERS.length - 1]!
}

/**
 * 사용자가 지정한 검증 archetype (22장).
 *
 * `latentSkill` 은 "이 사람이 실제로 얼마나 잘하는가"이고,
 * 승률·KD 는 **그 실력과 상대 분포에서 자연히 나와야 하는 값**이다.
 * 여기서는 실력과 상대 성향만 정하고 결과는 경기로 만든다 —
 * 원하는 승률을 직접 써 넣으면 그건 시뮬레이션이 아니라 그림이다.
 */
interface ArchetypeSpec {
  code: string
  games: number
  latentSkill: number
  role: Role
  opponentBias: number
  /** 이 선수에게 기대하는 판정 (보고서에서 대조한다) */
  expectation: string
}

export const ARCHETYPES: ArchetypeSpec[] = [
  { code: 'A', games: 1000, latentSkill: 2890, role: 'rifler', opponentBias: 0, expectation: '판수만 많다 — 상위권이면 FAIL' },
  { code: 'B', games: 400, latentSkill: 3210, role: 'rifler', opponentBias: 0.7, expectation: '안정적 상위권 후보' },
  { code: 'C', games: 200, latentSkill: 3280, role: 'rifler', opponentBias: 0.3, expectation: '강한 상위권' },
  { code: 'D', games: 150, latentSkill: 3320, role: 'sniper', opponentBias: 0.3, expectation: '상위권 가능' },
  { code: 'E', games: 46, latentSkill: 3400, role: 'sniper', opponentBias: 0.2, expectation: '매우 잘하지만 신뢰도 부족 — 억제돼야 정상' },
  { code: 'F', games: 40, latentSkill: 3480, role: 'rifler', opponentBias: 0.2, expectation: 'internal 높아도 display top1 이면 주의' },
  { code: 'G', games: 200, latentSkill: 3010, role: 'sniper', opponentBias: -0.3, expectation: 'KD만 높다 — top권이면 FAIL' },
  { code: 'H', games: 200, latentSkill: 3300, role: 'support', opponentBias: 0.9, expectation: 'KD 낮아도 강자를 이긴다 — 높을 수 있다' },
  { code: 'I', games: 300, latentSkill: 3090, role: 'rifler', opponentBias: -0.9, expectation: '약자 위주 — 승률 대비 과대평가 금지' },
  { code: 'J', games: 180, latentSkill: 3180, role: 'rifler', opponentBias: 1.0, expectation: '강자만 상대 — 승률보다 높을 수 있다' },
  { code: 'K', games: 150, latentSkill: 2990, role: 'sniper', opponentBias: 0, expectation: 'KD/MVP만 압도 — top10 이면 FAIL' },
  { code: 'L', games: 250, latentSkill: 3350, role: 'rifler', opponentBias: 0.7, expectation: '최상위 후보' },
  { code: 'M', games: 500, latentSkill: 3005, role: 'rifler', opponentBias: 0, expectation: '중간권' },
  { code: 'N', games: 500, latentSkill: 3230, role: 'rifler', opponentBias: 0.2, expectation: '안정적 상위권' },
  { code: 'O', games: 150, latentSkill: 3120, role: 'support', opponentBias: -0.2, expectation: '승률 버스 효과 분석 대상' },
  /* --- 아래는 사용자 목록 밖에서 직접 추가한 edge case --- */
  { code: 'P', games: 22, latentSkill: 3550, role: 'rifler', opponentBias: 0.3, expectation: '초고수인데 판수 극소 — 신뢰도가 얼마나 억제하나' },
  { code: 'Q', games: 152, latentSkill: 3010, role: 'rifler', opponentBias: 0, expectation: '신뢰도 100% 문턱을 갓 넘은 평범한 선수 — 문턱 점프 확인' },
  { code: 'R', games: 148, latentSkill: 3010, role: 'rifler', opponentBias: 0, expectation: 'Q와 실력 같고 판수만 148 — 문턱 직전. Q와 격차가 크면 문제' },
  { code: 'S', games: 600, latentSkill: 3160, role: 'sniper', opponentBias: -0.6, expectation: '판수 많고 약자 위주 스나 — 포지션+판수 복합 exploit 후보' },
  { code: 'T', games: 90, latentSkill: 3380, role: 'support', opponentBias: 0.8, expectation: '고수 서포트 — 역할 편향으로 저평가되는지' },
]

export function makeArchetypePlayers(rng: Rng): SimPlayer[] {
  return ARCHETYPES.map((spec) => ({
    id: `ARCH-${spec.code}`,
    name: `archetype-${spec.code}`,
    latentSkill: spec.latentSkill + rng.normal(0, 8),
    role: spec.role,
    clanId: null,
    targetGames: spec.games,
    archetype: spec.code,
    opponentBias: spec.opponentBias,
  }))
}

export function makePlayers(rng: Rng, count: number): SimPlayer[] {
  const players: SimPlayer[] = []
  for (let i = 0; i < count; i += 1) {
    const tier = tierFor(rng)
    players.push({
      id: `P${String(i).padStart(4, '0')}`,
      name: `player-${i}`,
      latentSkill: rng.normal(tier.mean, tier.sd),
      role: rng.pick(ROLES),
      clanId: null,
      targetGames: rng.pick(GAME_COUNTS),
      opponentBias: rng.float(-0.8, 0.8),
    })
  }
  return players
}

/**
 * 클랜을 만들고 선수를 배정한다.
 *
 * 클랜마다 **평균 본클랜원 수**를 다르게 준다 — 이것이 구성 보너스의 입력이다.
 * 클1 위주 클랜(용병 장사)과 클5 위주 클랜(자기 구성)이 같은 실력일 때
 * 어떻게 갈리는지 보려면 이 분포가 필요하다.
 */
export function makeClans(rng: Rng, players: SimPlayer[], count: number): SimClan[] {
  const clans: SimClan[] = []
  for (let i = 0; i < count; i += 1) {
    const tier = tierFor(rng)
    clans.push({
      id: `C${String(i).padStart(3, '0')}`,
      name: `clan-${i}`,
      latentStrength: rng.normal(tier.mean, tier.sd),
      // 1.0 ~ 5.0 — 클랜마다 "얼마나 자기 사람으로 채우는가"가 다르다
      avgMembers: Math.max(1, Math.min(5, rng.float(1, 5.2))),
      memberIds: [],
      targetGames: rng.pick([30, 50, 80, 120, 180, 250, 350]),
      opponentBias: rng.float(-0.7, 0.7),
    })
  }

  /* 선수를 클랜에 나눠 준다 — **실력이 비슷한 사람끼리 묶는다.**

     아무렇게나 배정하면 클랜의 `latentStrength` 가 실제 출전 선수와 무관해진다.
     그러면 "강한 클랜을 골라 만난다"가 성립하지 않아 평균 상대 강도가 전원 3010 언저리로
     평평해지고, 스케줄 강도 검증이 통째로 무의미해진다 (처음에 그렇게 만들었다가 걸렸다). */
  const sortedClans = [...clans].sort((a, b) => b.latentStrength - a.latentStrength)
  const sortedPlayers = [...players].sort((a, b) => b.latentSkill - a.latentSkill)

  const mercPool: SimPlayer[] = []
  for (const player of sortedPlayers) {
    if (rng.chance(0.16)) {
      mercPool.push(player) // 무소속 용병
      continue
    }
    /* 실력이 가까운 클랜 몇 곳 중에서 고른다 (완전 결정적이면 부자연스럽다) */
    const ranked = sortedClans
      .map((clan) => ({ clan, gap: Math.abs(clan.latentStrength - player.latentSkill) + Math.abs(rng.normal(0, 70)) }))
      .sort((a, b) => a.gap - b.gap)
    const chosen = ranked[rng.int(0, Math.min(2, ranked.length - 1))]!.clan
    chosen.memberIds.push(player.id)
    player.clanId = chosen.id
  }

  /* 클랜원이 모자라면 용병 풀에서 채운다 — 5명은 있어야 경기를 만든다 */
  for (const clan of clans) {
    while (clan.memberIds.length < 6 && mercPool.length > 0) {
      const free = mercPool.pop()!
      free.clanId = clan.id
      clan.memberIds.push(free.id)
    }
  }

  /* 클랜의 공표 전력을 **실제 구성원 평균**으로 맞춘다.
     이래야 "강한 클랜"이라는 말이 그 클랜이 내보내는 선수와 일치한다. */
  const byId = new Map(players.map((p) => [p.id, p]))
  for (const clan of clans) {
    const members = clan.memberIds.map((id) => byId.get(id)!).filter(Boolean)
    if (members.length > 0) {
      clan.latentStrength = members.reduce((sum, p) => sum + p.latentSkill, 0) / members.length
    }
  }

  return clans
}

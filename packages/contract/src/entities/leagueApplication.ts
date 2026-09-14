import { z } from 'zod'

/**
 * ★리그 참가 신청★ (2026-09-14 사장님).
 *
 *   «마지막에 어느 리그에 참가하시겠습니까 / 하고 참가대기 클랜들 하고 보여줘 (…)
 *     참가신청은 IPL SPL 둘중에 하나 가능하고 / 신청방식은 내가 관리자 대시보드에서
 *     볼 수 있게 해줘 / 신청양식은 클랜명 / 클랜병영 / 주요멤버 포지별 5명 병영 /
 *     숏 이층 비리베 바리베 스나 / 이렇게 만들어줘 ★로그인 회원가입 없이 신청★ 할 수 있게»
 *   → 그 뒤 «열산도 신청 양식에 넣어 예시도 보여줘» 로 리그가 셋이 됐다.
 *
 * ── 로그인이 없다는 뜻
 *   ★누가 냈는지 우리가 모른다.★ 그래서 —
 *     · 연락 닿을 곳을 양식이 직접 받는다 (클랜 병영수첩 주소)
 *     · 장난 신청 자물쇠를 계정이 아니라 ★(리그 + 클랜명)★ 에 건다.
 *       이미 낸 클랜이 또 내면 새 줄을 만들지 않고 ★그 줄을 고친다★ — 신청서는 하나다
 */

/**
 * ★다섯 자리★ — 사장님이 적어 주신 그대로다.
 *
 * > «숏 이층 비리베 바리베 스나»
 *
 * ⚠ ★이름을 바꾸지 마라.★ 「숏건」·「2층」·「비린이베이스」 같은 말로 고치지 않는다.
 *   `클랜 육각형` 축 이름(`선짤`·`교환`)과 같은 규칙이다 — 사장님이 고른 말이다.
 */
export const APPLICATION_POSITIONS = ['숏', '이층', '비리베', '바리베', '스나'] as const
export type ApplicationPosition = (typeof APPLICATION_POSITIONS)[number]

/** 신청할 수 있는 리그 — 셋이다 (2026-09-14 «열산도 신청 양식에 넣어») */
export const APPLICATION_LEAGUES = ['nolink', 'supply', 'sanply'] as const
export type ApplicationLeague = (typeof APPLICATION_LEAGUES)[number]

/**
 * 병영수첩 주소인가.
 *
 * ★도메인만 본다.★ 주소 모양을 우리가 촘촘히 정하면, 넥슨이 주소를 바꿀 때마다
 * 멀쩡한 신청이 막힌다. «그 집 주소가 맞는가» 까지만 확인한다.
 */
const BARRACKS_HOST = 'barracks.sa.nexon.com'

export const BarracksUrlInput = z
  .string()
  .trim()
  .min(1, '병영수첩 주소를 넣어 주세요')
  .max(500, '주소가 너무 깁니다')
  .refine((v) => {
    try {
      const u = new URL(v.startsWith('http') ? v : `https://${v}`)
      return u.hostname === BARRACKS_HOST || u.hostname.endsWith(`.${BARRACKS_HOST}`)
    } catch {
      return false
    }
  }, `병영수첩 주소가 아닙니다 (${BARRACKS_HOST})`)

export const ApplicationMemberInput = z.object({
  position: z.enum(APPLICATION_POSITIONS),
  /** 게임 닉네임 — 화면에서 누가 누군지 알아보려고 받는다 */
  name: z.string().trim().min(1, '닉네임을 넣어 주세요').max(40, '닉네임이 너무 깁니다'),
  url: BarracksUrlInput,
})
export type ApplicationMemberInput = z.infer<typeof ApplicationMemberInput>

export const LeagueApplicationInput = z.object({
  league: z.enum(APPLICATION_LEAGUES),
  clan_name: z.string().trim().min(1, '클랜명을 넣어 주세요').max(60, '클랜명이 너무 깁니다'),
  clan_url: BarracksUrlInput,
  /**
   * ★다섯 명 전부★ 를 받는다. 한 자리라도 비면 안 받는다 —
   * 사장님이 «주요멤버 포지별 5명» 이라고 정하셨고, 자리마다 한 명씩이 그 뜻이다.
   */
  members: z.array(ApplicationMemberInput).length(APPLICATION_POSITIONS.length, '다섯 자리를 모두 채워 주세요'),
  note: z.string().trim().max(500, '남길 말이 너무 깁니다').optional(),
})
export type LeagueApplicationInput = z.infer<typeof LeagueApplicationInput>

/** 0 대기 · 1 승인 · 2 반려 */
export const APPLICATION_STATUS = { pending: 0, accepted: 1, rejected: 2 } as const
export const APPLICATION_STATUS_LABEL: Readonly<Record<number, string>> = {
  0: '대기',
  1: '승인',
  2: '반려',
}

/** 관리자 화면이 받는 한 줄 */
export const LeagueApplicationRow = z.object({
  id: z.string(),
  league: z.string(),
  clan_name: z.string(),
  clan_url: z.string(),
  members: z.array(
    z.object({ position: z.string(), name: z.string(), url: z.string() }),
  ),
  note: z.string().nullable().default(null),
  status: z.number().int(),
  admin_note: z.string().nullable().default(null),
  created_at: z.string(),
  handled_at: z.string().nullable().default(null),
})
export type LeagueApplicationRow = z.infer<typeof LeagueApplicationRow>

/**
 * ★참가대기 클랜★ — 신청 화면이 «이런 클랜들이 기다립니다» 로 보여 주는 줄.
 *
 * 사장님: «참가대기 클랜들 하고 보여줘(Ipl Spl ★활동량 가장 많은★ 클랜 마크 4개씩 하고 등등 으로 써줘)»
 * → ★활동량 = 최근 7일 경기 수★ 로 잡았다. «등등» 은 마크 넷 뒤의 «외 N곳» 이다.
 */
export const ApplicationWaitingLeague = z.object({
  league: z.string(),
  /** 화면에 그대로 쓰는 리그 이름 (`IPL` · `SPL` · `10mountain`) */
  label: z.string(),
  /** 최근 7일 경기가 많은 순으로 넷. 마크를 그린다 */
  clans: z.array(
    z.object({
      name: z.string(),
      slug: z.string(),
      mark: z.object({ bg: z.string().nullable(), front: z.string().nullable() }),
      /** 최근 7일 경기 수 — 「활동량」의 뜻을 화면이 그대로 적을 수 있게 같이 준다 */
      recent_matches: z.number().int(),
    }),
  ),
  /** 그 리그에서 뛰는 전체 클랜 수 — «외 N곳» 을 만든다 */
  total: z.number().int(),
})
export type ApplicationWaitingLeague = z.infer<typeof ApplicationWaitingLeague>

export const ApplicationWaiting = z.object({
  leagues: z.array(ApplicationWaitingLeague),
})
export type ApplicationWaiting = z.infer<typeof ApplicationWaiting>

/** 활동량을 재는 창 — 사장님: «최근7경기» 맥락과 같은 «요즘» 이다 */
export const WAITING_WINDOW_DAYS = 7
/** 리그마다 마크 몇 개를 보여 주나 (사장님: «클랜 마크 4개씩») */
export const WAITING_CLAN_COUNT = 4

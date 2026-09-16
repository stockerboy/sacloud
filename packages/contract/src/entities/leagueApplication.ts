import { z } from 'zod'

/**
 * ★리그 참가 신청★ (2026-09-14 사장님).
 *
 * ── ⚠ 2026-09-14 저녁 — 양식이 통째로 바뀌었다
 *   사장님이 «신청서 양식» 이라며 새로 적어 주셨다:
 *   ```
 *   클랜명(명단있는 클랜은 자동완성) 검색하기
 *   안나오는 클랜은 여기에 따로 적기 — 클랜명 / 클랜병영수첩
 *   관리자와 연락 가능한 카톡ID or Discord ID
 *     (클랜디스코드 마스터인증 돼 있어야합니다)
 *   IPL > LLM 전환등록 (혜택: 전환비 무료, 자격심사없음)
 *   LLM 신규등록 (등록책임비용: 10/1까지 전원무료)
 *   YSL 신규등록 (등록책임비용: 10/1까지 전원무료)
 *   IPL 신규등록 (등록책임비용: 10/1까지 전원무료)
 *   ```
 *
 *   ★무엇이 바뀌었나★
 *     · 「리그 고르기」 가 ★「등록 종류 고르기」★ 로 바뀌었다 — 전환등록이 생겨서
 *       «어느 리그» 만으로는 표현이 안 된다 (IPL→LLM 은 리그가 둘이다)
 *     · 클랜을 ★우리 명단에서 골라 넣는다★ — 오타와 중복 신청이 사라진다
 *     · ★연락처★ 를 받는다. 로그인이 없어서 우리가 먼저 연락할 길이 이것뿐이다
 *     · 주요 멤버 다섯은 ★선택★ 으로 내렸다 [미확인 — 사장님이 새 양식에 안 적으셨다].
 *       지우지 않았다 — 적어 주시면 그대로 관리자 화면에 나온다
 *
 *   옛 양식은 아래 `LeagueApplicationInputV1` 에 남긴다 (`CLAUDE.md` 1-4).
 *
 * ── 로그인이 없다는 뜻
 *   ★누가 냈는지 우리가 모른다.★ 그래서 —
 *     · 연락 닿을 곳을 양식이 직접 받는다 (클랜 병영수첩 · 카톡/디스코드 ID)
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

/** 신청할 수 있는 리그 — 셋이다 */
export const APPLICATION_LEAGUES = ['nolink', 'supply', 'sanply'] as const
export type ApplicationLeague = (typeof APPLICATION_LEAGUES)[number]

/**
 * ★등록 종류★ — 2026-09-14 저녁 사장님이 적어 주신 네 가지 그대로다.
 *
 * ⚠ ★값(`key`)을 바꾸지 마라.★ 이미 들어온 신청서가 이 글자를 들고 있다.
 *   글에 보이는 말(`label`·`benefit`)만 고친다.
 */
export const APPLICATION_KINDS = [
  {
    key: 'ipl-to-llm',
    /** 옮겨 가는 등록이라 리그가 둘이다 — 신청은 `to` 리그로 들어간다 */
    from: 'nolink',
    to: 'supply',
    label: 'IPL → PL 전환등록',
    benefit: '혜택 — 전환비 무료 · 자격심사 없음',
  },
  {
    key: 'llm-new',
    from: null,
    to: 'supply',
    label: 'PL 신규등록',
    benefit: '등록책임비용 — 10/1까지 전원 무료',
  },
  {
    key: 'ysl-new',
    from: null,
    to: 'sanply',
    label: '열산리그 신규등록',
    benefit: '등록책임비용 — 10/1까지 전원 무료',
  },
  {
    key: 'ipl-new',
    from: null,
    to: 'nolink',
    label: 'IPL 신규등록',
    benefit: '등록책임비용 — 10/1까지 전원 무료',
  },
] as const
export type ApplicationKindKey = (typeof APPLICATION_KINDS)[number]['key']
export const APPLICATION_KIND_KEYS = APPLICATION_KINDS.map((k) => k.key) as [
  ApplicationKindKey,
  ...ApplicationKindKey[],
]

/** 그 등록 종류의 설명. 모르는 값이면 `null` — 지어내지 않는다 */
export function applicationKindOf(key: string) {
  return APPLICATION_KINDS.find((k) => k.key === key) ?? null
}

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

/** 연락처 종류 — 사장님: «카톡ID or Discord ID» */
export const CONTACT_KINDS = ['kakao', 'discord'] as const
export const CONTACT_KIND_LABEL: Readonly<Record<string, string>> = {
  kakao: '카카오톡 ID',
  discord: 'Discord ID',
}

export const LeagueApplicationInput = z.object({
  /** ★등록 종류★ — 어느 리그로 들어갈지는 이 값이 정한다 */
  kind: z.enum(APPLICATION_KIND_KEYS),
  /**
   * ★우리 명단에서 고른 클랜★ 의 slug. 명단에 없어 직접 적었으면 `null`.
   * 고르면 오타도 중복 신청도 사라진다.
   */
  clan_slug: z.string().trim().max(120).nullable().default(null),
  clan_name: z.string().trim().min(1, '클랜명을 넣어 주세요').max(60, '클랜명이 너무 깁니다'),
  /**
   * 클랜 병영수첩 주소.
   * ★명단에서 고른 클랜은 안 받는다★ — 우리가 이미 아는 값을 또 적게 하지 않는다.
   */
  clan_url: BarracksUrlInput.nullable().default(null),
  /** 연락처 — 사장님: «관리자와 연락 가능한 카톡ID or Discord ID» */
  contact_kind: z.enum(CONTACT_KINDS),
  contact_id: z
    .string()
    .trim()
    .min(1, '연락 가능한 ID를 넣어 주세요')
    .max(80, 'ID 가 너무 깁니다'),
  /*
   * ⚠ ★주요 멤버 다섯은 양식에서 뺐다★ (2026-09-14 저녁 사장님: «주요멤버5명은 빼»).
   *
   *   ★칸(`ApplicationMemberInput` · `APPLICATION_POSITIONS`)은 지우지 않는다★ —
   *   이미 들어온 옛 신청서가 그 값을 들고 있고, 관리자 화면이 그것을 읽어 그린다.
   *   다시 받게 되면 이 자리에 `members` 를 되돌리면 된다 (`CLAUDE.md` 1-4).
   */
  note: z.string().trim().max(500, '남길 말이 너무 깁니다').optional(),
})
export type LeagueApplicationInput = z.infer<typeof LeagueApplicationInput>

/**
 * ⚠ ★옛 양식★ (2026-09-14 낮). 지우지 않는다 (`CLAUDE.md` 1-4).
 * 리그를 직접 고르고 멤버 다섯이 필수였다. 되돌리려면 이것을 쓰면 된다.
 */
export const LeagueApplicationInputV1 = z.object({
  league: z.enum(APPLICATION_LEAGUES),
  clan_name: z.string().trim().min(1).max(60),
  clan_url: BarracksUrlInput,
  members: z.array(ApplicationMemberInput).length(APPLICATION_POSITIONS.length),
  note: z.string().trim().max(500).optional(),
})
export type LeagueApplicationInputV1 = z.infer<typeof LeagueApplicationInputV1>

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
  /** 등록 종류 — 옛 신청서에는 없다 (`null`) */
  kind: z.string().nullable().default(null),
  clan_name: z.string(),
  clan_slug: z.string().nullable().default(null),
  clan_url: z.string().nullable().default(null),
  contact_kind: z.string().nullable().default(null),
  contact_id: z.string().nullable().default(null),
  members: z.array(z.object({ position: z.string(), name: z.string(), url: z.string() })),
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
  /** 화면에 그대로 쓰는 리그 이름 */
  label: z.string(),
  clans: z.array(
    z.object({
      name: z.string(),
      slug: z.string(),
      mark: z.object({ bg: z.string().nullable(), front: z.string().nullable() }),
      /** 최근 7일 경기 수 */
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

/** 활동량을 재는 창 */
export const WAITING_WINDOW_DAYS = 7
/** 리그마다 마크 몇 개를 보여 주나 (사장님: «클랜 마크 4개씩») */
export const WAITING_CLAN_COUNT = 4

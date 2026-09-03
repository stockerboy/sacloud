import { z } from 'zod'
import { Count, Id, IsoDateTime, Slug } from '../common'
import { Division, Role } from '../codes'
import { Category } from './board'
import { ClanSummary, PlayerSummary } from './summaries'

/**
 * ⚠ **철회 (2026-09-01 · D-252)** — 아래 서술은 역사 기록이다.
 *
 * > 회원가입은 네이버 메일만 허용된다(관측). 우리 서비스도 동일 정책을 재현하되,
 * > 도메인 목록은 설정값으로 분리한다.
 *
 * 가입은 이제 **아이디 + 비밀번호**다. 이메일은 **선택 입력**이고 도메인 제한이 없다.
 * 이 상수는 **지우지 않는다** (CLAUDE.md 10-4) — 도메인을 다시 좁히고 싶어지면
 * `SACLOUD_SIGNUP_EMAIL_DOMAINS` 환경변수에 이 값을 넣으면 옛 동작이 그대로 돌아온다.
 * 비어 있으면(기본) **어떤 도메인이든 받는다.**
 */
export const SIGNUP_ALLOWED_EMAIL_DOMAINS = [] as const

/** 옛 네이버 전용 정책을 되살리고 싶을 때 쓰는 값 (기본값 아님) */
export const LEGACY_NAVER_ONLY_EMAIL_DOMAINS = ['naver.com'] as const

export const Email = z.string().email()

/* -------------------------------------------------------------------------- */
/* 로그인 아이디 (2026-09-01 · D-252)                                            */
/* -------------------------------------------------------------------------- */

/**
 * 아이디 규칙 — **원본에 규칙이 없어서 우리가 정했다** [자체 설계].
 *
 *  · 4~16자 · 영문/숫자/밑줄(`_`) · 첫 글자는 영문
 *  · **저장·조회는 항상 소문자**다. `Player` 와 `player` 가 서로 다른 계정이 되면
 *    사칭이 가능해진다. 그래서 대소문자를 구분하지 않는다
 *  · 한글·기호를 받지 않는 이유는 **유니코드 정규화 차이로 같은 아이디가 둘이 되는 것**을
 *    막기 위해서다 (조합형/완성형 한글은 눈에 같아 보여도 바이트가 다르다)
 */
export const USERNAME_MIN = 4
export const USERNAME_MAX = 16
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{3,15}$/

/** 아이디 정규화 — 앞뒤 공백을 떼고 소문자로 만든다. 저장·조회 양쪽에서 반드시 거친다 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export const Username = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => USERNAME_PATTERN.test(value), {
    message: '아이디는 영문으로 시작하는 4~16자의 영문·숫자·밑줄이어야 합니다',
  })

/** GET /me */
export const User = z.object({
  id: Id,
  /** 로그인 아이디. 이메일로 가입한 옛 계정은 `null` (D-252) */
  username: z.string().nullable(),
  /** 선택 입력이 됐다. 넣지 않고 가입한 계정은 `null` (D-252) */
  email: Email.nullable(),
  nickname: z.string(),
  avatar_url: z.string().url().nullable(),
  role: Role,
  email_verified_at: IsoDateTime.nullable(),
  /** 서든어택 계정 연동 결과. 연동해야 리그 생성이 가능하다. */
  player: PlayerSummary.nullable(),
  clan: ClanSummary.nullable(),
  created_at: IsoDateTime,
})
export type User = z.infer<typeof User>

/**
 * GET /infos — 부트스트랩 응답.
 * 관측된 설정: 글쓰기 rate limit 5분, ENTRY_TIME_LIMIT=3600.
 * ENTRY_TIME_LIMIT의 정확한 용도는 [미확인].
 */
export const Configs = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export type Configs = z.infer<typeof Configs>

export const Infos = z.object({
  configs: Configs,
  categories: z.array(Category),
  user: User.nullable(),
})
export type Infos = z.infer<typeof Infos>

/** GET /remote_configs — 원격 설정. 구조는 [미확인]. */
export const RemoteConfigs = Configs
export type RemoteConfigs = z.infer<typeof RemoteConfigs>

/* -------------------------------------------------------------------------- */
/* 인증 — 요청/응답 본문은 원본 관측 범위 밖이라 우리 계약으로 확정한다 [자체 설계]   */
/* -------------------------------------------------------------------------- */

/**
 * 로그인 (2026-09-01 · D-252).
 *
 * **아이디로 로그인한다.** 다만 `email` 도 계속 받는다 — 이메일로 가입한 옛 계정
 * (검수 계정 D-033 포함)이 그대로 로그인돼야 하기 때문이다 (CLAUDE.md 10-4).
 * 둘 중 하나는 있어야 한다.
 */
export const LoginInput = z
  .object({
    username: z.string().min(1).optional(),
    email: Email.optional(),
    password: z.string().min(1),
  })
  .refine((value) => Boolean(value.username || value.email), {
    message: '아이디를 입력해주세요',
    path: ['username'],
  })
export type LoginInput = z.infer<typeof LoginInput>

/**
 * 회원가입 (2026-09-01 · D-252) — **아이디 + 비밀번호 + 닉네임.**
 *
 * · `email` 은 **선택**이다. 메일 발송이 아직 없어서 요구할 수 없다.
 *   칸을 없애지 않고 남긴 이유는 나중에 비밀번호 찾기를 붙일 때 **이어 갈 곳**이 필요해서다
 * · `captcha_token` 도 선택이다. 캡차는 아직 없고, 있지도 않은 값을 필수로 두면
 *   클라이언트가 가짜 문자열을 채워 넣는 의미 없는 검증이 된다
 */
export const SignupInput = z.object({
  username: Username,
  password: z.string().min(8),
  nickname: z.string().min(2).max(16),
  email: Email.nullish(),
  captcha_token: z.string().min(1).optional(),
})
export type SignupInput = z.infer<typeof SignupInput>

export const AuthSession = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: IsoDateTime,
  user: User,
})
export type AuthSession = z.infer<typeof AuthSession>

/**
 * 토큰 갱신 (O-037 · 2026-09-03).
 *
 * ⚠ **원래 `apps/web/app/api/auth/token/route.ts` 안에 있었다.** 계약으로 옮겼다 —
 *   계약이 「이 주소는 이런 몸을 받는다」고 말할 수 있으려면 **같은 물건**을 가리켜야 한다.
 *   라우트에 따로 두면 계약과 서버가 **조용히 갈라진다.**
 *
 * ⚠ 이 몸은 **없어도 된다.** 브라우저는 토큰을 안 들고 있고 httpOnly 쿠키로 보낸다.
 *   그래서 라우트는 `safeParse` 가 실패해도 쿠키를 본다 — `request` 가 붙었다고
 *   「이게 없으면 400」이라는 뜻이 아니다.
 */
export const RefreshInput = z.object({ refresh_token: z.string().min(1) })
export type RefreshInput = z.infer<typeof RefreshInput>

export const PasswordForgetInput = z.object({ email: Email })
export type PasswordForgetInput = z.infer<typeof PasswordForgetInput>

export const PasswordResetInput = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})
export type PasswordResetInput = z.infer<typeof PasswordResetInput>

export const EmailVerifyInput = z.object({ token: z.string().min(1) })
export type EmailVerifyInput = z.infer<typeof EmailVerifyInput>

export const MeSettingInput = z.object({
  nickname: z.string().min(2).max(16),
  avatar_url: z.string().url().nullable(),
})
export type MeSettingInput = z.infer<typeof MeSettingInput>

export const MePasswordInput = z.object({
  current_password: z.string().min(1),
  password: z.string().min(8),
})
export type MePasswordInput = z.infer<typeof MePasswordInput>

/**
 * 서든어택 계정 연동. 원본의 실제 인증 방식은 [미확인]
 * (닉네임 입력 후 검증 코드 방식으로 추정되나 확인되지 않음).
 */
export const AccountLinkInput = z.object({
  player_name: z.string().min(1),
})
export type AccountLinkInput = z.infer<typeof AccountLinkInput>

export const AccountLinkState = z.object({
  linked: z.boolean(),
  player: PlayerSummary.nullable(),
  linked_at: IsoDateTime.nullable(),
})
export type AccountLinkState = z.infer<typeof AccountLinkState>

/** POST /uploads */
export const Upload = z.object({
  id: Id,
  url: z.string().url(),
  created_at: IsoDateTime,
})
export type Upload = z.infer<typeof Upload>

/* -------------------------------------------------------------------------- */
/* 리그 관리 — 화면 동작은 관측됐으나 엔드포인트·본문은 [자체 설계]                  */
/* -------------------------------------------------------------------------- */

/** 넥슨 병영수첩 클랜 주소를 붙여넣어 클랜을 조회한다 */
export const ClanLookupInput = z.object({
  /** 예: https://barracks.sa.nexon.com/clan/{clanSlug}/clanMatch */
  url: z.string().min(1),
})
export type ClanLookupInput = z.infer<typeof ClanLookupInput>

export const ClanInviteInput = z.object({
  clan_slug: Slug,
  division: Division,
})
export type ClanInviteInput = z.infer<typeof ClanInviteInput>

export const LeagueInvitation = z.object({
  id: Id,
  clan: ClanSummary,
  division: Division,
  /** 초대링크 복사에 사용 */
  invite_url: z.string().url(),
  created_at: IsoDateTime,
  expires_at: IsoDateTime.nullable(),
})
export type LeagueInvitation = z.infer<typeof LeagueInvitation>

export const DivisionChangeInput = z.object({ division: Division })
export type DivisionChangeInput = z.infer<typeof DivisionChangeInput>

/**
 * 리그 관리자가 클랜을 **직접** 부리그/티어에 등록한다 (D-165).
 *
 * 초대(`leagueInvite`)와 다르다. 초대는 클랜 마스터가 링크로 수락하는 흐름이고,
 * 이것은 운영자가 티어를 직접 정해 넣는 흐름이다 — 무소속리그 티어 편성이 그렇다.
 * `division` 은 무소속리그에서 **티어 번호**로 표시된다. 값의 구조는 같다.
 */
export const LeagueClanRegisterInput = z.object({ clan_slug: Slug, division: Division })
export type LeagueClanRegisterInput = z.infer<typeof LeagueClanRegisterInput>

/** 클랜변경(승계): 전적을 새 클랜이 그대로 승계. 새 클랜 마스터의 수락이 필요하다. */
export const ClanSuccessionInput = z.object({ clan_slug: Slug })
export type ClanSuccessionInput = z.infer<typeof ClanSuccessionInput>

/** 클랜삭제: 삭제대기 후 1주일 뒤 자동 삭제 */
export const LeagueClanDeleteState = z.object({
  league_clan_id: Id,
  delete_requested_at: IsoDateTime,
  deletes_at: IsoDateTime,
})
export type LeagueClanDeleteState = z.infer<typeof LeagueClanDeleteState>

/** 추방: 되돌릴 수 없고 재가입 불가. `추방합니다` 문자열 확인이 필요하다. */
export const EXPEL_CONFIRM_PHRASE = '추방합니다'
export const ExpelInput = z.object({
  confirm: z.literal(EXPEL_CONFIRM_PHRASE),
})
export type ExpelInput = z.infer<typeof ExpelInput>

export const LeagueContentInput = z.object({
  /** 리그소개 HTML */
  description: z.string(),
})
export type LeagueContentInput = z.infer<typeof LeagueContentInput>

/** 클랜 설정 / 플레이어 설정 — 화면 상세는 [미확인] (로그인 필요로 미관측) */
export const ClanSettingInput = z.object({
  notice: z.string().nullable(),
  /** 리그 초대 차단 */
  block_invitation: z.boolean(),
})
export type ClanSettingInput = z.infer<typeof ClanSettingInput>

export const PlayerSettingInput = z.object({
  note: z.string().nullable(),
  position: z.string().nullable(),
})
export type PlayerSettingInput = z.infer<typeof PlayerSettingInput>

/** 갱신 요청 (`정보갱신` / `전적갱신`) 결과 */
export const RenewResult = z.object({
  accepted: z.boolean(),
  renewed_at: IsoDateTime.nullable(),
  /** 재요청까지 남은 초. 실제 rate limit 값은 [미확인] */
  retry_after: Count.nullable(),
})
export type RenewResult = z.infer<typeof RenewResult>

/** 단순 성공 응답 */
export const Ok = z.object({ ok: z.boolean() })
export type Ok = z.infer<typeof Ok>

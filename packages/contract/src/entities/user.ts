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
 * ★새 비밀번호 규칙★ (2026-09-13 사장님: «사이트 보안을 손보고 다듬어줘 꼼꼼하게»).
 *
 * 옛 규칙은 `z.string().min(8)` 하나였다. 세 군데(가입 · 재설정 · 변경)에 ★따로★
 * 적혀 있어서 한 곳을 고치면 나머지가 조용히 뒤처졌다. 여기 하나로 모은다.
 *
 * ── ① 위는 ★72바이트★ 다 — 지어낸 값이 아니다
 *   bcrypt 는 ★앞 72바이트만★ 해시한다. 그 뒤는 조용히 버려진다.
 *   상한이 없으면 «앞 72바이트가 같은 다른 비밀번호» 로도 로그인이 된다 —
 *   사람은 긴 비밀번호를 만들었다고 믿는데 실제로는 아니다. 그래서 ★거절★ 한다.
 *   한글은 한 글자가 3바이트라 24자쯤에서 걸린다. 글자 수가 아니라 ★바이트★ 로 센다.
 *
 * ── ② 아래는 그대로 8자다
 *   이미 가입한 사람이 있다. 여기를 올리면 ★기존 비밀번호가 규칙 위반이 되는데★
 *   로그인(`LoginInput`)은 `min(1)` 이라 그대로 들어온다 — 규칙과 현실이 어긋난다.
 *   길이 대신 ③ 으로 막는다.
 *
 * ── ③ ★너무 흔한 것은 막는다★
 *   길이만으로는 `12345678` · `password` · `sacloud1` 이 전부 통과한다.
 *   실제로 털리는 계정은 짧은 비밀번호가 아니라 ★남들도 쓰는★ 비밀번호다.
 *   목록은 짧게 둔다 — 사전 전체를 들고 다닐 일은 아니고, 사이트 이름·게임 이름처럼
 *   ★여기서만 흔한 것★ 을 넣는 게 값이 크다.
 *
 * ⚠ ★로그인에는 걸지 않는다.★ 이미 그런 비밀번호로 가입한 사람이 못 들어오게 되면
 *   보안이 아니라 사고다. 새로 정하는 자리(가입 · 재설정 · 변경)에만 건다.
 */
export const PASSWORD_MIN = 8
/** bcrypt 가 실제로 읽는 길이 */
export const PASSWORD_MAX_BYTES = 72

/** 소문자로 견준다. 사이트·게임 이름은 여기서만 흔한 것이라 따로 넣었다 */
const WEAK_PASSWORDS: ReadonlySet<string> = new Set([
  '12345678', '123456789', '1234567890', '11111111', '00000000', '87654321',
  'password', 'password1', 'password123', 'passw0rd', 'qwertyui', 'qwerty123',
  'asdfasdf', 'asdf1234', 'qwer1234', 'zxcv1234', '1q2w3e4r', '1q2w3e4r5t',
  'iloveyou', 'letmein1', 'welcome1', 'abcd1234', 'a1234567', 'admin123',
  'administrator', 'sacloud1', 'sacloud123', 'suddenattack', 'sudden123',
])

function utf8Length(value: string): number {
  /* Node 도 브라우저도 가진 것으로 센다 — `Buffer` 는 브라우저에 없다 */
  return new TextEncoder().encode(value).length
}

/** 새로 정하는 비밀번호. ★로그인에는 쓰지 않는다★ */
export const NewPassword = z
  .string()
  .min(PASSWORD_MIN, `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다`)
  .refine((value) => utf8Length(value) <= PASSWORD_MAX_BYTES, {
    message: '비밀번호가 너무 깁니다 (영문 72자 · 한글 24자까지)',
  })
  .refine((value) => !WEAK_PASSWORDS.has(value.toLowerCase()), {
    message: '너무 흔한 비밀번호입니다. 다른 것을 쓰세요',
  })

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
  /* ★2026-09-13★ — 옛 값은 `z.string().min(8)`. 규칙은 `NewPassword` 한 곳에 있다 */
  password: NewPassword,
  nickname: z.string().min(2).max(16),
  email: Email.nullish(),
  captcha_token: z.string().min(1).optional(),
  /**
   * ★서든 닉네임★ — 가입과 계정인증을 한 번에 (2026-09-12 사장님).
   *
   * > «회원가입은 서든 계정인증으로 하는거야 (…) 칭호 바꾸면 계정인증 자동으로 되는 시스템»
   *
   * 넣으면 가입과 동시에 칭호 도전이 열리고, 배정된 칭호를 응답이 알려 준다.
   * ★안 넣어도 가입은 된다★ — 넥슨이 멈췄을 때 가입까지 막지 않는다. 나중에 마이페이지에서 한다.
   */
  sudden_nickname: z.string().trim().min(1).max(16).nullish(),
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
  /* ★2026-09-13★ — 옛 값은 `z.string().min(8)` */
  password: NewPassword,
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
  /* ★2026-09-13★ — 옛 값은 `z.string().min(8)` */
  password: NewPassword,
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

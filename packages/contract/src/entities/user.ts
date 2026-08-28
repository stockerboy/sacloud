import { z } from 'zod'
import { Count, Id, IsoDateTime, Slug } from '../common'
import { Division, Role } from '../codes'
import { Category } from './board'
import { ClanSummary, PlayerSummary } from './summaries'

/**
 * 회원가입은 네이버 메일만 허용된다(관측). 우리 서비스도 동일 정책을 재현하되,
 * 도메인 목록은 설정값으로 분리한다.
 */
export const SIGNUP_ALLOWED_EMAIL_DOMAINS = ['naver.com'] as const

export const Email = z.string().email()

/** GET /me */
export const User = z.object({
  id: Id,
  email: Email,
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

export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof LoginInput>

export const SignupInput = z.object({
  email: Email,
  password: z.string().min(8),
  nickname: z.string().min(2).max(16),
  captcha_token: z.string().min(1),
})
export type SignupInput = z.infer<typeof SignupInput>

export const AuthSession = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: IsoDateTime,
  user: User,
})
export type AuthSession = z.infer<typeof AuthSession>

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

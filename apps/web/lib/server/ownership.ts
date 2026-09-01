import { prisma } from '@sacloud/db'
import { ADMIN_ROLE, currentUserId } from './session'
import { forbidden, unauthorized } from './respond'
/* 칭호(`[용병]`) 인증 판정. 다른 팀이 만들었고 시그니처를 맞춰 두었다 (2026-09-01).
   예외를 던지지 않는다 — 표가 아직 없으면 안에서 잡아 `false` 를 돌려준다 */
import { isTitleVerified } from './queries/titleVerification'
/* 클랜 마스터 인증 판정 (2026-09-01 · D-253).
   `isTitleVerified` 와 같은 규약이다 — 예외를 던지지 않는다. 표가 없으면 `false` */
import { isClanMaster } from './queries/clanMasterClaim'

/**
 * **쓰기 관문 — 「이 사람이 이것을 고쳐도 되는가」를 한 곳에서 판정한다** (2026-09-01).
 *
 * ── 무엇이 뚫려 있었나
 *   `PUT /api/clans/{clanSlug}/setting` 과 `PUT /api/players/{playerId}/setting` 이
 *   **로그인 여부만** 보고, 그 계정이 그 클랜/선수와 무슨 관계인지는 **전혀 보지 않았다.**
 *   즉 **계정 하나만 만들면 남의 클랜 공지와 남의 선수 프로필을 덮어쓸 수 있었다.**
 *
 *   두 파일의 옛 주석은 「소유권 판정 기준이 [미확인] 이라 일부러 넣지 않았다」고 적고 있었다.
 *   판단의 취지는 옳았지만(없는 규칙을 지어내지 않는다) **결과는 취약점**이었다.
 *   모르는 것을 지어내지 않는 것과, 모른다는 이유로 문을 열어 두는 것은 다르다.
 *
 * ── 지금의 원칙
 *   ```
 *   증명되지 않은 사람은 못 고친다.
 *   못 고치게 하는 것은 되돌릴 수 있지만, 고쳐진 데이터는 되돌리기 어렵다
 *   ```
 *   그래서 **애매하면 잠근다.** 잠근 뒤 규칙이 확정되면 여기서 한 줄 풀면 된다.
 *
 * ── ⚠ 읽기는 막지 않는다
 *   이 관문은 **쓰기 경로에서만** 부른다. 조회는 누구나 된다.
 *
 * ── ⚠ 왜 한 곳에 모았나
 *   판정을 경로마다 흩뿌리면 **다음에 생기는 경로가 또 빠진다.** 실제로 그렇게 뚫렸다.
 *   칭호 인증(다른 팀이 만드는 중)이 붙을 자리도 여기 한 곳뿐이어야 한다.
 */

export type OwnershipVia =
  /** 운영자 (`User.role === 2`) */
  | 'admin'
  /** 운영자가 승인한 계정 연동 (`UserPlayerLink`) — D-121 */
  | 'link'
  /** 칭호(`[용병]`) 인증 — 다른 팀이 만드는 중. 아직 붙지 않았다 */
  | 'title'
  /** 클랜 마스터 인증 — 운영자가 인게임 스크린샷을 보고 승인 (D-253) */
  | 'clan-master'

export type OwnershipCheck =
  | { ok: true; userId: string; via: OwnershipVia }
  | { ok: false; status: 401 | 403; message: string }

function grant(userId: string, via: OwnershipVia): OwnershipCheck {
  return { ok: true, userId, via }
}

function deny(status: 401 | 403, message: string): OwnershipCheck {
  return { ok: false, status, message }
}

/**
 * 거부를 응답으로 바꾼다.
 *
 * **왜 거부됐는지 사람이 읽을 수 있게** 답한다. `Validation failed` 같은 문구를 쓰지 않는다 —
 * 그러면 사용자는 자기가 뭘 잘못했는지 모르고, 우리는 문의를 받는다.
 */
export function ownershipDenied(check: { status: 401 | 403; message: string }): Response {
  return check.status === 401 ? unauthorized(check.message) : forbidden(check.message)
}

async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return user?.role === ADMIN_ROLE
}

/* -------------------------------------------------------------------------- */
/* 선수 프로필                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **자기 선수 프로필을 고칠 수 있는 사람** = 그 선수를 자기 것이라고 **증명한** 계정.
 *
 * 지금 우리에게 있는 증명 수단은 두 가지다.
 *
 *   1. **계정 연동** (`UserPlayerLink`) — 운영자가 근거를 보고 승인해야만 생기는 행이다 (D-121).
 *      닉네임만 넣으면 붙던 옛 구조는 이미 폐기됐으므로, 이 행이 있다는 것 자체가 증명이다
 *   2. **칭호 인증** — 게임에서 칭호를 `[용병]` 으로 바꾸면 승인되는 흐름.
 *      **다른 팀이 만드는 중이고 아직 없다.** 아래에 자리만 비워 두었다
 *
 * 운영자는 언제나 통과한다 (운영상 고쳐 줘야 할 때가 있다).
 */
export async function requirePlayerOwner(
  request: Request,
  playerId: string,
): Promise<OwnershipCheck> {
  const userId = await currentUserId(request)
  if (!userId) return deny(401, '로그인이 필요합니다')

  if (await isAdmin(userId)) return grant(userId, 'admin')

  /*
   * ── **칭호 인증**으로 증명된 본인인가 (2026-09-01) ────────────────────────────
   *
   *   판정 기준(사용자 확정): 「자기 선수 프로필을 고칠 수 있는 사람
   *   = 그 선수 닉네임을 **칭호 인증(`[용병]`)** 으로 증명한 계정」.
   *
   *   `isTitleVerified` 는 다른 팀이 만들었고 시그니처를 맞춰 두었다.
   *   그쪽 판정은 «연동(`UserPlayerLink`) **이면서** `TitleChallenge` 가 verified» 라
   *   아래 연동 검사보다 **좁다.** 그래서 지금은 실질적으로 아래에서 먼저 통과하지만,
   *   연동 규칙이 나중에 좁아져도 이 줄이 남아 있어야 칭호 인증만으로 통과할 수 있다.
   *
   *   ⚠ `TitleChallenge` 표는 아직 마이그레이션 전이다. 그동안 이 함수는 항상 `false` 다
   *      (안에서 예외를 잡는다). **닫히는 쪽으로 틀리므로 안전하다.**
   * ────────────────────────────────────────────────────────────────────────────
   */
  if (await isTitleVerified(userId, playerId)) return grant(userId, 'title')

  /*
   * ── 계정 연동으로 증명된 본인인가 (D-121) ──
   *
   *   `UserPlayerLink` 는 **운영자가 근거를 보고 승인해야만** 생기는 행이다.
   *   닉네임만 넣으면 붙던 옛 구조는 이미 폐기됐다. 그래서 이 행 자체가 소유 증명이다.
   *
   *   ⚠ 이걸 빼면 안 된다 — 칭호 인증 표가 아직 없어서, 빼면 **이미 인증을 마친
   *      사용자도 자기 프로필을 못 고친다.**
   */
  const link = await prisma.userPlayerLink.findUnique({
    where: { userId },
    select: { playerId: true },
  })
  if (link?.playerId === playerId) return grant(userId, 'link')

  return deny(
    403,
    '본인 확인이 된 계정만 이 선수 정보를 수정할 수 있습니다. ' +
      '마이페이지에서 서든어택 계정 인증을 마친 뒤 다시 시도해주세요.',
  )
}

/* -------------------------------------------------------------------------- */
/* 클랜 설정                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 옛 경로로 되돌리는 스위치 — **`1` 이면 2026-09-01 이전처럼 운영자만 통과한다.**
 *
 * 새 규칙(마스터 인증)이 기본값이다. 그래도 옛 경로를 지우지 않는다 (CLAUDE.md 10-4):
 * 심사가 잘못 나가거나 인증 표에 문제가 생기면 **배포 없이 한 칸으로 잠글 수 있어야 한다.**
 */
function clanOwnerAdminOnly(): boolean {
  return process.env.SACLOUD_CLAN_OWNER_ADMIN_ONLY === '1'
}

/**
 * **클랜 설정은 「마스터 인증」을 통과한 회원이 고친다** (2026-09-01 · D-253).
 *
 * ── ⚠ 바뀐 것 — 그 전에는 **운영자만** 통과했다
 *   옛 주석 원문:
 *     > 이것은 확정된 규칙이 아니라 **잠금**이다 [미확인].
 *     > 클랜 설정을 누가 고쳐야 하는지는 사용자가 아직 말하지 않았다.
 *     > 후보는 셋이다 — 클랜 마스터만 / 인증된 클랜원 아무나 / 운영자만.
 *
 *   사용자가 답했다: *"클랜설정은 마스터한테 권한을 준다 마스터 인증하기 를 누르면
 *   관리자 페이지에서 내가 직접 심사하고 승인 거부 결정한다."* 그래서 **클랜 마스터만**이다.
 *
 * ── 증명 수단은 하나뿐이다
 *   `ClanMasterClaim` 이 `approved` 인 것 — 즉 **운영자가 인게임 스크린샷을 보고 승인한 것**.
 *   자동 판정은 만들지 않았다. 넥슨은 「이 계정이 그 클랜의 마스터인가」를 알려 주지 않는다.
 *
 * ── ⚠ 켜지 않은 다른 후보 [미확인]
 *   `Clan.masterPlayerId` 와 `UserPlayerLink.playerId` 가 같으면 통과시키는 길도 있다.
 *   **켜지 않았다** — `masterPlayerId` 는 수집으로 채워진 값이라 출처가 우리 판정이 아니고,
 *   사용자가 정한 절차는 「사진을 내고 사람이 심사」다. 필요해지면 여기 한 곳에 한 블록을 더한다.
 *
 * ── 왜 조용히 실패시키지 않나
 *   화면이 「저장됨」이라고 말하고 아무것도 안 바뀌면 사용자는 우리를 못 믿는다.
 *   **왜 막혔고 무엇을 하면 되는지** 분명히 답한다.
 */
export async function requireClanOwner(
  request: Request,
  clanSlug: string,
): Promise<OwnershipCheck> {
  const userId = await currentUserId(request)
  if (!userId) return deny(401, '로그인이 필요합니다')

  if (await isAdmin(userId)) return grant(userId, 'admin')

  /* 옛 경로 — 운영자만. 스위치를 켰을 때만 여기서 끝난다 */
  if (clanOwnerAdminOnly()) {
    return deny(403, '클랜 정보 수정은 지금 운영자만 할 수 있습니다.')
  }

  /* 마스터 인증을 통과했나. 표가 없으면 안에서 `false` 로 떨어진다 — **닫히는 쪽으로 틀린다** */
  if (await isClanMaster(userId, clanSlug)) return grant(userId, 'clan-master')

  return deny(
    403,
    '클랜 마스터로 인증된 계정만 클랜 정보를 수정할 수 있습니다. ' +
      '클랜 기록실에서 「마스터 인증하기」를 눌러 인게임 스크린샷을 제출해주세요.',
  )
}

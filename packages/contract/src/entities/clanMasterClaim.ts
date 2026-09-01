/**
 * 클랜 **마스터 인증** — 인게임 스크린샷 1장을 사람이 본다 (2026-09-01 · D-253).
 *
 * ── 사용자 지시 원문
 *   *"클랜설정은 마스터한테 권한을 준다 마스터 인증하기 를 누르면 관리자 페이지에서
 *    내가 직접 심사하고 승인 거부 결정한다 인증하기 방법은 그냥 마스터 계정으로 접속한
 *    인게임 사진 하나 첨부하라고 하면 끝이다."*
 *
 * ── 흐름
 * ```
 *   ① 클랜 기록실 → [마스터 인증하기]
 *   ② 인게임 스크린샷 1장 첨부 (마스터 계정으로 접속한 화면)
 *   ③ 제출 → 「심사중」
 *   ④ 관리자가 /admin 에서 사진을 보고 [승인] 또는 [거부](사유)
 *   ⑤ 승인되면 그 회원에게 **그 클랜의 설정 권한**이 열린다
 * ```
 *
 * ── ⚠ 선수 「칭호 인증」과 무엇이 다른가
 *   칭호 인증(`titleVerification.ts`)은 **기계가 판정한다** — 넥슨이 칭호를 그대로 준다.
 *   마스터 인증은 넥슨이 「이 계정이 그 클랜의 마스터인가」를 알려 주지 않으므로
 *   **사람이 사진을 보고 판정한다.** 자동 판정을 흉내 내지 않는다 (D-121 과 같은 태도).
 *
 * ── ⚠ 이 방식의 알려진 약점 — 그대로 안고 간다
 *   사진은 위조·도용될 수 있다. 우리가 줄이는 장치는 셋이다.
 *     ① **클랜당 승인은 하나뿐** — 부분 유니크 인덱스가 DB 에서 막는다
 *     ② 제출 시각 · 제출자 · 사진 원본을 남긴다 — 다툼이 생기면 근거가 된다
 *     ③ 관리자는 언제든 되돌릴 수 있다 (`revoked`)
 */
import { z } from 'zod'
import { IsoDateTime } from '../common'

/**
 * 사진 크기 상한. **우리가 정한 값이다** [미확인] — 원본에 기준이 없다.
 *
 * 오브젝트 스토리지가 아직 없어서 **바이트를 DB 에 그대로 넣는다** (D-253).
 * 그래서 기존 이미지 업로드(`/api/uploads`, 5MB)보다 작게 잡았다 — 3MB 면
 * 1080p 스크린샷 한 장이 넉넉히 들어가고, 표 한 줄이 감당할 만한 크기다.
 */
export const CLAN_MASTER_IMAGE_MAX_BYTES = 3 * 1024 * 1024

/** 받아 주는 형식. **확장자가 아니라 실제 형식**을 본다 */
export const CLAN_MASTER_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type ClanMasterImageMime = (typeof CLAN_MASTER_IMAGE_MIME_TYPES)[number]

/** 관리자에게 남기는 한 줄 메모의 길이 상한 */
export const CLAN_MASTER_NOTE_MAX = 300

/**
 * 신청의 상태.
 *
 * `none`      아직 아무것도 내지 않았다
 * `pending`   냈고 관리자 심사를 기다린다 — 화면은 「심사중」
 * `approved`  승인됐다. **클랜 설정이 열린다**
 * `rejected`  거부됐다. 사유(`decision_note`)를 보여 준다
 * `cancelled` 신청자가 접었다
 * `revoked`   승인했다가 관리자가 되돌렸다
 */
export const ClanMasterClaimStatus = z.enum([
  'none',
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'revoked',
])
export type ClanMasterClaimStatus = z.infer<typeof ClanMasterClaimStatus>

/**
 * 제출 본문.
 *
 * 사진은 **data URL** 로 받는다. 기존 `apiSend` 가 JSON 만 보내고, 계약(Zod)으로 검증하는
 * 이 저장소의 결을 그대로 쓰기 위해서다. base64 는 33% 부풀지만 3MB 상한이면 문제되지 않는다.
 *
 * ⚠ **멀티파트로 바꿀 수도 있었다.** 그러면 계약 밖으로 나가고 화면·MSW·`compare` 가
 * 전부 예외를 하나씩 갖게 된다. 지금은 계약 안에 두는 쪽을 골랐다 (D-253).
 */
export const ClanMasterClaimInput = z.object({
  /** `data:image/png;base64,...` — 인게임 스크린샷 1장 */
  image: z.string().min(1),
  /** 관리자에게 남기는 한 줄 (선택). 없으면 `null` */
  note: z.string().max(CLAN_MASTER_NOTE_MAX).nullable().optional(),
})
export type ClanMasterClaimInput = z.infer<typeof ClanMasterClaimInput>

/** 지금 이 회원의, 이 클랜에 대한 상태 */
export const ClanMasterClaimState = z.object({
  status: ClanMasterClaimStatus,
  /** 지금 이 회원이 이 클랜 설정을 고칠 수 있나. **화면은 이 값만 보면 된다** */
  is_master: z.boolean(),
  /** 새로 낼 수 있나. 심사중이거나 이미 승인됐으면 `false` */
  can_submit: z.boolean(),
  /** 신청자가 남긴 메모 */
  note: z.string().nullable(),
  /**
   * 제출한 사진을 다시 볼 수 있는 경로. 로그인 쿠키가 있어야 열린다.
   * 아직 낸 것이 없으면 `null`. **바이트는 여기에 담지 않는다** — 목록이 무거워진다
   */
  image_url: z.string().nullable(),
  submitted_at: IsoDateTime.nullable(),
  decided_at: IsoDateTime.nullable(),
  /** 관리자가 남긴 사유. 거부됐을 때 화면이 그대로 보여 준다 */
  decision_note: z.string().nullable(),
  /**
   * 지금 인증을 낼 수 있나. 사진 저장 수단이 없으면 `false` 이고 화면은 「준비 중」으로 막는다.
   * **없는 것을 있는 척하지 않는다.**
   */
  available: z.boolean(),
  /**
   * 이 클랜에 이미 **다른 회원**이 마스터로 승인돼 있나.
   * 있으면 낼 수 없다 — 클랜당 마스터는 하나다
   */
  taken_by_other: z.boolean(),
})
export type ClanMasterClaimState = z.infer<typeof ClanMasterClaimState>

/* -------------------------------------------------------------------- 규칙 --- */
/*
  아래는 **순수 규칙**이다. 서버와 화면이 같은 판정을 써야 해서 계약에 둔다.
*/

/** `parseImageDataUrl` 이 돌려주는 실패 사유 */
export type ClanMasterImageError =
  /** data URL 이 아니다 */
  | 'not-data-url'
  /** 받아 주지 않는 형식 */
  | 'unsupported-type'
  /** 상한을 넘었다 */
  | 'too-large'
  /** base64 가 비었거나 깨졌다 */
  | 'empty'

export type ClanMasterImageParsed =
  | { ok: true; mimeType: ClanMasterImageMime; base64: string; byteSize: number }
  | { ok: false; error: ClanMasterImageError }

/** base64 문자열이 몇 바이트로 풀리는지. **디코드하지 않고** 센다 */
export function base64ByteLength(base64: string): number {
  const clean = base64.replace(/=+$/, '')
  return Math.floor((clean.length * 3) / 4)
}

/**
 * data URL 을 뜯어 형식과 크기를 확인한다.
 *
 * **디코드는 하지 않는다** — 서버(Node)와 화면(브라우저)이 디코드 수단이 달라서다.
 * 여기서는 «받아 줄 것인가» 만 판정하고, 실제 바이트 변환은 서버가 한다.
 *
 * ⚠ 확장자를 믿지 않고 **선언된 형식**을 본다. 그마저도 신뢰할 수 없으므로
 * 서버가 저장한 뒤에도 사람이 눈으로 본다 — 이 인증의 판정자는 결국 사람이다.
 */
export function parseImageDataUrl(value: string): ClanMasterImageParsed {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(value.trim())
  if (!match) return { ok: false, error: 'not-data-url' }

  const mimeType = match[1]!.toLowerCase()
  const base64 = match[2]!.replace(/\s+/g, '')

  if (!(CLAN_MASTER_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, error: 'unsupported-type' }
  }
  if (base64.length === 0) return { ok: false, error: 'empty' }

  const byteSize = base64ByteLength(base64)
  if (byteSize === 0) return { ok: false, error: 'empty' }
  if (byteSize > CLAN_MASTER_IMAGE_MAX_BYTES) return { ok: false, error: 'too-large' }

  return { ok: true, mimeType: mimeType as ClanMasterImageMime, base64, byteSize }
}

/** 실패 사유를 사람 말로. 화면과 서버가 **같은 문구**를 쓴다 */
export function clanMasterImageErrorMessage(error: ClanMasterImageError): string {
  switch (error) {
    case 'not-data-url':
      return '사진을 읽지 못했습니다. 다시 골라주세요'
    case 'unsupported-type':
      return 'PNG · JPG · WEBP 만 올릴 수 있습니다'
    case 'too-large':
      return `사진이 너무 큽니다 (최대 ${Math.floor(CLAN_MASTER_IMAGE_MAX_BYTES / (1024 * 1024))}MB)`
    case 'empty':
      return '사진이 비어 있습니다'
  }
}

/**
 * 저장된 `status` 로 «지금 이 클랜 설정을 고칠 수 있나» 를 판정한다.
 *
 * `approved` 하나뿐이다. `revoked` 는 **한 번 승인됐던 흔적**이지 권한이 아니다 —
 * 되돌린 것을 권한으로 읽으면 되돌리기가 되돌리기가 아니게 된다.
 */
export function grantsClanMaster(status: string): boolean {
  return status === 'approved'
}

/** 새 신청을 받아 줄 상태인가. 심사중·승인됨이면 받지 않는다 */
export function canSubmitClanMasterClaim(status: ClanMasterClaimStatus): boolean {
  return status !== 'pending' && status !== 'approved'
}

/**
 * 클랜 마스터 인증의 **순수 규칙** (D-253).
 *
 * 화면과 서버가 **같은 함수**로 사진을 판정한다. 그래서 여기가 깨지면 두 곳이 같이 깨진다 —
 * 3MB 를 보내고 나서야 거절당하는 일이 없게 하는 것이 이 규칙의 존재 이유다.
 */
import { describe, expect, it } from 'vitest'
import {
  base64ByteLength,
  canSubmitClanMasterClaim,
  clanMasterImageErrorMessage,
  grantsClanMaster,
  parseImageDataUrl,
  CLAN_MASTER_IMAGE_MAX_BYTES,
  ClanMasterClaimInput,
} from '../entities/clanMasterClaim'

describe('parseImageDataUrl', () => {
  it('허용 형식은 통과한다', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
      const result = parseImageDataUrl(`data:${mime};base64,aGVsbG8=`)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.mimeType).toBe(mime)
        expect(result.byteSize).toBe(5)
      }
    }
  })

  it('대문자 형식도 같은 것으로 본다', () => {
    const result = parseImageDataUrl('data:IMAGE/PNG;base64,aGVsbG8=')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/png')
  })

  it('data URL 이 아니면 거절한다', () => {
    expect(parseImageDataUrl('hello')).toEqual({ ok: false, error: 'not-data-url' })
    expect(parseImageDataUrl('https://example.test/a.png')).toEqual({
      ok: false,
      error: 'not-data-url',
    })
  })

  /* SVG 는 스크립트를 품을 수 있다. **허용 목록에 없으므로 그냥 떨어진다** */
  it('허용하지 않는 형식은 거절한다', () => {
    expect(parseImageDataUrl('data:image/svg+xml;base64,aGVsbG8=')).toEqual({
      ok: false,
      error: 'unsupported-type',
    })
    expect(parseImageDataUrl('data:text/html;base64,aGVsbG8=')).toEqual({
      ok: false,
      error: 'unsupported-type',
    })
  })

  it('비어 있으면 거절한다', () => {
    expect(parseImageDataUrl('data:image/png;base64,')).toEqual({ ok: false, error: 'empty' })
  })

  it('상한을 넘으면 거절한다 — **디코드하지 않고** 센다', () => {
    const overflow = 'A'.repeat(Math.ceil(((CLAN_MASTER_IMAGE_MAX_BYTES + 1024) * 4) / 3))
    expect(parseImageDataUrl(`data:image/jpeg;base64,${overflow}`)).toEqual({
      ok: false,
      error: 'too-large',
    })
  })

  it('줄바꿈이 섞여 들어와도 읽는다', () => {
    const result = parseImageDataUrl('data:image/png;base64,aGVs\nbG8=')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.base64).toBe('aGVsbG8=')
  })
})

describe('base64ByteLength', () => {
  it('패딩을 빼고 센다', () => {
    expect(base64ByteLength('aGVsbG8=')).toBe(5)
    expect(base64ByteLength('aGVsbG8')).toBe(5)
    expect(base64ByteLength('')).toBe(0)
  })
})

describe('권한 판정', () => {
  it('`approved` 만 권한이다', () => {
    expect(grantsClanMaster('approved')).toBe(true)
  })

  /* `revoked` 는 **승인됐던 흔적**이지 권한이 아니다.
     되돌린 것을 권한으로 읽으면 되돌리기가 되돌리기가 아니게 된다 */
  it('그 밖의 상태는 권한이 아니다', () => {
    for (const status of ['pending', 'rejected', 'cancelled', 'revoked', 'none', '']) {
      expect(grantsClanMaster(status)).toBe(false)
    }
  })
})

describe('다시 낼 수 있나', () => {
  it('심사중·승인됨이면 받지 않는다', () => {
    expect(canSubmitClanMasterClaim('pending')).toBe(false)
    expect(canSubmitClanMasterClaim('approved')).toBe(false)
  })

  it('거부·취소·해제·미신청이면 다시 낼 수 있다', () => {
    expect(canSubmitClanMasterClaim('rejected')).toBe(true)
    expect(canSubmitClanMasterClaim('cancelled')).toBe(true)
    expect(canSubmitClanMasterClaim('revoked')).toBe(true)
    expect(canSubmitClanMasterClaim('none')).toBe(true)
  })
})

describe('문구', () => {
  /* 화면과 서버가 **같은 문구**를 쓴다. 두 곳에 따로 적지 않는다 */
  it('모든 실패 사유에 사람 말이 있다', () => {
    for (const error of ['not-data-url', 'unsupported-type', 'too-large', 'empty'] as const) {
      expect(clanMasterImageErrorMessage(error).length).toBeGreaterThan(0)
    }
  })

  it('상한 문구에 실제 상한이 들어간다', () => {
    expect(clanMasterImageErrorMessage('too-large')).toContain(
      String(Math.floor(CLAN_MASTER_IMAGE_MAX_BYTES / (1024 * 1024))),
    )
  })
})

describe('제출 본문', () => {
  it('사진이 없으면 통과하지 않는다', () => {
    expect(ClanMasterClaimInput.safeParse({}).success).toBe(false)
    expect(ClanMasterClaimInput.safeParse({ image: '' }).success).toBe(false)
  })

  it('메모는 선택이다', () => {
    expect(ClanMasterClaimInput.safeParse({ image: 'data:image/png;base64,aGVsbG8=' }).success).toBe(
      true,
    )
    expect(
      ClanMasterClaimInput.safeParse({ image: 'data:image/png;base64,aGVsbG8=', note: null })
        .success,
    ).toBe(true)
  })

  it('메모가 너무 길면 거절한다', () => {
    const parsed = ClanMasterClaimInput.safeParse({
      image: 'data:image/png;base64,aGVsbG8=',
      note: 'ㄱ'.repeat(301),
    })
    expect(parsed.success).toBe(false)
  })
})

/**
 * ★★임대 상실 ≠ DB 연결 실패★★ (2026-09-04 · O-055-1 · 사장님 지시).
 *
 * > «heartbeat UPDATE 자체는 정상 실행됐는데 갱신된 행이 0개 → ★실제 상실★ → 즉시 종료»
 * > «DB 자체에 연결하지 못한 경우 → ★임대를 잃었다고 단정하지 마라★»
 *
 * ── ★이 파일이 있는 이유★
 *   2026-09-04 20:25 에 세션 풀러가 잠깐 끊겼다. 갱신이 실패했고,
 *   그때 코드는 실패를 ★전부 「잃음」으로★ 읽어 수집기를 끝냈다.
 *   ★4시간 43분 동안 IPL 이 한 건도 안 들어왔다.★
 *   로그는 «남이 이미 수집 중이다» 라고 했다 — ★아무도 안 돌고 있었다.★
 *
 *   ★「모른다」를 「잃었다」로 바꾸면 멀쩡한 판이 죽는다.★
 *   ★「잃었다」를 「모른다」로 바꾸면 두 판이 된다.★ 둘 다 사고이고, 방향만 반대다.
 *
 * ── ★DB 없이도 도는 시험이다★
 *   연결 실패를 재려면 ★진짜로 끊어야★ 하는데, 운영 DB 를 끊을 수는 없다.
 *   그래서 ★던지는 가짜 client★ 를 넣는다 — 「질문을 못 했다」는 상황 그 자체다.
 */
import { describe, expect, it } from 'vitest'
import { renewCollectorLease } from '../collectorLease'

/** `$queryRaw` 가 ★던지는★ client — DB 가 안 닿는 상황 */
const unreachableClient = (message: string) =>
  ({
    $queryRaw: () => Promise.reject(new Error(message)),
    $executeRaw: () => Promise.reject(new Error(message)),
    $queryRawUnsafe: () => Promise.reject(new Error(message)),
  }) as unknown as Parameters<typeof renewCollectorLease>[0]['client']

/** `$queryRaw` 가 ★0행을 돌려주는★ client — DB 는 답했고 임대는 남의 것이다 */
const zeroRowClient = () =>
  ({
    $queryRaw: () => Promise.resolve([]),
    $executeRaw: () => Promise.resolve(0),
    $queryRawUnsafe: () => Promise.resolve([]),
  }) as unknown as Parameters<typeof renewCollectorLease>[0]['client']

/** `$queryRaw` 가 ★한 행을 돌려주는★ client — 정상 갱신 */
const okClient = (expiresAt: Date) =>
  ({
    $queryRaw: () => Promise.resolve([{ expiresAt }]),
    $executeRaw: () => Promise.resolve(1),
    $queryRawUnsafe: () => Promise.resolve([]),
  }) as unknown as Parameters<typeof renewCollectorLease>[0]['client']

describe('갱신 결과가 셋으로 갈린다', () => {
  it('★정상 갱신 → renewed★', async () => {
    const at = new Date('2026-09-04T12:00:00.000Z')
    const out = await renewCollectorLease({ ownerId: 'me', client: okClient(at) })
    expect(out.outcome).toBe('renewed')
    expect(out.expiresAt?.toISOString()).toBe(at.toISOString())
    expect(out.error).toBeUndefined()
  })

  it('★UPDATE 는 돌았는데 0행 → lost★ (남이 가져갔다 · 즉시 멈춰야 한다)', async () => {
    const out = await renewCollectorLease({ ownerId: 'me', client: zeroRowClient() })
    expect(out.outcome).toBe('lost')
    expect(out.expiresAt).toBeNull()
    /* ★사유가 없다★ — DB 가 답을 했으니 「모르는 것」이 아니다 */
    expect(out.error).toBeUndefined()
  })

  it("★DB 가 안 닿으면 → unreachable★ (★'lost' 가 아니다★)", async () => {
    const out = await renewCollectorLease({
      ownerId: 'me',
      client: unreachableClient("Can't reach database server at aws-0-…:5432"),
    })
    expect(out.outcome).toBe('unreachable')
    /* ★이것이 이 파일의 핵심 한 줄이다★ */
    expect(out.outcome).not.toBe('lost')
    /* 사유를 그대로 들고 온다 — 로그에 남겨야 사람이 원인을 안다 */
    expect(out.error).toContain('reach database server')
  })

  it('타임아웃도 unreachable 이다 — 「느린 것」과 「잃은 것」은 다르다', async () => {
    const out = await renewCollectorLease({
      ownerId: 'me',
      client: unreachableClient('Timed out fetching a new connection from the connection pool'),
    })
    expect(out.outcome).toBe('unreachable')
    expect(out.error).toContain('Timed out')
  })

  it('★연결 실패는 몇 번을 물어도 잃음이 되지 않는다★', async () => {
    const client = unreachableClient('ECONNRESET')
    for (let i = 0; i < 5; i += 1) {
      const out = await renewCollectorLease({ ownerId: 'me', client })
      expect(out.outcome).toBe('unreachable')
    }
  })

  it('★DB 가 돌아오면 같은 주인이 그대로 이어 간다★', async () => {
    const at = new Date('2026-09-04T12:30:00.000Z')
    /* 끊겼다가 */
    expect((await renewCollectorLease({ ownerId: 'me', client: unreachableClient('down') })).outcome).toBe(
      'unreachable',
    )
    /* 살아나면 */
    const back = await renewCollectorLease({ ownerId: 'me', client: okClient(at) })
    expect(back.outcome).toBe('renewed')
    expect(back.expiresAt?.toISOString()).toBe(at.toISOString())
  })
})

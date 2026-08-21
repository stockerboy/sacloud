import { describe, expect, it } from 'vitest'
import { NexonClient, type FetchLike, type HttpResponseLike } from '../client'
import { DEFAULT_CONFIG, readNexonConfig, redactSecrets, type NexonConfig } from '../config'
import { NexonApiError, classifyResponse, parseRetryAfter } from '../errors'
import { backoffDelayMs, TokenBucket, type Clock } from '../rateLimit'
import { SAMPLE_MATCH_LIST } from '../fixtures/sample'

/** 실제 키가 아니다. 리댁션 동작을 확인하기 위한 가짜 문자열이다. */
const FAKE_KEY = 'test_fake_key_0000000000'

function fakeClock() {
  let current = 0
  const sleeps: number[] = []
  const clock: Clock = {
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      current += ms
    },
  }
  return { clock, sleeps, advance: (ms: number) => (current += ms) }
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponseLike {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

function sequenceFetch(items: (HttpResponseLike | Error)[]) {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url)
    const next = items.shift()
    if (!next) throw new Error('호출이 예상보다 많다')
    if (next instanceof Error) throw next
    return next
  }
  return { fetchImpl, calls }
}

function makeConfig(overrides: Partial<NexonConfig> = {}): NexonConfig {
  return { ...DEFAULT_CONFIG, apiKey: FAKE_KEY, maxRetries: 3, ...overrides }
}

describe('설정', () => {
  it('키가 없으면 null이다', () => {
    expect(readNexonConfig({}).apiKey).toBeNull()
    expect(readNexonConfig({ NEXON_API_KEY: '   ' }).apiKey).toBeNull()
  })

  it('속도·재시도·신선도 주기를 환경변수로 바꾼다 (코드에 고정하지 않는다)', () => {
    const config = readNexonConfig({
      NEXON_RATE_LIMIT_PER_SEC: '0.5',
      NEXON_MAX_RETRIES: '5',
      NEXON_REFRESH_INTERVAL_DAYS: '14',
    })
    expect(config.requestsPerSecond).toBe(0.5)
    expect(config.maxRetries).toBe(5)
    expect(config.refreshIntervalDays).toBe(14)
  })

  it('잘못된 값은 기본값으로 되돌린다', () => {
    expect(readNexonConfig({ NEXON_RATE_LIMIT_PER_SEC: '-3' }).requestsPerSecond).toBe(
      DEFAULT_CONFIG.requestsPerSecond,
    )
  })

  it('기본 신선도 주기는 넥슨이 명시한 30일이다', () => {
    expect(readNexonConfig({}).refreshIntervalDays).toBe(30)
  })

  it('비밀값을 지운다', () => {
    expect(redactSecrets(`key=${FAKE_KEY} 실패`, [FAKE_KEY])).toBe('key=[REDACTED] 실패')
  })
})

describe('응답 분류', () => {
  it('상태 코드로 분류한다', () => {
    expect(classifyResponse(200, null)).toBe('ok')
    expect(classifyResponse(429, null)).toBe('rate_limited')
    expect(classifyResponse(403, null)).toBe('forbidden')
    expect(classifyResponse(400, 'OPENAPI00004')).toBe('bad_request')
    expect(classifyResponse(503, null)).toBe('server')
  })

  it('키 오류는 상태 코드와 무관하게 중단 대상이다', () => {
    expect(classifyResponse(400, 'OPENAPI00005')).toBe('forbidden')
  })

  it('Retry-After는 초 단위 숫자만 해석한다', () => {
    expect(parseRetryAfter('12')).toBe(12)
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull()
    expect(parseRetryAfter(null)).toBeNull()
  })
})

describe('속도 제어', () => {
  it('속도를 넘으면 기다린다', async () => {
    const { clock, sleeps } = fakeClock()
    const bucket = new TokenBucket({ ratePerSecond: 2, clock })
    await bucket.take()
    await bucket.take()
    expect(sleeps.length).toBe(1)
    expect(sleeps[0]).toBeGreaterThan(0)
  })

  it('429를 받으면 감속하고, 초기 속도 위로는 올라가지 않는다', () => {
    const { clock } = fakeClock()
    const bucket = new TokenBucket({ ratePerSecond: 2, clock })
    expect(bucket.slowDown()).toBe(1)
    bucket.speedUp()
    bucket.speedUp()
    bucket.speedUp()
    expect(bucket.ratePerSecond).toBeLessThanOrEqual(2)
  })

  it('백오프는 지수로 늘고 상한을 넘지 않는다', () => {
    const random = () => 0
    expect(backoffDelayMs(0, { random })).toBe(1000)
    expect(backoffDelayMs(1, { random })).toBe(2000)
    expect(backoffDelayMs(20, { random, maxMs: 5000 })).toBe(5000)
  })
})

describe('클라이언트', () => {
  it('키가 없으면 요청을 보내지 않는다', async () => {
    const { fetchImpl, calls } = sequenceFetch([])
    const client = new NexonClient({ config: makeConfig({ apiKey: null }), fetchImpl })
    await expect(client.getOuid('아무개')).rejects.toMatchObject({ kind: 'forbidden' })
    expect(calls).toHaveLength(0)
  })

  it('성공하면 원본과 파싱 결과를 함께 돌려준다', async () => {
    const { fetchImpl, calls } = sequenceFetch([response(200, SAMPLE_MATCH_LIST)])
    const { clock } = fakeClock()
    const client = new NexonClient({ config: makeConfig(), fetchImpl, clock })
    const result = await client.getMatchList({ ouid: 'OU1', matchMode: '폭파미션' })

    expect(result.httpStatus).toBe(200)
    expect(result.data.match).toHaveLength(2)
    expect(result.raw).toEqual(SAMPLE_MATCH_LIST)
    expect(result.sourceId).toBe('OU1:폭파미션')
    expect(calls[0]).toContain('match_mode=')
    // match_type은 지정하지 않는다 (원본을 그대로 받는다)
    expect(calls[0]).not.toContain('match_type=')
  })

  it('저장되는 요청 파라미터에 키가 없다', async () => {
    const { fetchImpl } = sequenceFetch([response(200, { ouid: 'OU1' })])
    const { clock } = fakeClock()
    const client = new NexonClient({ config: makeConfig(), fetchImpl, clock })
    const result = await client.getOuid('아무개')
    expect(JSON.stringify(result.requestParams)).not.toContain(FAKE_KEY)
    expect(result.requestParams).toEqual({ user_name: '아무개' })
  })

  it('429는 Retry-After만큼 기다렸다가 재시도하고 감속한다', async () => {
    const { fetchImpl } = sequenceFetch([
      response(429, { error: { name: 'OPENAPI00007', message: 'too many' } }, { 'retry-after': '3' }),
      response(200, { ouid: 'OU1' }),
    ])
    const { clock, sleeps } = fakeClock()
    const client = new NexonClient({ config: makeConfig(), fetchImpl, clock })
    const result = await client.getOuid('아무개')

    expect(result.data.ouid).toBe('OU1')
    expect(sleeps).toContain(3000)
    expect(client.ratePerSecond).toBeLessThan(DEFAULT_CONFIG.requestsPerSecond)
  })

  it('5xx는 지수 백오프로 재시도하고, 한도를 넘으면 실패한다', async () => {
    const { fetchImpl, calls } = sequenceFetch([
      response(500, { error: { name: 'X', message: 'boom' } }),
      response(500, { error: { name: 'X', message: 'boom' } }),
      response(500, { error: { name: 'X', message: 'boom' } }),
    ])
    const { clock, sleeps } = fakeClock()
    const client = new NexonClient({
      config: makeConfig({ maxRetries: 2 }),
      fetchImpl,
      clock,
      random: () => 0,
    })

    await expect(client.getOuid('아무개')).rejects.toMatchObject({ kind: 'server' })
    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([1000, 2000])
  })

  it('400은 재시도하지 않는다', async () => {
    const { fetchImpl, calls } = sequenceFetch([
      response(400, { error: { name: 'OPENAPI00004', message: 'Please input valid parameter' } }),
    ])
    const { clock } = fakeClock()
    const client = new NexonClient({ config: makeConfig(), fetchImpl, clock })

    const error = await client.getOuid('없는닉').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(NexonApiError)
    expect((error as NexonApiError).kind).toBe('bad_request')
    expect((error as NexonApiError).apiErrorName).toBe('OPENAPI00004')
    expect((error as NexonApiError).retryable).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('키 오류는 재시도하지 않고 작업 중단 대상으로 표시한다', async () => {
    const { fetchImpl } = sequenceFetch([
      response(400, { error: { name: 'OPENAPI00005', message: 'The apikey is not valid.' } }),
    ])
    const { clock } = fakeClock()
    const client = new NexonClient({ config: makeConfig(), fetchImpl, clock })

    const error = (await client.getOuid('아무개').catch((caught: unknown) => caught)) as NexonApiError
    expect(error.kind).toBe('forbidden')
    expect(error.fatal).toBe(true)
  })

  it('200인데 JSON이 아니면 계약 위반으로 다루고 재시도하지 않는다', async () => {
    const { fetchImpl, calls } = sequenceFetch([response(200, '<html>차단</html>')])
    const { clock } = fakeClock()
    const client = new NexonClient({ config: makeConfig(), fetchImpl, clock })

    await expect(client.getMatchDetail('AAAA-1111')).rejects.toMatchObject({
      kind: 'invalid_response',
    })
    expect(calls).toHaveLength(1)
  })

  it('오류 메시지에 API 키가 남지 않는다', async () => {
    const { fetchImpl } = sequenceFetch([new Error(`socket hang up (key=${FAKE_KEY})`)])
    const { clock } = fakeClock()
    const client = new NexonClient({
      config: makeConfig({ maxRetries: 0 }),
      fetchImpl,
      clock,
    })

    const error = (await client.getOuid('아무개').catch((caught: unknown) => caught)) as NexonApiError
    expect(error.kind).toBe('network')
    expect(error.message).not.toContain(FAKE_KEY)
    expect(error.message).toContain('[REDACTED]')
  })
})

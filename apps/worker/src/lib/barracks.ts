/**
 * 병영수첩(barracks.sa.nexon.com) 공개 조회 클라이언트 — **보조 출처** (D-110).
 *
 * 넥슨 Open API가 1차 출처다. 병영수첩은 Open API가 주지 않는 두 가지를 보탠다.
 *   1. **클랜 멤버 목록** — 로스터를 사람이 손으로 만들지 않아도 된다
 *   2. 경기별 무기 신호 (라플/스나) — 별도 모듈에서 쓴다
 *
 * ── 실측한 호출 경로 (2026-08-23, 정상 브라우저)
 * ```
 * 닉네임        POST /api/Search/GetSearch/{nickname}/1
 *               → characterInfo[].{ user_nexon_sn, str_usn, user_nick }
 * 프로필        POST /api/Profile/GetProfileMain/{str_usn}
 *               → characterInfo.{ clan_name, clan_id }      ← clan_id 가 클랜 slug다
 * 클랜 번호     POST /api/ClanHome/GetClanInfo/{clan_slug}
 *               → { clan_no }
 * 클랜 멤버     POST /api/ClanHome/GetClanUserList     (body: { clan_no })
 *               → resultClanUserList[].{ user_nexon_sn, str_usn, user_nick, clan_level }
 * ```
 *
 * ── 지키는 것
 *   - 로그인·인증이 필요 없는 **공개 조회만** 한다. 우회하지 않는다
 *   - 요청 간격을 둔다. 몰아치지 않는다
 *   - 실패는 실패로 둔다. 추측해서 채우지 않는다
 */

const BASE = 'https://barracks.sa.nexon.com'

/** 예의상 최소 간격 (ms). 공개 페이지라도 몰아치지 않는다 */
const REQUEST_GAP_MS = 400

export interface BarracksCharacter {
  userNexonSn: number
  strUsn: string
  nickname: string
}

export interface BarracksClanRef {
  clanName: string
  clanSlug: string
}

export interface BarracksClanMember {
  userNexonSn: number
  strUsn: string
  nickname: string
  /** 클랜마스터 · 부마스터 · 운영진 · 건설가 · 클랜원 */
  clanLevel: string
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number
  text: () => Promise<string>
}>

export class BarracksError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BarracksError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class BarracksClient {
  private readonly fetchImpl: FetchLike
  private lastRequestAt = 0
  /** 이 실행에서 실제로 보낸 요청 수 — 호출량을 숫자로 남긴다 */
  requestCount = 0

  constructor(options: { fetchImpl?: FetchLike } = {}) {
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  }

  private async post(path: string, body?: unknown): Promise<unknown> {
    const wait = REQUEST_GAP_MS - (Date.now() - this.lastRequestAt)
    if (wait > 0) await sleep(wait)
    this.lastRequestAt = Date.now()
    this.requestCount += 1

    const response = await this.fetchImpl(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    if (response.status !== 200) {
      throw new BarracksError(`HTTP ${response.status}`, path, response.status)
    }
    if (text.trim() === '') return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new BarracksError('JSON이 아니다', path, response.status)
    }
  }

  /** 닉네임 → 계정. **정확히 같은 닉네임만** 인정한다 (유사 매칭 없음) */
  async findCharacter(nickname: string): Promise<BarracksCharacter | null> {
    const payload = (await this.post(
      `/api/Search/GetSearch/${encodeURIComponent(nickname)}/1`,
    )) as { result?: { characterInfo?: { user_nexon_sn: number; str_usn: string; user_nick: string }[] } } | null

    const rows = payload?.result?.characterInfo ?? []
    const exact = rows.filter((row) => row.user_nick === nickname)
    // 같은 닉네임이 둘 이상이면 사람을 정하지 않는다
    if (exact.length !== 1) return null
    const row = exact[0]!
    return { userNexonSn: row.user_nexon_sn, strUsn: row.str_usn, nickname: row.user_nick }
  }

  /** 계정 → 현재 소속 클랜 (이름 + slug) */
  async findClanOf(strUsn: string): Promise<BarracksClanRef | null> {
    const payload = (await this.post(`/api/Profile/GetProfileMain/${encodeURIComponent(strUsn)}`)) as
      | { result?: { characterInfo?: { clan_name?: string | null; clan_id?: string | null } } }
      | null

    const info = payload?.result?.characterInfo
    if (!info?.clan_name || !info?.clan_id) return null
    return { clanName: info.clan_name, clanSlug: info.clan_id }
  }

  /** 클랜 slug → 클랜 번호 */
  async findClanNo(clanSlug: string): Promise<string | null> {
    const payload = (await this.post(
      `/api/ClanHome/GetClanInfo/${encodeURIComponent(clanSlug)}`,
    )) as { clan_no?: string } | null
    return payload?.clan_no ?? null
  }

  /** 클랜 번호 → 멤버 전원 */
  async listClanMembers(clanNo: string): Promise<BarracksClanMember[]> {
    const payload = (await this.post('/api/ClanHome/GetClanUserList', { clan_no: clanNo })) as
      | {
          resultClanUserList?: {
            user_nexon_sn: number
            str_usn: string
            user_nick: string
            clan_level: string
          }[]
        }
      | null

    return (payload?.resultClanUserList ?? []).map((row) => ({
      userNexonSn: row.user_nexon_sn,
      strUsn: row.str_usn,
      nickname: row.user_nick,
      clanLevel: row.clan_level,
    }))
  }

  /**
   * 닉네임 하나로 클랜 멤버 전원까지 한 번에.
   *
   * 그 사람이 실제로 그 클랜 소속이어야 진행한다. `expectClanName`을 주면
   * 병영수첩이 말하는 클랜명과 다를 때 **중단한다** — 엉뚱한 클랜의 로스터를 가져오지 않는다.
   */
  async rosterByMemberNickname(input: {
    nickname: string
    expectClanName?: string
  }): Promise<{ clan: BarracksClanRef; clanNo: string; members: BarracksClanMember[] } | null> {
    const character = await this.findCharacter(input.nickname)
    if (!character) return null

    const clan = await this.findClanOf(character.strUsn)
    if (!clan) return null
    if (input.expectClanName !== undefined && clan.clanName !== input.expectClanName) return null

    const clanNo = await this.findClanNo(clan.clanSlug)
    if (!clanNo) return null

    const members = await this.listClanMembers(clanNo)
    return { clan, clanNo, members }
  }
}

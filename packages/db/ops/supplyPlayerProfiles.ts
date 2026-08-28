/**
 * 3rd.supply 선수 프로필 값 적재 — `position` · `note` · `renewed_at` (D-161).
 *
 * ── 무엇을 되살리는가
 *   원본 선수 `상세정보` 패널에는 `래더` 바로 아래에 **`포지션`** 줄이 있다.
 *   우리는 그 줄을 "원본에 없다" 고 **잘못 판단해 지웠다** (`docs/UI_PARITY_AUDIT.md` 6-2).
 *   관측이 틀렸다. 값이 있는 선수에게만 보이는 줄이라 표본에서 안 보였을 뿐이다.
 *
 * ── `position` 은 **숫자 코드다** (실측 2026-08-28)
 *   `GET /players/{id}` → `{"position":3, ...}`. 문자열이 아니다.
 *   원본 화면은 그 코드를 한글 표기로 바꿔 그린다 — `3` 인 선수 화면에 `A 숏` 이 나왔다.
 *   우리가 **화면에서 직접 확인한 매핑은 그 하나뿐**이다. 나머지는 `[미확인]` 이다.
 *
 *   그래서 `SUPPLY_POSITION_LABELS` 에는 확인한 것만 넣는다.
 *   모르는 코드는 **지어내지 않는다** (`CLAUDE.md` 3장 7번 · 3-A 8번).
 *   표기를 모르면 `Player.position` 을 비워 두고 **몇 명이 그렇게 비었는지 센다.**
 *   원본 코드는 수집 JSONL 에 그대로 남아 있으므로(3-A 1번), 표기가 확인되면
 *   **네트워크 없이** 이 표만 고쳐 다시 적재하면 된다.
 *
 * ── 우리 컬럼의 뜻
 *   `Player.position` 은 **화면에 그대로 쓰는 표기 문자열**이다 (개발 시드도 그렇다).
 *   코드를 문자열로 바꿔 넣지 않는다 — 화면에 `3` 이 나오면 안 된다.
 *
 * ── 하지 않는 것
 *   - `origin` 이 `3rd.supply` 가 아닌 선수는 건드리지 않는다.
 *     넥슨 경로로 들어온 값도, 개발 시드도 원본 값으로 덮지 않는다.
 *   - `null` 을 빈 문자열로 바꾸지 않는다. 반대도 하지 않는다.
 *   - `confirm` 없이는 한 줄도 쓰지 않는다. 숫자는 똑같이 나온다.
 *   - 값이 이미 같으면 쓰지 않는다 (idempotent — 두 번 돌려도 결과가 같다).
 */
import { prisma } from '../src/index'
import { parseSupplyDateTime } from './supplyMirrorParse'

/**
 * 포지션 코드 → 화면 표기.
 *
 * **원본 화면에서 직접 확인한 것만 넣는다.**
 * 확인 방법: 그 코드를 가진 선수의 원본 기록실 `상세정보` 에 뜨는 `포지션` 줄을 읽는다.
 *
 * | 코드 | 표기 | 근거 |
 * |---|---|---|
 * | 3 | `A 숏` | 원본 모바일 화면 실측 (선수 `Yolloanswag`, 2026-08-28) |
 * | 0 1 2 4 5 6 | `[미확인]` | 코드가 존재하는 것은 확인했으나 표기를 못 봤다 |
 *
 * 코드 `0` 도 **유효한 값이다.** falsy 로 취급해 버리면 안 된다.
 */
export const SUPPLY_POSITION_LABELS: Readonly<Record<number, string>> = Object.freeze({
  3: 'A 숏',
})

/** 코드 → 표기. 모르는 코드는 `null` 이다 — 그럴듯한 이름을 만들지 않는다 */
export function supplyPositionLabel(code: number | null | undefined): string | null {
  if (typeof code !== 'number' || !Number.isFinite(code)) return null
  return SUPPLY_POSITION_LABELS[code] ?? null
}

/** 프로필이 알려 주는 **현재 소속 클랜**. 수집 파일이 준 값만 담는다 */
export interface SupplyPlayerProfileClan {
  /** 3rd.supply 의 클랜 id */
  sourceClanId: string
  name: string
  slug: string
  markBgUrl: string | null
  markFrontUrl: string | null
}

/** 적재 입력 한 줄 — 수집 파일에서 뽑아 온 값 그대로 */
export interface SupplyPlayerProfileInput {
  /** 3rd.supply 의 player id */
  playerId: string
  /** 원본이 **지금** 쓰는 닉네임. 우리 행의 이름이 옛것일 수 있다 (D-162) */
  name: string | null
  /** 포지션 **코드**. 원본에 없으면 `null` */
  position: number | null
  note: string | null
  /** `YYYY-MM-DD HH:mm:ss` (KST 표기). 모양이 다르면 버린다 */
  renewedAt: string | null
  /** 현재 소속. 무소속이면 `null` */
  clan: SupplyPlayerProfileClan | null
}

export interface SupplyPlayerProfilesApplyResult {
  confirm: boolean
  /** 넘겨받은 줄 수 */
  read: number
  /** 우리 DB 의 선수와 이어진 줄 (`sourcePlayerId` 기준 · origin 을 가리지 않는다) */
  matched: number
  /** 원본에는 있는데 우리 DB 에 없는 선수 (추측해 만들지 않는다) */
  unknownPlayers: number
  /** 실제로 값이 달라져 쓴(쓸) 선수 */
  updated: number
  /** 이미 같은 값이라 건드리지 않은 선수 */
  unchanged: number
  /** `position` 을 채운(채울) 선수 */
  positionSet: number
  /** 코드는 있는데 **표기를 몰라** 비워 둔 선수 — 이 숫자가 0 이 아니면 표가 부족하다 */
  positionUnknownCode: number
  /** 표기를 모르는 코드별 인원 + 사람이 원본에서 확인할 수 있는 대표 선수 */
  unknownCodeSamples: Record<string, { count: number; samplePlayerId: string }>
  noteSet: number
  renewedAtSet: number
  /** `renewed_at` 이 왔는데 모양이 달라 버린 줄 */
  renewedAtUnparsed: number

  /* ── 닉네임 (D-162) ── */
  /** 우리 이름이 원본의 **현재 닉네임**과 달라 바꾼(바꿀) 선수 */
  namesChanged: number
  /** 사람이 원본과 대조할 수 있게 남기는 표본 (최대 20명) */
  nameChangeSamples: { playerId: string; before: string; after: string }[]

  /* ── 소속 클랜 (D-162) ── */
  /** 프로필이 클랜을 알려 준 줄 */
  clanGiven: number
  /** `Player.clanId` 를 프로필 값으로 바꾼(바꿀) 선수 */
  clanSet: number
  /** 이미 그 클랜이라 건드리지 않은 선수 */
  clanUnchanged: number
  /** 프로필에 클랜이 없어 기존 값(D-160 경기 파생)을 그대로 둔 선수 */
  clanLeftToFallback: number
  /** 우리 `Clan` 표에 없어 새로 만든(만들) 클랜 */
  clansCreated: number
  /** slug 로는 있었는데 `sourceClanId` 가 비어 있어 채운 클랜 */
  clansAdopted: number
  /** 마크가 비어 있어 채운 클랜 — 사용자가 fallback 마크 말고 진짜 마크를 요구했다 */
  clansMarkFilled: number
}

function emptyResult(confirm: boolean): SupplyPlayerProfilesApplyResult {
  return {
    confirm,
    read: 0,
    matched: 0,
    unknownPlayers: 0,
    updated: 0,
    unchanged: 0,
    positionSet: 0,
    positionUnknownCode: 0,
    unknownCodeSamples: {},
    noteSet: 0,
    renewedAtSet: 0,
    renewedAtUnparsed: 0,
    namesChanged: 0,
    nameChangeSamples: [],
    clanGiven: 0,
    clanSet: 0,
    clanUnchanged: 0,
    clanLeftToFallback: 0,
    clansCreated: 0,
    clansAdopted: 0,
    clansMarkFilled: 0,
  }
}

export function createSupplyPlayerProfilesResult(confirm: boolean): SupplyPlayerProfilesApplyResult {
  return emptyResult(confirm)
}

/**
 * 프로필이 알려 준 클랜들을 우리 `Clan` 표에 맞춰 놓고 `sourceClanId → Clan.id` 를 돌려준다.
 *
 * ── 왜 만들기까지 하는가
 *   선수가 열산리그에만 등록된 클랜 소속일 수 있다. 그 클랜이 우리 리그에서 팀으로 뛴 적이
 *   없으면 `Clan` 행이 아예 없다. 행이 없으면 소속이 `없음` 으로 나오고, 마크도 fallback 이
 *   그려진다 — 사용자가 지적한 그 상태다. **수집 파일이 준 값만으로** 행을 만든다.
 *
 * ── 지어내지 않는 것
 *   `establishedAt` · `notice` · `masterPlayerId` · `category` · `tier` 는 프로필이 주지 않는다.
 *   비워 둔다 (`category` 는 스키마 기본값이 적용된다).
 *
 * ── 이미 있는 클랜은 **이름을 바꾸지 않는다**
 *   클랜 이름·랭킹 집계는 다른 경로(`supplyRollup`)가 맡는다. 여기서는 비어 있는 칸
 *   (`sourceClanId` · 마크)만 채운다. 채우는 이유는 마크가 비면 화면이 fallback 을 그리기 때문이다.
 */
async function resolveClans(
  clans: readonly SupplyPlayerProfileClan[],
  input: { confirm: boolean; result: SupplyPlayerProfilesApplyResult },
): Promise<Map<string, string>> {
  const { confirm, result } = input
  const wanted = new Map<string, SupplyPlayerProfileClan>()
  for (const clan of clans) wanted.set(clan.sourceClanId, clan)
  const idBySourceId = new Map<string, string>()
  if (wanted.size === 0) return idBySourceId

  const bySourceId = await prisma.clan.findMany({
    where: { sourceClanId: { in: [...wanted.keys()] } },
    select: { id: true, sourceClanId: true, markBgUrl: true, markFrontUrl: true },
  })
  for (const clan of bySourceId) {
    idBySourceId.set(clan.sourceClanId as string, clan.id)
    /* 마크가 비어 있으면 채운다. 있는 값을 덮지는 않는다 */
    const bg = clan.markBgUrl ?? wanted.get(clan.sourceClanId as string)?.markBgUrl ?? null
    const front = clan.markFrontUrl ?? wanted.get(clan.sourceClanId as string)?.markFrontUrl ?? null
    if (clan.markBgUrl === null && bg !== null) {
      result.clansMarkFilled += 1
      if (confirm) {
        await prisma.clan.update({
          where: { id: clan.id },
          data: { markBgUrl: bg, markFrontUrl: front },
        })
      }
    }
  }

  const missing = [...wanted.values()].filter((c) => !idBySourceId.has(c.sourceClanId))
  if (missing.length === 0) return idBySourceId

  /* slug 로는 이미 있을 수 있다 — 다른 경로가 `sourceClanId` 없이 만들어 둔 행이다.
     새로 만들면 slug 유니크에 걸린다. 그 행을 **입양**해 원본 id 를 채운다 */
  const bySlug = await prisma.clan.findMany({
    where: { slug: { in: missing.map((c) => c.slug) } },
    select: { id: true, slug: true, sourceClanId: true, markBgUrl: true, markFrontUrl: true },
  })
  const slugRow = new Map(bySlug.map((c) => [c.slug, c]))

  for (const clan of missing) {
    const existing = slugRow.get(clan.slug)
    if (existing) {
      idBySourceId.set(clan.sourceClanId, existing.id)
      if (existing.sourceClanId === null) {
        result.clansAdopted += 1
        if (existing.markBgUrl === null && clan.markBgUrl !== null) result.clansMarkFilled += 1
        if (confirm) {
          await prisma.clan.update({
            where: { id: existing.id },
            data: {
              sourceClanId: clan.sourceClanId,
              markBgUrl: existing.markBgUrl ?? clan.markBgUrl,
              markFrontUrl: existing.markFrontUrl ?? clan.markFrontUrl,
            },
          })
        }
      }
      continue
    }

    result.clansCreated += 1
    if (!confirm) {
      /* 미리보기에서도 **무엇을 쓸 뻔했는지** 숫자가 똑같이 나와야 한다.
         아직 행이 없어 진짜 id 가 없으므로 자리표시자를 넣는다 —
         `confirm` 이 없으면 어차피 아무것도 쓰지 않으므로 DB 에 닿지 않는다 */
      idBySourceId.set(clan.sourceClanId, `(new:${clan.slug})`)
      continue
    }
    try {
      const created = await prisma.clan.create({
        data: {
          slug: clan.slug,
          name: clan.name,
          markBgUrl: clan.markBgUrl,
          markFrontUrl: clan.markFrontUrl,
          sourceClanId: clan.sourceClanId,
          origin: '3rd.supply',
        },
        select: { id: true },
      })
      idBySourceId.set(clan.sourceClanId, created.id)
    } catch {
      /* 같은 slug 를 다른 쪽이 방금 만들었다. 실패를 삼키지 않고 다시 찾아 잇는다 */
      const again = await prisma.clan.findUnique({
        where: { slug: clan.slug },
        select: { id: true },
      })
      if (again) idBySourceId.set(clan.sourceClanId, again.id)
    }
  }

  return idBySourceId
}

/**
 * 한 덩어리를 적재한다. 호출부가 파일을 흘려 읽으며 여러 번 부른다.
 *
 * `result` 를 넘겨 받아 **누적**한다 — 수만 건을 한 배열에 모으지 않기 위해서다.
 */
export async function applySupplyPlayerProfiles(
  rows: readonly SupplyPlayerProfileInput[],
  input: { confirm: boolean; result: SupplyPlayerProfilesApplyResult },
): Promise<SupplyPlayerProfilesApplyResult> {
  const { confirm, result } = input
  if (rows.length === 0) return result

  const byPlayerId = new Map<string, SupplyPlayerProfileInput>()
  for (const row of rows) {
    result.read += 1
    /* 같은 선수가 두 번 오면 나중 줄이 이긴다 (재수집분이 우선) */
    byPlayerId.set(row.playerId, row)
  }

  /**
   * **`origin` 으로 거르지 않는다** (D-162).
   *
   * 예전에는 `origin='3rd.supply'` 만 봤다. 그래서 넥슨 경기 수집이 먼저 만든 행
   * (`OBS-` · `origin='nexon'`)이 통째로 빠졌고, 그 선수들은 **닉네임이 옛것이고
   * 소속이 비어** 있었다 — 선수 `huwho` 가 그 예다(우리 화면에서 `후후시치` · 소속 없음).
   * 기준은 출처가 아니라 **`sourcePlayerId` 가 그 선수를 가리키는가** 다.
   *
   * 개발 시드(`origin='mock'`)에는 `sourcePlayerId` 가 없어 애초에 걸리지 않지만,
   * 실수로 붙는 날을 대비해 명시적으로 뺀다.
   */
  const players = await prisma.player.findMany({
    where: {
      sourcePlayerId: { in: [...byPlayerId.keys()] },
      origin: { not: 'mock' },
    },
    select: {
      id: true,
      sourcePlayerId: true,
      name: true,
      position: true,
      note: true,
      renewedAt: true,
      clanId: true,
    },
  })
  const found = new Map<string, (typeof players)[number][]>()
  for (const player of players) {
    const key = player.sourcePlayerId as string
    const list = found.get(key)
    if (list) list.push(player)
    else found.set(key, [player])
  }

  /* 클랜을 먼저 정리한다 — 선수 갱신이 `Clan.id` 를 필요로 한다 */
  const clanIdBySourceId = await resolveClans(
    [...byPlayerId.values()].flatMap((row) => (row.clan ? [row.clan] : [])),
    { confirm, result },
  )

  for (const [playerId, row] of byPlayerId) {
    const matches = found.get(playerId)
    if (!matches || matches.length === 0) {
      result.unknownPlayers += 1
      continue
    }

    const label = supplyPositionLabel(row.position)
    if (row.position !== null && label === null) {
      /* 값은 분명히 있는데 뭐라고 부르는지 모른다. 지어내지 않고 **센다** */
      result.positionUnknownCode += 1
      const key = String(row.position)
      const seen = result.unknownCodeSamples[key]
      if (seen) seen.count += 1
      else result.unknownCodeSamples[key] = { count: 1, samplePlayerId: playerId }
    }

    const renewedAt = parseSupplyDateTime(row.renewedAt)
    if (row.renewedAt !== null && renewedAt === null) result.renewedAtUnparsed += 1

    /* 소속 — 프로필 값이 **우선**이다 (D-162).
       프로필에 없으면 기존 값(D-160 이 최신 경기에서 되짚은 값)을 그대로 둔다.
       프로필이 "무소속" 이라고 말한 것과 "모른다" 를 구분할 수 없어서다 —
       원본 응답의 `clan: null` 은 둘 중 어느 쪽인지 말해 주지 않는다 `[미확인]`. */
    const clanId = row.clan ? (clanIdBySourceId.get(row.clan.sourceClanId) ?? null) : null
    if (row.clan) result.clanGiven += 1
    else result.clanLeftToFallback += 1

    /* 원본이 **지금** 쓰는 닉네임. 빈 문자열은 이름이 아니다 — 그때는 바꾸지 않는다 */
    const name = row.name !== null && row.name.trim() !== '' ? row.name : null

    for (const player of matches) {
      result.matched += 1
      if (label !== null) result.positionSet += 1
      if (row.note !== null) result.noteSet += 1
      if (renewedAt !== null) result.renewedAtSet += 1

      const nameChanged = name !== null && player.name !== name
      if (nameChanged) {
        result.namesChanged += 1
        if (result.nameChangeSamples.length < 20) {
          result.nameChangeSamples.push({ playerId, before: player.name, after: name })
        }
      }

      const clanChanged = clanId !== null && player.clanId !== clanId
      if (clanChanged) result.clanSet += 1
      else if (clanId !== null) result.clanUnchanged += 1

      const same =
        player.position === label &&
        player.note === row.note &&
        (player.renewedAt?.getTime() ?? null) === (renewedAt?.getTime() ?? null) &&
        !nameChanged &&
        !clanChanged
      if (same) {
        result.unchanged += 1
        continue
      }

      result.updated += 1
      if (!confirm) continue

      await prisma.player.update({
        where: { id: player.id },
        data: {
          position: label,
          note: row.note,
          renewedAt,
          /* 값이 없으면 **건드리지 않는다.** 빈 값으로 밀어 지우지 않는다 */
          ...(nameChanged ? { name } : {}),
          ...(clanChanged ? { clanId } : {}),
        },
      })
    }
  }

  return result
}

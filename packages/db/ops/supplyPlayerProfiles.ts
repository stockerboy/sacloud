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

/** 적재 입력 한 줄 — 수집 파일에서 뽑아 온 값 그대로 */
export interface SupplyPlayerProfileInput {
  /** 3rd.supply 의 player id */
  playerId: string
  /** 포지션 **코드**. 원본에 없으면 `null` */
  position: number | null
  note: string | null
  /** `YYYY-MM-DD HH:mm:ss` (KST 표기). 모양이 다르면 버린다 */
  renewedAt: string | null
}

export interface SupplyPlayerProfilesApplyResult {
  confirm: boolean
  /** 넘겨받은 줄 수 */
  read: number
  /** 우리 DB 의 `origin='3rd.supply'` 선수와 이어진 줄 */
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
  }
}

export function createSupplyPlayerProfilesResult(confirm: boolean): SupplyPlayerProfilesApplyResult {
  return emptyResult(confirm)
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

  /* `origin` 을 조건에 넣는다 — 넥슨 경로로 들어온 행을 덮지 않기 위해서다 */
  const players = await prisma.player.findMany({
    where: { origin: '3rd.supply', sourcePlayerId: { in: [...byPlayerId.keys()] } },
    select: { id: true, sourcePlayerId: true, position: true, note: true, renewedAt: true },
  })
  const found = new Map(players.map((p) => [p.sourcePlayerId as string, p]))

  for (const [playerId, row] of byPlayerId) {
    const player = found.get(playerId)
    if (!player) {
      result.unknownPlayers += 1
      continue
    }
    result.matched += 1

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

    if (label !== null) result.positionSet += 1
    if (row.note !== null) result.noteSet += 1
    if (renewedAt !== null) result.renewedAtSet += 1

    const same =
      player.position === label &&
      player.note === row.note &&
      (player.renewedAt?.getTime() ?? null) === (renewedAt?.getTime() ?? null)
    if (same) {
      result.unchanged += 1
      continue
    }

    result.updated += 1
    if (!confirm) continue

    await prisma.player.update({
      where: { id: player.id },
      data: { position: label, note: row.note, renewedAt },
    })
  }

  return result
}

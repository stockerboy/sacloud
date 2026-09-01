/**
 * **구역 칠하기 도구가 쓸 재료** — 킬 좌표를 격자 칸별로 집계해 한 파일로 낸다.
 *
 * ── 왜 필요했나  ← **이 일은 끝났다**
 *
 *   > ### ⚠ 정정 (2026-09-01) — **사용자가 칠했고 네 곳이 다 있다**
 *   > 지금 `data/barracks/style-zones.json` 에는 8곳이 다 있고
 *   > (`BIRONG · BUNKER · GJA · DALBANG · SEOLDAE · CONDWI · NOKDWI · MERI`),
 *   > `clanHexV2.ts` 의 `A_ATTACK_ZONE_LABELS_MISSING` 이 **빈 배열**이다.
 *   > 아래 「두 곳뿐이다」 는 서술은 **그때는 맞았고 지금은 아니다.**
 *   > 지우지 않는다 (`CLAUDE.md` 10-4) — 이 도구가 왜 생겼는지가 거기 있다.
 *   > 다시 칠할 일이 생기면 이 스크립트는 그대로 쓸 수 있다.
 *
 *   `녹뒤` · `머리` 두 구역의 좌표가 없어서 ⑥ A어택성공이 **네 곳 중 두 곳**(`컨뒤` ·
 *   `A설대`)으로만 세고 있다 (D-235 Q6 · `clanHexV2.ts` 의 `A_ATTACK_ZONE_LABELS_MISSING`).
 *   없는 지명을 지어낼 수 없으니 사용자가 격자 위에 직접 칠해야 한다.
 *   이 스크립트는 그 화면이 깔고 그릴 **바닥 그림**(칸별 킬/데스 밀도)을 만든다.
 *   **화면은 만들지 않는다.** 여기서는 자료만 낸다.
 *
 * ── 좌표계는 `data/barracks/style-zones.json` 을 그대로 따른다
 *   `cell = 10` · 칸 키는 `"gx,gy"` · `gx = floor(x / 10)` 이다.
 *   `floor` 라는 사실은 추측이 아니라 코드에서 확인했다 —
 *   `packages/nexon/src/duel.ts` 의 `inZone()` 과 `position.ts` 의 `zoneOf()` 가
 *   둘 다 `Math.floor(point.x / cell)` 를 쓴다.
 *
 *   ⚠ `data/barracks/map-align.json`(맵 그림 정렬)은 **미해결이라 쓰지 않는다.**
 *   이 파일은 그림 좌표가 아니라 **격자 칸**만 다룬다.
 *
 * ── `k` 와 `v` 를 **따로** 센다
 *   한 킬에는 자리가 둘이다 — 잡은 사람이 서 있던 자리(`kill_*`)와 죽은 사람이 서 있던
 *   자리(`death_*`). 구역 이름이 **누구의 자리**를 가리키는지는 아직 안 정해졌다
 *   (`[미확인]` ①-3 · ⑥-2 · `clanHexV2.ts` 의 `ZoneCount`). 실측에서 두 읽기가 크게
 *   갈렸으므로(byKiller 2.0% vs byVictim 32.2%) **둘 다 남긴다. 여기서 고르지 않는다.**
 *
 * ── `ks` · `vs` 는 **상대 스나를 잡은 킬**만이다
 *   ⑥ 이 재는 것이 「상대 스나이퍼를 어느 구역에서 죽였나」라서, 실제로 쓰이는 그림은
 *   전체 킬이 아니라 **죽은 쪽이 스나인 킬**의 분포다.
 *   무기 판정은 `packages/nexon/src/weapon.ts` 의 `classifyWeapon()` 이 한다 —
 *   그 경기에서 그 선수가 낸 라플/스나 킬 수를 신호로 넣는다(적중 신호는 배틀로그에
 *   없으므로 `null`). **동률이거나 킬이 없으면 `unknown` 이고, 그러면 세지 않는다.**
 *
 * ── 한 경기는 **응답 하나**로만 읽는다
 *   같은 경기가 양 클랜 목록에 다 나온다. 두 응답을 다 세면 같은 킬을 두 번 센다.
 *   그래서 경기키마다 응답을 하나만 고른다 — **클랜 단위 우선, 그다음 `id` 최소**.
 *   클랜 응답 하나에 양 팀 10명이 다 실려 오므로 그것이 가장 넓다 (D-184).
 *   선수 단위 응답은 그 경기에 클랜 응답이 없을 때만 쓴다.
 *
 * ── 전량을 한 번에 메모리에 올리지 않는다 (D-225)
 *   한 경기 원문에 이벤트가 수천 개다. 고를 `id` 목록만 먼저 뽑고(가벼운 SQL),
 *   그다음 200건씩 끊어 읽으며 **집계 결과만** 남긴다.
 *
 * ── DB 에 쓰지 않는다. 읽기만 한다. 로컬(5433)만 본다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/zoneCanvasData.ts [--out <경로>]
 * ```
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { classifyWeapon, killsOf, type DuelEvent } from '@sacloud/nexon'
import { REPO_ROOT } from '../lib/env.js'

/** 한 번에 읽을 원문 줄 수. `battlelog.ts` · `clanHexV2Build.ts` 가 쓰는 값과 같다 (D-225) */
const BATCH = 200

/** 격자의 기준. 이 파일의 좌표계를 그대로 쓴다 */
const ZONE_FILE = join(REPO_ROOT, 'data/barracks/style-zones.json')

const outIndex = process.argv.indexOf('--out')
const out =
  (outIndex >= 0 ? process.argv[outIndex + 1] : undefined) ??
  join(REPO_ROOT, 'data/barracks/zone-canvas-data.json')

/* ------------------------------------------------------------------ 구역 --- */

interface StyleZoneFile {
  cell: number
  labels: Record<string, string>
  zone: Record<string, string>
}

const zoneFile = JSON.parse(readFileSync(ZONE_FILE, 'utf8')) as StyleZoneFile
const CELL = zoneFile.cell
const paintedCells = Object.keys(zoneFile.zone)

/* ------------------------------------------------------------------ 킬 --- */

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** 킬 한 건 — **자리가 둘**이다. `killsOf()` 는 잡은 쪽 자리만 주므로 여기서 다시 읽는다 */
interface KillBothSides {
  killer: string
  victim: string
  /** 죽인 쪽이 든 무기. `riple`/`sniper` 가 아니면 `null` */
  weapon: 0 | 1 | null
  /** 잡은 사람이 서 있던 자리 */
  killerAt: { x: number; y: number } | null
  /** 죽은 사람이 서 있던 자리 */
  victimAt: { x: number; y: number } | null
}

/**
 * `packages/nexon/src/duel.ts` 의 `killsOf()` 와 **같은 규칙**으로 읽되 죽은 쪽 자리도 담는다.
 *
 * 규칙을 새로 짜지 않았다는 것은 아래에서 건수를 대조해 확인한다
 * (`killsOf(events).length` 와 같아야 한다).
 */
function killsBothSidesOf(events: readonly DuelEvent[]): KillBothSides[] {
  const outKills: KillBothSides[] = []
  const seen = new Set<string>()

  for (const event of events) {
    const subjectKilled = str(event.event_type) === 'kill'
    const targetKilled = str(event.target_event_type) === 'kill'
    if (subjectKilled === targetKilled) continue

    const killer = subjectKilled ? str(event.str_usn) : str(event.target_str_usn)
    const victim = subjectKilled ? str(event.target_str_usn) : str(event.str_usn)
    if (killer === null || victim === null) continue

    /* 죽인 쪽의 무기 칸을 고른다. 엇갈려 읽으면 스나가 라플로 뒤집힌다 */
    const rawWeapon = subjectKilled ? str(event.weapon) : str(event.target_weapon)
    const weapon: 0 | 1 | null = rawWeapon === 'sniper' ? 1 : rawWeapon === 'riple' ? 0 : null

    const round = numOrNull(event.round)
    const key = `${round}:${victim}:${str(event.event_time) ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)

    const kx = numOrNull(event.kill_x)
    const ky = numOrNull(event.kill_y)
    const dx = numOrNull(event.death_x)
    const dy = numOrNull(event.death_y)

    outKills.push({
      killer,
      victim,
      weapon,
      killerAt: kx === null || ky === null ? null : { x: kx, y: ky },
      victimAt: dx === null || dy === null ? null : { x: dx, y: dy },
    })
  }
  return outKills
}

/**
 * 그 경기에서 **스나를 든 선수**를 고른다 — 판정은 `weapon.ts` 가 한다.
 *
 * 배틀로그에는 적중 신호(AR/SR)가 없으므로 킬 신호만 넣는다.
 * `classifyWeapon` 은 동률·무근거를 `unknown` 으로 돌려준다. **찍지 않는다.**
 */
function sniperPlayersOf(kills: readonly KillBothSides[]): Set<string> {
  const tally = new Map<string, [number, number]>()
  for (const kill of kills) {
    if (kill.weapon === null) continue
    const entry = tally.get(kill.killer) ?? [0, 0]
    entry[kill.weapon] += 1
    tally.set(kill.killer, entry)
  }

  const snipers = new Set<string>()
  for (const [usn, [rifleKills, sniperKills]] of tally) {
    const verdict = classifyWeapon({ rifleKills, sniperKills, arHits: null, srHits: null })
    if (verdict.role === 'sniper') snipers.add(usn)
  }
  return snipers
}

/* ------------------------------------------------------------------ 집계 --- */

interface CellTally {
  x: number
  y: number
  /** 그 칸에서 **잡은** 수 */
  k: number
  /** 그 칸에서 **죽은** 수 */
  v: number
  /** 그 칸에서 **상대 스나를 잡은** 수 */
  ks: number
  /** 그 칸에서 **스나가 죽은** 수 */
  vs: number
}

const cells = new Map<string, CellTally>()

function bump(point: { x: number; y: number } | null, field: 'k' | 'v' | 'ks' | 'vs'): void {
  if (point === null) return
  const gx = Math.floor(point.x / CELL)
  const gy = Math.floor(point.y / CELL)
  const key = `${gx},${gy}`
  const entry = cells.get(key) ?? { x: gx, y: gy, k: 0, v: 0, ks: 0, vs: 0 }
  entry[field] += 1
  cells.set(key, entry)
}

/* --------------------------------------------------------------- 훑기 --- */

/**
 * 경기키마다 응답 **하나**만 고른다 — 클랜 단위 우선, 그다음 `id` 최소.
 * `id` 목록만 받으므로 가볍다. 원문은 아래에서 배치로 읽는다.
 */
const chosen = await prisma.$queryRawUnsafe<{ id: string; subjectKind: string }[]>(
  `select distinct on ("matchKey") id, "subjectKind"
     from "BarracksBattleLogRaw"
    where status = 'ok'
    order by "matchKey", (case when "subjectKind" = 'clan' then 0 else 1 end), id`,
)

const totalRows = await prisma.barracksBattleLogRaw.count({ where: { status: 'ok' } })
const chosenClan = chosen.filter((row) => row.subjectKind === 'clan').length

let scannedRows = 0
/** 이벤트가 하나도 없던 응답 */
let emptyRows = 0
let kills = 0
/** `killsOf()` 와 건수가 어긋난 응답 — 0 이어야 한다 */
let killCountMismatch = 0
let killerPoints = 0
let victimPoints = 0
/** 죽은 쪽이 스나로 판정된 킬 */
let sniperVictimKills = 0
/** 그중 잡은 자리 / 죽은 자리가 **이름 없는 칸**인 것 */
let sniperKillsUnlabeledByKiller = 0
let sniperKillsUnlabeledByVictim = 0
let sniperKillsWithKillerPoint = 0
let sniperKillsWithVictimPoint = 0

const paintedSet = new Set(paintedCells)
const labelOf = (point: { x: number; y: number } | null): string | null => {
  if (point === null) return null
  const key = `${Math.floor(point.x / CELL)},${Math.floor(point.y / CELL)}`
  return paintedSet.has(key) ? key : null
}

for (let offset = 0; offset < chosen.length; offset += BATCH) {
  const ids = chosen.slice(offset, offset + BATCH).map((row) => row.id)
  const batch = await prisma.barracksBattleLogRaw.findMany({
    where: { id: { in: ids } },
    select: { payload: true },
  })

  for (const row of batch) {
    scannedRows += 1
    const payload = row.payload as { raw?: unknown } | null
    const raw = (
      payload && typeof payload === 'object' && payload.raw && typeof payload.raw === 'object'
        ? payload.raw
        : payload
    ) as { battleLog?: DuelEvent[] } | null
    const events = Array.isArray(raw?.battleLog) ? raw.battleLog : []
    if (events.length === 0) {
      emptyRows += 1
      continue
    }

    const matchKills = killsBothSidesOf(events)
    /* 규칙을 새로 짜지 않았는지 대조한다 */
    if (matchKills.length !== killsOf(events).length) killCountMismatch += 1

    const snipers = sniperPlayersOf(matchKills)

    for (const kill of matchKills) {
      kills += 1
      if (kill.killerAt !== null) killerPoints += 1
      if (kill.victimAt !== null) victimPoints += 1
      bump(kill.killerAt, 'k')
      bump(kill.victimAt, 'v')

      if (!snipers.has(kill.victim)) continue
      sniperVictimKills += 1
      bump(kill.killerAt, 'ks')
      bump(kill.victimAt, 'vs')
      if (kill.killerAt !== null) {
        sniperKillsWithKillerPoint += 1
        if (labelOf(kill.killerAt) === null) sniperKillsUnlabeledByKiller += 1
      }
      if (kill.victimAt !== null) {
        sniperKillsWithVictimPoint += 1
        if (labelOf(kill.victimAt) === null) sniperKillsUnlabeledByVictim += 1
      }
    }
  }
}

/* ------------------------------------------------------------------ 출력 --- */

/* 이미 칠해진 칸은 좌표가 0이어도 남긴다 — 지형지물이라 화면에 보여야 한다 */
for (const key of paintedCells) {
  if (cells.has(key)) continue
  const [gx, gy] = key.split(',').map(Number)
  if (gx === undefined || gy === undefined) continue
  cells.set(key, { x: gx, y: gy, k: 0, v: 0, ks: 0, vs: 0 })
}

const list = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x)
const xs = list.map((cell) => cell.x)
const ys = list.map((cell) => cell.y)

/* 좌표계 검증 — 이미 칠해진 칸 중 몇 %가 좌표를 갖는가 */
const paintedWithData = paintedCells.filter((key) => {
  const cell = cells.get(key)
  return cell !== undefined && cell.k + cell.v > 0
}).length
const paintedCoverage = paintedCells.length === 0 ? 0 : paintedWithData / paintedCells.length

const source =
  `BarracksBattleLogRaw(status=ok) ${totalRows}행 중 경기키마다 응답 1건씩 ${chosen.length}건` +
  `(클랜 ${chosenClan} · 선수 ${chosen.length - chosenClan})을 훑었다. ` +
  `킬 ${kills}건 · 잡은 자리 좌표 ${killerPoints} · 죽은 자리 좌표 ${victimPoints} · ` +
  `죽은 쪽이 스나로 판정된 킬 ${sniperVictimKills}. ` +
  `격자는 style-zones.json 과 같다 (cell=${CELL} · floor(x/cell)). ` +
  `k+v 가 0인 칸은 뺐다. 다만 이미 칠해진 칸은 0이어도 남겼다.`

const payload = {
  cell: CELL,
  source,
  builtAt: new Date().toISOString(),
  bounds: {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  },
  labels: zoneFile.labels,
  zone: zoneFile.zone,
  cells: list,
}
writeFileSync(out, JSON.stringify(payload), 'utf8')

console.info(
  JSON.stringify(
    {
      원문행_전체: totalRows,
      훑은_응답: scannedRows,
      이벤트없음: emptyRows,
      killsOf와_불일치한_응답: killCountMismatch,
      킬: kills,
      잡은자리_좌표: killerPoints,
      죽은자리_좌표: victimPoints,
      스나가_죽은_킬: sniperVictimKills,
      이름없는칸_비율_byKiller:
        sniperKillsWithKillerPoint === 0
          ? null
          : sniperKillsUnlabeledByKiller / sniperKillsWithKillerPoint,
      이름없는칸_비율_byVictim:
        sniperKillsWithVictimPoint === 0
          ? null
          : sniperKillsUnlabeledByVictim / sniperKillsWithVictimPoint,
      칸_전체: list.length,
      칸_값있음: list.filter((cell) => cell.k + cell.v > 0).length,
      bounds: payload.bounds,
      칠해진칸: paintedCells.length,
      칠해진칸_좌표있음: paintedWithData,
      칠해진칸_좌표비율: paintedCoverage,
      out,
      bytes: statSync(out).size,
    },
    null,
    2,
  ),
)
await prisma.$disconnect()

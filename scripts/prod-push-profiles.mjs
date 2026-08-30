/**
 * 로컬에서 만든 **판정 결과**를 운영으로 옮긴다 (D-194 · D-196 · D-199).
 *
 * ```
 * node scripts/prod-push-profiles.mjs            # 무엇이 옮겨질지 보여주기만 한다
 * node scripts/prod-push-profiles.mjs --confirm  # 실제 반영
 * ```
 *
 * 옮기는 것은 **파생 집계 두 표**뿐이다.
 *
 * ```
 * PlayerRoundProfile     라운드 복원 집계 (세이브 · 소수싸움 · 매치의사나이 · 스나싸움 · 작업 · 원어택)
 * PlayerPositionProfile  좌표로 판정한 포지션
 * ```
 *
 * ── 왜 원문이 아니라 집계를 옮기는가
 *   배틀로그 원문은 180MB 다. 그리고 **원문은 파일로 보존돼 있고**(3-A 1번)
 *   집계는 그 원문에서 언제든 다시 만들 수 있다. 화면이 읽는 것은 집계뿐이다.
 *
 * ── 안전 장치
 *   · `--confirm` 없이는 **한 줄도 쓰지 않는다**
 *   · 대상이 루프백이면 거부한다 (운영용 스크립트다)
 *   · 접속 주소를 화면에 찍지 않는다 — 호스트만 보여준다
 *   · **지우지 않는다.** `upsert` 로 덮어쓰기만 한다. 운영에만 있는 줄은 그대로 남는다
 *   · `playerId` 는 **운영에서 다시 찾는다.** 로컬 id 를 그대로 옮기면 운영에 없는
 *     선수를 가리킬 수 있다 — 실제로 로컬과 운영은 경기 수가 다르다(627건 차이)
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../packages/db/generated/client')

const confirm = process.argv.includes('--confirm')

const LOCAL_URL = 'postgresql://sacloud:sacloud@localhost:5433/sacloud?schema=public'

function prodUrl() {
  const text = readFileSync('packages/db/.env.production.local', 'utf8')
  const url = (text.match(/DATABASE_URL="([^"]+)"/) ?? [])[1]
  if (!url) throw new Error('packages/db/.env.production.local 에 DATABASE_URL 이 없다')
  const host = new URL(url).host
  if (host.includes('127.0.0.1') || host.includes('localhost')) {
    throw new Error(`대상이 로컬이다 (${host}). 이 스크립트는 운영용이다.`)
  }
  return url
}

/** 한 번에 보내는 줄 수. 풀러 뒤라 크게 잡지 않는다 */
const CHUNK = 200

async function main() {
  const url = prodUrl()
  console.info('대상:', new URL(url).host)
  console.info(confirm ? '반영한다' : '미리보기다 — 실제로 넣으려면 --confirm')

  const local = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } })
  const prod = new PrismaClient({ datasources: { db: { url } } })

  try {
    /* ---- 1. 라운드 집계 ---- */
    const rounds = await local.playerRoundProfile.findMany()
    /* ---- 2. 포지션 판정 ---- */
    const positions = await local.playerPositionProfile.findMany()

    /* 로컬 playerId → 그 선수의 원본 id. 운영에서 그 값으로 다시 찾는다 */
    const localIds = [
      ...new Set([...rounds, ...positions].map((row) => row.playerId).filter(Boolean)),
    ]
    const localPlayers = await local.player.findMany({
      where: { id: { in: localIds } },
      select: { id: true, sourcePlayerId: true },
    })
    const sourceOf = new Map(localPlayers.map((p) => [p.id, p.sourcePlayerId]))

    const sources = [...new Set([...sourceOf.values()].filter(Boolean))]
    const prodPlayers = []
    for (let i = 0; i < sources.length; i += 500) {
      prodPlayers.push(
        ...(await prod.player.findMany({
          where: { sourcePlayerId: { in: sources.slice(i, i + 500) } },
          select: { id: true, sourcePlayerId: true },
        })),
      )
    }
    const prodIdOf = new Map(prodPlayers.map((p) => [p.sourcePlayerId, p.id]))

    const mapPlayer = (localPlayerId) => {
      if (!localPlayerId) return null
      const source = sourceOf.get(localPlayerId)
      if (!source) return null
      return prodIdOf.get(source) ?? null
    }

    let roundLinked = 0
    let positionLinked = 0
    for (const row of rounds) if (mapPlayer(row.playerId)) roundLinked += 1
    for (const row of positions) if (mapPlayer(row.playerId)) positionLinked += 1

    console.info('')
    console.info('라운드 집계  :', rounds.length, '줄 · 운영 선수와 이어지는 것', roundLinked)
    console.info('포지션 판정  :', positions.length, '줄 · 운영 선수와 이어지는 것', positionLinked)

    if (!confirm) {
      console.info('')
      console.info('미리보기다. 아무것도 쓰지 않았다.')
      return
    }

    let written = 0
    for (let i = 0; i < rounds.length; i += CHUNK) {
      for (const row of rounds.slice(i, i + CHUNK)) {
        /* `id` 는 **일부러 뺀다** — 운영은 자기 id 를 쓴다. 로컬 id 를 옮기면 충돌한다 */
        const { id: _id, playerId, userNexonSn, builderVersion, ...rest } = row
        const data = { ...rest, playerId: mapPlayer(playerId) }
        await prod.playerRoundProfile.upsert({
          where: { userNexonSn_builderVersion: { userNexonSn, builderVersion } },
          update: data,
          create: { userNexonSn, builderVersion, ...data },
        })
        written += 1
      }
      console.info(`  라운드 ${Math.min(i + CHUNK, rounds.length)}/${rounds.length}`)
    }

    let posWritten = 0
    for (let i = 0; i < positions.length; i += CHUNK) {
      for (const row of positions.slice(i, i + CHUNK)) {
        /* `id` 는 **일부러 뺀다** — 운영은 자기 id 를 쓴다 */
        const { id: _id, playerId, userNexonSn, classifierVersion, ...rest } = row
        const data = { ...rest, playerId: mapPlayer(playerId) }
        await prod.playerPositionProfile.upsert({
          where: { userNexonSn_classifierVersion: { userNexonSn, classifierVersion } },
          update: data,
          create: { userNexonSn, classifierVersion, ...data },
        })
        posWritten += 1
      }
      console.info(`  포지션 ${Math.min(i + CHUNK, positions.length)}/${positions.length}`)
    }

    console.info('')
    console.info('반영 완료 — 라운드', written, '줄 · 포지션', posWritten, '줄')
  } finally {
    await local.$disconnect()
    await prod.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

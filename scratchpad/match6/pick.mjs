/**
 * ★아티팩트에 넣을 선수 여섯 · 클랜 둘★ 을 뽑아 값을 낸다 (2026-09-17 사장님).
 *
 * > «축 완성되면 나한테 스나2명 라플4명 경기두개 클랜두개 아팉팩트로 만들어줄 수 있나»
 *
 * ⚠ 값을 지어내지 않는다 — 여섯 축이 다 차고 40판 이상 뛴 선수만 고른다.
 *   `LeaguePlayer` 의 클랜 칸은 `clanId` 다 (`leagueClanId` 가 아니다 — 한 번 틀렸다).
 */
import { PrismaClient } from '/root/sacloud/packages/db/generated/client/index.js'

const p = new PrismaClient()
await p.$executeRawUnsafe(`SET statement_timeout='600s'`)

const players = await p.$queryRawUnsafe(`
  SELECT pl."name" nick, c."name" clan, c."slug" cslug, h."weapon" w, h."games" g,
         h."seat" seat, h."seatRatio" ratio,
         h."save" sv, h."duel" du, h."carry" ch, h."opening" sf, h."burst" gp, h."outnumbered" ou,
         h."saveRank" svr, h."duelRank" dur, h."carryRank" chr, h."openingRank" sfr,
         h."burstRank" gpr, h."outnumberedRank" our,
         h."saveTotal" svt, h."duelTotal" dut, h."carryTotal" cht, h."openingTotal" sft,
         h."burstTotal" gpt, h."outnumberedTotal" out,
         h."aAtkN" aan, h."aAtkOk" aao, h."aDefN" adn, h."aDefOk" ado,
         h."bAtkN" ban, h."bAtkOk" bao, h."bDefN" bdn, h."bDefOk" bdo,
         h."f2AtkN" fan, h."f2AtkOk" fao, h."f2DefN" fdn, h."f2DefOk" fdo,
         h."shortAtkN" san, h."shortAtkOk" sao, h."shortDefN" sdn, h."shortDefOk" sdo,
         h."seatSpots" ss, h."seatBSpots" sb, h."seatF2Spots" sf2, h."seatShortSpots" ssh,
         h."sniperKills" sk, l."slug" league
    FROM "LeaguePlayerHex" h
    JOIN "LeaguePlayer" lp ON lp."id" = h."leaguePlayerId"
    JOIN "Player" pl ON pl."id" = lp."playerId"
    JOIN "League" l ON l."id" = lp."leagueId"
    LEFT JOIN "Clan" c ON c."id" = lp."clanId"
   WHERE h."games" >= 40 AND h."seat" IS NOT NULL
     AND h."save" IS NOT NULL AND h."duel" IS NOT NULL AND h."carry" IS NOT NULL
     AND h."opening" IS NOT NULL AND h."burst" IS NOT NULL AND h."outnumbered" IS NOT NULL
   ORDER BY h."games" DESC LIMIT 400`)

const sn = players.filter((r) => r.w === 1).slice(0, 2)
const rf = players.filter((r) => r.w === 0).slice(0, 4)
const num = (k, v) => (typeof v === 'bigint' ? Number(v) : v)
console.log(JSON.stringify({ players: [...sn, ...rf] }, num))
await p.$disconnect()

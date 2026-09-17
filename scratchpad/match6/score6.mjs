/**
 * ★점수제 경기 육각★ — 한 선수의 최근 경기를 두 방식으로 뽑아 견준다 (2026-09-17 사장님).
 *
 *   여섯 축   스나싸움 · 소수싸움 · 스나점수 · 비리베점수 · 2층점수 · 숏점수
 *
 *   ① 자리(포지션)를 특정해서 사람에게 점수를 붙이는 방식
 *   ② 자리를 안 쓰고 ★구역★ 에 점수를 붙이는 방식
 *
 * 점수 (사장님):
 *   라플 잡음 1점 · 스나 잡음 2점(1·2번째 킬) / 1점(3번째 이후)
 *   폭탄설치 후 승리 2점 · 패배 1점 (★B쪽 설치는 져도 2점★)
 *   세이브 1번 1점 · 2번 3점 · 3번 5점 · 이어서 +2점
 *
 * ⚠ 스나가 번 점수는 ★스나점수에만★ 넣는다 — 구역 셋은 라플 점수만 나눈다.
 *   안 그러면 스나가 B에서 잡은 것이 두 번 세진다.
 */
import { PrismaClient } from '/root/sacloud/packages/db/generated/client/index.js'
import { readFileSync } from 'node:fs'

const NICK = process.argv[2] ?? '낼름이'
const TAKE = Number(process.argv[3] ?? 3)

const floor = JSON.parse(readFileSync('/root/zones/floor-zones.json', 'utf-8'))
const style = JSON.parse(readFileSync('/root/zones/style-zones.json', 'utf-8'))
const CELL = style.cell ?? 10
const zm = new Map()
const add = (c, n) => { const a = zm.get(c) ?? []; if (!a.includes(n)) a.push(n); zm.set(c, a) }
for (const [c, v] of Object.entries(style.zone)) add(c, v)
for (const [c, v] of Object.entries(floor.zone)) for (const n of (Array.isArray(v) ? v : [v])) add(c, n)
const at = (x, y) => (x == null || y == null || (x === 0 && y === 0))
  ? [] : (zm.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? [])

/* ── 구역 묶음 ── */
const B_Z = new Set(['BIRONG', 'BUNKER', 'BADAK', 'ILMUN'])
const F2_Z = new Set(['ICHUNG'])
/* ★숏은 숏·홀정면 + A쪽 전부★ (사장님: «A쪽 킬은 숏점수로») */
const SHORT_Z = new Set(['SHORT', 'HOLJEONG', 'NIEUN', 'JUNGGIL', 'SEOLDAEAP',
  'THREEKKANG', 'MERI', 'NOKDWI', 'SEOLDAE'])
/* 자리 판정용 — 숏 자리는 숏·홀정면만 */
const SEAT_SHORT = new Set(['SHORT', 'HOLJEONG'])
const inSet = (zs, s) => zs.some((z) => s.has(z))
const secs = (t) => { const m = /^(\d+):(\d+)$/.exec(String(t ?? '')); return m ? +m[1] * 60 + +m[2] : null }

const p = new PrismaClient()
await p.$executeRawUnsafe(`SET statement_timeout='300s'`)

const player = (await p.$queryRawUnsafe(
  `SELECT id, name FROM "Player" WHERE name = $1 ORDER BY "updatedAt" DESC NULLS LAST LIMIT 1`, NICK))[0]
if (!player) { console.log('선수를 못 찾았다:', NICK); await p.$disconnect(); process.exit(0) }

const matches = await p.$queryRawUnsafe(`
  SELECT DISTINCT m."id", m."sourceMatchId" src, m."startAt", rc."name" red, bc."name" blue,
         m."winnerSide" win, m."redLeagueClanId" rid, m."blueLeagueClanId" bid
    FROM "MatchPlayerStat" s
    JOIN "Match" m ON m."id" = s."matchId"
    JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
    JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
    JOIN "Clan" rc ON rc."id" = rl."clanId"
    JOIN "Clan" bc ON bc."id" = bl."clanId"
   WHERE s."playerId" = $1 AND m."supersededAt" IS NULL
     AND EXISTS (SELECT 1 FROM "BarracksBattleLogRaw" r
                  WHERE r."matchKey" = m."sourceMatchId" AND r.status='ok' AND r.payload IS NOT NULL)
   ORDER BY m."startAt" DESC LIMIT $2`, player.id, TAKE)

console.log(`★${player.name}★ — 배틀로그 있는 최근 ${matches.length}경기\n`)

for (const mt of matches) {
  const raws = await p.$queryRawUnsafe(
    `SELECT payload FROM "BarracksBattleLogRaw" WHERE "matchKey"=$1 AND status='ok' AND payload IS NOT NULL`, mt.src)
  /* 무기 — ★경기 기록★ 에서 온다 (킬로 짐작하지 않는다) */
  const stats = await p.$queryRawUnsafe(`
    SELECT p2."name" nick, s."weapon" w, s."side" side
      FROM "MatchPlayerStat" s JOIN "Player" p2 ON p2."id" = s."playerId"
     WHERE s."matchId" = $1`, mt.id)
  const weaponOf = new Map(stats.map((s) => [s.nick, s.w]))

  const seen = new Set(); const ev = []
  for (const r of raws) for (const e of (r.payload?.battleLog ?? [])) {
    const k = `${e.event_key}|${e.round}|${e.str_usn}|${e.event_time}|${e.event_type}`
    if (seen.has(k)) continue; seen.add(k); ev.push(e)
  }
  const teamClan = new Map()
  for (const r of raws) for (const t of (r.payload?.teamList ?? []))
    if (t?.team_no != null && t?.clan_no) teamClan.set(String(t.team_no), String(t.clan_no))

  /* 라운드별 킬 · 폭탄 · 승자 */
  const rounds = new Map()
  const R = (n) => { const k = String(n); if (!rounds.has(k)) rounds.set(k, { no: +n, kills: [], bombs: [], win: null }); return rounds.get(k) }
  const nameOf = new Map()
  for (const e of ev) {
    const rn = e.round; if (rn == null || rn === '') continue
    const r = R(rn); const t = secs(e.event_time)
    if (e.str_usn) nameOf.set(String(e.str_usn), e.user_nick ?? e.mask_nick ?? '?')
    if (e.target_str_usn) nameOf.set(String(e.target_str_usn), e.target_user_nick ?? e.mask_target_nick ?? '?')
    if (String(e.win_team_no ?? '') !== '') r.win = String(e.win_team_no)
    else if (String(e.win_flag ?? '') === 'win' && e.team_no != null && r.win === null) r.win = String(e.team_no)
    /* ★폭탄 — 심은 사람이 앞칸에도 뒷칸에도 온다★ (둘 다 읽는다) */
    for (const [wk, tk, nk] of [['weapon', 'team_no', 'user_nick'], ['target_weapon', 'target_team_no', 'target_user_nick']]) {
      const w = String(e[wk] ?? '')
      if (w !== 'c4-install') continue
      r.bombs.push({ team: String(e[tk] ?? ''), who: e[nk] ?? e[nk === 'user_nick' ? 'mask_nick' : 'mask_target_nick'] ?? null, x: e.kill_x, y: e.kill_y, t })
    }
    if (e.event_category === 'kill' && e.target_str_usn) {
      r.kills.push({ t, killer: String(e.str_usn), victim: String(e.target_str_usn), kt: String(e.team_no ?? ''), vt: String(e.target_team_no ?? ''),
        kx: e.kill_x, ky: e.kill_y, dx: e.death_x, dy: e.death_y })
    } else if (e.event_category === 'death' && e.target_str_usn) {
      r.kills.push({ t, killer: String(e.target_str_usn), victim: String(e.str_usn), kt: String(e.target_team_no ?? ''), vt: String(e.team_no ?? ''),
        kx: e.kill_x, ky: e.kill_y, dx: e.death_x, dy: e.death_y })
    }
  }
  for (const r of rounds.values()) {
    const u = new Map()
    for (const k of r.kills) {
      const key = `${k.killer}|${k.victim}|${k.t}`
      const o = u.get(key)
      u.set(key, o ? { ...o, kt: o.kt || k.kt, vt: o.vt || k.vt } : k)
    }
    r.kills = [...u.values()].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
  }
  const ordered = [...rounds.values()].sort((a, b) => a.no - b.no)
  const teams = [...new Set(ordered.flatMap((r) => r.kills.flatMap((k) => [k.kt, k.vt])).filter((x) => x !== ''))]
  if (teams.length !== 2) { console.log(`${mt.src} — 팀을 못 가름`); continue }
  const other = (t) => teams.find((x) => x !== t)

  /* ── 점수 ── */
  const zeroZ = () => ({ 스나: 0, 비리베: 0, '2층': 0, 숏: 0 })
  const byZone = Object.fromEntries(teams.map((t) => [t, zeroZ()]))   // ② 구역 방식
  const byPlayer = new Map()                                          // ① 자리 방식 재료
  const bump = (nick, team, pts, zone) => {
    if (!byPlayer.has(nick)) byPlayer.set(nick, { team, pts: 0 })
    byPlayer.get(nick).pts += pts
    byZone[team][zone] += pts
  }
  /* 자리 재료 */
  const spot = new Map()
  const S = (n) => { if (!spot.has(n)) spot.set(n, { b: 0, f2: 0, sh: 0, all: 0 }); return spot.get(n) }

  for (const r of ordered) {
    const aliveCount = Object.fromEntries(teams.map((t) => [t, 5]))
    let lastAlive = null
    r.kills.forEach((k, i) => {
      const kn = nameOf.get(k.killer) ?? '?'
      const vn = nameOf.get(k.victim) ?? '?'
      const sniperKiller = weaponOf.get(kn) === 1
      const sniperVictim = weaponOf.get(vn) === 1
      /* 점수 — 스나를 1·2번째 킬로 잡으면 2점, 뒤면 1점. 라플은 1점 */
      const pts = sniperVictim ? (i < 2 ? 2 : 1) : 1
      /* 구역 — ★잡은 사람 자리★ 기준. 스나가 번 점수는 스나점수로 */
      const kz = at(k.kx, k.ky)
      const zone = sniperKiller ? '스나'
        : inSet(kz, B_Z) ? '비리베'
        : inSet(kz, F2_Z) ? '2층'
        : inSet(kz, SHORT_Z) ? '숏'
        : null
      if (zone !== null && k.kt !== '') bump(kn, k.kt, pts, zone)
      /* 자리 재료 — 본인 위치 */
      if (kz.length) { const s = S(kn); s.all += 1; if (inSet(kz, B_Z)) s.b += 1; if (inSet(kz, F2_Z)) s.f2 += 1; if (inSet(kz, SEAT_SHORT)) s.sh += 1 }
      const dz = at(k.dx, k.dy)
      if (dz.length) { const s = S(vn); s.all += 1; if (inSet(dz, B_Z)) s.b += 1; if (inSet(dz, F2_Z)) s.f2 += 1; if (inSet(dz, SEAT_SHORT)) s.sh += 1 }
      if (k.vt !== '') { aliveCount[k.vt] -= 1; if (aliveCount[k.vt] === 1) lastAlive = k.vt }
    })
    /* ★세이브★ — 혼자 남아 그 라운드를 이긴 것. 마지막 생존자에게 준다 */
    if (lastAlive !== null && r.win === lastAlive) {
      const dead = new Set(r.kills.filter((k) => k.vt === lastAlive).map((k) => nameOf.get(k.victim)))
      const mates = [...new Set(r.kills.flatMap((k) => [k.kt === lastAlive ? nameOf.get(k.killer) : null, k.vt === lastAlive ? nameOf.get(k.victim) : null]).filter(Boolean))]
      const hero = mates.find((n) => !dead.has(n))
      if (hero) { const st = S(hero); void st }
      if (hero) {
        const zn = weaponOf.get(hero) === 1 ? '스나' : '숏'   /* 세이브 구역은 아래에서 다시 본다 */
        bump(hero, lastAlive, 0, zn)                          /* 자리만 잡아 두고 점수는 아래 합산 */
        const got = byPlayer.get(hero)
        got.saves = (got.saves ?? 0) + 1
        got.saveZone = zn
      }
    }
    /* ★폭탄★ — 심은 사람에게. B쪽 설치는 져도 2점 */
    for (const b of r.bombs) {
      if (!b.who || b.team === '') continue
      const bz = at(b.x, b.y)
      const isB = inSet(bz, B_Z)
      const won = r.win === b.team
      const pts = won ? 2 : (isB ? 2 : 1)
      const zone = weaponOf.get(b.who) === 1 ? '스나' : isB ? '비리베' : inSet(bz, F2_Z) ? '2층' : '숏'
      bump(b.who, b.team, pts, zone)
    }
  }
  /* 세이브 점수 — 1번 1점 · 2번 3점 · 3번 5점 · +2씩 */
  for (const [nick, v] of byPlayer) {
    const n = v.saves ?? 0
    if (n === 0) continue
    const pts = 2 * n - 1
    v.pts += pts
    byZone[v.team][v.saveZone] += pts
  }

  /* ── ① 자리 특정 ── */
  const seatOf = new Map()
  for (const t of teams) {
    const mates = [...byPlayer.entries()].filter(([, v]) => v.team === t).map(([n]) => n)
    const rows = mates.map((n) => {
      const s = spot.get(n) ?? { b: 0, f2: 0, sh: 0, all: 1 }
      const tot = s.all || 1
      return { n, b: s.b / tot, f2: s.f2 / tot, sh: s.sh / tot, sn: weaponOf.get(n) === 1 ? 1 : 0 }
    })
    const left = [...rows]
    const take = (cmp) => { left.sort(cmp); return left.shift() }
    const put = (row, seat) => { if (row) seatOf.set(row.n, seat) }
    put(take((x, y) => y.sn - x.sn), '스나')
    put(take((x, y) => y.b - x.b), '비리베')
    put(take((x, y) => y.b - x.b), '비리베')
    put(take((x, y) => y.f2 - x.f2), '2층')
    put(left[0], '숏')
  }
  const bySeat = Object.fromEntries(teams.map((t) => [t, zeroZ()]))
  for (const [nick, v] of byPlayer) {
    const seat = seatOf.get(nick)
    if (seat) bySeat[v.team][seat] += v.pts
  }

  /* ── 스나싸움 · 소수싸움 (저장된 집계 그대로) ── */
  const hex = await p.$queryRawUnsafe(`SELECT "teamNo", "tally" FROM "MatchClanHexV2" WHERE "matchId"=$1`, mt.id)
  const tallyOf = new Map(hex.map((h) => [String(h.teamNo), h.tally ?? {}]))
  const duelPct = (t) => { const o = (tallyOf.get(t) ?? {}).sniperDuel; if (!o) return null; const d = (o.won ?? 0) + (o.lost ?? 0); return d ? Math.round(o.won / d * 100) : null }
  const outPct = (t) => { const o = (tallyOf.get(t) ?? {}).outnumbered; if (!o || !o.rounds) return null; return Math.round(o.won / o.rounds * 100) }

  const nameOfTeam = (t) => {
    const cn = teamClan.get(t)
    void cn
    return null
  }
  void nameOfTeam
  /* 팀 번호 → 클랜 이름 (MatchClanHexV2 의 leagueClanId 로) */
  const lc = await p.$queryRawUnsafe(`SELECT "teamNo", "leagueClanId" FROM "MatchClanHexV2" WHERE "matchId"=$1`, mt.id)
  const sideName = new Map(lc.map((h) => [String(h.teamNo), h.leagueClanId === mt.rid ? mt.red : mt.blue]))
  const label = (t) => sideName.get(t) ?? `팀${t}`

  const d = new Date(mt.startAt)
  console.log(`══ ${d.getMonth() + 1}/${d.getDate()} ${mt.red} vs ${mt.blue} (${mt.win === 'red' ? mt.red : mt.blue} 승)`)
  const share = (a, b) => (a + b === 0 ? '   —   ' : `${String(Math.round(a / (a + b) * 100)).padStart(3)}%`)
  const line = (title, get) => {
    const [x, y] = teams.map(get)
    console.log(`   ${title.padEnd(9)} ${String(x).padStart(3)} : ${String(y).padStart(3)}  →  ${share(x, y)} : ${share(y, x)}`)
  }
  console.log(`   ${'축'.padEnd(9)} ${label(teams[0]).slice(0, 11)} : ${label(teams[1]).slice(0, 11)}`)
  console.log('   ── 스나싸움·소수싸움 (지금 쓰는 값) ──')
  console.log(`   스나싸움     ${String(duelPct(teams[0]) ?? '-').padStart(3)}% : ${String(duelPct(teams[1]) ?? '-').padStart(3)}%`)
  console.log(`   소수싸움     ${String(outPct(teams[0]) ?? '-').padStart(3)}% : ${String(outPct(teams[1]) ?? '-').padStart(3)}%`)
  console.log('   ── ① 자리를 특정해서 (사람에게 점수) ──')
  for (const z of ['스나', '비리베', '2층', '숏']) line(z + '점수', (t) => bySeat[t][z])
  console.log('   ── ② 자리를 안 쓰고 (구역에 점수) ──')
  for (const z of ['스나', '비리베', '2층', '숏']) line(z + '점수', (t) => byZone[t][z])
  console.log('   ── 자리 판정 ──')
  for (const t of teams) {
    const mates = [...byPlayer.entries()].filter(([, v]) => v.team === t)
      .map(([n, v]) => `${seatOf.get(n) ?? '?'} ${n}(${v.pts})`).join(' · ')
    console.log(`     ${label(t).slice(0, 11).padEnd(12)} ${mates}`)
  }
  console.log()
}
await p.$disconnect()

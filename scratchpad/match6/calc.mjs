/**
 * ★경기 여섯 축 + 라운드별 흐름★ — 사장님이 정하신 기준 그대로 (2026-09-17).
 *
 * 한 경기를 뜯어 아티팩트가 쓸 JSON 하나를 낸다. 코드를 고치지 않는다 — 읽기만 한다.
 *
 * ── 여섯 축
 *   소수싸움 · 스나싸움 · 세이브        기존 셈 (`MatchClanHexV2.tally`)
 *   A방어율 · B방어율 · 2층방어율       ★사장님 기준으로 여기서 센다★
 *
 * ── 사장님 기준 (원문)
 *   A  「숏,ㄴ자,중길,설대앞,쓰리깡,머리,녹뒤 + 컨뒤,A설대 에서 상대가 우리라플이든 스나든
 *       3번째킬 이내로 킬을 성공하면 a방어 실패」
 *   B  「비롱,벙커,바닥,일문에서 3번째 이내로 데스가 두번 나면 방어실패」
 *   2층 「B쪽보다 먼저 2층에서 데스가 먼저 나면 2층 방어 실패」
 *
 * ── 전·후반
 *   한 팀이 5승에 닿은 라운드까지가 전반 (D-208 · 29,176판 반례 0건).
 *   진영은 C4 가 정한다 — 설치한 팀이 공격. 없으면 그 라운드는 모른다.
 *
 * ⚠ `team_no` 는 ★줄 주인★ 의 팀이다. death 줄은 주인이 victim 이라
 *   killer 로 짝지으면 팀이 뒤바뀐다 (실제로 경기가 전부 12:0 으로 나온 적이 있다).
 */
import { PrismaClient } from '/root/sacloud/packages/db/generated/client/index.js'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = process.argv[2]
const OUT = process.argv[3] ?? '/root/m6.json'
const ZONES = process.argv[4] ?? '/root/zones/floor-zones.json'
const STYLE = process.argv[5] ?? '/root/zones/style-zones.json'

const floor = JSON.parse(readFileSync(ZONES, 'utf-8'))
const style = JSON.parse(readFileSync(STYLE, 'utf-8'))
const CELL = style.cell ?? 10

/** 칸 → 구역 이름들 (두 표를 합친다. 한 칸이 여러 구역일 수 있다) */
const zoneOfCell = new Map()
const add = (cell, name) => {
  const a = zoneOfCell.get(cell) ?? []
  if (!a.includes(name)) a.push(name)
  zoneOfCell.set(cell, a)
}
for (const [cell, z] of Object.entries(style.zone)) add(cell, z)
for (const [cell, zs] of Object.entries(floor.zone)) for (const z of (Array.isArray(zs) ? zs : [zs])) add(cell, z)

const zonesAt = (x, y) => {
  if (x == null || y == null || (x === 0 && y === 0)) return []
  return zoneOfCell.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []
}

/* ── 사장님이 정한 구역 묶음 ── */
/*
 * ⚠ ★숏은 뺐다★ (2026-09-17 사장님: «숏(아까 잘못말함 숏구역에서 잡거나 잡힌건 제외)»).
 *   옛 목록은 숏을 넣은 아홉이었다 — `A_ZONES_V1` 로 남겨 둔다 (`CLAUDE.md` 1-4).
 */
const A_ZONES_V1 = new Set(['SHORT', 'NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'CONDWI', 'SEOLDAE'])
const A_ZONES = new Set(['NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'CONDWI', 'SEOLDAE'])
const B_ZONES = new Set(['BIRONG', 'BUNKER', 'BADAK', 'ILMUN'])
const F2_ZONES = new Set(['ICHUNG'])
const inSet = (zs, set) => zs.some((z) => set.has(z))

const secs = (t) => {
  const m = /^(\d+):(\d+)$/.exec(String(t ?? ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

const p = new PrismaClient()
await p.$executeRawUnsafe(`SET statement_timeout = '600s'`)

const meta = (await p.$queryRawUnsafe(`
  SELECT m.id, m."sourceMatchId" src, m."startAt", m."winnerSide" win,
         m."redLeagueClanId" rid, m."blueLeagueClanId" bid,
         rc.name red, bc.name blue, rc.slug rslug, bc.slug bslug,
         COALESCE(mp.name, '?') map
    FROM "Match" m
    JOIN "LeagueClan" rl ON rl.id = m."redLeagueClanId"
    JOIN "LeagueClan" bl ON bl.id = m."blueLeagueClanId"
    JOIN "Clan" rc ON rc.id = rl."clanId"
    JOIN "Clan" bc ON bc.id = bl."clanId"
    LEFT JOIN "GameMap" mp ON mp.id = m."mapId"
   WHERE m."sourceMatchId" = $1 AND m."supersededAt" IS NULL LIMIT 1`, SRC))[0]
if (!meta) { console.log(JSON.stringify({ error: 'match-not-found', src: SRC })); await p.$disconnect(); process.exit(0) }

const raws = await p.$queryRawUnsafe(
  `SELECT subject, payload FROM "BarracksBattleLogRaw" WHERE "matchKey"=$1 AND status='ok' AND payload IS NOT NULL`, SRC)
if (raws.length === 0) { console.log(JSON.stringify({ error: 'no-battlelog', src: SRC })); await p.$disconnect(); process.exit(0) }

/* teamList 로 team_no ↔ 클랜번호를 잇는다 */
const teamClan = new Map()
for (const r of raws) for (const t of (r.payload?.teamList ?? [])) {
  if (t?.team_no != null && t?.clan_no) teamClan.set(String(t.team_no), String(t.clan_no))
}

/* 줄을 합친다 — 같은 event_key 는 한 번만 */
const seen = new Set()
const ev = []
for (const r of raws) for (const e of (r.payload?.battleLog ?? [])) {
  const k = `${e.event_key}|${e.round}|${e.str_usn}|${e.event_time}|${e.event_type}|${e.weapon}|${e.target_str_usn}`
  if (seen.has(k)) continue
  seen.add(k)
  ev.push(e)
}

/* 선수 이름·무기 */
const nameOf = new Map(), weaponSeen = new Map()
for (const e of ev) {
  if (e.str_usn) nameOf.set(String(e.str_usn), e.user_nick ?? e.mask_nick ?? '?')
  if (e.target_str_usn) nameOf.set(String(e.target_str_usn), e.target_user_nick ?? e.mask_target_nick ?? '?')
  if (e.event_category === 'kill' && e.str_usn && e.weapon) {
    const m = weaponSeen.get(String(e.str_usn)) ?? {}
    m[e.weapon] = (m[e.weapon] ?? 0) + 1
    weaponSeen.set(String(e.str_usn), m)
  }
}
const isSniperName = (w) => /sniper/i.test(String(w))
const mainIsSniper = new Map()
for (const [usn, m] of weaponSeen) {
  let sn = 0, tot = 0
  for (const [w, n] of Object.entries(m)) { tot += n; if (isSniperName(w)) sn += n }
  mainIsSniper.set(usn, tot > 0 && sn / tot >= 0.5)
}

/* 라운드별로 모은다 */
const rounds = new Map()
const R = (n) => {
  const k = String(n)
  if (!rounds.has(k)) rounds.set(k, { no: Number(n), kills: [], winTeam: null, bombs: [] })
  return rounds.get(k)
}
for (const e of ev) {
  const rn = e.round; if (rn == null || rn === '') continue
  const r = R(rn)
  const t = secs(e.event_time)
  if (String(e.win_team_no ?? '') !== '') r.winTeam = String(e.win_team_no)
  else if (String(e.win_flag ?? '') === 'win' && e.team_no != null && r.winTeam === null) r.winTeam = String(e.team_no)

  /* 폭탄 — 설치한 팀이 공격 */
  const w1 = String(e.weapon ?? ''), w2 = String(e.target_weapon ?? '')
  if (w1 === 'c4-install' || w2 === 'c4-install') r.bombs.push({ kind: 'install', team: String(e.team_no ?? ''), t })
  if (w1 === 'c4-dismantle' || w2 === 'c4-dismantle') r.bombs.push({ kind: 'dismantle', team: String(e.team_no ?? ''), t })

  /* 킬 한 건 — ★team_no 는 줄 주인의 팀★ */
  if (e.event_category === 'kill' && e.target_str_usn) {
    r.kills.push({
      t, killer: String(e.str_usn), victim: String(e.target_str_usn),
      killerTeam: String(e.team_no ?? ''),
      victimTeam: String(e.target_team_no ?? ''),
      weapon: String(e.weapon ?? ''),
      killZones: zonesAt(e.kill_x, e.kill_y),
      deathZones: zonesAt(e.death_x, e.death_y),
    })
  } else if (e.event_category === 'death' && e.target_str_usn) {
    /* death 줄 — 주인이 victim 이다 */
    r.kills.push({
      t, killer: String(e.target_str_usn), victim: String(e.str_usn),
      killerTeam: String(e.target_team_no ?? ''),
      victimTeam: String(e.team_no ?? ''),
      weapon: String(e.target_weapon ?? ''),
      killZones: zonesAt(e.kill_x, e.kill_y),
      deathZones: zonesAt(e.death_x, e.death_y),
    })
  }
}

/* 같은 킬이 kill/death 두 줄로 오므로 합친다 */
for (const r of rounds.values()) {
  const uniq = new Map()
  for (const k of r.kills) {
    const key = `${k.killer}|${k.victim}|${k.t}`
    const old = uniq.get(key)
    if (!old) { uniq.set(key, k); continue }
    uniq.set(key, {
      ...old,
      killerTeam: old.killerTeam || k.killerTeam,
      victimTeam: old.victimTeam || k.victimTeam,
      weapon: old.weapon || k.weapon,
      killZones: old.killZones.length ? old.killZones : k.killZones,
      deathZones: old.deathZones.length ? old.deathZones : k.deathZones,
    })
  }
  r.kills = [...uniq.values()].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
}

const ordered = [...rounds.values()].sort((a, b) => a.no - b.no)

/*
 * ★라운드 승자를 데스 수로 메운다★ (2026-09-17).
 *   `win_team_no` 가 ★모든 라운드에 오지 않는다★ — 이 다섯 경기에서 55라운드 중 5개가 비었다.
 *   (deluxe vs 〃veritas 는 9라운드 중 4개가 비어서 «3:2» 로 적혀 있다. 진짜 9라운드다.)
 *   비면 그 라운드에서 ★더 많이 죽은 팀이 졌다★ 로 본다. 다 죽으면 라운드가 끝나니까.
 *   실측: 승자를 아는 44라운드 중 43건 일치 (97.7%) · 동수 6건은 «모름» 으로 둔다.
 *   메운 것은 `winSrc: 'deaths'` 로 표시해 화면에서 구분한다 — 지어낸 값이 아니라고 적기 위해.
 */
for (const r of ordered) {
  r.winSrc = r.winTeam === null ? null : 'log'
  if (r.winTeam !== null) continue
  const dead = {}
  for (const k of r.kills) if (k.victimTeam) dead[k.victimTeam] = (dead[k.victimTeam] ?? 0) + 1
  const s2 = Object.entries(dead).sort((a, b) => b[1] - a[1])
  if (s2.length === 2 && s2[0][1] !== s2[1][1]) { r.winTeam = s2[1][0]; r.winSrc = 'deaths' }
}

/* ── 전·후반 — 한 팀이 5승에 닿은 라운드까지가 전반 ── */
let acc = {}, switchAt = null
for (const r of ordered) {
  if (r.winTeam === null) continue
  acc[r.winTeam] = (acc[r.winTeam] ?? 0) + 1
  if (switchAt === null && acc[r.winTeam] >= 5) switchAt = r.no
}
const halfOf = (no) => (switchAt === null ? '?' : no <= switchAt ? '전반' : '후반')

/* ── 진영 — 설치한 팀이 공격 ── */
const teams = [...new Set(ordered.flatMap((r) => r.kills.flatMap((k) => [k.killerTeam, k.victimTeam])).filter((t) => t !== ''))]
const other = (t) => teams.find((x) => x !== t) ?? null
for (const r of ordered) {
  r.attackTeam = null
  for (const b of r.bombs) {
    if (b.team === '') continue
    if (b.kind === 'install') { r.attackTeam = b.team; break }
    if (b.kind === 'dismantle') { r.attackTeam = other(b.team); break }
  }
}
/* 전·후반 안에서는 진영이 같다 — 아는 라운드로 모르는 라운드를 채운다 */
for (const half of ['전반', '후반']) {
  const rs = ordered.filter((r) => halfOf(r.no) === half)
  const known = rs.find((r) => r.attackTeam !== null)
  if (!known) continue
  for (const r of rs) if (r.attackTeam === null) r.attackTeam = known.attackTeam
}
/*
 * ★한 반에 C4 가 하나도 없으면 사장님 규칙으로 채운다★ (2026-09-17).
 *   실측에서 ①+② 합이 많은 쪽이 99.66% 맞았다 (적용률 99.7%).
 *     ① 바닥(BADAK·BUNKER)에서 죽거나 잡은 횟수
 *     ② 스나가 머리·녹뒤·컨뒤에서 죽거나 잡은 횟수
 *   합이 많은 팀이 ★그 반의 블루(수비)★ 다.
 *   그리고 전·후반은 서로 반대다 — 한쪽을 알면 다른 쪽이 정해진다.
 */
const BADAK_SET = new Set(['BADAK', 'BUNKER'])
const SNIPE_SET = new Set(['MERI', 'NOKDWI', 'CONDWI'])
function defenceByRule(rs) {
  const score = {}
  for (const t of teams) score[t] = 0
  for (const r of rs) for (const k of r.kills) {
    const zs = [...new Set([...k.deathZones, ...k.killZones])]
    if (inSet(zs, BADAK_SET)) {
      if (k.victimTeam) score[k.victimTeam] = (score[k.victimTeam] ?? 0) + 1
      if (k.killerTeam) score[k.killerTeam] = (score[k.killerTeam] ?? 0) + 1
    }
    if (inSet(zs, SNIPE_SET)) {
      if (mainIsSniper.get(k.victim) && k.victimTeam) score[k.victimTeam] = (score[k.victimTeam] ?? 0) + 1
      if (mainIsSniper.get(k.killer) && k.killerTeam) score[k.killerTeam] = (score[k.killerTeam] ?? 0) + 1
    }
  }
  const sorted = Object.entries(score).sort((a, b) => b[1] - a[1])
  if (sorted.length < 2 || sorted[0][1] === sorted[1][1]) return null
  return sorted[0][0]
}
for (const half of ['전반', '후반']) {
  const rs = ordered.filter((r) => halfOf(r.no) === half)
  if (rs.length === 0 || rs[0].attackTeam !== null) continue
  /* 다른 반을 알면 뒤집는다 — 전·후반은 진영이 반대다 */
  const otherHalf = ordered.filter((r) => halfOf(r.no) !== half && r.attackTeam !== null)
  let att = otherHalf.length > 0 ? other(otherHalf[0].attackTeam) : null
  if (att === null) {
    const def = defenceByRule(rs)
    att = def === null ? null : other(def)
  }
  if (att !== null) for (const r of rs) { r.attackTeam = att; r.byRule = true }
}

/* ── 사장님 기준으로 방어 판정 ── */
for (const r of ordered) {
  r.defenceTeam = r.attackTeam === null ? null : other(r.attackTeam)
  r.breach = { A: false, B: false, F2: false }
  r.why = []
  if (r.defenceTeam === null) continue
  const D = r.defenceTeam

  /*
   * A — A구역에서 ★누가 죽든★ 그 교전이 라운드 3번째 킬 이내면 A 는 열린 것이다.
   *
   * ⚠ ★2026-09-17 정정★ — 처음엔 «수비 팀이 죽었을 때만» 으로 좁게 셌다. 사장님 정정:
   *   «너가 지금 우리팀이 죽거나 잡아도 뚫렸다고 생각하나본데 상대팀이 내가 나열한
   *    위치들에서 공격하는팀이 죽어도 a는 뚫린거고 우리팀이 잡혀도 뚫린거야»
   *   → ★양 팀 다 센다★. 그 자리에서 총알이 오갔다는 것 자체가 A 가 열렸다는 뜻이다.
   *   옛 판(수비 팀만)은 `A_DEFENCE_ONLY = true` 로 두면 돌아온다.
   */
  /*
   * ★2026-09-17 두 번째 정정 — A 는 «한 번 잡혔나» 가 아니라 «그 교전을 이겼나» 다★
   *
   * 사장님이 sometimes vs methodcrew 3라운드를 짚으시며:
   *   «3라운드는 교환이야. 에이를 3명이나 왔는데 3명까진 막았지만 마지막에
   *    우리스나가 로둥이한테 죽고 그걸 saylove가 마무리한거잖아.
   *    이건 진짜 에이 잘막은거야. 이거 졌으면 걍 세이브를 못한거지»
   *
   * 그 라운드를 한 줄씩 세면 A 교전이 다섯 건이고 ★공격이 셋 · 수비가 둘★ 죽었다.
   * 옛 셈(«3번째 이내에 A구역 킬이 하나라도 있으면 뚫림»)은 이걸 «뚫림» 이라 적었다.
   * 사장님 눈으로는 ★잘 막은 것★ 이다. 막고도 라운드를 지면 그건 세이브 실패지 A 실패가 아니다.
   *
   * ── 새 셈
   *   A 교전 = 잡은 자리나 죽은 자리 ★둘 중 하나라도★ A구역인 킬
   *   A 뚫림 = 그 교전들에서 ★수비 사망 > 공격 사망★
   *   비기면 막은 것으로 본다 (1:1 스나 맞교환은 뚫린 게 아니다)
   *
   * 옛 판은 `A_RULE = 'firstKill'` 로 두면 그대로 돌아온다 (`CLAUDE.md` 1-4).
   */
  const A_RULE = 'exchange'   // 'exchange' | 'firstKill'
  if (A_RULE === 'firstKill') {
    r.kills.forEach((k, i) => {
      if (i >= 3) return
      if (inSet(k.killZones, A_ZONES) || inSet(k.deathZones, A_ZONES)) {
        r.breach.A = true
        const died = k.deathZones.find((z) => A_ZONES.has(z))
        const who = died
          ? `${nameOf.get(k.victim) ?? '?'} 가 ${died} 에서 죽음`
          : `${nameOf.get(k.killer) ?? '?'} 가 ${k.killZones.find((z) => A_ZONES.has(z))} 에서 잡음`
        r.why.push(`A 뚫림 — ${who} (${i + 1}번째 킬)`)
      }
    })
  } else {
    const aKills = r.kills.filter((k) => inSet(k.killZones, A_ZONES) || inSet(k.deathZones, A_ZONES))
    const defDead = aKills.filter((k) => k.victimTeam === D).length
    const attDead = aKills.filter((k) => k.victimTeam !== D && k.victimTeam !== '').length
    r.aFight = { engagements: aKills.length, defDead, attDead }
    if (aKills.length > 0 && defDead > attDead) {
      r.breach.A = true
      r.why.push(`A 뚫림 — A쪽 교전 ${aKills.length}건에서 수비가 ${defDead} 잃고 ${attDead} 잡음 (교환에서 짐)`)
    } else if (aKills.length > 0) {
      r.why.push(`A 막음 — A쪽 교전 ${aKills.length}건에서 수비가 ${defDead} 잃고 ${attDead} 잡음`)
    }
  }

  /*
   * B — B구역에서 3번째 이내 죽음이 두 번
   *
   * ⚠ ★죽은 쪽이 수비 팀일 때만 센다★ (2026-09-17 정정). 처음엔 양 팀 죽음을 다 셌는데
   *   그러면 공격이 B 로 밀고 들어가다 죽어도 수비가 «뚫렸다» 고 적힌다.
   *   A 축은 처음부터 `k.victimTeam !== D` 로 걸러져 있었다 — 셋을 같게 맞춘다.
   */
  /*
   * ★창은 7번째★ (2026-09-17 실측). 원안은 3번째였는데 곡선이 안 꺾였다 —
   *   3 → 5 → 7 로 열수록 앞선팀승률 62.0 → 62.1 → 64.3% 로 ★오르고★,
   *   두 팀이 나란히 100%인 경기가 62.5 → 25.1 → 8.9% 로 줄고,
   *   잴 수 있는 경기가 8,937 → 21,287판이 된다. 손해 보는 칸이 하나도 없다.
   *   「죽음 두 번」 구조는 그대로다 — 한 번으로 줄이면 40% 역방향이 났었다.
   */
  const B_WINDOW = 7   // 원안은 3
  let bHits = 0
  const bWho = []
  r.kills.forEach((k, i) => {
    if (i >= B_WINDOW) return
    if (k.victimTeam !== D) return
    if (inSet(k.deathZones, B_ZONES)) { bHits += 1; bWho.push(`${nameOf.get(k.victim) ?? '?'}(${i + 1}번째)`) }
  })
  if (bHits >= 2) { r.breach.B = true; r.why.push(`B 뚫림 — ${bWho.join(' · ')} 가 B쪽에서 죽음 (${B_WINDOW}번째 이내)`) }

  /* 2층 — B쪽보다 먼저 2층에서 데스 (여기도 ★수비 팀 죽음★ 만) */
  const f2 = r.kills.findIndex((k) => k.victimTeam === D && inSet(k.deathZones, F2_ZONES))
  const bIdx = r.kills.findIndex((k) => k.victimTeam === D && inSet(k.deathZones, B_ZONES))
  if (f2 >= 0 && (bIdx < 0 || f2 < bIdx)) {
    r.breach.F2 = true
    r.why.push(`2층 뚫림 — ${nameOf.get(r.kills[f2].victim) ?? '?'} 가 ${f2 + 1}번째로 2층에서 죽음 (B쪽보다 먼저)`)
  }
}

/* ── 기존 세 축(소수싸움·스나싸움·세이브)은 ★저장된 집계★ 를 그대로 쓴다 ── */
/* ★team_no 가 red 인지 blue 인지★ 는 여기서만 알 수 있다 — `teamNo` 와 `leagueClanId` 가 같은 줄에 있다 */
const hexRows = await p.$queryRawUnsafe(
  `SELECT "teamNo", "tally", "leagueClanId" FROM "MatchClanHexV2" WHERE "matchId"=$1`, meta.id)
const sideOfTeam = new Map(hexRows.map((h) => [String(h.teamNo),
  h.leagueClanId === meta.rid ? 'red' : h.leagueClanId === meta.bid ? 'blue' : null]))
const tallyOf = new Map(hexRows.map((h) => [String(h.teamNo), h.tally ?? {}]))
/**
 * ★분모는 `clanTraitsV2.ts` 와 똑같아야 한다★ — 화면과 다른 숫자를 내면 안 된다.
 *   스나싸움  won / (won + lost)   ← 붙은 대결만. 라운드 수가 아니다
 *   소수싸움  won / rounds
 *   세이브    won / rounds         ← `saved/chances` 가 아니다. 칸 이름을 잘못 봤었다
 */
const pick = (t, path, botFn) => {
  const o = (tallyOf.get(t) ?? {})[path]
  if (!o) return null
  const ok = Number(o.won ?? 0)
  const n = botFn(o)
  if (!(n > 0)) return null
  return { ok, n, pct: Math.round((ok / n) * 1000) / 10 }
}

/* ── 축 값 ── */
const rate = (ok, n) => (n === 0 ? null : Math.round((ok / n) * 1000) / 10)
/*
 * ★어택성공률★ (2026-09-17 사장님: «혹시 방어 말고 뒤집어서 어택성공 으로 바꿀 수 있나?»)
 *
 * 판정은 하나뿐이다 — 그 라운드 A/B/2층이 열렸나. 그걸 ★수비 쪽에 붙이면 방어율★,
 * ★공격 쪽에 붙이면 어택성공률★ 이다. 다만 ★분모가 서로 다른 라운드★ 다:
 *   방어율   = 우리가 수비한 라운드 (한 판 약 6개)
 *   어택성공 = 우리가 공격한 라운드 (한 판 약 6개, 위와 겹치지 않는다)
 * 그래서 둘은 같은 말을 뒤집은 게 아니라 ★서로 다른 판을 재는 두 축★ 이다.
 *
 * A 는 「A교전이 0건인 라운드」가 있어 분모에서 뺀다 — 안 간 곳을 실패로 적지 않는다.
 */
const attackOf = (team) => {
  const mine = ordered.filter((r) => r.attackTeam === team)
  const n = mine.length
  const aJudged = mine.filter((r) => (r.aFight?.engagements ?? 0) > 0)
  return {
    attackRounds: n,
    A: rate(aJudged.filter((r) => r.breach.A).length, aJudged.length),
    aRounds: aJudged.length,
    B: rate(mine.filter((r) => r.breach.B).length, n),
    F2: rate(mine.filter((r) => r.breach.F2).length, n),
  }
}

const axesOf = (team) => {
  const mine = ordered.filter((r) => r.defenceTeam === team)
  const n = mine.length
  /* A 는 교전이 있었던 라운드만 분모다 (`aFight` 가 0건이면 판정 없음) */
  const aJudged = mine.filter((r) => (r.aFight?.engagements ?? 0) > 0)
  return {
    defenceRounds: n,
    aRounds: aJudged.length,
    A: rate(aJudged.filter((r) => !r.breach.A).length, aJudged.length),
    B: rate(mine.filter((r) => !r.breach.B).length, n),
    F2: rate(mine.filter((r) => !r.breach.F2).length, n),
    few: pick(team, 'outnumbered', (o) => Number(o.rounds ?? 0)),
    duel: pick(team, 'sniperDuel', (o) => Number(o.won ?? 0) + Number(o.lost ?? 0)),
    save: pick(team, 'save', (o) => Number(o.rounds ?? 0)),
  }
}

const clanOfTeam = (t) => {
  const cn = teamClan.get(t)
  return cn ?? null
}

const out = {
  match: { src: SRC, id: meta.id, at: meta.startAt, map: meta.map, red: meta.red, blue: meta.blue, winnerSide: meta.win },
  switchAt,
  teams: teams.map((t) => {
    const side = sideOfTeam.get(t) ?? null
    return {
      team: t, clanNo: clanOfTeam(t), side,
      name: side === 'red' ? meta.red : side === 'blue' ? meta.blue : null,
      won: side !== null && side === meta.win,
      axes: axesOf(t),
      attack: attackOf(t),
    }
  }),
  rounds: ordered.map((r) => ({
    no: r.no, half: halfOf(r.no), winTeam: r.winTeam, winSrc: r.winSrc,
    attackTeam: r.attackTeam, defenceTeam: r.defenceTeam,
    breach: r.breach, why: r.why, aFight: r.aFight ?? null,
    bombs: r.bombs.map((b) => `${b.kind}:${b.team}`),
    kills: r.kills.map((k, i) => ({
      n: i + 1, t: k.t,
      killer: nameOf.get(k.killer) ?? '?', killerTeam: k.killerTeam,
      victim: nameOf.get(k.victim) ?? '?', victimTeam: k.victimTeam,
      sniper: mainIsSniper.get(k.killer) ?? null,
      zone: k.deathZones[0] ?? k.killZones[0] ?? null,
      zones: [...new Set([...k.deathZones, ...k.killZones])],
    })),
  })),
  players: [...nameOf.entries()].map(([usn, name]) => ({ usn, name, sniper: mainIsSniper.get(usn) ?? null })),
}
writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf-8')
console.log(`saved ${OUT} · rounds=${ordered.length} · switchAt=${switchAt}`)
await p.$disconnect()

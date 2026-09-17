/**
 * ★현물 5경기 — 점수제 육각★ (2026-09-18 사장님).
 *
 * > «이거 5경기 분석해서 점수도 매기고 육각도 매겨줘»  «저거 IPL VS IPL임 5경기 다»
 *
 * 사장님이 확정한 셈 (2026-09-17):
 *   라플 잡음 1점 · 스나 잡음 2점(그 라운드 1·2번째 킬) / 1점(3번째부터)
 *   폭탄설치 후 승리 2점 · 패배 1점   ★단 B쪽 설치는 져도 2점★
 *   세이브 1번 1점 · 2번 3점 · 3번 5점 (2n−1)
 *
 * ★자리를 안 믿는다★ — 사장님: «한명이라도 자리를 못믿을때는».
 * 그래서 점수를 ★「누가」 가 아니라 「어디서」★ 로 귀속한다.
 *   스나점수  : 스나 무기로 번 점수 ★전부★ (구역을 안 본다)
 *   숏점수    : 라플이 ★숏·홀정면 + A쪽 전부★ 에서 번 점수
 *   비리베점수: 라플이 ★비롱·벙커·바닥·일문★ 에서 번 점수
 *   2층점수   : 라플이 ★2층★ 에서 번 점수
 * 나머지 둘은 점수가 아니라 ★비율★ 이다 — 스나싸움 · 소수싸움.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'C:/Users/LG/Desktop/서플라이'
const style = JSON.parse(readFileSync(ROOT + '/data/barracks/style-zones.json', 'utf-8'))
const floor = JSON.parse(readFileSync(ROOT + '/data/barracks/floor-zones.json', 'utf-8'))
/*
 * ⚠ ★`/scratchpad/...` 로 넘기면 안 된다★ — Git Bash 가 윈도 경로로 바꿔 버린다.
 *   ★`--in=파일이름`★ 으로 받는다.
 */
const IN = (process.argv.find((a) => a.startsWith('--in=')) ?? '--in=all10.json').slice(5)
const data = JSON.parse(readFileSync(ROOT + '/scratchpad/match6/' + IN, 'utf-8'))

/* 두 파일을 겹쳐 읽는다 — 워커(`loadSideZones`)와 같은 읽기다 */
const CELL = style.cell
function zonesAt(x, y) {
  const k = Math.floor(x / CELL) + ',' + Math.floor(y / CELL)
  const out = new Set()
  for (const src of [style.zone, floor.zone]) {
    const v = src[k]
    if (v === undefined) continue
    for (const z of Array.isArray(v) ? v : [v]) out.add(z)
  }
  return out
}

/**
 * ★이건 사람이 아니라 폭탄이다★ (2026-09-18 실측).
 *
 * C4 줄의 뒷칸(`target_str_usn`)에 언제나 이 값이 온다 — ★닉이 비어 있다.★
 * 여덟 경기에서 폭탄 칸에 34번 나왔고, 한 경기에서는 ★킬 줄의 죽은 사람★ 으로도
 * 두 번 나왔다(해체 폭발로 보인다). 그대로 두면 ★열한 번째 사람★ 이 생긴다.
 */
const BOMB_USN = 'E0937425EDFB62EESA'
const isPerson = (u, nick) => Boolean(u) && u !== BOMB_USN && nick !== ''

/* ── 사장님이 정한 묶음 (packages/nexon/src/sideAxes.ts 와 같다) */
const A_ZONE = ['NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'SEOLDAE']
const B_ZONE = ['BIRONG', 'BUNKER', 'BADAK', 'ILMUN']
const F2_ZONE = ['ICHUNG']
const SHORT_ZONE = ['SHORT', 'HOLJEONG']

/** 점수를 어느 칸에 넣나. ★숏칸은 숏·홀정면 + A쪽 전부★ (사장님) */
function bucketOf(zs) {
  for (const z of zs) if (F2_ZONE.includes(z)) return 'f2'
  for (const z of zs) if (SHORT_ZONE.includes(z) || A_ZONE.includes(z)) return 'short'
  for (const z of zs) if (B_ZONE.includes(z)) return 'b'
  return null
}

/*
 * ── 팀 나누기.
 *
 * ⚠ ★2색칠은 못 쓴다★ (2026-09-18 실측) — 다섯 경기 중 셋에서 어긋났다.
 *   팀킬·자해·수류탄 튕김이 한 번만 있어도 색이 통째로 뒤집힌다.
 *   실제로 한 경기는 ★6명 대 4명★ 으로 갈렸다.
 *
 * ★그래서 5:5 를 강제하고 완전탐색한다.★ 열 명이면 나누는 법이 126가지뿐이다 —
 * ★같은 팀끼리 죽인 횟수(=어긋난 무게)가 가장 적은★ 쪽을 고른다. 팀킬이 있어도 버틴다.
 */
function splitTeams(events) {
  const w = new Map()
  const people = new Set()
  for (const e of events) {
    /* ⚠ ★폭탄 줄을 넣으면 안 된다★ — C4 는 심은 사람이 앞칸·뒷칸에 다 와서
     *   있지도 않은 ★열한 번째 사람★ 이 생긴다 (2026-09-18 실측) */
    if (e.type === 'bomb') continue
    if (!e.killer || !e.victim || e.killer === e.victim) continue
    if (e.killer === BOMB_USN || e.victim === BOMB_USN) continue
    people.add(e.killer)
    people.add(e.victim)
    const k = e.killer < e.victim ? e.killer + '|' + e.victim : e.victim + '|' + e.killer
    w.set(k, (w.get(k) ?? 0) + 1)
  }
  /*
   * ⚠ ★열 명이 넘을 때가 있다★ (2026-09-18 실측) — 한 경기에 열한 명이 나왔다.
   *   `E0937425…` 는 ★2·3라운드에만 두 번★ 나오고 사라진다 (탈주·교체).
   *   ★거의 안 나온 사람을 빼고★ 열 명으로 5:5 를 세운 뒤, 뺀 사람은 나중에 붙인다.
   */
  const appear = new Map()
  for (const [k, c] of w) {
    const [x, y] = k.split('|')
    appear.set(x, (appear.get(x) ?? 0) + c)
    appear.set(y, (appear.get(y) ?? 0) + c)
  }
  const ranked = [...people].sort((a, b) => (appear.get(b) ?? 0) - (appear.get(a) ?? 0))
  const spare = ranked.slice(10)
  const list = ranked.slice(0, 10)
  const n = list.length
  const idx = new Map(list.map((u, i) => [u, i]))
  const cost = (mask) => {
    let bad = 0
    for (const [k, c] of w) {
      const [x, y] = k.split('|')
      const a = (mask >> idx.get(x)) & 1
      const b = (mask >> idx.get(y)) & 1
      if (a === b) bad += c
    }
    return bad
  }
  const half = Math.floor(n / 2)
  let best = null
  let bestCost = Infinity
  for (let mask = 0; mask < 1 << n; mask += 1) {
    let bits = 0
    for (let i = 0; i < n; i += 1) bits += (mask >> i) & 1
    if (bits !== half) continue
    const c = cost(mask)
    if (c < bestCost) {
      bestCost = c
      best = mask
    }
  }
  const color = new Map()
  for (const u of list) color.set(u, (best >> idx.get(u)) & 1)
  /* 뺀 사람은 ★같은 팀끼리 죽인 횟수가 적은 쪽★ 에 붙인다 */
  for (const u of spare) {
    const same = [0, 0]
    for (const [k, c] of w) {
      const [x, y] = k.split('|')
      const other = x === u ? y : y === u ? x : null
      if (other === null || !color.has(other)) continue
      same[color.get(other)] += c
    }
    color.set(u, same[0] <= same[1] ? 1 : 0)
  }
  return { color, bad: bestCost, size: people.size, spare: spare.length }
}

/**
 * ★누가 스나인가★ — 그 사람이 ★실제로 든 총★ 으로 본다. 자리표(`seat`)를 안 쓴다.
 *
 * ⚠ ★한 경기만 보면 태반이 판정 불가다★ (2026-09-18 사장님: «스나수 특정을 왜못해»).
 *   5:0 으로 끝난 짧은 경기에서는 상대 다섯 중 넷이 ★3킬 미만★ 이라 아무도 못 정했다.
 *   그래서 ★스나를 잡은 킬이 한 건도 안 나왔다.★
 *
 * ★두 가지를 같이 쓴다.★
 *   ① 그 경기에서 `MATCH_MIN` 번 이상 잡았으면 ★그 경기의 총★ 으로 정한다 (가장 정확하다)
 *   ② 모자라면 ★모아 둔 모든 경기★ 를 합친 판정을 쓴다 (`POOL_MIN` 번 이상)
 *   ③ 그래도 모르면 ★라플로 본다★ — 모르면 점수를 올리지 않는다
 *
 * ⚠ 옛 문턱은 «3킬» 이었다. ★볼텍은 2킬이 전부 스나★ 였는데도 놓쳤다. 2로 내린다.
 */
const MATCH_MIN = 3
const POOL_MIN = 2
const SNIPER_SHARE = 0.5

function weaponTally(events) {
  const t = new Map()
  for (const e of events) {
    if (e.type === 'bomb' || !e.killer || e.killer === BOMB_USN) continue
    const r = t.get(e.killer) ?? { s: 0, n: 0 }
    r.n += 1
    if (e.weapon === 'sniper') r.s += 1
    t.set(e.killer, r)
  }
  return t
}

/** 모아 둔 경기 전부를 합친 판정 — 한 번만 만든다 */
function poolSnipers(matches) {
  const t = new Map()
  for (const m of matches) {
    for (const [u, r] of weaponTally(m.events)) {
      const cur = t.get(u) ?? { s: 0, n: 0 }
      cur.s += r.s
      cur.n += r.n
      t.set(u, cur)
    }
  }
  const out = new Map()
  for (const [u, r] of t) {
    if (r.n < POOL_MIN) continue
    out.set(u, r.s / r.n >= SNIPER_SHARE)
  }
  return out
}

const POOL = poolSnipers(data.matches)

function sniperSet(events) {
  const out = new Set()
  const seen = new Set()
  for (const [u, r] of weaponTally(events)) {
    seen.add(u)
    if (r.n >= MATCH_MIN) {
      if (r.s / r.n >= SNIPER_SHARE) out.add(u)
    } else if (POOL.get(u) === true) {
      out.add(u)
    }
  }
  /* 킬이 아예 없는 사람도 ★합친 판정★ 으로 건진다 */
  for (const e of events) {
    for (const u of [e.killer, e.victim]) {
      if (!u || u === BOMB_USN || seen.has(u)) continue
      seen.add(u)
      if (POOL.get(u) === true) out.add(u)
    }
  }
  return out
}

/* ============================================================ 경기 하나 === */

function analyze(m) {
  const ev = m.events
  const { color, bad, size, spare } = splitTeams(ev)
  const snipers = sniperSet(ev)
  const nickOf = new Map()
  for (const e of ev) {
    if (isPerson(e.killer, e.killerNick)) nickOf.set(e.killer, e.killerNick)
    if (isPerson(e.victim, e.victimNick)) nickOf.set(e.victim, e.victimNick)
  }

  /* 현물 팀을 0번으로 세운다 */
  const mine = color.get(data.usn) ?? 0
  const teamOf = (u) => (color.get(u) === mine ? 0 : 1)

  const rounds = new Map()
  for (const e of ev) {
    if (!rounds.has(e.round)) rounds.set(e.round, [])
    rounds.get(e.round).push(e)
  }

  const blank = () => ({ sniper: 0, short: 0, b: 0, f2: 0, spare: 0, bomb: 0, save: 0 })
  /*
   * ★점수가 어떻게 만들어졌나★ (2026-09-18 사장님:
   *   «점수 구성까지 스나1번선짤 +3점 라플잡음 +7점 이런식으로»).
   * 항목마다 ★몇 번★ 과 ★몇 점★ 을 따로 센다.
   */
  const bill = [{}, {}]
  /* ★사람별 내역★ (2026-09-18 사장님: «선수 별로 이 점수가 어케 나왔는지를 설명하라고») */
  const manBill = new Map()
  const charge = (t, key, points, who) => {
    const row = bill[t][key] ?? { n: 0, pts: 0 }
    row.n += 1
    row.pts += points
    bill[t][key] = row
    if (!who) return
    if (!manBill.has(who)) manBill.set(who, {})
    const mine = manBill.get(who)
    const r2 = mine[key] ?? { n: 0, pts: 0 }
    r2.n += 1
    r2.pts += points
    mine[key] = r2
  }
  const score = [blank(), blank()]
  /* ★사람별로도 따로 센다★ — 구역 귀속과 별개다. 「누가 벌었나」 를 보려는 것 */
  const byMan = new Map()
  const add = (u, key, n) => {
    if (!byMan.has(u)) byMan.set(u, blank())
    byMan.get(u)[key] += n
  }
  /* ★사람별 킬·데스·세이브★ (2026-09-18 사장님: «선수별 킬이랑 데스 세이브숫자») */
  const kd = new Map()
  const bump = (u, key) => {
    if (!u) return
    if (!kd.has(u)) kd.set(u, { kills: 0, deaths: 0, saves: 0, bombs: 0, sniperKills: 0 })
    kd.get(u)[key] += 1
  }
  const duel = [0, 0]
  const few = [0, 0]
  const roundsWon = [0, 0]

  for (const [, raw] of [...rounds.entries()].sort((a, b) => a[0] - b[0])) {
    const kills = raw.filter(
      (e) => e.type !== 'bomb' && e.killer && e.victim && e.killer !== BOMB_USN && e.victim !== BOMB_USN,
    )
    /*
     * ⚠ ★폭탄 줄은 좌표가 `kill_x/kill_y` 에 있다★ (2026-09-18 실측) —
     *   `death_x/death_y` 는 ★0,0★ 이다. 죽음 줄과 반대라 그냥 쓰면 구역이 안 잡힌다.
     * ⚠ ★해체(`c4-dismantle`)는 점수가 아니다★ — 사장님 표에 설치만 있다.
     */
    const bombs = raw.filter((e) => e.type === 'bomb' && e.weapon === 'c4-install')

    /* 라운드 승자: 5명이 다 죽은 쪽이 진 것이다. 아니면 더 적게 죽은 쪽 */
    const dead = [0, 0]
    for (const k of kills) dead[teamOf(k.victim)] += 1
    let winner = null
    if (dead[0] >= 5) winner = 1
    else if (dead[1] >= 5) winner = 0
    else if (dead[0] < dead[1]) winner = 0
    else if (dead[1] < dead[0]) winner = 1
    if (winner !== null) roundsWon[winner] += 1

    /* ── 킬 점수 */
    const seq = [0, 0]
    for (const k of kills) {
      const t = teamOf(k.killer)
      seq[t] += 1
      bump(k.killer, 'kills')
      bump(k.victim, 'deaths')
      if (snipers.has(k.victim)) bump(k.killer, 'sniperKills')
      /*
       * ★잡은 사람의 총에 따라 값이 다르다★ (2026-09-18 사장님):
       *
       * > «라플이 스나를 1,2번째에 잡으면 5점 주고 3,4,5번째에 잡으면 3점 주라
       * >  라플이 스나 잡는건 진짜 대단한거야»
       *
       *   라플이 라플 잡음      1점
       *   ★라플이 스나 잡음★   1·2번째 5점 · 3번째부터 3점
       *   스나가 라플 잡음      1점
       *   스나가 스나 잡음      1·2번째 2점 · 3번째부터 1점   (옛 값 그대로)
       *
       * ⚠ ★순번은 우리 팀이 그 라운드에서 몇 번째로 잡았나★ 다. 5:5 라 최대 다섯 번이다.
       */
      const victimIsSniper = snipers.has(k.victim)
      const killerIsSniper = snipers.has(k.killer)
      const early = seq[t] <= 2
      let pts = 1
      let kind = 'rifle'
      if (victimIsSniper) {
        if (killerIsSniper) {
          /* ★2026-09-18 사장님 — 스나 대 스나도 한 칸씩 올린다★ (2 → 3 · 1 → 2) */
          pts = early ? 3 : 2
          kind = early ? 'sniperVsSniperEarly' : 'sniperVsSniperLate'
        } else {
          pts = early ? 5 : 3
          kind = early ? 'rifleVsSniperEarly' : 'rifleVsSniperLate'
        }
      }
      charge(t, kind, pts, k.killer)
      if (killerIsSniper) {
        score[t].sniper += pts
        add(k.killer, 'sniper', pts)
      } else {
        /*
         * ⚠ ★자리를 못 읽은 킬을 버리지 않는다★ (2026-09-18).
         *   옛 판은 `if (b)` 로 조용히 흘렸다 — 그래서 ★내역 합이 총점보다 컸다.★
         *   맵 가장자리처럼 칠하지 않은 칸에서 죽으면 그렇게 된다. `spare` 로 모은다.
         */
        const b = bucketOf(zonesAt(k.deathX, k.deathY)) ?? 'spare'
        score[t][b] += pts
        add(k.killer, b, pts)
      }
      if (killerIsSniper && victimIsSniper) duel[t] += 1
    }

    /* ── 폭탄. ★B쪽 설치는 져도 2점★ */
    for (const b of bombs) {
      const planter = b.killer ?? b.victim
      if (!planter || !color.has(planter)) continue
      const t = teamOf(planter)
      const zs = zonesAt(b.killX, b.killY)
      const onB = [...zs].some((z) => B_ZONE.includes(z))
      const bp = winner === t ? 2 : onB ? 2 : 1
      charge(t, winner === t ? 'bombWin' : onB ? 'bombLossB' : 'bombLoss', bp, planter)
      /*
       * ★폭탄 점수도 「어디에 심었나」 로 간다★ (사장님 설계).
       *   사장님 표에서 폭탄은 ★자리마다★ 있었다 (비리베 2점 · 2층 2점 · 숏 2점).
       *   자리를 안 믿기로 했으니 ★심은 구역★ 에 넣는다 — B쪽이면 비리베칸, A·숏이면 숏칸.
       * ⚠ 구역을 못 읽으면 따로 둔 `bomb` 칸에 남긴다. 버리지 않는다.
       */
      bump(planter, 'bombs')
      const slot = bucketOf(zs) ?? 'spare'
      score[t][slot] += bp
      add(planter, slot, bp)
    }

    /* ── 세이브 · 소수싸움: ★수적 열세를 뒤집은★ 라운드 */
    if (winner !== null) {
      const alive = [5, 5]
      let minGap = 0
      for (const k of kills) {
        alive[teamOf(k.victim)] -= 1
        const gap = alive[winner] - alive[1 - winner]
        if (gap < minGap) minGap = gap
      }
      if (minGap < 0) {
        few[winner] += 1
        const n = -minGap
        const sp = 2 * n - 1
        /* 세이브는 ★마지막까지 살아 이긴 사람★ 것이다 — 그 라운드 마지막 킬의 주인 */
        const last = kills.filter((k) => teamOf(k.killer) === winner).pop()
        charge(winner, 'save' + n, sp, last ? last.killer : null)
        /*
         * ★세이브 점수를 따로 빼두지 않는다★ (2026-09-18 사장님:
         *   «세이브도 그냥 점수에 중복으로 넣어 세이브점수 빼지마»).
         *
         * ⚠ 옛 판은 `save` 칸에 따로 담았다. 그러면 ★육각 넷의 합이 총점과 안 맞는다★ —
         *   사장님이 «막대에서의 점수랑 밑에 경기판 점수랑 다르잖아» 라고 잡으신 그 자리다.
         *   이제 ★마지막 킬이 난 칸★ 에 같이 넣는다. 그러면 넷을 더하면 총점이다.
         */
        const slot = last
          ? last.weapon === 'sniper'
            ? 'sniper'
            : (bucketOf(zonesAt(last.deathX, last.deathY)) ?? 'spare')
          : 'spare'
        score[winner][slot] += sp
        if (last) {
          add(last.killer, slot, sp)
          bump(last.killer, 'saves')
        }
      }
    }
  }

  const tot = (t) => score[t].sniper + score[t].short + score[t].b + score[t].f2 + score[t].spare + score[t].bomb + score[t].save
  const names = [[], []]
  for (const [u, n] of nickOf) names[teamOf(u)].push(u === data.usn ? '★' + n + '(현물)' : n)

  /* 점수를 한 점도 못 딴 사람도 ★줄에서 빠지면 안 된다★ — K/D 는 있다 */
  for (const u of kd.keys()) if (!byMan.has(u)) byMan.set(u, blank())
  const men = [...byMan.entries()].map(([u, sc]) => ({
    usn: u,
    nick: nickOf.get(u) ?? '?',
    team: teamOf(u),
    isSniper: snipers.has(u),
    isMe: u === data.usn,
    ...(kd.get(u) ?? { kills: 0, deaths: 0, saves: 0, bombs: 0, sniperKills: 0 }),
    bill: manBill.get(u) ?? {},
    ...sc,
    total: sc.sniper + sc.short + sc.b + sc.f2 + sc.spare + sc.bomb + sc.save,
  })).sort((a, b) => b.total - a.total)
  return { score, duel, few, roundsWon, tot, names, men, bill, bad, size, spare, snipers: [...snipers].map((u) => nickOf.get(u)) }
}

/* ============================================================== 출력 === */

const pad = (n, w) => String(n).padStart(w)
const share = (a, b) => (a + b === 0 ? '   —  ' : pad(Math.round((a / (a + b)) * 100), 3) + ':' + Math.round((b / (a + b)) * 100))

for (const m of data.matches) {
  const r = analyze(m)
  const h = m.head
  console.log('\n══ ' + h.match_name + '  ' + h.match_key + '  ' + h.match_time_date.slice(0, 16).replace('T', ' ') + '  ★' + h.result_wdl + '★')
  if (r.size !== 10) console.log('   ⚠ 사람이 ' + r.size + '명이다 — ' + r.spare + '명은 잠깐만 나온다 (탈주·교체)')
  if (r.bad > 0) console.log('   ⚠ 같은 팀끼리 죽인 것이 ' + r.bad + '번 (팀킬·자해)')
  console.log('   라운드 ' + r.roundsWon[0] + ' : ' + r.roundsWon[1] + '   스나 ' + r.snipers.join(','))
  console.log('   우리 ' + r.names[0].join(' · '))
  console.log('   상대 ' + r.names[1].join(' · '))
  for (const [t, label] of [[0, '우리'], [1, '상대']]) {
    const s = r.score[t]
    console.log('   ' + label + '  스나 ' + pad(s.sniper, 3) + ' · 숏 ' + pad(s.short, 3) + ' · 비리베 ' + pad(s.b, 3) +
      ' · 2층 ' + pad(s.f2, 3) + ' · 폭탄 ' + pad(s.bomb, 2) + ' · 세이브 ' + pad(s.save, 2) + '  = ★' + r.tot(t) + '★')
  }
  console.log('   육각  스나싸움 ' + share(r.duel[0], r.duel[1]) + ' · 소수싸움 ' + share(r.few[0], r.few[1]) +
    ' · 스나 ' + share(r.score[0].sniper, r.score[1].sniper) + ' · 숏 ' + share(r.score[0].short, r.score[1].short) +
    ' · 비리베 ' + share(r.score[0].b, r.score[1].b) + ' · 2층 ' + share(r.score[0].f2, r.score[1].f2))
}

/* ── `--json` 이면 아티팩트가 읽을 꼴로 뱉는다 */
if (process.argv.includes('--json')) {
  const out = data.matches.map((m) => {
    const r = analyze(m)
    return {
      key: m.head.match_key,
      kind: m.head.match_name,
      at: m.head.match_time_date,
      result: m.head.result_wdl,
      rounds: r.roundsWon,
      score: r.score,
      total: [r.tot(0), r.tot(1)],
      duel: r.duel,
      few: r.few,
      names: r.names,
      men: r.men,
      bill: r.bill,
      note: { size: r.size, spare: r.spare, bad: r.bad },
      /* ★병영수첩 공식 집계와 대조★ — 지어낸 값이 아님을 화면에 남긴다 */
      check: m.head.kill_cnt + '/' + m.head.death_cnt,
    }
  })
  const OUTNAME = process.argv.find((a) => a.startsWith('--out=')) ?? '--out=result10.json'
  writeFileSync(ROOT + '/scratchpad/match6/' + OUTNAME.slice(6), JSON.stringify(out, null, 1), 'utf-8')
  console.log('saved result.json')
}

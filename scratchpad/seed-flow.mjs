/**
 * ★로컬 QA용 — 합성 배틀로그 한 판을 심는다★ (2026-09-23)
 *
 * 로컬 DB 에는 `BarracksBattleLogRaw` 가 한 줄도 없어서 경기분석(육각 · 라운드 흐름)이
 * 아예 안 열린다. 운영에 밀어 봐야 확인이 되는 상태라 화면 작업을 반복할 수 없다.
 *
 * ⚠ ★로컬 전용이다.★ 운영 DB 에는 절대 돌리지 않는다. 심는 값은 전부 ★합성★ 이고
 *   화면 배치를 보기 위한 것이다 — 숫자의 진실성을 주장하지 않는다.
 *
 *   node scratchpad/seed-flow.mjs
 */
import { PrismaClient } from '../packages/db/generated/client/index.js'

const URL = 'postgresql://sacloud:sacloud@127.0.0.1:5433/sacloud?schema=public'
const prisma = new PrismaClient({ datasources: { db: { url: URL } } })

const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

async function main() {
  /* 5 대 5 인 경기를 고른다 — 팀 크기가 5여야 워커 판정이 자연스럽다 */
  const cands = await prisma.match.findMany({
    select: { id: true, sourceMatchId: true, leagueId: true, winnerSide: true, redLeagueClanId: true, blueLeagueClanId: true },
    orderBy: { startAt: 'desc' },
    take: 60,
  })
  let match = null
  let red = []
  let blue = []
  for (const m of cands) {
    if (!m.sourceMatchId) continue
    const st = await prisma.matchPlayerStat.findMany({
      where: { matchId: m.id },
      select: { side: true, playerId: true, player: { select: { name: true, sourcePlayerId: true } } },
    })
    const r = st.filter((s) => s.side === 'red')
    const b = st.filter((s) => s.side === 'blue')
    if (r.length === 5 && b.length === 5) { match = m; red = r; blue = b; break }
  }
  if (!match) throw new Error('5대5 경기를 못 찾았다')

  /* usn 은 아무 문자열이어도 된다 — 닉네임만 화면에 나온다 */
  const usnOf = (s, i, side) => s.player?.sourcePlayerId ?? `${side}${i}`
  const R = red.map((s, i) => ({ usn: usnOf(s, i, 'r'), nick: s.player?.name ?? `red${i}` }))
  const B = blue.map((s, i) => ({ usn: usnOf(s, i, 'b'), nick: s.player?.name ?? `blue${i}` }))

  /* team_no: red 슬롯 = '0' · blue 슬롯 = '1' · clan_no 는 아무 값 */
  const TEAM = { red: '0', blue: '1' }
  const CLAN = { '0': 'C100', '1': 'C200' }

  const events = []
  const push = (round, at, victim, victimTeam, killer, killerTeam, winFlag) => {
    events.push({
      round, event_time: mmss(at), event_type: 'death', target_event_type: 'kill',
      str_usn: victim.usn, team_no: victimTeam, target_str_usn: killer.usn, target_team_no: killerTeam,
      win_flag: winFlag, weapon: 'ak47', user_nick: victim.nick, target_user_nick: killer.nick,
      kill_x: 160 + ((round * 37) % 300), kill_y: 400 + ((round * 53) % 260),
    })
  }
  const bomb = (round, at, team, action, winFlag) => {
    const who = team === '0' ? R[0] : B[0]
    events.push({
      round, event_time: mmss(at), event_type: 'kill', target_event_type: 'death',
      str_usn: who.usn, team_no: team, weapon: action, win_flag: winFlag, kill_x: 165, kill_y: 438,
      user_nick: who.nick,
    })
  }

  /* 14라운드 — 전반 7(red 공격) · 후반 7(진영 교대). 「응답 주인」 은 red 클랜으로 잡는다 */
  const ROUNDS = 14
  const SECOND_FROM = 8
  let t = 10
  let redWins = 0
  for (let round = 1; round <= ROUNDS; round += 1) {
    /* 전반은 red 가 공격(레드) · 후반은 blue 가 공격 */
    const redAttacks = round < SECOND_FROM
    /* 승패를 골고루 — 짝수 라운드는 red 가 딴다 (7:7 이 되지 않게 12라운드에서 끝냄) */
    const redWon = round % 2 === 0 || round === 1
    if (redWon) redWins += 1
    const winFlag = redWon ? 'win' : 'lose'
    /* 진 팀에서 2~4명이 죽는다. 첫 죽음이 「선짤」 로 뜬다 */
    const losers = redWon ? B : R
    const winners = redWon ? R : B
    const loserTeam = redWon ? TEAM.blue : TEAM.red
    const winnerTeam = redWon ? TEAM.red : TEAM.blue
    const n = 2 + (round % 4)
    for (let k = 0; k < n; k += 1) {
      t += 7 + (k * 3 + round) % 11
      push(round, t, losers[k % 5], loserTeam, winners[(k + round) % 5], winnerTeam, winFlag)
    }
    /* 이긴 팀에서도 한두 명 죽는다 — 인원 줄이 양쪽 다 줄어야 그래프가 산다 */
    const m = round % 3
    for (let k = 0; k < m; k += 1) {
      t += 6 + (k + round) % 9
      push(round, t, winners[(k + 2) % 5], winnerTeam, losers[(k + 1) % 5], loserTeam, winFlag)
    }
    /* 설점 — 공격 팀이 설치. 라운드를 진 쪽이 설치했으면 해체 줄도 (해체한 쪽이 설점) */
    const attackTeam = redAttacks ? TEAM.red : TEAM.blue
    if (round % 2 === 1) {
      t += 5
      bomb(round, t, attackTeam, 'c4-install', winFlag)
      const attackerWon = (attackTeam === TEAM.red) === redWon
      if (!attackerWon) { t += 4; bomb(round, t, attackTeam === TEAM.red ? TEAM.blue : TEAM.red, 'c4-dismantle', winFlag) }
    }
    t += 9
  }
  console.info(`경기 ${match.id} · ${ROUNDS}라운드 · red ${redWins}승 · 이벤트 ${events.length}줄`)

  const payload = {
    raw: {
      battleLog: events,
      teamList: [
        { team_no: TEAM.red, clan_no: CLAN[TEAM.red] },
        { team_no: TEAM.blue, clan_no: CLAN[TEAM.blue] },
      ],
    },
  }
  /* 주인은 red 클랜 — `subject` 가 clan_no 여야 roundFlow 가 슬롯을 잇는다 */
  await prisma.barracksBattleLogRaw.deleteMany({ where: { matchKey: match.sourceMatchId } })
  await prisma.barracksBattleLogRaw.create({
    data: {
      endpoint: 'seed/local-qa',
      matchKey: match.sourceMatchId,
      subject: CLAN[TEAM.red],
      subjectKind: 'clan',
      payload,
      payloadHash: `seedqa-${match.id}`,
      status: 'ok',
    },
  })
  console.info('BarracksBattleLogRaw 한 줄 심음 — subject', CLAN[TEAM.red])
  console.info('경기 주소: /league/<slug>/match/' + match.id)
  const league = await prisma.league.findUnique({ where: { id: match.leagueId }, select: { slug: true } })
  console.info('LEAGUE', league?.slug, 'MATCH', match.id)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

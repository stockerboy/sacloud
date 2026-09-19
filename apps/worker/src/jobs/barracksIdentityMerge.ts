import { prisma } from '@sacloud/db'

/**
 * ★한 계정이 여러 명으로 쪼개진 것을 합친다★ (2026-09-20 사장님)
 *
 * ⚠ ★`playerMerge.ts`(D-166)와 다른 일이다★ — 그것은 «넥슨 재구성 잔재와 미러 행» 을
 *   ★경기 라인업 대조★ 로 합친다. 이것은 ★병영수첩이 계정번호를 두 꼴로 주는 것★ 을
 *   합친다. 근거도 대상도 달라서 파일을 나눴다. 옛 것은 한 줄도 안 건드렸다.
 *
 * > 「게임한 아이디는 하나인데 자꾸 닉네임이나 소속클랜이 어디였는지에 따라
 * >  사이트에 여러개의 분신이 생성되는거 같아」
 * > 「위장닉네임을 할때마다 아이디가 두개 생기는셈이고
 * >  위장닉을 했을때 기록은 본닉에 남지도 않는다는거지」
 *
 * ── 왜 쪼개졌나
 *
 *   병영수첩이 같은 사람에게 ★계정번호를 두 꼴★ 로 준다:
 *   ```
 *     클랜 명단 API  →  userNexonSn  2114574636            (10진수)
 *     배틀로그  API  →  str_usn      13E45F9A4508A92ESA   (16진수)
 *   ```
 *   우리는 이 둘을 안 이어서 ★한 사람이 두 명★ 이 됐다. 실제로:
 *   ```
 *     「현물」   SUP-2114574636          ★0경기★   ← 클랜 명단에서만 왔다
 *     「임소혜」 cuid(BRK-13E45F9A…)      ★5경기★   ← 배틀로그에서만 왔다
 *   ```
 *   기록은 전부 위장닉 쪽에 있고 본닉은 껍데기였다.
 *
 * ── ★다리는 이미 있었다★
 *
 *   `BarracksClanMember` 한 줄이 ★두 꼴을 같이★ 담고 있다
 *   (`strUsn` · `userNexonSn`). 11,642행 전부 그렇고, ★8,878명★ 을 이을 수 있다.
 *
 * ── 어느 쪽으로 합치나
 *
 *   ★기록이 많은 쪽을 남긴다.★ 경기 수를 세어 많은 쪽이 «주인» 이고
 *   적은 쪽을 그리로 옮긴다. 같으면 ★먼저 만들어진 쪽★ 이 주인이다.
 *   이름은 ★병영수첩의 지금 닉★ 으로 맞춘다 (사장님: 「무조건 병영수첩기준으로」).
 *
 * ⚠ ★미리보기가 기본이다★ — `--confirm` 없이는 한 줄도 안 쓴다.
 *   사람을 합치는 일은 되돌리기 어렵다. 반드시 먼저 세어 보고 한다.
 */
export interface BarracksIdentityMergeOptions {
  confirm?: boolean
  /** 한 번에 볼 계정 수. 기본 500 */
  limit?: number
  /**
   * ★이 계정번호 뒤부터★ 본다 (커서).
   *
   * ⚠ 없으면 ★늘 같은 앞 300명★ 만 돈다 — 실제로 그렇게 만들었다가 잡았다.
   *   껍데기에 «(합쳐짐→…)» 를 남기므로 다시 돌아도 안전하지만, ★앞으로 못 나간다.★
   */
  after?: string
}

export interface BarracksIdentityMergeResult {
  /** 두 꼴이 다 있는 계정 */
  bridges: number
  /** 실제로 Player 가 둘 이상이던 계정 */
  split: number
  /** 옮긴 경기 줄 */
  movedStats: number
  /** 옮긴 리그 참가 */
  movedSeats: number
  /** 지운(비운) 껍데기 */
  retired: number
  /** 이름을 병영수첩에 맞춘 사람 */
  renamed: number
  /** ★다음 판에 넘길 커서★ — 이번에 본 마지막 계정번호. 더 없으면 `null` */
  nextAfter: string | null
  ms: number
}

const DEFAULT_LIMIT = 500
const BRK = 'BRK-'
const BRX = 'BRX-'

/** 이 계정번호를 가리킬 수 있는 `Player` 를 전부 찾는다 (네 가지 열쇠 꼴) */
async function playersOf(sn: string, usn: string) {
  return prisma.player.findMany({
    where: {
      OR: [
        { id: `SUPPLY-${sn}` },
        { id: `SUP-${sn}` },
        { sourcePlayerId: sn },
        { sourcePlayerId: BRK + usn },
        { sourcePlayerId: BRX + usn },
      ],
    },
    select: { id: true, name: true, createdAt: true },
  })
}

export async function runBarracksIdentityMerge(
  options: BarracksIdentityMergeOptions = {},
): Promise<BarracksIdentityMergeResult> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const startedAt = Date.now()
  const out: BarracksIdentityMergeResult = {
    bridges: 0, split: 0, movedStats: 0, movedSeats: 0, retired: 0, renamed: 0,
    nextAfter: null, ms: 0,
  }

  /*
   * ★다리★ — 같은 계정의 두 꼴과 지금 닉.
   *   같은 사람이 여러 줄일 수 있어 ★가장 최근 관측★ 하나만 쓴다.
   */
  const bridges = await prisma.$queryRawUnsafe<
    { sn: string; usn: string; nick: string }[]
  >(
    `SELECT DISTINCT ON ("userNexonSn")
            "userNexonSn" AS sn, "strUsn" AS usn, "userNick" AS nick
       FROM "BarracksClanMember"
      WHERE "strUsn" IS NOT NULL AND "userNexonSn" IS NOT NULL
        AND ($2::text IS NULL OR "userNexonSn" > $2::text)
      ORDER BY "userNexonSn", "observedAt" DESC
      LIMIT $1`,
    limit,
    options.after ?? null,
  )
  out.bridges = bridges.length
  out.nextAfter = bridges.length > 0 ? (bridges[bridges.length - 1]?.sn ?? null) : null

  for (const b of bridges) {
    const found = await playersOf(b.sn, b.usn)
    if (found.length < 2) {
      /* 안 쪼개진 사람 — 이름만 맞춰 준다 */
      const one = found[0]
      if (one && b.nick && one.name !== b.nick) {
        if (options.confirm) {
          await prisma.player.update({ where: { id: one.id }, data: { name: b.nick } })
        }
        out.renamed += 1
      }
      continue
    }
    out.split += 1

    /* ★기록이 많은 쪽이 주인★ */
    const counted = await Promise.all(
      found.map(async (p) => ({
        ...p,
        stats: await prisma.matchPlayerStat.count({ where: { playerId: p.id } }),
      })),
    )
    counted.sort((a, z) => z.stats - a.stats || a.createdAt.getTime() - z.createdAt.getTime())
    const keep = counted[0]!
    const drop = counted.slice(1)

    for (const d of drop) {
      if (options.confirm) {
        /*
         * ⚠ ★같은 경기에 두 줄이 생기면 안 된다★ — 유일키가 막는다.
         *   주인이 이미 가진 경기는 옮기지 않고 ★버린다★ (같은 사람의 같은 경기다).
         */
        const mine = new Set(
          (
            await prisma.matchPlayerStat.findMany({
              where: { playerId: keep.id },
              select: { matchId: true },
            })
          ).map((r) => r.matchId),
        )
        const theirs = await prisma.matchPlayerStat.findMany({
          where: { playerId: d.id },
          select: { id: true, matchId: true },
        })
        const movable = theirs.filter((r) => !mine.has(r.matchId)).map((r) => r.id)
        if (movable.length > 0) {
          const moved = await prisma.matchPlayerStat.updateMany({
            where: { id: { in: movable } },
            data: { playerId: keep.id },
          })
          out.movedStats += moved.count
        }
        /* 남은 것(주인이 이미 가진 경기)은 지운다 — 한 사람이 한 경기에 두 줄일 수 없다 */
        await prisma.matchPlayerStat.deleteMany({ where: { playerId: d.id } })

        /* 리그 참가도 옮긴다 — 주인이 없는 리그만 */
        const keepLeagues = new Set(
          (
            await prisma.leaguePlayer.findMany({
              where: { playerId: keep.id },
              select: { leagueId: true },
            })
          ).map((r) => r.leagueId),
        )
        const seats = await prisma.leaguePlayer.findMany({
          where: { playerId: d.id },
          select: { id: true, leagueId: true },
        })
        const moveSeats = seats.filter((s) => !keepLeagues.has(s.leagueId)).map((s) => s.id)
        if (moveSeats.length > 0) {
          const moved = await prisma.leaguePlayer.updateMany({
            where: { id: { in: moveSeats } },
            data: { playerId: keep.id },
          })
          out.movedSeats += moved.count
        }
        await prisma.leaguePlayer.deleteMany({ where: { playerId: d.id } })

        /*
         * ⚠ ★껍데기를 지우지 않는다★ — 다른 표가 가리키고 있을 수 있다.
         *   이름에 표시를 남겨 ★화면에서 안 걸리게★ 하고, 소속을 비운다.
         *   («지우지 않는다. 숨긴다» — `CLAUDE.md` 2-2)
         */
        await prisma.player.update({
          where: { id: d.id },
          data: { name: `(합쳐짐→${keep.id})`, clanId: null },
        })
      }
      out.retired += 1
    }

    if (b.nick && keep.name !== b.nick) {
      if (options.confirm) {
        await prisma.player.update({ where: { id: keep.id }, data: { name: b.nick } })
      }
      out.renamed += 1
    }
  }

  out.ms = Date.now() - startedAt
  return out
}

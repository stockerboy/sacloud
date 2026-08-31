/**
 * IPL 등록 클랜의 **클랜마크**를 채운다 (2026-08-31 사용자 지적: "클랜마크가 안뜨는데 여러개가").
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplMarkFill.ts            # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplMarkFill.ts --confirm  # 실제 반영
 * ```
 *
 * ── 왜 비어 있었나
 *   `iplRegister.ts` 가 우리 DB 에 없던 클랜 28곳을 새로 만들면서 이름·slug·티어만 넣었다.
 *   `markBgUrl` / `markFrontUrl` 이 비면 화면은 기본 구름 아이콘(`FallbackClanMark`)을 그린다.
 *
 * ── 값은 어디서 왔나
 *   병영수첩 클랜 검색(`POST /api/Search/GetSearchClanAll/<이름>/<페이지>`)의 응답에서
 *   **`clan_id` 가 우리가 아는 병영수첩 slug 와 일치하는 항목**의 `clan_mark1`/`clan_mark2` 다.
 *   이름으로 찾되 **id 로 확정**했다 — 이름만 보고 고르면 동명이인 클랜이 붙는다.
 *
 *   ⚠ 클랜전 목록(`GetClanMatchList`)에도 `clan_mark1` 칸이 있는데 **전부 `null` 이다.**
 *   거기서 값이 오는 것은 `red_clan_mark1`/`blue_clan_mark1` 쪽이다. 헷갈리지 마라.
 *
 * ── 원본 이미지를 복사하지 않는다
 *   `CLAUDE.md` 3장 4번. **주소만** 보관한다 — `Clan` 스키마 주석도 그렇게 적혀 있다.
 *
 * ── 덮어쓰지 않는다
 *   이미 마크가 있는 클랜은 건드리지 않는다. 3rd.supply 에서 온 값이 이미 맞을 수 있고,
 *   우리가 나중에 받은 값으로 조용히 덮으면 무엇이 바뀌었는지 알 수 없다.
 */
import { prisma } from '@sacloud/db'
import { IPL_ROSTER } from './iplRoster'

const confirm = process.argv.includes('--confirm')

/** 마크 주소의 공통 앞부분. 뒤 파일명만 아래 표에 담는다 */
const PREFIX = 'https://img.sa.nexon.com/sa/clan/mark/51/'

/** 병영수첩 slug → [배경, 앞면] 파일명 (2026-08-31 병영수첩 검색 실측) */
const MARKS: Record<string, [string, string]> = {
  '4473': ['0_12_161.png', '1_24_395.png'],
  fdd8: ['0_12_051.png', '1_23_541.png'],
  luverduck12: ['0_12_164.png', '1_21_853.png'],
  adgeodud20: ['0_12_161.png', '1_21_420.png'],
  '042222741': ['0_12_016.png', '1_24_344.png'],
  minjihun: ['0_12_120.png', '1_22_118.png'],
  '01025606089': ['0_13_072.png', '1_21_025.png'],
  ckdals2457: ['0_12_196.png', '1_22_021.png'],
  uava01: ['0_13_015.png', '1_22_117.png'],
  saffggaaz: ['0_12_079.png', '1_21_254.png'],
  EVOA: ['0_11_028.png', '1_21_210.png'],
  pigforever: ['0_13_077.png', '1_23_030.png'],
  eee07: ['0_13_075.png', '1_22_005.png'],
  ytsys: ['0_12_091.png', '1_21_210.png'],
  JJUN: ['0_13_077.png', '1_23_007.png'],
  IrenecIan: ['0_12_232.png', '1_22_082.png'],
  ssdko: ['0_12_133.png', '1_23_422.png'],
  hanbi0302: ['0_12_116.png', '1_24_390.png'],
  Reverse3: ['0_12_051.png', '1_21_199.png'],
  Ssnake: ['0_13_077.png', '1_24_299.png'],
  OhMyLoVe: ['0_12_069.png', '1_21_263.png'],
  dregonlif: ['0_12_147.png', '1_22_082.png'],
  backspace00: ['0_12_161.png', '1_22_173.png'],
  clanhanul: ['0_12_064.png', '1_24_028.png'],
  valentina2: ['0_12_232.png', '1_23_537.png'],
  wdasdw: ['0_13_075.png', '1_24_163.png'],
  terry9532: ['0_13_086.png', '1_21_254.png'],
  tispfgid: ['0_12_120.png', '1_22_051.png'],
  dbghr: ['0_12_031.png', '1_24_026.png'],
  rokasa12: ['0_13_077.png', '1_23_375.png'],
  adelioz: ['0_13_205.png', '1_22_297.png'],
  yoonsh1971: ['0_12_077.png', '1_22_121.png'],
  zzim1: ['0_13_077.png', '1_23_607.png'],
  JosenFam: ['0_13_100.png', '1_24_007.png'],
  jjangkangsu: ['0_12_020.png', '1_24_002.png'],
  friendliness1: ['0_13_077.png', '1_23_411.png'],
  wweqeqtd123: ['0_12_011.png', '1_21_605.png'],
  kelly123: ['0_13_080.png', '1_23_025.png'],
  lee2: ['0_13_074.png', '1_22_269.png'],
  WebClanGood: ['0_12_119.png', '1_24_299.png'],
  ircroger: ['0_13_077.png', '1_22_025.png'],
  DooLii: ['0_11_029.png', '1_23_466.png'],
  tjdwlsqhrdl: ['0_12_196.png', '1_21_174.png'],
}

async function main(): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { slug: 'nolink' },
    select: { id: true },
  })
  if (!league) {
    console.error('IPL(nolink) 리그가 없다')
    return
  }
  const members = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { clan: { select: { id: true, slug: true, name: true, markBgUrl: true, markFrontUrl: true } } },
  })

  /* 우리 클랜 이름 → 병영수첩 slug.
     ⚠ **옛 이름으로도 찾는다.** 클랜 개명이 흔해서 우리 DB 이름과 병영수첩 현재 이름이
     다른 경우가 있다 — `nightbloom`(우리 DB) = `pIacebo`(병영수첩) 가 그렇다.
     `iplRegister` 도 같은 이유로 `given` 으로 한 번 더 찾는다 */
  const barracksOf = new Map<string, string>()
  for (const r of IPL_ROSTER) {
    barracksOf.set(r.name, r.barracks)
    if (!barracksOf.has(r.given)) barracksOf.set(r.given, r.barracks)
  }

  let filled = 0
  let kept = 0
  let missing = 0

  for (const { clan } of members) {
    const barracks = barracksOf.get(clan.name)
    const mark = barracks ? MARKS[barracks] : undefined
    if (!mark) {
      missing += 1
      console.info(`  마크 없음  ${clan.name} (slug=${clan.slug} 병영=${barracks ?? '?'})`)
      continue
    }
    if (clan.markBgUrl && clan.markFrontUrl) {
      kept += 1
      continue
    }
    const [bg, front] = mark
    console.info(`  채움  ${clan.name.padEnd(14)} ${bg} / ${front}`)
    if (confirm) {
      await prisma.clan.update({
        where: { id: clan.id },
        data: { markBgUrl: `${PREFIX}${bg}`, markFrontUrl: `${PREFIX}${front}` },
      })
    }
    filled += 1
  }

  console.info(
    `\nIPL 등록 ${members.length}곳 · 채움 ${filled} · 이미 있어서 그대로 ${kept} · 마크 못 찾음 ${missing}`,
  )
  if (!confirm) console.info('미리보기다. 실제로 넣으려면 --confirm')
}

main()
  .catch((e) => {
    console.error(String(e).slice(0, 600))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

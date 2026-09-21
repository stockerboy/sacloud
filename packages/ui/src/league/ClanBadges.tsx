'use client'

/**
 * ★클랜 뱃지★ — 육각 여섯 축 중 그 리그 5위 안에 든 축을 승률 옆에 단다.
 *
 * 2026-09-14 사장님: «6각이 5위 안에 드는 클랜은 클랜목록에서 승률옆에 뱃지를 달아주자»
 *                    «축마다 5위 안이면 전부 준다»
 *
 * ── 왜 승률 「왼쪽」 인가
 *   승률 칸은 폰에서 60px 다 (`COL_STAT`). 오른쪽에 칩을 붙일 자리가 없다.
 *   그래서 이름 칸 끝 — ★승률 바로 왼쪽★ 에 붙인다. 눈으로는 승률 옆이다.
 *
 * ── ⚠ ★이름을 잡아먹지 않게 두 번 줄였다★ (폰 390px 실측)
 *   처음엔 긴 이름(«소수싸움»)을 세 개까지 적었더니 ★«sometimes» 가 «som···» 으로★
 *   잘렸다. 클랜 이름이 안 읽히면 목록이 아니다. 그래서 —
 *     ① 칩 글자를 ★두세 자로 줄였다★ (`SHORT`) — 육각형 안 이름은 그대로다
 *     ② 폰은 ★두 개★ · PC 는 세 개까지 적고 나머지는 `+n` 으로 접는다
 *   몇 개를 받았는지는 `title` 로 언제나 전부 읽힌다.
 *
 * ── 판정은 여기서 안 한다
 *   5위 컷도 ASTRA 보정도 `packages/contract/src/clanBadge.ts` 가 이미 끝냈다.
 *   이 부품은 받은 이름을 그리기만 한다.
 */
import { clanAxisBadgeArt, clanAxisBadgeKey } from '@sacloud/contract'
import Link from 'next/link'
import { leagueBadgePath } from '../common/paths'
import { CLAN_HEX_V2_AXIS_LABELS, type ClanHexV2AnyAxisKey, type ClanHexV2AxisKey } from '@sacloud/contract'

/** 폰 / PC 에서 나란히 적는 최대 개수 */
/*
 * ⚠ ★2026-09-15 · 무한 QA — 둘에서 하나로 줄였다★
 *   클랜 줄에는 이 배지 말고 ★«승격유력»/«강등위기» 칩★ 도 붙는다. 셋이 겹치니
 *   이름 자리가 없어져 «-tsAr.nTc» 가 ★«-t···»★ 로 잘렸다 (폰 390px 실측).
 *   접힌 것은 «+n» 으로 알려 주고, 눌러 보면 title 에 다 적혀 있다.
 */
const MAX_PHONE = 1
const MAX_PC = 3

/**
 * ★칩에만 쓰는 짧은 이름★ — 육각형·카드의 이름(`CLAN_HEX_V2_AXIS_LABELS`)은 안 건드린다.
 * 여기 없는 축은 긴 이름을 그대로 쓴다 (축이 늘어도 안 깨진다).
 */
const SHORT: Partial<Record<ClanHexV2AnyAxisKey, string>> = {
  sniperDuel: '스나',
  outnumbered: '소수',
  save: '세이브',
  /* ⚠ ★2026-09-15★ — 옛 ④ 는 `tempo: '템포'` 였다. 사장님이 라이플화력으로 바꿨다.
     칩은 자리가 좁아 «라이플화력» 일곱 글자가 안 들어간다 — «라플» 로 줄인다 */
  riflePower: '라플',
  /* ★2026-09-16 밤 — 새 축 둘★ (사장님) */
  rifleInfluence: '라플',
  blockChance: '차단',
  /* ⚠ 2026-09-16 새벽 — 축이 «선짤(1턴)» · «백어택성공률(2턴)» 이 됐다.
     칩은 자리가 좁아 ★턴 번호만★ 남긴다 — 육각을 본 사람은 무슨 말인지 안다 */
  /* ⚠ 2026-09-16 — ⑤ 가 선짤에서 ★스나영향력★ 으로 바뀌었다 (사장님).
     칩 자리가 좁아 «스나영향력» 다섯 글자를 못 넣는다 — «영향» 으로 줄인다.
     옛 «1턴»(선짤)은 이 주석이 기록이다 */
  sniperInfluence: '영향',
  /* ⚠ 2026-09-16 — ⑥ 이 백어택에서 ★선짤없이 라운드 시작★ 으로 (사장님).
     칸이 좁아 «선짤없이 라운드 시작» 아홉 글자를 못 넣는다 — «선방» 으로 줄인다
     (먼저 맞지 않고 열었다는 뜻). 옛 «2턴»(백어택)은 이 주석이 기록이다 */
  firstBloodless: '선방',
}

/** 금색 한 가지만 쓴다 — 축마다 색을 다르게 하면 줄이 알록달록해진다 */
const TONE = {
  color: '#ffd98a',
  background: 'rgba(255,217,138,.10)',
  border: '1px solid rgba(255,217,138,.42)',
} as const

const CHIP = 'rounded px-1 py-[2px] text-[10px] font-bold leading-none'
const MORE = 'text-[10px] font-bold leading-none'

export function ClanBadges({ badges, leagueSlug }: { badges?: readonly string[]; leagueSlug?: string | null }) {
  if (badges === undefined || badges.length === 0) return null

  const keys = badges as readonly ClanHexV2AxisKey[]
  const shortOf = (k: ClanHexV2AxisKey) => SHORT[k] ?? CLAN_HEX_V2_AXIS_LABELS[k] ?? k
  const longOf = (k: ClanHexV2AxisKey) => CLAN_HEX_V2_AXIS_LABELS[k] ?? k

  const restPhone = keys.length - MAX_PHONE
  const restPc = keys.length - MAX_PC

  return (
    <span
      className="ml-2 flex shrink-0 items-center gap-[3px]"
      title={`리그 5위 안 — ${keys.map(longOf).join(' · ')}`}
    >
      {/*
        * ★배지 그림★ (2026-09-17 사장님: «클랜도 뱃지도 저걸 활용해서 쓴다»).
        *   짝이 있는 축만 그림이고 ★없으면 글자 칩 그대로★ 다 — 없는 짝을 지어내지 않는다.
        *   스나영향력·라플영향력은 사장님이 내리기로 하신 축이라 일부러 안 붙였다.
        */}
      {keys.slice(0, MAX_PC).map((key, i) => {
        const art = clanAxisBadgeArt(key)
        const hide = i < MAX_PHONE ? '' : ' max-md:hidden'
        if (art === null) {
          return (
            <span key={key} className={`${CHIP}${hide}`} style={TONE}>
              {shortOf(key)}
            </span>
          )
        }
        const img = (
          <img
            src={art}
            alt={longOf(key)}
            title={longOf(key)}
            width={18}
            height={18}
            className="block h-[18px] w-[18px] select-none md:h-[22px] md:w-[22px]"
          />
        )
        const badgeKey = clanAxisBadgeKey(key)
        /* 리그를 모르면 ★링크를 안 건다★ — 없는 슬러그를 지어내지 않는다 */
        return badgeKey === null || !leagueSlug ? (
          <span key={key} className={hide}>{img}</span>
        ) : (
          <Link prefetch={false} key={key} href={leagueBadgePath(leagueSlug, badgeKey)} className={`inline-flex hover:opacity-80${hide}`}>
            {img}
          </Link>
        )
      })}
      {/* 접힌 개수는 폰·PC 가 다르다. 두 벌을 그리고 화면 크기가 하나만 고른다 */}
      {restPhone > 0 ? (
        <span className={`${MORE} md:hidden`} style={{ color: TONE.color }}>
          +{restPhone}
        </span>
      ) : null}
      {restPc > 0 ? (
        <span className={`${MORE} max-md:hidden`} style={{ color: TONE.color }}>
          +{restPc}
        </span>
      ) : null}
    </span>
  )
}

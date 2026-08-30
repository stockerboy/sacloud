/**
 * 사용자가 지목한 **1티어 선수** 명단을 우리 DB 에서 찾는다 (읽기 전용).
 *
 * 2026-08-31 사용자 제공:
 *   1티어 스나  Xek · cut(베리타스) · 감젤(부부젤라) · 유닠 · 호펭 ·
 *               [h].jerry · ㅇ7ㅇ · 멍청이젤
 *   1티어 라플  피존 · KKW · 토껭이 · 김장은 · 혜진젤 · starry ·
 *               Nostalgia❤️ · 견자히 · haybe
 *
 * 괄호 안은 **클랜 힌트**다. 동명이인을 가릴 때 쓴다.
 *
 * ── 닉네임은 그대로 안 맞을 수 있다
 *   병영수첩·3rd.supply 닉네임은 동형문자(대문자 I · 키릴 Р · 그리스 Β)와
 *   특수기호를 즐겨 쓴다. 그래서 세 단계로 넓혀 본다:
 *     1) 완전일치  2) 대소문자 무시  3) 기호·공백을 접고 비교
 *   **자동으로 확정하지 않는다.** 후보를 늘어놓고 사람이 고른다 (D-036 과 같은 태도).
 */
import { prisma } from '@sacloud/db'

interface Ace {
  name: string
  weapon: '스나' | '라플'
  clanHint?: string
}

const ACES: readonly Ace[] = [
  { name: 'Xek', weapon: '스나' },
  { name: 'cut', weapon: '스나', clanHint: '베리타스' },
  { name: '감젤', weapon: '스나', clanHint: '부부젤라' },
  { name: '유닠', weapon: '스나' },
  { name: '호펭', weapon: '스나' },
  { name: '[h].jerry', weapon: '스나' },
  { name: 'ㅇ7ㅇ', weapon: '스나' },
  { name: '멍청이젤', weapon: '스나' },

  { name: '피존', weapon: '라플' },
  { name: 'KKW', weapon: '라플' },
  { name: '토껭이', weapon: '라플' },
  { name: '김장은', weapon: '라플' },
  { name: '혜진젤', weapon: '라플' },
  { name: 'starry', weapon: '라플' },
  { name: 'Nostalgia❤️', weapon: '라플' },
  { name: '견자히', weapon: '라플' },
  { name: 'haybe', weapon: '라플' },
]

/** 기호·공백을 접고 소문자로. 비교 전용이고 저장하지 않는다 */
function fold(value: string): string {
  return value
    .replace(/Р/g, 'P')
    .replace(/Β/g, 'B')
    .replace(/Ι/g, 'I')
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')
    .toLowerCase()
}

async function main(): Promise<void> {
  const players = await prisma.player.findMany({
    select: { id: true, name: true, clanId: true, clan: { select: { name: true } } },
  })
  console.info(`DB 선수 ${players.length}명 안에서 찾는다\n`)

  const byFold = new Map<string, typeof players>()
  for (const p of players) {
    const key = fold(p.name)
    byFold.set(key, [...(byFold.get(key) ?? []), p])
  }

  let exact = 0
  let folded = 0
  const missing: string[] = []

  for (const ace of ACES) {
    const same = players.filter((p) => p.name === ace.name)
    if (same.length > 0) {
      exact += 1
      for (const p of same) {
        console.info(
          `${ace.weapon} ${ace.name.padEnd(14)} 완전일치  ${p.id}  소속=${p.clan?.name ?? '없음'}`,
        )
      }
      continue
    }
    const cands = byFold.get(fold(ace.name)) ?? []
    if (cands.length > 0) {
      folded += 1
      for (const p of cands) {
        console.info(
          `${ace.weapon} ${ace.name.padEnd(14)} 후보      ${p.id}  이름=${p.name}  소속=${p.clan?.name ?? '없음'}`,
        )
      }
      continue
    }
    missing.push(`${ace.weapon} ${ace.name}${ace.clanHint ? ` (${ace.clanHint})` : ''}`)
  }

  console.info(`\n완전일치 ${exact} · 접어서 후보 ${folded} · 못 찾음 ${missing.length}`)
  for (const m of missing) console.info(`  없음 ${m}`)
}

main()
  .catch((e) => console.error(String(e).slice(0, 600)))
  .finally(() => prisma.$disconnect())

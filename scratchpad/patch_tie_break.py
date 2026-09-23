# -*- coding: utf-8 -*-
"""라운드 승수 같은데 승/패가 갈린 경기 — result_wdl 로 승자를 정한다 (2026-09-23 밤)"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(rel): return os.path.join(ROOT, rel)
def rw(p): return open(p, encoding='utf-8', newline='').read()
def save(p, s): open(p, 'w', encoding='utf-8', newline='').write(s)
def rep(rel, old, new, cnt=1):
    p = P(rel); s = rw(p); nl = '\r\n' if '\r\n' in s else '\n'
    old = old.replace('\n', nl); new = new.replace('\n', nl)
    if new in s and old not in s:
        print('skip (already)', rel); return
    assert s.count(old) == cnt, (rel, old[:60], s.count(old))
    save(p, s.replace(old, new))

# 1. matchNormalize — tieWinner 옵션
p = 'apps/worker/src/lib/matchNormalize.ts'
rep(p, """export function normalizeBarracksMatch(raw: RawBarracksMatch): NormalizeResult {""",
"""/**
 * ★라운드 승수가 같을 때★ 밖에서 정해 준 승자 (2026-09-23 밤 · 사장님 「자이언트 기록 누락」).
 *   원문의 `red_win_cnt`/`blue_win_cnt` 가 같은데 `result_wdl` 은 「승」/「패」 인 경기가
 *   ★9/20~9/23 나흘에 867건 (전체의 7.6%)★ 이었다. deluxe–amaryllis 9/19 경기(5:5 · 패)가 그것이다.
 *   승수 칸만 보면 무승부라 안 만들었고, 그래서 통째로 빠졌다.
 *   승자는 `unifiedProject` 가 「이 원문을 긁은 클랜(subject)이 어느 편이고 승/패가 뭔가」 로 정해 넘긴다.
 *   비워 두면 옛날처럼 `draw` 로 넘어간다 — ★무승부를 승리로 지어내지 않는다★ 는 원칙은 그대로다.
 */
export interface NormalizeOptions {
  tieWinner?: 'red' | 'blue' | null
}

export function normalizeBarracksMatch(raw: RawBarracksMatch, options: NormalizeOptions = {}): NormalizeResult {""")
rep(p, """  if (redWins === blueWins) {
    /* ★무승부를 승리로 바꾸지 않는다.★ 원본에 무승부가 있으면 그건 우리가 모르는 상황이다 */
    return fail('draw', `라운드 승수가 같다 (${redWins}:${blueWins})`)
  }
""", """  if (redWins === blueWins && !options.tieWinner) {
    /* ★무승부를 승리로 바꾸지 않는다.★ 원본에 무승부가 있으면 그건 우리가 모르는 상황이다 */
    return fail('draw', `라운드 승수가 같다 (${redWins}:${blueWins})`)
  }
""")
rep(p, """      winnerSide: redWins > blueWins ? 'red' : 'blue',""",
       """      winnerSide: redWins === blueWins ? options.tieWinner! : redWins > blueWins ? 'red' : 'blue',""")

# 2. unifiedProject
p = 'apps/worker/src/jobs/unifiedProject.ts'
rep(p, """const emptySkips = (): Record<SkipReason, number> => ({""",
"""/**
 * ★라운드 승수 같은 경기를 원문의 승/패로 푼다★ (2026-09-23 밤 · 사장님 「자이언트 기록 누락」)
 *   `red_win_cnt = blue_win_cnt` 인데 `result_wdl` 이 「승」/「패」 인 경기가 나흘에 867건(7.6%).
 *   원문을 긁은 클랜(subject)이 어느 편인지 이름으로 알고, 그 클랜의 승/패로 승자를 정한다.
 *   양쪽 이름이 다 내 이름이거나 둘 다 아니면 모른다 → 옛날처럼 draw. false 면 옛 동작 그대로.
 */
const TIE_BREAK_BY_RESULT_WDL = true

function tieWinnerOf(
  subject: string | null,
  payload: Record<string, unknown>,
  clanBySlug: Map<string, LiveClan>,
  namesByClanId: Map<string, Set<string>>,
): 'red' | 'blue' | null {
  if (!subject) return null
  const clan = clanBySlug.get(subject)
  if (!clan) return null
  const wdl = typeof payload.result_wdl === 'string' ? payload.result_wdl.trim() : ''
  if (wdl !== '승' && wdl !== '패') return null
  const names = new Set<string>([clan.clanName, ...(namesByClanId.get(clan.clanId) ?? [])])
  const red = typeof payload.red_clan_name === 'string' ? payload.red_clan_name.trim() : ''
  const blue = typeof payload.blue_clan_name === 'string' ? payload.blue_clan_name.trim() : ''
  const isRed = red !== '' && names.has(red)
  const isBlue = blue !== '' && names.has(blue)
  if (isRed === isBlue) return null
  const mySide: 'red' | 'blue' = isRed ? 'red' : 'blue'
  if (wdl === '승') return mySide
  return mySide === 'red' ? 'blue' : 'red'
}

const emptySkips = (): Record<SkipReason, number> => ({""")
rep(p, """  /** 같은 이름인데 클랜이 둘 이상이라 표에서 뺀 이름 */
  ambiguousNames: string[]
  confirm: boolean
}""", """  /** 같은 이름인데 클랜이 둘 이상이라 표에서 뺀 이름 */
  ambiguousNames: string[]
  /** 라운드 승수가 같은데 원문 승/패로 승자를 정한 경기 (2026-09-23) */
  tieBroken: number
  confirm: boolean
}""")
rep(p, """    const payloadByKey = new Map<string, Record<string, unknown>>()
    if (wantKeys.length > 0) {
      for (const r of await prisma.$queryRaw<
        Array<{ matchKey: string; payload: Record<string, unknown> }>
      >`
        SELECT DISTINCT ON ("matchKey") "matchKey", "payload"
        FROM "BarracksClanMatchRaw"
        WHERE "status" = 'ok' AND "matchKey" = ANY(${wantKeys}::text[])
        ORDER BY "matchKey" ASC, "id" ASC
      `) {
        payloadByKey.set(r.matchKey, r.payload)
      }
    }
    const rows = heads.flatMap((h) => {
      const payload = payloadByKey.get(h.matchKey)
      return payload === undefined ? [] : [{ matchKey: h.matchKey, payload, subjects: h.subjects, clanNos: h.clanNos }]
    })""", """    const payloadByKey = new Map<string, { subject: string; payload: Record<string, unknown> }>()
    if (wantKeys.length > 0) {
      for (const r of await prisma.$queryRaw<
        Array<{ matchKey: string; subject: string; payload: Record<string, unknown> }>
      >`
        SELECT DISTINCT ON ("matchKey") "matchKey", "subject", "payload"
        FROM "BarracksClanMatchRaw"
        WHERE "status" = 'ok' AND "matchKey" = ANY(${wantKeys}::text[])
        ORDER BY "matchKey" ASC, "id" ASC
      `) {
        payloadByKey.set(r.matchKey, { subject: r.subject, payload: r.payload })
      }
    }
    const rows = heads.flatMap((h) => {
      const got = payloadByKey.get(h.matchKey)
      return got === undefined
        ? []
        : [{ matchKey: h.matchKey, payload: got.payload, payloadSubject: got.subject, subjects: h.subjects, clanNos: h.clanNos }]
    })""")
rep(p, """      const norm = normalizeBarracksMatch(row.payload)
      if (!norm.ok) {
        noteUnclassified(row.matchKey, norm.code, norm.reason)
        continue
      }
      const m = norm.match
""", """      /* ★승수가 같으면 원문을 긁은 클랜의 승/패로 승자를 정한다★ (2026-09-23 · payload 의 result_wdl 은 그 subject 의 것이다) */
      const tieWinner = TIE_BREAK_BY_RESULT_WDL
        ? tieWinnerOf(row.payloadSubject, row.payload, clanBySlug, namesByClanId)
        : null
      const norm = normalizeBarracksMatch(row.payload, { tieWinner })
      if (!norm.ok) {
        noteUnclassified(row.matchKey, norm.code, norm.reason)
        continue
      }
      const m = norm.match
      if (tieWinner && m.redWins === m.blueWins) result.tieBroken += 1
""")
print('unifiedProject: result init — find manually')

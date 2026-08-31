/**
 * 병영수첩 클랜 slug 하나가 **써 온 이름들**을 데이터에서 뽑는다 (순수 함수).
 *
 * ── 왜 필요한가
 *   클랜은 이름을 바꾼다. 원문의 `red_clan_name` / `blue_clan_name` 은 **그때의 이름**이라,
 *   지금 이름 하나로만 찾으면 개명 전 경기를 통째로 놓친다.
 *   실측 (2026-08-31 · IPL 투영 미리보기): `melody` 1,901건 · `pIacebo` 607건이
 *   "클랜을 못 찾음" 으로 빠졌다. 둘 다 IPL 등록 클랜인데 개명 때문이었다.
 *
 * ── 어떻게 뽑나 — **덮기(set cover)**
 *   한 slug 의 줄들에는 그 클랜의 이름이 red 나 blue 중 하나로 반드시 들어 있다.
 *   가장 많은 줄을 덮는 이름을 차례로 집어 그 slug 의 줄이 전부 덮일 때까지 모은다.
 *   상대 클랜은 일부 줄에만 나오므로 **주인 이름이 먼저 뽑힌다.**
 *   **명단을 코드에 박지 않는다** — 데이터가 말하게 한다.
 *
 * ── 원래 어디 있던 것인가
 *   `jobs/iplMatchImport.ts` 의 `runIplMatchCheck` 안에 있던 로직이다. 투영에서도 같은
 *   것이 필요해져서 여기로 뺐다. **옛 자리의 동작은 바뀌지 않는다.**
 */

/** 원문 한 줄에서 판정에 쓰는 것만 */
export interface SideRow {
  subject: string
  red: string | null
  blue: string | null
}

export interface DerivedName {
  name: string
  /** 이 이름 하나로 덮인 줄 수 */
  rows: number
  /** 그 slug 의 전체 줄 중 덮인 비율 */
  ratio: number
}

/** 개명이 아무리 잦아도 몇 번이면 끝난다. 무한히 집지 않는다 */
const MAX_NAMES_PER_SUBJECT = 8

/**
 * slug 별로 이름을 뽑는다.
 *
 * @returns slug -> 이름들 (많이 덮은 순)
 */
export function deriveClanNames(rows: readonly SideRow[]): Map<string, DerivedName[]> {
  const bySubject = new Map<string, Array<{ red: string | null; blue: string | null }>>()
  for (const row of rows) {
    const list = bySubject.get(row.subject)
    if (list) list.push({ red: row.red, blue: row.blue })
    else bySubject.set(row.subject, [{ red: row.red, blue: row.blue }])
  }

  const out = new Map<string, DerivedName[]>()

  for (const [subject, subjectRows] of bySubject) {
    const uncovered = new Set(subjectRows.map((_, index) => index))
    const chosen: DerivedName[] = []

    while (uncovered.size > 0 && chosen.length < MAX_NAMES_PER_SUBJECT) {
      const tally = new Map<string, number>()
      for (const index of uncovered) {
        const row = subjectRows[index]
        if (!row) continue
        for (const name of [row.red, row.blue]) {
          if (name) tally.set(name, (tally.get(name) ?? 0) + 1)
        }
      }

      let best: string | null = null
      let bestCount = 0
      for (const [name, count] of tally) {
        if (count > bestCount) {
          best = name
          bestCount = count
        }
      }
      /* 진전이 없으면 멈춘다 — 덮이지 않은 줄이 남아도 억지로 집지 않는다 */
      if (best === null || bestCount === 0) break

      for (const index of [...uncovered]) {
        const row = subjectRows[index]
        if (row && (row.red === best || row.blue === best)) uncovered.delete(index)
      }
      chosen.push({
        name: best,
        rows: bestCount,
        ratio: subjectRows.length === 0 ? 0 : bestCount / subjectRows.length,
      })
    }

    out.set(subject, chosen)
  }

  return out
}

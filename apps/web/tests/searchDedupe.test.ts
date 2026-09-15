import { describe, expect, it } from 'vitest'
import { dedupeSamePerson } from '../lib/server/queries/search'

/**
 * ★같은 사람이 두 줄로 뜨던 것★ (2026-09-14 사장님: «같은 닉네임 두개씩 뜨고»).
 *
 * 운영 실측 — 선수 표에 출처가 셋이고 서로 안 이어져 있다.
 *   dda       3줄 (기록 20 · 6 · 0)
 *   watercow  3줄 (기록 8 · 0 · 0 · 클랜이 셋 다 다름)
 */
const row = (
  id: string,
  name: string,
  clan: string | null,
  played: number,
) => ({ id, name, clan: clan === null ? null : { slug: clan }, _count: { leaguePlayers: played } })

describe('dedupeSamePerson — 목록에서만 접는다 (지우지 않는다)', () => {
  it('이름도 클랜도 같으면 한 줄만 남긴다 — 뛴 리그가 많은 쪽', () => {
    const out = dedupeSamePerson([
      row('b', 'dda', 'stylecIan', 0),
      row('a', 'dda', 'stylecIan', 2),
    ])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('판수가 같으면 id 가 앞선 쪽', () => {
    const out = dedupeSamePerson([row('b', 'x', 'c1', 1), row('a', 'x', 'c1', 1)])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('★클랜이 다르면 그대로 둔다★ — 동명이인일 수 있다', () => {
    const out = dedupeSamePerson([row('a', 'watercow', 'grave', 1), row('b', 'watercow', 'aeonic', 1)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('기록 0 인 줄은, 같은 이름에 기록 있는 줄이 있으면 뺀다', () => {
    const out = dedupeSamePerson([
      row('a', 'watercow', 'grave', 1),
      row('b', 'watercow', null, 0),
      row('c', 'watercow', 'aeonic', 0),
    ])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  /*
   * ★규칙 ③★ (2026-09-15 사장님: «자꾸 두명씩 뜨고 아예 기록없고 원랜 있는데»).
   *
   * ② 만으로는 안 막혔다 — 껍데기 줄에도 기록이 ★0 이 아니라 조금★ 붙어 있었다.
   * 운영 실측: `cutezz` 가 amaryllis 소속 73판 · 클랜 없음 4판 두 줄로 떴다.
   */
  it('★클랜 없는 줄은, 같은 이름에 클랜 있는 줄이 있으면 뺀다★ — 기록이 있어도', () => {
    const out = dedupeSamePerson([
      row('real', 'cutezz', 'amaryllis', 3),
      row('shell', 'cutezz', null, 2),
    ])
    expect(out.map((r) => r.id)).toEqual(['real'])
  })

  it('클랜 없는 줄이 ★기록이 더 많아도★ 클랜 있는 쪽을 남긴다', () => {
    const out = dedupeSamePerson([
      row('shell', 'cutezz', null, 9),
      row('real', 'cutezz', 'amaryllis', 1),
    ])
    expect(out.map((r) => r.id)).toEqual(['real'])
  })

  it('★둘 다 클랜이 없으면★ 한 줄로 접는다 — 갈라 둘 근거가 없다', () => {
    const out = dedupeSamePerson([
      row('a', 'clitorixs', null, 2),
      row('b', 'clitorixs', null, 1),
    ])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('★둘 다 클랜이 있으면 그대로 둔다★ — 진짜 동명이인일 수 있다', () => {
    const out = dedupeSamePerson([
      row('a', 'feeling', 'grave', 1),
      row('b', 'feeling', 'aeonic', 1),
    ])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  /*
   * ★살아 있는 줄을 고른다★ (2026-09-15 운영 실측).
   *
   * `diac` 가 두 줄이었다 — 병영수첩 줄은 9/10 까지 살아 있고, 옛 미러 줄은
   * 9/3 에 멈춰 있었다. 둘 다 3판이라 판수로는 못 가르고, id 로 고르면
   * 멈춘 쪽(`SUP-…`)이 이겼다. 사장님이 «들어가면 기록이 없다» 고 하신 자리다.
   */
  it('★같은 이름·같은 클랜이면 마지막으로 뛴 날이 늦은 쪽★', () => {
    const at = (iso: string) => new Date(iso).getTime()
    const out = dedupeSamePerson([
      { ...row('SUP-1426443380', 'diac', 'hing', 2), lastPlayedMs: at('2026-09-03') },
      { ...row('cmtuabmm40023', 'diac', 'hing', 1), lastPlayedMs: at('2026-09-10') },
    ])
    expect(out.map((r) => r.id)).toEqual(['cmtuabmm40023'])
  })

  it('마지막으로 뛴 날을 모르면 ★옛 규칙 그대로★ — 리그 수 · id 순', () => {
    const out = dedupeSamePerson([row('b', 'x', 'c1', 1), row('a', 'x', 'c1', 1)])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  /*
   * ⚠ ★내가 만든 버그★ (2026-09-15) — 규칙 ③ 이 ★살아 있는 줄을 죽였다.★
   *
   *   접는 규칙은 `row.clan` 을 보는데 그 칸은 `Player.clan` 하나다.
   *   우리 자료에서는 소속이 ★리그 명부에만★ 있는 줄이 많아서, 그런 줄이
   *   «클랜이 없다» 로 판정돼 통째로 빠졌다.
   *   ```
   *   diac  cmtuabmm…  Player.clan 없음 · 명부 roma   ← 9/10 까지 뛴 진짜 줄 (빠졌다)
   *   diac  SUP-14264…  Player.clan roma              ← 9/3 에 멈춘 줄 (남았다)
   *   ```
   *   그래서 `searchPlayers` 가 ★`playerClanOf` 로 푼 소속★ 을 넣어 준다.
   *   이 시험은 «소속이 같게 풀린 두 줄» 이 접히고 ★살아 있는 쪽★ 이 남는지를 본다.
   */
  it('★소속이 같게 풀리면 접고, 마지막으로 뛴 쪽을 남긴다★ (diac 실화)', () => {
    const at = (iso: string) => new Date(iso).getTime()
    const out = dedupeSamePerson([
      { ...row('cmtuabmm40023', 'diac', 'roma', 1), lastPlayedMs: at('2026-09-09') },
      { ...row('SUP-1426443380', 'diac', 'roma', 1), lastPlayedMs: at('2026-09-03') },
    ])
    expect(out.map((r) => r.id)).toEqual(['cmtuabmm40023'])
  })

  it('★들어온 차례가 반대여도 같은 줄을 남긴다★', () => {
    const at = (iso: string) => new Date(iso).getTime()
    const out = dedupeSamePerson([
      { ...row('SUP-1426443380', 'diac', 'roma', 1), lastPlayedMs: at('2026-09-03') },
      { ...row('cmtuabmm40023', 'diac', 'roma', 1), lastPlayedMs: at('2026-09-09') },
    ])
    expect(out.map((r) => r.id)).toEqual(['cmtuabmm40023'])
  })

  it('★전부 기록 0 이면 아무도 안 지운다★ — 빈 화면을 만들지 않는다', () => {
    const out = dedupeSamePerson([row('a', 'ghost', 'c1', 0), row('b', 'ghost', 'c2', 0)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('대소문자만 다른 닉도 같은 사람으로 본다', () => {
    const out = dedupeSamePerson([row('a', 'Iove', 'c1', 3), row('b', 'iove', 'c1', 0)])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('들어온 차례를 지킨다', () => {
    const out = dedupeSamePerson([row('z', 'a', 'c', 1), row('y', 'b', 'c', 1)])
    expect(out.map((r) => r.id)).toEqual(['z', 'y'])
  })

  /* ---------------------------------------------------------------- */
  /* ★세 줄이 서로를 지우던 것★ (2026-09-15 밤 · 운영 실측 «젤존»)      */
  /* ---------------------------------------------------------------- */

  /**
   * ⚠ ★있는 사람이 검색에서 통째로 사라졌다.★
   *
   * 옛 판은 규칙 둘이 따로 돌았다 —
   *   ② 기록 0 인데 같은 이름에 기록 있는 줄이 있으면 뺀다
   *   ③ 클랜 없는데 같은 이름에 클랜 붙은 줄이 있으면 뺀다
   * 둘이 ★서로 다른 줄을 근거로★ 돌아 물고 물리면 ★셋 다 죽는다.★
   *
   * 운영에서 «젤존» 을 쳐도 아무것도 안 나왔다 (실측 2026-09-15).
   */
  it('★기록만 있는 줄 · 클랜만 있는 줄 · 아무것도 없는 줄 — 전멸하지 않는다★', () => {
    const out = dedupeSamePerson([
      /* 병영수첩 — 기록은 있는데 클랜이 안 붙었다 */
      row('BRK-jelzon', '젤존', null, 1),
      /* 옛 미러 — 클랜은 있는데 이번 시즌 기록이 없다 */
      row('SUP-jelzon', '젤존', 'footmania2', 0),
      /* 넥슨 껍데기 — 둘 다 없다 */
      row('NX-jelzon', '젤존', null, 0),
    ])
    /* 기록(2점) > 클랜(1점) > 껍데기(0점) — 가장 실체 있는 줄 하나가 남는다 */
    expect(out.map((r) => r.id)).toEqual(['BRK-jelzon'])
  })

  it('점수가 같으면 둘 다 남긴다 — 클랜이 다르면 다른 사람일 수 있다', () => {
    const out = dedupeSamePerson([
      row('a', '속도', 'inpum', 2),
      row('b', '속도', 'jjangkangsu', 2),
    ])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('껍데기만 셋이어도 한 줄도 안 지우지 않는다', () => {
    const out = dedupeSamePerson([
      row('a', 'ghost', null, 0),
      row('b', 'ghost', null, 0),
    ])
    /* 열쇠(이름+클랜)가 같으니 한 줄로 접히되, ★사라지지는 않는다★ */
    expect(out).toHaveLength(1)
  })
})

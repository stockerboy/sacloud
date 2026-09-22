import { barracksBrowser, closeBarracksBrowser } from './nexon/browserFetch.js'

/**
 * ★★병영수첩이 무엇을 주는지 직접 본다★★ (2026-09-22 · 사장님 지시)
 *
 * > 「기록을 어떻게 가져오고 관리하는지를 확인해봐 ★구조부터 뜯어봐★ 어떤방식으로 가져오는지」
 *
 * ── 왜 필요한가
 *   서플라이 화면에는 ★우리에게 없는 값★ 이 있다 — 예: 「18분 9초」(경기 길이).
 *   그 값이 ★병영이 주는 것인지★ 아니면 ★그쪽이 따로 만든 것인지★ 를 알아야
 *   우리가 따라갈 수 있다. ★추측하지 말고 응답을 직접 본다.★
 *
 * ⚠ ★읽기만 한다.★ 한 줄도 쓰지 않는다.
 * ⚠ ★서버(크롬)에서만 돈다★ — 노트북에서 부르면 넥슨이 막는다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/probeBarracks.ts <경로> [본문JSON]
 * pnpm --filter @sacloud/worker exec tsx src/probeBarracks.ts /api/ClanHome/GetClanMatchList/ '{"clan_id":"Onepoint","page":1}'
 * ```
 */

/** 응답에서 칸 이름만 뽑아 본다 — 값은 앞 40자만 */
function outline(node: unknown, prefix = '', depth = 0, out: string[] = []): string[] {
  if (depth > 3 || out.length > 200) return out
  if (Array.isArray(node)) {
    out.push(`${prefix}[] 길이 ${node.length}`)
    if (node.length > 0) outline(node[0], `${prefix}[0]`, depth + 1, out)
    return out
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v !== null && typeof v === 'object') outline(v, `${prefix}.${k}`, depth + 1, out)
      else out.push(`${prefix}.${k} = ${String(v).slice(0, 40)}`)
    }
    return out
  }
  out.push(`${prefix} = ${String(node).slice(0, 40)}`)
  return out
}

async function main(): Promise<void> {
  const path = process.argv[2]
  const body = process.argv[3] ?? '{}'
  if (path === undefined || path === '') {
    console.error('경로를 주세요 — 예: /api/ClanHome/GetClanMatchList/')
    process.exitCode = 1
    return
  }
  try {
    const res = await barracksBrowser().call('POST', path, body)
    console.log(`HTTP ${res.status} · ${res.body.length} 글자`)
    let doc: unknown
    try {
      doc = JSON.parse(res.body)
    } catch {
      console.log(res.body.slice(0, 600))
      return
    }
    for (const line of outline(doc)) console.log('  ' + line)
  } finally {
    closeBarracksBrowser()
  }
}

await main()

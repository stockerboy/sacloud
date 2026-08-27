/**
 * 줄 단위 저장소 (JSONL) — 수십만 건을 담기 위한 것 (D-153).
 *
 * ── 왜 단일 JSON 을 버렸나
 *   처음에는 수집 결과를 통째로 하나의 `.json` 에 담았다. 3개월치(5천 경기)까지는
 *   문제가 없었는데 2년치로 넓히니 두 가지가 한꺼번에 터졌다.
 *
 *   1. **쓰기가 병목이 된다.** 경기 하나를 받을 때마다 파일 전체를 다시 쓴다.
 *      파일이 60MB 를 넘자 네트워크보다 디스크가 느려졌다.
 *   2. **다시 열 수 없게 된다.** 상세 13만 건이면 1.5GB 가 넘는데,
 *      Node 는 그만한 문자열을 만들지 못한다 — `JSON.parse` 가 죽는다.
 *      즉 **받아 놓고 못 읽는 파일**이 된다.
 *
 * ── 그래서 줄 단위다
 *   한 줄에 레코드 하나. 새 레코드는 **파일 끝에 덧붙이기만** 한다.
 *   읽을 때는 한 줄씩 흘려 읽는다 — 전체를 메모리에 올리지 않는다.
 *
 * ── 중복은 허용하고 읽을 때 정리한다
 *   같은 id 가 두 번 들어갈 수 있다(재시작 등). 나중 줄이 이긴다.
 *   덧붙이기만 하는 대신 이 비용을 받아들인다 — 지우거나 고치려면 결국
 *   파일을 다시 써야 하고, 그게 애초에 버린 방식이다.
 */
import { appendFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'

/** 레코드 하나를 파일 끝에 덧붙인다 */
export function appendJsonl(file: string, record: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
}

/** 여러 건을 한 번에 덧붙인다 — 쓰기 횟수를 줄인다 */
export function appendJsonlMany(file: string, records: readonly unknown[]): void {
  if (records.length === 0) return
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8')
}

/**
 * 한 줄씩 흘려 읽는다. **전체를 메모리에 올리지 않는다.**
 *
 * 깨진 줄은 건너뛰고 세어서 알려 준다 — 조용히 삼키면 몇 건이 사라졌는지 모른다.
 * (쓰다가 죽으면 마지막 줄이 잘려 있을 수 있다)
 */
export async function readJsonl<T>(
  file: string,
  onRecord: (record: T) => void,
): Promise<{ lines: number; broken: number }> {
  if (!existsSync(file)) return { lines: 0, broken: 0 }

  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  let lines = 0
  let broken = 0
  for await (const line of rl) {
    if (line.trim() === '') continue
    lines += 1
    try {
      onRecord(JSON.parse(line) as T)
    } catch {
      broken += 1
    }
  }
  return { lines, broken }
}

/**
 * 파일에 이미 들어 있는 **id 집합**만 읽는다.
 *
 * 이미 받은 것을 다시 받지 않기 위해서다. 레코드 본문은 필요 없으므로
 * 값을 들고 있지 않는다 — 13만 건 본문을 메모리에 올릴 이유가 없다.
 */
export async function readJsonlIds(
  file: string,
  idOf: (record: Record<string, unknown>) => string | undefined,
): Promise<Set<string>> {
  const ids = new Set<string>()
  await readJsonl<Record<string, unknown>>(file, (record) => {
    const id = idOf(record)
    if (id !== undefined) ids.add(id)
  })
  return ids
}

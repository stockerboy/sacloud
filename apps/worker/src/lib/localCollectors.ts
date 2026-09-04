/**
 * ★이 컴퓨터에 실제로 남아 있는 수집 프로세스를 센다★ (2026-09-04 · Pre-Part 0).
 *
 * ══ ★이것은 자물쇠가 아니다★ ══
 *
 * 자물쇠는 `packages/db/ops/collectorLease.ts` 의 ★임대★ 가 한다.
 * 이 파일은 ★장부와 현실을 대조하는 자★ 다. 둘은 역할이 다르다.
 *
 * ```
 * ★임대★    「돌아도 되나」를 정한다      ← 판정. 틈이 없다
 * ★이 파일★ 「실제로 몇 개 남았나」를 본다 ← 관찰. ★틈이 있다★
 * ```
 *
 * ⚠ ★이 숫자로 「돌아도 되나」를 정하지 마라.★ 그게 지금까지 세 번 뚫린 방식이다.
 *   수집기는 한 판이 도는 동안 ★일꾼이 하나도 없는 구간★(투영·쉼)이 길어서,
 *   그 구간을 「안 돌고 있다」와 구별할 수 없다.
 *
 * ══ 그럼 왜 세는가 ══
 *
 * 사장님 완료 조건에 ★«프로세스 종료 후 실제 남은 프로세스 수까지 확인 가능»★ 이 있다.
 * 그리고 실제로 필요하다 —
 *
 *   · 멈추는 도구가 ★셸만 죽이고 아래 일꾼을 남긴다★ (세 번 다 그랬다).
 *     2026-09-04 에도 셸을 죽였더니 `barracks-collect --league daerule` 5겹이 살아남았다
 *   · 임대는 살아 있는데 프로세스가 0개면 ★죽은 판이 임대를 쥔 채 만료를 기다리는 것★ 이다
 *
 * ══ 왜 PowerShell 인가 ══
 *
 * `tasklist` 는 ★명령줄을 안 보여 준다.★ 우리가 가려야 하는 것은 이름이 아니라
 * ★무엇을 돌리는 node 인가★ 라서 명령줄이 필요하다.
 *
 * ⚠ ★자기 자신을 세면 안 된다★ — 세러 띄운 PowerShell 의 명령줄에도 검색어가 들어 있다.
 *   실제로 이 함정에 한 번 걸려서 «아무것도 안 도는데 1개 돌고 있다» 가 나왔다.
 */
import { spawnSync } from 'node:child_process'

/**
 * 수집 일꾼으로 보는 명령줄 조각.
 *
 * ⚠ ★셸 이름(`collect-3leagues.sh`)을 여기에 넣지 마라.★ 셸의 명령줄에는
 *   스크립트 ★내용★ 이 통째로 들어가는 경우가 있어서 엉뚱한 것이 걸린다.
 *   여기서 세는 것은 ★실제로 네트워크를 두드리거나 DB 를 쓰는 일꾼★ 이다.
 */
export const COLLECTOR_PROCESS_PATTERNS = [
  'barracks-collect',
  'battlelog-lineup',
  'iplmatch-project',
  'supply-mirror',
  'supply-import',
] as const

export interface LocalCollector {
  pid: number
  name: string
  command: string
}

/**
 * 도는 수집 프로세스 목록.
 *
 * ★못 세면 `null` 이다 — 「0개」가 아니다.★ 「모르는 것」과 「없는 것」은 다르다.
 */
export function listLocalCollectors(): LocalCollector[] | null {
  if (process.platform !== 'win32') return null

  const pattern = COLLECTOR_PROCESS_PATTERNS.join('|')
  /* `node.exe` · `cmd.exe` 만 본다 — 진짜 일꾼은 pnpm → cmd → tsx → node 로 뜬다.
     셸(`sh.exe`)·PowerShell 은 명령줄에 스크립트가 통째로 들어가서 글자만 보면 걸린다 */
  const script =
    `@(Get-CimInstance Win32_Process | Where-Object { ` +
    `($_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe') -and ` +
    `$_.CommandLine -match '${pattern}' -and ` +
    `$_.CommandLine -notmatch 'Get-CimInstance' }) | ` +
    `ForEach-Object { "$($_.ProcessId)|$($_.Name)|$($_.CommandLine)" }`

  const out = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  })
  if (out.error || out.status !== 0) return null

  const rows: LocalCollector[] = []
  for (const line of (out.stdout ?? '').split(/\r?\n/)) {
    const text = line.trim()
    if (text === '') continue
    const [pid, name, ...rest] = text.split('|')
    const id = Number(pid)
    if (!Number.isInteger(id)) continue
    rows.push({ pid: id, name: name ?? '?', command: rest.join('|') })
  }
  return rows
}

/** 개수만. ★못 세면 -1★ — 그건 「0개」와 다르다 */
export function countLocalCollectors(): number {
  const rows = listLocalCollectors()
  return rows === null ? -1 : rows.length
}

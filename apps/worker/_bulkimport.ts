/* 임시 구동기 — 원문 파일을 한 프로세스에서 순서대로 넣는다 (2026-09-02). 끝나면 지운다. */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { importBattleLogs } from './src/jobs/battlelog.js'

const ROOT = join(process.cwd(), 'reports')
const dirs = readdirSync(ROOT)
  .filter((n) => n === 'clan-battlelog' || n.startsWith('clan-battlelog-'))
  .filter((n) => statSync(join(ROOT, n)).isDirectory())
  .sort()

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const confirm = process.argv.includes('--confirm')
const targets = only.length > 0 ? dirs.filter((d) => only.includes(d)) : dirs

const total = { rows: 0, stored: 0, duplicate: 0, skipped: 0, events: 0, points: 0, files: 0 }

async function main() {
  for (const dir of targets) {
    const files = readdirSync(join(ROOT, dir))
      .map((n) => join(ROOT, dir, n))
      .filter((p) => statSync(p).isFile())
      .sort()
    const d = { rows: 0, stored: 0, duplicate: 0, skipped: 0, events: 0, points: 0 }
    for (const f of files) {
      let r
      for (let attempt = 1; ; attempt += 1) {
        try {
          r = await importBattleLogs({ file: f, confirm })
          break
        } catch (e) {
          const msg = (e as Error).message?.slice(0, 120)
          if (attempt >= 5) throw e
          console.log(`  [재시도 ${attempt}] ${f.split(/[\/]/).pop()} — ${msg}`)
          await new Promise((res) => setTimeout(res, 3000 * attempt))
        }
      }
      d.rows += r.rows
      d.stored += r.stored
      d.duplicate += r.duplicate
      d.skipped += r.skipped
      d.events += r.events
      d.points += r.points
      total.files += 1
    }
    for (const k of Object.keys(d) as (keyof typeof d)[]) total[k] += d[k]
    console.log(
      `${dir}\t파일 ${files.length}\t줄 ${d.rows}\t신규 ${d.stored}\t중복 ${d.duplicate}\t불명 ${d.skipped}\t이벤트 ${d.events}\t좌표 ${d.points}`,
    )
  }
  console.log(
    `\n합계\t파일 ${total.files}\t줄 ${total.rows}\t신규 ${total.stored}\t중복 ${total.duplicate}\t불명 ${total.skipped}\t이벤트 ${total.events}\t좌표 ${total.points}`,
  )
}

main().catch((e) => {
  console.error('실패:', (e as Error).message?.slice(0, 400))
  process.exit(1)
})

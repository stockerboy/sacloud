/**
 * 개발 서버를 "하나만" 깨끗하게 띄운다.
 *
 * 왜 필요한가 (docs/DECISIONS.md D-021)
 * - `pnpm dev`를 여러 번 실행하면 Next가 3000이 점유됐다고 3001, 3002…로 밀려서 뜬다.
 * - 그러면 3000번에는 **옛날 코드로 돌던 서버**가 남아, 새로 만든 라우트가 404로 보인다.
 *   (실제로 `/auth/login`이 404로 보이는 사고가 있었다.)
 *
 * 이 스크립트는 3000~3010을 듣고 있는 프로세스를 정리하고, `.next`를 지운 뒤
 * 서버를 한 번만 띄운다.
 */
import { execSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTS = Array.from({ length: 11 }, (_, index) => 3000 + index)

function killPort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pids = new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && /^\d+$/.test(pid) && pid !== '0'),
    )
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
        console.info(`  종료: 포트 ${port} (pid ${pid})`)
      } catch {
        /* 이미 죽었으면 무시 */
      }
    }
  } catch {
    /* 해당 포트를 듣는 프로세스가 없으면 findstr가 1로 끝난다 */
  }
}

console.info('기존 개발 서버 정리…')
for (const port of PORTS) killPort(port)

console.info('.next 삭제…')
rmSync(path.join(root, 'apps/web/.next'), { recursive: true, force: true })

console.info('개발 서버 시작 (http://localhost:3000)')
spawn('pnpm', ['dev'], { cwd: root, stdio: 'inherit', shell: true })

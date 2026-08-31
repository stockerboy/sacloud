/**
 * 로컬에서 만든 **운영 반영 스크립트**를 운영 DB 를 향해 돌린다.
 *
 * ```
 * node scripts/prod-run.mjs <이름> [인자...]
 * node scripts/prod-run.mjs --list          # 돌릴 수 있는 것 목록
 * ```
 *
 * ── 왜 감싸는가 (`scripts/prod-migrate.mjs` 와 같은 이유)
 *   1. 운영 접속 주소를 **명령줄에 노출하지 않는다.** 비밀번호가 들어 있다.
 *      `packages/db/.env.production.local` 에서 읽어 자식 프로세스에만 넘긴다.
 *   2. **아무 스크립트나 못 돌린다.** 아래 표에 적힌 것만 돌아간다.
 *   3. 주소가 로컬(127.0.0.1 · localhost)이면 **거부한다.** 이건 운영용이다 —
 *      로컬에 돌리려면 `pnpm --filter @sacloud/worker exec tsx ...` 를 그냥 쓰면 된다.
 *   4. 화면에는 **호스트만** 찍는다. 전체 주소는 절대 찍지 않는다.
 *
 * ── 이 스크립트 자체는 아무것도 쓰지 않는다
 *   쓰기 여부는 **자식 스크립트의 `--confirm`** 이 정한다. 붙이지 않으면 미리보기다.
 *   `--confirm` 을 붙일 때는 그 스크립트가 무엇을 지우는지 먼저 미리보기로 읽어라.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/**
 * 돌릴 수 있는 것. **여기 없는 이름은 거부한다.**
 * 값은 `apps/worker/src/dev/<값>.ts` 다.
 */
const ALLOWED = {
  /* 읽기만 한다 */
  'ipl-state': { file: 'iplState', writes: false, what: 'IPL 리그·등록 클랜·경기 수를 읽는다' },
  'ipl-source': { file: 'iplSource', writes: false, what: 'IPL 기록이 어디까지 있는지 센다' },
  'ipl-match': { file: 'iplMatch', writes: false, what: '명단 39곳이 DB 에 있는지 대조한다' },
  'sanply-check': { file: 'sanplyCheck', writes: false, what: '열산에서 IPL 이 빠졌는지 대조한다' },
  'ipl-sanply-forensics': {
    file: 'iplSanplyForensics',
    writes: false,
    what: '열산에 남은 IPL끼리 경기를 한 건씩 찍는다 (원인 규명 · 역방향 포함)',
  },

  /* `--confirm` 을 붙여야 쓴다 */
  'league-rename': {
    file: 'leagueRename',
    writes: true,
    what: '리그 이름 DPL / IPL / 열산 + 게시판 카테고리 SPL→DPL',
  },
  'ipl-register': {
    file: 'iplRegister',
    writes: true,
    what: 'IPL 39곳을 티어별로 등록한다 (1티어는 비운다). 없는 클랜은 만든다',
  },
  'season0-apply': {
    file: 'season0ApplyProd',
    writes: true,
    what: '시즌0 창 + 배치고사 10판 규칙을 운영에 적용한다 (--leagues <slug> 필요) ⚠ 백업 후 --revert 가능',
  },
  /* dev 스크립트에서 **정식 잡으로 승격**됐다 (D-210). `nexon` CLI 를 통해 부른다 */
  'clan-mark-audit': {
    file: 'clanMarkAudit',
    writes: false,
    what: '리그에 등록된 클랜 중 마크가 안 그려지는 곳을 리그별로 찍는다 (판정거짓 / 마크없음)',
  },
  'match-first-side-check': {
    file: 'matchFirstSideCheck',
    writes: false,
    what: '전반 공수 백필의 재료(배틀로그 원문·클랜번호)와 채워진 건수를 센다',
  },
  'match-first-side-push': {
    file: 'matchFirstSidePush',
    writes: true,
    what: '로컬에서 정한 전반 공수(선레드/선블루)를 운영 Match 에 채운다 (D-207)',
  },
  'match-first-side': {
    file: 'matchFirstSideBuild',
    writes: true,
    what: '경기별 전반 공수(선레드/선블루)를 배틀로그 폭탄 근거로 채운다 (D-207)',
  },
  'ipl-mark-fill': {
    file: 'iplMarkFill',
    writes: true,
    what: 'IPL 클랜의 클랜마크 주소를 채운다 (이미 있는 곳은 안 덮는다)',
  },
  'admin-ensure': {
    file: 'adminEnsure',
    writes: true,
    what: '관리자 계정을 만들거나 비밀번호를 새로 정한다 (--email 필요) ⚠ 비밀번호가 화면에 한 번 찍힌다',
  },
  'mock-orphan-purge': {
    file: 'mockOrphanPurge',
    writes: true,
    what: '가짜 시드 삭제 뒤 남은 고아 선수·클랜을 치운다 ⚠ 백업을 뜬다',
  },
  'mock-league-purge': {
    file: 'mockLeaguePurge',
    writes: true,
    what: '가짜 시드 리그(공식전·세컨드·친목전·토너먼트)를 지운다 ⚠ 지우기 전에 백업을 뜬다',
  },
  'ipl-clan-rollup': {
    cli: ['nexon', 'ipl-clan-rollup'],
    writes: true,
    what: 'IPL 경기 결과로 LeagueClan 의 승패·래더·배치고사를 다시 매긴다 (결정적 replay)',
  },
  'ipl-project-push': {
    file: 'iplProjectPush',
    writes: true,
    what: '로컬에서 투영한 IPL 경기를 운영 Match 에 밀어 넣는다 (안정된 키만 옮긴다). 멱등',
  },
  'ipl-sanply-check': { cli: ['nexon', 'ipl-sanply-check'], writes: false, what: '열산에 남은 IPL끼리 경기를 센다 (0 이어야 한다)' },
  'ipl-sanply-purge': { cli: ['nexon', 'ipl-sanply-purge'], writes: true, what: '열산에서 IPL끼리의 경기를 지우고 등록 해제한다 ⚠ 지우기 전에 백업을 뜬다' },
}

const args = process.argv.slice(2)
const name = args[0]

if (!name || name === '--list' || name === '-h' || name === '--help') {
  console.info('돌릴 수 있는 것 — node scripts/prod-run.mjs <이름> [--confirm]\n')
  for (const [key, v] of Object.entries(ALLOWED)) {
    console.info(`  ${key.padEnd(18)} ${v.writes ? '쓰기' : '읽기'}  ${v.what}`)
  }
  console.info('\n`--confirm` 없이 돌리면 미리보기다. 먼저 미리보기로 확인해라.')
  process.exit(0)
}

const entry = ALLOWED[name]
if (!entry) {
  console.error(`'${name}' 은 여기서 돌릴 수 없다. 목록은 node scripts/prod-run.mjs --list`)
  process.exit(1)
}

let url
try {
  const text = readFileSync('packages/db/.env.production.local', 'utf8')
  url = (text.match(/DATABASE_URL="([^"]+)"/) ?? [])[1]
} catch {
  console.error('packages/db/.env.production.local 을 읽지 못했다. 저장소 루트에서 실행해야 한다.')
  process.exit(1)
}
if (!url) {
  console.error('그 파일에 DATABASE_URL 이 없다.')
  process.exit(1)
}

const host = new URL(url).host
if (/^(127\.0\.0\.1|localhost|\[::1\])(:|$)/.test(host)) {
  console.error(`대상이 로컬이다 (${host}). 이 스크립트는 운영용이다.`)
  process.exit(1)
}

const rest = args.slice(1)
const willWrite = entry.writes && rest.includes('--confirm')

console.info(`대상 : ${host}`)
console.info(`작업 : ${entry.what}`)
console.info(`모드 : ${willWrite ? '⚠ 실제로 쓴다' : '미리보기 (쓰지 않는다)'}\n`)

/* `cli` 가 있으면 정식 명령, `file` 이면 `src/dev/*.ts` 스크립트다 */
const argv = entry.cli
  ? ['--filter', '@sacloud/worker', ...entry.cli, ...rest]
  : ['--filter', '@sacloud/worker', 'exec', 'tsx', `src/dev/${entry.file}.ts`, ...rest]

const result = spawnSync(
  'pnpm',
  argv,
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  },
)
process.exit(result.status ?? 1)

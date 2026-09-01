/**
 * `data/clan/clan-aliases.json` → `packages/contract/src/clanAliasTable.ts` 로 **구워 낸다**.
 *
 * ── 왜 굽는가 (파일을 그냥 읽지 않는 이유)
 *   별칭 표를 쓰는 곳은 `apps/web` 의 서버 질의다. 거기서 저장소 루트의 `data/` 를
 *   `fs.readFile` 로 읽으면 **Vercel 번들에 그 파일이 들어간다는 보장이 없다** —
 *   Next 의 파일 추적(`outputFileTracing`)은 정적으로 보이는 경로만 따라가고,
 *   런타임에 만든 경로는 못 본다. 빠지면 배포에서 **조용히 빈 표**가 된다.
 *   `next.config.ts` 의 `outputFileTracingIncludes` 에 넣는 길도 있지만,
 *   그건 «설정을 안 건드리면 깨지는» 연결이라 한 줄 지우면 다시 조용히 죽는다.
 *
 *   그래서 **TypeScript 상수로 굽는다.** `@sacloud/contract` 는 `transpilePackages` 에
 *   들어 있어 소스가 그대로 번들된다 — 상수는 절대 빠질 수 없다. 요청마다 파일을 읽는
 *   비용도 0 이고, 클라이언트 화면에서도 같은 표를 쓸 수 있다.
 *
 * ── 사람이 고치는 곳은 여전히 JSON 이다
 *   `data/clan/clan-aliases.json` 이 원본이다. 고친 뒤 이 스크립트를 돌린다.
 *   두 쪽이 어긋나면 `packages/contract/src/__tests__/clanAliases.test.ts` 가 잡는다.
 *
 * ```
 * node scripts/build-clan-aliases.mjs
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const SOURCE = path.join(ROOT, 'data', 'clan', 'clan-aliases.json')
const TARGET = path.join(ROOT, 'packages', 'contract', 'src', 'clanAliasTable.ts')

const raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))

/**
 * 문자열 리터럴로 감싼다. 저장소 규칙(홑따옴표)에 맞추되,
 * 홑따옴표·역슬래시가 섞여 있으면 `JSON.stringify` 에 맡긴다.
 */
const q = (value) =>
  /['\\\n\r\t]/.test(value) ? JSON.stringify(value) : `'${value}'`

const aliasKeys = Object.keys(raw.aliases)
const aliasCount = aliasKeys.reduce((sum, key) => sum + raw.aliases[key].length, 0)

const aliasLines = aliasKeys
  .map((key) => `  ${q(key)}: [${raw.aliases[key].map(q).join(', ')}],`)
  .join('\n')

const inactiveLines = raw.inactive.map((key) => `  ${q(key)},`).join('\n')

const out = `/**
 * 클랜 별칭 표 — **자동 생성 파일이다. 손으로 고치지 마라.**
 *
 * 원본: \`data/clan/clan-aliases.json\` (사용자가 직접 적었다, 2026-09-01)
 * 생성: \`node scripts/build-clan-aliases.mjs\`
 *
 * 지금 값: 클랜 ${aliasKeys.length}곳 · 별칭 ${aliasCount}개 · 활동중지 표시 ${raw.inactive.length}곳
 *
 * 열쇠는 **\`리그slug/클랜slug\`** 다. \`Clan.slug\` 는 전역 유일이라 리그 앞머리는
 * «어느 리그에서 적었는가» 를 남기는 기록일 뿐이다. 찾을 때는 클랜 slug 만 본다
 * (\`clanAliases.ts\` 의 \`CLAN_ALIASES_BY_SLUG\`).
 */

/** 원본 JSON 의 \`source\` 줄 그대로 */
export const CLAN_ALIAS_SOURCE = ${q(raw.source)}

/** 원본 JSON 의 \`note\` 줄 그대로 */
export const CLAN_ALIAS_NOTE = ${q(raw.note)}

/** \`리그slug/클랜slug\` → 별칭들 */
export const CLAN_ALIAS_ENTRIES: Readonly<Record<string, readonly string[]>> = {
${aliasLines}
}

/**
 * 「활동 안 함」으로 **표시만** 된 클랜들 (\`리그slug/클랜slug\`).
 *
 * ⚠ **아무 데서도 쓰지 않는다.** 사용자가 «지워» 라고 표시해 둔 목록이고,
 *   무엇을 할지(감출지 · 지울지 · 그냥 둘지)는 **사용자가 정한다.**
 *   읽을 수 있게 자리만 만들어 둔 것이다 — 검색에서 거르거나 숨기는 데 쓰지 마라.
 */
export const CLAN_INACTIVE_KEYS: readonly string[] = [
${inactiveLines}
]
`

fs.writeFileSync(TARGET, out, 'utf8')
console.log(
  `클랜 ${aliasKeys.length}곳 · 별칭 ${aliasCount}개 · 활동중지 ${raw.inactive.length}곳 → ${path.relative(ROOT, TARGET)}`,
)

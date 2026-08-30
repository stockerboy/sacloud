/**
 * `playstyle-build` 단독 실행 진입점 (사양 8절 · D-211).
 *
 * ```
 * pnpm --filter @sacloud/worker playstyle-build            # 미리보기 (한 줄도 안 쓴다)
 * pnpm --filter @sacloud/worker playstyle-build --confirm  # 실제 저장
 * ```
 *
 * ── 왜 `cli.ts` 에 붙이지 않았나
 *   이 작업과 동시에 다른 작업이 `src/cli.ts` 를 고치고 있어 건드리지 않기로 했다.
 *   `nexon` 하위 명령으로 옮기는 것은 **한 줄이면 된다** —
 *   `cli.ts` 에서 `buildPlayerPlaystyleProfiles` 를 불러 `playstyle-build` 로 걸면 된다.
 *   그때 이 파일은 지워도 된다.
 */
import { buildPlayerPlaystyleProfiles } from './jobs/playstyleBuild.js'
import { PLAYSTYLE_BUILDER_VERSION } from './lib/playstyleBuilderVersion.js'

const confirm = process.argv.includes('--confirm')

const result = await buildPlayerPlaystyleProfiles({ confirm })

const rate = (part: number, whole: number): string =>
  whole === 0 ? '-' : ((part / whole) * 100).toFixed(1) + '%'

console.log('플레이스타일 집계 · ' + PLAYSTYLE_BUILDER_VERSION)
console.log('  원문 줄        ' + result.rows + ' → 고유 경기 ' + result.matches)
console.log('  팀번호 모름    ' + result.unknownTeamNo)
console.log('  5대5 미확인    ' + result.notRestorable)
console.log('  진영 모순      ' + result.conflicts)
console.log('  교대 못 봄     ' + result.unsided)
console.log('  계정번호 모름  ' + result.unknownAccounts)
console.log('  실제로 쓴 경기 ' + result.used + '  (' + rate(result.used, result.matches) + ')')
console.log('  잰 라운드      수비 ' + result.defenseRounds + ' · 공격 ' + result.attackRounds)
console.log('  프로필         ' + result.profiles + '명 · 그중 Player 연결 ' + result.linked + '명')
console.log(
  result.written
    ? '  저장했다.'
    : '  **저장하지 않았다** — 실제로 쓰려면 `--confirm` 을 붙여라.',
)

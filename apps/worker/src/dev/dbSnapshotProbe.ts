/**
 * **같은 검사를 여기서 돌리면 몇 초인가** — 러너와 우리 사이의 A/B (2026-09-01 · D-229 후속).
 *
 * ```
 * node scripts/prod-run.mjs db-snapshot-probe
 * ```
 *
 * ── 왜 필요한가
 *   운영 전수 집계가 로컬 5분 → GitHub Actions 88분+ 였다. 「운영 DB 가 느리다」로
 *   읽으면 인덱스·통계를 손보게 되는데, **원인이 거기가 아닐 수 있다.**
 *
 *   러너는 GitHub 호스티드(미국)이고 DB 는 `ap-northeast-2`(서울)다.
 *   질의 한 번마다 태평양을 왕복한다. 왕복이 지배적이면 **질의를 빠르게 만드는 것보다
 *   질의 수를 줄이거나 가까운 곳에서 도는 것**이 답이다. 처방이 정반대다.
 *
 *   그래서 **CI 가 매번 돌리는 것과 똑같은 `takeDbSnapshot`** 을 여기(한국)에서 재서
 *   같은 코드·같은 DB 의 두 지점 값을 비교한다.
 *   CI 실측: 1.2 ~ 1.8분 (증분 run 12건 · step 「검증 — 행 수 · 무결성」).
 *
 * ── **읽기만 한다.** `takeDbSnapshot` 은 세고 읽을 뿐 한 줄도 쓰지 않는다.
 */
import { takeDbSnapshot } from '../jobs/dbSnapshot'

const started = Date.now()
const snapshot = await takeDbSnapshot('probe-local')
const seconds = (Date.now() - started) / 1000

const rows = Object.entries(snapshot.counts)
  .sort((left, right) => Number(right[1]) - Number(left[1]))
  .slice(0, 5)

console.info(`db-snapshot 소요 ${seconds.toFixed(1)}초 (여기 = 한국 · 같은 운영 DB)`)
console.info(`  CI 실측(미국 러너) 72~108초 — 배수 ${(72 / seconds).toFixed(1)}x ~ ${(108 / seconds).toFixed(1)}x`)
console.info(`  무결성 검사 ${snapshot.integrity.length}건 · 실패 ${snapshot.integrity.filter((r) => !r.pass).length}건`)
console.info(`  가장 큰 표 5개: ${rows.map(([k, v]) => `${k}=${v}`).join(' · ')}`)

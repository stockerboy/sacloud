/**
 * 스니펫을 확장 폴더로 **그대로 복사**한다 — 수집 로직을 두 벌 만들지 않기 위해서다.
 *
 *   node scripts/barracks-autocollect/pack.mjs           scripts/battlelog-collect-snippet.js → extension/snippet.js
 *   node scripts/barracks-autocollect/pack.mjs --check   둘이 같은지만 본다 (다르면 exit 1)
 *
 * 크롬은 확장 폴더 밖의 파일을 못 읽는다. 그래서 복사본이 필요하고, 복사본은 **이 스크립트만** 만든다.
 * `extension/snippet.js` 를 손으로 고치지 마라 — 원본(`battlelog-collect-snippet.js`)을 고치고 이걸 다시 돌린다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, '..', 'battlelog-collect-snippet.js')
const DST = path.join(here, 'extension', 'snippet.js')
const BANNER = '/* 생성 파일 — 손으로 고치지 마라. scripts/battlelog-collect-snippet.js 를 pack.mjs 가 그대로 복사한 것이다 */\n'

const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n')
const want = BANNER + src

if (process.argv.includes('--check')) {
  let have = ''
  try {
    have = readFileSync(DST, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    /* 없으면 다르다 */
  }
  if (have !== want) {
    console.error('extension/snippet.js 가 원본과 다르다 — node scripts/barracks-autocollect/pack.mjs 를 돌려라')
    process.exit(1)
  }
  console.log('extension/snippet.js 는 원본과 같다')
  process.exit(0)
}

writeFileSync(DST, want, 'utf8')
console.log(`복사했다: ${path.relative(process.cwd(), SRC)} → ${path.relative(process.cwd(), DST)} (${want.length}자)`)

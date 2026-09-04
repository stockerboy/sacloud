import { supplyGet } from '../lib/supplyClient.js'
import { log } from '../lib/log.js'
const res = await supplyGet<unknown>('/leagues/1/ranks/players')
const text = JSON.stringify(res)
let i = -1
while ((i = text.indexOf('5623', i + 1)) !== -1) {
  log(`  …${text.slice(Math.max(0, i - 90), i + 40)}…`)
}

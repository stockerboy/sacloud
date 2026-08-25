/** 결정적 replay 검증 — 두 번 돌려 같은지 본다 (dry-run) */
import { createHash } from 'node:crypto'
import { prisma } from '@sacloud/db'
import { readNexonConfig } from '@sacloud/nexon'
import { runRate } from '../jobs/rate.js'
const ctx = { config: readNexonConfig(), client: null, dryRun: true, limit: null, resume: false }
const digest = (r: Awaited<ReturnType<typeof runRate>>): string =>
  createHash('sha256')
    .update(JSON.stringify({ p: r.report.players, c: r.report.clans, m: r.matchesRated }))
    .digest('hex')
    .slice(0, 32)
const a = await runRate(ctx, { leagueSlug: 'supply' })
const b = await runRate(ctx, { leagueSlug: 'supply' })
const da = digest(a)
const db = digest(b)
console.info(`run1 ${da}\nrun2 ${db}\n결정적: ${da === db ? 'PASS' : 'FAIL'}`)
await prisma.$disconnect()

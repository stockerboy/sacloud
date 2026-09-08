/* 운영 DB 에 읽기로 붙는다. ★세션 풀러(5432)★ 를 쓴다 — 사이트는 6543 을 쓴다 (D-249) */
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@sacloud/db'
const envPath = new URL('../../packages/db/.env.production.local', import.meta.url)
const url = /^DATABASE_URL=(.*)$/m.exec(readFileSync(envPath, 'utf8'))[1]
  .trim().replace(/^["']|["']$/g, '').replace(':6543', ':5432')
export const prisma = new PrismaClient({ datasources: { db: { url } } })
export const FROM = new Date('2026-09-02T22:00:00.000Z')
export const TO = new Date('2026-09-30T15:00:00.000Z')
export const t = (n, w = 8) => String(n).padStart(w)

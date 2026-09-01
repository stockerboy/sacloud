import { PrismaClient } from '../generated/client/index.js'
const p = new PrismaClient()
try {
  const r = await p.$queryRawUnsafe('SELECT 1 AS ok, now() AS at')
  console.log('OK', JSON.stringify(r))
} catch (e) {
  console.log('FAIL', e.message.split('\n')[0])
}
await p.$disconnect()

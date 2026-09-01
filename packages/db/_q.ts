import { PrismaClient } from "./generated/client/index.js";
const p = new PrismaClient();
const kst = (d: any) => d ? new Date(new Date(d).getTime() + 9*3600*1000).toISOString().slice(0,19).replace("T"," ") : "-";
async function main() {
  const now = new Date();
  console.log("측정 시각(한국):", kst(now));
  console.log("");
  const r: any[] = await p.$queryRawUnsafe(`
    SELECT l.slug, max(m."startAt") AS 경기, max(m."ingestedAt") AS 적재,
           count(*) FILTER (WHERE m."ingestedAt" > now() - interval '10 minutes')::int AS 최근10분,
           count(*)::int AS 총계
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
    WHERE l.slug IN ('supply','sanply','nolink') GROUP BY l.slug`);
  for (const x of r) console.log(`${x.slug}\t마지막경기 ${kst(x.경기)}\t적재 ${kst(x.적재)}\t10분내 ${x.최근10분}건\t총 ${x.총계}`);

  console.log("\n=== 방금 들어온 SPL 경기 5건 (경기시각 · 적재시각) ===");
  const s: any[] = await p.$queryRawUnsafe(`
    SELECT m."startAt", m."ingestedAt", m.origin, m."sourceMatchId"
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId"
    WHERE l.slug='supply' ORDER BY m."ingestedAt" DESC LIMIT 5`);
  for (const x of s) console.log(`경기 ${kst(x.startAt)}  →  적재 ${kst(x.ingestedAt)}  (${x.origin} · ${x.sourceMatchId})`);
}
main().catch(e => { console.error(e.message?.slice(0,300)); process.exit(1); }).finally(() => p.$disconnect());

/**
 * 원본 보존 (`RawImport`).
 *
 * `CLAUDE.md` 3-A 1번 — **원본 응답을 버리지 않는다.**
 *
 * 저장 규칙
 * - 같은 내용을 다시 받으면 **새 행을 만들지 않고** `fetchCount`/`lastFetchedAt`만 올린다.
 * - 내용이 **달라지면 새 행**을 추가한다(append-only). 이전 원본을 덮어쓰지 않는다.
 *   30일 갱신 재수집이 과거 원본을 지워 버리면 원본 보존이 깨진다.
 * - **요청 헤더는 저장하지 않는다.** API 키가 저장소에 들어갈 경로 자체를 없앤다.
 */
import { prisma, type Prisma } from '@sacloud/db'
import { contentHash } from '@sacloud/nexon'

export interface StoreRawInput {
  source: string
  endpoint: string
  sourceId: string
  requestParams: Record<string, string>
  httpStatus: number
  raw: unknown
  migrationVersion: string
}

export interface StoreRawResult {
  id: string
  /** 새 원본인가 (내용이 바뀌었거나 처음 받은 경우) */
  isNew: boolean
  contentHash: string
}

export async function storeRaw(input: StoreRawInput): Promise<StoreRawResult> {
  const hash = contentHash(input.raw)
  const now = new Date()

  const existing = await prisma.rawImport.findUnique({
    where: {
      source_endpoint_sourceId_migrationVersion_contentHash: {
        source: input.source,
        endpoint: input.endpoint,
        sourceId: input.sourceId,
        migrationVersion: input.migrationVersion,
        contentHash: hash,
      },
    },
    select: { id: true },
  })

  if (existing) {
    await prisma.rawImport.update({
      where: { id: existing.id },
      data: { fetchCount: { increment: 1 }, lastFetchedAt: now },
    })
    return { id: existing.id, isNew: false, contentHash: hash }
  }

  const created = await prisma.rawImport.create({
    data: {
      source: input.source,
      endpoint: input.endpoint,
      sourceId: input.sourceId,
      requestParams: input.requestParams as Prisma.InputJsonValue,
      httpStatus: input.httpStatus,
      raw: (input.raw ?? null) as Prisma.InputJsonValue,
      migrationVersion: input.migrationVersion,
      contentHash: hash,
      fetchedAt: now,
      firstFetchedAt: now,
      lastFetchedAt: now,
      fetchCount: 1,
    },
    select: { id: true },
  })

  return { id: created.id, isNew: true, contentHash: hash }
}

/** 정규화가 끝난 원본에 표시를 남긴다 (변환 전/후 구분) */
export async function markNormalized(rawImportId: string): Promise<void> {
  await prisma.rawImport.update({
    where: { id: rawImportId },
    data: { normalizedAt: new Date() },
  })
}

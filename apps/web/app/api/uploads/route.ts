import { prisma } from '@sacloud/db'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { badRequest, guard, ok, unauthorized } from '@/lib/server/respond'
import { currentUserId } from '@/lib/server/session'
import { toKstIso } from '@/lib/server/format'

/**
 * POST /api/uploads — 이미지 업로드
 *
 * 개발 단계에서는 `public/uploads/`에 파일로 저장한다.
 * **운영에서는 이대로 쓰면 안 된다** — 서버가 여러 대가 되거나 재배포되면 파일이 사라진다.
 * 오브젝트 스토리지 연동은 Phase 10(운영)에서 다룬다.
 *
 * 안전장치
 * - **허용된 이미지 형식만** 받는다. 확장자가 아니라 Content-Type을 본다.
 * - 파일명은 클라이언트가 준 것을 쓰지 않고 **새로 만든다.**
 *   원래 이름을 그대로 쓰면 경로 조작(`../`)이나 실행 가능한 확장자가 섞여 들어올 수 있다.
 * - 크기 상한을 둔다. 원본의 실제 상한은 `[미확인]`이라 우리가 정한 값이다.
 */

const MAX_BYTES = 5 * 1024 * 1024

/** 허용 형식 → 확장자 */
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export async function POST(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return badRequest('파일이 없습니다')

    const extension = ALLOWED[file.type]
    if (!extension) return badRequest('지원하지 않는 이미지 형식입니다')
    if (file.size > MAX_BYTES) return badRequest('파일이 너무 큽니다 (최대 5MB)')

    const name = `${randomBytes(16).toString('hex')}.${extension}`
    const directory = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, name), Buffer.from(await file.arrayBuffer()))

    const url = new URL(`/uploads/${name}`, request.url).toString()
    const upload = await prisma.upload.create({
      data: { url, ownerKey: `user:${userId}`, userId, byteSize: file.size, mimeType: file.type },
    })

    return ok({ id: upload.id, url: upload.url, created_at: toKstIso(upload.createdAt) })
  })
}

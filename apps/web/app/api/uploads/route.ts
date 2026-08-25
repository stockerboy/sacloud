import { prisma } from '@sacloud/db'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { badRequest, fail, guard, ok, unauthorized } from '@/lib/server/respond'
import { currentUserId } from '@/lib/server/session'
import { toKstIso } from '@/lib/server/format'

/**
 * POST /api/uploads — 이미지 업로드
 *
 * 개발 단계에서는 `public/uploads/`에 파일로 저장한다.
 * **운영에서는 이대로 쓰면 안 된다** — 서버가 여러 대가 되거나 재배포되면 파일이 사라진다.
 * 오브젝트 스토리지 연동은 아직 없다.
 *
 * ── 운영에서는 아예 받지 않는다 (D-147)
 *   Vercel 같은 서버리스 환경의 파일 시스템은 읽기 전용이라 `writeFile` 이 그대로 터진다.
 *   사용자에게 정체불명의 500 을 주는 대신 **준비되지 않았다고 분명히** 알린다.
 *   오브젝트 스토리지가 붙으면 이 가드를 지우고 그쪽으로 보낸다.
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

    /* 운영에서는 로컬 디스크에 쓰지 않는다. 저장소가 붙기 전까지는 명확히 거절한다 */
    if (process.env.NODE_ENV === 'production' && process.env.SACLOUD_LOCAL_UPLOADS !== 'allow') {
      return fail(503, '이미지 업로드는 아직 준비되지 않았습니다')
    }

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

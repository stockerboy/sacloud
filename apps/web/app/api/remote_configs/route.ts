import { okPublic, guard } from '@/lib/server/respond'
import { buildConfigs } from '@/lib/server/configs'

/**
 * GET /api/remote_configs — 원격 설정.
 *
 * 원본의 정확한 구조는 `[미확인]`이다. 계약에서는 `/infos`의 `configs`와 같은
 * 키-값 형태로 확정했고, 여기서도 같은 값을 내려준다.
 * 원본과 동일함이 검증되지 않았다.
 */
export async function GET() {
  /* 길게(3600초) — 원격 설정은 운영자가 손대야 바뀐다 (D-240) */
  return guard(async () => okPublic(await buildConfigs(), undefined, 3600))
}

import { z } from 'zod'

/**
 * **깨진 알 목록** (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * 화면은 「이 알이 깨졌나」를 알아야 마크를 빛나게 하고 가린 지표를 연다.
 * 그런데 깨짐의 **근거**(누가 · 언제 · 왜)는 공개할 것이 아니다 —
 * 관리자 강제인지 본인 인증인지는 관리자만 본다 (`GET /api/admin/eggs`).
 *
 * 그래서 공개 쪽은 **식별자만** 준다. 목록이 곧 상태다.
 *
 * ── 왜 통째로 주는가
 *   대상마다 물으면 갤러리 한 화면에 수십 번 왕복한다. 지금 깨진 알은 손에 꼽고,
 *   전부 깨져도 클랜 수백 · 선수 수천 줄의 **문자열 배열**이라 한 번에 받는 편이 싸다.
 *   그것이 부담이 될 만큼 깨지면 그때 리그별로 자르면 된다 (`league` 파라미터 자리를 비워 뒀다).
 */
export const EggBrokenList = z.object({
  /** 알이 깨진 선수 `Player.id` */
  players: z.array(z.string()),
  /** 알이 깨진 클랜 `Clan.slug` */
  clans: z.array(z.string()),
})
export type EggBrokenList = z.infer<typeof EggBrokenList>

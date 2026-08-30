/**
 * `@sacloud/nexon` — 넥슨 Open API 클라이언트 + 정규화기.
 *
 * DB를 모른다. 화면도 모른다. 여기서 나온 값을 `apps/worker`가 스테이징에 넣는다.
 * 사양은 `docs/NEXON_INGEST_SPEC.md`.
 */
export * from './config'
export * from './endpoints'
export * from './errors'
export * from './hash'
export * from './normalize'
export * from './rateLimit'
export * from './schemas'
export * from './client'
export * from './supplyLeagueScope'
/** 테스트·스모크용 픽스처 (실제 넥슨 응답이 아니다. 키 수령 후 실응답으로 교체한다) */
export * from './fixtures/sample'
export {
  classifyWeapon,
  killSignalsOf,
  aggregateKillsFromBattleLog,
  hitSignalsOf,
  WEAPON_CODE,
  WEAPON_CLASSIFIER_VERSION,
  WEAPON_KILL_KEYS,
  EXCLUDED_KILL_KEYS,
  type WeaponRole,
  type WeaponSignals,
  type WeaponVerdict,
  type BattleLogEvent,
} from './weapon'
/** 좌표 기반 포지션 판정 (D-174). 무기 판정과 같은 BattleLog 를 쓰지만 보는 필드가 다르다 */
export * from './position'
export * from './roundSide'
export * from './roundState'
export * from './duel'
/** 클랜 지표 다섯 — 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 (SITE_SPEC_V2 5-5절) */
export * from './clanRound'
/** 플레이스타일 바의 재료 — 진영별 오프닝 관여 · 첫 교전 지연 · 자리 흩어짐 (사양 8절 · D-211) */
export * from './playstyle'

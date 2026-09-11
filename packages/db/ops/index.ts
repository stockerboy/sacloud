/**
 * 운영 로직 — CLI(`apps/worker`)와 관리자 화면(`apps/web`)이 **같은 코드**를 쓴다.
 *
 * 로그를 찍지 않고 결과만 돌려준다. 화면에 어떻게 보여 줄지는 호출부가 정한다.
 */
export * from './season'
export * from './clan'
export * from './legacySource'
export * from './legacyImport'
export * from './accountSecurity'
export * from './supplyClans'
export * from './supplyMatches'
export * from './supplyRosters'
export * from './matchTimeAffiliation'
/* 「뛴 팀」과 「등록 소속」을 가르는 단일 기준 (2026-09-07 · 1순위 오염 차단) */
export * from './affiliationTrust'
export * from './currentMembership'
export * from './supplyPlayerLink'
export * from './supplyPlayerProfiles'
export * from './supplyLineupComplete'
export * from './supplySnapshotAudit'
export * from './supplyMirrorParse'
export * from './supplyMirrorImport'
export * from './iplRoster'
export * from './iplSanplyPurgeLog'
export * from './iplSanplyGuard'
export * from './supplyRollup'
/* 병영수첩 원문 적재 — ★창구와 CLI 가 같은 함수를 쓴다★ (O-051) */
export * from './barracksStore'
export * from './independentLeague'
export * from './mirrorFreeze'
export * from './collectorLease'
/* ★집계 임대★ (Part 9) */
export * from './season0Lease'

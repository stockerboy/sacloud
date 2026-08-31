/**
 * **마지막으로 열산을 치운 시점의 IPL 명단** (D-210 후속).
 *
 * ── 왜 이 파일이 있나
 *   명단에 클랜이 하나 들어오면 그 클랜의 **과거 열산 경기가 소급해서 「IPL끼리」가 된다.**
 *   2026-08-31 에 실제로 그렇게 63건이 생겼다 — 08-30 에 치웠는데 08-31 에 명단이
 *   자랐고, **아무도 청소를 다시 돌리지 않았다.** 사람이 기억해야 하는 절차는 잊힌다.
 *
 *   그래서 마지막 청소 때의 명단을 **코드에 박아 둔다.** 지금 명단과 다르면
 *   `nexon ipl-sanply-check` 가 **잡을 실패시키고**, 테스트도 빨개진다.
 *   고치는 법은 아래 「명단을 바꿨다면」 그대로다.
 *
 * ── 명단을 바꿨다면 (클랜 추가·제거. 티어 이동은 해당 없다)
 *   ```
 *   node scripts/prod-run.mjs ipl-sanply-purge              # 미리보기 — 몇 건인지 본다
 *   node scripts/prod-run.mjs ipl-sanply-purge --confirm    # 백업 뜨고 치운다
 *   ```
 *   치우고 나면 그 명령이 **여기에 붙여 넣을 블록을 그대로 찍어 준다.** 그것으로 갈아 끼운다.
 *
 * ── 이 값을 손으로만 고치지 마라
 *   지문만 바꾸고 운영을 안 치우면 **알람만 끄는 것**이 된다. 그러라고 만든 파일이 아니다.
 *   운영을 치울 수 없는 사정이 있으면 `note` 에 그 사실을 적어 남긴다 (3-A 6번).
 */
import { diffIplRosterFingerprint, iplRosterFingerprint } from './iplRoster'

export interface IplSanplyPurgeRecord {
  /** 그때의 명단 지문 (`iplRosterFingerprint()`) */
  fingerprint: string
  /** 언제 치웠나 (ISO) */
  purgedAt: string
  /** 어느 리그를 치웠나 */
  targetLeagueSlug: string
  /** 그때 지운 경기 수 */
  matchesDeleted: number
  /** 그때 열산에서 뺀 등록행 수 */
  leagueClansExpelled: number
  /** 사람이 읽을 메모 — 왜 그 상태인지 */
  note: string
}

/**
 * **마지막 청소 기록.** 운영(`sanply`)을 실제로 치운 뒤에만 갱신한다.
 *
 * 2026-08-31: 명단이 39곳 → 43곳으로 자란 뒤 남아 있던 63건을 치웠다.
 * 63건 전부가 그때 새로 들어온 `recent.wct-`(friendliness1) · `idylic`(EVOA) 이 낀
 * **과거** 경기였다 — 가드가 샌 것이 아니라 청소가 명단을 못 따라간 것이다.
 */
export const IPL_SANPLY_LAST_PURGE: IplSanplyPurgeRecord = {
  fingerprint:
    '43:01025606089,042222741,4473,DooLii,EVOA,IrenecIan,JJUN,JosenFam,OhMyLoVe,Reverse3,' +
    'Ssnake,WebClanGood,adelioz,adgeodud20,backspace00,ckdals2457,clanhanul,dbghr,dregonlif,' +
    'eee07,fdd8,friendliness1,hanbi0302,ircroger,jjangkangsu,kelly123,lee2,luverduck12,minjihun,' +
    'pigforever,rokasa12,saffggaaz,ssdko,terry9532,tispfgid,tjdwlsqhrdl,uava01,valentina2,wdasdw,' +
    'wweqeqtd123,yoonsh1971,ytsys,zzim1',
  purgedAt: '2026-08-31T10:02:20.965Z',
  targetLeagueSlug: 'sanply',
  matchesDeleted: 63,
  leagueClansExpelled: 2,
  note:
    '명단이 39 → 43곳으로 자란 뒤 소급 발생한 63건을 치웠다. ' +
    '백업 apps/worker/backups/iplSanply/ipl-sanply-purge-63건-1788138140965.json',
}

export interface IplRosterDrift {
  /** 지금 명단의 지문 */
  current: string
  /** 마지막 청소 때의 지문 */
  purged: string
  /** 다르면 true — **청소를 다시 돌려야 한다** */
  drifted: boolean
  /** 그 뒤로 명단에 들어온 병영수첩 slug */
  added: string[]
  /** 그 뒤로 명단에서 빠진 병영수첩 slug */
  removed: string[]
}

/**
 * 명단이 마지막 청소 뒤로 바뀌었는가. **DB 를 읽지 않는다** — 코드끼리만 본다.
 *
 * 그래서 CI 에서 DB 없이도 돌고, 운영이 아직 안 치워졌다는 사실을
 * **저장소 상태만으로** 알 수 있다.
 */
export function iplRosterDriftSinceLastPurge(
  record: IplSanplyPurgeRecord = IPL_SANPLY_LAST_PURGE,
): IplRosterDrift {
  const current = iplRosterFingerprint()
  const { added, removed } = diffIplRosterFingerprint(record.fingerprint, current)
  return {
    current,
    purged: record.fingerprint,
    drifted: current !== record.fingerprint,
    added,
    removed,
  }
}

/**
 * 청소를 마친 뒤 이 파일에 붙여 넣을 블록. `ipl-sanply-purge --confirm` 이 찍는다.
 *
 * 사람에게 "기억해서 고쳐라" 라고 말하는 대신 **고칠 것을 그대로 준다.**
 */
export function nextPurgeRecordSnippet(input: {
  targetLeagueSlug: string
  matchesDeleted: number
  leagueClansExpelled: number
  backupPath: string | null
}): string {
  const fingerprint = iplRosterFingerprint()
  return [
    'packages/db/ops/iplSanplyPurgeLog.ts 의 IPL_SANPLY_LAST_PURGE 를 이것으로 바꾼다:',
    '',
    'export const IPL_SANPLY_LAST_PURGE: IplSanplyPurgeRecord = {',
    `  fingerprint: '${fingerprint}',`,
    `  purgedAt: '${new Date().toISOString()}',`,
    `  targetLeagueSlug: '${input.targetLeagueSlug}',`,
    `  matchesDeleted: ${input.matchesDeleted},`,
    `  leagueClansExpelled: ${input.leagueClansExpelled},`,
    `  note: '백업 ${input.backupPath ?? '(지울 것이 없어 만들지 않음)'}',`,
    '}',
  ].join('\n')
}

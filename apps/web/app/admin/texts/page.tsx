import type { Metadata } from 'next'

import { boardNoticeKey, clanRankNotesKey } from '@/lib/server/queries/siteText'
import { TextsEditor } from './TextsEditor'

/**
 * ★★화면 글 고치기 — 관리자★★ (2026-09-21 사장님)
 *
 * > 「아니 글을 왜 이렇게 써놨어 이거 ★내가 관리자 권한으로 수정 할 수 있게 해줘★ 글」
 *
 * ── 무엇을 고칠 수 있나
 *   아래 `SLOTS` 에 적힌 자리들이다. ★자리를 여기 적어 두는 이유★ 는,
 *   관리자가 «어디에 나오는 글인지» 를 알아야 고칠 수 있기 때문이다.
 *   열쇠(`key`)만 보여 주면 무슨 글인지 알 수 없다.
 *
 * ── ★비우면 되돌아간다★
 *   본문을 비우고 저장하면 ★코드에 박힌 원래 글★ 이 다시 나온다.
 *   잘못 고쳤을 때 돌아올 길이 있어야 한다.
 */
export const metadata: Metadata = { title: '화면 글 — 운영 관리' }

export const dynamic = 'force-dynamic'

/** 고칠 수 있는 자리 — ★어디에 나오는 글인지★ 를 같이 적는다 */
const SLOTS: { key: string; where: string; hint: string }[] = [
  {
    key: boardNoticeKey(),
    where: '게시판(인기·자유) 맨 위 공지 카드',
    hint: '에타에서 광고가 있던 자리입니다. 제목 한 줄 + 본문. 비워 두면 공지 게시판의 맨 위 글이 대신 나옵니다.',
  },
  {
    key: clanRankNotesKey('nolink'),
    where: 'IPL 클랜랭킹 맨 위',
    hint: '지금 「PL → IPL 전환 안내」와 「리그 참가 신청」이 나오는 자리입니다.',
  },
  {
    key: clanRankNotesKey('supply'),
    where: 'PL 클랜랭킹 맨 위',
    hint: '비워 두면 아무것도 안 나옵니다.',
  },
  {
    key: clanRankNotesKey('cpl'),
    where: 'CPL 클랜랭킹 맨 위',
    hint: 'CPL 참가 클랜 명단 위에 나옵니다.',
  },
  {
    key: clanRankNotesKey('sanply'),
    where: '열산리그 고용가능클랜 맨 위',
    hint: '비워 두면 아무것도 안 나옵니다.',
  },
]

export default function AdminTextsPage() {
  return (
    <div className="section-stack">
      <div>
        <h1 className="display text-xl">화면 글</h1>
        <p className="mt-2 text-[13px] leading-[1.7] text-meta">
          사이트에 적히는 안내문을 여기서 고칩니다. 저장하면 바로 반영됩니다(최대 1분).
          <br />
          제목 한 줄, 그 아래 본문입니다. <b className="text-text">본문은 줄바꿈 한 번이 한 항목</b>
          이고 화면에서 앞에 · 가 붙습니다.
          <br />
          <b className="text-text">본문을 비우고 저장하면</b> 원래 글로 돌아갑니다.
        </p>
      </div>
      <TextsEditor slots={SLOTS} />
    </div>
  )
}

'use client'

/** 필 탭 — 링크형 (선수 기록실/지난시즌 · 클랜 기록실/클랜원/지난시즌). 시안의 `PLAYER_TABS` */
import Link from 'next/link'
import { pillStyle } from './tokens'

export interface PillTab {
  label: string
  href: string
}

export function PillTabs({ tabs, current, top = 20 }: { tabs: readonly PillTab[]; current: string; top?: number }) {
  return (
    <div style={{ paddingTop: top, display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
      {tabs.map((tab) => {
        const on = current === tab.href || (tab.href !== '' && current.startsWith(`${tab.href}/`) && !tabs.some((t) => t !== tab && current.startsWith(t.href) && t.href.length > tab.href.length))
        return (
          <Link key={tab.href} href={tab.href} style={pillStyle(on)} aria-current={on ? 'page' : undefined}>
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

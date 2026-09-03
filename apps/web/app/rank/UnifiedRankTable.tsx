import Link from 'next/link'
import type { UnifiedRankRow } from '@/lib/server/queries/unifiedRank'

/** 리그 이름 — 화면에 쓰는 말 (O-040 에서 통일한 것) */
const LEAGUE_LABEL: Record<string, string> = {
  supply: 'SPL',
  nolink: 'IPL',
  sanply: '10mountain',
}

/**
 * 통합 랭킹 표.
 *
 * ★근거를 같이 보여 준다★ — 「어느 리그에서 몇 등이었나」를 줄마다 적는다.
 * 점수만 보이면 「왜 저 사람이 위인가」를 알 수 없고, 그게 사장님이 걱정하신
 * **「사람들이 신뢰를 안할까봐」** 다.
 */
export function UnifiedRankTable({ rows }: { rows: UnifiedRankRow[] }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="mb-2 text-[20px] font-normal leading-none text-[var(--color-text-strong,#f2f4f8)] font-[family-name:var(--font-display)]">
        통합 랭킹
      </h2>
      <p className="mb-6 text-[13px] leading-relaxed text-meta">
        리그마다 몇 등인지를 점수로 바꿔 리그 무게를 곱해 더합니다. 한 리그만 잘해서는 위로
        오지 않습니다.
      </p>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-meta">아직 순위가 없습니다.</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li
              key={row.playerId}
              className="flex gap-3 border-t border-[var(--color-line-soft,#3a4067)] py-3.5"
            >
              <span className="w-10 shrink-0 text-[13px] leading-6 text-accent tabular-nums font-[family-name:var(--font-num)]">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={`/player/${row.playerId}`}
                  className="block truncate text-[15px] leading-6 text-[var(--color-text-strong,#f2f4f8)] hover:text-accent"
                >
                  {row.playerName}
                </Link>
                {/* ★근거★ — 어느 리그에서 몇 등이었나 */}
                <span className="mt-1 block text-[12px] leading-relaxed text-meta">
                  {row.parts
                    .map(
                      (p) =>
                        `${LEAGUE_LABEL[p.league] ?? p.league} ${p.rank}/${p.total} ×${p.weight}`,
                    )
                    .join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-[15px] leading-6 text-[var(--color-text,#d9dbe4)] tabular-nums font-[family-name:var(--font-num)]">
                {Math.round(row.score)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

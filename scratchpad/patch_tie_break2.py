# -*- coding: utf-8 -*-
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, 'apps/worker/src/jobs/unifiedProject.ts')
s = open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
pairs = [
    ('      const payload = payloadByKey.get(h.matchKey)\n',
     '      const got = payloadByKey.get(h.matchKey)\n      const payload = got?.payload\n'),
    ('      return payload === undefined ? [] : [{ matchKey: h.matchKey, payload, subjects: h.subjects, clanNos: h.clanNos }]',
     '      return payload === undefined || got === undefined\n        ? []\n        : [{ matchKey: h.matchKey, payload, payloadSubject: got.subject, subjects: h.subjects, clanNos: h.clanNos }]'),
    ('      const norm = normalizeBarracksMatch(row.payload)\n      if (!norm.ok) {\n        noteUnclassified(row.matchKey, norm.code, norm.reason)\n        continue\n      }\n      const m = norm.match\n',
     '      /* ★승수가 같으면 원문을 긁은 클랜의 승/패로 승자를 정한다★ (2026-09-23 · payload 의 result_wdl 은 그 subject 의 것이다) */\n      const tieWinner = TIE_BREAK_BY_RESULT_WDL\n        ? tieWinnerOf(row.payloadSubject, row.payload, clanBySlug, namesByClanId)\n        : null\n      const norm = normalizeBarracksMatch(row.payload, { tieWinner })\n      if (!norm.ok) {\n        noteUnclassified(row.matchKey, norm.code, norm.reason)\n        continue\n      }\n      const m = norm.match\n      if (tieWinner && m.redWins === m.blueWins) result.tieBroken += 1\n'),
    ('    unclassified: [],\n', '    unclassified: [],\n    tieBroken: 0,\n'),
]
for a, b in pairs:
    a = a.replace('\n', nl); b = b.replace('\n', nl)
    if b in s and a not in s:
        print('skip'); continue
    assert s.count(a) == 1, (a[:50], s.count(a))
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')

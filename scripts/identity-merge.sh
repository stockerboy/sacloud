#!/bin/sh
# ★한 계정이 두 명으로 쪼개지는 것을 매시 자동으로 합친다★ (2026-09-24 사장님 「딥스롯 이 사람 병영수첩엔 저 사람인데
#   기록 또 갈라지는데 뭐야」 → 「이런 계정 한두개가 아닌듯」 → 「반드시 갈라지는 기록들 한계정으로 모아」)
#
# ── 왜 갈라지나
#   병영수첩이 같은 사람에게 계정번호를 ★두 꼴★ 로 준다 —
#   클랜 명단 API 는 10진수(userNexonSn), 배틀로그 API 는 16진수(strUsn).
#   둘을 안 이으면 클랜 명단에서 온 줄과 배틀로그에서 온 줄이 ★서로 다른 사람★ 이 된다.
#   특히 ★닉네임을 바꾸면★(예: 딥스롯→씨２) 옛 3rd.supply 미러 줄은 이름이 안 따라오고,
#   새 병영수첩 줄이 새 이름으로 따로 생겨 기록이 갈라진다.
#
# ── 다리는 있다
#   `BarracksClanMember` 한 줄이 두 꼴(strUsn·userNexonSn)을 같이 담는다.
#   `barracks-identity-merge` 잡이 그 다리로 ★기록이 많은 쪽을 남기고★ 합친다(worker/src/jobs/barracksIdentityMerge.ts).
#
# ── 왜 이 파일이 필요한가
#   그 잡은 2026-09-20 에 ★한 번★ 사람 손으로 돌았을 뿐 예약이 없었다.
#   그날 뒤로 닉을 바꾼 사람마다 새 분신이 계속 쌓였다 — 실측(2026-09-24): 2,615명이 쪼개져 있었다.
#   ★한 번 더 손으로 돌아 봤자 또 쌓인다.★ 매시(roster.sh 가 새 명부를 받은 뒤) 자동으로 돈다.
#
# 이미 합친 사람은 다시 돌려도 ★조용히 넘어간다★(찾은 사람이 하나뿐이면 이름만 다시 맞추고 끝) — 안전하다.
set -e
cd /root/sacloud
. /root/sacloud.env
export SACLOUD_DB_SESSION_POOLER=1
pnpm --filter @sacloud/worker nexon barracks-identity-merge --limit 20000 --confirm
# ★2026-09-25 — 클랜 명단에 없는 계정도 합친다★ (사장님 「계정 갈라진거 엄청 많아 (…) 전수 조사해서 제발 고쳐줘」)
#   위 잡은 명단(BarracksClanMember)에 있는 1만 명만 다리로 쓴다. 명단 밖 병영 선수 3,352명은 옛 3rd.supply 줄과 못 이어
#   실측 649쌍이 갈라진 채였다. 이 잡은 배틀로그 원문에서 계정 짝(str_usn↔user_nexon_sn)을 뽑아 잇는다 (worker/src/jobs/accountSplitMerge.ts).
#   되돌리기 파일: data/player-merge/account-<날짜>.jsonl
pnpm --filter @sacloud/worker nexon account-split-merge --confirm

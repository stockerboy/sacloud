#!/bin/sh
# ★자기소개 인증을 읽어 준다★ (2026-09-20 사장님)
#
# 사람이 사이트에서 「확인」 을 누르면 ★표시만 남는다.★ 병영수첩은 서버에서
# 부르면 403 이라, 진짜 브라우저를 띄울 수 있는 ★여기(VPS)★ 가 대신 읽는다.
#
# ⚠ ★자주 돌아야 한다★ — 사람이 「확인」 을 누르고 기다리는 중이다.
#   1분마다 돌리되, 볼 사람이 없으면 몇 초 만에 끝난다 (질의 한 번).
# ⚠ 무거운 잡과 겹쳐도 괜찮다 — 읽는 것은 넥슨이고 DB 는 거의 안 건드린다.
set -u
cd /root/sacloud
. /root/sacloud.env
exec pnpm --filter @sacloud/worker nexon intro-verify --confirm

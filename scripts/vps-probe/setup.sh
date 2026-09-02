#!/bin/bash
# 병영수첩 탐침 — 새 우분투 서버에 붙자마자 돈다 (2026-09-02 · 지시 #8)
#
# ── 무엇을
#   Ubuntu 24.04 x86_64 한 대에 구글 크롬(x86) + xvfb + Node 24 를 깔고,
#   저장소를 clone 하지 않고 탐침 스크립트 두 개만 curl 로 받아 **헤드풀로 한 번씩** 돌린다.
#     ① scripts/barracks-probe.mjs          puppeteer 판 (--enable-automation 붙음 · webdriver=true)
#     ② scripts/vps-probe/bare-chrome-probe.mjs   맨 크롬 판 (CDP 를 파이프로 · 자동화 플래그 없음)
#   둘의 결과를 /root/probe-result.json 에 나란히 적고 stdout 에도 찍는다.
#
# ── 어디서 도나
#   · Vultr cloud-init user-data 로 **이 파일을 그대로** 넣는다 (run.mjs 가 그렇게 한다).
#     cloud-init 은 첫 부팅에 root 로 한 번 돌린다. 로그는 /var/log/cloud-init-output.log 와 /root/probe-setup.log
#   · 사람이 SSH 로 붙어 `bash setup.sh` 로 돌려도 된다.
#
# ── 결과를 어떻게 가져가나
#   run.mjs 는 SSH 를 안 쓴다(키 관리가 일이고, 사장님 PC 는 소켓이 자주 끊긴다). 대신 이 서버가
#   결과 파일을 **무작위 토큰이 붙은 경로**로 8080 포트에 잠깐 내놓는다:
#       http://<서버IP>:8080/<토큰>/probe-result.json
#   토큰은 run.mjs 가 만들어 아래 __PROBE_TOKEN__ 자리에 넣는다. 서버는 몇 분 뒤 삭제된다.
#   결과에는 상태코드·크기·응답 앞 200자뿐이다 — 비밀값이 없다.
#
# ── 하지 않는 것
#   회피 플래그 · UA 위조 · 쿠키 조작 없음 (CLAUDE.md 3-A 5번). `--no-sandbox` 는 root 사정이다.
#   저장하지 않고 창구로 보내지 않는다. 요청은 방식당 3건, 2초 간격.

set -uo pipefail
export DEBIAN_FRONTEND=noninteractive
exec > >(tee -a /root/probe-setup.log) 2>&1

TOKEN="__PROBE_TOKEN__"
if [ "$TOKEN" = "__PROBE_TOKEN__" ] || [ -z "$TOKEN" ]; then TOKEN="manual"; fi
RAW_BASE="${PROBE_RAW_BASE:-https://raw.githubusercontent.com/stockerboy/sacloud/main/scripts}"
PUPPETEER_VERSION="${PUPPETEER_VERSION:-25.9.0}"
WORK=/root/probe
OUT_DIR="/root/probe-out/${TOKEN}"
PORT=8080

echo "=== 병영수첩 탐침 setup 시작 $(date -u +%FT%TZ) · token=${TOKEN}"

# ── 0. 1GB 짜리 서버일 수 있다. 크롬 두 번 띄우면 모자란다 — 스왑 2GB
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo "스왑 2GB 켬"
fi

# ── 1. 기본 패키지 + 가상 화면
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg jq xvfb fonts-noto-cjk python3 >/dev/null
echo "xvfb: $(command -v xvfb-run)"

# ── 2. Node 24 (NodeSource)
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" != "24" ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "node: $(node -v) · npm: $(npm -v)"

# ── 3. 구글 크롬 (x86_64 안정판)
if ! command -v google-chrome >/dev/null; then
  curl -fsSLo /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y -qq /tmp/chrome.deb >/dev/null
fi
CHROME=$(command -v google-chrome)
echo "chrome: ${CHROME} · $("$CHROME" --version 2>/dev/null)"

# ── 4. 탐침 스크립트 두 개 (저장소 clone 없이)
mkdir -p "$WORK" && cd "$WORK"
curl -fsSLo barracks-probe.mjs "${RAW_BASE}/barracks-probe.mjs"
curl -fsSLo bare-chrome-probe.mjs "${RAW_BASE}/vps-probe/bare-chrome-probe.mjs"
echo "받음: $(wc -c < barracks-probe.mjs)B barracks-probe.mjs · $(wc -c < bare-chrome-probe.mjs)B bare-chrome-probe.mjs"

# puppeteer 는 여기(서버 임시 폴더)에만. 시스템 크롬을 쓸 것이라 내장 크롬 내려받기는 건너뛴다
npm init -y >/dev/null
PUPPETEER_SKIP_DOWNLOAD=1 npm install --no-audit --no-fund --silent "puppeteer@${PUPPETEER_VERSION}"
echo "puppeteer ${PUPPETEER_VERSION} 설치됨"

# ── 5. 공인 IP
PUBLIC_IP=$(curl -s --max-time 15 https://api.ipify.org || echo unknown)
echo "공인 IP: ${PUBLIC_IP}"

export NODE_PATH="${WORK}/node_modules"
export PROBE_CHROME_PATH="$CHROME"
export PROBE_PUBLIC_IP="$PUBLIC_IP"
export PROBE_NO_SANDBOX=1

# ── 6. ① puppeteer 판 · 헤드풀 (xvfb)
echo "--- ① puppeteer 헤드풀"
xvfb-run -a --server-args='-screen 0 1280x900x24' \
  node barracks-probe.mjs --mode headful --out /root/probe-puppeteer.json || echo "① 스크립트 종료코드 $? (403 은 결과이지 실패가 아니다)"

sleep 2

# ── 7. ② 맨 크롬 판 · 헤드풀 (xvfb · CDP 파이프)
echo "--- ② 맨 크롬 (파이프)"
xvfb-run -a --server-args='-screen 0 1280x900x24' \
  node bare-chrome-probe.mjs --out /root/probe-bare.json || echo "② 스크립트 종료코드 $?"

# ── 8. 하나로 묶는다
[ -f /root/probe-puppeteer.json ] || echo '{"fatal":"① 결과 파일 없음","requests":[]}' > /root/probe-puppeteer.json
[ -f /root/probe-bare.json ] || echo '{"fatal":"② 결과 파일 없음","requests":[]}' > /root/probe-bare.json
jq -n \
  --arg ip "$PUBLIC_IP" \
  --arg chrome "$("$CHROME" --version 2>/dev/null || echo unknown)" \
  --slurpfile a /root/probe-puppeteer.json \
  --slurpfile b /root/probe-bare.json \
  '{ publicIp: $ip, chrome: $chrome, generatedAt: (now | todate), puppeteerHeadful: $a[0], bareChrome: $b[0] }' \
  > /root/probe-result.json

# ── 9. 결과를 크게 찍는다 — 사장님이 이 화면을 찍어 보내면 된다
BAR="=================================================================="
echo
echo "$BAR"
echo "==  병영수첩 탐침 결과  (공인 IP ${PUBLIC_IP})"
echo "$BAR"
jq -r '"==  puppeteer : " + (.puppeteerHeadful.requests | map("\(.id)=\(.status // "ERR")") | join(" · ")) + "   webdriver=\(.puppeteerHeadful.browser.navigatorWebdriver)"' /root/probe-result.json
jq -r '"==  맨 크롬   : " + (.bareChrome.requests | map("\(.id)=\(.status // "ERR")") | join(" · ")) + "   webdriver=\(.bareChrome.browser.navigatorWebdriver)"' /root/probe-result.json
echo "$BAR"
echo "==  200 = 열려 있다 · 403 = 막혔다.  전체 JSON 은 /root/probe-result.json"
echo "$BAR"
echo
cat /root/probe-result.json
echo

# ── 10. run.mjs(Vultr 자동화 · 옛 방식)로 만든 서버일 때만 잠깐 내놓는다.
#        사람이 콘솔에서 돌린 경우(token=manual)에는 **포트를 열지 않는다** — 화면에 찍힌 것으로 충분하다
if [ "$TOKEN" != "manual" ]; then
  mkdir -p "$OUT_DIR"
  cp /root/probe-result.json "$OUT_DIR/probe-result.json"
  command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q active && ufw allow "$PORT" >/dev/null 2>&1
  nohup python3 -m http.server "$PORT" --directory /root/probe-out >/root/probe-http.log 2>&1 &
  echo "=== 내놓음: http://${PUBLIC_IP}:${PORT}/${TOKEN}/probe-result.json"
fi
echo "=== setup 끝 $(date -u +%FT%TZ)"

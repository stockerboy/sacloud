/* 가로 넘침 범인 찾기 — 오른쪽 끝이 화면 폭을 넘는 요소들 (넘친 만큼 큰 순) */
(() => {
  const cw = document.documentElement.clientWidth
  const out = []
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    if (r.right > cw + 0.5 || r.left < -0.5) {
      out.push({ over: Math.round(r.right - cw), left: Math.round(r.left), w: Math.round(r.width), tag: el.tagName, cls: String(el.className).slice(0, 60), text: (el.textContent || '').trim().slice(0, 24) })
    }
  })
  out.sort((a, b) => b.over - a.over)
  return JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: cw, top: out.slice(0, 12) }, null, 1)
})()

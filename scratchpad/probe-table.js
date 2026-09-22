(() => {
  const head = [...document.querySelectorAll('div')].find((d) => {
    const t = d.textContent.trim();
    return t.startsWith('순위') && t.includes('클랜') && d.children.length >= 3 && d.children.length <= 8;
  });
  const cols = head ? [...head.children].map((c) => c.textContent.trim()).filter(Boolean) : [];
  const row1 = [...document.querySelectorAll('a[href*="/clan/"]')][0];
  const rowBox = row1 ? row1.closest('div[class*="flex"]')?.parentElement : null;
  return JSON.stringify({
    표머리: cols,
    라이벌있나: document.body.textContent.includes('라이벌'),
    승리칸있나: cols.includes('승리'),
    패배칸있나: cols.includes('패배'),
    표테두리: (() => {
      const box = document.querySelector('.mobile-bleed');
      if (!box) return '표 없음';
      const c = getComputedStyle(box);
      return `bg:${c.backgroundColor} border:${c.borderColor} shadow:${c.boxShadow.slice(0, 40)}`;
    })(),
  }, null, 1);
})()

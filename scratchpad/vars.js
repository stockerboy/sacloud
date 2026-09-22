(() => {
  const cs = getComputedStyle(document.documentElement)
  const names = ['--color-win-bg','--color-win-line','--color-lose-bg','--color-lose-line',
    '--spacing-leaguebar','--spacing-leaguebar-m','--layout-max','--sac-band','--sac-band-on']
  return names.map((n) => n + ' = ' + cs.getPropertyValue(n).trim()).join('\n')
})()

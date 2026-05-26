(() => {
  const keys = {
    billets: 'trinity-billet-sandbox-v5',
    players: 'trinity-player-profiles-v3',
    producedBats: 'trinity-produced-bats-v1',
    customBatModels: 'trinity-custom-bat-models-v1',
    orderJobs: 'trinity-order-jobs-v1',
    billingContacts: 'trinity-billing-contacts-v1',
  }
  const backupKey = 'trinity-local-recovery-backup-v1'

  function readJson(key) {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []

    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  const data = Object.fromEntries(
    Object.entries(keys).map(([name, key]) => [name, readJson(key)]),
  )
  const legacyBackup = readJson(backupKey)
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    href: window.location.href,
    legacyBackup,
    counts: Object.fromEntries(
      Object.entries(data).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0]),
    ),
    ...data,
  }
  const blob = new Blob([`${JSON.stringify(exportPayload, null, 2)}\n`], {
    type: 'application/json',
  })
  const link = document.createElement('a')

  link.href = URL.createObjectURL(blob)
  link.download = `trinity-local-recovery-${exportPayload.exportedAt
    .slice(0, 19)
    .replace(/[:T]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(link.href)
})()

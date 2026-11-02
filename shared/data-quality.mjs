export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function getOperationalDataQualityIssues(billets, players) {
  const issues = []
  const seenBarcodes = new Map()
  for (const billet of billets) {
    const barcode = String(billet.barcode ?? '').trim().toUpperCase()
    if (barcode) {
      const prior = seenBarcodes.get(barcode)
      if (prior) issues.push({ kind: 'duplicate_barcode', label: `Duplicate barcode ${barcode}`, recordId: billet.id })
      else seenBarcodes.set(barcode, billet.id)
    }
    const date = String(billet.deliveryDate ?? '').trim()
    if (date && (!isCalendarDate(date) || Number(date.slice(0, 4)) < 1900)) {
      issues.push({ kind: 'delivery_date', label: `${barcode || billet.id}: review delivery date ${date}`, recordId: billet.id })
    }
    if (typeof billet.weight === 'number' && (!Number.isFinite(billet.weight) || billet.weight <= 0)) {
      issues.push({ kind: 'weight', label: `${barcode || billet.id}: review weight ${billet.weight}`, recordId: billet.id })
    }
  }
  for (const player of players) {
    for (const bat of player.bats ?? []) {
      const length = Number(bat.length)
      if (bat.length !== '' && Number.isFinite(length) && (length < 20 || length > 40)) {
        issues.push({ kind: 'bat_length', label: `${player.playerName || player.id}: review ${length} in bat length`, recordId: player.id })
      }
    }
  }
  return issues
}

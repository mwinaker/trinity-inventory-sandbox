function cleanString(value) {
  return String(value ?? '').trim()
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase()
}

function normalizePersonKey(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isTruthy(value) {
  return value === true || ['true', '1', 'yes', 'on'].includes(cleanString(value).toLowerCase())
}

function contactMatchesPlayer(contact, playerName) {
  const playerKey = normalizePersonKey(playerName)
  if (!playerKey) return false

  return [contact?.name, ...(Array.isArray(contact?.playerNames) ? contact.playerNames : [])]
    .map((value) => normalizePersonKey(value))
    .filter(Boolean)
    .includes(playerKey)
}

export function needsSalesRepPlayerEmailProtection(payload = {}) {
  const playerEmail = normalizeEmail(payload.playerEmail)
  const salesRepEmail = normalizeEmail(payload.salesRepEmail)
  return Boolean(playerEmail && salesRepEmail && playerEmail === salesRepEmail)
}

export function protectSalesRepPlayerEmail(payload = {}, savedCrmContacts = []) {
  if (!needsSalesRepPlayerEmailProtection(payload)) return { ...payload }

  const protectedPayload = { ...payload }
  const playerEmail = cleanString(payload.playerEmail)
  const playerName = cleanString(payload.playerName || payload.customerName)
  const hasSavedPlayerAssociation = savedCrmContacts.some(
    (contact) =>
      normalizeEmail(contact?.email) === normalizeEmail(playerEmail) &&
      contactMatchesPlayer(contact, playerName),
  )

  if (!isTruthy(payload.billingDifferent) && !cleanString(payload.payerEmail)) {
    protectedPayload.payerEmail = playerEmail
  }

  if (!hasSavedPlayerAssociation) {
    protectedPayload.playerEmail = ''
  }

  return protectedPayload
}

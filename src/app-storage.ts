export type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const billetStorageKey = 'trinity-billet-sandbox-v5'
export const playerStorageKey = 'trinity-player-profiles-v3'
export const producedBatStorageKey = 'trinity-produced-bats-v1'
export const customBatModelStorageKey = 'trinity-custom-bat-models-v1'
export const orderJobStorageKey = 'trinity-order-jobs-v1'
export const billingContactStorageKey = 'trinity-billing-contacts-v1'
export const crmContactStorageKey = 'trinity-crm-sandbox-contacts-v1'
export const crmActiveOwnerStorageKey = 'trinity-crm-sandbox-active-owner-v1'
export const salesPortalSessionStorageKey = 'trinity-sales-portal-session-v1'
export const teamAccessTokenStorageKey = 'trinity-team-access-token-v1'
export const salesPortalOrderStorageKey = 'trinity-sales-portal-orders-v1'
export const legacyLocalStateBackupKey = 'trinity-local-recovery-backup-v1'

export const legacyLocalStateKeys = [
  billetStorageKey,
  playerStorageKey,
  producedBatStorageKey,
  customBatModelStorageKey,
  orderJobStorageKey,
  billingContactStorageKey,
  crmContactStorageKey,
  crmActiveOwnerStorageKey,
] as const

export function shouldUseLocalToolStorage(hostname: string) {
  return ['localhost', '127.0.0.1', ''].includes(hostname)
}

function getBrowserLocalStorage(): BrowserStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readStorageValue(storage: BrowserStorage | null, key: string) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStorageValue(
  storage: BrowserStorage | null,
  key: string,
  value: string,
) {
  try {
    storage?.setItem(key, value)
    return Boolean(storage)
  } catch {
    return false
  }
}

export function removeStorageValue(storage: BrowserStorage | null, key: string) {
  try {
    storage?.removeItem(key)
    return Boolean(storage)
  } catch {
    return false
  }
}

export function readLocalStorageValue(key: string) {
  return readStorageValue(getBrowserLocalStorage(), key)
}

export function writeLocalStorageValue(key: string, value: string) {
  return writeStorageValue(getBrowserLocalStorage(), key, value)
}

export function removeLocalStorageValue(key: string) {
  return removeStorageValue(getBrowserLocalStorage(), key)
}

export function readLocalStorageJson<T>(key: string, fallback: T): T {
  const stored = readLocalStorageValue(key)
  if (!stored) return fallback

  try {
    return JSON.parse(stored) as T
  } catch {
    removeLocalStorageValue(key)
    return fallback
  }
}

export function writeLocalStorageJson(key: string, value: unknown) {
  try {
    return writeLocalStorageValue(key, JSON.stringify(value))
  } catch {
    return false
  }
}

export function clearLegacyLocalToolState() {
  for (const key of [...legacyLocalStateKeys, legacyLocalStateBackupKey]) {
    removeLocalStorageValue(key)
  }
}

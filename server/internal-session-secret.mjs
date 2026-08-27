export const minimumInternalSessionSecretLength = 32

export function resolveInternalSessionSigning(environment = {}) {
  const configuredValue = environment.TRINITY_INTERNAL_SESSION_SECRET
  const trimmedValue = typeof configuredValue === 'string' ? configuredValue.trim() : ''

  if (!trimmedValue) {
    return {
      secret: '',
      source: 'missing',
      stable: false,
    }
  }

  if (trimmedValue.length < minimumInternalSessionSecretLength) {
    return {
      secret: '',
      source: 'dedicated_invalid',
      stable: false,
    }
  }

  return {
    secret: trimmedValue,
    source: 'dedicated_internal_secret',
    stable: true,
  }
}

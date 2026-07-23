import crypto from 'node:crypto'

export const teamAccessSessionHeaderName = 'X-Trinity-Team-Session'

export function normalizeTeamAccessPin(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 4)
}

export function isValidTeamAccessPin(value) {
  return /^\d{4}$/.test(String(value ?? '').trim())
}

export function createTeamAccessPin(randomInt = crypto.randomInt) {
  return String(randomInt(1000, 10000))
}

export function getTeamSessionTokenCandidates({ headerToken = '', cookieToken = '' } = {}) {
  return [...new Set([headerToken, cookieToken].map((value) => String(value ?? '').trim()).filter(Boolean))]
}

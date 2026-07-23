import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeamAccessPin,
  getTeamSessionTokenCandidates,
  isValidTeamAccessPin,
  normalizeTeamAccessPin,
  teamAccessSessionHeaderName,
} from '../server/team-access-pin.mjs'

test('team access PINs are exactly four numeric digits', () => {
  assert.equal(createTeamAccessPin(() => 1000), '1000')
  assert.equal(createTeamAccessPin(() => 9999), '9999')
  assert.equal(normalizeTeamAccessPin(' 12-34 '), '1234')
  assert.equal(normalizeTeamAccessPin('12a345'), '1234')
  assert.equal(isValidTeamAccessPin('1234'), true)
  assert.equal(isValidTeamAccessPin('0123'), true)
  assert.equal(isValidTeamAccessPin('123'), false)
  assert.equal(isValidTeamAccessPin('TRI-1234'), false)
})

test('team session tokens prefer the device header and fall back to the secure cookie', () => {
  assert.equal(teamAccessSessionHeaderName, 'X-Trinity-Team-Session')
  assert.deepEqual(
    getTeamSessionTokenCandidates({
      headerToken: 'device-token',
      cookieToken: 'cookie-token',
    }),
    ['device-token', 'cookie-token'],
  )
  assert.deepEqual(
    getTeamSessionTokenCandidates({
      headerToken: 'same-token',
      cookieToken: 'same-token',
    }),
    ['same-token'],
  )
})

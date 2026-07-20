import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCsvFile,
  getPlayerLevelFilterOptions,
  matchesPlayerLevelFilters,
} from '../src/player-profile-export.ts'

test('player level filters can include MLB and MILB in the same pass', () => {
  const selected = ['MLB', 'MILB']
  assert.equal(matchesPlayerLevelFilters('MLB', selected), true)
  assert.equal(matchesPlayerLevelFilters('MILB', selected), true)
  assert.equal(matchesPlayerLevelFilters('Indy Ball', selected), false)
  assert.equal(matchesPlayerLevelFilters('', []), true)
})

test('player level options are unique, put MLB and MILB first, and include unverified profiles', () => {
  assert.deepEqual(getPlayerLevelFilterOptions(['MILB', '', 'MLB', 'MILB', 'Indy Ball']), [
    'MLB',
    'MILB',
    'Indy Ball',
    'Level not verified',
  ])
})

test('CSV export quotes commas, quotes, and line breaks safely', () => {
  assert.equal(
    buildCsvFile(['Player', 'Notes'], [['Corey Seager', 'Uses "all black", 34-inch bats\nPrime birch']]),
    '"Player","Notes"\r\n"Corey Seager","Uses ""all black"", 34-inch bats\nPrime birch"',
  )
})

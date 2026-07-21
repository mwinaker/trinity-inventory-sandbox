import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCsvFile,
  getPlayerLevelFilterOptions,
  matchesPlayerLevelFilters,
  normalizePlayerLevel,
} from '../src/player-profile-export.ts'

test('player level filters can combine multiple levels in the same pass', () => {
  const selected = ['MLB', 'MILB', 'College']
  assert.equal(matchesPlayerLevelFilters('MLB', selected), true)
  assert.equal(matchesPlayerLevelFilters('MILB', selected), true)
  assert.equal(matchesPlayerLevelFilters('College', selected), true)
  assert.equal(matchesPlayerLevelFilters('High School', selected), false)
  assert.equal(matchesPlayerLevelFilters('Indy Ball/International', selected), false)
  assert.equal(matchesPlayerLevelFilters('', []), true)
})

test('player level filters expose all approved player levels', () => {
  assert.deepEqual(getPlayerLevelFilterOptions(), [
    'MLB',
    'MILB',
    'Indy Ball/International',
    'College',
    'High School',
  ])
})

test('legacy league names normalize without exposing arbitrary labels', () => {
  assert.equal(normalizePlayerLevel('Mexican League'), 'Indy Ball/International')
  assert.equal(normalizePlayerLevel('Honkbal Hoofdklasse'), 'Indy Ball/International')
  assert.equal(normalizePlayerLevel('International - WBC/Honkbalweek'), 'Indy Ball/International')
  assert.equal(normalizePlayerLevel('Minor League Baseball'), 'MILB')
  assert.equal(normalizePlayerLevel('NCAA Division I'), 'College')
  assert.equal(normalizePlayerLevel('College'), 'College')
  assert.equal(normalizePlayerLevel('High-school varsity'), 'High School')
  assert.equal(normalizePlayerLevel('HS'), 'High School')
  assert.equal(normalizePlayerLevel('unintended-label-123'), '')
})

test('CSV export quotes commas, quotes, and line breaks safely', () => {
  assert.equal(
    buildCsvFile(['Player', 'Notes'], [['Corey Seager', 'Uses "all black", 34-inch bats\nPrime birch']]),
    '"Player","Notes"\r\n"Corey Seager","Uses ""all black"", 34-inch bats\nPrime birch"',
  )
})

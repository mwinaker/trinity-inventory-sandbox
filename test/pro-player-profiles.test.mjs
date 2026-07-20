import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getKnownProPlayerAffiliation,
  normalizePlayerNameKey,
  parseManualBatOrderSegments,
  proPlayerAffiliations,
} from '../shared/pro-player-affiliations.mjs'

test('the curated directory accounts for every existing pro-player profile', () => {
  const existingProfileNames = [
    'Emilio Corona',
    'Andrew Jimenez',
    'Eric Bitonti',
    'Vladimir Guerrero Jr.',
    'Michael Toglia',
    'Greg Jones',
    'Michael Chavis',
    'Eli Pitts',
    'Will Banfield',
    'Marcus Chiu',
    'Aaron Schunk',
    'Andrew Navigato',
    'Jimmy Obertop',
    'Blake Bowen',
    'Joey Bart',
    'Harry Ford',
    'Brett Baty',
    'Brandon Compton',
    'Dylan Beavers',
    'Caleb Lomavita',
    'Drew Millas',
    'Adam Fogel',
    'Angel Mendoza',
    'Rio Ruiz',
    'Dallas Macias',
    'Korey Lee',
    'Michael Massey',
    'Nick Pratto',
    'Will Decker',
    'Alejandro Angel Lara',
    'Jacob Klinovsky',
    'Jordan Westburg',
    'Phillip Glasser',
    'Nick Peoples',
    'Kellen Strahm',
    'Aaron Zavala',
    'Jeremiah Jackson',
    'Luke Cantwell',
    'Blaine Crim',
    'Blake Sabol',
    'Yohel Pozo',
    'Delano Selassa',
    'Sharlon Schoop',
    'Caleb McNeely',
    'Andy Yerzy',
    'Damon Keith',
    'Tucker Mitchell',
    'Dylan Leek',
    'Austin Sargent',
    'Josh Lester',
    'Brandon Valenzuela',
    'Steven Lancia',
    'Zac Veen',
    'Will Bermudez',
    'Alika Williams',
    'Jacob Sharp',
    'Jakob Christian',
    'Jack Leeper',
    'Ethan Holliday',
    'Jackson Holliday',
    'Corey Seager',
  ]

  assert.equal(Object.keys(proPlayerAffiliations).length, 61)
  assert.deepEqual(
    existingProfileNames.filter((name) => !getKnownProPlayerAffiliation(name)),
    [],
  )
  assert.deepEqual(getKnownProPlayerAffiliation('Corey Seager'), {
    levelOfPlay: 'MLB',
    currentClub: 'Texas Rangers',
    mlbOrganization: 'Texas Rangers',
    affiliationVerifiedAt: '2026-07-19',
    note: '',
  })
  assert.equal(normalizePlayerNameKey('Vladimir Guerrero Jr.'), 'vladimir guerrero')
})

test('Michael Chavis manual Shopify note becomes two bat-order lines totaling nine bats', () => {
  const segments = parseManualBatOrderSegments(
    'Michael Chavis (5) 34"/31 • cup • clear gloss barrel/ cherry handle/ black logo (4) 33.5"/31 • cup • black barrel/ clear gloss handle/ white logo sig. on file to etch',
    'JB19L',
  )

  assert.equal(segments.length, 2)
  assert.equal(segments.reduce((total, segment) => total + segment.quantity, 0), 9)
  assert.match(segments[0].summary, /^5 × 34"\/31 oz JB19L/)
  assert.match(segments[1].summary, /^4 × 33\.5"\/31 oz JB19L/)
})

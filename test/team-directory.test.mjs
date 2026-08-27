import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canTeamMemberAccessToolSection,
  getTeamMemberByEmail,
  isAdminTeamMember,
  isSalesTeamMember,
  isTeamToolMember,
  trinityAdminEmails,
  trinityTeamMembers,
} from '../shared/team-directory.mjs'

test('team directory keeps canonical full names and legacy first-name aliases', () => {
  const stefan = getTeamMemberByEmail('STEFAN@TRINITYBATS.COM')
  const nick = getTeamMemberByEmail('nick@trinitybats.com')
  const henry = getTeamMemberByEmail('henry@trinitybats.com')

  assert.equal(stefan?.name, 'Stefan Panayiotou')
  assert.deepEqual(stefan?.aliases, ['Stefan'])
  assert.equal(nick?.name, 'Nick Nastrini')
  assert.deepEqual(nick?.aliases, ['Nick'])
  assert.equal(henry?.name, 'Henry Martinez')
  assert.deepEqual(henry?.aliases, ['Henry'])
})

test('Stefan is an admin and Henry is excluded from sales ownership', () => {
  const stefan = getTeamMemberByEmail('stefan@trinitybats.com')
  const nick = getTeamMemberByEmail('nick@trinitybats.com')
  const henry = getTeamMemberByEmail('henry@trinitybats.com')

  assert.equal(isAdminTeamMember(stefan), true)
  assert.equal(isSalesTeamMember(stefan), true)
  assert.equal(nick?.role, 'sales')
  assert.equal(isSalesTeamMember(nick), true)
  assert.equal(henry?.role, 'production')
  assert.equal(isAdminTeamMember(henry), false)
  assert.equal(isSalesTeamMember(henry), false)
  assert.equal(isTeamToolMember(henry), true)
  assert.equal(canTeamMemberAccessToolSection(henry, 'production'), true)
  assert.equal(canTeamMemberAccessToolSection(henry, 'sales'), false)
  assert.equal(canTeamMemberAccessToolSection(nick, 'production'), false)
  assert.equal(canTeamMemberAccessToolSection(nick, 'inventory'), true)
  assert.equal(canTeamMemberAccessToolSection(stefan, 'production'), true)
  assert.equal(
    trinityTeamMembers.filter(isSalesTeamMember).some((member) => member.email === henry?.email),
    false,
  )
})

test('administrator access is restricted to the approved four-person allowlist', () => {
  const expectedAdminEmails = [
    'keith@trinitybats.com',
    'jeremy@trinitybats.com',
    'matt@trinitybats.com',
    'stefan@trinitybats.com',
  ]
  const actualAdminEmails = trinityTeamMembers
    .filter(isAdminTeamMember)
    .map((member) => member.email)

  assert.deepEqual(trinityAdminEmails, expectedAdminEmails)
  assert.deepEqual(actualAdminEmails, expectedAdminEmails)

  const unapprovedAdminRole = {
    name: 'Unapproved Admin',
    email: 'unapproved@trinitybats.com',
    aliases: [],
    role: 'admin',
  }
  assert.equal(isAdminTeamMember(unapprovedAdminRole), false)
  assert.equal(canTeamMemberAccessToolSection(unapprovedAdminRole, 'production'), false)
})

test('restricted roles preserve the designed section boundaries', () => {
  const sections = ['inventory', 'orders', 'production', 'sales', 'crm', 'players', 'models', 'costs']
  const salesSections = ['inventory', 'orders', 'sales', 'crm', 'players', 'models', 'costs']
  const productionSections = ['inventory', 'production', 'players', 'models', 'costs']

  for (const member of trinityTeamMembers.filter((candidate) => candidate.email)) {
    const accessibleSections = sections.filter((section) =>
      canTeamMemberAccessToolSection(member, section),
    )

    if (isAdminTeamMember(member)) {
      assert.deepEqual(accessibleSections, sections, member.name)
    } else if (member.role === 'production') {
      assert.deepEqual(accessibleSections, productionSections, member.name)
    } else {
      assert.deepEqual(accessibleSections, salesSections, member.name)
    }
  }
})

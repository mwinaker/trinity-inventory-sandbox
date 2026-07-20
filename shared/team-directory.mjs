export const trinityTeamMembers = Object.freeze([
  {
    name: 'Keith Frye',
    email: 'keith@trinitybats.com',
    aliases: ['Keith'],
    role: 'admin',
  },
  {
    name: 'Daniel Cope',
    email: 'daniel@trinitybats.com',
    aliases: ['Daniel'],
    role: 'sales',
  },
  {
    name: 'Shane Telfer',
    email: 'shane@trinitybats.com',
    aliases: ['Shane'],
    role: 'sales',
  },
  {
    name: 'Steve Panayiotou',
    email: 'steve@trinitybats.com',
    aliases: ['Steve', 'Steve P.', 'Steve P'],
    role: 'sales',
  },
  {
    name: 'Jeremy Maddox',
    email: '',
    key: 'jeremy-maddox',
    aliases: [],
    role: 'sales',
  },
  {
    name: 'Jeremy McKee',
    email: 'jeremy@trinitybats.com',
    aliases: [],
    role: 'admin',
  },
  {
    name: 'Matt Winaker',
    email: 'matt@trinitybats.com',
    aliases: ['Matt'],
    role: 'admin',
  },
  {
    name: 'Stefan Panayiotou',
    email: 'stefan@trinitybats.com',
    aliases: ['Stefan'],
    role: 'admin',
  },
  {
    name: 'Henry Martinez',
    email: 'henry@trinitybats.com',
    aliases: ['Henry'],
    role: 'production',
  },
  {
    name: 'Nick Nastrini',
    email: 'nick@trinitybats.com',
    aliases: ['Nick'],
    role: 'sales',
  },
  {
    name: 'Scott Tubbs',
    email: 'scott@trinitybats.com',
    aliases: ['Scott'],
    role: 'sales',
  },
  {
    name: 'Brandon McIlwain',
    email: 'brandon@trinitybats.com',
    aliases: ['Brandon'],
    role: 'sales',
  },
])

export function isAdminTeamMember(member) {
  return member?.role === 'admin'
}

export function isSalesTeamMember(member) {
  return member?.role === 'sales' || member?.role === 'admin'
}

export function getTeamMemberByEmail(email) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  return trinityTeamMembers.find((member) => member.email === normalizedEmail) ?? null
}

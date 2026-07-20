export type TrinityTeamRole = 'admin' | 'sales' | 'production'

export type TrinityTeamMember = {
  name: string
  email: string
  key?: string
  aliases: string[]
  role: TrinityTeamRole
}

export const trinityTeamMembers: readonly TrinityTeamMember[]

export function isAdminTeamMember(
  member: TrinityTeamMember | null | undefined,
): boolean

export function isSalesTeamMember(
  member: TrinityTeamMember | null | undefined,
): boolean

export function getTeamMemberByEmail(email: string): TrinityTeamMember | null

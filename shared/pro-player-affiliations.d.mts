export type KnownProPlayerAffiliation = {
  levelOfPlay: string
  currentClub: string
  mlbOrganization: string
  affiliationVerifiedAt: string
  note: string
}

export type ManualBatOrderSegment = {
  quantity: number
  length: string
  weight: string
  model: string
  details: string
  summary: string
}

export const proPlayerAffiliations: Record<string, KnownProPlayerAffiliation>
export function normalizePlayerNameKey(value: unknown): string
export function getKnownProPlayerAffiliation(
  playerName: unknown,
): KnownProPlayerAffiliation | null
export function parseManualBatOrderSegments(
  note: unknown,
  fallbackModel?: string,
): ManualBatOrderSegment[]

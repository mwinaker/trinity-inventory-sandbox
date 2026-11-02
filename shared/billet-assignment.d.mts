export type AssignmentJob = {
  id: string
  assignedBilletId: string
  productionStatus: string
  productTitle?: string
  variantTitle?: string
  specs?: { wood?: string }
}
export type AssignmentBillet = {
  id: string
  status: string
  species: string
  weight?: number | ''
  grade?: string
  suitabilityCategories?: string[]
}
export function getBilletAssignmentConflict(input: {
  job: AssignmentJob | null | undefined
  nextBillet: AssignmentBillet | null | undefined
  allJobs: AssignmentJob[]
  expectedBilletId: string
}): string
export function getBilletAssignmentCandidate(
  job: AssignmentJob,
  billet: AssignmentBillet,
  assignedBilletIds?: Set<string>,
): { needsWeightCheck: boolean; needsGradeCheck: boolean } | null

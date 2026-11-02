export type AssignmentJob = {
  id: string
  assignedBilletId: string
  assignedBilletIds?: string[]
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
  expectedBilletIds?: string[]
}): string
export function getAssignedBilletIds(job: { assignedBilletId?: string; assignedBilletIds?: string[] } | null | undefined): string[]
export function getBilletAssignmentCandidate(
  job: AssignmentJob,
  billet: AssignmentBillet,
  assignedBilletIds?: Set<string>,
): { needsWeightCheck: boolean; needsGradeCheck: boolean } | null

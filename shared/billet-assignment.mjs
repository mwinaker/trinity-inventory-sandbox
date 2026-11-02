import { billetSpeciesOptions } from './species-options.mjs'
import { isActionableProductionJob, isProductionBatJob } from './production-queue.mjs'

const knownSpecies = new Set(billetSpeciesOptions.map((value) => value.toLowerCase()))

export function getAssignedBilletIds(job) {
  const ids = Array.isArray(job?.assignedBilletIds) ? job.assignedBilletIds : []
  return [...new Set([String(job?.assignedBilletId ?? '').trim(), ...ids.map((id) => String(id ?? '').trim())].filter(Boolean))]
}

function matchesPhysicalPurpose(job, billet) {
  const title = `${job.productTitle ?? ''} ${job.variantTitle ?? ''}`.toLowerCase()
  const categories = Array.isArray(billet.suitabilityCategories) ? billet.suitabilityCategories : []
  const isTrophy = /trophy|award|presentation/.test(title)
  if (categories.includes('Trophy')) return isTrophy
  if (isTrophy) return true
  if (/fungo/.test(title)) return !categories.includes('Trainer only')
  if (/train|short heavy|sledge|blade barrel|weighted skinny/.test(title)) return !categories.includes('Fungo only')
  return !categories.includes('Trainer only') && !categories.includes('Fungo only')
}

export function getBilletAssignmentConflict({ job, nextBillet, allJobs, expectedBilletId, expectedBilletIds }) {
  if (!job) return 'This production job no longer exists. Refresh the queue.'
  const actualIds = getAssignedBilletIds(job)
  const expectedIds = expectedBilletIds ?? (expectedBilletId ? [expectedBilletId] : [])
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
    return 'This job changed in another session. Refresh before assigning a billet.'
  }
  if (nextBillet && !isProductionBatJob(job)) {
    return 'Only bat jobs can receive a billet.'
  }
  if (nextBillet && !isActionableProductionJob(job)) {
    return 'A fulfilled, cancelled, or completed job cannot receive a new billet.'
  }
  if (!nextBillet) return ''
  if (nextBillet.status !== 'storage' && !actualIds.includes(nextBillet.id)) {
    return 'This billet is no longer in storage. Refresh the inventory.'
  }
  const otherJob = allJobs.find((item) => item.id !== job.id && getAssignedBilletIds(item).includes(nextBillet.id))
  if (otherJob) return 'This billet is already assigned to another production job.'
  const requestedWood = String(job.specs?.wood ?? '').trim().toLowerCase()
  if (knownSpecies.has(requestedWood) && String(nextBillet.species ?? '').trim().toLowerCase() !== requestedWood) {
    return 'The billet species does not match the order wood. Check the order before assigning.'
  }
  if (!matchesPhysicalPurpose(job, nextBillet)) {
    return 'This billet is reserved for a different bat purpose. Check its suitability before assigning.'
  }
  return ''
}

export function getBilletAssignmentCandidate(job, billet, assignedBilletIds = new Set()) {
  if (!isActionableProductionJob(job)) return null
  if (billet.status !== 'storage' || assignedBilletIds.has(billet.id)) return null
  const requestedWood = String(job.specs?.wood ?? '').trim().toLowerCase()
  if (knownSpecies.has(requestedWood) && String(billet.species ?? '').trim().toLowerCase() !== requestedWood) return null
  if (!matchesPhysicalPurpose(job, billet)) return null
  return {
    needsWeightCheck: typeof billet.weight !== 'number' || !Number.isFinite(billet.weight),
    needsGradeCheck: !billet.grade || billet.grade === 'Blem',
  }
}

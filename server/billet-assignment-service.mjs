import { getBilletAssignmentConflict } from '../shared/billet-assignment.mjs'

export async function performBilletAssignment({
  jobId, nextBilletId, expectedBilletId, operator, store, now = () => new Date().toISOString(),
}) {
  const jobs = await store.listJobs()
  const job = jobs.find((item) => item.id === jobId)
  const previousBilletId = String(job?.assignedBilletId ?? '').trim()
  const [nextBillet, previousBillet] = await Promise.all([
    nextBilletId ? store.loadBillet(nextBilletId) : null,
    previousBilletId ? store.loadBillet(previousBilletId) : null,
  ])
  if (nextBilletId && !nextBillet) return { status: 409, message: 'This billet was not found. Refresh the inventory.' }
  if (previousBilletId && !previousBillet) return { status: 409, message: 'The previously assigned billet was not found. Reconcile this job before changing it.' }
  const conflict = getBilletAssignmentConflict({ job, nextBillet, allJobs: jobs, expectedBilletId })
  if (conflict) return { status: 409, message: conflict }
  if (previousBilletId === nextBilletId && (!nextBillet || nextBillet.status === 'production')) {
    return { status: 200, job, billet: nextBillet }
  }

  const changedAt = now()
  const updatedJob = {
    ...job,
    assignedBilletId: nextBilletId,
    updatedAt: changedAt,
    billetAssignmentHistory: previousBilletId === nextBilletId
      ? (Array.isArray(job.billetAssignmentHistory) ? job.billetAssignmentHistory : [])
      : [
          ...(Array.isArray(job.billetAssignmentHistory) ? job.billetAssignmentHistory.slice(-49) : []),
          { at: changedAt, fromBilletId: previousBilletId, toBilletId: nextBilletId, by: operator },
        ],
  }
  const previousIsUsedElsewhere = jobs.some((item) => item.id !== jobId && item.assignedBilletId === previousBilletId)
  const saved = []
  try {
    // Shopify metaobjects are separate writes; retain originals for compensation.
    saved.push(() => store.saveJob(job))
    await store.saveJob(updatedJob)
    if (nextBillet) {
      saved.push(() => store.saveBillet(nextBillet))
      await store.saveBillet({ ...nextBillet, status: 'production' })
    }
    if (previousBillet && previousBilletId !== nextBilletId && !previousIsUsedElsewhere) {
      saved.push(() => store.saveBillet(previousBillet))
      await store.saveBillet({ ...previousBillet, status: 'storage' })
    }
    const [verifiedJob, verifiedNext, verifiedPrevious] = await Promise.all([
      store.loadJob(jobId),
      nextBilletId ? store.loadBillet(nextBilletId) : null,
      previousBillet && previousBilletId !== nextBilletId && !previousIsUsedElsewhere
        ? store.loadBillet(previousBilletId)
        : null,
    ])
    if (verifiedJob?.assignedBilletId !== nextBilletId ||
        (nextBilletId && verifiedNext?.status !== 'production') ||
        (previousBillet && previousBilletId !== nextBilletId && !previousIsUsedElsewhere && verifiedPrevious?.status !== 'storage')) {
      throw new Error('Shopify did not confirm the billet assignment.')
    }
    await store.syncJob(updatedJob)
    return { status: 200, job: verifiedJob, billet: verifiedNext }
  } catch (error) {
    const restoreErrors = []
    for (const restore of saved.reverse()) {
      try { await restore() } catch (restoreError) { restoreErrors.push(restoreError) }
    }
    try { await store.syncJob(job) } catch (restoreError) { restoreErrors.push(restoreError) }
    if (restoreErrors.length > 0) {
      throw new Error('Billet assignment could not be verified and the automatic restore failed. Stop and reconcile the job and billet in Shopify.')
    }
    throw error
  } finally {
    store.invalidate()
  }
}

import { getAssignedBilletIds, getBilletAssignmentConflict } from '../shared/billet-assignment.mjs'
import { normalizePlayerNameKey } from '../shared/pro-player-affiliations.mjs'

const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((id, index) => id === b[index])

function matchingProProfile(job, players) {
  const list = Array.isArray(players) ? players : []
  const jobName = normalizePlayerNameKey(job.playerName)
  const linked = job.playerProfileId ? list.filter((player) => player.id === job.playerProfileId) : []
  const matches = linked.length ? linked : list.filter((player) => jobName && normalizePlayerNameKey(player.playerName) === jobName)
  if (matches.length !== 1) return null
  const profile = matches[0]
  if (jobName && normalizePlayerNameKey(profile.playerName) !== jobName) return null
  if (profile.profileKind !== 'Player' || !/^(MLB|MILB|Indy Ball\/International|Free Agent)$/i.test(String(profile.levelOfPlay ?? '').trim())) return null
  return profile
}

export async function performBilletAssignments({
  jobId, nextBilletIds, expectedBilletIds, operator, store, source = 'manual', imageSha256 = '',
  now = () => new Date().toISOString(),
}) {
  const jobs = await store.listJobs()
  const job = jobs.find((item) => item.id === jobId)
  if (!job) return { status: 409, message: 'This production job no longer exists. Refresh the queue.' }
  const currentIds = getAssignedBilletIds(job)
  const expectedIds = Array.isArray(expectedBilletIds) ? expectedBilletIds : []
  const nextIds = Array.isArray(nextBilletIds) ? nextBilletIds.map((id) => String(id ?? '').trim()) : []
  if (!sameIds(currentIds, expectedIds)) return { status: 409, message: 'This job changed in another session. Refresh before assigning billets.' }
  if (nextIds.some((id) => !id) || new Set(nextIds).size !== nextIds.length) return { status: 400, message: 'Billet numbers must be unique and nonempty.' }
  if (nextIds.length > Number(job.quantity || 1)) return { status: 409, message: 'More billets were listed than bats on this production line. Review the sheet before assigning.' }

  const involvedIds = [...new Set([...currentIds, ...nextIds])]
  const records = await Promise.all(involvedIds.map((id) => store.loadBillet(id)))
  const billetsById = new Map(involvedIds.map((id, index) => [id, records[index]]))
  if (currentIds.some((id) => !billetsById.get(id))) return { status: 409, message: 'A previously assigned billet was not found. Reconcile this job before changing it.' }
  if (nextIds.some((id) => !billetsById.get(id))) return { status: 409, message: 'A billet was not found. Refresh the inventory.' }
  for (const id of nextIds) {
    const conflict = getBilletAssignmentConflict({
      job, nextBillet: billetsById.get(id), allJobs: jobs, expectedBilletId: currentIds[0] || '', expectedBilletIds: currentIds,
    })
    if (conflict) return { status: 409, message: conflict }
  }
  if (!nextIds.length && currentIds.length && jobs.some((other) => other.id !== jobId && getAssignedBilletIds(other).some((id) => currentIds.includes(id)))) {
    return { status: 409, message: 'A billet is linked to another job. Reconcile the duplicate before releasing it.' }
  }

  const players = store.listPlayers ? await store.listPlayers() : []
  const profile = matchingProProfile(job, players)
  const savedAssignment = (Array.isArray(profile?.productionBilletAssignments) ? profile.productionBilletAssignments : [])
    .find((item) => item.jobId === job.id)
  const expectedNumbers = nextIds.map((id) => billetsById.get(id)?.barcode || id)
  const needsProfileSync = Boolean(profile && (nextIds.length
    ? !savedAssignment || !sameIds(savedAssignment.billetIds ?? [], nextIds) || !sameIds(savedAssignment.billetNumbers ?? [], expectedNumbers)
    : savedAssignment))
  const needsStatus = nextIds.some((id) => billetsById.get(id)?.status !== 'production')
  if (sameIds(currentIds, nextIds) && !needsStatus && !needsProfileSync) {
    await store.syncJob(job)
    return { status: 200, job, billets: nextIds.map((id) => billetsById.get(id)), profile }
  }
  const changedAt = now()
  const nextBillets = nextIds.map((id) => billetsById.get(id))
  const historyItem = {
    at: changedAt, fromBilletId: currentIds[0] || '', toBilletId: nextIds[0] || '', by: operator,
    ...(currentIds.length > 1 || nextIds.length > 1 ? { fromBilletIds: currentIds, toBilletIds: nextIds } : {}),
    ...(source === 'photo' ? { source, imageSha256 } : {}),
  }
  const updatedJob = {
    ...job,
    assignedBilletId: nextIds[0] || '',
    assignedBilletIds: nextIds,
    assignedBilletBarcodes: nextBillets.map((billet) => billet.barcode || billet.id),
    updatedAt: changedAt,
    billetAssignmentHistory: sameIds(currentIds, nextIds)
      ? (Array.isArray(job.billetAssignmentHistory) ? job.billetAssignmentHistory : [])
      : [...(Array.isArray(job.billetAssignmentHistory) ? job.billetAssignmentHistory.slice(-49) : []), historyItem],
  }

  const updatedProfile = profile ? {
    ...profile,
    productionBilletAssignments: [
      ...(Array.isArray(profile.productionBilletAssignments) ? profile.productionBilletAssignments : [])
        .filter((item) => item.jobId !== job.id),
      ...(nextIds.length ? [{
        jobId: job.id,
        orderReference: job.orderReference || job.shopifyOrderName || job.shopifyDraftOrderName || '',
        billetIds: nextIds,
        billetNumbers: updatedJob.assignedBilletBarcodes,
        assignedAt: changedAt,
      }] : []),
    ],
  } : null
  const releasedIds = currentIds.filter((id) => !nextIds.includes(id) && !jobs.some((other) => other.id !== jobId && getAssignedBilletIds(other).includes(id)))
  const rollback = []
  try {
    rollback.push(() => store.saveJob(job))
    await store.saveJob(updatedJob)
    for (const id of nextIds) {
      const billet = billetsById.get(id)
      if (billet.status === 'production') continue
      rollback.push(() => store.saveBillet(billet))
      await store.saveBillet({ ...billet, status: 'production' })
    }
    for (const id of releasedIds) {
      const billet = billetsById.get(id)
      rollback.push(() => store.saveBillet(billet))
      await store.saveBillet({ ...billet, status: 'storage' })
    }
    if (updatedProfile && store.savePlayer) {
      rollback.push(() => store.savePlayer(profile))
      await store.savePlayer(updatedProfile)
    }
    const [verifiedJob, verifiedBillets, verifiedProfile] = await Promise.all([
      store.loadJob(jobId),
      Promise.all(involvedIds.map((id) => store.loadBillet(id))),
      updatedProfile && store.loadPlayer ? store.loadPlayer(profile.id) : null,
    ])
    const actual = new Map(involvedIds.map((id, index) => [id, verifiedBillets[index]]))
    if (!sameIds(getAssignedBilletIds(verifiedJob), nextIds) ||
        nextIds.some((id) => actual.get(id)?.status !== 'production') ||
        releasedIds.some((id) => actual.get(id)?.status !== 'storage') ||
        (updatedProfile && store.loadPlayer && !verifiedProfile?.productionBilletAssignments?.some((item) => item.jobId === jobId && sameIds(item.billetIds, nextIds)))) {
      throw new Error('Shopify did not confirm every billet assignment.')
    }
    await store.syncJob(updatedJob)
    return { status: 200, job: verifiedJob, billets: nextBillets, profile: verifiedProfile ?? updatedProfile }
  } catch (error) {
    const restoreErrors = []
    for (const restore of rollback.reverse()) {
      try { await restore() } catch (restoreError) { restoreErrors.push(restoreError) }
    }
    try { await store.syncJob(job) } catch (restoreError) { restoreErrors.push(restoreError) }
    if (restoreErrors.length) throw new Error('Billet assignment could not be verified and the automatic restore failed. Stop and reconcile the job, inventory, and player profile in Shopify.')
    throw error
  } finally {
    store.invalidate()
  }
}

export async function performBilletAssignment({ jobId, nextBilletId, expectedBilletId, operator, store, now }) {
  const result = await performBilletAssignments({
    jobId, nextBilletIds: nextBilletId ? [nextBilletId] : [], expectedBilletIds: expectedBilletId ? [expectedBilletId] : [],
    operator, store, now,
  })
  return { ...result, billet: result.billets?.[0] ?? null }
}

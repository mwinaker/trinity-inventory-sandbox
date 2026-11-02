import { performBilletAssignments } from './billet-assignment-service.mjs'

export async function applyProductionPhotoAssignments({ assignments, operator, imageSha256, store }) {
  const jobSnapshots = new Map()
  const billetSnapshots = new Map()
  const profileSnapshots = new Map()
  const players = store.listPlayers ? await store.listPlayers() : []
  for (const assignment of assignments) {
    const job = await store.loadJob(assignment.jobId)
    if (!job) return { status: 409, message: 'An order line changed. Refresh and upload the photo again.' }
    jobSnapshots.set(job.id, job)
    for (const id of [...assignment.expectedBilletIds, ...assignment.billetIds]) {
      if (!billetSnapshots.has(id)) billetSnapshots.set(id, await store.loadBillet(id))
    }
  }
  for (const player of players) profileSnapshots.set(player.id, player)

  const applied = []
  try {
    for (const assignment of assignments) {
      const result = await performBilletAssignments({
        jobId: assignment.jobId,
        nextBilletIds: assignment.billetIds,
        expectedBilletIds: assignment.expectedBilletIds,
        operator, source: 'photo', imageSha256, store,
      })
      if (result.status !== 200) {
        if (!applied.length) return result
        throw new Error(result.message)
      }
      applied.push(result)
    }
    return {
      status: 200,
      jobs: applied.map((item) => item.job),
      billetNumbers: [...new Set(applied.flatMap((item) => item.billets.map((billet) => billet.barcode || billet.id)))],
      playerProfiles: [...new Set(applied.map((item) => item.profile?.playerName).filter(Boolean))],
    }
  } catch (error) {
    if (!applied.length) throw error
    const failures = []
    for (const job of jobSnapshots.values()) {
      try { await store.saveJob(job) } catch (restoreError) { failures.push(restoreError) }
    }
    for (const billet of billetSnapshots.values()) {
      if (!billet) continue
      try { await store.saveBillet(billet) } catch (restoreError) { failures.push(restoreError) }
    }
    for (const item of applied) {
      if (!item.profile?.id) continue
      const original = profileSnapshots.get(item.profile.id)
      if (!original) continue
      try { await store.savePlayer(original) } catch (restoreError) { failures.push(restoreError) }
    }
    for (const job of jobSnapshots.values()) {
      try { await store.syncJob(job) } catch (restoreError) { failures.push(restoreError) }
    }
    store.invalidate()
    if (failures.length) throw new Error('Photo assignment stopped, but automatic restoration was incomplete. Stop and reconcile the affected order, billets, and profiles in Shopify.')
    throw error
  }
}

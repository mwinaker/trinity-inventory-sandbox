// Shopify's current lines define quantity and specifications. Historical draft jobs
// only supply internal metadata, never extra physical products or guessed line matches.
export function mergeCurrentPrintJobs(current, saved) {
  const notes = [...new Set(saved.map(job => job.internalNotes?.trim()).filter(Boolean))].join('\n\n')
  const attachments = [...new Map(saved.filter(job => job.internalAttachment).map(job => [job.internalAttachment.downloadUrl, job.internalAttachment])).values()]
  return current.map((job, index) => {
    const exact = saved.find(old => old.lineItemId === job.lineItemId)
    const source = exact || saved[0] || {}
    return {
      ...job,
      orderReference: job.orderReference || source.orderReference,
      salesRep: job.salesRep || source.salesRep,
      productionStatus: exact?.productionStatus || job.productionStatus,
      assignedBilletId: exact?.assignedBilletId || '',
      linkedProducedBatId: exact?.linkedProducedBatId || '',
      internalNotes: notes,
      additionalInternalAttachments: [...(job.additionalInternalAttachments || []), ...(index === 0 ? attachments : [])],
      internalAttachment: job.internalAttachment || attachments[index % Math.max(attachments.length, 1)] || null,
      // Retain the saved order-level selections, but don't match old lines by position.
      submissionSnapshot: index === 0 ? saved.find(old => old.submissionSnapshot)?.submissionSnapshot : undefined,
    }
  })
}

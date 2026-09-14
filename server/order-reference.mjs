export const referenceNamespace = '$app:trinity_references'
export const referenceAttribute = 'trinity_order_reference'
const ownerAttribute = 'trinity_reference_owner'
const referencePattern = /^T-\d{5}$/
const reservedTag = /^(?:T-\d{5}|T-REF-[DO]\d+)$/i
const referenceFields = `id name tags customAttributes { key value }`

export function getTrinityOrderReference(record) {
  const attributes = record?.customAttributes ?? record?.note_attributes ?? []
  const reference = record?.orderReference || attributes.find(a => (a.key ?? a.name) === referenceAttribute)?.value
  return referencePattern.test(reference ?? '') ? reference : ''
}

export function needsTrinityOrderReference(record) {
  const attributes = record?.customAttributes ?? record?.note_attributes ?? []
  return attributes.some(a => ['trinity_reference_version', referenceAttribute].includes(a.key ?? a.name))
}

function data(result) {
  if (result?.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '))
  return result?.data ?? result
}

export async function readReferenceResource(graphql, id) {
  if (!/^gid:\/\/shopify\/(DraftOrder|Order)\/[1-9]\d*$/.test(id)) throw new Error('A valid Shopify order or draft ID is required.')
  const result = data(await graphql(`query ReferenceResource($id: ID!) {
    node(id: $id) {
      ... on DraftOrder { ${referenceFields} status order { id } }
      ... on Order { ${referenceFields} }
    }
  }`, { id })).node
  if (!result) throw new Error(`Reference resource no longer exists: ${id}`)
  return result
}

// Numbers and source bindings are immutable, uniquely named Shopify records.
// The counter is only a starting hint; it is never the uniqueness authority.
export async function reserveOrderReference(store, ownerId) {
  await store.prepare?.()
  const existing = await store.readBinding(ownerId)
  if (existing) return verifyBinding(store, existing, ownerId)
  const sequence = await store.readSequence()
  if (!sequence || !/^\d+$/.test(sequence.value)) throw new Error('Trinity reference sequence is unavailable; it must never be reset automatically.')
  let candidate = Number(sequence.value) + 1
  if (!Number.isSafeInteger(candidate) || candidate < 1) throw new Error('Invalid Trinity reference counter.')
  for (let attempt = 0; attempt < 100 && candidate <= 99999; attempt++, candidate++) {
    const reference = `T-${String(candidate).padStart(5, '0')}`
    const claim = await store.claim(reference, ownerId)
    if (claim.ownerId !== ownerId) continue
    const binding = await store.bind(ownerId, reference)
    const assigned = await verifyBinding(store, binding, ownerId)
    // A racing retry may reserve an unused number. Keep that reservation forever.
    // Failure to advance the hint is safe: the immutable claims prevent reuse.
    await store.advanceSequence(Math.max(candidate, Number(assigned.slice(2)))).catch(() => {})
    return assigned
  }
  throw new Error(candidate > 99999 ? 'The five-digit reference sequence is exhausted. No number was reused.' : 'Reference reservation is busy; retry the existing draft. No invoice was released.')
}

async function verifyBinding(store, binding, ownerId) {
  if (binding.ownerId !== ownerId || !referencePattern.test(binding.reference) || binding.reference === 'T-00000') throw new Error('Invalid permanent Trinity reference binding.')
  const claim = await store.readClaim(binding.reference)
  if (!claim || claim.ownerId !== ownerId || claim.reference !== binding.reference) throw new Error('Trinity reference reservation does not match its owner. Invoice processing stopped.')
  return binding.reference
}

export const reservationType = '$app:trinity_reference_reservation'
const definitionPromises = new WeakMap()
export async function ensureReferenceDefinition(graphql) {
  if (!definitionPromises.has(graphql)) {
    const promise = (async () => {
      const existing = data(await graphql(`query ReferenceDefinition($type: String!) { metaobjectDefinitionByType(type: $type) { id } }`, { type: reservationType })).metaobjectDefinitionByType
      if (existing) return
      const created = data(await graphql(`mutation CreateReferenceDefinition($definition: MetaobjectDefinitionCreateInput!) { metaobjectDefinitionCreate(definition: $definition) { metaobjectDefinition { id } userErrors { field message code } } }`, {
        definition: { type: reservationType, name: 'Trinity permanent order reference', access: { admin: 'MERCHANT_READ' }, fieldDefinitions: [{ key: 'owner_id', name: 'Source order ID', type: 'single_line_text_field', required: true }, { key: 'reference', name: 'Reference', type: 'single_line_text_field', required: true }] },
      })).metaobjectDefinitionCreate
      if (!created.metaobjectDefinition && !created.userErrors?.every(e => e.code === 'TAKEN')) throw new Error(`Reference definition error: ${JSON.stringify(created.userErrors)}`)
    })().catch(error => { definitionPromises.delete(graphql); throw error })
    definitionPromises.set(graphql, promise)
  }
  await definitionPromises.get(graphql)
}

export function createReferenceStore(graphql) {
  const ownerHandle = id => {
    const match = /^gid:\/\/shopify\/(DraftOrder|Order)\/([1-9]\d*)$/.exec(id)
    if (!match) throw new Error('A valid Shopify source ID is required.')
    return `${match[1] === 'DraftOrder' ? 'draft' : 'order'}-${match[2]}`
  }
  const read = async handle => {
    const record = data(await graphql(`query ReferenceClaim($handle: MetaobjectHandleInput!) { metaobjectByHandle(handle: $handle) { id handle fields { key value } } }`, { handle: { type: reservationType, handle } })).metaobjectByHandle
    if (!record) return null
    return { id: record.id, ownerId: record.fields.find(f => f.key === 'owner_id')?.value, reference: record.fields.find(f => f.key === 'reference')?.value }
  }
  const create = async (handle, ownerId, reference) => {
    // metaobjectCreate is create-only. Never use upsert for a reservation.
    const existing = await read(handle)
    if (existing) return existing
    for (let attempt = 0; attempt < 5; attempt++) {
      let result
      try {
        result = data(await graphql(`mutation CreateReferenceClaim($metaobject: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $metaobject) { metaobject { id handle fields { key value } } userErrors { field message code } } }`, { metaobject: { type: reservationType, handle, fields: [{ key: 'owner_id', value: ownerId }, { key: 'reference', value: reference }] } })).metaobjectCreate
      } catch (error) {
        const saved = await read(handle)
        if (saved) return saved
        if (attempt === 4) throw error
        continue
      }
      if (result.metaobject) {
        // Shopify can suffix a racing create's handle instead of rejecting it.
        // Only the exact canonical handle owns the number; never use the suffix.
        const saved = await read(handle)
        if (saved) return saved
      } else if (!result.userErrors?.every(e => e.code === 'TAKEN')) {
        throw new Error(`Reference reservation failed: ${JSON.stringify(result.userErrors)}`)
      }
      const saved = await read(handle)
      if (saved) return saved
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
    }
    throw new Error('Reference reservation could not be confirmed. Invoice processing stopped.')
  }
  return {
    prepare: () => ensureReferenceDefinition(graphql),
    readBinding: id => read(ownerHandle(id)),
    readClaim: reference => read(reference.toLowerCase()),
    claim: (reference, id) => create(reference.toLowerCase(), id, reference),
    bind: (id, reference) => create(ownerHandle(id), id, reference),
    async readSequence() {
      return data(await graphql(`query ReferenceSequence { shop { id sequence: metafield(namespace: "${referenceNamespace}", key: "sequence") { value compareDigest } } }`)).shop.sequence
    },
    async advanceSequence(number) {
      const shop = data(await graphql(`query ReferenceSequence { shop { id sequence: metafield(namespace: "${referenceNamespace}", key: "sequence") { value compareDigest } } }`)).shop
      if (!shop.sequence || Number(shop.sequence.value) >= number) return
      const result = data(await graphql(`mutation AdvanceReferenceHint($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message code } } }`, { metafields: [{ ownerId: shop.id, namespace: referenceNamespace, key: 'sequence', type: 'number_integer', value: String(number), compareDigest: shop.sequence.compareDigest }] })).metafieldsSet
      if (result.userErrors?.length) throw new Error('Reference counter hint was not advanced.')
    },
  }
}

export function referenceStamp(resource, reference, ownerId) {
  if (!referencePattern.test(reference)) throw new Error('Invalid Trinity order reference.')
  const owner = /^gid:\/\/shopify\/(DraftOrder|Order)\/(\d+)$/.exec(ownerId)
  if (!owner) throw new Error('Invalid reference owner.')
  const attributes = (resource.customAttributes ?? []).filter(a => ![referenceAttribute, ownerAttribute, 'trinity_reference_version'].includes(a.key))
  return {
    customAttributes: [...attributes, { key: referenceAttribute, value: reference }, { key: ownerAttribute, value: ownerId }, { key: 'trinity_reference_version', value: '1' }],
    tags: [...(resource.tags ?? []).filter(t => !reservedTag.test(t)), reference, `T-REF-${owner[1] === 'DraftOrder' ? 'D' : 'O'}${owner[2]}`, ...(resource.id?.includes('/Order/') && resource.id !== ownerId ? [`T-REF-O${resource.id.split('/').pop()}`] : [])],
  }
}

async function stampResource(graphql, resource, reference, ownerId) {
  const stamp = referenceStamp(resource, reference, ownerId)
  if (JSON.stringify(stamp.customAttributes) === JSON.stringify(resource.customAttributes) && stamp.tags.length === resource.tags.length && stamp.tags.every(t => resource.tags.includes(t))) return { ...resource, orderReference: reference }
  const isDraft = resource.id.includes('/DraftOrder/')
  const result = data(await graphql(isDraft
    ? `mutation StampDraftReference($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { ${referenceFields} status order { id } } userErrors { field message } } }`
    : `mutation StampOrderReference($input: OrderInput!) { orderUpdate(input: $input) { order { ${referenceFields} } userErrors { field message } } }`,
  isDraft ? { id: resource.id, input: stamp } : { input: { id: resource.id, ...stamp } }))
  const payload = isDraft ? result.draftOrderUpdate : result.orderUpdate
  if (payload.userErrors?.length) throw new Error(`Reference saved but invoice not released: ${payload.userErrors.map(e => e.message).join('; ')}`)
  const saved = isDraft ? payload.draftOrder : payload.order
  if (getTrinityOrderReference(saved) !== reference || !saved.tags.includes(reference)) throw new Error('The saved invoice reference could not be verified.')
  return { ...saved, orderReference: reference }
}

async function findConvertedDraft(graphql, orderId) {
  let after = null
  do {
    const result = data(await graphql(`query ReferenceSourceDraft($after: String) {
      draftOrders(first: 100, after: $after, reverse: true, sortKey: UPDATED_AT, query: "status:completed") {
        nodes { id order { id } } pageInfo { hasNextPage endCursor }
      }
    }`, { after })).draftOrders
    const draft = result.nodes.find(d => d.order?.id === orderId)
    if (draft) return readReferenceResource(graphql, draft.id)
    after = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null
  } while (after)
  throw new Error('Cannot verify the source draft for this copied reference. Invoice processing stopped.')
}

export async function ensureTrinityOrderReference(graphql, id) {
  const resource = await readReferenceResource(graphql, id)
  let owner = resource
  if (id.includes('/Order/')) {
    const ownerId = resource.customAttributes.find(a => a.key === ownerAttribute)?.value
    if (ownerId && ownerId !== id) {
      let source
      try { source = await readReferenceResource(graphql, ownerId) } catch { /* A deleted or copied source requires finding the actual conversion. */ }
      owner = source?.order?.id === id ? source : await findConvertedDraft(graphql, id)
    }
  }
  const reference = await reserveOrderReference(createReferenceStore(graphql), owner.id)
  if (resource.status === 'COMPLETED') {
    if (!resource.order?.id) throw new Error('Completed draft is missing its order.')
    await stampResource(graphql, await readReferenceResource(graphql, resource.order.id), reference, owner.id)
    return { ...resource, orderReference: reference }
  }
  return stampResource(graphql, resource, reference, owner.id)
}

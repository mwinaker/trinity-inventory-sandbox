export const requiredOrderWebhookTopics = Object.freeze([
  'ORDERS_CREATE',
  'ORDERS_PAID',
  'ORDERS_UPDATED',
  'ORDERS_CANCELLED',
])

function cleanString(value) {
  return String(value ?? '').trim()
}

function normalizeTopic(value) {
  return cleanString(value).toUpperCase()
}

function normalizeUri(value) {
  return cleanString(value).replace(/\/+$/, '')
}

export function buildOrderWebhookUri(baseUrl) {
  const normalizedBaseUrl = normalizeUri(baseUrl)
  if (!normalizedBaseUrl) throw new Error('A public application URL is required for order webhooks.')

  let parsed
  try {
    parsed = new URL(normalizedBaseUrl)
  } catch {
    throw new Error('The public application URL for order webhooks must be a valid URL.')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('The public application URL for order webhooks must use HTTPS.')
  }

  return `${normalizedBaseUrl}/api/webhooks/orders`
}

function hasRequiredWebhook(subscriptions, topic, uri) {
  const normalizedTopic = normalizeTopic(topic)
  const normalizedUri = normalizeUri(uri)
  return subscriptions.some(
    (subscription) =>
      normalizeTopic(subscription?.topic) === normalizedTopic &&
      normalizeUri(subscription?.uri) === normalizedUri,
  )
}

function firstSubscriptionForTopic(subscriptions, topic) {
  const normalizedTopic = normalizeTopic(topic)
  return subscriptions.find(
    (subscription) => normalizeTopic(subscription?.topic) === normalizedTopic && cleanString(subscription?.id),
  )
}

export async function reconcileOrderWebhookSubscriptions({
  baseUrl,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  topics = requiredOrderWebhookTopics,
} = {}) {
  if (typeof listSubscriptions !== 'function') {
    throw new Error('A webhook subscription listing function is required.')
  }
  if (typeof createSubscription !== 'function') {
    throw new Error('A webhook subscription creation function is required.')
  }
  if (typeof updateSubscription !== 'function') {
    throw new Error('A webhook subscription update function is required.')
  }

  const uri = buildOrderWebhookUri(baseUrl)
  const requiredTopics = Array.from(new Set(topics.map(normalizeTopic).filter(Boolean)))
  const existing = await listSubscriptions(requiredTopics)
  const actions = []

  for (const topic of requiredTopics) {
    if (hasRequiredWebhook(existing, topic, uri)) {
      actions.push({ topic, action: 'verified' })
      continue
    }

    const existingForTopic = firstSubscriptionForTopic(existing, topic)
    if (existingForTopic) {
      await updateSubscription({ id: existingForTopic.id, uri })
      actions.push({ topic, action: 'updated', id: existingForTopic.id })
      continue
    }

    const created = await createSubscription({ topic, uri })
    actions.push({ topic, action: 'created', id: cleanString(created?.id) })
  }

  const verifiedSubscriptions = await listSubscriptions(requiredTopics)
  const missingTopics = requiredTopics.filter(
    (topic) => !hasRequiredWebhook(verifiedSubscriptions, topic, uri),
  )
  if (missingTopics.length > 0) {
    throw new Error(
      `Order webhook verification failed; missing ${missingTopics.join(', ')} at ${uri}.`,
    )
  }

  return {
    uri,
    subscriptions: verifiedSubscriptions.filter((subscription) =>
      hasRequiredWebhook([subscription], subscription?.topic, uri),
    ),
    actions,
  }
}

import crypto from 'node:crypto'

export const googleGmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

const googleTokenUrl = 'https://oauth2.googleapis.com/token'
const gmailSendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export function isGoogleWorkspaceInternalEmailConfigured(config = {}) {
  return Boolean(
    cleanString(config.clientId) &&
      cleanString(config.clientSecret) &&
      cleanString(config.refreshToken) &&
      normalizeEmail(config.from),
  )
}

export function createGoogleOAuthAuthorizationUrl({
  clientId,
  redirectUri,
  state,
  loginHint = '',
  hostedDomain = '',
} = {}) {
  const normalizedClientId = cleanString(clientId)
  const normalizedRedirectUri = cleanString(redirectUri)
  const normalizedState = cleanString(state)
  if (!normalizedClientId || !normalizedRedirectUri || !normalizedState) {
    throw new Error('Google OAuth client ID, redirect URI, and state are required.')
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', normalizedClientId)
  url.searchParams.set('redirect_uri', normalizedRedirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', googleGmailSendScope)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', normalizedState)
  if (cleanString(loginHint)) url.searchParams.set('login_hint', cleanString(loginHint))
  if (cleanString(hostedDomain)) url.searchParams.set('hd', cleanString(hostedDomain))
  return url.toString()
}

export async function exchangeGoogleOAuthCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')
  const payload = new URLSearchParams({
    client_id: cleanString(clientId),
    client_secret: cleanString(clientSecret),
    redirect_uri: cleanString(redirectUri),
    code: cleanString(code),
    grant_type: 'authorization_code',
  })
  if (![...payload.values()].every(Boolean)) {
    throw new Error('Google OAuth client ID, client secret, redirect URI, and code are required.')
  }

  const response = await fetchImpl(googleTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  })
  const body = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(`Google OAuth code exchange failed (${response.status}): ${readErrorMessage(body)}`)
  }
  if (!cleanString(body?.refresh_token)) {
    throw new Error('Google did not return a refresh token. Re-authorize with consent and try again.')
  }
  return body
}

export async function sendGoogleWorkspaceInternalEmail({
  clientId,
  clientSecret,
  refreshToken,
  from,
  to,
  subject,
  text,
  attachments = [],
  allowedDomains = [],
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.')
  if (!isGoogleWorkspaceInternalEmailConfigured({ clientId, clientSecret, refreshToken, from })) {
    throw new Error('Google Workspace internal email is not fully configured.')
  }

  const normalizedFrom = normalizeEmail(from)
  const normalizedRecipients = assertAllowedInternalRecipients(to, allowedDomains)
  if (!isAllowedInternalEmail(normalizedFrom, allowedDomains)) {
    throw new Error('Google Workspace sender must use an allowed internal domain.')
  }

  const tokenPayload = new URLSearchParams({
    client_id: cleanString(clientId),
    client_secret: cleanString(clientSecret),
    refresh_token: cleanString(refreshToken),
    grant_type: 'refresh_token',
  })
  const tokenResponse = await fetchImpl(googleTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenPayload.toString(),
  })
  const tokenBody = await readJsonResponse(tokenResponse)
  if (!tokenResponse.ok || !cleanString(tokenBody?.access_token)) {
    throw new Error(`Google OAuth token refresh failed (${tokenResponse.status}): ${readErrorMessage(tokenBody)}`)
  }

  const raw = buildGmailRawMessage({
    from: normalizedFrom,
    to: normalizedRecipients,
    subject,
    text,
    attachments,
  })
  const sendResponse = await fetchImpl(gmailSendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  const sendBody = await readJsonResponse(sendResponse)
  if (!sendResponse.ok) {
    throw new Error(`Google Workspace email send failed (${sendResponse.status}): ${readErrorMessage(sendBody)}`)
  }

  return sendBody
}

export function assertAllowedInternalRecipients(recipients, allowedDomains = []) {
  const normalizedRecipients = uniqueEmails(recipients)
  if (normalizedRecipients.length === 0) throw new Error('At least one internal email recipient is required.')
  const invalidRecipient = normalizedRecipients.find(
    (recipient) => !isAllowedInternalEmail(recipient, allowedDomains),
  )
  if (invalidRecipient) {
    throw new Error(`Refusing to send an internal notification to non-internal address: ${invalidRecipient}`)
  }
  return normalizedRecipients
}

export function isAllowedInternalEmail(email, allowedDomains = []) {
  const normalizedEmail = normalizeEmail(email)
  const domain = normalizedEmail.split('@')[1]
  const domains = new Set(
    (Array.isArray(allowedDomains) ? allowedDomains : [])
      .map((value) => cleanString(value).toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  )
  return Boolean(domain && domains.has(domain))
}

export function buildGmailRawMessage({ from, to, subject, text, attachments = [] } = {}) {
  const normalizedFrom = normalizeEmail(from)
  const normalizedRecipients = uniqueEmails(to)
  if (!normalizedFrom || normalizedRecipients.length === 0) {
    throw new Error('A sender and at least one recipient are required to build a Gmail message.')
  }

  const boundary = `trinity-${crypto.randomBytes(18).toString('hex')}`
  const parts = [
    `From: ${normalizedFrom}`,
    `To: ${normalizedRecipients.join(', ')}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(cleanString(text), 'utf8').toString('base64'),
  ]

  for (const attachment of normalizeAttachments(attachments)) {
    const filename = encodeFilenameParameter(attachment.filename)
    parts.push(
      `--${boundary}`,
      `Content-Type: application/octet-stream; name*=UTF-8''${filename}`,
      `Content-Disposition: attachment; filename*=UTF-8''${filename}`,
      'Content-Transfer-Encoding: base64',
      '',
      attachment.content,
    )
  }

  parts.push(`--${boundary}--`, '')
  return Buffer.from(parts.join('\r\n'), 'utf8').toString('base64url')
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return []
  return attachments.map((attachment) => {
    const filename = cleanString(attachment?.filename).replace(/[\r\n]+/g, ' ').slice(0, 140)
    const content = cleanString(attachment?.content).replace(/\s+/g, '')
    if (!filename || !content || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
      throw new Error('Internal email attachment is invalid.')
    }
    return { filename, content }
  })
}

function encodeHeaderValue(value) {
  const safeValue = cleanString(value).replace(/[\r\n]+/g, ' ')
  return `=?UTF-8?B?${Buffer.from(safeValue, 'utf8').toString('base64')}?=`
}

function encodeFilenameParameter(filename) {
  return encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

async function readJsonResponse(response) {
  const contentType = response.headers?.get?.('content-type') || ''
  const text = await response.text()
  if (!text) return {}
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      return { error: text }
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function readErrorMessage(body) {
  const message = cleanString(body?.error_description || body?.error?.message || body?.error)
  return message || 'No error detail returned by Google.'
}

function uniqueEmails(emails) {
  const values = Array.isArray(emails) ? emails : [emails]
  return Array.from(new Set(values.map(normalizeEmail).filter(Boolean)))
}

function normalizeEmail(value) {
  const email = cleanString(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanString(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildGmailRawMessage,
  createGoogleOAuthAuthorizationUrl,
  sendGoogleWorkspaceInternalEmail,
} from '../server/google-workspace-internal-email.mjs'

test('builds a Gmail MIME message that retains the internal attachment', () => {
  const raw = buildGmailRawMessage({
    from: 'matt@trinitybats.com',
    to: ['jeremy@trinitybats.com'],
    subject: 'Order #D321 submitted',
    text: 'The attached image is for production.',
    attachments: [{ filename: 'footprints.jpg', content: Buffer.from('image bytes').toString('base64') }],
  })

  const mime = Buffer.from(raw, 'base64url').toString('utf8')
  assert.match(mime, /To: jeremy@trinitybats\.com/)
  assert.match(mime, /Content-Disposition: attachment/)
  assert.match(mime, /footprints\.jpg/)
  assert.match(mime, /aW1hZ2UgYnl0ZXM=/)
})

test('sends through Gmail only after rejecting non-internal recipients', async () => {
  let fetchCalls = 0
  await assert.rejects(
    sendGoogleWorkspaceInternalEmail({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      from: 'matt@trinitybats.com',
      to: ['customer@example.com'],
      subject: 'not allowed',
      text: 'not allowed',
      allowedDomains: ['trinitybats.com'],
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('{}', { status: 200 })
      },
    }),
    /non-internal address/,
  )
  assert.equal(fetchCalls, 0)
})

test('refreshes the OAuth token and sends a Gmail message to internal recipients', async () => {
  const requests = []
  const response = await sendGoogleWorkspaceInternalEmail({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    from: 'matt@trinitybats.com',
    to: ['jeremy@trinitybats.com'],
    subject: 'Production order',
    text: 'Attachment included.',
    attachments: [{ filename: 'art.pdf', content: Buffer.from('PDF').toString('base64') }],
    allowedDomains: ['trinitybats.com'],
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'access-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ id: 'gmail-message-id' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.deepEqual(response, { id: 'gmail-message-id' })
  assert.equal(requests.length, 2)
  assert.match(requests[0].options.body, /grant_type=refresh_token/)
  assert.equal(requests[1].options.headers.Authorization, 'Bearer access-token')
  const gmailPayload = JSON.parse(requests[1].options.body)
  assert.match(Buffer.from(gmailPayload.raw, 'base64url').toString('utf8'), /art\.pdf/)
})

test('uses only the Gmail send permission in the OAuth authorization request', () => {
  const url = new URL(
    createGoogleOAuthAuthorizationUrl({
      clientId: 'client-id',
      redirectUri: 'https://trinity-billet-inventory.onrender.com/api/internal-email/google/callback',
      state: 'state-value',
      loginHint: 'matt@trinitybats.com',
      hostedDomain: 'trinitybats.com',
    }),
  )

  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.send')
  assert.equal(url.searchParams.get('hd'), 'trinitybats.com')
  assert.equal(url.searchParams.get('access_type'), 'offline')
})

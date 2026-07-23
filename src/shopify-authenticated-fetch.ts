type ShopifyIdTokenProvider = {
  idToken?: () => Promise<string>
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type ShopifyAuthenticatedFetchRuntime = {
  fetchImplementation?: FetchImplementation
  getIdTokenProvider?: () => ShopifyIdTokenProvider | undefined
  isAppBridgeEnabled?: () => boolean
  wait?: (milliseconds: number) => Promise<void>
  tokenRetryIntervalMs?: number
  tokenRetryTimeoutMs?: number
}

const defaultTokenRetryIntervalMs = 100
const defaultTokenRetryTimeoutMs = 5000

function getDefaultIdTokenProvider() {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { shopify?: ShopifyIdTokenProvider }).shopify
}

function isDefaultAppBridgeEnabled() {
  return (
    typeof document !== 'undefined' &&
    Boolean(document.querySelector('meta[name="shopify-api-key"]'))
  )
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

async function requestShopifyIdToken(
  runtime: Required<
    Pick<
      ShopifyAuthenticatedFetchRuntime,
      'getIdTokenProvider' | 'wait' | 'tokenRetryIntervalMs'
    >
  >,
  timeoutMs: number,
) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / runtime.tokenRetryIntervalMs))

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const provider = runtime.getIdTokenProvider()
    if (typeof provider?.idToken === 'function') {
      try {
        const token = (await provider.idToken()).trim()
        if (token) return token
      } catch {
        // App Bridge can exist before the mobile Shopify session is ready.
      }
    }

    if (attempt < attempts - 1) {
      await runtime.wait(runtime.tokenRetryIntervalMs)
    }
  }

  return ''
}

function addBearerToken(init: RequestInit | undefined, token: string) {
  if (!token) return init

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

export async function shopifyAuthenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  runtimeOverrides: ShopifyAuthenticatedFetchRuntime = {},
) {
  const fetchImplementation = runtimeOverrides.fetchImplementation ?? fetch
  const appBridgeEnabled =
    runtimeOverrides.isAppBridgeEnabled?.() ?? isDefaultAppBridgeEnabled()

  if (!appBridgeEnabled) {
    return fetchImplementation(input, init)
  }

  const runtime = {
    getIdTokenProvider:
      runtimeOverrides.getIdTokenProvider ?? getDefaultIdTokenProvider,
    wait: runtimeOverrides.wait ?? defaultWait,
    tokenRetryIntervalMs:
      runtimeOverrides.tokenRetryIntervalMs ?? defaultTokenRetryIntervalMs,
  }
  const initialToken = await requestShopifyIdToken(runtime, 0)
  const initialResponse = await fetchImplementation(
    input,
    addBearerToken(init, initialToken),
  )

  if (initialResponse.status !== 401) {
    return initialResponse
  }

  const retryToken = await requestShopifyIdToken(
    runtime,
    runtimeOverrides.tokenRetryTimeoutMs ?? defaultTokenRetryTimeoutMs,
  )
  if (!retryToken) {
    return initialResponse
  }

  return fetchImplementation(input, addBearerToken(init, retryToken))
}

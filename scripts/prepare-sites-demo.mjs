import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const distDir = path.join(rootDir, 'dist')
const serverDir = path.join(distDir, 'server')
const openAiDistDir = path.join(distDir, '.openai')

await mkdir(serverDir, { recursive: true })
await mkdir(openAiDistDir, { recursive: true })
await copyFile(path.join(rootDir, '.openai', 'hosting.json'), path.join(openAiDistDir, 'hosting.json'))

await writeFile(
  path.join(serverDir, 'index.js'),
  `const indexPath = '/index.html'

function rewriteRequest(request, pathname) {
  const url = new URL(request.url)
  url.pathname = pathname
  return new Request(url, request)
}

export default {
  async fetch(request, env) {
    const assetHandler = env?.ASSETS
    if (!assetHandler?.fetch) {
      return new Response('Static asset binding is unavailable.', { status: 500 })
    }

    const response = await assetHandler.fetch(request)
    if (response.status !== 404) return response

    const url = new URL(request.url)
    if (url.pathname.startsWith('/assets/') || url.pathname.includes('.')) {
      return response
    }

    return assetHandler.fetch(rewriteRequest(request, indexPath))
  },
}
`,
)

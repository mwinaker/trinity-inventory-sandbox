import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const renderer = fileURLToPath(new URL('./production-pdf.py', import.meta.url))

export function renderProductionPdf(html) {
  return new Promise((resolve, reject) => {
    const child = execFile('python3', [renderer], {
      encoding: 'buffer',
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, pdf) => {
      if (error) reject(error)
      else resolve(pdf)
    })
    child.stdin.on('error', reject)
    child.stdin.end(html)
  })
}

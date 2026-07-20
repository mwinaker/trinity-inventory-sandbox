import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('runtime image includes shared modules imported by the server', () => {
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')

  assert.match(dockerfile, /COPY --from=build \/app\/server \.\/server/)
  assert.match(dockerfile, /COPY --from=build \/app\/shared \.\/shared/)
})

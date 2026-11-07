import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { apply } from '../index.js'
import { defaultSettings, FakeCredentials, FakeSubprocess } from './helpers.mjs'

const require = createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
const { Context } = require('@deepseek-ai/cordis')
const Typert = require('@deepseek-ai/dsh-typert-registry').default
const { TypertGatewayService } = require('@deepseek-ai/dsh-api-gateway')

test('real Typert Gateway invokes every global RPC shape without an Agent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxyapi-plus-gateway-'))
  const configPath = join(directory, 'config.yaml')
  await writeFile(configPath, 'server: {port: 63999}\n')
  const ctx = new Context()
  new Typert(ctx)
  ctx.provide('loader', { import: async specifier => require(specifier) })
  const subprocess = new FakeSubprocess()
  ctx.provide('subprocess', subprocess)
  ctx.provide('credentials', new FakeCredentials())
  ctx.provide('configEditor', { edit: async (_entry, change) => change({}) })
  let toolDisposed = false
  ctx.provide('tools', { register: () => () => { toolDisposed = true } })
  const accessChecks = []
  ctx.provide('remoteAccess', { decide(request) { accessChecks.push(request); return { kind: 'allow' } } })
  await apply(ctx, { ...defaultSettings, configPath })
  const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1000000 })
  const peer = { id: 'cliproxyapi-plus-test', ctx, principal: { kind: 'test-viewer' }, signal: new AbortController().signal }
  const call = (method, args = {}) => gateway.invoke({ namespace: 'cliproxyapiPlus', method, args, peer })

  const snapshot = await call('snapshot')
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.config.server.port, 63999)
  assert.equal(accessChecks.at(-1).resources[0].kind, 'global')
  const original = await call('readConfig')
  await assert.rejects(call('saveConfig', { request: { text: 'server: {port: 9999}', unexpected: true } }))
  assert.match(await readFile(configPath, 'utf8'), /63999/)
  const saved = await call('saveConfig', { request: { text: `# gateway\nserver: {port: 9999}\noauth: {auth-dir: ${JSON.stringify(join(directory, 'auth'))}}\n`, expectedMtimeMs: original.mtimeMs } })
  assert.equal(saved.server.port, 9999)
  const validated = await call('validateConfig', { request: { text: 'server: {port: 1234}\n' } })
  assert.equal(validated.server.port, 1234)
  await call('start')
  assert.equal(subprocess.spawnSpecs.length, 1)
  await call('stop')
  await call('authenticate')
  assert.equal(subprocess.terminalSpecs.length, 1)
  await call('stopAuthentication')
  assert.deepEqual(await call('copyManagementCredential'), { password: 'test-management-password' })
  await ctx.fiber.dispose()
  assert.equal(toolDisposed, true)
})

test('credential RPCs reach management endpoints and redact file details through the real gateway', async t => {
  const requests = []
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    requests.push({ path: url.pathname, name: url.searchParams.get('name'), authorization: request.headers.authorization })
    response.setHeader('Content-Type', 'application/json')
    if (url.pathname.endsWith('/models')) response.end(JSON.stringify({ models: [{ id: 'model-1', display_name: 'One' }] }))
    else if (url.pathname.endsWith('/download')) response.end(JSON.stringify({ email: 'user@example.com', token: 'private-file-token', nested: { refresh_token: 'private-refresh-token' } }))
    else response.end(JSON.stringify({ files: [{ name: 'qoder-user.json', usage: { total: 1000, remaining: 750 } }] }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const directory = await mkdtemp(join(tmpdir(), 'cliproxy-credentials-gateway-'))
  const configPath = join(directory, 'config.yaml')
  await writeFile(configPath, `server: {host: 127.0.0.1, port: ${server.address().port}}\n`)
  const ctx = new Context()
  new Typert(ctx)
  ctx.provide('loader', { import: async specifier => require(specifier) })
  ctx.provide('subprocess', new FakeSubprocess())
  ctx.provide('credentials', new FakeCredentials())
  ctx.provide('configEditor', { edit: async () => {} })
  ctx.provide('tools', { register: () => () => {} })
  ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
  await apply(ctx, { ...defaultSettings, configPath })
  t.after(() => ctx.fiber.dispose())
  const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1000000 })
  const peer = { id: 'credential-test', ctx, principal: { kind: 'test-viewer' }, signal: new AbortController().signal }
  const call = (method, name = 'qoder-user.json') => gateway.invoke({ namespace: 'cliproxyapiPlus', method, args: { request: { name } }, peer })
  assert.equal((await call('credentialModels')).models[0].id, 'model-1')
  const details = await call('credentialDetails')
  assert.equal(details.content.email, 'user@example.com')
  assert.equal(JSON.stringify(details).includes('private-'), false)
  assert.equal((await call('credentialQuota')).usage.remaining, 750)
  await call('credentialQuota')
  assert.equal(requests.length, 3)
  assert.equal((await call('refreshCredentialQuota')).usage.remaining, 750)
  assert.equal(requests.length, 4)
  assert.ok(requests.every(request => request.name === 'qoder-user.json' && request.authorization === 'Bearer test-management-password'))
  await assert.rejects(call('credentialDetails', '../other.json'))
  assert.equal(requests.length, 4)
})

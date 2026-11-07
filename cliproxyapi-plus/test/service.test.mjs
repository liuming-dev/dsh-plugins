import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { CliproxyService, probe } from '../service.js'
import { defaultSettings, emptyDashboardData, FakeCredentials, FakeSubprocess } from './helpers.mjs'

async function fixture(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxyapi-plus-service-'))
  const configPath = join(directory, 'config.yaml')
  const authDir = join(directory, 'auth')
  await mkdir(authDir)
  await writeFile(configPath, `config-version: 8\nserver:\n  host: 127.0.0.1\n  port: 8317\noauth:\n  auth-dir: ${JSON.stringify(authDir)}\naccess:\n  api-keys: [local]\n`)
  await writeFile(join(authDir, 'qoder-user.json'), JSON.stringify({ token: 'never-return-this', email: 'user@example.com', expire_time: Date.now() + 100000 }))
  const subprocess = new FakeSubprocess()
  const edits = []
  const service = new CliproxyService({
    config: { ...defaultSettings, configPath, ...overrides }, subprocess,
    credentials: new FakeCredentials(),
    configEditor: { edit: async (entry, change) => { edits.push({ entry, result: change({ existing: true }) }) } },
    entry: 'test-entry', fetchProbe: async () => ({ status: 'reachable', httpStatus: 200 }),
    dashboardLoader: async () => emptyDashboardData(),
  })
  return { directory, configPath, authDir, subprocess, edits, service }
}

test('snapshot combines local config, redacted auth, health, URL, and processes', async () => {
  const { service, authDir } = await fixture()
  const snapshot = await service.snapshot()
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.config.server.port, 8317)
  assert.equal(snapshot.managementUrl, 'http://127.0.0.1:8317/management.html')
  assert.equal(snapshot.health.status, 'reachable')
  assert.equal(snapshot.auth.directory, authDir)
  assert.equal(snapshot.auth.authenticated, 1)
  assert.equal(snapshot.processes.service.status, 'stopped')
  assert.equal(JSON.stringify(snapshot).includes('never-return-this'), false)
  assert.equal(Object.hasOwn(snapshot.config, 'text'), false)
})

test('credential operations require a configured management credential before making requests', async () => {
  const { service } = await fixture()
  service.management.read = async () => undefined
  for (const method of ['credentialModels', 'credentialDetails', 'credentialQuota', 'refreshCredentialQuota']) {
    await assert.rejects(service[method]({ name: 'qoder-user.json' }), { code: 'management-unauthorized' })
  }
})

test('full Qoder quota retries failed reads, shares concurrent reads, and bypasses cached data on refresh or configuration change', async t => {
  const upstreamCalls = []
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url.includes('/credentials')) {
      response.end(JSON.stringify({ files: [{ name: 'user.json', type: 'qoder', auth_index: 'selected' }] }))
      return
    }
    let body = ''
    for await (const chunk of request) body += chunk
    upstreamCalls.push({ body: JSON.parse(body), authorization: request.headers.authorization })
    response.end(JSON.stringify({
      status_code: upstreamCalls.length === 1 ? 500 : 200,
      body: JSON.stringify({ userQuota: { total: 0, used: 0, remaining: 0 }, orgResourcePackage: { total: 20000, used: 2478, remaining: 17522 } }),
    }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const { service, configPath, authDir } = await fixture()
  t.after(() => service.dispose())
  const configure = endpoint => writeFile(configPath, `server: {host: 127.0.0.1, port: ${server.address().port}}\noauth: {auth-dir: ${JSON.stringify(authDir)}}\nqoder: {vpc-endpoint: ${endpoint}}\n`)
  await configure('first')
  await assert.rejects(service.credentialQuota({ name: 'user.json' }), { code: 'quota-unavailable' })
  const [first, concurrent] = await Promise.all([
    service.credentialQuota({ name: 'user.json' }), service.credentialQuota({ name: 'user.json' }),
  ])
  assert.equal(first.usage.shared.remaining, 17522)
  assert.equal(first.usage.package.total, 0)
  assert.deepEqual(first, concurrent)
  assert.equal(upstreamCalls.length, 2)
  await service.refreshCredentialQuota({ name: 'user.json' })
  assert.equal(upstreamCalls.length, 3)
  assert.equal(upstreamCalls[2].body.url, 'https://first-openapi.vpc.qoder.com.cn/api/v2/quota/usage')
  await configure('second')
  await service.credentialQuota({ name: 'user.json' })
  assert.equal(upstreamCalls.length, 4)
  assert.equal(upstreamCalls[3].body.url, 'https://second-openapi.vpc.qoder.com.cn/api/v2/quota/usage')
  await writeFile(join(authDir, 'qoder-user.json'), '{}')
  await service.authenticate()
  await service.credentialQuota({ name: 'user.json' })
  assert.equal(upstreamCalls.length, 5)
  assert.ok(upstreamCalls.every(call => call.body.auth_index === 'selected' && call.body.header.Authorization === 'Bearer $TOKEN$'
    && call.authorization === 'Bearer test-management-password'))
})

test('configuration read, validation, save, and conflict remain consistent through runAction', async () => {
  const { service } = await fixture()
  const file = await service.runAction('read_config')
  assert.match(file.text, /config-version/)
  const validation = await service.runAction('validate_config', { text: 'server: {port: 9999}\n' })
  assert.equal(validation.server.port, 9999)
  await assert.rejects(service.runAction('validate_config', { text: 'server: [' }), error => error.code === 'invalid-yaml')
  const saved = await service.runAction('save_config', { text: '# changed\nserver: {port: 8888}\n', expectedMtimeMs: file.mtimeMs })
  assert.equal(saved.server.port, 8888)
  assert.match(saved.text, /# changed/)
  await assert.rejects(service.runAction('unknown'), error => error.code === 'invalid-action')
})

test('settings use the config editor and reject malformed patches', async () => {
  const { service, edits } = await fixture()
  const result = await service.updateSettings({ startCommand: 'node custom.mjs', managementUrl: 'https://example.test/panel' })
  assert.equal(result.settings.startCommand, 'node custom.mjs')
  assert.equal(edits.length, 1)
  assert.equal(edits[0].entry, 'test-entry')
  assert.deepEqual(edits[0].result, { existing: true, startCommand: 'node custom.mjs', managementUrl: 'https://example.test/panel' })
  await assert.rejects(service.updateSettings({ unknown: true }), error => error.code === 'invalid-request')
  await assert.rejects(service.updateSettings({ configPath: 'relative/config.yaml' }), { code: 'invalid-path' })
})

test('empty default settings produce a readable setup state', async () => {
  const service = new CliproxyService({ subprocess: new FakeSubprocess(), credentials: new FakeCredentials() })
  const snapshot = await service.snapshot()
  assert.equal(snapshot.config.code, 'config-not-configured')
  assert.equal(snapshot.config.path, '')
  assert.equal(snapshot.dashboard.status, 'offline')
  assert.equal(snapshot.settings.startCommand, '')
  assert.equal(snapshot.settings.authCommand, '')
  await assert.rejects(service.readConfig(), { code: 'config-not-configured' })
  await service.dispose()
})

test('missing config is a readable snapshot error rather than a crashed panel', async () => {
  const { service } = await fixture({ configPath: join(tmpdir(), `missing-${Date.now()}`, 'config.yaml') })
  const snapshot = await service.snapshot()
  assert.equal(snapshot.config.ok, false)
  assert.equal(snapshot.config.code, 'config-not-found')
  assert.equal(snapshot.auth.status, 'unknown')
})

test('management URL override and probe failures are exposed without credentials', async () => {
  const { service } = await fixture({ managementUrl: 'https://example.test/custom' })
  service.fetchProbe = async () => ({ status: 'unreachable', message: '无法连接服务' })
  const snapshot = await service.snapshot()
  assert.equal(snapshot.managementUrl, 'https://example.test/custom')
  assert.equal(snapshot.health.status, 'unreachable')
})

test('start/stop and authenticate actions use the shared process manager', async () => {
  const { service, subprocess, authDir } = await fixture()
  await writeFile(join(authDir, 'qoder-user.json'), '{}')
  await service.runAction('start')
  assert.equal(service.processes.snapshot().service.status, 'running')
  assert.equal(subprocess.spawnSpecs[0].env.MANAGEMENT_PASSWORD, 'test-management-password')
  assert.equal(subprocess.terminalSpecs.length, 0)
  await service.runAction('authenticate')
  assert.equal(service.processes.snapshot().authentication.status, 'running')
  assert.equal(service.processes.snapshot().service.status, 'running')
  await service.runAction('stop_authentication')
  assert.equal(service.processes.snapshot().service.status, 'running')
  await service.runAction('stop')
  assert.equal(service.processes.snapshot().service.status, 'exited')
  assert.equal(subprocess.terminalSpecs.length, 1)
  await service.dispose()
})

test('Host rechecks selected client states and derives only pending login commands from the saved start command', async t => {
  const { service, subprocess, authDir } = await fixture({ authClients: ['qoder', 'codex'], authCommand: 'obsolete --never-execute' })
  t.after(() => service.dispose())
  await service.authenticate()
  assert.equal(subprocess.terminalSpecs[0].argv.at(-1), `${defaultSettings.startCommand} --codex-login`)
  await service.stopAuthentication()
  await writeFile(join(authDir, 'codex-user.json'), JSON.stringify({ type: 'codex', access_token: 'private-token', expired: '2099-01-01' }))
  await assert.rejects(service.authenticate(), { code: 'authentication-not-needed' })
  service.config.authClients = []
  await assert.rejects(service.authenticate(), { code: 'authentication-not-configured' })
  service.config.authClients = ['qoder', 'codex']
  service.config.startCommand = ''
  await assert.rejects(service.authenticate(), { code: 'invalid-command' })
  service.config.startCommand = defaultSettings.startCommand
  service.dashboardLoader = async () => ({ ...emptyDashboardData(), credentials: [{ name: 'codex-user.json', type: 'codex', requiresSignIn: true }] })
  await service.authenticate()
  assert.equal(subprocess.terminalSpecs[1].argv.at(-1), `${defaultSettings.startCommand} --codex-login`)
})

test('health probe uses GET rather than unsupported HEAD and cancels the response body', async () => {
  const originalFetch = globalThis.fetch
  let method, cancelled = false
  globalThis.fetch = async (_url, options) => {
    method = options.method
    return {
      ok: true,
      status: 200,
      body: { cancel: async () => { cancelled = true } },
    }
  }
  try {
    const result = await probe('http://127.0.0.1:8317/management.html')
    assert.deepEqual(result, { status: 'reachable', httpStatus: 200 })
    assert.equal(cancelled, true)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(method, 'GET')
})

test('dashboard requires a credential, reports errors, and never exposes the password', async () => {
  const previous = process.env.MANAGEMENT_PASSWORD
  delete process.env.MANAGEMENT_PASSWORD
  try {
    const { service } = await fixture()
    service.management.credentials = new FakeCredentials(null)
    let snapshot = await service.snapshot()
    assert.equal(snapshot.dashboard.status, 'needs-key')
    assert.equal(snapshot.managementCredentialConfigured, false)
    service.dashboardLoader = async () => { throw Object.assign(new Error('bad credential'), { code: 'management-unauthorized' }) }
    await service.management.save('test-management-password')
    snapshot = await service.snapshot()
    assert.equal(snapshot.dashboard.status, 'error')
    assert.equal(snapshot.dashboard.code, 'management-unauthorized')
    assert.equal(JSON.stringify(snapshot).includes('test-management-password'), false)
  } finally {
    if (previous === undefined) delete process.env.MANAGEMENT_PASSWORD
    else process.env.MANAGEMENT_PASSWORD = previous
  }
})

test('credential is verified before saving and can be copied only by its explicit operation', async () => {
  const { service } = await fixture()
  const seen = []
  service.dashboardLoader = async (_base, password) => { seen.push(password); return emptyDashboardData() }
  assert.deepEqual(await service.saveManagementCredential({ password: 'verified-password' }), { ok: true, configured: true })
  assert.deepEqual(seen, ['verified-password'])
  assert.deepEqual(await service.copyManagementCredential(), { password: 'verified-password' })
  service.dashboardLoader = async () => { throw Object.assign(new Error('wrong'), { code: 'management-unauthorized' }) }
  await assert.rejects(service.saveManagementCredential({ password: 'wrong-password' }), error => error.code === 'management-unauthorized')
  assert.deepEqual(await service.copyManagementCredential(), { password: 'verified-password' })
})

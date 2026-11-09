import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { setImmediate } from 'node:timers/promises'
import * as plugin from '../index.js'
import { CliproxyService } from '../service.js'
import { HarnessProviders } from '../harness-providers.js'
import { FakeSubprocess } from './helpers.mjs'

const require = createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
const { boot, initProfile, readProfilePatches } = require('@deepseek-ai/dsh-app-boot')
const ConfigEditor = require('@deepseek-ai/dsh-config-editor').default
const Settings = require('@deepseek-ai/dsh-settings').default
const Llm = require('@deepseek-ai/dsh-llm').default
const { createUserMessage } = require('@deepseek-ai/dsh-llm')
const PiAi = require('@deepseek-ai/dsh-llm-pi-ai')
const Credentials = require('@deepseek-ai/dsh-credentials-local').default
const Typert = require('@deepseek-ai/dsh-typert-registry').default
const { TypertGatewayService } = require('@deepseek-ai/dsh-api-gateway')

async function harness(t) {
  const requests = []
  const key = 'isolated-proxy-key'
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined
    requests.push({ path: url.pathname, authorization: req.headers.authorization, body })
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/management.html') return res.end('{}')
    if (url.pathname === '/v8/management/credentials') return res.end(JSON.stringify({ files: [{ name: 'qoder-user.json', type: 'qoder' }, { name: 'codex-user.json', type: 'codex' }] }))
    if (url.pathname === '/v8/management/credentials/models') return res.end(JSON.stringify({ models: [{ id: url.searchParams.get('name').startsWith('qoder') ? 'qoder/model-one' : 'gpt-codex', display_name: 'Discovered model' }] }))
    if (url.pathname === '/v1/models') {
      assert.equal(req.headers.authorization, `Bearer ${key}`)
      return res.end(JSON.stringify({ data: [{ id: 'qoder/model-one' }, { id: 'gpt-codex' }] }))
    }
    if (url.pathname.startsWith('/v8/management/')) return res.end('{}')
    assert.equal(req.headers.authorization, `Bearer ${key}`)
    res.setHeader('Content-Type', 'text/event-stream')
    if (url.pathname === '/v1/chat/completions') {
      res.write(`data: ${JSON.stringify({ id: 'chat-1', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: 'pong' }, finish_reason: null }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ id: 'chat-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
      return res.end('data: [DONE]\n\n')
    }
    assert.equal(url.pathname, '/v1/responses')
    const item = { id: 'msg-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'pong', annotations: [] }] }
    const response = { id: 'resp-1', object: 'response', status: 'completed', model: body.model, output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } }
    for (const event of [
      { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'pong' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response },
    ]) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const home = await mkdtemp(join(tmpdir(), 'cliproxy-provider-profile-'))
  const configPath = join(home, 'proxy.yaml')
  await writeFile(configPath, `server: {host: 127.0.0.1, port: ${server.address().port}}\naccess: {api-keys: ['', ${JSON.stringify(key)}]}\noauth: {auth-dir: ${JSON.stringify(join(home, 'auth'))}}\n`)
  const dir = join(home, 'profiles', 'test')
  const installAnchor = join(home, 'package.json')
  await writeFile(installAnchor, '{"name":"provider-sync-test"}')
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: {}, records: { 'cliproxyapi-plus/management': { kind: 'api-key', key: 'isolated-management' } } }), { mode: 0o600 })
  initProfile(dir, ['provider-test-bundle'])
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const bundle = join(dir, 'node_modules', 'provider-test-bundle')
  await mkdir(bundle, { recursive: true })
  await mkdir(join(dir, 'node_modules', '@deepseek-ai'), { recursive: true })
  await symlink(dirname(dirname(require.resolve('@deepseek-ai/dsh-typert-protocol'))), join(dir, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol'))
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'provider-test-bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  const original = { api: 'openai-completions', baseURL: 'http://original.invalid/v1', models: [{ id: 'old' }] }
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'editor', name: 'cordis:editor' }, { id: 'settings', name: 'cordis:settings' },
    { id: 'credentials', name: 'cordis:credentials', config: { path: join(home, '.credentials.yaml'), watch: false } },
    { id: 'llm', name: 'cordis:llm' }, { id: 'llm-pi-ai', name: 'cordis:piAi', config: { providers: { other: original, qoder: { ...original, headers: { Authorization: 'Bearer previous-provider-key' } } } } },
    { id: 'cliproxyapi-plus', name: 'cordis:proxy', config: { configPath, modelSyncIntervalMinutes: 0 } },
  ] }]))
  const profile = { name: 'test', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor, cwd: home, home, overlays: [], startedBundles: ['provider-test-bundle'] }
  let ctx
  const start = async () => {
    await ctx?.fiber.dispose()
    ctx = await boot('dsh', join(dir, 'cordis.yml'), readProfilePatches('dsh', profile), context => {
      context.provide('profileContext', profile)
      context.provide('appReady', { onReady(listener) { listener(); return () => {} } })
      context.provide('subprocess', new FakeSubprocess())
      context.provide('tools', { register: () => () => {} })
      context.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
      new Typert(context)
      Object.assign(context.loader.builtins, { editor: ConfigEditor, settings: Settings, credentials: Credentials, llm: Llm, piAi: PiAi, proxy: plugin })
    })
    const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1000000 })
    const controller = new AbortController()
    const peer = { id: 'provider-test', ctx, principal: { kind: 'test-viewer' }, signal: controller.signal }
    return { ctx, disconnect: () => controller.abort(), call: (method, request) => gateway.invoke({ namespace: 'cliproxyapiPlus', method, args: request ? { request } : {}, peer }) }
  }
  t.after(() => ctx?.fiber.dispose())
  return { start, home, profile, configPath, requests, original }
}

test('real Harness services persist discovered providers and route both protocols after a full Host restart', async t => {
  const fixture = await harness(t)
  let host = await fixture.start()
  let automatic = await host.call('snapshot')
  for (let attempt = 0; attempt < 100 && automatic.providerSync.status === 'running'; attempt++) automatic = await host.call('snapshot')
  assert.equal(automatic.providerSync.status, 'success', JSON.stringify(automatic.providerSync))
  const result = await host.call('syncProviders')
  assert.equal(result.status, 'success', JSON.stringify(result))
  const readProfiles = () => host.ctx.settings.describe().find(row => row.ns === 'llm-pi-ai').value.providers
  let profiles = readProfiles()
  assert.equal(profiles.qoder.displayName, 'Qoder')
  assert.equal(profiles.codex.displayName, 'Codex')
  assert.equal(profiles.other.baseURL, fixture.original.baseURL)
  assert.equal(Object.keys(profiles.qoder.headers || {}).length, 0)
  assert.deepEqual(profiles.qoder.models.map(model => model.id), ['qoder/model-one'])
  assert.deepEqual(profiles.codex.models.map(model => model.id), ['gpt-codex'])
  assert.doesNotMatch(await readFile(fixture.profile.patchPath, 'utf8'), /isolated-proxy-key|isolated-management/)
  const before = await readFile(fixture.profile.patchPath, 'utf8')
  const repeated = await host.call('syncProviders')
  assert.equal(repeated.providers.qoder.status, 'unchanged')
  assert.equal(await readFile(fixture.profile.patchPath, 'utf8'), before)
  host = await fixture.start()
  await host.call('syncProviders')
  profiles = readProfiles()
  assert.equal((await host.ctx.credentials.resolve(profiles.qoder.apiKeyEnv)).value, 'isolated-proxy-key')
  assert.ok(host.ctx.llm.listProviders().some(provider => provider.id === 'qoder'))
  for (const [provider, model] of [['qoder', 'qoder/model-one'], ['codex', 'gpt-codex']]) {
    const chunks = []
    for await (const chunk of host.ctx.llm.stream({ provider, model, messages: [createUserMessage({ content: [{ type: 'text', text: 'ping' }] })], signal: AbortSignal.timeout(5000) })) chunks.push(chunk)
    assert.equal(chunks.some(chunk => chunk.type === 'error'), false, JSON.stringify(chunks))
    assert.match(JSON.stringify(chunks), /pong/)
    const request = fixture.requests.find(request => request.body?.model === model)
    assert.equal(request.path, provider === 'qoder' ? '/v1/chat/completions' : '/v1/responses')
  }
  await host.call('updateSettings', { modelSyncIntervalMinutes: 9 })
  host = await fixture.start()
  assert.equal((await host.call('snapshot')).settings.modelSyncIntervalMinutes, 9)
  await host.call('updateSettings', { modelSyncIntervalMinutes: 0 })
  host = await fixture.start()
  assert.equal((await host.call('snapshot')).settings.modelSyncIntervalMinutes, 0)
})

test('Host scheduling survives client disconnects and reacts to service start and completed authentication', async t => {
  const fixture = await harness(t)
  const host = await fixture.start()
  await host.call('syncProviders')
  const subprocess = new FakeSubprocess()
  const service = new CliproxyService({ config: { configPath: fixture.configPath, startCommand: 'proxy', authClients: ['qoder'], modelSyncIntervalMinutes: 5 }, subprocess, credentials: host.ctx.credentials })
  t.after(() => service.dispose())
  const timers = new Map()
  service.providerSync.setTimer = (fn, delay) => { const timer = { fn, delay }; timers.set(timer, timer); return timer }
  service.providerSync.clearTimer = timer => timers.delete(timer)
  service.providerSync.attach(new HarnessProviders({ settings: host.ctx.settings, llm: host.ctx.llm, credentials: host.ctx.credentials }))
  await service.providerSync.pending
  host.disconnect()
  const initial = fixture.requests.length
  const timer = [...timers.values()][0]
  assert.equal(timer.delay, 300000)
  timers.delete(timer)
  timer.fn()
  await service.providerSync.pending
  assert.ok(fixture.requests.length > initial)
  await service.start()
  await service.providerSync.pending
  const beforeAuthentication = fixture.requests.length
  await service.authenticate()
  subprocess.handles.at(-1).doneSource.resolve({ exitCode: 0 })
  await setImmediate()
  await service.providerSync.pending
  assert.ok(fixture.requests.length > beforeAuthentication)
  service.config.modelSyncIntervalMinutes = 0
  await service.providerSync.sync()
  assert.equal(timers.size, 0)
  await service.providerSync.detach()
  assert.equal((await service.runAction('sync_providers')).status, 'unavailable')
})

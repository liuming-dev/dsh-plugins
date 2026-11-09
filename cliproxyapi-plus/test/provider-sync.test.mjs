import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { ProviderSync, fetchProxyModels } from '../provider-sync.js'
import { HarnessProviders, proxyKeyReference } from '../harness-providers.js'
import { parseSettingsPatch, resolveSettings, PluginError } from '../contract.js'
import { deferred } from './helpers.mjs'

const context = () => ({ baseUrl: 'http://localhost:8317', apiKey: 'private-proxy-key', password: 'private-management', credentials: [
  { name: 'qoder-a.json', type: 'qoder' }, { name: 'qoder-b.json', provider: 'qoder' }, { name: 'codex.json', type: 'codex' },
  { name: 'disabled.json', type: 'qoder', disabled: true }, { name: 'expired.json', type: 'codex', requires_sign_in: true },
  { name: 'unavailable.json', type: 'codex', unavailable: true }, { name: 'other.json', type: 'claude' },
] })
const listing = () => [{ id: 'qoder/a', display_name: 'Qoder A', context_length: 128000, max_completion_tokens: 8192 }, { id: 'qoder/b' }, { id: 'gpt-codex' }]

function fixture(options = {}) {
  const saved = new Map()
  const calls = []
  const config = { modelSyncIntervalMinutes: 5 }
  const sync = new ProviderSync({ getSettings: () => config, loadContext: async () => context(), fetchListing: async () => listing(),
    fetchModels: async (_url, _password, name) => {
      calls.push(name)
      return { models: name.startsWith('qoder') ? [{ id: 'qoder/a' }, { id: 'qoder/b' }, { id: 'not-listed' }] : [{ id: 'gpt-codex' }] }
    }, readinessMs: 0, ...options })
  const writer = { async save(id, profile, key, signal) {
    signal.throwIfAborted()
    saved.set(id, { profile, key })
    return { changed: true }
  } }
  sync.writer = writer
  return { sync, saved, calls, config, writer }
}

test('sync separates clients, unions accounts, deduplicates routable IDs and copies disclosed metadata', async t => {
  const { sync, saved, calls } = fixture()
  t.after(() => sync.detach())
  assert.equal((await sync.sync()).status, 'success')
  assert.deepEqual(calls, ['qoder-a.json', 'qoder-b.json', 'codex.json'])
  const qoder = saved.get('qoder').profile
  assert.equal(qoder.displayName, 'Qoder')
  assert.equal(qoder.api, 'openai-completions')
  assert.equal(qoder.baseURL, 'http://localhost:8317/v1')
  assert.deepEqual(qoder.models, [{ id: 'qoder/a', name: 'Qoder A', contextWindow: 128000, maxTokens: 8192 }, { id: 'qoder/b', name: 'qoder/b' }])
  assert.equal(saved.get('codex').profile.api, 'openai-responses')
  assert.deepEqual(saved.get('codex').profile.models, [{ id: 'gpt-codex', name: 'gpt-codex' }])
  assert.doesNotMatch(JSON.stringify(sync.snapshot()), /private-/)
  const snapshot = sync.snapshot()
  snapshot.providers.qoder.modelCount = 999
  assert.equal(sync.snapshot().providers.qoder.modelCount, 2)
})

test('offline, expired, empty, malformed and partial account failures retain the last committed profiles', async t => {
  const { sync, saved } = fixture()
  t.after(() => sync.detach())
  await sync.sync()
  const original = structuredClone(saved)
  const load = sync.loadContext
  sync.loadContext = async () => { throw new PluginError('proxy-unreachable', 'offline') }
  assert.equal((await sync.sync()).status, 'error')
  assert.deepEqual(saved, original)
  sync.loadContext = async () => ({ ...context(), credentials: context().credentials.map(file => ({ ...file, requires_sign_in: true })) })
  await sync.sync()
  assert.equal(sync.snapshot().providers.qoder.status, 'waiting')
  assert.deepEqual(saved, original)
  sync.loadContext = load
  const fetchModels = sync.fetchModels
  sync.fetchModels = async () => ({ models: [] })
  await sync.sync()
  assert.equal(sync.snapshot().providers.qoder.code, 'models-not-ready')
  assert.deepEqual(saved, original)
  sync.fetchModels = async (...args) => {
    if (args[2] === 'qoder-b.json') throw new PluginError('invalid-models', 'invalid')
    return { models: [{ id: 'qoder/b' }, { id: 'gpt-codex' }] }
  }
  await sync.sync()
  assert.deepEqual(saved.get('qoder'), original.get('qoder'))
  assert.equal(sync.snapshot().status, 'partial')
  sync.fetchModels = fetchModels
  sync.writer.save = async () => { throw new Error('should not expose private-proxy-key') }
  await sync.sync()
  assert.doesNotMatch(JSON.stringify(sync.snapshot()), /private-proxy-key/)
  sync.writer = fixture().writer
  assert.equal((await sync.sync()).status, 'success')
})

test('single-client credentials complete immediately and missing services remain visible', async t => {
  const { sync } = fixture({ loadContext: async () => ({ ...context(), credentials: [{ name: 'codex.json', type: 'codex' }] }), readinessMs: 30000 })
  t.after(() => sync.detach())
  assert.equal((await sync.sync('enable')).status, 'success')
  assert.equal(sync.snapshot().providers.qoder.status, 'waiting')
  await sync.detach()
  assert.equal((await sync.sync()).status, 'unavailable')
})

test('background scheduling uses five minutes, supports custom intervals and one-time/manual operation', async () => {
  let time = 1000
  const timers = new Map()
  const { sync, config } = fixture({ now: () => time, setTimer: (fn, delay) => { const timer = { fn, delay }; timers.set(timer, timer); return timer }, clearTimer: timer => timers.delete(timer) })
  await sync.sync()
  assert.equal([...timers.values()][0].delay, 300000)
  assert.equal(sync.snapshot().nextCheckAt, 301000)
  config.modelSyncIntervalMinutes = 2
  time += 300000
  const timer = [...timers.values()][0]
  timers.delete(timer)
  timer.fn()
  await sync.pending
  assert.equal([...timers.values()][0].delay, 120000)
  config.modelSyncIntervalMinutes = 0
  await sync.sync()
  assert.equal(timers.size, 0)
  sync.trigger('authentication')
  assert.equal(sync.pending, undefined)
  await sync.sync()
  assert.equal(timers.size, 0)
  await sync.detach()
})

test('cold-start readiness retries are bounded, concurrent work is coalesced, and disposal aborts waiting', async () => {
  let attempts = 0
  const { sync } = fixture({ readinessMs: 100, retryMs: 1, loadContext: async () => {
    if (++attempts === 1) throw new PluginError('proxy-unreachable', 'starting')
    return context()
  } })
  // Keep the test alive while the unref'ed readiness timer is pending.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    sync.attach(sync.writer)
    const first = sync.pending
    assert.equal(sync.sync(), first)
    sync.trigger('authentication')
    await first
    await sync.pending
    assert.ok(attempts >= 2)
    sync.loadContext = async () => { throw new PluginError('proxy-unreachable', 'starting') }
    const pending = sync.sync('enable')
    await setImmediate()
    await sync.detach()
    await pending
    assert.equal(sync.pending, undefined)
    assert.equal(sync.nextCheckAt, null)
  } finally { clearInterval(keepAlive) }
})

test('requests finishing after disposal cannot write provider state', async () => {
  const hold = deferred()
  const { sync, saved } = fixture({ fetchListing: () => hold.promise })
  const pending = sync.sync()
  await setImmediate()
  const disposing = sync.detach()
  hold.resolve(listing())
  await disposing
  await pending
  assert.equal(saved.size, 0)
})

test('cold-start budget also bounds in-flight requests and reports a retryable timeout', async () => {
  const { sync } = fixture({ readinessMs: 10, loadContext: signal => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) })
  const keepAlive = setInterval(() => {}, 1000)
  try {
    const result = await sync.sync('enable')
    assert.equal(result.code, 'sync-timeout')
    assert.equal(result.status, 'error')
  } finally { clearInterval(keepAlive); await sync.detach() }
})

test('Harness writer overwrites only its provider, is idempotent, and leaves committed keys usable after refusal', async () => {
  const values = new Map()
  const view = { ns: 'models-custom', revision: 2, user: { providers: { qoder: { baseURL: 'old' }, other: { baseURL: 'preserve' } } } }
  let refuse = false
  const deps = {
    settings: { writable: true, describe: () => [view], mutate: async (ns, ops, revision) => {
      assert.equal(ns, view.ns); assert.equal(revision, view.revision)
      if (refuse) throw new Error('write refused')
      view.user.providers[ops[0].path[1]] = ops[0].value
    } },
    llm: { listConfigurableProviders: () => [{ provider: 'qoder', settingsNs: view.ns, settingsPath: ['providers', 'qoder'] }] },
    credentials: { resolve: async ref => ({ value: values.get(ref) }), set: async (ref, key) => values.set(ref, key) },
  }
  const writer = new HarnessProviders(deps)
  const profile = { displayName: 'Qoder', api: 'openai-completions', baseURL: 'http://proxy/v1', models: [{ id: 'one' }] }
  assert.equal((await writer.save('qoder', profile, 'first')).changed, true)
  const ref = view.user.providers.qoder.apiKeyEnv
  assert.equal(values.get(ref), 'first')
  assert.equal((await writer.save('qoder', profile, 'first')).changed, false)
  assert.equal(view.user.providers.other.baseURL, 'preserve')
  refuse = true
  await assert.rejects(writer.save('qoder', { ...profile, baseURL: 'http://next/v1' }, 'second'))
  assert.equal(view.user.providers.qoder.apiKeyEnv, ref)
  assert.equal(values.get(ref), 'first')
  assert.notEqual(ref, proxyKeyReference('qoder', profile.baseURL, 'second'))
  deps.settings.writable = false
  await assert.rejects(writer.save('qoder', profile, 'first'), { code: 'provider-settings-unavailable' })
  deps.llm.listConfigurableProviders = () => [{ provider: 'qoder', settingsNs: 'fixed', settingsPath: [] }]
  assert.throws(() => writer.target('qoder'), { code: 'provider-not-editable' })
  deps.llm.listConfigurableProviders = () => []
  assert.throws(() => writer.target('codex'), { code: 'provider-adapter-unavailable' })
})

test('proxy model discovery validates authorization, response shape and cancellation', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (_url, request) => { assert.equal(request.headers.Authorization, 'Bearer key'); return Response.json({ data: [{ id: 'one' }, null, {}] }) }
  assert.deepEqual(await fetchProxyModels('http://proxy', 'key'), [{ id: 'one' }])
  globalThis.fetch = async () => new Response('', { status: 401 })
  await assert.rejects(fetchProxyModels('http://proxy', 'key'), { code: 'proxy-key-invalid' })
  globalThis.fetch = async () => new Response('', { status: 503 })
  await assert.rejects(fetchProxyModels('http://proxy', 'key'), { code: 'proxy-unreachable' })
  for (const response of [Response.json({}), new Response('invalid')]) {
    globalThis.fetch = async () => response
    await assert.rejects(fetchProxyModels('http://proxy', 'key'), { code: 'invalid-models' })
  }
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(fetchProxyModels('http://proxy', 'key'), { code: 'proxy-unreachable' })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchProxyModels('http://proxy', 'key', controller.signal), { name: 'AbortError' })
})

test('interval configuration defaults to five, persists one-time zero, and refuses invalid timers', () => {
  assert.equal(resolveSettings().modelSyncIntervalMinutes, 5)
  assert.equal(resolveSettings({ modelSyncIntervalMinutes: 0 }).modelSyncIntervalMinutes, 0)
  assert.deepEqual(parseSettingsPatch({ modelSyncIntervalMinutes: 12 }), { modelSyncIntervalMinutes: 12 })
  for (const value of [-1, 0.5, 35792, NaN, '5', null]) assert.throws(() => parseSettingsPatch({ modelSyncIntervalMinutes: value }), { code: 'invalid-setting' })
})

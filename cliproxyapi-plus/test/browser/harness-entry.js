import React from 'react'
import { createRoot } from 'react-dom/client'
import { projectQuota } from '../../quota.js'
import { projectCodexQuota } from '../../codex-quota.js'
import { authenticationClients } from '../../authentication.js'

const registrations = new Map()
const dictionaries = {}
const parameters = new URLSearchParams(window.location.search)
const emptySettings = parameters.has('emptySettings')
const locale = parameters.get('locale') || 'en'
let editorModule
window.__ModuleLoader__ = {
  load(registration) {
    registrations.set(registration.id, registration)
    if (registration.id === 'cliproxyapi-plus/client.editor.js') editorModule = registration.factory()
  },
}

const yaml = `config-version: 8
server:
  host: "127.0.0.1" # local only
  port: 8317
access:
  api-keys:
    - "sk-local"
oauth:
  auth-dir: "~/.cli-proxy-api"
management:
  allow-remote: false
  secret-key: "not-a-real-secret"
# 中文注释：光标应保持在同一字符位置
`
let documentVersion = 1
const sampleBuckets = Array.from({ length: 20 }, (_, index) => ({
  time: `${String(8 + Math.floor(index / 6)).padStart(2, '0')}:${String((index % 6) * 10).padStart(2, '0')}`,
  success: index % 4 === 0 ? 4 : index % 3,
  failed: index % 5 === 0 ? 1 : 0,
}))
const totalSuccess = sampleBuckets.reduce((sum, bucket) => sum + bucket.success, 0)
const totalFailure = sampleBuckets.reduce((sum, bucket) => sum + bucket.failed, 0)
const quotaPayload = {
  userQuota: { total: 0, used: 0, remaining: 0, percentage: 0, unit: 'credits' },
  orgResourcePackage: { used: 2478, remaining: 17522, percentage: .12, unit: 'credits' },
  expiresAt: 1795363200000, planName: 'Teams',
}
const codexPayload = { plan_type: 'pro', credits: { balance: 0 }, rate_limit: {
  primary_window: { used_percent: 56, limit_window_seconds: 604800, reset_at: 1794408000 },
  secondary_window: { used_percent: 10, limit_window_seconds: 18000, reset_at: 1794050000 },
} }
const codexQuota = () => projectCodexQuota(codexPayload, {
  subscription: { active_until: 1794796620 }, resetCredits: { available_count: 2, credits: [
    { status: 'available', reset_type: 'codex_rate_limits', expires_at: '2026-12-01T00:00:00Z' },
    { status: 'available', reset_type: 'codex_rate_limits', expires_at: '2026-12-02T00:00:00Z' },
  ] },
})
const processes = { service: { status: 'running', command: 'node server.mjs', log: 'server ready' }, authentication: { status: 'stopped', command: '', log: '' } }
const localAuth = { ok: true, directory: '~/.cli-proxy-api', authenticated: 1, total: 1, status: 'authenticated', accounts: [{ type: 'qoder', fileName: 'qoder-user.json', email: 'user@example.com', status: 'authenticated' }] }
const dashboard = {
  status: 'ready',
  traffic: { buckets: sampleBuckets, totalSuccess, totalFailure, total: totalSuccess + totalFailure, successRate: totalSuccess / (totalSuccess + totalFailure) * 100, peakTotal: 5, peakIndex: 0, windowMinutes: 200 },
  providers: [{ id: 'qoder', credentials: 1, success: totalSuccess, failure: totalFailure, total: totalSuccess + totalFailure, successRate: 90, buckets: sampleBuckets }],
  credentials: [{ id: 'credential-1', name: 'qoder-user.json', type: 'qoder', provider: 'qoder', email: 'user@example.com', disabled: false, unavailable: false, modified: 1760000000000, size: 2048, success: totalSuccess, failed: totalFailure, recentRequests: sampleBuckets,
    usage: projectQuota(quotaPayload) }],
}
const settings = {
  configPath: '/tmp/cliproxyapi-plus-browser/config.yaml',
  startCommand: 'node server.mjs --config config.yaml',
  authCommand: 'node server.mjs --config config.yaml --qoder-login',
  authClients: ['qoder'],
  managementUrl: '',
  autoStart: false,
  modelSyncIntervalMinutes: 5,
}
if (emptySettings) {
  Object.assign(settings, { configPath: '', startCommand: '', authCommand: '', authClients: [] }, JSON.parse(localStorage.getItem('cliproxy-test-settings') || '{}'))
  processes.service.status = 'stopped'
}
if (parameters.has('codex')) {
  settings.authClients = ['qoder', 'codex']
  localAuth.accounts.push({ type: 'codex', fileName: 'codex-user.json', status: 'authenticated' })
  dashboard.credentials.push({ ...dashboard.credentials[0], id: 'credential-2', name: 'codex-user.json', type: 'codex', provider: 'codex', email: 'codex@example.com', usage: null })
}
window.__testReadConfigCalls = []
const providerSync = { status: 'success', providers: { qoder: { status: 'synced', modelCount: 2, lastSuccessAt: Date.now() }, codex: { status: 'waiting', modelCount: 0 } } }
const snapshot = () => ({
  providerSync,
  ok: true,
  settings,
  config: settings.configPath ? { ok: true, path: settings.configPath, mtimeMs: documentVersion, size: yaml.length, server: {
    host: '127.0.0.1', port: 8317, baseUrl: 'http://127.0.0.1:8317', managementUrl: 'http://127.0.0.1:8317/management.html', authDir: '~/.cli-proxy-api', apiKeyCount: 1, configVersion: 8,
  } } : { ok: false, path: '', code: 'config-not-configured' },
  auth: { ...(settings.configPath ? localAuth : { ok: false, status: 'unknown', accounts: [] }),
    clients: authenticationClients(settings, settings.configPath ? localAuth : null, dashboard) },
  dashboard: settings.configPath ? dashboard : { ...dashboard, status: 'offline', credentials: [] },
  managementCredentialConfigured: true,
  managementUrl: 'http://127.0.0.1:8317/management.html', health: { status: processes.service.status === 'running' ? 'reachable' : 'unreachable' },
  processes,
  generatedAt: Date.now(),
})
const remote = {
  async syncProviders() {
    window.__testSyncCalls = (window.__testSyncCalls || 0) + 1
    if (window.__testSyncFailure) { providerSync.status = 'error'; providerSync.message = 'Proxy unavailable. Last configuration retained.' }
    else { providerSync.status = 'success'; providerSync.message = ''; providerSync.providers.qoder = { status: 'unchanged', modelCount: 2, lastSuccessAt: Date.now() } }
    return { ok: true, value: providerSync }
  },
  async snapshot() { return { ok: true, value: snapshot() } },
  async readConfig() {
    window.__testReadConfigCalls.push(settings.configPath)
    if (!settings.configPath) throw new Error('Configuration path not set')
    return { ok: true, value: { ok: true, path: settings.configPath, text: yaml, mtimeMs: documentVersion, size: yaml.length, server: snapshot().config.server } }
  },
  async validateConfig() { return { ok: true, value: { ok: true, valid: true, server: snapshot().config.server } } },
  async saveConfig(request) { documentVersion += 1; return { ok: true, value: { ok: true, path: settings.configPath, text: request.text, mtimeMs: documentVersion, size: request.text.length, server: snapshot().config.server, saved: true } } },
  async updateSettings(request) {
    for (const [key, value] of Object.entries(request)) settings[key] = typeof value === 'string' ? value.trim() : value
    if (emptySettings) localStorage.setItem('cliproxy-test-settings', JSON.stringify(settings))
    return { ok: true, value: { ok: true, settings } }
  },
  async start() { processes.service.status = 'running'; return { ok: true, value: processes } },
  async stop() { processes.service.status = 'exited'; return { ok: true, value: processes } },
  async authenticate() {
    const queue = authenticationClients(settings, localAuth, dashboard).filter(client => client.command)
    if (!queue.length) throw new Error('No selected client needs authentication')
    window.__testAuthCommands = queue.map(client => client.command)
    processes.authentication = { status: 'running', command: queue[0].command, client: queue[0].client,
      clients: queue.map(client => client.client), step: 1, total: queue.length,
      log: `\u001b]11;?\u001b\\\u001b[6nVisit \u001b[34mhttps://example.test/${queue[0].client}-login\u001b[0m\nWaiting for authentication…` }
    return { ok: true, value: processes }
  },
  async stopAuthentication() { processes.authentication.status = 'exited'; return { ok: true, value: processes } },
  async saveManagementCredential(request) { return { ok: true, value: { ok: true, configured: Boolean(request.password) } } },
  async copyManagementCredential() { return { ok: true, value: { password: 'browser-test-password' } } },
  async credentialModels(request) {
    return { ok: true, value: { name: request.name, models: [
      { id: 'qoder/model-one', name: 'Model One', provider: 'qoder', type: 'chat' },
      { id: 'qoder/model-two', name: 'Model Two', provider: 'qoder', type: 'chat' },
    ] } }
  },
  async credentialDetails(request) { return { ok: true, value: { name: request.name, content: { type: 'qoder', email: 'user@example.com', token: '[REDACTED]' }, redacted: true } } },
  async credentialQuota(request) { return { ok: true, value: { name: request.name, usage: request.name.startsWith('codex') ? codexQuota() : projectQuota(quotaPayload), observedAt: Date.now(), source: request.name.startsWith('codex') ? 'codex' : 'qoder' } } },
  async refreshCredentialQuota(request) {
    if (request.name.startsWith('codex')) {
      codexPayload.rate_limit.primary_window.used_percent = 60
      return { ok: true, value: { name: request.name, usage: codexQuota(), observedAt: Date.now(), source: 'codex' } }
    }
    quotaPayload.orgResourcePackage = { total: 20000, used: 2500, remaining: 17500, percentage: .125, unit: 'credits' }
    dashboard.credentials[0].usage = projectQuota(quotaPayload)
    return { ok: true, value: { name: request.name, usage: dashboard.credentials[0].usage, observedAt: Date.now(), source: 'qoder' } }
  },
}
const ctx = {
  locale: {
    bind: () => key => dictionaries[key] || key,
    register: (_ns, language, dict) => { if (language === locale) Object.assign(dictionaries, dict); return () => {} },
  },
  remote: { $mount: async () => async () => {} },
  slots: {
    inject: (_name, callback) => callback(),
    register: (metadata, component) => {
      if (metadata.name === 'main') window.__testAppComponent = component
      return () => {}
    },
  },
  effect: callback => callback(),
  get: name => name === 'remote.cliproxyapiPlus' ? remote : undefined,
}
window.__testContext = ctx
window.__testRemote = remote
window.__testSetClientAuthentication = (client, status, requiresSignIn = false) => {
  localAuth.status = status
  localAuth.ok = status !== 'error'
  localAuth.authenticated = status === 'authenticated' ? 1 : 0
  localAuth.accounts = localAuth.accounts.filter(account => account.type !== client)
  if (status !== 'missing') localAuth.accounts.push({ type: client, fileName: `${client}-user.json`, email: 'user@example.com', status })
  localAuth.total = localAuth.accounts.length
  dashboard.credentials.find(credential => credential.type === client).requiresSignIn = requiresSignIn
}
window.__testSetAuthentication = (status, requiresSignIn = false) => window.__testSetClientAuthentication('qoder', status, requiresSignIn)
window.__testCompleteAuthentication = () => {
  const auth = processes.authentication
  window.__testSetClientAuthentication(auth.client, 'authenticated')
  const next = auth.clients[auth.step]
  processes.authentication = { ...auth, status: next ? 'running' : 'exited', step: next ? auth.step + 1 : auth.step, client: next || auth.client,
    log: `${auth.log}\nAuthentication saved.\n${next ? `Visit https://example.test/${next}-login` : ''}` }
  dashboard.credentials[0].modified += 1000
}

async function requireAsync(path) {
  if (path === './client.editor.js') {
    await import('../../client.editor.js')
    return editorModule
  }
  throw new Error(`Unexpected browser module: ${path}`)
}

async function boot() {
  await import('../../client.js')
  const registration = registrations.get('cliproxyapi-plus')
  if (!registration) throw new Error('Plugin client did not register')
  const require = name => {
    if (name === 'react') return React
    throw new Error(`Unexpected module: ${name}`)
  }
  require.async = requireAsync
  const plugin = registration.factory(require)
  plugin.apply(ctx)
  if (!window.__testAppComponent) throw new Error('Main panel component was not registered')
  createRoot(document.getElementById('root')).render(React.createElement(window.__testAppComponent))
  window.__testHarnessReady = true
}
boot().catch(error => {
  window.__testHarnessError = String(error?.stack || error)
  console.error(error)
})

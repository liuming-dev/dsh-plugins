import { fetchCredentialModels } from './credential-data.js'
import { PluginError } from './contract.js'
import { projectCredential } from './metrics.js'

const CLIENTS = { qoder: { displayName: 'Qoder', api: 'openai-completions' }, codex: { displayName: 'Codex', api: 'openai-responses' } }
const RETRYABLE = new Set(['management-unreachable', 'management-unavailable', 'proxy-unreachable', 'models-not-ready', 'provider-adapter-unavailable', 'provider-settings-unavailable'])

function failure(error) {
  return error instanceof PluginError ? { code: error.code, message: error.message }
    : { code: 'provider-sync-failed', message: 'Harness 供应商同步失败，请重试并检查配置服务。' }
}

export async function fetchProxyModels(baseUrl, apiKey, signal) {
  let response
  try {
    response = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(4000)].filter(Boolean)),
    })
  } catch {
    signal?.throwIfAborted()
    throw new PluginError('proxy-unreachable', '代理模型接口尚未就绪。')
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new PluginError(response.status === 401 || response.status === 403 ? 'proxy-key-invalid' : 'proxy-unreachable', `代理模型接口拒绝请求（HTTP ${response.status}）。`)
  }
  let payload
  try { payload = await response.json() } catch { throw new PluginError('invalid-models', '代理返回的模型列表无效。') }
  if (!Array.isArray(payload?.data)) throw new PluginError('invalid-models', '代理返回的模型列表无效。')
  return payload.data.filter(model => model && typeof model.id === 'string' && model.id.trim())
}

function modelProfile(model, metadata) {
  const result = { id: model.id, name: metadata?.display_name || model.name || model.id }
  const contextWindow = metadata?.context_length || metadata?.max_context_length
  const maxTokens = metadata?.max_completion_tokens || metadata?.max_output_tokens
  if (Number.isSafeInteger(contextWindow) && contextWindow > 0) result.contextWindow = contextWindow
  if (Number.isSafeInteger(maxTokens) && maxTokens > 0) result.maxTokens = maxTokens
  return result
}

export class ProviderSync {
  constructor({ getSettings, loadContext, fetchModels = fetchCredentialModels, fetchListing = fetchProxyModels, now = Date.now,
    setTimer = setTimeout, clearTimer = clearTimeout, readinessMs = 30000, retryMs = 1000 }) {
    Object.assign(this, { getSettings, loadContext, fetchModels, fetchListing, now, setTimer, clearTimer, readinessMs, retryMs })
    this.state = { status: 'unavailable', providers: Object.fromEntries(Object.keys(CLIENTS).map(id => [id, { status: 'idle', modelCount: 0, lastSuccessAt: null }])), code: 'provider-services-unavailable', message: '等待 Harness 模型配置服务。', lastAttemptAt: null }
    this.closed = false
  }

  snapshot() {
    return structuredClone({ ...this.state, intervalMinutes: this.getSettings().modelSyncIntervalMinutes, nextCheckAt: this.nextCheckAt || null })
  }

  attach(writer) {
    this.writer = writer
    this.closed = false
    void this.sync('enable')
  }

  cancelTimer() {
    if (this.timer !== undefined) this.clearTimer(this.timer)
    this.timer = undefined
    this.nextCheckAt = null
  }

  async detach() {
    this.closed = true
    this.cancelTimer()
    this.controller?.abort()
    await this.pending
    this.writer = undefined
    this.state.status = 'unavailable'
  }

  trigger(reason) {
    if (this.getSettings().modelSyncIntervalMinutes === 0) return
    if (this.pending) { this.queued = reason; return }
    void this.sync(reason)
  }

  sync(reason = 'manual') {
    if (this.pending) return this.pending
    if (this.closed || !this.writer) return Promise.resolve(this.snapshot())
    this.cancelTimer()
    this.controller = new AbortController()
    this.state = { ...this.state, status: 'running', code: null, message: '', lastAttemptAt: this.now() }
    const budget = ['enable', 'start', 'authentication'].includes(reason) ? this.readinessMs : 0
    const deadline = this.now() + budget
    const signal = budget > 0 ? AbortSignal.any([this.controller.signal, AbortSignal.timeout(budget)]) : this.controller.signal
    this.pending = this.run(deadline, signal).finally(() => {
      this.pending = undefined
      if (this.closed) return
      if (this.queued) {
        const queued = this.queued
        this.queued = undefined
        this.trigger(queued)
        return
      }
      const minutes = this.getSettings().modelSyncIntervalMinutes
      if (minutes > 0) {
        this.nextCheckAt = this.now() + minutes * 60000
        this.timer = this.setTimer(() => { void this.sync('timer') }, minutes * 60000)
        this.timer?.unref?.()
      }
    })
    return this.pending
  }

  wait(signal) {
    return new Promise(resolve => {
      const done = () => { this.clearTimer(timer); signal.removeEventListener('abort', done); resolve() }
      const timer = this.setTimer(done, this.retryMs)
      timer?.unref?.()
      signal.addEventListener('abort', done, { once: true })
      if (signal.aborted) done()
    })
  }

  async run(deadline, signal) {
    do {
      try {
        const context = await this.loadContext(signal)
        signal.throwIfAborted()
        const listing = await this.fetchListing(context.baseUrl, context.apiKey, signal)
        const metadata = new Map(listing.map(model => [model.id, model]))
        const credentials = context.credentials.map(projectCredential)
        for (const [id, client] of Object.entries(CLIENTS)) {
          signal.throwIfAborted()
          const files = credentials.filter(file => (file.type || file.provider).toLowerCase() === id && file.name && !file.disabled && !file.unavailable && !file.requiresSignIn).sort((a, b) => a.name.localeCompare(b.name))
          const previous = this.state.providers[id]
          try {
            if (!files.length) throw new PluginError('no-credentials', '没有可用凭证，保留最近成功配置。')
            // A partial account failure must not replace the catalog with a subset.
            const catalogs = await Promise.all(files.map(file => this.fetchModels(context.baseUrl, context.password, file.name, { signal })))
            const models = new Map()
            for (const catalog of catalogs) for (const model of catalog.models) {
              if (metadata.has(model.id)) models.set(model.id, modelProfile(model, metadata.get(model.id)))
            }
            if (!models.size) throw new PluginError('models-not-ready', '凭证模型尚未就绪，保留最近成功配置。')
            const profile = { ...client, baseURL: `${context.baseUrl}/v1`, models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)) }
            const result = await this.writer.save(id, profile, context.apiKey, signal)
            this.state.providers[id] = { status: result.changed ? 'synced' : 'unchanged', modelCount: models.size, lastSuccessAt: this.now(), code: null, message: '' }
          } catch (error) {
            signal.throwIfAborted()
            this.state.providers[id] = { ...previous, status: error.code === 'no-credentials' ? 'waiting' : 'error', ...failure(error) }
          }
        }
        const results = Object.values(this.state.providers)
        const failed = results.filter(row => row.status === 'error')
        const ready = results.some(row => ['synced', 'unchanged'].includes(row.status))
        this.state.status = ready ? 'success' : 'waiting'
        if (failed.length) this.state.status = ready ? 'partial' : 'error'
        this.state.code = null
        this.state.message = ''
        if (ready && !failed.some(row => RETRYABLE.has(row.code))) break
        if (!ready && !results.some(row => RETRYABLE.has(row.code))) break
      } catch (error) {
        if (signal.aborted) break
        const details = failure(error)
        this.state = { ...this.state, status: 'error', ...details }
        if (!RETRYABLE.has(details.code)) break
      }
      if (this.now() >= deadline || signal.aborted) break
      await this.wait(signal)
    } while (!signal.aborted)
    if (signal.aborted && !this.closed) {
      this.state = { ...this.state, status: 'error', code: 'sync-timeout', message: '等待代理就绪超时，可点击「立即同步」重试。' }
    }
    return this.snapshot()
  }
}

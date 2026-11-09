import { ConfigFile, expandHome, parseYaml, serverSummary } from './config-file.js'
import { scanAuth } from './auth.js'
import { authenticationClients } from './authentication.js'
import { ProcessManager } from './process-manager.js'
import { ManagementCredentials } from './management-credentials.js'
import { fetchManagementJson } from './management-api.js'
import { ProviderSync } from './provider-sync.js'
import { fetchDashboard } from './metrics.js'
import { fetchCredentialDetails, fetchCredentialModels, fetchCredentialQuota } from './credential-data.js'
import { errorPayload, parseCredentialFileRequest, parseCredentialRequest, parseSaveRequest, parseSettingsPatch, parseValidateRequest, PluginError, resolveSettings } from './contract.js'

export async function probe(url) {
  if (!url) return { status: 'unknown' }
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(1500) })
    if (response.body?.cancel) await response.body.cancel().catch(() => {})
    return { status: response.ok ? 'reachable' : 'unavailable', httpStatus: response.status }
  } catch (error) {
    return { status: 'unreachable', message: error.name === 'TimeoutError' ? '连接超时' : '无法连接服务' }
  }
}

function emptyDashboard(status, extra = {}) {
  return {
    status,
    traffic: { buckets: [], totalSuccess: 0, totalFailure: 0, total: 0, successRate: null, peakTotal: 0, peakIndex: -1, windowMinutes: 0 },
    providers: [], credentials: [], ...extra,
  }
}

export class CliproxyService {
  constructor({ config = {}, subprocess, credentials, configEditor, entry, fetchProbe = probe, dashboardLoader = fetchDashboard }) {
    this.config = { ...config }
    this.configEditor = configEditor
    this.entry = entry
    this.fetchProbe = fetchProbe
    this.dashboardLoader = dashboardLoader
    this.management = new ManagementCredentials(credentials)
    this.providerSync = new ProviderSync({ getSettings: () => this.settings(), loadContext: signal => this.providerContext(signal) })
    this.processes = new ProcessManager(subprocess, { onAuthenticated: () => this.providerSync.trigger('authentication') })
    this.quotaCache = new Map()
  }

  settings() {
    return resolveSettings(this.config)
  }

  file() {
    if (!this.settings().configPath) throw new PluginError('config-not-configured', '请先在「配置」中设置代理配置文件的绝对路径。')
    return new ConfigFile(this.settings().configPath)
  }

  managementUrl(server) {
    return this.settings().managementUrl || server?.managementUrl || ''
  }

  async loadDashboard(server, health) {
    if (!server?.baseUrl || health.status !== 'reachable') return emptyDashboard('offline')
    const password = await this.management.read()
    if (!password) return emptyDashboard('needs-key')
    try {
      const result = await this.dashboardLoader(server.baseUrl, password)
      return { status: 'ready', ...result }
    } catch (error) {
      return emptyDashboard('error', { code: error.code || 'management-unreachable', message: error.message })
    }
  }

  async snapshot() {
    const settings = this.settings()
    let config
    let auth
    try {
      const file = await this.file().read()
      const { text: _source, ...summary } = file
      config = summary
      auth = await scanAuth(file.server.authDir)
    } catch (error) {
      config = { ok: false, path: settings.configPath, ...errorPayload(error) }
      auth = {
        ok: false, directory: '', authenticated: 0, total: 0, status: 'unknown', accounts: [],
        error: '配置文件可用后才能确定认证目录。',
      }
    }
    const managementUrl = this.managementUrl(config.server)
    const health = await this.fetchProbe(managementUrl)
    const dashboard = await this.loadDashboard(config.server, health)
    auth.clients = authenticationClients(settings, auth, dashboard)
    return {
      ok: true,
      settings,
      config,
      auth,
      dashboard,
      managementCredentialConfigured: await this.management.configured(),
      managementUrl,
      health,
      processes: this.processes.snapshot(),
      generatedAt: Date.now(),
      providerSync: this.providerSync.snapshot(),
    }
  }

  async readConfig() {
    return this.file().read()
  }

  async providerContext(signal) {
    const file = await this.file().read()
    const config = parseYaml(file.text)
    const keys = config.access?.['api-keys'] ?? config['api-keys']
    const apiKey = Array.isArray(keys) ? keys.find(key => typeof key === 'string' && key.trim())?.trim() : undefined
    if (!apiKey) throw new PluginError('proxy-key-missing', '请在代理 YAML 的 access.api-keys 中配置客户端访问密钥。')
    const password = await this.management.read()
    if (!password) throw new PluginError('management-key-missing', '请先配置代理管理密码。')
    const payload = await fetchManagementJson(file.server.baseUrl, password, 'credentials', { signal })
    if (!Array.isArray(payload?.files)) throw new PluginError('invalid-credentials', '管理接口返回的凭证列表无效。')
    return { baseUrl: file.server.baseUrl, apiKey, password, credentials: payload.files }
  }

  async validateConfig(request) {
    const { text } = parseValidateRequest(request)
    const config = parseYaml(text)
    return { ok: true, valid: true, server: serverSummary(config) }
  }

  async saveConfig(request) {
    return this.file().save(parseSaveRequest(request))
  }

  async updateSettings(request) {
    const patch = parseSettingsPatch(request)
    if (patch.configPath) expandHome(patch.configPath)
    if (!this.configEditor || this.entry === undefined) {
      throw new PluginError('config-editor-unavailable', '当前 Profile 无法保存插件设置。')
    }
    const next = { ...this.settings(), ...patch }
    await this.configEditor.edit(this.entry, current => ({ ...current, ...patch }))
    this.config = next
    return { ok: true, settings: next }
  }

  async saveManagementCredential(request) {
    const { password } = parseCredentialRequest(request)
    const file = await this.file().read()
    await this.dashboardLoader(file.server.baseUrl, password)
    await this.management.save(password)
    return { ok: true, configured: true }
  }

  async copyManagementCredential() {
    return this.management.reveal()
  }

  async credentialContext(request) {
    const { name } = parseCredentialFileRequest(request)
    const file = await this.file().read()
    const password = await this.management.read()
    if (!password) throw new PluginError('management-unauthorized', '请先在面板中配置管理密码。')
    return { name, baseUrl: file.server.baseUrl, password, configuration: parseYaml(file.text) }
  }

  async credentialModels(request, signal) {
    const { name, baseUrl, password } = await this.credentialContext(request)
    return fetchCredentialModels(baseUrl, password, name, { signal })
  }

  async credentialDetails(request, signal) {
    const { name, baseUrl, password } = await this.credentialContext(request)
    return fetchCredentialDetails(baseUrl, password, name, { signal })
  }

  async credentialQuota(request, signal, refresh = false) {
    const { name, baseUrl, password, configuration } = await this.credentialContext(request)
    const key = JSON.stringify([baseUrl, name, configuration.qoder?.['vpc-endpoint'] || ''])
    const cached = this.quotaCache.get(key)
    if (!refresh && cached && cached.until > Date.now()) return cached.promise
    const record = {
      promise: fetchCredentialQuota(baseUrl, password, name, { signal, qoderConfig: configuration.qoder }),
      until: Date.now() + 30000,
    }
    this.quotaCache.set(key, record)
    try { return await record.promise }
    catch (error) {
      if (this.quotaCache.get(key) === record) this.quotaCache.delete(key)
      throw error
    }
  }

  async refreshCredentialQuota(request, signal) {
    return this.credentialQuota(request, signal, true)
  }

  async start() {
    const password = await this.management.ensure()
    const result = await this.processes.start(this.settings(), password)
    this.providerSync.trigger('start')
    return result
  }

  async stop() {
    return this.processes.stop()
  }

  async authenticate() {
    const settings = this.settings()
    if (!settings.authClients.length) throw new PluginError('authentication-not-configured', '请先选择认证 CLI 客户端。')
    if (!settings.startCommand) throw new PluginError('invalid-command', '请先设置启动命令。')
    const snapshot = await this.snapshot()
    if (!snapshot.config.ok) throw new PluginError(snapshot.config.code, snapshot.config.message)
    const commands = snapshot.auth.clients.filter(client => client.selected && client.needsAuthentication)
    if (!commands.length) throw new PluginError('authentication-not-needed', '所选客户端已认证，或认证状态尚未确认。')
    const result = await this.processes.authenticate(settings, commands)
    this.quotaCache.clear()
    return result
  }

  async stopAuthentication() {
    return this.processes.stopAuthentication()
  }

  async dispose() {
    await this.providerSync.detach()
    await this.processes.dispose()
  }

  async runAction(action, request) {
    switch (action) {
      case 'snapshot': return this.snapshot()
      case 'read_config': return this.readConfig()
      case 'validate_config': return this.validateConfig(request)
      case 'save_config': return this.saveConfig(request)
      case 'update_settings': return this.updateSettings(request)
      case 'start': return this.start()
      case 'stop': return this.stop()
      case 'authenticate': return this.authenticate()
      case 'stop_authentication': return this.stopAuthentication()
      case 'sync_providers': return this.providerSync.sync()
      default: throw new PluginError('invalid-action', `不支持的操作：${action}`)
    }
  }
}

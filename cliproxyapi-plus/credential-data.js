import { PluginError } from './contract.js'
import { fetchManagementJson } from './management-api.js'
import { fetchQoderQuota, projectQuota, resolveQoderQuotaUrl } from './quota.js'
import { fetchCodexQuota } from './codex-quota.js'

export { projectQuota } from './quota.js'

const secretField = /(?:token|secret|password|authorization|cookie|api[-_]?key|private[-_]?key|machine[-_]?code)/i

export function redactCredentialDetails(value) {
  if (Array.isArray(value)) return value.map(redactCredentialDetails)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, secretField.test(key) && entry !== null && entry !== '' ? '[REDACTED]' : redactCredentialDetails(entry),
    ]))
  }
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, '[REDACTED]')
  }
  return value
}

export async function fetchCredentialModels(baseUrl, password, name, options) {
  const payload = await fetchManagementJson(baseUrl, password, `credentials/models?name=${encodeURIComponent(name)}`, options)
  if (!Array.isArray(payload?.models)) throw new PluginError('invalid-models', '管理接口返回的模型列表无效。')
  return {
    name,
    models: payload.models.filter(model => model && typeof model.id === 'string').map(model => ({
      id: model.id,
      name: typeof model.display_name === 'string' ? model.display_name : model.id,
      provider: typeof model.owned_by === 'string' ? model.owned_by : '',
      type: typeof model.type === 'string' ? model.type : '',
    })),
  }
}

export async function fetchCredentialDetails(baseUrl, password, name, options) {
  const payload = await fetchManagementJson(baseUrl, password, `credentials/download?name=${encodeURIComponent(name)}`, options)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PluginError('invalid-credential-file', '凭证文件必须是 JSON 对象。')
  }
  return { name, content: redactCredentialDetails(payload), redacted: true }
}

export async function fetchCredentialQuota(baseUrl, password, name, options = {}) {
  const payload = await fetchManagementJson(baseUrl, password, `credentials?name=${encodeURIComponent(name)}`, options)
  if (!Array.isArray(payload?.files)) throw new PluginError('invalid-credentials', '管理接口返回的凭证列表无效。')
  const file = payload.files.find(entry => entry?.name === name)
  if (!file) throw new PluginError('credential-not-found', '凭证已移除，请重新加载凭证列表。')
  const provider = String(file.type || file.provider || '').toLowerCase()
  let usage
  if (provider === 'qoder') usage = await fetchQoderQuota(baseUrl, password, file, { ...options, qoderQuotaUrl: resolveQoderQuotaUrl({ qoder: options.qoderConfig }) })
  else if (provider === 'codex') usage = await fetchCodexQuota(baseUrl, password, file, options)
  else usage = projectQuota(file.usage)
  return { name, usage, observedAt: Date.now(), source: ['qoder', 'codex'].includes(provider) ? provider : 'management-snapshot' }
}

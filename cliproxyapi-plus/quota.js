import { PluginError } from './contract.js'
import { fetchManagementJson } from './management-api.js'

function amount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function percentage(value) {
  return value === null ? null : Number(Math.min(100, Math.max(0, value)).toFixed(4))
}

function resetTime(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const number = Number(value)
  if (Number.isFinite(number)) return number > 0 ? (number < 100_000_000_000 ? number * 1000 : number) : null
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function quotaBucket(source, resetAt = null) {
  let total = amount(source?.total)
  const used = amount(source?.used)
  const remaining = amount(source?.remaining)
  if (total === null && used !== null && remaining !== null) total = used + remaining
  const ratio = amount(source?.percentage)
  let usedPercent = null
  if (total > 0 && used !== null) usedPercent = used / total * 100
  else if (total > 0 && remaining !== null) usedPercent = (1 - remaining / total) * 100
  else if (ratio !== null) usedPercent = ratio <= 1 ? ratio * 100 : ratio
  else if (total === 0 && used === 0) usedPercent = 0
  let remainingPercent = null
  if (total > 0) {
    remainingPercent = remaining === null ? (usedPercent === null ? null : 100 - usedPercent) : remaining / total * 100
  }
  return {
    total, used, remaining,
    usedPercent: percentage(usedPercent), remainingPercent: percentage(remainingPercent),
    unit: typeof source?.unit === 'string' && source.unit.trim() ? source.unit.trim().slice(0, 40) : 'credits',
    resetAt: resetTime(source?.resetAt ?? source?.reset_at ?? resetAt),
  }
}

export function projectQuota(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const expiresAt = source.expires_at ?? source.expiresAt
  const personal = quotaBucket(source.userQuota ?? source.user_quota ?? source.package ?? source, expiresAt)
  const shared = quotaBucket(source.orgResourcePackage ?? source.org_resource_package ?? source.shared ?? {
    total: source.org_resource_total,
    used: source.org_resource_used,
    remaining: source.org_resource_remaining ?? source.orgResourceRemaining,
    percentage: source.org_resource_percentage,
    unit: source.unit,
  })
  if ([personal.total, personal.used, personal.remaining, shared.total, shared.used, shared.remaining].every(value => value === null)) return null
  const plan = source.planName ?? source.plan_name ?? source.userQuota?.planName
  return {
    total: personal.total, used: personal.used, remaining: personal.remaining, remainingPercent: personal.remainingPercent,
    orgRemaining: shared.remaining, unit: personal.unit,
    expiresAt: typeof expiresAt === 'string' || (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) ? expiresAt : null,
    exceeded: source.is_quota_exceeded === true || source.isQuotaExceeded === true,
    package: { ...personal, plan: typeof plan === 'string' ? plan.slice(0, 60) : null },
    shared,
  }
}

export function resolveQoderQuotaUrl(config) {
  let instance = String(config?.qoder?.['vpc-endpoint'] || '').trim().toLowerCase()
  if (!instance) return 'https://openapi.qoder.sh/api/v2/quota/usage'
  if (instance.endsWith('.vpc.qoder.com.cn')) instance = instance.slice(0, -'.vpc.qoder.com.cn'.length).replace(/-(?:openapi|gateway)$/, '')
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(instance)) {
    throw new PluginError('invalid-qoder-endpoint', 'Qoder VPC 实例配置无效，请检查 qoder.vpc-endpoint。')
  }
  return `https://${instance}-openapi.vpc.qoder.com.cn/api/v2/quota/usage`
}

export async function fetchQuotaJson(baseUrl, password, credential, url, options = {}) {
  const provider = options.providerLabel || '提供方'
  const authIndex = credential.auth_index ?? credential.authIndex
  if (authIndex === undefined || authIndex === null || !String(authIndex).trim()) {
    throw new PluginError('quota-credential-unavailable', '凭证缺少查询标识，请重新加载凭证列表。')
  }
  const result = await fetchManagementJson(baseUrl, password, 'requests/api-call', {
    ...options,
    method: 'POST', timeoutMs: 20000,
    body: {
      auth_index: String(authIndex), method: 'GET', url,
      header: { ...options.header, Authorization: 'Bearer $TOKEN$', Accept: 'application/json' },
    },
  })
  if (result?.status_code < 200 || result?.status_code >= 300 || typeof result?.status_code !== 'number') {
    const authenticationFailed = result?.status_code === 401 || result?.status_code === 403
    throw new PluginError('quota-unavailable', authenticationFailed ? `${provider} 额度认证已失效，请重新认证。` : `暂时无法读取 ${provider} 额度，请稍后重试。`)
  }
  let payload
  try { payload = typeof result.body === 'string' ? JSON.parse(result.body) : result.body }
  catch { throw new PluginError('invalid-quota', `${provider} 返回的额度数据无效。`) }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new PluginError('invalid-quota', `${provider} 返回的额度数据无效。`)
  return payload
}

export async function fetchQoderQuota(baseUrl, password, credential, options = {}) {
  const payload = await fetchQuotaJson(baseUrl, password, credential, options.qoderQuotaUrl || resolveQoderQuotaUrl({}), { ...options, providerLabel: 'Qoder' })
  const usage = projectQuota(payload)
  if (!usage) throw new PluginError('invalid-quota', 'Qoder 暂未提供套餐或共享资源包额度。')
  return usage
}

export { amount as quotaAmount, resetTime as quotaResetTime }

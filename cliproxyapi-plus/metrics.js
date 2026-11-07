import { projectQuota } from './credential-data.js'
import { fetchManagementJson } from './management-api.js'

const MAX_BUCKETS = 20
const SECONDS_TIMESTAMP_LIMIT = 0xe8d4a51000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNonNegative(value, coerce = false) {
  if (!coerce && typeof value !== 'number' && typeof value !== 'string') return 0
  if (typeof value === 'string' && !value.trim()) return 0
  let number
  try { number = Number(value) } catch { return 0 }
  return Number.isFinite(number) && number > 0 ? number : 0
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeStatusMessage(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, '<redacted>')
    .slice(0, 500)
}

function flag(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return typeof value === 'string' && value.trim().toLowerCase() === 'true'
}

export function normalizeRecentRequests(value) {
  if (!Array.isArray(value)) return []
  return value.slice(-MAX_BUCKETS).map(entry => {
    const source = entry !== null && typeof entry === 'object' ? entry : {}
    const time = typeof source.time === 'string' && source.time ? source.time : undefined
    return {
      ...(time ? { time } : {}),
      success: finiteNonNegative(source.success, true),
      failed: finiteNonNegative(source.failed, true),
    }
  })
}

export function mergeBucketGroups(groups) {
  if (!Array.isArray(groups)) return []
  const normalized = groups.map(normalizeRecentRequests).filter(group => group.length > 0)
  if (normalized.length === 0) return []

  const length = Math.min(MAX_BUCKETS, Math.max(...normalized.map(group => group.length)))
  const buckets = Array.from({ length }, () => ({ success: 0, failed: 0 }))
  for (const group of normalized) {
    const aligned = group.slice(-length)
    const offset = length - aligned.length
    aligned.forEach((entry, index) => {
      const bucket = buckets[offset + index]
      bucket.success += entry.success
      bucket.failed += entry.failed
      if (!bucket.time && entry.time) bucket.time = entry.time
    })
  }
  return buckets
}

function credentialModified(source) {
  for (const value of [source.modified, source.modtime, source.updated_at, source.last_refresh]) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? (value < SECONDS_TIMESTAMP_LIMIT ? value * 1000 : value) : 0
    }
    if (typeof value !== 'string' || !value.trim()) continue
    const trimmed = value.trim()
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      return numeric > 0 ? (numeric < SECONDS_TIMESTAMP_LIMIT ? numeric * 1000 : numeric) : 0
    }
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function stableCredentialId(source) {
  const value = source.auth_index ?? source.authIndex
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return text(value)
}

function usageStats(value) {
  const source = isRecord(value) ? value : {}
  return {
    success: finiteNonNegative(source.success),
    failed: finiteNonNegative(source.failed),
    recentRequests: normalizeRecentRequests(source.recent_requests ?? source.recentRequests),
  }
}

export function projectCredential(entry) {
  const source = isRecord(entry) ? entry : {}
  const id = stableCredentialId(source)
  return {
    ...(id ? { id } : {}),
    name: text(source.name),
    type: text(source.type),
    provider: text(source.provider),
    email: text(source.email),
    disabled: flag(source.disabled),
    unavailable: flag(source.unavailable),
    requiresSignIn: flag(source.requires_sign_in ?? source.requiresSignIn),
    statusMessage: safeStatusMessage(source.status_message) || safeStatusMessage(source.statusMessage),
    modified: credentialModified(source),
    size: finiteNonNegative(source.size),
    success: finiteNonNegative(source.success),
    failed: finiteNonNegative(source.failed),
    recentRequests: normalizeRecentRequests(source.recent_requests ?? source.recentRequests),
    usage: projectQuota(source.usage),
  }
}

export function describeAuthFiles(credentialsPayload) {
  const files = Array.isArray(credentialsPayload?.files) ? credentialsPayload.files : []
  return files.filter(isRecord).map(projectCredential).sort((left, right) => left.name.localeCompare(right.name))
}

function credentialProvider(entry) {
  const provider = String(entry.type ?? entry.provider ?? '').trim().toLowerCase()
  return provider && provider !== 'empty' ? provider : 'unknown'
}

function compositeAccount(compositeKey) {
  const separator = compositeKey.indexOf('|')
  return separator < 0 ? '' : compositeKey.slice(separator + 1).trim()
}

function providerSummary() {
  return { credentials: 0, success: 0, failure: 0, bucketGroups: [] }
}

function trafficSummary(groups) {
  const buckets = mergeBucketGroups(groups)
  let totalSuccess = 0
  let totalFailure = 0
  let peakTotal = 0
  let peakIndex = -1
  buckets.forEach((bucket, index) => {
    const total = bucket.success + bucket.failed
    totalSuccess += bucket.success
    totalFailure += bucket.failed
    if (total > peakTotal) {
      peakTotal = total
      peakIndex = index
    }
  })
  const total = totalSuccess + totalFailure
  return {
    buckets,
    totalSuccess,
    totalFailure,
    total,
    successRate: total > 0 ? totalSuccess / total * 100 : null,
    peakTotal,
    peakIndex,
    windowMinutes: buckets.length * 10,
  }
}

export function aggregateUsage({ credentialsPayload, apiKeyUsagePayload } = {}) {
  const providers = new Map()
  const trafficGroups = []
  const usageAccounts = new Set()
  const providerFor = id => {
    if (!providers.has(id)) providers.set(id, providerSummary())
    return providers.get(id)
  }
  const add = (summary, stats) => {
    summary.credentials += 1
    summary.success += stats.success
    summary.failure += stats.failed
    if (stats.recentRequests.length > 0) {
      summary.bucketGroups.push(stats.recentRequests)
      trafficGroups.push(stats.recentRequests)
    }
  }

  if (isRecord(apiKeyUsagePayload)) {
    for (const [rawProvider, rawEntries] of Object.entries(apiKeyUsagePayload)) {
      const provider = rawProvider.trim().toLowerCase()
      if (!provider || !isRecord(rawEntries)) continue
      const summary = providerFor(provider)
      for (const [compositeKey, rawStats] of Object.entries(rawEntries)) {
        const account = compositeAccount(compositeKey)
        if (account) usageAccounts.add(account)
        add(summary, usageStats(rawStats))
      }
    }
  }

  const files = Array.isArray(credentialsPayload?.files) ? credentialsPayload.files : []
  for (const entry of files) {
    if (!isRecord(entry)) continue
    const accountType = String(entry.account_type ?? '').trim().toLowerCase()
    const account = String(entry.account ?? '').trim()
    if (accountType === 'api_key' && account && usageAccounts.has(account)) continue
    add(providerFor(credentialProvider(entry)), usageStats(entry))
  }

  const projectedProviders = Array.from(providers, ([id, summary]) => {
    const total = summary.success + summary.failure
    return {
      id,
      credentials: summary.credentials,
      success: summary.success,
      failure: summary.failure,
      total,
      successRate: total > 0 ? summary.success / total * 100 : null,
      buckets: mergeBucketGroups(summary.bucketGroups),
    }
  }).sort((left, right) => right.total - left.total || right.credentials - left.credentials || left.id.localeCompare(right.id))

  return {
    traffic: trafficSummary(trafficGroups),
    providers: projectedProviders,
    credentials: describeAuthFiles(credentialsPayload),
  }
}

export async function fetchDashboard(baseUrl, password, fetchImpl = globalThis.fetch) {
  const [credentialsPayload, apiKeyUsagePayload] = await Promise.all([
    fetchManagementJson(baseUrl, password, 'credentials', { fetchImpl }),
    fetchManagementJson(baseUrl, password, 'observability/usage/api-keys', { fetchImpl }),
  ])
  return aggregateUsage({ credentialsPayload, apiKeyUsagePayload })
}

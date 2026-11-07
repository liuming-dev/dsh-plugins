import { PluginError } from './contract.js'
import { fetchQuotaJson, quotaAmount, quotaResetTime } from './quota.js'

const CODEX_BASE = 'https://chatgpt.com/backend-api'

function windowsForGroup(group, prefix, feature, now) {
  if (!group || typeof group !== 'object') return []
  return [group.primary_window ?? group.primaryWindow, group.secondary_window ?? group.secondaryWindow].flatMap((window, index) => {
    if (!window || typeof window !== 'object') return []
    const seconds = quotaAmount(window.limit_window_seconds ?? window.limitWindowSeconds)
    const used = quotaAmount(window.used_percent ?? window.usedPercent)
    const resetAfter = quotaAmount(window.reset_after_seconds ?? window.resetAfterSeconds)
    const resetAt = quotaResetTime(window.reset_at ?? window.resetAt) ?? (resetAfter === null ? null : now + resetAfter * 1000)
    const limited = group.limit_reached === true || group.limitReached === true || group.allowed === false
    const usedPercent = used === null ? (limited && resetAt ? 100 : null) : Math.min(100, used)
    let period = index === 0 ? 'fiveHour' : 'weekly'
    if (seconds === 18000) period = 'fiveHour'
    else if (seconds === 604800) period = 'weekly'
    else if (seconds >= 2419200 && seconds <= 2678400) period = 'monthly'
    else if (seconds) period = 'custom'
    return [{ id: `${prefix}-${index}`, feature, period, periodHours: seconds === null ? null : seconds / 3600,
      usedPercent, remainingPercent: usedPercent === null ? null : 100 - usedPercent, resetAt }]
  })
}

export function projectCodexQuota(payload, { claims = {}, subscription, resetCredits, now = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const windows = [
    ...windowsForGroup(payload.rate_limit ?? payload.rateLimit, 'coding', '', now),
    ...windowsForGroup(payload.code_review_rate_limit ?? payload.codeReviewRateLimit, 'review', 'review', now),
  ]
  const additional = payload.additional_rate_limits ?? payload.additionalRateLimits
  if (Array.isArray(additional)) additional.forEach((group, index) => {
    const feature = String(group?.limit_name ?? group?.limitName ?? group?.metered_feature ?? `Additional ${index + 1}`).slice(0, 100)
    windows.push(...windowsForGroup(group?.rate_limit ?? group?.rateLimit, `additional-${index}`, feature, now))
  })
  const plan = payload.plan_type ?? payload.planType ?? claims.plan_type
  const creditBalance = quotaAmount(payload.credits?.balance)
  const fallbackCredits = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits
  const resetInfo = resetCredits || fallbackCredits || {}
  const entries = Array.isArray(resetInfo.credits) ? resetInfo.credits.filter(entry => entry?.status === 'available'
    && (entry.reset_type ?? entry.resetType) === 'codex_rate_limits') : []
  const resets = entries.map(entry => ({ expiresAt: quotaResetTime(entry?.expires_at ?? entry?.expiresAt) })).filter(entry => entry.expiresAt !== null)
  const resetCount = quotaAmount(resetInfo.available_count ?? resetInfo.availableCount)
    ?? quotaAmount(fallbackCredits?.available_count ?? fallbackCredits?.availableCount)
    ?? (Array.isArray(resetInfo.credits) ? entries.length : null)
  if (!windows.length && !plan && creditBalance === null && resetCount === null) return null
  return {
    kind: 'codex', plan: typeof plan === 'string' ? plan.slice(0, 80) : null,
    renewsAt: quotaResetTime(subscription?.active_until ?? subscription?.activeUntil ?? claims.chatgpt_subscription_active_until),
    creditBalance, unlimitedCredits: payload.credits?.unlimited === true,
    resetCount, resets, windows,
  }
}

export async function fetchCodexQuota(baseUrl, password, credential, options = {}) {
  const claims = credential.id_token && typeof credential.id_token === 'object' ? credential.id_token : {}
  const accountValue = credential.chatgpt_account_id ?? claims.chatgpt_account_id
  const accountId = typeof accountValue === 'string' ? accountValue.trim() : ''
  const header = { 'User-Agent': 'codex-tui/0.149.1' }
  if (typeof accountId === 'string' && accountId.trim()) header['Chatgpt-Account-Id'] = accountId.trim()
  const query = (path, extraHeader = {}) => fetchQuotaJson(baseUrl, password, credential, `${CODEX_BASE}/${path}`, {
    ...options, providerLabel: 'Codex', header: { ...header, ...extraHeader },
  })
  const [usage, subscription, resetCredits] = await Promise.allSettled([
    query('wham/usage'),
    accountId ? query(`subscriptions?account_id=${encodeURIComponent(accountId)}`) : Promise.resolve(null),
    query('wham/rate-limit-reset-credits', { 'OpenAI-Beta': 'codex-1', Originator: 'Codex Desktop' }),
  ])
  if (usage.status === 'rejected') throw usage.reason
  const result = projectCodexQuota(usage.value, {
    claims, subscription: subscription.status === 'fulfilled' ? subscription.value : null,
    resetCredits: resetCredits.status === 'fulfilled' ? resetCredits.value : null,
  })
  if (!result) throw new PluginError('invalid-quota', 'Codex 暂未提供额度数据。')
  result.partial = subscription.status === 'rejected' || resetCredits.status === 'rejected'
  return result
}

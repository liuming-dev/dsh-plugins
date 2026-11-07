import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchCodexQuota, projectCodexQuota } from '../codex-quota.js'
import { fetchCredentialQuota } from '../credential-data.js'

const usage = () => ({
  plan_type: 'pro', credits: { balance: '0', unlimited: false },
  rate_limit: { primary_window: { used_percent: 56, limit_window_seconds: 604800, reset_at: 1794408000 } },
  token: 'never-return-token',
})
const response = payload => ({ ok: true, status: 200, json: async () => payload })

test('Codex projects plan, zero Credits, subscription renewal, weekly balance and available reset expiry', () => {
  const quota = projectCodexQuota(usage(), {
    subscription: { active_until: 1794796620 },
    resetCredits: { available_count: 2, credits: [
      { status: 'available', reset_type: 'codex_rate_limits', expires_at: '2026-12-01T00:00:00Z', id: 'private-reset-id' },
      { status: 'available', reset_type: 'codex_rate_limits', expires_at: '2026-12-02T00:00:00Z' },
      { status: 'used', reset_type: 'codex_rate_limits', expires_at: '2026-12-03T00:00:00Z' },
      { status: 'available', reset_type: 'other', expires_at: '2026-12-04T00:00:00Z' },
    ] },
  })
  assert.equal(quota.plan, 'pro')
  assert.equal(quota.creditBalance, 0)
  assert.equal(quota.resetCount, 2)
  assert.equal(quota.resets.length, 2)
  assert.equal(quota.renewsAt, 1794796620000)
  assert.equal(quota.windows[0].period, 'weekly')
  assert.equal(quota.windows[0].remainingPercent, 44)
  assert.equal(JSON.stringify(quota).includes('private-'), false)
  assert.equal(JSON.stringify(quota).includes('never-return'), false)
})

test('window durations, rather than primary/secondary positions, identify Codex limits', () => {
  const quota = projectCodexQuota({
    rateLimit: { primaryWindow: { limitWindowSeconds: 604800, usedPercent: 110 }, secondaryWindow: { limitWindowSeconds: 18000, usedPercent: 0 } },
    codeReviewRateLimit: { primaryWindow: { limitWindowSeconds: 2592000, resetAfterSeconds: 30 }, allowed: false },
    additionalRateLimits: [{ limitName: 'Spark', rateLimit: { primaryWindow: { limitWindowSeconds: 7200 } } }, null],
  }, { now: 1000000 })
  assert.deepEqual(quota.windows.map(window => window.period), ['weekly', 'fiveHour', 'monthly', 'custom'])
  assert.deepEqual(quota.windows.map(window => window.remainingPercent), [0, 100, 0, null])
  assert.equal(quota.windows[2].resetAt, 1030000)
  assert.equal(quota.windows[2].feature, 'review')
  assert.equal(quota.windows[3].feature, 'Spark')
  assert.equal(quota.windows[3].periodHours, 2)
})

test('optional Codex fields retain unknown values and claims/reset fallbacks without invented balances', () => {
  const quota = projectCodexQuota({ rate_limit_reset_credits: { available_count: 0 } }, { claims: { plan_type: 'plus', chatgpt_subscription_active_until: '2026-12-01' } })
  assert.equal(quota.resetCount, 0)
  assert.equal(quota.creditBalance, null)
  assert.equal(quota.windows.length, 0)
  assert.equal(quota.plan, 'plus')
  assert.equal(quota.renewsAt, Date.parse('2026-12-01'))
  assert.equal(projectCodexQuota({ credits: { unlimited: true }, plan_type: 'team' }).unlimitedCredits, true)
  assert.equal(projectCodexQuota({ rate_limit: { primary_window: {}, secondary_window: {} } }).windows[1].period, 'weekly')
  assert.equal(projectCodexQuota({}, { resetCredits: { credits: [] } }).resetCount, 0)
  for (const payload of [null, [], undefined, {}, { credits: { balance: -1 } }]) assert.equal(projectCodexQuota(payload), null)
})

test('selected Codex credential queries usage/subscription/resets through management token placeholders only', async () => {
  const requests = []
  const result = await fetchCredentialQuota('http://local:8317', 'management-secret', 'codex-user.json', {
    fetchImpl: async (url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer management-secret')
      if (url.includes('/credentials?')) return response({ files: [{ name: 'codex-user.json', type: 'codex', auth_index: 'selected-index', id_token: { chatgpt_account_id: 'account/id', plan_type: 'pro' } }] })
      const request = JSON.parse(init.body)
      requests.push(request)
      assert.equal(url, 'http://local:8317/v8/management/requests/api-call')
      assert.equal(request.auth_index, 'selected-index')
      assert.equal(request.method, 'GET')
      assert.equal(request.header.Authorization, 'Bearer $TOKEN$')
      assert.equal(request.header['Chatgpt-Account-Id'], 'account/id')
      const payload = request.url.endsWith('/usage') ? usage()
        : request.url.includes('/subscriptions?') ? { active_until: 1794796620 } : { available_count: 2 }
      return response({ status_code: 200, body: JSON.stringify(payload) })
    },
  })
  assert.equal(requests.length, 3)
  assert.ok(requests.some(request => request.url.endsWith('/subscriptions?account_id=account%2Fid')))
  assert.equal(result.source, 'codex')
  assert.equal(result.usage.windows[0].remainingPercent, 44)
  assert.equal(result.usage.partial, false)
  assert.equal(JSON.stringify(result).includes('account/id'), false)
})

test('optional endpoint failures preserve core Codex quota; usage auth failures surface safe errors', async () => {
  const credential = { auth_index: 'index', id_token: { chatgpt_account_id: 'account' } }
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body)
    return response({ status_code: request.url.endsWith('/usage') ? 200 : 403, body: usage() })
  }
  const quota = await fetchCodexQuota('http://local', 'password', credential, { fetchImpl })
  assert.equal(quota.partial, true)
  assert.equal(quota.windows.length, 1)
  await assert.rejects(fetchCodexQuota('http://local', 'password', credential, {
    fetchImpl: async () => response({ status_code: 401, body: 'private-token' }),
  }), error => error.code === 'quota-unavailable' && !error.message.includes('private-token'))
  await assert.rejects(fetchCodexQuota('http://local', 'password', { auth_index: 'index', id_token: 'raw-token-never-use' }, {
    fetchImpl: async (_url, init) => {
      assert.equal(JSON.parse(init.body).header['Chatgpt-Account-Id'], undefined)
      return response({ status_code: 200, body: {} })
    },
  }), { code: 'invalid-quota' })
})

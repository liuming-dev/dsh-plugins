import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchCredentialDetails, fetchCredentialModels, fetchCredentialQuota, projectQuota, redactCredentialDetails } from '../credential-data.js'
import { fetchManagementJson } from '../management-api.js'
import { projectCredential } from '../metrics.js'

const response = payload => ({ ok: true, status: 200, json: async () => payload })
const options = payload => ({ fetchImpl: async () => response(payload) })

test('Qoder package and shared quotas keep separate totals, usage, balances, and reset times', () => {
  const quota = projectQuota({
    userQuota: { total: 0, used: 0, remaining: 0, percentage: 0, unit: 'credits' },
    orgResourcePackage: { total: 20000, used: 2478, remaining: 17522, percentage: .1239, unit: 'credits' },
    expiresAt: 1795363200000,
  })
  assert.equal(quota.package.total, 0)
  assert.equal(quota.package.usedPercent, 0)
  assert.equal(quota.package.resetAt, 1795363200000)
  assert.equal(quota.shared.total, 20000)
  assert.equal(quota.shared.used, 2478)
  assert.equal(quota.shared.remaining, 17522)
  assert.equal(quota.shared.usedPercent, 12.39)
})

test('quota projection preserves zero and omits unknown totals instead of reporting 100 percent', () => {
  const quota = projectQuota({ total: '100', used: 25, remaining: 75, org_resource_remaining: 500, unit: 'credits', expires_at: 1795000000000, token: 'hidden' })
  assert.equal(quota.remainingPercent, 75)
  assert.equal(quota.orgRemaining, 500)
  assert.equal(quota.expiresAt, 1795000000000)
  assert.equal(projectQuota({ total: 0, used: 0, remaining: 0, percentage: 0 }).remainingPercent, null)
  assert.equal(projectQuota({ total: 100, used: 20 }).remainingPercent, 80)
  assert.equal(projectQuota({ total: 100, percentage: .3 }).remainingPercent, 70)
  assert.equal(projectQuota({ total: 100, percentage: 30 }).remainingPercent, 70)
  assert.equal(projectQuota({ total: 100, remaining: 200 }).remainingPercent, 100)
  assert.equal(projectQuota({ total: 100, used: 200 }).remainingPercent, 0)
  assert.equal(projectQuota({ total: 100, expiresAt: { token: 'hidden' } }).expiresAt, null)
  assert.equal(projectQuota({ remaining: 1, is_quota_exceeded: true }).exceeded, true)
  assert.equal(projectQuota({ remaining: 1 }).unit, 'credits')
  for (const value of [null, [], undefined, {}, { total: ' ', used: -1, remaining: true, percentage: Infinity }]) assert.equal(projectQuota(value), null)
  assert.equal(JSON.stringify(projectCredential({ usage: { remaining: 1, access_token: 'hidden' } })).includes('hidden'), false)
})

test('credential details redact nested tokens, secrets, authorization, keys, and arrays before transport', () => {
  const result = redactCredentialDetails({
    email: 'user@example.com', expires_at: '2026-11-23', token: 'secret-1',
    nested: { refreshToken: 'secret-2', api_key: 'secret-3', Authorization: 'secret-4', cookie: 'secret-5' },
    records: [{ password: 'secret-6' }, 'Bearer secret-7', 'sk-secret8', null],
    empty_token: '', missing_token: null,
  })
  assert.equal(result.email, 'user@example.com')
  assert.equal(result.expires_at, '2026-11-23')
  assert.equal(result.empty_token, '')
  assert.equal(result.missing_token, null)
  assert.equal(JSON.stringify(result).includes('secret-'), false)
  assert.equal(JSON.stringify(result).includes('sk-secret8'), false)
  assert.deepEqual(result.records, [{ password: '[REDACTED]' }, 'Bearer [REDACTED]', '[REDACTED]', null])
})

test('models use the selected encoded filename and return only display fields', async () => {
  let request
  const result = await fetchCredentialModels('http://localhost:8317/', 'private-password', 'user+a@example.com.json', {
    fetchImpl: async (url, init) => {
      request = { url, init }
      return response({ models: [{ id: 'model-1', display_name: 'Model One', owned_by: 'qoder', type: 'chat', token: 'hidden' }, { id: 'model-2' }, null, { name: 'bad' }] })
    },
  })
  assert.equal(request.url, 'http://localhost:8317/v8/management/credentials/models?name=user%2Ba%40example.com.json')
  assert.equal(request.init.headers.Authorization, 'Bearer private-password')
  assert.equal(request.init.redirect, 'error')
  assert.deepEqual(result.models[1], { id: 'model-2', name: 'model-2', provider: '', type: '' })
  assert.equal(result.models.length, 2)
  assert.equal(JSON.stringify(result).includes('hidden'), false)
  for (const payload of [null, {}, { models: {} }]) await assert.rejects(fetchCredentialModels('http://local', 'password', 'a.json', options(payload)), { code: 'invalid-models' })
})

test('detail and quota operations distinguish malformed, removed, and absent quota data', async () => {
  const details = await fetchCredentialDetails('http://local', 'password', 'a.json', options({ type: 'qoder', token: 'hidden' }))
  assert.deepEqual(details, { name: 'a.json', content: { type: 'qoder', token: '[REDACTED]' }, redacted: true })
  for (const payload of [null, [], 'invalid']) await assert.rejects(fetchCredentialDetails('http://local', 'password', 'a.json', options(payload)), { code: 'invalid-credential-file' })
  const quota = await fetchCredentialQuota('http://local', 'password', 'a.json', options({ files: [{ name: 'other.json', usage: { total: 1000 } }, { name: 'a.json', usage: { total: 100, remaining: 25 } }] }))
  assert.equal(quota.usage.remainingPercent, 25)
  assert.equal(quota.source, 'management-snapshot')
  assert.ok(quota.observedAt > 0)
  assert.equal((await fetchCredentialQuota('http://local', 'password', 'a.json', options({ files: [{ name: 'a.json' }] }))).usage, null)
  await assert.rejects(fetchCredentialQuota('http://local', 'password', 'a.json', options({ files: [] })), { code: 'credential-not-found' })
  await assert.rejects(fetchCredentialQuota('http://local', 'password', 'a.json', options({ files: {} })), { code: 'invalid-credentials' })
})

test('management transport keeps cancellation and error bodies out of returned errors', async () => {
  const controller = new AbortController()
  const result = await fetchManagementJson('http://local', 'password', 'credentials', {
    signal: controller.signal,
    fetchImpl: async (_url, init) => { assert.equal(init.signal.aborted, false); return response({ files: [] }) },
  })
  assert.deepEqual(result, { files: [] })
  controller.abort()
  await assert.rejects(fetchManagementJson('http://local', 'password', 'credentials', {
    signal: controller.signal, fetchImpl: async () => { throw new Error('private-password') },
  }), { name: 'AbortError' })
  for (const status of [401, 403, 404, 500]) {
    await assert.rejects(fetchManagementJson('http://local', 'password', 'credentials', {
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: 'private-password' }) }),
    }), error => !error.message.includes('private-password') && error.details.status === status)
  }
})

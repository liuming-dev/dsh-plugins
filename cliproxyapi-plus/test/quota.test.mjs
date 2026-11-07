import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchQoderQuota, projectQuota, resolveQoderQuotaUrl } from '../quota.js'
import { fetchCredentialQuota } from '../credential-data.js'

const fullQuota = {
  userQuota: { total: 0, used: 0, remaining: 0, unit: 'credits' },
  orgResourcePackage: { total: 20000, used: 2478, remaining: 17522, unit: 'credits' },
  expiresAt: 1795363200000,
}
const response = payload => ({ ok: true, status: 200, json: async () => payload })

test('Qoder quota URLs match public and Enterprise VPC endpoint configuration', () => {
  assert.equal(resolveQoderQuotaUrl({}), 'https://openapi.qoder.sh/api/v2/quota/usage')
  for (const endpoint of ['example', 'example.vpc.qoder.com.cn', 'example-gateway.vpc.qoder.com.cn', 'example-openapi.vpc.qoder.com.cn']) {
    assert.equal(resolveQoderQuotaUrl({ qoder: { 'vpc-endpoint': endpoint } }), 'https://example-openapi.vpc.qoder.com.cn/api/v2/quota/usage')
  }
  for (const endpoint of ['https://evil.example', 'bad/path', 'other.example', '-bad', 'bad-']) {
    assert.throws(() => resolveQoderQuotaUrl({ qoder: { 'vpc-endpoint': endpoint } }), { code: 'invalid-qoder-endpoint' })
  }
})

test('complete Qoder quota is queried through the proxy using the selected credential and a token placeholder', async () => {
  const calls = []
  const result = await fetchCredentialQuota('http://proxy:8317', 'management-secret', 'user.json', {
    qoderConfig: { 'vpc-endpoint': 'example' },
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (init.method === 'GET') return response({ files: [{ name: 'user.json', type: 'qoder', auth_index: 'selected-auth', usage: { org_resource_remaining: 10 } }] })
      return response({ status_code: 200, body: JSON.stringify(fullQuota) })
    },
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, 'http://proxy:8317/v8/management/requests/api-call')
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    auth_index: 'selected-auth', method: 'GET', url: 'https://example-openapi.vpc.qoder.com.cn/api/v2/quota/usage',
    header: { Authorization: 'Bearer $TOKEN$', Accept: 'application/json' },
  })
  assert.equal(result.usage.shared.total, 20000)
  assert.equal(result.usage.shared.used, 2478)
  assert.equal(result.usage.shared.remaining, 17522)
  assert.equal(result.source, 'qoder')
  assert.equal(JSON.stringify(result).includes('management-secret'), false)
})

test('quota query failures preserve actionable errors without returning upstream bodies', async () => {
  await assert.rejects(fetchQoderQuota('http://proxy', 'password', {}), { code: 'quota-credential-unavailable' })
  for (const status of [401, 403, 500, undefined]) {
    await assert.rejects(fetchQoderQuota('http://proxy', 'password', { authIndex: 42 }, {
      fetchImpl: async () => response({ status_code: status, body: 'private-upstream-secret' }),
    }), error => error.code === 'quota-unavailable' && !error.message.includes('private-upstream-secret'))
  }
  for (const body of ['invalid-json', '{}', null]) {
    await assert.rejects(fetchQoderQuota('http://proxy', 'password', { auth_index: '42' }, {
      fetchImpl: async () => response({ status_code: 200, body }),
    }), { code: 'invalid-quota' })
  }
  const quota = await fetchQoderQuota('http://proxy', 'password', { auth_index: 42 }, {
    fetchImpl: async () => response({ status_code: 200, body: fullQuota }),
  })
  assert.equal(quota.package.total, 0)
})

test('older partial snapshots keep a known shared balance and leave its capacity unknown', () => {
  const quota = projectQuota({ total: 100, used: 10, org_resource_remaining: 17522, expires_at: '2026-11-23T00:00:00Z' })
  assert.equal(quota.package.usedPercent, 10)
  assert.equal(quota.shared.remaining, 17522)
  assert.equal(quota.shared.total, null)
  assert.equal(quota.shared.used, null)
  assert.equal(quota.shared.usedPercent, null)
  assert.equal(quota.package.resetAt, Date.parse('2026-11-23T00:00:00Z'))
  assert.equal(projectQuota({ total: 5, remaining: 5, expiresAt: 1795363200 }).package.resetAt, 1795363200000)
  assert.equal(projectQuota({ total: 5, expiresAt: 'invalid' }).package.resetAt, null)
  for (const expiresAt of [0, '0', -1, '-1', '']) {
    assert.equal(projectQuota({ total: 5, expiresAt }).package.resetAt, null)
  }
})

test('shared capacity is calculated from known used and remaining Credits when Qoder omits total', () => {
  const quota = projectQuota({ userQuota: { total: 0, used: 0, remaining: 0 }, orgResourcePackage: { used: 2478, remaining: 17522, percentage: .12 } })
  assert.equal(quota.shared.total, 20000)
  assert.equal(quota.shared.usedPercent, 12.39)
  assert.equal(quota.package.total, 0)
  assert.equal(projectQuota({ orgResourcePackage: { used: 2478 } }).shared.total, null)
})

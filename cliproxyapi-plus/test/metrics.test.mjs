import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateUsage,
  describeAuthFiles,
  fetchDashboard,
  mergeBucketGroups,
  normalizeRecentRequests,
  projectCredential,
} from '../metrics.js'
import { PluginError } from '../contract.js'

const emptyTraffic = {
  buckets: [],
  totalSuccess: 0,
  totalFailure: 0,
  total: 0,
  successRate: null,
  peakTotal: 0,
  peakIndex: -1,
  windowMinutes: 0,
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

test('normalizeRecentRequests keeps the official last 20 buckets and sanitizes values', () => {
  const input = Array.from({ length: 25 }, (_, index) => ({
    time: `bucket-${index}`,
    success: index,
    failed: 0,
    token: 'must-not-survive',
  }))
  input[5] = { time: '', success: -10, failed: Number.POSITIVE_INFINITY }
  input[6] = null
  input[7] = { time: 7, success: '2.5', failed: 'invalid' }
  input[24] = { time: 'bucket-24', success: true, failed: null }

  const result = normalizeRecentRequests(input)
  assert.equal(result.length, 20)
  assert.deepEqual(result[0], { success: 0, failed: 0 })
  assert.deepEqual(result[1], { success: 0, failed: 0 })
  assert.deepEqual(result[2], { success: 2.5, failed: 0 })
  assert.deepEqual(result.at(-1), { time: 'bucket-24', success: 1, failed: 0 })
  assert.equal(JSON.stringify(result).includes('must-not-survive'), false)
  assert.deepEqual(normalizeRecentRequests(undefined), [])
  assert.deepEqual(normalizeRecentRequests('not-an-array'), [])
})

test('mergeBucketGroups right-aligns groups, limits output to 20, and keeps the first time', () => {
  const merged = mergeBucketGroups([
    [],
    [
      { time: '', success: 1, failed: 0 },
      { time: 'a-last', success: 2, failed: 1 },
    ],
    [
      { time: 'b-first', success: 4, failed: 0 },
      { time: 'b-middle', success: 5, failed: 0 },
      { time: 'b-last', success: 6, failed: 0 },
    ],
  ])
  assert.deepEqual(merged, [
    { time: 'b-first', success: 4, failed: 0 },
    { time: 'b-middle', success: 6, failed: 0 },
    { time: 'a-last', success: 8, failed: 1 },
  ])

  const long = mergeBucketGroups([Array.from({ length: 25 }, (_, index) => ({
    time: `bucket-${index}`, success: 1, failed: 0,
  }))])
  assert.equal(long.length, 20)
  assert.equal(long[0].time, 'bucket-5')
  assert.equal(long.at(-1).time, 'bucket-24')
  assert.deepEqual(mergeBucketGroups([[], null]), [])
  assert.deepEqual(mergeBucketGroups(undefined), [])
})

test('aggregateUsage deduplicates API keys and follows official provider and traffic totals', () => {
  const credentialsPayload = {
    files: [
      {
        name: 'duplicate.json',
        type: 'openai',
        account_type: 'api_key',
        account: 'sk-duplicate',
        auth_index: '1',
        success: 500,
        failed: 500,
        recent_requests: [{ time: 'duplicate', success: 100, failed: 100 }],
      },
      {
        name: 'claude.json',
        type: 'claude',
        auth_index: '2',
        success: 2,
        failed: 0,
        recent_requests: [{ time: '10:00', success: 2, failed: 0 }],
      },
    ],
  }
  const apiKeyUsagePayload = {
    ' OpenAI ': {
      'https://api.example|sk-duplicate': {
        success: '10',
        failed: '2',
        recent_requests: [
          { time: '09:50', success: 2, failed: 1 },
          { time: '10:00', success: 3, failed: 0 },
        ],
      },
    },
    claude: {
      'https://api.example|sk-other': {
        success: 1,
        failed: 1,
        recent_requests: [{ time: '10:00', success: 1, failed: 1 }],
      },
    },
  }

  const result = aggregateUsage({ credentialsPayload, apiKeyUsagePayload })
  assert.equal(result.providers.length, 2)
  assert.deepEqual(result.providers[0], {
    id: 'openai',
    credentials: 1,
    success: 10,
    failure: 2,
    total: 12,
    successRate: 10 / 12 * 100,
    buckets: [
      { time: '09:50', success: 2, failed: 1 },
      { time: '10:00', success: 3, failed: 0 },
    ],
  })
  assert.equal(result.providers[1].id, 'claude')
  assert.equal(result.providers[1].credentials, 2)
  assert.equal(result.providers[1].success, 3)
  assert.equal(result.providers[1].failure, 1)
  assert.equal(result.providers[1].total, 4)
  assert.equal(result.providers[1].successRate, 75)

  assert.deepEqual(result.traffic, {
    buckets: [
      { time: '09:50', success: 2, failed: 1 },
      { time: '10:00', success: 6, failed: 1 },
    ],
    totalSuccess: 8,
    totalFailure: 2,
    total: 10,
    successRate: 80,
    peakTotal: 7,
    peakIndex: 1,
    windowMinutes: 20,
  })
  assert.equal(result.credentials.length, 2)
  assert.equal(JSON.stringify(result).includes('sk-duplicate'), false)
  assert.equal(JSON.stringify(result).includes('sk-other'), false)
})

test('aggregateUsage returns a stable empty dashboard without data', () => {
  assert.deepEqual(aggregateUsage({ credentialsPayload: { files: [] }, apiKeyUsagePayload: {} }), {
    traffic: emptyTraffic,
    providers: [],
    credentials: [],
  })
  assert.deepEqual(aggregateUsage(), {
    traffic: emptyTraffic,
    providers: [],
    credentials: [],
  })
})

test('projectCredential exposes only safe fields and describeAuthFiles sorts by name', () => {
  const projected = projectCredential({
    id: 'sensitive-original-id',
    auth_index: 42,
    name: ' safe.json ',
    type: 'codex',
    provider: 'codex',
    email: ' user@example.com ',
    disabled: true,
    unavailable: 'true',
    requires_sign_in: true,
    status_message: ' ready ',
    modtime: '2025-01-01T00:00:00.000Z',
    size: '128',
    success: '9',
    failed: '1',
    recent_requests: [{ time: 'now', success: 2, failed: 1, token: 'nested-secret' }],
    account_type: 'api_key',
    account: 'sensitive-account-token',
    token: 'sensitive-token',
    api_key: 'sensitive-api-key',
    secret: 'sensitive-secret',
    raw_json: { token: 'sensitive-raw-json' },
  })

  assert.deepEqual(projected, {
    id: '42',
    name: 'safe.json',
    type: 'codex',
    provider: 'codex',
    email: 'user@example.com',
    disabled: true,
    unavailable: true,
    requiresSignIn: true,
    statusMessage: 'ready',
    modified: Date.parse('2025-01-01T00:00:00.000Z'),
    size: 128,
    success: 9,
    failed: 1,
    recentRequests: [{ time: 'now', success: 2, failed: 1 }],
    usage: null,
  })
  assert.equal(projectCredential({ auth_index: 42 }).id, projected.id)
  assert.equal(projectCredential({ name: 'legacy.json' }).requiresSignIn, false)
  assert.equal(projectCredential({ requiresSignIn: true }).requiresSignIn, true)
  for (const secret of ['sensitive-original-id', 'sensitive-account-token', 'sensitive-token', 'sensitive-api-key', 'sensitive-secret', 'sensitive-raw-json', 'nested-secret']) {
    assert.equal(JSON.stringify(projected).includes(secret), false)
  }

  const payload = {
    files: [
      { name: 'z.json', token: 'not-returned' },
      null,
      { name: 'a.json', secret: 'not-returned' },
    ],
  }
  const described = describeAuthFiles(payload)
  assert.deepEqual(described.map(entry => entry.name), ['a.json', 'z.json'])
  assert.equal(described.length, 2)
  assert.equal(payload.files.length, 3)
  assert.equal(JSON.stringify(described).includes('not-returned'), false)
})

test('fetchDashboard requests both endpoints in parallel and returns only aggregate safe data', async () => {
  const password = 'test-password-that-must-not-leak'
  const compositeKey = 'https://api.example|sk-composite-secret'
  const credentialsPayload = {
    files: [{
      name: 'safe.json',
      type: 'codex',
      auth_index: '7',
      account_type: 'api_key',
      account: 'sk-composite-secret',
      token: 'credential-secret',
    }],
  }
  const apiKeyUsagePayload = {
    codex: {
      [compositeKey]: {
        success: 4,
        failed: 1,
        recent_requests: [{ time: 'now', success: 1, failed: 0 }],
      },
    },
  }
  const calls = []
  let releaseRequests
  const gate = new Promise(resolve => { releaseRequests = resolve })
  const fetchImpl = (url, options) => {
    calls.push({ url, options })
    return gate.then(() => response(200, url.endsWith('/credentials') ? credentialsPayload : apiKeyUsagePayload))
  }

  const pending = fetchDashboard('http://management.test/', password, fetchImpl)
  assert.equal(calls.length, 2)
  releaseRequests()
  const result = await pending

  assert.deepEqual(calls.map(call => call.url), [
    'http://management.test/v8/management/credentials',
    'http://management.test/v8/management/observability/usage/api-keys',
  ])
  for (const call of calls) {
    assert.equal(call.options.method, 'GET')
    assert.equal(call.options.headers.Authorization, `Bearer ${password}`)
  }
  assert.equal(result.providers[0].credentials, 1)
  assert.equal(result.providers[0].success, 4)
  assert.equal(result.providers[0].failure, 1)
  assert.equal(result.traffic.total, 1)
  assert.equal(result.traffic.successRate, 100)
  const serialized = JSON.stringify(result)
  for (const secret of [password, compositeKey, 'sk-composite-secret', 'credential-secret']) {
    assert.equal(serialized.includes(secret), false)
  }
})

test('fetchDashboard maps 401/403 and other HTTP statuses without exposing the password', async () => {
  const password = 'secret-management-password'
  for (const [status, code] of [[401, 'management-unauthorized'], [403, 'management-unauthorized'], [503, 'management-unavailable']]) {
    const fetchImpl = async () => response(status, { error: password })
    await assert.rejects(fetchDashboard('http://management.test', password, fetchImpl), error => {
      assert.ok(error instanceof PluginError)
      assert.equal(error.code, code)
      assert.equal(error.details.status, status)
      assert.equal(error.message.includes(password), false)
      assert.equal(JSON.stringify(error.details).includes(password), false)
      return true
    })
  }
})

test('fetchDashboard maps network failures without exposing the thrown error or password', async () => {
  const password = 'secret-network-password'
  const fetchImpl = async () => { throw new Error(`connection failed with ${password}`) }
  await assert.rejects(fetchDashboard('http://management.test', password, fetchImpl), error => {
    assert.ok(error instanceof PluginError)
    assert.equal(error.code, 'management-unreachable')
    assert.equal(error.message.includes(password), false)
    assert.equal(error.message.includes('connection failed'), false)
    return true
  })
})

test('credential status messages redact bearer and API-key-like values', () => {
  const projected = projectCredential({ name: 'qoder.json', status_message: 'Bearer very-secret-token sk-abcdef123456' })
  assert.equal(projected.statusMessage.includes('very-secret-token'), false)
  assert.equal(projected.statusMessage.includes('sk-abcdef123456'), false)
  assert.match(projected.statusMessage, /redacted/)
})

test('fetchDashboard maps malformed JSON responses to management-unreachable', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new Error('invalid JSON containing secret-management-password') },
  })
  await assert.rejects(fetchDashboard('http://management.test', 'secret-management-password', fetchImpl), error => {
    assert.ok(error instanceof PluginError)
    assert.equal(error.code, 'management-unreachable')
    assert.equal(error.message.includes('secret-management-password'), false)
    assert.equal(error.message.includes('invalid JSON'), false)
    return true
  })
})

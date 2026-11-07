import test from 'node:test'
import assert from 'node:assert/strict'
import { ManagementCredentials, MANAGEMENT_CREDENTIAL_KEY } from '../management-credentials.js'

function store(initial) {
  let record = initial
  return {
    async readRecord(key) { assert.equal(key, MANAGEMENT_CREDENTIAL_KEY); return record },
    async modifyRecord(key, mutate) { assert.equal(key, MANAGEMENT_CREDENTIAL_KEY); record = await mutate(record); return record },
    value: () => record,
  }
}

test('ensure creates a high entropy credential once and reuses it', async () => {
  const previous = process.env.MANAGEMENT_PASSWORD
  delete process.env.MANAGEMENT_PASSWORD
  try {
    const credentials = store()
    const manager = new ManagementCredentials(credentials)
    const first = await manager.ensure()
    const second = await manager.ensure()
    assert.equal(first, second)
    assert.ok(first.length >= 40)
    assert.equal(credentials.value().kind, 'api-key')
    assert.equal(credentials.value().key, first)
    assert.equal(await manager.configured(), true)
    assert.deepEqual(await manager.reveal(), { password: first })
  } finally {
    if (previous === undefined) delete process.env.MANAGEMENT_PASSWORD
    else process.env.MANAGEMENT_PASSWORD = previous
  }
})

test('existing record wins and save replaces it without exposing values in status', async () => {
  const credentials = store({ kind: 'api-key', key: 'existing-password' })
  const manager = new ManagementCredentials(credentials)
  assert.equal(await manager.read(), 'existing-password')
  assert.equal(await manager.ensure(), 'existing-password')
  assert.deepEqual(await manager.save('new-password'), { configured: true })
  assert.equal(credentials.value().key, 'new-password')
  for (const invalid of ['', ' ', null, 42, 'x'.repeat(4097)]) await assert.rejects(manager.save(invalid), error => error.code === 'invalid-credential')
})

test('ambient password is a fallback and missing reveal is explicit', async () => {
  const previous = process.env.MANAGEMENT_PASSWORD
  process.env.MANAGEMENT_PASSWORD = 'ambient-password'
  try {
    const manager = new ManagementCredentials(store())
    assert.equal(await manager.read(), 'ambient-password')
    assert.equal(await manager.ensure(), 'ambient-password')
  } finally {
    if (previous === undefined) delete process.env.MANAGEMENT_PASSWORD
    else process.env.MANAGEMENT_PASSWORD = previous
  }
  delete process.env.MANAGEMENT_PASSWORD
  await assert.rejects(new ManagementCredentials(store()).reveal(), error => error.code === 'credential-not-configured')
  if (previous !== undefined) process.env.MANAGEMENT_PASSWORD = previous
})

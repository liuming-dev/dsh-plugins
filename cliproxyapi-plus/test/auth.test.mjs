import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authSummary, scanAuth, scanQoderAuth } from '../auth.js'

test('auth summaries expose metadata but never credential values', async () => {
  const now = Date.now()
  const summary = authSummary('qoder-user@example.com.json', {
    token: 'secret-access-token', refresh_token: 'secret-refresh-token', email: 'user@example.com', name: 'Example',
    expire_time: now + 10000, refresh_token_expire_time: now + 20000, auth_mode: 'device-token', last_refresh: 'today',
  }, now - 100, now)
  assert.equal(summary.status, 'authenticated')
  assert.equal(summary.email, 'user@example.com')
  assert.equal(summary.name, 'Example')
  assert.equal(Object.hasOwn(summary, 'token'), false)
  assert.equal(JSON.stringify(summary).includes('secret-access-token'), false)
  assert.equal(JSON.stringify(summary).includes('secret-refresh-token'), false)
  assert.equal(authSummary('qoder-expired.json', { token: 'x', expire_time: now - 1 }, now, now).status, 'expired')
  assert.equal(authSummary('qoder-incomplete.json', { email: 'a@b.c' }, now, now).status, 'incomplete')
  assert.equal(authSummary('qoder-invalid.json', null, now, now).status, 'invalid')
  assert.equal(authSummary('qoder-string-date.json', { access_token: 'x', expires_at: new Date(now + 1000).toISOString() }, now, now).status, 'authenticated')
})

test('directory scan counts Qoder files and ignores invalid or unrelated files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxyapi-plus-auth-'))
  const now = Date.now()
  await writeFile(join(directory, 'qoder-valid.json'), JSON.stringify({ token: 'not-returned', email: 'valid@example.com', expire_time: now + 100000 }))
  await writeFile(join(directory, 'qoder-expired.json'), JSON.stringify({ token: 'not-returned', expire_time: now - 100 }))
  await writeFile(join(directory, 'qoder-invalid.json'), '{not-json')
  await writeFile(join(directory, 'other.json'), JSON.stringify({ token: 'not-returned' }))
  const result = await scanQoderAuth(directory, now)
  assert.equal(result.total, 3)
  assert.equal(result.authenticated, 1)
  assert.equal(result.status, 'authenticated')
  assert.deepEqual(result.accounts.map(account => account.status).sort(), ['authenticated', 'expired', 'invalid'])
  assert.equal(JSON.stringify(result).includes('not-returned'), false)
})

test('symlink auth files are not followed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxyapi-plus-auth-link-'))
  const target = join(directory, 'target.json')
  await writeFile(target, JSON.stringify({ token: 'secret' }))
  await symlink(target, join(directory, 'qoder-link.json'))
  const result = await scanQoderAuth(directory)
  assert.equal(result.total, 0)
})

test('missing directory is an unauthenticated empty state', async () => {
  const result = await scanQoderAuth(join(tmpdir(), `cliproxyapi-plus-missing-${Date.now()}`))
  assert.deepEqual({ ok: result.ok, total: result.total, status: result.status, accounts: result.accounts }, { ok: true, total: 0, status: 'missing', accounts: [] })
})

test('mixed credential scan detects Codex by filename or type and preserves separate client states without tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxy-mixed-auth-'))
  await writeFile(join(directory, 'codex-user.json'), JSON.stringify({ access_token: 'secret-value', expired: '2000-01-01T00:00:00Z' }))
  await writeFile(join(directory, 'renamed.json'), JSON.stringify({ type: 'codex', refresh_token: 'secret-value', expired: '2099-01-01T00:00:00Z' }))
  await writeFile(join(directory, 'codex-broken.json'), 'broken')
  await writeFile(join(directory, 'qoder-user.json'), JSON.stringify({ type: 'qoder', token: 'secret-value' }))
  await writeFile(join(directory, 'other-broken.json'), 'broken')
  const result = await scanAuth(directory)
  assert.equal(result.total, 4)
  assert.equal(result.authenticated, 2)
  assert.equal(result.accounts.filter(account => account.type === 'codex').length, 3)
  assert.equal(result.accounts.find(account => account.fileName === 'codex-user.json').status, 'expired')
  assert.equal((await scanQoderAuth(directory)).total, 1)
  assert.equal(JSON.stringify(result).includes('secret-value'), false)
})

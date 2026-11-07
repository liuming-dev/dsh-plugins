import test from 'node:test'
import assert from 'node:assert/strict'
import { authenticationClients } from '../authentication.js'
import { resolveSettings } from '../contract.js'
import { Config } from '../index.js'

const settings = resolveSettings({ startCommand: 'proxy --config "/tmp/my config.yaml"', authClients: ['codex', 'qoder'] })
const plan = (accounts = [], credentials = [], ok = true, config = settings) => authenticationClients(config, { ok, accounts }, { credentials })

test('missing clients produce distinct commands in canonical order using the entire saved start command', () => {
  assert.deepEqual(plan().map(client => client.command), [
    'proxy --config "/tmp/my config.yaml" --qoder-login', 'proxy --config "/tmp/my config.yaml" --codex-login',
  ])
  assert.deepEqual(plan().map(client => client.status), ['missing', 'missing'])
})

test('each client skips valid accounts and authenticates only missing, expired, invalid, or incomplete accounts', () => {
  for (const status of ['expired', 'invalid', 'incomplete']) {
    const clients = plan([{ type: 'qoder', status: 'authenticated' }, { type: 'codex', status }])
    assert.equal(clients[0].command, '')
    assert.equal(clients[1].command.endsWith('--codex-login'), true)
  }
  const clients = plan([{ type: 'qoder', status: 'expired' }, { type: 'qoder', status: 'authenticated' }])
  assert.equal(clients[0].needsAuthentication, false)
  assert.equal(clients[1].status, 'missing')
  assert.equal(plan([], [], false).every(client => client.command === '' && client.status === 'unknown'), true)
  assert.equal(plan([], [], true, { ...settings, authClients: [] }).every(client => client.command === ''), true)
})

test('backend sign-in requirements invalidate matching accounts, while quota exhaustion does not', () => {
  const accounts = [{ type: 'codex', fileName: 'codex-user.json', status: 'authenticated' }]
  assert.equal(plan(accounts, [{ type: 'codex', name: 'codex-user.json', requiresSignIn: true }])[1].status, 'expired')
  assert.equal(plan(accounts, [{ provider: 'codex', name: 'codex-user.json', unavailable: true }])[1].needsAuthentication, false)
  accounts.push({ type: 'codex', fileName: 'codex-second.json', status: 'authenticated' })
  assert.equal(plan(accounts, [{ type: 'codex', name: 'codex-user.json', requiresSignIn: true }])[1].command, '')
})

test('schema preserves absent client selections for migration and explicitly cleared selections across reloads', () => {
  const legacy = Config({ authCommand: 'proxy --qoder-login' })
  assert.deepEqual(resolveSettings(legacy).authClients, ['qoder'])
  assert.deepEqual(resolveSettings(Config({ ...legacy, authClients: [] })).authClients, [])
})

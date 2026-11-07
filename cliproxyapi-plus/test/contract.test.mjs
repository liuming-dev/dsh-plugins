import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENT_REMOTE, DEFAULT_AUTH_COMMAND, DEFAULT_CONFIG_PATH, DEFAULT_SETTINGS, DEFAULT_START_COMMAND,
  errorPayload, parseCredentialFileRequest, parseSaveRequest, parseSettingsPatch, parseValidateRequest,
  PluginError, remoteDescriptors, resolveSettings, toLosslessJson,
} from '../contract.js'

test('defaults and resolved settings preserve custom commands', () => {
  assert.equal(DEFAULT_CONFIG_PATH, '')
  assert.equal(DEFAULT_START_COMMAND, '')
  assert.equal(DEFAULT_AUTH_COMMAND, '')
  assert.deepEqual(resolveSettings({}), DEFAULT_SETTINGS)
  assert.deepEqual(resolveSettings({ configPath: ' /tmp/a.yaml ', autoStart: true, managementUrl: null }), {
    ...DEFAULT_SETTINGS, configPath: '/tmp/a.yaml', autoStart: true,
  })
  assert.deepEqual(resolveSettings({ configPath: ' ', startCommand: '', authCommand: '' }), DEFAULT_SETTINGS)
})

test('settings patches are strict and validate URLs', () => {
  assert.deepEqual(parseSettingsPatch({ configPath: ' /tmp/a ', autoStart: false }), { configPath: '/tmp/a', autoStart: false })
  assert.deepEqual(parseSettingsPatch({ managementUrl: 'https://example.test/management.html' }), { managementUrl: 'https://example.test/management.html' })
  assert.deepEqual(parseSettingsPatch({ configPath: '', startCommand: ' ', authCommand: '' }), { configPath: '', startCommand: '', authCommand: '' })
  for (const value of [null, [], { unknown: true }, { configPath: null }, { startCommand: 3 }, { autoStart: 'yes' }, { managementUrl: 'file:///tmp/a' }, { managementUrl: 'bad url' }]) {
    assert.throws(() => parseSettingsPatch(value), PluginError)
  }
})

test('CLI client selections validate, deduplicate, retain explicit clearing, and migrate recognized legacy flags', () => {
  assert.deepEqual(resolveSettings({ authCommand: 'proxy --codex-login --qoder-login --no-browser' }).authClients, ['qoder', 'codex'])
  assert.deepEqual(resolveSettings({ authCommand: 'proxy --qoder-login', authClients: [] }).authClients, [])
  assert.deepEqual(resolveSettings({ authCommand: 'proxy --custom-login' }).authClients, [])
  assert.deepEqual(parseSettingsPatch({ authClients: ['codex', 'qoder', 'codex'] }), { authClients: ['qoder', 'codex'] })
  for (const authClients of ['codex', null, ['other'], ['Codex'], [1]]) {
    assert.throws(() => parseSettingsPatch({ authClients }), { code: 'invalid-setting' })
  }
})

test('save and validation requests reject unsupported fields and oversized values', () => {
  assert.deepEqual(parseSaveRequest({ text: 'port: 1', expectedMtimeMs: 2, overwrite: true }), { text: 'port: 1', expectedMtimeMs: 2, overwrite: true })
  assert.deepEqual(parseValidateRequest({ text: 'port: 1' }), { text: 'port: 1' })
  for (const value of [null, [], { text: 1 }, { text: 'ok', extra: true }, { text: 'ok', expectedMtimeMs: NaN }, { text: 'ok', overwrite: 'yes' }]) {
    assert.throws(() => parseSaveRequest(value), PluginError)
  }
  assert.throws(() => parseValidateRequest({ text: 'ok', expectedMtimeMs: 1 }), PluginError)
})

test('remote descriptors contain no Agent dependency and share client shape', () => {
  const descriptors = remoteDescriptors()
  assert.equal(descriptors.length, 15)
  assert.equal(new Set(descriptors.map(item => item.id)).size, descriptors.length)
  assert.ok(descriptors.every(item => item.invocation.kind === 'direct'))
  assert.ok(descriptors.every(item => !item.parameters.some(parameter => parameter.source === 'lookup')))
  assert.equal(descriptors.find(item => item.method === 'snapshot').parameters.length, 0)
  assert.equal(descriptors.find(item => item.method === 'saveConfig').parameters[0].wire, 'request')
  assert.deepEqual(CLIENT_REMOTE.descriptors.map(item => item.id), descriptors.map(item => item.id))
  assert.deepEqual(CLIENT_REMOTE.descriptors.map(item => item.parameters.map(parameter => parameter.wire)), descriptors.map(item => item.parameters.map(parameter => parameter.wire)))
})

test('lossless JSON projection replaces undefined and bigint values without dropping object fields', () => {
  assert.deepEqual(toLosslessJson({ missing: undefined, list: [undefined], big: 12n, finite: 1 }), { missing: null, list: [null], big: '12', finite: 1 })
  assert.equal(toLosslessJson(undefined), null)
})

test('credential operations accept only a JSON filename and reject paths or extra fields', () => {
  assert.deepEqual(parseCredentialFileRequest({ name: ' qoder-user@example.com.json ' }), { name: 'qoder-user@example.com.json' })
  for (const request of [null, [], {}, { name: '../secret.json' }, { name: 'C:\\secret.json' }, { name: 'bad\u0000.json' }, { name: '.env' }, { name: 1 }, { name: 'a.json', url: 'https://example.test' }, { name: 'x'.repeat(256) + '.json' }]) {
    assert.throws(() => parseCredentialFileRequest(request), { code: 'invalid-request' })
  }
})

test('errors retain stable codes and messages', () => {
  const error = new PluginError('test-code', 'readable', { line: 2 })
  assert.deepEqual(errorPayload(error), { ok: false, code: 'test-code', message: 'readable', details: { line: 2 } })
  assert.equal(errorPayload(null).code, 'unexpected-error')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, Config, inject } from '../index.js'
import { defaultSettings, FakeCredentials, FakeSubprocess } from './helpers.mjs'

async function harness() {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxyapi-plus-index-'))
  const configPath = join(directory, 'config.yaml')
  await writeFile(configPath, 'server: {port: 7317}\n')
  const subprocess = new FakeSubprocess()
  let tool, remoteContribution, cleanup, toolDisposed = false, remoteDisposed = false
  const ctx = {
    fiber: { entry: 'entry-id' },
    loader: { import: async name => {
      assert.equal(name, '@deepseek-ai/dsh-typert-protocol')
      return { TypertRemoteService: class { constructor(context, namespace) { this.context = context; this.namespace = namespace } } }
    } },
    subprocess,
    credentials: new FakeCredentials(),
    configEditor: { edit: async (_entry, change) => change({}) },
    typert: { register: contribution => { remoteContribution = contribution; return () => { remoteDisposed = true } } },
    tools: { register: definition => { tool = definition; return () => { toolDisposed = true } } },
    effect: callback => { cleanup = callback() },
  }
  await apply(ctx, { ...defaultSettings, configPath })
  return { ctx, tool, remoteContribution, subprocess, getCleanup: () => cleanup, disposed: () => ({ toolDisposed, remoteDisposed }) }
}

test('plugin declares config, dependencies, remote API, and one shared agent tool', async () => {
  assert.ok(Config)
  assert.deepEqual(inject, ['loader', 'typert', 'subprocess', 'tools', 'configEditor', 'credentials'])
  const { tool, remoteContribution } = await harness()
  assert.equal(tool.name, 'cliproxyapi_plus')
  assert.equal(remoteContribution.package, 'cliproxyapi-plus')
  assert.equal(remoteContribution.invocations.length, 15)
  assert.equal(tool.parameters.required[0], 'action')
  assert.equal(tool.isConcurrencySafe({ action: 'snapshot' }), true)
  assert.equal(tool.isConcurrencySafe({ action: 'start' }), false)
  assert.equal(tool.presentCall({ action: 'snapshot' }).kind, 'read')
})

test('agent tool reuses service actions and hides log bodies from snapshots', async () => {
  const { tool, getCleanup } = await harness()
  const initial = await tool.execute({ action: 'snapshot' })
  assert.equal(initial.config.server.port, 7317)
  const valid = await tool.execute({ action: 'validate_config', request: { text: 'server: {port: 1}\n' } })
  assert.equal(valid.valid, true)
  const invalid = await tool.execute({ action: 'validate_config', request: { text: 'server: [' } })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.code, 'invalid-yaml')
  await tool.execute({ action: 'start' })
  const running = await tool.execute({ action: 'snapshot' })
  assert.equal(running.processes.service.status, 'running')
  assert.match(running.processes.service.log, /logs available/)
  const rendered = tool.output.render({}, running)
  assert.equal(rendered[0].type, 'text')
  await getCleanup()()
})

test('agent snapshot is lossless JSON even with stopped processes and sparse auth metadata', async () => {
  const { tool, getCleanup } = await harness()
  const snapshot = await tool.execute({ action: 'snapshot' })
  function assertLossless(value, path = '$') {
    assert.notEqual(value, undefined, `${path} contains undefined`)
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} contains a non-finite number`)
    if (Array.isArray(value)) value.forEach((entry, index) => assertLossless(entry, `${path}[${index}]`))
    else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) assertLossless(entry, `${path}.${key}`)
  }
  assertLossless(snapshot)
  await getCleanup()()
})

test('cleanup unregisters capabilities and stops owned processes', async () => {
  const { tool, subprocess, getCleanup, disposed } = await harness()
  await tool.execute({ action: 'start' })
  await getCleanup()()
  assert.deepEqual(disposed(), { toolDisposed: true, remoteDisposed: true })
  assert.equal(subprocess.handles[0].terminated, true)
  const unknown = await tool.execute({ action: 'not-supported' })
  assert.equal(unknown.code, 'invalid-action')
})

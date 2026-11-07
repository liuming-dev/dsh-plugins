import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
import * as plugin from '../index.js'
import { FakeCredentials, FakeSubprocess } from './helpers.mjs'

const require = createRequire('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json')
const { boot, initProfile, readProfilePatches } = require('@deepseek-ai/dsh-app-boot')
const ConfigEditor = require('@deepseek-ai/dsh-config-editor').default
const Typert = require('@deepseek-ai/dsh-typert-registry').default
const { TypertGatewayService } = require('@deepseek-ai/dsh-api-gateway')

test('real Harness Profile settings survive full runtime restarts, later edits, and explicit clearing', async t => {
  const home = await mkdtemp(join(tmpdir(), 'cliproxy-settings-profile-'))
  const dir = join(home, 'profiles', 'test')
  const installAnchor = join(home, 'package.json')
  await writeFile(installAnchor, JSON.stringify({ name: 'settings-test-installation' }))
  initProfile(dir, ['settings-test-bundle'])
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const bundleDir = join(dir, 'node_modules', 'settings-test-bundle')
  await mkdir(bundleDir, { recursive: true })
  await mkdir(join(dir, 'node_modules', '@deepseek-ai'), { recursive: true })
  await symlink(dirname(dirname(require.resolve('@deepseek-ai/dsh-typert-protocol'))), join(dir, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol'))
  await writeFile(join(bundleDir, 'package.json'), JSON.stringify({
    name: 'settings-test-bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  const bundle = parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  assert.deepEqual(bundle[0].insert[0].config, { configPath: '', startCommand: '', authCommand: '', managementUrl: '', autoStart: false })
  bundle[0].insert[0].name = 'cordis:cliProxyTest'
  bundle[0].insert.unshift({ id: 'profile-editor', name: 'cordis:profileEditorTest' })
  await writeFile(join(bundleDir, 'cordis.patch.yml'), JSON.stringify(bundle))
  const profile = { name: 'test', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor, cwd: home, home, overlays: [], startedBundles: ['settings-test-bundle'] }
  let running
  t.after(async () => { await running?.ctx.fiber.dispose() })
  const startRuntime = async () => {
    const ctx = await boot('dsh', join(dir, 'cordis.yml'), readProfilePatches('dsh', profile), ctx => {
      ctx.provide('profileContext', profile)
      ctx.provide('subprocess', new FakeSubprocess())
      ctx.provide('credentials', new FakeCredentials())
      ctx.provide('tools', { register: () => () => {} })
      ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
      new Typert(ctx)
      ctx.loader.builtins.profileEditorTest = ConfigEditor
      ctx.loader.builtins.cliProxyTest = plugin
    })
    const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1000000 })
    const peer = { id: 'settings-test', ctx, principal: { kind: 'test-viewer' }, signal: new AbortController().signal }
    return { ctx, call: (method, request) => gateway.invoke({ namespace: 'cliproxyapiPlus', method, args: request === undefined ? {} : { request }, peer }) }
  }
  const restart = async () => {
    await running?.ctx.fiber.dispose()
    running = await startRuntime()
  }
  await restart()
  assert.equal((await running.call('snapshot')).config.code, 'config-not-configured')
  const configPath = join(home, 'custom proxy.yaml')
  await writeFile(configPath, `server: {port: 63998}\noauth: {auth-dir: ${JSON.stringify(join(home, 'auth'))}}\n`)
  const settings = { configPath, startCommand: 'custom-proxy --serve', authClients: ['qoder', 'codex'] }
  await running.call('updateSettings', settings)
  assert.match(await readFile(profile.patchPath, 'utf8'), /custom-proxy --serve/)
  await restart()
  let snapshot = await running.call('snapshot')
  for (const [key, value] of Object.entries(settings)) assert.deepEqual(snapshot.settings[key], value)
  assert.equal(snapshot.config.server.port, 63998)
  await running.call('updateSettings', { authClients: ['codex'] })
  await restart()
  snapshot = await running.call('snapshot')
  assert.equal(snapshot.settings.configPath, configPath)
  assert.equal(snapshot.settings.startCommand, settings.startCommand)
  assert.deepEqual(snapshot.settings.authClients, ['codex'])
  await running.call('updateSettings', { startCommand: '', authClients: [], configPath: '' })
  await restart()
  snapshot = await running.call('snapshot')
  assert.equal(snapshot.settings.configPath, '')
  assert.equal(snapshot.settings.startCommand, '')
  assert.equal(snapshot.settings.authCommand, '')
  assert.deepEqual(snapshot.settings.authClients, [])
  assert.equal(snapshot.config.code, 'config-not-configured')
})

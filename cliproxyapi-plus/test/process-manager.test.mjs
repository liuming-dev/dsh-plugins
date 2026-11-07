import test from 'node:test'
import assert from 'node:assert/strict'
import { ProcessManager } from '../process-manager.js'
import { defaultSettings, deferred, FakeHandle, FakeSubprocess } from './helpers.mjs'

test('Qoder authentication can run alongside the proxy without interrupting either process', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  await manager.start(defaultSettings)
  await manager.authenticate(defaultSettings)
  assert.equal(manager.snapshot().service.status, 'running')
  assert.equal(manager.snapshot().authentication.status, 'running')
  assert.equal(subprocess.handles[0].terminated, false)
  await manager.stopAuthentication()
  assert.equal(manager.snapshot().service.status, 'running')
  await manager.dispose()
})

test('service starts through a login shell and exposes bounded output', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  const started = await manager.start(defaultSettings)
  assert.equal(started.service.status, 'running')
  assert.deepEqual(subprocess.spawnSpecs[0].argv, ['/bin/zsh', '-lc', defaultSettings.startCommand])
  assert.equal(subprocess.spawnSpecs[0].cwd, '/tmp/cliproxyapi-plus-test')
  assert.equal(subprocess.spawnSpecs[0].stdio.stdin, 'ignore')
  assert.match(manager.snapshot().service.log, /server ready/)
  await assert.rejects(manager.start(defaultSettings), error => error.code === 'already-running')
  const stopped = await manager.stop()
  assert.equal(stopped.service.status, 'exited')
  assert.equal(subprocess.handles[0].terminated, true)
  assert.match(stopped.service.log, /process exited/)
  await manager.dispose()
})

test('spawn failures become readable failed state', async () => {
  const subprocess = new FakeSubprocess()
  subprocess.throwOnSpawn = true
  const manager = new ProcessManager(subprocess)
  await assert.rejects(manager.start(defaultSettings), error => error.code === 'start-failed')
  assert.equal(manager.snapshot().service.status, 'failed')
  assert.match(manager.snapshot().service.log, /spawn unavailable/)
})

test('non-zero service exit is reflected in state', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  await manager.start(defaultSettings)
  subprocess.handles[0].doneSource.resolve({ exitCode: 2, signal: null })
  await subprocess.handles[0].done
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(manager.snapshot().service.status, 'failed')
  assert.equal(manager.snapshot().service.exitCode, 2)
})

test('authentication uses a PTY, streams output, and rejects duplicate logins', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  const started = await manager.authenticate(defaultSettings)
  assert.equal(started.authentication.status, 'running')
  assert.equal(subprocess.terminalSpecs[0].terminalType, 'xterm-256color')
  assert.deepEqual(subprocess.terminalSpecs[0].argv, ['/bin/zsh', '-lc', defaultSettings.authCommand])
  subprocess.handles[0].output.emit('data', Buffer.from('Open https://example.test/login\n'))
  assert.match(manager.snapshot().authentication.log, /https:\/\/example.test\/login/)
  await assert.rejects(manager.authenticate(defaultSettings), error => error.code === 'authentication-running')
  const stopped = await manager.stopAuthentication()
  assert.equal(stopped.authentication.status, 'exited')
})

test('authentication terminal failures leave the running proxy available', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  await manager.start(defaultSettings)
  subprocess.throwOnTerminal = true
  await assert.rejects(manager.authenticate(defaultSettings), error => error.code === 'authentication-failed')
  assert.equal(manager.snapshot().authentication.status, 'failed')
  assert.equal(manager.snapshot().service.status, 'running')
  await manager.dispose()
})

test('dispose stops both owned process kinds and idle stop is harmless', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  const idle = await manager.stop()
  assert.equal(idle.service.status, 'stopped')
  await manager.start(defaultSettings)
  await manager.stop()
  await manager.authenticate(defaultSettings)
  await manager.start(defaultSettings)
  await manager.dispose()
  assert.ok(subprocess.handles.every(handle => handle.terminated))
  assert.equal(ProcessManager.active(manager.service), false)
  assert.equal(ProcessManager.active(manager.authentication), false)
})

const commands = ['qoder', 'codex'].map(client => ({ client, command: `${defaultSettings.startCommand} --${client}-login` }))
const tick = () => new Promise(resolve => setImmediate(resolve))

test('authentication queue runs Qoder then Codex only after successful completion and keeps both outputs', async () => {
  const subprocess = new FakeSubprocess()
  const manager = new ProcessManager(subprocess)
  await manager.authenticate(defaultSettings, commands)
  assert.equal(subprocess.terminalSpecs.length, 1)
  assert.equal(manager.snapshot().authentication.client, 'qoder')
  subprocess.handles[0].output.emit('data', 'Qoder saved\n')
  subprocess.handles[0].doneSource.resolve({ exitCode: 0 })
  await tick()
  assert.equal(subprocess.terminalSpecs.length, 2)
  assert.equal(subprocess.terminalSpecs[1].argv.at(-1), commands[1].command)
  assert.equal(manager.snapshot().authentication.step, 2)
  assert.equal(manager.snapshot().authentication.total, 2)
  subprocess.handles[1].output.emit('data', 'Codex saved\n')
  subprocess.handles[1].doneSource.resolve({ exitCode: 0 })
  await tick()
  assert.equal(manager.snapshot().authentication.status, 'exited')
  assert.match(manager.snapshot().authentication.log, /Qoder saved[\s\S]*Codex saved/)
})

test('failed or cancelled authentication stops the queue and allows a fresh retry', async () => {
  for (const cancel of [false, true]) {
    const subprocess = new FakeSubprocess()
    const manager = new ProcessManager(subprocess)
    await manager.authenticate(defaultSettings, commands)
    if (cancel) await manager.stopAuthentication()
    else subprocess.handles[0].doneSource.resolve({ exitCode: 1 })
    await tick()
    assert.equal(subprocess.terminalSpecs.length, 1)
    assert.equal(manager.snapshot().authentication.status, cancel ? 'exited' : 'failed')
    await manager.authenticate(defaultSettings, commands.slice(1))
    assert.equal(manager.snapshot().authentication.client, 'codex')
    await manager.dispose()
  }
})

test('cancelling an in-flight PTY spawn waits for and terminates it without starting the next client', async () => {
  const subprocess = new FakeSubprocess()
  const pending = deferred()
  const handle = new FakeHandle({ terminal: true })
  subprocess.spawnTerminal = () => pending.promise
  const manager = new ProcessManager(subprocess)
  const launching = manager.authenticate(defaultSettings, commands)
  await tick()
  const stopping = manager.stopAuthentication()
  pending.resolve(handle)
  await Promise.all([launching, stopping])
  assert.equal(handle.terminated, true)
  assert.equal(manager.snapshot().authentication.step, 1)
  assert.equal(manager.snapshot().authentication.cancelled, true)
})

import { EventEmitter } from 'node:events'

export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

export class FakeHandle {
  constructor({ stdout = '', stderr = '', terminal = false } = {}) {
    this.stdout = stdout
    this.stderr = stderr
    this.doneSource = deferred()
    this.done = this.doneSource.promise
    this.terminated = false
    this.output = terminal ? new EventEmitter() : undefined
    this.collected = terminal ? undefined : {
      stdout: { readFrom: () => ({ text: this.stdout, nextOffset: this.stdout.length, lossy: false }) },
      stderr: { readFrom: () => ({ text: this.stderr, nextOffset: this.stderr.length, lossy: false }) },
    }
  }
  terminate() {
    this.terminated = true
    this.doneSource.resolve({ exitCode: 0, signal: 'SIGTERM' })
  }
  async waitForExit() { return true }
}

export class FakeSubprocess {
  constructor() {
    this.spawnSpecs = []
    this.terminalSpecs = []
    this.handles = []
    this.throwOnSpawn = false
    this.throwOnTerminal = false
  }
  async terminalEnvironment() { return { platform: 'posix', defaultShell: '/bin/zsh' } }
  spawn(spec) {
    this.spawnSpecs.push(spec)
    if (this.throwOnSpawn) throw new Error('spawn unavailable')
    const handle = new FakeHandle({ stdout: 'server ready\n', stderr: '' })
    this.handles.push(handle)
    return handle
  }
  async spawnTerminal(spec) {
    this.terminalSpecs.push(spec)
    if (this.throwOnTerminal) throw new Error('pty unavailable')
    const handle = new FakeHandle({ terminal: true })
    this.handles.push(handle)
    return handle
  }
}

export class FakeCredentials {
  constructor(record = { kind: 'api-key', key: 'test-management-password' }) { this.record = record }
  async readRecord() { return this.record }
  async modifyRecord(_key, mutate) { this.record = await mutate(this.record); return this.record }
}

export const emptyDashboardData = () => ({
  traffic: { buckets: [], totalSuccess: 0, totalFailure: 0, total: 0, successRate: null, peakTotal: 0, peakIndex: -1, windowMinutes: 0 },
  providers: [], credentials: [],
})

export const defaultSettings = {
  configPath: '/tmp/cliproxyapi-plus-test/config.yaml',
  startCommand: 'node fake-server.mjs',
  authCommand: 'node fake-server.mjs --qoder-login',
  authClients: ['qoder'],
  managementUrl: '',
  autoStart: false,
}

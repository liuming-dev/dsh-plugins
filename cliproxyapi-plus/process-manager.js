import { dirname } from 'node:path'
import { PluginError } from './contract.js'
import { expandHome } from './config-file.js'

const MAX_LOG_CHARS = 240_000

function appendLog(record, chunk) {
  if (!chunk) return
  record.log = `${record.log}${chunk}`.slice(-MAX_LOG_CHARS)
}

function publicRecord(record) {
  if (!record) return { status: 'stopped', command: '', log: '' }
  return {
    status: record.status,
    command: record.command,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    exitCode: record.exitCode,
    signal: record.signal,
    error: record.error,
    log: record.log,
    ...(record.kind === 'authentication' ? {
      client: record.commands[record.step - 1]?.client,
      step: record.step, total: record.commands.length,
      clients: record.commands.map(command => command.client), cancelled: record.cancelled,
    } : {}),
  }
}

export class ProcessManager {
  constructor(subprocess) {
    if (!subprocess) throw new Error('CLIProxyAPI Plus requires the subprocess service')
    this.subprocess = subprocess
    this.service = undefined
    this.authentication = undefined
  }

  static active(record) {
    return record && ['starting', 'running', 'stopping'].includes(record.status)
  }

  createRecord(kind, command) {
    return {
      kind,
      command,
      status: 'starting',
      startedAt: Date.now(),
      endedAt: undefined,
      exitCode: undefined,
      signal: undefined,
      error: undefined,
      log: '',
      handle: undefined,
    }
  }

  async shell() {
    const environment = await this.subprocess.terminalEnvironment()
    if (environment.platform === 'windows') return { argv: [environment.defaultShell || 'cmd.exe', '/d', '/s', '/c'] }
    return { argv: [environment.defaultShell || process.env.SHELL || '/bin/zsh', '-lc'] }
  }

  async start(settings, managementPassword = undefined) {
    if (ProcessManager.active(this.service)) throw new PluginError('already-running', '服务已经启动或正在停止。')
    const command = settings.startCommand.trim()
    if (!command) throw new PluginError('invalid-command', '启动命令不能为空。')
    const record = this.createRecord('service', command)
    this.service = record
    appendLog(record, `$ ${command}\n`)
    try {
      const shell = await this.shell()
      record.handle = this.subprocess.spawn({
        argv: [...shell.argv, command],
        cwd: dirname(expandHome(settings.configPath)),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 262_144, spill: { maxBytes: 1_048_576 } },
          stderr: { maxBytes: 262_144, spill: { maxBytes: 1_048_576 } },
        },
        graceMs: 5000,
        ...(managementPassword ? { env: { ...process.env, MANAGEMENT_PASSWORD: managementPassword } } : {}),
      })
      record.status = 'running'
      record.handle.done.then(outcome => this.settle(record, outcome)).catch(error => this.fail(record, error))
    } catch (error) {
      this.fail(record, error)
      throw new PluginError('start-failed', `启动失败：${error.message}`)
    }
    return this.snapshot()
  }

  settle(record, outcome) {
    record.exitCode = outcome.exitCode
    record.signal = outcome.signal
    record.endedAt = Date.now()
    record.status = outcome.exitCode === 0 ? 'exited' : 'failed'
    if (record.handle?.collected) this.syncCollected(record)
    else appendLog(record, `\n[process exited: code=${outcome.exitCode ?? 'null'}, signal=${outcome.signal ?? 'none'}]\n`)
  }

  fail(record, error) {
    record.status = 'failed'
    record.error = error.message || String(error)
    record.endedAt = Date.now()
    appendLog(record, `\n[process error: ${record.error}]\n`)
  }

  syncCollected(record) {
    if (!record?.handle?.collected) return
    try {
      const stdout = record.handle.collected.stdout?.readFrom(0)
      const stderr = record.handle.collected.stderr?.readFrom(0)
      const text = `$ ${record.command}\n${stdout?.text || ''}${stderr?.text || ''}`
      const truncation = stdout?.lossy || stderr?.lossy ? '\n[output truncated by subprocess collector]\n' : ''
      const exit = record.endedAt ? `\n[process exited: code=${record.exitCode ?? 'null'}, signal=${record.signal ?? 'none'}]\n` : ''
      const failure = record.error ? `\n[process error: ${record.error}]\n` : ''
      record.log = `${text}${truncation}${exit}${failure}`.slice(-MAX_LOG_CHARS)
    } catch (error) {
      appendLog(record, `\n[failed to read process output: ${error.message}]\n`)
    }
  }

  async stop() {
    const record = this.service
    if (!ProcessManager.active(record)) return this.snapshot()
    record.status = 'stopping'
    try {
      record.handle.terminate()
      await record.handle.waitForExit()
      await record.handle.done
    } catch (error) {
      if (ProcessManager.active(record)) this.fail(record, error)
    }
    this.syncCollected(record)
    return this.snapshot()
  }

  async authenticate(settings, commands) {
    if (ProcessManager.active(this.authentication)) throw new PluginError('authentication-running', '认证流程已经在运行。')
    const queue = commands || [{ client: 'qoder', command: settings.authCommand }]
    if (!queue.length || queue.some(item => typeof item.command !== 'string' || !item.command.trim())) {
      throw new PluginError('invalid-command', '认证命令不能为空。')
    }
    const record = this.createRecord('authentication', queue[0].command.trim())
    record.commands = queue.map(item => ({ client: item.client, command: item.command.trim() }))
    record.step = 1
    record.cancelled = false
    this.authentication = record
    try {
      record.launchPromise = this.launchAuthentication(record, settings)
      await record.launchPromise
    } catch (error) {
      this.fail(record, error)
      throw new PluginError('authentication-failed', `无法启动认证：${error.message}`)
    }
    return this.snapshot()
  }

  async launchAuthentication(record, settings) {
    const shell = await this.shell()
    if (record.cancelled) return
    const item = record.commands[record.step - 1]
    record.command = item.command
    record.status = 'starting'
    appendLog(record, `\n[${record.step}/${record.commands.length} ${item.client}]\n$ ${item.command}\n`)
    const handle = await this.subprocess.spawnTerminal({
      argv: [...shell.argv, item.command], cwd: dirname(expandHome(settings.configPath)),
      rows: 32, cols: 120, terminalType: 'xterm-256color', shellActivity: false, graceMs: 5000,
    })
    record.handle = handle
    if (!record.cancelled) record.status = 'running'
    handle.output.on('data', chunk => appendLog(record, chunk.toString()))
    handle.done.then(async outcome => {
      appendLog(record, `\n[process exited: code=${outcome.exitCode ?? 'null'}, signal=${outcome.signal ?? 'none'}]\n`)
      record.exitCode = outcome.exitCode
      record.signal = outcome.signal
      if (record.cancelled || outcome.exitCode !== 0 || record.step === record.commands.length) {
        record.status = record.cancelled || outcome.exitCode === 0 ? 'exited' : 'failed'
        record.endedAt = Date.now()
        return
      }
      record.step += 1
      record.launchPromise = this.launchAuthentication(record, settings)
      await record.launchPromise
    }).catch(error => this.fail(record, error))
  }

  async stopAuthentication() {
    const record = this.authentication
    if (!ProcessManager.active(record)) return this.snapshot()
    record.cancelled = true
    record.status = 'stopping'
    try {
      await record.launchPromise
      if (record.handle) {
        await record.handle.terminate()
        await record.handle.done
      }
      record.status = 'exited'
      record.endedAt = Date.now()
    } catch (error) {
      if (ProcessManager.active(record)) this.fail(record, error)
    }
    return this.snapshot()
  }

  snapshot() {
    this.syncCollected(this.service)
    return {
      service: publicRecord(this.service),
      authentication: publicRecord(this.authentication),
    }
  }

  async dispose() {
    const tasks = []
    if (ProcessManager.active(this.service)) tasks.push(this.stop())
    if (ProcessManager.active(this.authentication)) tasks.push(this.stopAuthentication())
    await Promise.all(tasks)
  }
}

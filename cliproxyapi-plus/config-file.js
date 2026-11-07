import { constants } from 'node:fs'
import { access, chmod, copyFile, lstat, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { parse } from 'yaml'
import { PluginError } from './contract.js'

export function expandHome(input, home = homedir()) {
  if (typeof input !== 'string' || !input.trim()) throw new PluginError('invalid-path', '配置文件路径不能为空。')
  const value = input.trim()
  const expanded = value === '~' ? home : value.startsWith('~/') ? `${home}${value.slice(1)}` : value
  if (!isAbsolute(expanded)) throw new PluginError('invalid-path', '请使用绝对配置文件路径，或以 ~/ 开头。')
  return resolve(expanded)
}

export function parseYaml(text) {
  try {
    const value = parse(text, { strict: true, uniqueKeys: true, maxAliasCount: 100 })
    if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
      throw new PluginError('invalid-yaml', 'YAML 顶层必须是配置对象。')
    }
    return value || {}
  } catch (error) {
    if (error instanceof PluginError) throw error
    throw new PluginError('invalid-yaml', error.message || 'YAML 格式无效。', {
      line: error.linePos?.[0]?.line,
      column: error.linePos?.[0]?.col,
    })
  }
}

export function serverSummary(config) {
  const server = config?.server && typeof config.server === 'object' ? config.server : {}
  const legacyPort = Number(config?.port)
  const port = Number(server.port) || (Number.isFinite(legacyPort) && legacyPort > 0 ? legacyPort : 8317)
  const configuredHost = String(server.host || config?.host || '127.0.0.1').trim()
  const host = configuredHost === '0.0.0.0' || configuredHost === '::' ? '127.0.0.1' : configuredHost
  const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return {
    host: configuredHost,
    port,
    baseUrl: `http://${urlHost}:${port}`,
    managementUrl: `http://${urlHost}:${port}/management.html`,
    authDir: config?.oauth?.['auth-dir'] || config?.['auth-dir'] || '~/.cli-proxy-api',
    apiKeyCount: Array.isArray(config?.access?.['api-keys']) ? config.access['api-keys'].length
      : Array.isArray(config?.['api-keys']) ? config['api-keys'].length : 0,
    configVersion: config?.['config-version'],
  }
}

export class ConfigFile {
  constructor(configPath) {
    this.path = expandHome(configPath)
  }

  async read() {
    try {
      const [text, info] = await Promise.all([readFile(this.path, 'utf8'), stat(this.path)])
      const config = parseYaml(text)
      return {
        ok: true,
        path: this.path,
        text,
        mtimeMs: info.mtimeMs,
        size: info.size,
        server: serverSummary(config),
      }
    } catch (error) {
      if (error instanceof PluginError) throw error
      if (error.code === 'ENOENT') throw new PluginError('config-not-found', `配置文件不存在：${this.path}`)
      throw new PluginError('config-read-failed', `无法读取配置文件：${error.message}`)
    }
  }

  async save({ text, expectedMtimeMs, overwrite = false }) {
    if (typeof text !== 'string' || text.length > 2_000_000) throw new PluginError('invalid-request', 'YAML 内容不能超过 2 MB。')
    parseYaml(text)
    let previous
    try {
      previous = await lstat(this.path)
      if (!previous.isFile() || previous.isSymbolicLink()) throw new PluginError('unsafe-config-path', '配置文件必须是普通文件，不能是符号链接。')
      if (!overwrite && expectedMtimeMs !== undefined && previous.mtimeMs !== expectedMtimeMs) {
        throw new PluginError('config-conflict', '配置文件已被外部修改。请重新加载，或明确覆盖。', { mtimeMs: previous.mtimeMs })
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await mkdir(dirname(this.path), { recursive: true })
    const mode = previous?.mode || 0o600
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const temporary = `${this.path}.${suffix}.tmp`
    let handle
    try {
      handle = await open(temporary, 'wx', mode)
      await handle.writeFile(text, 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      if (previous) await copyFile(this.path, `${this.path}.bak`, constants.COPYFILE_EXCL).catch(async error => {
        if (error.code !== 'EEXIST') throw error
        await copyFile(this.path, `${this.path}.bak`)
      })
      await rename(temporary, this.path)
      await chmod(this.path, mode)
    } catch (error) {
      if (handle) await handle.close().catch(() => {})
      await unlink(temporary).catch(() => {})
      if (error instanceof PluginError) throw error
      throw new PluginError('config-save-failed', `无法保存配置文件：${error.message}`)
    }
    const saved = await this.read()
    return { ...saved, saved: true, backupPath: previous ? `${this.path}.bak` : undefined }
  }
}

export async function assertReadable(path) {
  await access(path, constants.R_OK)
}

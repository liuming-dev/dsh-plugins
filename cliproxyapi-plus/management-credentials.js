import { randomBytes } from 'node:crypto'
import { PluginError } from './contract.js'

export const MANAGEMENT_CREDENTIAL_KEY = 'cliproxyapi-plus/management'

function recordPassword(record) {
  if (record?.kind === 'api-key' && typeof record.key === 'string' && record.key) return record.key
  return undefined
}

export class ManagementCredentials {
  constructor(credentials) {
    if (!credentials) throw new Error('CLIProxyAPI Plus requires the credentials service')
    this.credentials = credentials
  }

  async read() {
    const stored = recordPassword(await this.credentials.readRecord(MANAGEMENT_CREDENTIAL_KEY))
    if (stored) return stored
    const ambient = typeof process.env.MANAGEMENT_PASSWORD === 'string' ? process.env.MANAGEMENT_PASSWORD.trim() : ''
    return ambient || undefined
  }

  async configured() {
    return Boolean(await this.read())
  }

  async ensure() {
    const existing = await this.read()
    if (existing) return existing
    const generated = randomBytes(32).toString('base64url')
    const record = await this.credentials.modifyRecord(MANAGEMENT_CREDENTIAL_KEY, async current => {
      const currentPassword = recordPassword(current)
      if (currentPassword) return current
      return { kind: 'api-key', key: generated }
    })
    const password = recordPassword(record)
    if (!password) throw new PluginError('credential-unavailable', '无法保存插件管理密码。')
    return password
  }

  async save(password) {
    if (typeof password !== 'string' || !password.trim() || password.length > 4096) {
      throw new PluginError('invalid-credential', '管理密码不能为空，且不能超过 4096 字符。')
    }
    const value = password.trim()
    await this.credentials.modifyRecord(MANAGEMENT_CREDENTIAL_KEY, async () => ({ kind: 'api-key', key: value }))
    return { configured: true }
  }

  async reveal() {
    const password = await this.read()
    if (!password) throw new PluginError('credential-not-configured', '尚未配置管理密码。')
    return { password }
  }
}

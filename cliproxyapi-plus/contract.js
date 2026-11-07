export const PACKAGE_NAME = 'cliproxyapi-plus'
export const PANEL_ID = 'cliproxyapi-plus'
export const NAMESPACE = 'cliproxyapiPlus'
export const DEFAULT_CONFIG_PATH = ''
export const DEFAULT_START_COMMAND = ''
export const DEFAULT_AUTH_COMMAND = ''
export const AUTH_CLIENTS = Object.freeze(['qoder', 'codex'])
export const DEFAULT_SETTINGS = Object.freeze({
  configPath: DEFAULT_CONFIG_PATH,
  startCommand: DEFAULT_START_COMMAND,
  authCommand: DEFAULT_AUTH_COMMAND,
  authClients: Object.freeze([]),
  managementUrl: '',
  autoStart: false,
})

export function toLosslessJson(value) {
  const serialized = JSON.stringify(value, (_key, entry) => {
    if (entry === undefined) return null
    if (typeof entry === 'bigint') return entry.toString()
    return entry
  })
  return serialized === undefined ? null : JSON.parse(serialized)
}

export class PluginError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'PluginError'
    this.code = code
    this.details = details
  }
}

export function errorPayload(error) {
  return {
    ok: false,
    code: typeof error?.code === 'string' ? error.code : 'unexpected-error',
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  }
}

export function resolveSettings(value = {}) {
  const authClients = Array.isArray(value.authClients) ? value.authClients
    : AUTH_CLIENTS.filter(client => new RegExp(`(?:^|\\s)--${client}-login(?:\\s|$)`).test(value.authCommand || ''))
  return {
    configPath: typeof value.configPath === 'string' && value.configPath.trim() ? value.configPath.trim() : DEFAULT_CONFIG_PATH,
    startCommand: typeof value.startCommand === 'string' && value.startCommand.trim() ? value.startCommand.trim() : DEFAULT_START_COMMAND,
    authCommand: typeof value.authCommand === 'string' && value.authCommand.trim() ? value.authCommand.trim() : DEFAULT_AUTH_COMMAND,
    authClients: AUTH_CLIENTS.filter(client => authClients.includes(client)),
    managementUrl: typeof value.managementUrl === 'string' ? value.managementUrl.trim() : '',
    autoStart: value.autoStart === true,
  }
}

export function parseSettingsPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PluginError('invalid-request', '设置请求格式无效。')
  }
  const allowed = new Set(['configPath', 'startCommand', 'authCommand', 'authClients', 'managementUrl', 'autoStart'])
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new PluginError('invalid-request', '设置包含不支持的字段。')
  }
  const result = {}
  if (value.authClients !== undefined) {
    if (!Array.isArray(value.authClients) || value.authClients.some(client => !AUTH_CLIENTS.includes(client))) {
      throw new PluginError('invalid-setting', '认证 CLI 客户端仅支持 Qoder 和 Codex。')
    }
    result.authClients = AUTH_CLIENTS.filter(client => value.authClients.includes(client))
  }
  for (const key of ['configPath', 'startCommand', 'authCommand']) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'string' || value[key].length > 4000) {
      throw new PluginError('invalid-setting', `${key} 必须是长度不超过 4000 字符的字符串。`)
    }
    result[key] = value[key].trim()
  }
  if (value.managementUrl !== undefined) {
    if (typeof value.managementUrl !== 'string' || value.managementUrl.length > 2000) {
      throw new PluginError('invalid-setting', '管理面板地址无效。')
    }
    const url = value.managementUrl.trim()
    if (url) {
      let parsed
      try { parsed = new URL(url) } catch { throw new PluginError('invalid-setting', '管理面板地址必须是有效的 HTTP(S) URL。') }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new PluginError('invalid-setting', '管理面板地址仅支持 HTTP(S)。')
    }
    result.managementUrl = url
  }
  if (value.autoStart !== undefined) {
    if (typeof value.autoStart !== 'boolean') throw new PluginError('invalid-setting', 'autoStart 必须是布尔值。')
    result.autoStart = value.autoStart
  }
  return result
}

export function parseSaveRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PluginError('invalid-request', '保存请求格式无效。')
  }
  if (Object.keys(value).some(key => !['text', 'expectedMtimeMs', 'overwrite'].includes(key))) {
    throw new PluginError('invalid-request', '保存请求包含不支持的字段。')
  }
  if (typeof value.text !== 'string' || value.text.length > 2_000_000) {
    throw new PluginError('invalid-request', 'YAML 内容必须是字符串，且不能超过 2 MB。')
  }
  if (value.expectedMtimeMs !== undefined && (typeof value.expectedMtimeMs !== 'number' || !Number.isFinite(value.expectedMtimeMs))) {
    throw new PluginError('invalid-request', '文件版本号无效。')
  }
  if (value.overwrite !== undefined && typeof value.overwrite !== 'boolean') {
    throw new PluginError('invalid-request', '覆盖标记无效。')
  }
  return { text: value.text, expectedMtimeMs: value.expectedMtimeMs, overwrite: value.overwrite === true }
}

export function parseValidateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'text')) {
    throw new PluginError('invalid-request', '校验请求格式无效。')
  }
  if (typeof value.text !== 'string' || value.text.length > 2_000_000) {
    throw new PluginError('invalid-request', 'YAML 内容必须是字符串，且不能超过 2 MB。')
  }
  return { text: value.text }
}

export function parseCredentialRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'password')) {
    throw new PluginError('invalid-request', '管理密码请求格式无效。')
  }
  if (typeof value.password !== 'string' || !value.password.trim() || value.password.length > 4096) {
    throw new PluginError('invalid-credential', '管理密码不能为空，且不能超过 4096 字符。')
  }
  return { password: value.password.trim() }
}

export function parseCredentialFileRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'name')) {
    throw new PluginError('invalid-request', '凭证文件请求格式无效。')
  }
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 255 || /[/\\\u0000-\u001f]/.test(value.name) || !/\.json$/i.test(value.name.trim())) {
    throw new PluginError('invalid-request', '请选择有效的 JSON 凭证文件。')
  }
  return { name: value.name.trim() }
}

function codec(name, parse = value => value) {
  return { mode: 'strict', typeSymbol: `${PACKAGE_NAME}#${name}`, create: () => ({ parse }) }
}

const methods = {
  snapshot: undefined,
  readConfig: undefined,
  validateConfig: parseValidateRequest,
  saveConfig: parseSaveRequest,
  updateSettings: parseSettingsPatch,
  start: undefined,
  stop: undefined,
  authenticate: undefined,
  stopAuthentication: undefined,
  saveManagementCredential: parseCredentialRequest,
  copyManagementCredential: undefined,
  credentialModels: parseCredentialFileRequest,
  credentialDetails: parseCredentialFileRequest,
  credentialQuota: parseCredentialFileRequest,
  refreshCredentialQuota: parseCredentialFileRequest,
}

export function remoteDescriptors() {
  return Object.entries(methods).map(([method, parse]) => ({
    id: `${NAMESPACE}/${method}`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: parse ? [{ name: 'request', wire: 'request', source: 'json', codec: codec(`${method}Request`, parse) }] : [],
    cancellation: { parameter: 'signal' },
    result: codec(`${method}Result`),
  }))
}

export const REMOTE = {
  package: PACKAGE_NAME,
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: remoteDescriptors(),
}

export const CLIENT_REMOTE = {
  package: PACKAGE_NAME,
  descriptors: remoteDescriptors(),
}

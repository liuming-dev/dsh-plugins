import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expandHome } from './config-file.js'

const MAX_AUTH_BYTES = 1_000_000

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function text(value, maxLength = 320) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined
}

export function authSummary(fileName, value, modifiedAt, now = Date.now()) {
  const inferredType = /^(codex)(?:-|\.json$)/i.test(fileName) ? 'codex' : 'qoder'
  const expiresAt = timestamp(value?.expire_time ?? value?.expires_at ?? value?.expired)
  const refreshExpiresAt = timestamp(value?.refresh_token_expire_time)
  const hasCredential = Boolean(text(value?.token) || text(value?.access_token) || text(value?.refresh_token))
  const invalid = !value || typeof value !== 'object' || Array.isArray(value)
  const status = invalid ? 'invalid'
    : (refreshExpiresAt || expiresAt) && (refreshExpiresAt || expiresAt) <= now ? 'expired'
      : hasCredential ? 'authenticated' : 'incomplete'
  return {
    fileName,
    name: text(value?.name),
    email: text(value?.email),
    type: (text(value?.type, 80) || inferredType).toLowerCase(),
    authMode: text(value?.auth_mode, 80),
    lastRefresh: text(value?.last_refresh, 80),
    expiresAt,
    refreshExpiresAt,
    modifiedAt,
    status,
  }
}

async function scanProviderAuth(authDir, now, providers) {
  const directory = expandHome(authDir || '~/.cli-proxy-api')
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = entries.filter(entry => /\.json$/i.test(entry.name) && !entry.isSymbolicLink())
      .sort((a, b) => a.name.localeCompare(b.name))
    const accounts = await Promise.all(files.map(async entry => {
      const path = join(directory, entry.name)
      const knownName = /^(qoder|codex)(?:-|\.json$)/i.test(entry.name)
      try {
        const info = await lstat(path)
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_AUTH_BYTES) {
          return knownName ? authSummary(entry.name, null, info.mtimeMs, now) : null
        }
        const raw = await readFile(path, 'utf8')
        try {
          const value = JSON.parse(raw)
          return knownName || providers.includes(String(value?.type).toLowerCase()) ? authSummary(entry.name, value, info.mtimeMs, now) : null
        } catch {
          return knownName ? authSummary(entry.name, null, info.mtimeMs, now) : null
        }
      } catch {
        return knownName ? authSummary(entry.name, null, now, now) : null
      }
    }))
    const supported = accounts.filter(account => account && providers.includes(account.type))
    const authenticated = supported.filter(account => account.status === 'authenticated').length
    return {
      ok: true,
      directory,
      authenticated,
      total: supported.length,
      status: authenticated > 0 ? 'authenticated' : supported.length > 0 ? 'attention' : 'missing',
      accounts: supported,
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ok: true, directory, authenticated: 0, total: 0, status: 'missing', accounts: [] }
    }
    return {
      ok: false,
      directory,
      authenticated: 0,
      total: 0,
      status: 'error',
      accounts: [],
      error: `无法读取认证目录：${error.message}`,
    }
  }
}

export const scanAuth = (authDir, now = Date.now()) => scanProviderAuth(authDir, now, ['qoder', 'codex'])
export const scanQoderAuth = (authDir, now = Date.now()) => scanProviderAuth(authDir, now, ['qoder'])

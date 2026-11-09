import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { PluginError } from './contract.js'

// Bind a key to its endpoint and value so a refused settings write cannot rotate
// the credential used by the last successfully committed provider profile.
export function proxyKeyReference(provider, baseURL, key) {
  const digest = createHash('sha256').update(`${baseURL}\0${key}`).digest('hex').slice(0, 20).toUpperCase()
  return `CLIPROXYAPI_PLUS_${provider.toUpperCase()}_${digest}_API_KEY`
}

export class HarnessProviders {
  constructor({ settings, llm, credentials }) {
    this.settings = settings
    this.llm = llm
    this.credentials = credentials
  }

  target(provider) {
    const directory = this.llm.listConfigurableProviders()
    const existing = directory.find(row => row.provider === provider)
    const isProfile = row => row.settingsPath?.length === 2 && row.settingsPath[0] === 'providers'
    if (existing && !isProfile(existing)) {
      throw new PluginError('provider-not-editable', `${provider} 由其他适配器管理，当前配置接口无法覆盖。`)
    }
    const namespaces = [...new Set(directory.filter(isProfile).map(row => row.settingsNs))]
    const namespace = existing?.settingsNs || (namespaces.length === 1 ? namespaces[0] : undefined)
    if (!namespace) throw new PluginError('provider-adapter-unavailable', '未找到唯一的可配置模型适配器，请检查 llm-pi-ai。')
    const view = this.settings.describe().find(row => row.ns === namespace)
    if (!view || !this.settings.writable) throw new PluginError('provider-settings-unavailable', 'Harness 模型供应商配置当前不可写。')
    return { namespace, view }
  }

  async save(provider, profile, apiKey, signal) {
    signal?.throwIfAborted()
    const { namespace, view } = this.target(provider)
    const ref = proxyKeyReference(provider, profile.baseURL, apiKey)
    // Null resets protocol-specific options inherited from a composition layer.
    const value = {
      headers: null, compat: null, modelOverrides: null,
      ...profile, apiKeyEnv: ref,
    }
    const credential = await this.credentials.resolve(ref)
    if (credential?.value !== apiKey) await this.credentials.set(ref, apiKey)
    signal?.throwIfAborted()
    if (isDeepStrictEqual(view.user?.providers?.[provider], value)) return { changed: false }
    // One path write leaves other providers intact and rejects a concurrent edit.
    await this.settings.mutate(namespace, [{ op: 'set', path: ['providers', provider], value }], view.revision)
    return { changed: true }
  }
}

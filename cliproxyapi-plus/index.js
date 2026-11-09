import Schema from '@deepseek-ai/schemastery'
import { CliproxyService } from './service.js'
import { HarnessProviders } from './harness-providers.js'
import { DEFAULT_AUTH_COMMAND, DEFAULT_CONFIG_PATH, DEFAULT_START_COMMAND, errorPayload, MAX_SYNC_INTERVAL_MINUTES, NAMESPACE, REMOTE, toLosslessJson } from './contract.js'

export const Config = Schema.object({
  configPath: Schema.string().default(DEFAULT_CONFIG_PATH),
  startCommand: Schema.string().default(DEFAULT_START_COMMAND),
  authCommand: Schema.string().default(DEFAULT_AUTH_COMMAND),
  // Preserve absence so older Profiles can infer selections from recognized login flags.
  authClients: Schema.array(Schema.union(['qoder', 'codex'])).default(undefined),
  managementUrl: Schema.string().default(''),
  autoStart: Schema.boolean().default(false),
  modelSyncIntervalMinutes: Schema.number().step(1).min(0).max(MAX_SYNC_INTERVAL_MINUTES).default(5),
})

export const inject = ['loader', 'typert', 'subprocess', 'tools', 'configEditor', 'credentials']

const actions = ['snapshot', 'read_config', 'validate_config', 'save_config', 'update_settings', 'start', 'stop', 'authenticate', 'stop_authentication', 'sync_providers']

function textContent(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

export async function apply(ctx, config = {}) {
  const { TypertRemoteService } = await ctx.loader.import('@deepseek-ai/dsh-typert-protocol')
  const service = new CliproxyService({
    config,
    subprocess: ctx.subprocess,
    credentials: ctx.credentials,
    configEditor: ctx.configEditor,
    entry: ctx.fiber.entry,
  })

  const respond = async operation => toLosslessJson(await operation())

  class CliproxyRemote extends TypertRemoteService {
    constructor(context) { super(context, NAMESPACE) }
    async snapshot(signal) { signal?.throwIfAborted(); return respond(() => service.snapshot()) }
    async readConfig(signal) { signal?.throwIfAborted(); return respond(() => service.readConfig()) }
    async validateConfig(request, signal) { signal?.throwIfAborted(); return respond(() => service.validateConfig(request)) }
    async saveConfig(request, signal) { signal?.throwIfAborted(); return respond(() => service.saveConfig(request)) }
    async updateSettings(request, signal) { signal?.throwIfAborted(); return respond(() => service.updateSettings(request)) }
    async start(signal) { signal?.throwIfAborted(); return respond(() => service.start()) }
    async stop(signal) { signal?.throwIfAborted(); return respond(() => service.stop()) }
    async authenticate(signal) { signal?.throwIfAborted(); return respond(() => service.authenticate()) }
    async stopAuthentication(signal) { signal?.throwIfAborted(); return respond(() => service.stopAuthentication()) }
    async saveManagementCredential(request, signal) { signal?.throwIfAborted(); return respond(() => service.saveManagementCredential(request)) }
    async copyManagementCredential(signal) { signal?.throwIfAborted(); return respond(() => service.copyManagementCredential()) }
    async credentialModels(request, signal) { signal?.throwIfAborted(); return respond(() => service.credentialModels(request, signal)) }
    async credentialDetails(request, signal) { signal?.throwIfAborted(); return respond(() => service.credentialDetails(request, signal)) }
    async credentialQuota(request, signal) { signal?.throwIfAborted(); return respond(() => service.credentialQuota(request, signal)) }
    async refreshCredentialQuota(request, signal) { signal?.throwIfAborted(); return respond(() => service.refreshCredentialQuota(request, signal)) }
    async syncProviders(signal) { signal?.throwIfAborted(); return respond(() => service.providerSync.sync()) }
  }
  new CliproxyRemote(ctx)
  const unregisterRemote = ctx.typert.register(REMOTE)
  const unregisterTool = ctx.tools.register({
    name: 'cliproxyapi_plus',
    description: 'Manage the local CLIProxyAPIPlus server. Read/save YAML, update settings, start/stop the server, authenticate selected Qoder/Codex clients, and sync their providers and models into Harness. Uses the same operations as the CLI Proxy panel.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: actions, description: 'Operation to perform.' },
        request: { type: 'object', description: 'Payload for save_config or update_settings.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => textContent(value),
    },
    isConcurrencySafe: args => ['snapshot', 'read_config'].includes(args?.action),
    execute: async args => {
      try {
        const result = await service.runAction(args.action, args.request)
        if (args.action === 'snapshot' && result.processes) {
          for (const process of Object.values(result.processes)) process.log = process.log ? '[logs available in the CLI Proxy panel]' : ''
        }
        return toLosslessJson(result)
      } catch (error) {
        return toLosslessJson(errorPayload(error))
      }
    },
    presentCall: args => ({ card: 'generic', title: `CLI Proxy: ${args.action}`, kind: args.action === 'read_config' || args.action === 'snapshot' ? 'read' : 'execute' }),
  })

  ctx.effect(() => async () => {
    unregisterTool()
    await Promise.resolve(unregisterRemote?.())
    await service.dispose()
  }, 'cliproxyapi-plus cleanup')

  // Model settings are optional so proxy management remains available on Hosts
  // without a writable Profile or the generic model adapter.
  ctx.inject(['settings', 'llm'], child => {
    service.providerSync.attach(new HarnessProviders({ settings: child.settings, llm: child.llm, credentials: child.credentials }))
    child.effect(() => () => service.providerSync.detach())
  })

  if (service.settings().autoStart) {
    queueMicrotask(() => service.start().catch(error => console.error('[cliproxyapi-plus] auto start failed', error)))
  }
}

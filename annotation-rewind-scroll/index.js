/** 自有历史编辑的 Host 安装层，使用当前 Harness 提供的原生模块。 */
import { HistoryEditor, historyFailure, prepareEditedHistory } from './host-history.js'
import { HISTORY_NAMESPACE, HISTORY_REMOTE } from './history-contract.js'
export const inject = ['typert', 'sessions', 'agents', 'loader']
export async function apply(ctx) {
  // 由 Harness 的模块解析器复用运行时副本，linked 本地插件无需再安装一份框架。
  const { TypertRemoteService } = await ctx.loader.import('@deepseek-ai/dsh-typert-protocol')
  const editor = new HistoryEditor({ flush: session => ctx.sessions.flush(session) })
  class AnnotationHistory extends TypertRemoteService {
    constructor(context) { super(context, HISTORY_NAMESPACE) }
    async listMessages(agent, signal) {
      try { signal?.throwIfAborted(); return await editor.listMessages(agent) } catch (error) { return historyFailure(error) }
    }
    async editAndResubmit(agent, request, signal) {
      try {
        return await editor.editAndResubmit(agent, request, signal, this.ctx.invocation?.peer.principal)
      } catch (error) { return historyFailure(error) }
    }
  }
  new AnnotationHistory(ctx)
  ctx.on('agent/request', (payload, next) => { prepareEditedHistory(payload); return next() })
  ctx.typert.register({
    package: HISTORY_REMOTE.package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: HISTORY_REMOTE.descriptors,
  })
  ctx.effect(() => async () => { await Promise.all(editor.tails.values()) }, 'annotation history drain')
}

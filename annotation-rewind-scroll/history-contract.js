/** 自有历史编辑接口；不暴露任何通用文件回退能力。 */
export const HISTORY_NAMESPACE = 'annotationHistory'
export const EDIT_SOURCE = 'annotation-history-edit'

export function parseEditRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('编辑请求格式错误。')
  const { requestId, messageId, seq, text } = value
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) throw new Error('请求标识无效。')
  if (typeof messageId !== 'string' || !messageId || messageId.length > 200) throw new Error('消息标识无效。')
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('消息序号无效。')
  if (typeof text !== 'string' || !text.trim() || text.length > 200000) throw new Error('消息不能为空，且不能超过 200000 字符。')
  if (Object.keys(value).some(key => !['requestId', 'messageId', 'seq', 'text'].includes(key))) throw new Error('请求包含不支持的字段。')
  return { requestId, messageId, seq, text }
}

function codec(name, parse) {
  return { mode: 'strict', typeSymbol: `dsh-annotation-rewind-scroll#${name}`, create: () => ({ parse }) }
}
const identity = value => value
const agentCodec = codec('AgentId', value => {
  if (typeof value !== 'string' || !value || value.length > 200) throw new Error('会话标识无效。')
  return value
})
agentCodec.typeSymbol = '@deepseek-ai/dsh-session/types#SessionId'
export const HISTORY_REMOTE = {
  package: 'dsh-annotation-rewind-scroll',
  descriptors: ['listMessages', 'editAndResubmit'].map(method => ({
    id: `${HISTORY_NAMESPACE}/${method}`, service: HISTORY_NAMESPACE, namespace: HISTORY_NAMESPACE,
    method, invocation: { kind: 'direct' },
    parameters: [
      { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent', codec: agentCodec },
      ...(method === 'editAndResubmit' ? [{ name: 'request', wire: 'request', source: 'json', codec: codec('EditRequest', parseEditRequest) }] : []),
    ],
    cancellation: { parameter: 'signal' }, result: codec('HistoryResult', identity),
  })),
}

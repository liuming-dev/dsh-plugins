/** 当前 Session 内的历史编辑：保留审计日志，串行替换模型上下文并重新投递。 */
import { randomUUID } from 'node:crypto'
import { EDIT_SOURCE, parseEditRequest } from './history-contract.js'

class HistoryError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const fail = (code, message) => { throw new HistoryError(code, message) }
const clone = value => JSON.parse(JSON.stringify(value))
const markers = session => session.snapshotEvents().filter(event =>
  event.type === 'user/message' && event.data.source.kind === EDIT_SOURCE)

/** 从事件而不是 DOM 推导用户消息及所在回合。 */
export function historyMessages(session) {
  const visible = new Set(session.surface.nodes)
  const items = []
  let turn = 0
  for (const event of session.snapshotEvents()) {
    if (event.type === 'turn/start') turn = event.data.turn
    if (event.type !== 'user/message' || event.data.source.kind !== 'user' || !visible.has(event.seq)) continue
    const text = event.data.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    items.push({ messageId: event.data.id, seq: event.seq, time: event.time, turn, preview: text.slice(0, 100) })
  }
  return items
}

/** 键盘浏览保留被压缩的历史输入，仅排除本插件已撤回的消息。 */
export function navigationMessages(session) {
  const ranges = markers(session).map(event => ({ start: event.data.source.targetSeq, end: event.seq }))
  const items = []
  let turn = 0
  for (const event of session.snapshotEvents()) {
    if (event.type === 'turn/start') turn = event.data.turn
    if (event.type !== 'user/message' || event.data.source.kind !== 'user'
      || ranges.some(range => event.seq >= range.start && event.seq < range.end)) continue
    const text = event.data.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    items.push({ messageId: event.data.id, seq: event.seq, time: event.time, turn, preview: text.slice(0,100) })
  }
  return items
}

function validTarget(session, request) {
  const event = session.snapshotEvents().find(event => event.seq === request.seq)
  if (!event || event.type !== 'user/message' || event.data.id !== request.messageId || event.data.source.kind !== 'user') {
    fail('invalid-target', '无法定位原始用户消息，请刷新后重试。')
  }
  if (!session.surface.nodes.includes(event.seq)) fail('stale-target', '该消息已被编辑、回退或压缩，请刷新后重试。')
  return event
}

function replaceText(content, text) {
  let replaced = false
  const next = content.flatMap(part => {
    if (part.type !== 'text') return [clone(part)]
    if (replaced) return []
    replaced = true
    return [{ type: 'text', text }]
  })
  if (!replaced) next.push({ type: 'text', text })
  return next
}

function wasDelivered(agent, id) {
  return agent.session.snapshotEvents().some(event => event.type === 'user/message' && event.data.id === id)
    || [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => message.id === id)
}

function abortBeforeCommit(signal) { if (signal?.aborted) fail('cancelled', '编辑请求已取消。') }

async function waitForIdle(agent, signal) {
  let timer
  try {
    await Promise.race([
      agent.whenIdle(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new HistoryError('busy', '当前执行尚未停止，请稍后重试。')), 20000) }),
    ])
  } finally { clearTimeout(timer) }
  abortBeforeCommit(signal)
}

/** 首个新请求已进入原生 step 后，把回合外检查点归一为空 developer 节点。 */
export function prepareEditedHistory({ agent, turn, step }) {
  const session = agent.session
  const active = new Set(session.surface.nodes)
  for (const marker of markers(session)) {
    if (!active.has(marker.seq)) continue
    session.append('developer/message', {
      turn, step,
      message: { id: randomUUID(), role: 'developer', content: [], source: { kind: 'annotation-history-cleanup', markerId: marker.data.id } },
    }, { surfaceOp: { op: 'replace', startSeq: marker.seq, endSeq: marker.seq }, sourceEventSeqs: [marker.seq] })
  }
}

/** 依赖由安装层传入；真实 Agent 的 maintenance 阶段阻止新回合抢占提交。 */
export class HistoryEditor {
  constructor({ flush }) { this.flush = flush; this.tails = new Map(); this.requests = new Map() }

  async listMessages(agent) {
    if (agent.session.header.origin === 'subagent') fail('unsupported', '暂不支持编辑子代理会话。')
    return { ok: true, version: 'native-history-v2', items: navigationMessages(agent.session) }
  }

  editAndResubmit(agent, raw, signal, principal) {
    const request = parseEditRequest(raw)
    const key = `${agent.id}:${request.requestId}`
    const fingerprint = JSON.stringify(request)
    const pending = this.requests.get(key)
    if (pending) {
      if (pending.fingerprint !== fingerprint) return Promise.reject(new HistoryError('request-conflict', '同一请求标识不能用于不同的编辑内容。'))
      return pending.promise
    }
    const previous = this.tails.get(agent.id) || Promise.resolve()
    const promise = previous.catch(() => {}).then(() => this.perform(agent, request, signal, principal))
    const tail = promise.then(() => {}, () => {})
    this.tails.set(agent.id, tail)
    this.requests.set(key, { fingerprint, promise })
    void tail.then(() => {
      this.requests.delete(key)
      if (this.tails.get(agent.id) === tail) this.tails.delete(agent.id)
    })
    return promise
  }

  async perform(agent, request, signal, principal) {
    const session = agent.session
    if (session.header.origin === 'subagent') fail('unsupported', '暂不支持编辑子代理会话。')
    let marker = markers(session).find(event => event.data.source.requestId === request.requestId)
    if (marker) {
      const source = marker.data.source
      if (source.targetMessageId !== request.messageId || source.targetSeq !== request.seq || source.text !== request.text) {
        fail('request-conflict', '该请求标识已用于其他编辑内容。')
      }
      if (wasDelivered(agent, source.replacement.id)) return { ok: true, requestId: request.requestId, markerSeq: marker.seq, duplicate: true }
      if (session.surface.nodes.at(-1) !== marker.seq) fail('stale-retry', '会话已继续变化，无法重试旧编辑。')
    } else validTarget(session, request)
    abortBeforeCommit(signal)
    // 先确认当前 Session 存在持久化承载，再停止执行；失败不触碰历史。
    if (!await this.flush(session)) fail('durability', '当前会话未配置持久化，无法安全编辑历史。')
    agent.cancel({ kind: 'user' })
    await waitForIdle(agent, signal)
    return agent.runMaintenance(async maintenanceSignal => {
      abortBeforeCommit(signal)
      if (maintenanceSignal.aborted) fail('cancelled', '编辑请求已取消。')
      if (!marker) {
        const original = validTarget(session, request)
        const surface = [...session.surface.nodes]
        const withdrawn = surface.slice(surface.indexOf(original.seq))
        const items = historyMessages(session)
        const target = items.find(item => item.seq === original.seq)
        const endTurn = session.snapshotEvents().reduce((turn, event) => event.type === 'turn/start' ? event.data.turn : turn, target.turn)
        const replacement = {
          id: randomUUID(), role: 'user', content: replaceText(original.data.content, request.text),
          source: { kind: 'user', rpcId: request.requestId, ...(principal && principal.kind !== 'owner' ? { principal: clone(principal) } : {}), ...(original.data.source.clientTimeZone ? { clientTimeZone: original.data.source.clientTimeZone } : {}) },
        }
        const source = {
          kind: EDIT_SOURCE, requestId: request.requestId, targetMessageId: original.data.id,
          targetSeq: original.seq, text: request.text, replacement, startTurn: target.turn, endTurn,
        }
        // 回合外只写合法的空用户检查点；首次新请求在原生 step 内归一为空 developer。
        marker = session.append('user/message', {
          id: randomUUID(), role: 'user', content: [], source,
        }, { surfaceOp: { op: 'replace', startSeq: withdrawn[0], endSeq: withdrawn.at(-1) }, sourceEventSeqs: withdrawn })
      }
      const replacement = marker.data.source.replacement
      if (!wasDelivered(agent, replacement.id)) agent.followup(clone(replacement))
      try { await this.flush(session) } catch (error) {
        // 不让未持久化的待执行输入在失败后继续唤醒模型；相同 requestId 可安全恢复。
        agent.cancel({ kind: 'user' })
        fail('durability', '保存编辑失败，内容已保留；请重试同一次编辑。')
      }
      return { ok: true, requestId: request.requestId, markerSeq: marker.seq, duplicate: false }
    })
  }
}

export function historyFailure(error) {
  return { ok: false, code: error.code || 'history-edit-failed', message: error.message || '历史编辑失败，请重试。' }
}

/** 浏览器侧历史模块：自有 RPC、持久化撤回投影和按用户消息跳转的键盘导航。 */
window.__ModuleLoader__.load({
  id: 'dsh-annotation-rewind-scroll/client.history.js',
  factory() {
    const NS = 'annotationHistory'
    const SOURCE = 'annotation-history-edit'
    // 与 history-contract.js 的 wire 形状一致；Host 侧严格验证全部编辑字段。
    const codec = typeSymbol => ({ mode: 'strict', typeSymbol, create: () => ({ parse: value => value }) })
    const REMOTE = {
      package: 'dsh-annotation-rewind-scroll',
      descriptors: ['listMessages', 'editAndResubmit'].map(method => ({
        id: `${NS}/${method}`, service: NS, namespace: NS, method, invocation: { kind: 'direct' },
        parameters: [
          { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent', codec: codec('@deepseek-ai/dsh-session/types#SessionId') },
          ...(method === 'editAndResubmit' ? [{ name: 'request', wire: 'request', source: 'json', codec: codec('dsh-annotation-rewind-scroll#EditRequest') }] : []),
        ], cancellation: { parameter: 'signal' }, result: codec('dsh-annotation-rewind-scroll#HistoryResult'),
      })),
    }
    const rawEvents = session => session?.eventSource?.getSnapshot().entries.map(entry => entry.event).filter(Boolean) || []
    const sourceOf = event => event.type === 'user/message' ? event.data.source : undefined
    const keyMatches = (node, id) => node.getAttribute('data-chat-node-key')?.endsWith(`input-message${id}`)
    const userNodes = () => [...document.querySelectorAll('[data-chat-node-key]')].filter(node =>
      ['user', 'steering'].includes(node.getAttribute('data-chat-flow-kind')) && !node.hasAttribute('data-dsa-withdrawn'))
    const editable = element => element && element.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.cm-editor,[role="dialog"]')
    const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms))

    async function installHistory(ctx, bridge) {
      const unmountRemote = await ctx.remote.$mount(REMOTE)
      let stopped = false, sessionId, session, unsubscribe, generation = 0
      let currentMessageId = null, listing = null, busy = false, recalling = false
      const recallSessions = new Map()
      const api = () => ctx.get('remote.annotationHistory')
      const t = (key, fallback) => bridge.t ? bridge.t(key) : fallback
      const failure = response => t(`history.error.${response?.value?.code || 'requestFailed'}`, response?.value?.message || response?.error?.message || 'History request failed.')
      const style = document.createElement('style')
      style.setAttribute('data-dsa-history-style', '')
      style.textContent = '[data-dsa-withdrawn]{display:none!important}[data-dsa-history-current]{scroll-margin-top:24px}'
      document.head.appendChild(style)

      function syncVisibility() {
        const ranges = rawEvents(session).filter(event => sourceOf(event)?.kind === SOURCE).map(event => ({ event, source: sourceOf(event) }))
        const cleanupIds = rawEvents(session).filter(event => event.type === 'developer/message'
          && event.data.message.source.kind === 'annotation-history-cleanup').map(event => event.data.message.id)
        const nodes = [...document.querySelectorAll('[data-chat-node-key]')]
        for (const node of nodes) {
          const turn = Number(node.getAttribute('data-chat-turn'))
          const key = node.getAttribute('data-chat-node-key') || ''
          const hidden = cleanupIds.some(id => key.endsWith(id)) || ranges.some(({ event, source }) => {
            if (key.endsWith(event.data.id)) return true
            if (!node.hasAttribute('data-chat-turn') || turn < source.startTurn || turn > source.endTurn) return false
            // 同回合插话前的消息仍可见；目标之后的同回合内容才被撤回。
            if (turn === source.startTurn) {
              const target = nodes.find(n => keyMatches(n, source.targetMessageId))
              if (target && target !== node && !(target.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) return false
            }
            return true
          })
          if (hidden) node.setAttribute('data-dsa-withdrawn', '')
          else node.removeAttribute('data-dsa-withdrawn')
        }
      }

      function setSession(id) {
        if (sessionId === id) return
        generation++; unsubscribe?.(); unsubscribe = undefined
        sessionId = id; currentMessageId = null; listing = null
        session = id ? ctx.sessions.binding(id)?.session : undefined
        if (session?.eventSource?.subscribe) unsubscribe = session.eventSource.subscribe(() => {
          listing = null; bridge.repaint()
        })
        syncVisibility()
      }

      async function messages() {
        if (!listing) {
          const response = await api().listMessages(sessionId)
          if (!response?.ok || !response.value?.ok) throw new Error(failure(response))
          listing = response.value.items
        }
        return listing
      }

      function viewportOf(node) {
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const overflow = window.getComputedStyle(parent).overflowY
          if (/(auto|scroll)/.test(overflow) && parent.scrollHeight > parent.clientHeight + 1) return parent
        }
        return document.documentElement
      }

      async function navigate(direction) {
        if (busy || !sessionId || stopped) return false
        busy = true
        const activeGeneration = generation
        try {
          const items = await messages()
          if (!items.length || generation !== activeGeneration) return false
          const nodes = userNodes()
          let index = items.findIndex(item => item.messageId === currentMessageId)
          if (index >= 0) index += direction
          else {
            const first = nodes[0]
            const edge = first ? viewportOf(first).getBoundingClientRect().top + 24 : 24
            const candidates = nodes.map(node => ({ node, item: items.findIndex(item => keyMatches(node, item.messageId)), top: node.getBoundingClientRect().top }))
              .filter(candidate => candidate.item >= 0)
            if (direction < 0) {
              const above = candidates.filter(candidate => candidate.top < edge)
              index = above.length ? above.at(-1).item : (candidates[0]?.item ?? items.length) - 1
            } else {
              index = candidates.find(candidate => candidate.top > edge)?.item ?? items.length
            }
          }
          if (index < 0 || index >= items.length) return false
          const item = items[index]
          if (typeof session.loadThrough === 'function') await session.loadThrough(item.seq)
          let node
          for (let attempt = 0; attempt < 60; attempt++) {
            if (generation !== activeGeneration || stopped) return false
            syncVisibility()
            node = userNodes().find(node => keyMatches(node, item.messageId))
            if (node) break
            await sleep(40)
          }
          if (!node) return false
          for (const current of document.querySelectorAll('[data-dsa-history-current]')) current.removeAttribute('data-dsa-history-current')
          node.setAttribute('data-dsa-history-current', '')
          node.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
          currentMessageId = item.messageId
          return true
        } finally { busy = false }
      }

      function composerInput() {
        const scope = sessionId && ctx.sessions.scope?.(sessionId)
        return scope ? ctx.conversation.input.for(scope) : undefined
      }

      function draftSnapshot(input, state) {
        // 使用宿主语义快照，恢复草稿时保留引用 chip；附件仍由原输入框管理。
        return structuredClone(input.draftSnapshot || {
          text: state.draft,
          references: (state.occurrences || []).map(({ occurrenceId, ...reference }) => reference),
        })
      }

      async function recall(direction, input) {
        if (recalling || stopped || !sessionId) return false
        recalling = true
        const activeGeneration = generation
        const id = sessionId
        const before = input.state.getSnapshot()
        const unchanged = () => !stopped && generation === activeGeneration
          && input.state.getSnapshot().draftRev === before.draftRev
          && input.state.getSnapshot().phase === 'plain'
        try {
          const items = await messages()
          if (!items.length || !unchanged()) return false
          let browsing = recallSessions.get(id)
          // 普通发送后新的用户消息已入账，下一次浏览从当前草稿重新开始。
          if (browsing?.latestId !== items.at(-1).messageId) browsing = undefined
          const previous = browsing ? items.findIndex(item => item.messageId === browsing.currentId) : items.length
          if (previous < 0) return false
          let index = previous + direction
          if (index < 0 || index > items.length || (!browsing && direction > 0)) return false
          let next
          // 只有附件而没有正文的消息不作为文本草稿历史。
          while (index >= 0 && index < items.length) {
            const item = items[index]
            if (browsing?.drafts.has(item.messageId)) {
              next = browsing.drafts.get(item.messageId)
              break
            }
            if (typeof session.loadThrough === 'function') await session.loadThrough(item.seq)
            if (!unchanged()) return false
            const event = rawEvents(session).find(event => event.seq === item.seq
              && event.type === 'user/message' && event.data.id === item.messageId && event.data.source.kind === 'user')
            if (!event) throw new Error(t('history.error.load', 'Unable to load this earlier input.'))
            const text = event.data.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
            if (text.trim()) { next = { text, references: [] }; break }
            index += direction
          }
          if (!unchanged() || index < 0 || (!next && index !== items.length)) return false
          const saved = draftSnapshot(input, before)
          const state = browsing || { original: saved, latestId: items.at(-1).messageId, currentId: null, drafts: new Map() }
          input.setDraft(next || state.original)
          if (browsing) state.drafts.set(state.currentId, saved)
          if (next) {
            state.currentId = items[index].messageId
            recallSessions.set(id, state)
          } else recallSessions.delete(id)
          return true
        } finally { recalling = false }
      }

      function onKey(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229
          || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        const direction = ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : ['ArrowDown', 'PageDown'].includes(event.key) ? 1 : 0
        if (!direction || !session || bridge.isEditing()) return
        const target = event.target
        const composer = target.closest?.('[data-composer-input][contenteditable="true"]')
        if (composer) {
          if (target.closest('[role="dialog"]') || composer.hasAttribute('data-composer-composing')
            || document.querySelector('[role="listbox"], [role="menu"]')) return
          const input = composerInput()
          if (!input || input.state.getSnapshot().phase !== 'plain') return
          event.preventDefault()
          void recall(direction, input).catch(error => input.notify('error', t('history.error.load', error.message)))
          return
        }
        if (editable(target)) return
        if (target !== document.body && target !== document.documentElement
          && !target.closest('[data-chat-node-key],[data-slot="conversation.chat.flow"],[data-slot="conversation.chat.view"]')) return
        event.preventDefault()
        void navigate(direction).catch(error => console.warn('[annotation] history navigation failed:', error.message))
      }
      const resetPosition = () => { currentMessageId = null }
      document.addEventListener('keydown', onKey)
      document.addEventListener('wheel', resetPosition, { passive: true })
      setSession(bridge.sessionId())
      return {
        setSession, syncVisibility, navigate,
        async edit(id, request) {
          const response = await api().editAndResubmit(id, request)
          if (!response?.ok) throw new Error(failure(response))
          if (!response.value?.ok) throw new Error(failure(response))
          listing = null
          return response.value
        },
        async dispose() {
          stopped = true; generation++; unsubscribe?.(); recallSessions.clear()
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('wheel', resetPosition)
          for (const node of document.querySelectorAll('[data-dsa-withdrawn],[data-dsa-history-current]')) {
            node.removeAttribute('data-dsa-withdrawn'); node.removeAttribute('data-dsa-history-current')
          }
          style.remove()
          await unmountRemote()
        },
      }
    }
    return { installHistory }
  },
})

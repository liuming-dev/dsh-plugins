/**
 * dsh-annotation-rewind-scroll — 选中消息 / 文档文本添加注释，随下一条消息一起发送。
 *
 * 交互参考 Codex：
 * - 划选 → 「添加注释」→ 写评论 → 保存到待发送清单；
 * - 输入框底部工具栏只保留一行「N 条注释」，hover / 点击展开记录列表（所选文本 + 用户评论，可编辑、删除）；
 * - 原生发送入口在完整正文后追加附录；不向编辑器插入字符或引用节点。
 */
window.__ModuleLoader__.load({
  id: 'dsh-annotation-rewind-scroll',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React

    const NS = 'annotation'
    const SOURCE = 'annotation'
    const STORAGE_KEY = 'dsh.annotation.v1'
    const HIGHLIGHT_NAME = 'dsh-annotation'
    const PENDING_HIGHLIGHT = 'dsh-annotation-pending'
    const MAX_QUOTE = 2000
    const MAX_ITEMS = 300
    const DOC_ROOTS = '[data-document-markdown],[data-code-preview],[data-textpreview-plain],[data-pdf-preview]'
    /* 第三方/宿主文件页的容器：DSH 右栏用 dockkit，better-sidebar 也用 dockkit 面板承载编辑器。 */
    const PANE_ROOTS = '[data-dockkit-pane],[data-dockkit-float],[data-dockkit-column],[data-dsh-pane],[data-dsh-panel],'
      + '[data-window-body],[data-window-body-layout],.cm-editor,.cm-content'
    const PATH_PATTERN = /(^|[\\/])[^\\/\s]+\.(md|markdown|mdx|txt|json|jsonl|ts|tsx|js|jsx|py|go|java|css|scss|html|yml|yaml|sh|sql|rs|toml|ini|conf|log|csv|tsv|pdf)$/i

    // ── 模块级状态 ──────────────────────────────────────────────────────────
    let ctxRef = null
    let historyClient = null
    let uiT = (key) => key
    let currentSession = undefined
    let currentDoc = undefined
    let rev = 0
    const listeners = new Set()
    const items = new Map()
    const ui = { selection: null, composer: null, list: false, edit: null, error: null }
    /* 注释在页面上的小圆标位置（每次高亮重算时同步）。 */
    const markerRects = new Map()
    const markerElements = new Map()
    let noteElement = null
    /* 注释创建时的实时 Range：DOM 没被重建时比按文本查找更可靠。 */
    const liveRanges = new Map()
    /* 每条用户消息的常驻铅笔位置：nodeKey → { node, rect, text } */
    const editTargets = new Map()
    let lastGesture = undefined
    /* 正在批注的选区（卡片打开期间保持可见）。 */
    let pendingRange = null
    const gestureTrace = []

    const subscribe = (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
    const getRev = () => rev
    const useRev = () => useSyncExternalStore(subscribe, getRev, getRev)
    const bump = () => {
      rev += 1
      for (const listener of [...listeners]) {
        try { listener() } catch (error) { console.error('[annotation] listener failed', error) }
      }
    }

    // ── 持久化 ──────────────────────────────────────────────────────────────
    function persist() {
      try {
        const rows = [...items.values()].slice(-MAX_ITEMS)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, rows }))
      } catch (error) {
        console.error('[annotation] persist failed', error)
      }
    }

    function restore() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (!parsed || !Array.isArray(parsed.rows)) return
        for (const row of parsed.rows) {
          if (!row || typeof row.id !== 'string' || typeof row.sessionId !== 'string' || row.status === 'sent' || row.status === 'deleted') continue
          row.status = row.status === 'sent' ? 'sent' : 'pending'
          row.attached = false
          items.set(row.id, row)
        }
      } catch (error) {
        console.error('[annotation] restore failed', error)
      }
    }

    function commit() { persist(); bump(); scheduleRepaint() }

    // ── DOM 工具 ────────────────────────────────────────────────────────────
    const elementOf = (node) => (node && node.nodeType === 1 ? node : node && node.parentElement) || null

    function textNodesOf(root) {
      const out = []
      if (!root) return out
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) { out.push(node); node = walker.nextNode() }
      return out
    }

    /** 把 root 下的文本节点拼成一整串；跨块时补一个换行，与 selection.toString() 的形状对齐。 */
    function documentText(root) {
      const nodes = textNodesOf(root)
      const starts = []
      let full = ''
      let previousBlock = null
      for (const node of nodes) {
        const element = node.parentElement
        const block = element === null ? null : element.closest('p,div,li,h1,h2,h3,h4,h5,h6,pre,tr,blockquote,section,article,td,th')
        if (previousBlock !== null && block !== previousBlock) full += '\n'
        starts.push(full.length)
        full += node.nodeValue || ''
        previousBlock = block
      }
      return { nodes, starts, full }
    }

    /** 引用的空白（换行 / 多空格）不参与匹配，其余按字面。 */
    function findQuote(full, quote) {
      if (!quote) return null
      const pattern = quote
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\s+/g, '\\s+')
        .trim()
      if (pattern === '') return null
      const match = new RegExp(pattern).exec(full)
      return match === null ? null : { index: match.index, length: match[0].length }
    }

    function rangeIn(root, quote) {
      const { nodes, starts, full } = documentText(root)
      if (nodes.length === 0) return null
      const hit = findQuote(full, quote)
      if (hit === null) return null
      const locate = (offset) => {
        let lo = 0
        let hi = nodes.length - 1
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1
          if (starts[mid] <= offset) lo = mid
          else hi = mid - 1
        }
        return { nodeIndex: lo, offset: offset - starts[lo] }
      }
      const start = locate(hit.index)
      const end = locate(Math.min(hit.index + hit.length, full.length))
      try {
        const range = document.createRange()
        range.setStart(nodes[start.nodeIndex], Math.min(start.offset, nodes[start.nodeIndex].nodeValue.length))
        range.setEnd(nodes[end.nodeIndex], Math.min(end.offset, nodes[end.nodeIndex].nodeValue.length))
        return range
      } catch (error) {
        return null
      }
    }

    /** 第三方文件页（better-sidebar 等）：路径取自同面板顶部的路径输入框。 */
    function pathFieldIn(scope) {
      const fields = [...scope.querySelectorAll('input, textarea')]
        .filter(el => typeof el.value === 'string' && el.value.trim() !== '')
        .map(el => ({ value: el.value.trim(), top: el.getBoundingClientRect().top }))
        .filter(item => PATH_PATTERN.test(item.value) || /^[\w./@-]+\/[\w./@-]+$/.test(item.value))
        .sort((a, b) => a.top - b.top)
      return fields[0] ? fields[0].value : undefined
    }

    /**
     * 文件页的路径：路径输入框可能不在选区最近的容器里（tab body、dockkit 列、浮窗头）。
     * 从最近的容器开始逐层向外找，最多 6 层，避免扫到全局。
     */
    function pathFromPane(pane) {
      let scope = pane
      for (let depth = 0; scope !== null && scope !== document.body && depth < 10; depth += 1) {
        const found = pathFieldIn(scope)
        if (found !== undefined) return found
        scope = scope.parentElement
      }
      return undefined
    }

    /** CodeMirror 选区所在行号：优先读行号 gutter，取不到时退回可见行序号。 */
    function codeMirrorLine(anchor) {
      const content = anchor.closest('.cm-content')
      const lineEl = anchor.closest('.cm-line')
      if (content === null || lineEl === null) return undefined
      const index = [...content.querySelectorAll('.cm-line')].indexOf(lineEl)
      const editor = content.closest('.cm-editor')
      const gutters = editor === null
        ? []
        : [...editor.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].filter(el => el.style.visibility !== 'hidden')
      const label = gutters[index] === undefined ? undefined : gutters[index].textContent
      const number = label === undefined ? NaN : Number(String(label).trim())
      if (Number.isFinite(number)) return number
      return index >= 0 ? index + 1 : undefined
    }

    function messageRoots(nodeKey) {
      return [...document.querySelectorAll('[data-chat-node-key]')]
        .filter(el => el.getAttribute('data-chat-node-key') === nodeKey)
    }

    function documentRoots(annotation) {
      const roots = [...document.querySelectorAll(DOC_ROOTS)]
      if (annotation.path) {
        for (const pane of document.querySelectorAll(PANE_ROOTS)) {
          if (pathFromPane(pane) === annotation.path) roots.push(pane)
        }
      }
      return roots
    }

    function resolveRange(annotation) {
      if (annotation.kind === 'message') {
        for (const root of messageRoots(annotation.nodeKey)) {
          const range = rangeIn(root, annotation.quote)
          if (range) return range
        }
        return null
      }
      if (annotation.line !== undefined) {
        const lineEl = [...document.querySelectorAll('[data-textpreview-line]')]
          .find(el => Number(el.getAttribute('data-textpreview-line')) === annotation.line)
        if (lineEl) {
          const range = rangeIn(lineEl, annotation.quote)
          if (range) return range
        }
      }
      for (const root of documentRoots(annotation)) {
        const range = rangeIn(root, annotation.quote)
        if (range) return range
      }
      return null
    }

    let repaintTimer = 0
    function scheduleRepaint() {
      if (repaintTimer) return
      repaintTimer = window.requestAnimationFrame(() => { repaintTimer = 0; repaint() })
    }

    // 滚动只更新角标几何，不遍历引用正文或重绘整个 React 工具栏。
    let markerFrame = 0
    function scheduleMarkerPaint() {
      if (markerFrame) return
      markerFrame = window.requestAnimationFrame(() => { markerFrame = 0; paintMarkers(); placeDockEditor() })
    }

    /** top layer 不受父级 overflow 裁剪，需要与原文相同的可视交集。 */
    function visibleBounds(anchor, cache) {
      const clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      for (let node = anchor; node && node !== document.documentElement; node = node.parentElement) {
        let entry = cache.get(node)
        if (!entry) {
          const style = window.getComputedStyle(node)
          const x = /^(auto|scroll|hidden|clip)$/.test(style.overflowX)
          const y = /^(auto|scroll|hidden|clip)$/.test(style.overflowY)
          const rect = x || y ? node.getBoundingClientRect() : null
          entry = { x, y, rect }
          cache.set(node, entry)
        }
        if (entry.x) {
          clip.left = Math.max(clip.left, entry.rect.left + node.clientLeft)
          clip.right = Math.min(clip.right, entry.rect.left + node.clientLeft + node.clientWidth)
        }
        if (entry.y) {
          clip.top = Math.max(clip.top, entry.rect.top + node.clientTop)
          clip.bottom = Math.min(clip.bottom, entry.rect.top + node.clientTop + node.clientHeight)
        }
      }
      if (anchor.closest('[data-chat-node-key]')) {
        const scroll = anchor.closest('[data-conversation-scroll]')
        const composer = scroll?.querySelector('[data-composer-seat],[data-composer-card]')
        if (composer) clip.bottom = Math.min(clip.bottom, composer.getBoundingClientRect().top)
      }
      return clip
    }

    function paintMarkers() {
      const cache = new Map(), updates = []
      for (const [id, el] of markerElements) {
        const annotation = items.get(id)
        const range = liveRanges.get(id)
        const style = { visibility: 'hidden' }
        updates.push({ el, style })
        if (annotation?.sessionId !== currentSession || !range?.endContainer?.isConnected) continue
        const rects = typeof range.getClientRects === 'function' ? [...range.getClientRects()] : []
        const box = rects.at(-1) || range.getBoundingClientRect?.()
        if (!box?.height) continue
        const clip = visibleBounds(elementOf(range.endContainer), cache)
        markerRects.set(id, { left: box.left, top: box.top, right: box.right, bottom: box.bottom })
        const left = box.right + 3, top = box.top - 8
        const width = el.offsetWidth || 18, height = el.offsetHeight || 18
        // 原文末行或整个角标离开可视区时隐藏，不能吸附到窗口边缘。
        if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right
          || left >= clip.right || left + width <= clip.left || top >= clip.bottom || top + height <= clip.top) continue
        style.transform = `translate3d(${left}px,${top}px,0)`
        style.clipPath = `inset(${Math.max(0, clip.top - top)}px ${Math.max(0, left + width - clip.right)}px ${Math.max(0, top + height - clip.bottom)}px ${Math.max(0, clip.left - left)}px)`
        style.visibility = 'visible'
      }
      for (const { el, style } of updates) {
        for (const [key, value] of Object.entries(style)) if (el.style[key] !== value) el.style[key] = value
      }
    }

    function markerRef(id) {
      return el => {
        if (!el) { markerElements.delete(id); return }
        markerElements.set(id, el)
        try { if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) el.showPopover() } catch (_) { /* 兼容旧浏览器 */ }
        scheduleMarkerPaint()
      }
    }

    /** 列表编辑以待发送列表为锚点；原文位置只用于从角标打开的编辑。 */
    function placeDockEditor() {
      const anchor = ui.composer?.anchorElement
      if (!noteElement || !anchor?.isConnected) return
      const rect = anchor.getBoundingClientRect(), box = noteElement.getBoundingClientRect()
      const gap = 8, edge = 8
      let left = rect.right + gap, top = rect.top
      if (left + box.width > window.innerWidth - edge) {
        if (rect.left - gap - box.width >= edge) left = rect.left - gap - box.width
        else {
          left = Math.max(edge, Math.min(rect.left, window.innerWidth - box.width - edge))
          top = rect.top - box.height - gap >= edge ? rect.top - box.height - gap : rect.bottom + gap
        }
      }
      noteElement.style.left = `${left}px`
      noteElement.style.top = `${Math.max(edge, Math.min(top, window.innerHeight - box.height - edge))}px`
    }

    function userMessageNodes() {
      return [...document.querySelectorAll('[data-chat-node-key]')].filter(node =>
        ['user', 'steering'].includes(node.getAttribute('data-chat-flow-kind')) && !node.hasAttribute('data-dsa-withdrawn'))
    }

    function currentSessionBinding() {
      return ctxRef && ctxRef.sessions && typeof ctxRef.sessions.binding === 'function'
        ? ctxRef.sessions.binding(currentSession) : undefined
    }

    /** 只使用本条用户消息的操作行，不按像素距离猜测相邻回答中的按钮。 */
    function copyButtonOf(node) {
      const row = node.querySelector('[data-clock="start"]')
      return row && [...row.querySelectorAll('button')].find(button =>
        !button.closest('[data-dsh-annotation-ui]') && /复制|copy|copied/i.test(
          `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`))
    }

    function syncEditTargets() {
      const previous = new Map(editTargets)
      editTargets.clear()
      const session = currentSessionBinding()?.session
      const entries = session?.eventSource?.getSnapshot().entries || []
      const messages = new Map(entries.filter(entry => entry.event?.type === 'user/message')
        .map(entry => [String(entry.event.data.id), entry.event]))
      for (const node of userMessageNodes()) {
        const copy = copyButtonOf(node)
        const bubble = node.querySelector('[class*="_bubble"],[data-user-message-bubble]')
        if (!copy || !bubble) continue
        const key = node.getAttribute('data-chat-node-key')
        const identity = key.match(/:input-message(.+)$/)
        const event = identity ? messages.get(identity[1]) : undefined
        const content = event?.data.content
        const text = Array.isArray(content)
          ? content.filter(part => part.type === 'text').map(part => part.text).join('\n')
          : (bubble.innerText || bubble.textContent || '')
        if (!text.trim()) continue
        const row = copy.closest('[data-clock="start"]')
        let seat = copy
        while (seat.parentElement !== row) seat = seat.parentElement
        let host = previous.get(key)?.host
        if (!host || host.parentElement !== row) {
          host = document.createElement('span')
          host.setAttribute('data-dsa-edit-action', '')
          host.style.display = 'contents'
          row.insertBefore(host, seat.nextSibling)
        }
        editTargets.set(key, {
          nodeKey: key, node, bubble, host, copyClass: copy.className, text, content,
          seq: event?.seq, messageId: event?.data.id, sessionId: currentSession,
        })
        previous.delete(key)
      }
      for (const target of previous.values()) target.host.remove()
    }

    function closeMessageEditor() {
      const edit = ui.edit
      ui.edit = null
      if (edit) {
        edit.bubble.removeAttribute('data-dsa-editing')
        edit.host.remove()
      }
      bump()
    }

    function openMessageEditor(target) {
      closeMessageEditor()
      const host = document.createElement('div')
      host.className = 'dsa-inline-edit-host'
      host.style.width = `${Math.max(260, target.bubble.getBoundingClientRect().width)}px`
      target.bubble.before(host)
      target.bubble.setAttribute('data-dsa-editing', '')
      ui.edit = { ...target, host, actionHost: target.host, busy: false, error: null }
      ui.composer = null
      bump()
    }

    function repaint() {
      historyClient?.syncVisibility()
      markerRects.clear()
      syncEditTargets()
      const ranges = []
      for (const annotation of items.values()) {
        if (annotation.status !== 'pending' || annotation.sessionId !== currentSession) continue
        const cached = liveRanges.get(annotation.id)
        const range = cached?.startContainer?.isConnected && cached?.endContainer?.isConnected ? cached : resolveRange(annotation)
        if (!range || !range.startContainer || !range.startContainer.isConnected) { liveRanges.delete(annotation.id); continue }
        liveRanges.set(annotation.id, range)
        ranges.push(range)
        const rects = typeof range.getClientRects === 'function' ? [...range.getClientRects()] : []
        const box = rects.length > 0
          ? rects[rects.length - 1]
          : (typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null)
        if (box && box.height > 0) markerRects.set(annotation.id, { left: box.left, top: box.top, right: box.right, bottom: box.bottom })
      }
      if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined') {
        try { CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges)) } catch (error) { /* 无高亮不影响功能 */ }
        try {
          CSS.highlights.delete(PENDING_HIGHLIGHT)
          if (pendingRange !== null) CSS.highlights.set(PENDING_HIGHLIGHT, new Highlight(pendingRange))
        } catch (error) { /* 同上 */ }
      }
      bump()
      scheduleMarkerPaint()
    }

    // ── 选区捕获 ────────────────────────────────────────────────────────────
    /** 记录最近的手势轨迹（最多 12 条），用于线上排查。 */
    function recordGesture() {
      if (lastGesture === undefined) return
      gestureTrace.push(lastGesture)
      if (gestureTrace.length > 12) gestureTrace.shift()
      console.debug('[annotation] gesture', lastGesture.reason, lastGesture.surface || '-', lastGesture.rect || '-')
    }

    function clearSelection() {
      if (ui.selection === null) return
      ui.selection = null
      bump()
    }

    function captureSelection() {
      if (ui.composer) { lastGesture = { reason: 'composer-open', at: Date.now() }; return }
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        lastGesture = { reason: 'no-selection', at: Date.now() }
        recordGesture()
        return clearSelection()
      }
      const range = selection.getRangeAt(0)
      const anchor = elementOf(range.commonAncestorContainer)
      if (!anchor || anchor.closest('[data-dsh-annotation-ui]')) return
      if (anchor.closest('[data-composer-chip]')) return
      const text = selection.toString().replace(/[ \t]+$/u, '')
      if (!text.trim()) return clearSelection()

      const chatEl = anchor.closest('[data-chat-node-key]')
      const chatKind = chatEl && chatEl.getAttribute('data-chat-flow-kind')
      const turn = chatEl && Number(chatEl.getAttribute('data-chat-turn'))
      const standardDoc = anchor.closest(DOC_ROOTS)
      const pane = standardDoc ? null : anchor.closest(PANE_ROOTS)
      if (!chatEl && !standardDoc && !pane) {
        lastGesture = { reason: 'not-document', anchorClass: String(anchor.className || anchor.tagName), at: Date.now() }
        console.debug('[annotation] selection has no known surface', {
          text: text.slice(0, 40),
          anchor: anchor.className || anchor.tagName,
        })
        recordGesture()
        return clearSelection()
      }
      if (chatEl && chatKind !== 'assistant-step') return clearSelection()

      const startAnchor = elementOf(range.startContainer)
      const endAnchor = elementOf(range.endContainer)
      let line, endLine
      if (standardDoc) {
        const lineEl = startAnchor?.closest('[data-textpreview-line]')
        if (lineEl) line = Number(lineEl.getAttribute('data-textpreview-line'))
        const lastLine = endAnchor?.closest('[data-textpreview-line]')
        if (lastLine) endLine = Number(lastLine.getAttribute('data-textpreview-line'))
        const pageEl = anchor.closest('[data-pdf-page]')
        if (pageEl) line = Number(pageEl.getAttribute('data-pdf-page'))
      } else if (pane) {
        line = codeMirrorLine(startAnchor)
        endLine = codeMirrorLine(endAnchor)
      }

      const rects = typeof range.getClientRects === 'function' ? [...range.getClientRects()] : []
      const rect = rects.length > 0
        ? rects[rects.length - 1]
        : (typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : { left: 0, top: 0, bottom: 0, right: 0 })

      ui.selection = {
        surface: chatEl ? 'message' : 'document',
        nodeKey: chatEl ? chatEl.getAttribute('data-chat-node-key') : undefined,
        turn: Number.isFinite(turn) ? turn : undefined,
        path: chatEl ? undefined : (standardDoc ? (currentDoc ? currentDoc.path : undefined) : pathFromPane(pane)),
        line: Number.isFinite(line) ? line : undefined,
        endLine: Number.isFinite(endLine) && endLine > line ? endLine : undefined,
        /* 第三方文件页里对方也有一个选区按钮（在其下方），本插件放到选区上方避让。 */
        placeAbove: Boolean(pane),
        quote: text.slice(0, MAX_QUOTE),
        rect: { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right },
        sessionId: currentSession,
      }
      lastGesture = {
        reason: 'ok',
        surface: chatEl ? 'message' : 'document',
        anchorClass: String(anchor.className || anchor.tagName),
        paneClass: pane ? String(pane.className) : null,
        path: ui.selection.path,
        rect: ui.selection.rect,
        at: Date.now(),
      }
      recordGesture()
      ui.selection.range = range.cloneRange()
      bump()
    }

    /** 选区确定后直接浮出批注卡片（不再先出现一个"添加注释"胶囊）。 */
    function openComposer() {
      const selection = ui.selection
      if (!selection) return
      pendingRange = selection.range || null
      scheduleRepaint()
      ui.composer = {
        mode: 'new',
        id: undefined,
        quote: selection.quote,
        rect: selection.rect,
        surface: selection.surface,
        nodeKey: selection.nodeKey,
        turn: selection.turn,
        path: selection.path,
        line: selection.line, endLine: selection.endLine,
        sessionId: selection.sessionId,
        text: '',
      }
      ui.selection = null
      ui.list = false
      bump()
    }

    function closeComposer() {
      ui.composer = null
      pendingRange = null
      scheduleRepaint()
      bump()
    }

    async function submitEditedMessage(text) {
      const edit = ui.edit
      if (!edit || edit.busy || !text.trim()) return
      edit.busy = true; edit.error = null
      if (edit.requestText !== text) {
        edit.requestId = globalThis.crypto.randomUUID()
        edit.requestText = text
      }
      bump()
      try {
        if (!historyClient) throw new Error(uiT('history.error.notReady'))
        if (!Number.isSafeInteger(edit.seq)) throw new Error(uiT('history.error.invalid-target'))
        await historyClient.edit(edit.sessionId, {
          requestId: edit.requestId, messageId: edit.messageId, seq: edit.seq, text,
        })
        closeMessageEditor()
      } catch (error) {
        edit.error = error instanceof Error ? error.message : uiT('history.error.requestFailed')
      } finally { edit.busy = false; bump() }
    }

    function openEditor(id, anchorElement = null) {
      const annotation = items.get(id)
      if (!annotation) return
      const rect = markerRects.get(id) || { left: 8, top: 8, right: 8, bottom: 8 }
      ui.composer = {
        mode: 'edit',
        anchorElement,
        id,
        quote: annotation.quote,
        rect,
        surface: annotation.kind,
        nodeKey: annotation.nodeKey,
        turn: annotation.turn,
        path: annotation.path,
        line: annotation.line, endLine: annotation.endLine,
        sessionId: annotation.sessionId,
        text: annotation.comment,
      }
      ui.list = false
      bump()
    }

    function saveComposer(text) {
      const draft = ui.composer
      if (!draft) return
      const value = String(text || '').trim()
      if (value === '') return
      if (draft.mode === 'edit' && draft.id !== undefined) {
        updateComment(draft.id, value)
      } else {
        createAnnotation(value)
      }
      closeComposer()
      ui.list = false
    }

    // ── 注释记录 ────────────────────────────────────────────────────────────
    function createAnnotation(comment) {
      const draft = ui.composer
      const text = comment.trim()
      if (!draft || !draft.sessionId || !text) { bump(); return }
      const annotation = {
        id: `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId: draft.sessionId,
        kind: draft.surface,
        nodeKey: draft.nodeKey,
        turn: draft.turn,
        path: draft.path,
        line: draft.line, endLine: draft.endLine,
        quote: draft.quote,
        comment: text,
        status: 'pending',
        attached: false,
        createdAt: Date.now(),
      }
      if (pendingRange !== null) liveRanges.set(annotation.id, pendingRange.cloneRange())
      items.set(annotation.id, annotation)
      commit()
    }

    function updateComment(id, comment) {
      const annotation = items.get(id)
      if (!annotation) return
      const text = comment.trim()
      if (text) annotation.comment = text
      commit()
    }

    function clearAll(sessionId) {
      if (ui.composer?.sessionId === sessionId) closeComposer()
      for (const [id, annotation] of [...items.entries()]) {
        if (annotation.sessionId !== sessionId || annotation.status === 'sent') continue
        liveRanges.delete(id)
        items.delete(id)
      }
      commit()
      bump()
    }

    function removeAnnotation(id) {
      if (ui.composer?.id === id) closeComposer()
      liveRanges.delete(id)
      items.delete(id)
      commit()
    }

    /** 仅清理旧版插件拥有的引用，保留文件引用、命令与用户原文。 */
    function migrateLegacyInput(input) {
      if (input?.state?.getSnapshot?.().phase !== 'plain') return
      const snapshot = input.draftSnapshot
      if (!snapshot?.references?.some(reference => reference.source === SOURCE)) return
      const removed = snapshot.references.filter(reference => reference.source === SOURCE)
      let text = '', cursor = 0
      for (const reference of removed) {
        text += snapshot.text.slice(cursor, reference.offset)
        cursor = reference.offset + reference.length
      }
      text += snapshot.text.slice(cursor)
      const references = snapshot.references.filter(reference => reference.source !== SOURCE).map(reference => ({
        ...reference,
        offset: reference.offset - removed.filter(part => part.offset + part.length <= reference.offset)
          .reduce((length, part) => length + part.length, 0),
      }))
      input.setDraft({ ...snapshot, text, references })
    }

    /**
     * 当前宿主的默认发送入口：引用已由宿主展开，附录只在这里追加。
     * 不拦截键盘、不修改草稿；保留原生附件、投递模式、失败恢复和取消语义。
     */
    function installAnnotationSubmission(conversation) {
      const native = conversation.sendSession
      if (typeof native !== 'function') throw new Error('Annotation submission requires conversation.sendSession')
      const descriptor = Object.getOwnPropertyDescriptor(conversation, 'sendSession')
      const reservations = new Map()
      let disposed = false
      const send = async function(session, text, ...rest) {
        if (disposed) return native.call(this, session, text, ...rest)
        const batch = [...items.values()].filter(annotation => annotation.sessionId === session.sessionId
          && annotation.status === 'pending' && !reservations.has(annotation.id))
          .sort((a, b) => a.createdAt - b.createdAt).map(annotation => ({ ...annotation }))
        if (!batch.length) return native.call(this, session, text, ...rest)
        const reservation = Symbol('annotation send')
        for (const annotation of batch) reservations.set(annotation.id, reservation)
        try {
          const appendix = serializeAnnotations(batch)
          const outcome = await native.call(this, session, text + appendix, ...rest)
          if (outcome?.kind === 'success' && !disposed) {
            for (const annotation of batch) {
              const current = items.get(annotation.id)
              if (current?.comment !== annotation.comment) continue
              items.delete(annotation.id)
              liveRanges.delete(annotation.id)
            }
            commit()
          }
          return outcome
        } finally {
          for (const annotation of batch) if (reservations.get(annotation.id) === reservation) reservations.delete(annotation.id)
        }
      }
      conversation.sendSession = send
      return () => {
        disposed = true
        if (conversation.sendSession === send) {
          if (descriptor) Object.defineProperty(conversation, 'sendSession', descriptor)
          else delete conversation.sendSession
        }
      }
    }

    // ── 模型序列化（待发送记录 → 附录文本）────────────────────────────────────────
    function annotationLocation(annotation, t) {
      if (annotation.kind === 'message') return annotation.turn === undefined
        ? t('prompt.answer') : t('row.message', { turn: annotation.turn })
      const path = annotation.path || t('row.currentDocument')
      if (annotation.line === undefined) return path
      return annotation.endLine === undefined
        ? t('row.document', { path, line: annotation.line })
        : t('row.documentRange', { path, line: annotation.line, endLine: annotation.endLine })
    }

    function serializeSession(ref) {
      const sessionId = ref.includes('#') ? ref.slice(0, ref.indexOf('#')) : ref
      const legacy = items.get(sessionId)
      const list = legacy ? [legacy] : [...items.values()]
        .filter(annotation => annotation.sessionId === sessionId && annotation.status !== 'sent')
        .sort((a, b) => a.createdAt - b.createdAt)
      return serializeAnnotations(list)
    }

    function serializeAnnotations(list) {
      if (list.length === 0) return ''
      const blocks = list.map((annotation, index) => {
        const location = annotationLocation(annotation, uiT)
        const where = annotation.kind === 'message' ? location : `${uiT('prompt.file')} ${location}`
        return [
          `${index + 1}) ${uiT('prompt.target', { where })}`,
          `   ${uiT('prompt.quote')}`,
          ...annotation.quote.split('\n').map(line => `   > ${line}`),
          `   ${uiT('prompt.comment', { comment: annotation.comment })}`,
        ].join('\n')
      })
      return `\n\n---\n\n${uiT('prompt.header')}\n\n${blocks.join('\n\n')}\n`
    }

    // ── 样式：类名 + 注入样式表（hover / 动画 / :focus-visible 只能写在样式表里）──
    const CSS_TEXT = `
      [data-dsh-annotation-ui]{box-sizing:border-box;font-family:inherit}
      .dsa-pill,.dsa-chip,.dsa-btn,.dsa-icon,.dsa-note__send,.dsa-pop__clear,.dsa-marker{font-family:inherit;cursor:pointer;transition:background-color .12s ease,color .12s ease}
      .dsa-pill:focus-visible,.dsa-chip:focus-visible,.dsa-btn:focus-visible,.dsa-icon:focus-visible,.dsa-note__send:focus-visible,.dsa-pop__clear:focus-visible,.dsa-marker:focus-visible,.dsa-edit:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}
      .dsa-pill,.dsa-pop,.dsa-note{position:fixed;inset:auto;margin:0;border:0;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,rgba(0,0,0,.1));color:var(--dsw-alias-label-primary,#111);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));box-shadow:var(--dsw-elevation-panel,0 0 0 1px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.12));font-size:13px;line-height:20px}
      .dsa-pill{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border-radius:var(--dsw-radius-md,8px);white-space:nowrap}
      .dsa-pill:hover{background:var(--dsw-alias-interactive-bg-hover,#f0f0f0)}
      .dsa-pill__plus{display:grid;place-items:center;color:var(--dsw-alias-label-secondary,#666)}
      .dsa-chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-tool-bar-fill,transparent);color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:18px}
      .dsa-chip:hover,.dsa-chip[aria-expanded=true]{background:var(--dsw-alias-button-tool-bar-hover,var(--dsw-alias-interactive-bg-hover,#f0f0f0));color:var(--dsw-alias-label-primary,#111)}
      .dsa-chip__count{font-variant-numeric:tabular-nums}
      .dsa-chip__sep{display:none}
      .dsa-chip__note{display:grid;place-items:center;margin-right:1px}
      .dsa-pop{z-index:70;display:flex;flex-direction:column;width:min(400px,calc(100vw - 24px));max-height:min(440px,calc(100vh - 24px));border-radius:var(--dsw-radius-lg,12px);overflow:hidden}
      .dsa-pop__head{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:12px 14px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));flex:0 0 auto}
      .dsa-pop__title{font-weight:500}
      .dsa-pop__badge{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888);font-variant-numeric:tabular-nums}
      .dsa-pop__clear{margin-left:auto;padding:3px 6px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:18px}
      .dsa-pop__clear:hover{background:var(--dsw-alias-interactive-bg-hover,#f0f0f0);color:var(--dsw-alias-label-primary,#111)}
      .dsa-pop__hint{flex-basis:100%;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888)}
      .dsa-pop__list{overflow:auto;overscroll-behavior:contain;padding:0 12px;scrollbar-width:thin}
      .dsa-item{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;padding:12px 0}
      .dsa-item+.dsa-item{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08))}
      .dsa-item__index{padding-top:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888);font-variant-numeric:tabular-nums}
      .dsa-item__quote{margin:0 0 6px;padding:7px 10px;border-left:2px solid var(--dsw-alias-border-l3,#ddd);border-radius:0 var(--dsw-radius-sm,6px) var(--dsw-radius-sm,6px) 0;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.035));color:var(--dsw-alias-label-secondary,#666);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .dsa-item__meta{display:flex;align-items:center;gap:5px;min-width:0;margin-bottom:6px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888)}
      .dsa-item__where{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsa-item__when{flex:0 0 auto;white-space:nowrap}
      .dsa-item__tools{display:flex;align-items:center;gap:2px;margin-left:auto;flex:0 0 auto}
      .dsa-item__label{display:block;margin-bottom:2px;color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:18px}
      .dsa-item__comment{font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
      .dsa-icon{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary,#888)}
      .dsa-icon:hover{background:var(--dsw-alias-interactive-bg-hover,#f0f0f0);color:var(--dsw-alias-label-primary,#111)}
      .dsa-icon--danger:hover{color:var(--dsw-alias-state-error-primary,#cf3636)}
      .dsa-btn{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border:0;border-radius:var(--dsw-radius-sm,6px);font-size:12px;line-height:18px}
      .dsa-btn:disabled,.dsa-note__send:disabled{opacity:.4;cursor:not-allowed}
      .dsa-btn--ghost{border:.5px solid var(--dsw-alias-border-l3,#ddd);background:transparent;color:var(--dsw-alias-label-primary,#111)}
      .dsa-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f0f0f0)}
      .dsa-btn--primary,.dsa-note__send{background:var(--dsw-alias-button-primary-fill,#111);color:var(--dsw-alias-label-primary-foreground,#fff)}
      .dsa-btn--primary:hover:not(:disabled),.dsa-note__send:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#333)}
      .dsa-note{z-index:2147483002;display:flex;align-items:flex-end;gap:8px;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);padding:10px 12px;border-radius:var(--dsw-radius-lg,12px)}
      .dsa-note--edit{flex-direction:column;align-items:stretch;gap:8px}
      .dsa-note__area{flex:1;min-width:0;width:100%;box-sizing:border-box;min-height:28px;max-height:160px;resize:none;border:0;outline:none;padding:4px 0;background:transparent;color:inherit;font:inherit;line-height:20px}
      .dsa-note__area::placeholder{color:var(--dsw-alias-label-tertiary,#888)}
      .dsa-note:focus-within{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3,#bbb)}
      .dsa-note__send{flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:50%}
      .dsa-note__foot{display:flex;align-items:center;gap:6px}
      .dsa-note__spacer{flex:1}
      .dsa-error,.dsa-inline-edit__error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#cf3636)}
      .dsa-inline-edit__error{margin:8px 0 0}
      [data-clock="start"]:has([data-dsa-edit-action]){opacity:1!important}
      .dsa-edit{position:relative;flex:0 0 auto}
      [data-dsa-editing]{display:none!important}
      .dsa-inline-edit-host{max-width:100%;min-width:0;box-sizing:border-box}
      .dsa-inline-edit{width:100%;padding:12px 16px;border-radius:var(--dsw-radius-xl,14px);background:var(--dsw-specific-bubble,var(--dsw-alias-bg-layer-2,#edf2ff));box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3,#ddd);font-size:inherit;line-height:inherit}
      .dsa-inline-edit__area{width:100%;box-sizing:border-box;min-height:52px;max-height:400px;resize:none;border:0;outline:none;background:transparent;color:inherit;font:inherit;line-height:inherit;padding:0}
      .dsa-inline-edit__foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
      .dsa-marker{position:fixed;inset:auto;left:0;top:0;visibility:hidden;will-change:transform;transition:none;margin:0;z-index:2147483000;min-width:18px;height:18px;padding:0 5px;border:0;border-radius:50%;background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;font-size:11px;line-height:18px;font-variant-numeric:tabular-nums;box-shadow:0 0 0 2px var(--dsw-alias-bg-base,#fff)}
      [popover].dsa-marker{display:inline-block}
      [popover].dsa-note,[popover].dsa-pop{display:flex}
      [popover].dsa-pill{display:inline-flex}
      @media(prefers-reduced-motion:reduce){[data-dsh-annotation-ui],[data-dsh-annotation-ui] *{animation:none!important;transition:none!important}}
    `

    /**
     * 把浮层推进浏览器的 top layer（Popover API）。
     * 右栏/浮窗如果以 <dialog> 或 popover 打开，会位于 top layer，任何 z-index 都盖不过它；
     * 只有同样进 top layer 才能保证选区胶囊可见。不可用时退化为普通 fixed 元素。
     */
    function topLayerRef() {
      return (el) => {
        if (el === null || typeof el.showPopover !== 'function') return
        try {
          if (!el.matches(':popover-open')) el.showPopover()
        } catch (error) { /* 已在 top layer 或环境不支持：忽略 */ }
        const box = el.getBoundingClientRect()
        if (!box.width || !box.height) return
        const dx = box.left < 8 ? 8 - box.left : Math.min(0, window.innerWidth - 8 - box.right)
        const dy = box.top < 8 ? 8 - box.top : Math.min(0, window.innerHeight - 8 - box.bottom)
        if (dx) el.style.left = `${parseFloat(el.style.left || '0') + dx}px`
        if (dy && el.style.bottom) el.style.bottom = `${parseFloat(el.style.bottom) - dy}px`
        else if (dy) el.style.top = `${parseFloat(el.style.top || '0') + dy}px`
      }
    }

    // 图标：细线描边，跟随 currentColor
    function Icon({ path, size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: path }))
    }
    const NOTE_PATH = 'M3.6 4.4a1 1 0 0 1 1-1h6.8a1 1 0 0 1 1 1v4.3L9.2 13H4.6a1 1 0 0 1-1-1z M9.3 13.1V10a1 1 0 0 1 1-1h3'
    const PENCIL_PATH = 'M11.1 2.7a1.2 1.2 0 0 1 1.7 0l.5.5a1.2 1.2 0 0 1 0 1.7L6.1 12.5l-2.7.7.7-2.7z'
    const CHECK_PATH = 'M3.2 8.4l3 3 6.6-6.8'
    const BOOKMARK_PATH = 'M4.6 2.8h6.8a.8.8 0 0 1 .8.8v9.6l-4.2-2.6-4.2 2.6V3.6a.8.8 0 0 1 .8-.8z'
    const TRASH_PATH = 'M3.4 4.6h9.2 M6.2 4.6v-.9a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v.9 M5.1 4.6l.4 7.6a1 1 0 0 0 1 .95h3a1 1 0 0 0 1-.95l.4-7.6'

    function AnnotationDock(props) {
      const { sessionId, useInput, t } = props
      useEffect(() => {
        historyClient?.setSession(sessionId)
        return () => { if (ui.edit?.sessionId === sessionId) closeMessageEditor() }
      }, [sessionId])
      uiT = t
      currentSession = sessionId
      useRev()
      const input = useInput(state => state)
      const [open, setOpen] = useState(false)
      const [anchor, setAnchor] = useState(null)
      const chipRef = useRef(null)
      const listRef = useRef(null)
      const closeTimer = useRef(0)
      const pinned = useRef(false)

      useEffect(() => {
        const scope = ctxRef.sessions.scope(sessionId)
        migrateLegacyInput(ctxRef.conversation.input.for(scope))
      }, [sessionId, input?.draftRev])

      const pending = [...items.values()]
        .filter(annotation => annotation.sessionId === sessionId && annotation.status !== 'sent')
        .sort((a, b) => a.createdAt - b.createdAt)

      useEffect(() => {
        if (!open || pending.length === 0) {
          pinned.current = false
          window.clearTimeout(closeTimer.current)
          if (pending.length === 0) setOpen(false)
          if (ui.composer?.anchorElement) closeComposer()
        }
      }, [open, pending.length])

      /* 点空白处收起批注卡片。 */
      useEffect(() => {
        const onDown = (event) => {
          const target = event.target
          if (target && typeof target.closest === 'function' && target.closest('[data-dsh-annotation-ui]')) return
          pinned.current = false
          setOpen(false)
          closeComposer()
        }
        const onKey = event => { if (event.key === 'Escape') { pinned.current = false; setOpen(false) } }
        document.addEventListener('pointerdown', onDown, true)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onDown, true)
          document.removeEventListener('keydown', onKey)
          window.clearTimeout(closeTimer.current)
        }
      }, [])

      const hoverOpen = useCallback(() => {
        if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = 0 }
        const rect = chipRef.current === null ? undefined : chipRef.current.getBoundingClientRect()
        if (rect !== undefined) {
          setAnchor({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 432)),
            bottom: Math.max(8, window.innerHeight - rect.top + 8),
          })
        }
        setOpen(true)
      }, [])
      const hoverClose = useCallback(() => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current)
        if (!pinned.current) closeTimer.current = window.setTimeout(() => setOpen(false), 180)
      }, [])

      const chip = h('div', {
        'data-dsh-annotation-ui': '',
        ref: chipRef,
        style: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 },
        onMouseEnter: pending.length > 0 ? hoverOpen : undefined,
        onMouseLeave: pending.length > 0 ? hoverClose : undefined,
      }, pending.length === 0 ? null : [
        h('button', {
          key: 'chip',
          type: 'button',
          'data-dsh-annotation-chip': '',
          className: 'dsa-chip',
          title: t(pending.length === 1 ? 'dock.hintOne' : 'dock.hint', { count: pending.length }),
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onMouseDown: event => event.preventDefault(),
          onClick: () => {
            pinned.current = !pinned.current
            if (pinned.current) hoverOpen()
            else setOpen(false)
          },
        }, [
          h('span', { key: 'note', className: 'dsa-chip__note' }, h(Icon, { path: BOOKMARK_PATH, size: 13 })),
          h('span', { key: 'count', className: 'dsa-chip__count' }, String(pending.length)),
          h('span', { key: 'sep', className: 'dsa-chip__sep', 'aria-hidden': true }),
          h('span', { key: 'label', className: 'dsa-chip__label' }, t(pending.length === 1 ? 'dock.countLabelOne' : 'dock.countLabel')),
        ]),
        ui.error ? h('span', { key: 'error', className: 'dsa-error' }, ui.error) : null,
      ])

      const list = open && anchor && pending.length > 0 ? createPortal(h('div', {
        'data-dsh-annotation-ui': '',
        'data-dsh-annotation-pop': '',
        popover: 'manual',
        ref: el => { listRef.current = el; topLayerRef()(el); placeDockEditor() },
        className: 'dsa-pop',
        role: 'dialog',
        'aria-label': t(pending.length === 1 ? 'dock.hintOne' : 'dock.hint', { count: pending.length }),
        style: { left: anchor.left, bottom: anchor.bottom },
        onMouseEnter: hoverOpen,
        onMouseLeave: hoverClose,
      }, [
        h('div', { key: 'head', className: 'dsa-pop__head' }, [
          h(Icon, { key: 'icon', path: BOOKMARK_PATH, size: 14 }),
          h('span', { key: 'title', className: 'dsa-pop__title' }, t('dock.title')),
          h('span', { key: 'badge', className: 'dsa-pop__badge' }, String(pending.length)),
          h('button', {
            key: 'clear',
            type: 'button',
            className: 'dsa-pop__clear',
            onClick: () => clearAll(sessionId),
          }, t('dock.clear')),
          h('span', { key: 'hint', className: 'dsa-pop__hint' }, t('dock.sentWithNext')),
        ]),
        h('div', { key: 'list', className: 'dsa-pop__list' },
          pending.map((annotation, index) => h(AnnotationItem, {
            key: annotation.id,
            annotation,
            index,
            t,
            onEdit: () => { pinned.current = true; hoverOpen(); openEditor(annotation.id, listRef.current) },
            onRemove: () => removeAnnotation(annotation.id),
          }))),
      ]), document.body) : null

      /* 选区后只出一个紧凑胶囊；点它才打开卡片，这样 Ctrl+C 仍然可用。 */
      const pill = ui.selection && !ui.composer ? createPortal(h('button', {
        type: 'button',
        'data-dsh-annotation-ui': '',
        popover: 'manual',
        ref: topLayerRef(),
        className: 'dsa-pill',
        style: {
          left: ui.selection.placeAbove
            ? Math.max(8, Math.min(ui.selection.rect.right + 8, window.innerWidth - 108))
            : Math.max(8, ui.selection.rect.left),
          top: ui.selection.placeAbove
            ? Math.max(8, ui.selection.rect.top - 6)
            : ui.selection.rect.bottom + 8,
        },
        onMouseDown: event => event.preventDefault(),
        onClick: () => openComposer(),
      }, [
        h('span', { key: 'plus', className: 'dsa-pill__plus', 'aria-hidden': true }, h(Icon, { path: PENCIL_PATH, size: 11 })),
        h('span', { key: 'label', className: 'dsa-pill__label' }, t('pill.short')),
      ]), document.body) : null

      const editPencils = [...editTargets.values()].map(target => createPortal(h('button', {
        key: `edit-${target.nodeKey}`,
        type: 'button',
        'data-dsh-annotation-ui': '',
        className: `${target.copyClass} dsa-edit`,
        title: t('edit.message'),
        'aria-label': t('edit.message'),
        disabled: ui.edit?.busy || false,
        onClick: () => openMessageEditor(target),
      }, h(Icon, { path: PENCIL_PATH, size: 15 })), target.host, target.nodeKey))

      const editCard = ui.edit ? createPortal(h('div', {
        key: 'edit-message',
        'data-dsh-annotation-ui': '',
        className: 'dsa-inline-edit',
        role: 'group',
        'aria-label': t('edit.title'),
      }, h(InlineMessageEditor, {
        text: ui.edit.text, busy: ui.edit.busy, error: ui.edit.error, t,
        onCancel: closeMessageEditor,
        onSend: submitEditedMessage,
      })), ui.edit.host) : null

      const composer = ui.composer ? createPortal(h(NoteCard, {
        key: `note-${ui.composer.mode}-${ui.composer.id === undefined ? 'new' : ui.composer.id}`,
        draft: ui.composer,
        t,
        onSave: saveComposer,
        onCancel: closeComposer,
        onDelete: () => {
          const id = ui.composer === null ? undefined : ui.composer.id
          ui.composer = null
          if (id !== undefined) removeAnnotation(id)
          bump()
        },
      }), document.body) : null

      /* 编号角标固定挂载，滚动时只更新位置与可视裁剪。 */
      const markers = pending.map((annotation, index) => {
        const rect = markerRects.get(annotation.id)
        if (rect === undefined) return null
        return createPortal(h('button', {
          key: annotation.id,
          type: 'button',
          'data-dsh-annotation-ui': '',
          popover: 'manual',
          ref: markerRef(annotation.id),
          className: 'dsa-marker',
          title: annotation.comment,
          'aria-label': t('marker.open', { index: index + 1 }),
          'data-dsa-marker-id': annotation.id,
          onMouseDown: event => event.preventDefault(),
          onClick: () => openEditor(annotation.id),
        }, String(index + 1)), document.body)
      })

      return h(React.Fragment, null,
        h(React.Fragment, { key: 'chip' }, chip),
        h(React.Fragment, { key: 'pill' }, pill),
        h(React.Fragment, { key: 'list' }, list),
        h(React.Fragment, { key: 'editPencils' }, editPencils),
        h(React.Fragment, { key: 'editCard' }, editCard),
        h(React.Fragment, { key: 'composer' }, composer),
        h(React.Fragment, { key: 'markers' }, markers))
    }

    /** 批注卡片：新建时是一行输入 + 圆形确认；编辑时多一行 删除/取消/保存。 */
    function NoteCard({ draft, t, onSave, onCancel, onDelete }) {
      const [text, setText] = useState(draft.text)
      const areaRef = useRef(null)
      useEffect(() => {
        const area = areaRef.current
        if (area === null) return
        area.focus()
        area.setSelectionRange(area.value.length, area.value.length)
      }, [])
      const isEdit = draft.mode === 'edit'
      const isMessageEdit = draft.mode === 'edit-message'
      const rect = draft.rect
      const width = 380
      const height = isMessageEdit ? 190 : (isEdit ? 168 : 52)
      const left = Math.max(8, Math.min(rect.right + 10, window.innerWidth - width - 12))
      const below = rect.bottom + 8
      const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - 8 - height) : below
      const save = () => { if (text.trim() !== '') onSave(text) }
      return h('div', {
        'data-dsh-annotation-ui': '',
        popover: 'manual',
        ref: el => { noteElement = el; topLayerRef()(el); placeDockEditor() },
        'data-dsa-note-origin': draft.anchorElement ? 'dock' : 'source',
        className: isEdit ? 'dsa-note dsa-note--edit' : 'dsa-note',
        style: { left, top },
        role: 'dialog',
        'aria-label': t(isMessageEdit ? 'edit.title' : (isEdit ? 'note.titleEdit' : 'note.title')),
        onKeyDown: (event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onCancel() }
          else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) { event.preventDefault(); save() }
        },
      }, [
        h('textarea', {
          key: 'area',
          ref: areaRef,
          className: 'dsa-note__area',
          rows: 1,
          value: text,
          placeholder: t('note.placeholder'),
          onChange: event => setText(event.target.value),
        }),
        isMessageEdit
          ? h('div', { key: 'foot', className: 'dsa-note__foot' }, [
            h('span', { key: 'spacer', className: 'dsa-note__spacer' }),
            h('button', { key: 'cancel', type: 'button', className: 'dsa-btn dsa-btn--ghost', onClick: onCancel }, t('note.cancel')),
            h('button', { key: 'send', type: 'button', className: 'dsa-btn dsa-btn--primary', onClick: save }, t('edit.send')),
          ])
          : isEdit
          ? h('div', { key: 'foot', className: 'dsa-note__foot' }, [
            h('button', {
              key: 'delete', type: 'button', className: 'dsa-icon dsa-icon--danger',
              title: t('note.delete'), 'aria-label': t('note.delete'), onClick: onDelete,
            }, h(Icon, { path: TRASH_PATH, size: 13 })),
            h('span', { key: 'spacer', className: 'dsa-note__spacer' }),
            h('button', { key: 'cancel', type: 'button', className: 'dsa-btn dsa-btn--ghost', onClick: onCancel }, t('note.cancel')),
            h('button', { key: 'save', type: 'button', className: 'dsa-btn dsa-btn--primary', onClick: save }, t('note.save')),
          ])
          : h('button', {
            key: 'send', type: 'button', className: 'dsa-note__send',
            disabled: text.trim() === '', title: t('note.send'), 'aria-label': t('note.send'),
            onClick: save,
          }, h(Icon, { path: CHECK_PATH, size: 14 })),
      ])
    }

    /** 覆盖在用户消息气泡上的内联编辑器：右下角 取消 / 发送。 */
    function InlineMessageEditor({ text, t, busy, error, onCancel, onSend }) {
      const [value, setValue] = useState(text)
      const areaRef = useRef(null)
      useEffect(() => {
        const area = areaRef.current
        if (area === null) return
        area.focus()
        area.setSelectionRange(area.value.length, area.value.length)
        autoGrow(area)
      }, [])
      const send = () => { if (!busy && value.trim() !== '') onSend(value) }
      return h('div', { className: 'dsa-inline-edit__body' }, [
        h('textarea', {
          key: 'area',
          ref: areaRef,
          className: 'dsa-inline-edit__area',
          'aria-label': t('edit.title'),
          disabled: busy,
          value,
          onChange: (event) => { setValue(event.target.value); autoGrow(event.target) },
          onKeyDown: (event) => {
            if (event.key === 'Escape' && !busy) { event.stopPropagation(); onCancel() }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) { event.preventDefault(); send() }
          },
        }),
        error ? h('p', { key: 'error', role: 'alert', className: 'dsa-inline-edit__error' }, error) : null,
        h('div', { key: 'foot', className: 'dsa-inline-edit__foot' }, [
          h('button', { key: 'cancel', type: 'button', className: 'dsa-btn dsa-btn--ghost', disabled: busy, onClick: onCancel }, t('note.cancel')),
          h('button', { key: 'send', type: 'button', className: 'dsa-btn dsa-btn--primary', disabled: busy || !value.trim(), onClick: send }, t(busy ? 'edit.sending' : 'edit.send')),
        ]),
      ])
    }

    function autoGrow(area) {
      if (!area || !area.style) return
      area.style.height = 'auto'
      area.style.height = `${Math.min(area.scrollHeight, 320)}px`
    }

    function AnnotationItem({ annotation, index, t, onEdit, onRemove }) {
      const indexLabel = String(index + 1)
      const where = annotationLocation(annotation, t)
      return h('div', { className: 'dsa-item' }, [
        h('span', { key: 'index', className: 'dsa-item__index' }, indexLabel),
        h('div', { key: 'body', style: { minWidth: 0 } }, [
          h('div', { key: 'quote', className: 'dsa-item__quote' }, annotation.quote),
          h('div', { key: 'meta', className: 'dsa-item__meta' }, [
            h('span', { key: 'where', className: 'dsa-item__where', title: where }, where),
            h('span', { key: 'sep', 'aria-hidden': true }, '·'),
            h('span', { key: 'when', className: 'dsa-item__when' }, relativeTime(annotation.createdAt, t)),
            h('div', { key: 'tools', className: 'dsa-item__tools' }, [
              h('button', {
                key: 'edit', type: 'button', className: 'dsa-icon', title: t('row.edit'), 'aria-label': t('row.edit'),
                onClick: onEdit,
              }, h(Icon, { path: PENCIL_PATH, size: 12 })),
              h('button', {
                key: 'remove', type: 'button', className: 'dsa-icon dsa-icon--danger', title: t('row.remove'),
                'aria-label': t('row.remove'), onClick: onRemove,
              }, h(Icon, { path: TRASH_PATH, size: 12 })),
            ]),
          ]),
          h('div', { key: 'comment' }, [
            h('span', { key: 'label', className: 'dsa-item__label' }, t('row.comment')),
            h('div', { key: 'text', className: 'dsa-item__comment' }, annotation.comment),
          ]),
        ]),
      ])
    }

    /** 相对时间：刚刚 / N 分钟前 / N 小时前 / M-D */
    function relativeTime(at, t) {
      if (typeof at !== 'number') return ''
      const diff = Math.max(0, Date.now() - at)
      if (diff < 60000) return t('time.now')
      if (diff < 3600000) return t('time.minutes', { count: Math.floor(diff / 60000) })
      if (diff < 86400000) return t('time.hours', { count: Math.floor(diff / 3600000) })
      return new Intl.DateTimeFormat(ctxRef?.locale?.getSnapshot?.().active || 'en', { month: 'short', day: 'numeric' }).format(at)
    }

    /** 文档预览 header 的隐形锚点：只记录当前文档路径，不渲染任何图标或计数。 */
    function DocumentContextAnchor(props) {
      const { absolutePath, sessionId } = props
      useEffect(() => {
        if (absolutePath) currentDoc = { path: absolutePath, sessionId }
      }, [absolutePath, sessionId])
      return null
    }

    // ── 词条 ────────────────────────────────────────────────────────────────
    const ZH = {
      "pill.add": "添加注释",
      "pill.addLabel": "添加注释",
      "pill.short": "添加注释",
      "dock.title": "待发送注释",
      "dock.countLabel": " 条注释",
      "dialog.hint": "⌘ / Ctrl + Enter",
      "note.title": "添加注释",
      "note.titleEdit": "编辑注释",
      "note.placeholder": "写下你对这段内容的意见…",
      "note.send": "保存注释",
      "note.delete": "删除注释",
      "note.cancel": "取消",
      "note.save": "保存",
      "marker.open": "编辑第 {index} 条注释",
      "dock.clear": "清空全部",
      "edit.message": "编辑消息",
      "edit.title": "编辑消息",
      "edit.send": "发送",
      "dock.count": "{count} 条注释",
      "dock.attach": "添加到输入框",
      "dock.hint": "{count} 条注释，随下一条消息发送",
      "dock.sentWithNext": "随下一条消息发送",
      "dock.notAttached": "输入消息后自动附加",
      "chip.label": "注释",
      "dialog.title": "添加注释",
      "dialog.placeholder": "这条引用需要我怎么处理？",
      "dialog.cancel": "取消",
      "dialog.save": "添加",
      "dialog.source.message": "来源：第 {turn} 轮回答",
      "dialog.source.document": "来源：{path} 第 {line} 行",
      "row.message": "第 {turn} 轮回答",
      "row.document": "{path} 第 {line} 行",
      "row.currentDocument": "当前文档",
      "row.comment": "注释",
      "row.edit": "编辑注释",
      "row.remove": "删除注释",
      "edit.save": "保存",
      "edit.cancel": "取消",
      "badge.message": "注释 {count}",
      "badge.title": "该处有 {count} 条注释",
      "panel.close": "关闭",
      "prompt.header": "〔注释〕以下是我对你输出的注释，请结合引用内容理解我的意图。",
      "prompt.answer": "你之前的回答",
      "prompt.document": "当前文档",
      "prompt.file": "文件",
      "error.sessionNotReady": "会话尚未就绪，稍后再试。",
      "error.composerNotReady": "输入框尚未就绪，稍后再试。",
      "error.insertFailed": "未能挂到输入框，请重试。",
      "dock.countLabelOne": " 条注释",
      "dock.countOne": "1 条注释",
      "dock.hintOne": "1 条注释，随下一条消息发送",
      "row.documentRange": "{path} 第 {line}–{endLine} 行",
      "edit.sending": "正在重新生成…",
      "prompt.target": "针对：{where}",
      "prompt.quote": "引用：",
      "prompt.comment": "注释：{comment}",
      "time.now": "刚刚",
      "time.minutes": "{count} 分钟前",
      "time.hours": "{count} 小时前",
      "history.error.notReady": "消息编辑尚未就绪，请稍后重试。",
      "history.error.invalid-target": "无法定位这条消息，请刷新后重试。",
      "history.error.stale-target": "这条消息已被编辑、回退或压缩，暂时无法重新编辑。",
      "history.error.request-conflict": "编辑内容已变化，请关闭编辑框后重试。",
      "history.error.stale-retry": "对话已继续，无法重试这次旧编辑。",
      "history.error.cancelled": "编辑已取消。",
      "history.error.busy": "正在停止当前回答，请稍后重试。",
      "history.error.unsupported": "暂不支持编辑子代理对话。",
      "history.error.durability": "未能保存编辑，请保留内容并重试。",
      "history.error.requestFailed": "操作未完成，请稍后重试。",
      "history.error.load": "无法读取历史输入，请稍后重试。",
      "history.error.history-edit-failed": "重新生成失败，请保留编辑内容后重试。"
}
    const EN = {
      "edit.message": "Edit message",
      "edit.title": "Edit message",
      "edit.send": "Send",
      "note.cancel": "Cancel",
      "pill.add": "Add annotation",
      "dock.count": "{count} annotations",
      "dock.attach": "Add to input",
      "dock.hint": "{count} annotations · sent with your next message",
      "dock.sentWithNext": "Sent with your next message",
      "dock.notAttached": "Added when you start typing",
      "chip.label": "annotations",
      "dialog.title": "Add annotation",
      "dialog.placeholder": "What should I do with this quote?",
      "dialog.cancel": "Cancel",
      "dialog.save": "Add",
      "dialog.source.message": "From answer in turn {turn}",
      "dialog.source.document": "From {path} line {line}",
      "row.message": "Answer in turn {turn}",
      "row.document": "{path}, line {line}",
      "row.currentDocument": "current document",
      "row.comment": "Annotation",
      "row.edit": "Edit annotation",
      "row.remove": "Delete annotation",
      "edit.save": "Save",
      "edit.cancel": "Cancel",
      "badge.message": "Annotations {count}",
      "badge.title": "{count} annotation(s) here",
      "panel.close": "Close",
      "prompt.header": "[Annotations] Here are my annotations on your output; use the quotes to understand what I mean.",
      "prompt.answer": "your earlier answer",
      "prompt.document": "the current document",
      "prompt.file": "file",
      "error.sessionNotReady": "Session is not ready yet.",
      "error.composerNotReady": "Composer is not ready yet.",
      "error.insertFailed": "Could not attach to the composer; try again.",
      "pill.addLabel": "Add annotation",
      "pill.short": "Add annotation",
      "dock.title": "Pending annotations",
      "dock.countLabel": " annotations",
      "dock.countLabelOne": " annotation",
      "dock.countOne": "1 annotation",
      "dock.hintOne": "1 annotation · sent with your next message",
      "dock.clear": "Clear all",
      "row.documentRange": "{path}, lines {line}–{endLine}",
      "note.title": "Add annotation",
      "note.titleEdit": "Edit annotation",
      "note.placeholder": "Add your feedback on this passage…",
      "note.send": "Save annotation",
      "note.delete": "Delete annotation",
      "note.save": "Save",
      "marker.open": "Edit annotation {index}",
      "edit.sending": "Regenerating…",
      "prompt.target": "Regarding: {where}",
      "prompt.quote": "Quote:",
      "prompt.comment": "Annotation: {comment}",
      "dialog.hint": "⌘ / Ctrl + Enter",
      "time.now": "Just now",
      "time.minutes": "{count} min ago",
      "time.hours": "{count} hr ago",
      "history.error.notReady": "Message editing is not ready yet. Try again shortly.",
      "history.error.invalid-target": "This message could not be found. Refresh and try again.",
      "history.error.stale-target": "This message has been edited, rewound or compacted and cannot be edited again.",
      "history.error.request-conflict": "The edit has changed. Close the editor and try again.",
      "history.error.stale-retry": "The conversation has moved on. This earlier edit can no longer be retried.",
      "history.error.cancelled": "Editing was cancelled.",
      "history.error.busy": "The current response is still stopping. Try again shortly.",
      "history.error.unsupported": "Editing subagent conversations is not supported yet.",
      "history.error.durability": "The edit could not be saved. Keep your text and try again.",
      "history.error.requestFailed": "The action could not be completed. Try again shortly.",
      "history.error.load": "Earlier inputs could not be loaded. Try again shortly.",
      "history.error.history-edit-failed": "Regeneration failed. Keep your edited text and try again."
}

    // ── 装配 ────────────────────────────────────────────────────────────────
    return {
      inject: ['slots', 'locale', 'sessions', 'conversation', 'inputTriggers', 'remote'],
      apply(ctx) {
        ctxRef = ctx
        restore()
        ctx.effect(() => installAnnotationSubmission(ctx.conversation), 'annotation prompt appendix')
        if (typeof require.async === 'function') {
          ctx.effect(() => {
            let disposed = false
            const installed = require.async('./client.history.js').then(module => module.installHistory(ctx, {
              repaint: scheduleRepaint, sessionId: () => currentSession, isEditing: () => Boolean(ui.edit),
              t: (key, params) => uiT(key, params),
            })).then(async module => {
              if (disposed) await module.dispose()
              else { historyClient = module; scheduleRepaint() }
              return module
            }).catch(error => { console.error('[annotation] history module failed:', error.message) })
            return async () => { disposed = true; historyClient = null; await (await installed)?.dispose() }
          }, 'annotation native history')
        }

        ctx.effect(() => {
          const disposeZh = ctx.locale.register(NS, 'zh', ZH)
          const disposeEn = ctx.locale.register(NS, 'en', EN)
          return () => { disposeZh(); disposeEn() }
        }, 'annotation locale')

        ctx.effect(() => ctx.inputTriggers.registerSource({
          trigger: '@',
          name: SOURCE,
          order: 999,
          showGroupTitle: false,
          candidates: async () => [],
          onPick: () => undefined,
          codec: {
            clipboardText: () => '',
            // 旧草稿中的注释引用只负责移除旧字符；附录由发送入口统一追加。
            serialize: async () => '',
          },
        }), 'annotation reference source')

        ctx.effect(() => {
          const onGesture = (event) => {
            const target = event.target
            if (target && target.closest && target.closest('[data-dsh-annotation-ui]')) return
            window.setTimeout(captureSelection, 0)
          }
          document.addEventListener('mouseup', onGesture)
          document.addEventListener('keyup', onGesture)
          window.addEventListener('scroll', scheduleMarkerPaint, { capture: true, passive: true })
          const onResize = () => { scheduleRepaint(); scheduleMarkerPaint() }
          window.addEventListener('resize', onResize)
          scheduleRepaint()
          const observer = new MutationObserver(() => scheduleRepaint())
          observer.observe(document.body, { childList: true, subtree: true })
          const style = document.createElement('style')
          style.setAttribute('data-dsh-annotation', '')
          style.textContent = [
            `::highlight(${HIGHLIGHT_NAME}){background-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b6ef2) 24%, transparent);}`,
            `::highlight(${PENDING_HIGHLIGHT}){background-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b6ef2) 26%, transparent);}`,
            '[data-composer-chip="annotation"]{display:inline-block!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;opacity:0!important;font-size:0!important;line-height:0!important;pointer-events:none!important}',
            CSS_TEXT,
          ].join('\n')
          document.head.appendChild(style)
          return () => {
            document.removeEventListener('mouseup', onGesture)
            document.removeEventListener('keyup', onGesture)
            window.removeEventListener('scroll', scheduleMarkerPaint, true)
            window.removeEventListener('resize', onResize)
            observer.disconnect()
            closeMessageEditor()
            for (const target of editTargets.values()) target.host.remove()
            editTargets.clear()
            style.remove()
            if (repaintTimer) window.cancelAnimationFrame(repaintTimer)
            repaintTimer = 0
            if (markerFrame) window.cancelAnimationFrame(markerFrame)
            markerFrame = 0
            markerElements.clear()
            noteElement = null
          }
        }, 'annotation selection listeners')

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left', id: 'annotation', order: -10, locale: NS,
        }, AnnotationDock))

        ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
          name: 'sidebar.right.tab.document.actions', id: 'annotation', order: 40, locale: NS,
        }, DocumentContextAnchor))

        // 调试探针：自动化验收使用。
        window.__dshAnnotation = {
          items: () => [...items.values()],
          lastGesture: () => lastGesture,
          trace: () => gestureTrace.slice(),
          diagnose() {
            const selection = window.getSelection()
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
              return { ok: false, reason: 'no-selection' }
            }
            const range = selection.getRangeAt(0)
            const anchor = elementOf(range.commonAncestorContainer)
            const chatEl = anchor && anchor.closest('[data-chat-node-key]')
            const docRoot = anchor && anchor.closest(DOC_ROOTS)
            const pane = anchor && anchor.closest(PANE_ROOTS)
            return {
              ok: Boolean(chatEl || docRoot || pane),
              reason: chatEl ? 'chat' : docRoot ? 'preview' : pane ? 'pane' : 'not-document',
              text: selection.toString().slice(0, 60),
              anchorClass: anchor ? String(anchor.className || anchor.tagName) : null,
              paneClass: pane ? String(pane.className) : null,
              path: pane ? pathFromPane(pane) : (docRoot && currentDoc ? currentDoc.path : undefined),
              currentSession,
              composerOpen: Boolean(ui.composer),
              selectionPill: Boolean(ui.selection),
            }
          },
          ui: () => ({ selection: ui.selection && { surface: ui.selection.surface, path: ui.selection.path }, composer: ui.composer && { mode: ui.composer.mode, quote: ui.composer.quote.slice(0, 20) } }),
          probe: sessionId => serializeSession(sessionId),
        }

        console.log('[annotation] active v13 annotations without draft characters')
      },
    }
  },
})
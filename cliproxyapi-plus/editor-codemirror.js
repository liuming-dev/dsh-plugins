import { basicSetup, EditorView } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { tags } from '@lezer/highlight'

const yamlHighlight = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' },
  { tag: tags.propertyName, color: 'var(--dsw-alias-brand-primary)' },
  { tag: tags.string, color: 'var(--dsw-alias-state-success-primary)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--dsw-alias-state-warn-primary)' },
  { tag: [tags.keyword, tags.operator, tags.punctuation], color: 'var(--dsw-alias-label-secondary)' },
])

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': { padding: '15px 17px', caretColor: 'var(--dsw-alias-label-primary)' },
  '.cm-gutters': {
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-secondary)',
    border: 'none',
    borderRight: '1px solid var(--dsw-alias-border-l1)',
  },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '36px', padding: '0 11px 0 0', textAlign: 'right' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--dsw-alias-bg-layer-2)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dsw-alias-label-primary)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, transparent) !important',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)' },
  '.cm-textfield': { backgroundColor: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)' },
  '.cm-tooltip': { backgroundColor: 'var(--dsw-alias-bg-overlay)', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)' },
})

/** A real CodeMirror editor owns text measurement, selection, caret, and highlighting. */
export function createYamlEditor({ parent, value = '', onChange = () => {}, onSave = () => {}, ariaLabel = 'YAML editor' }) {
  const handlers = { onChange, onSave }
  let applyingExternalValue = false
  const view = new EditorView({
    parent,
    doc: value,
    extensions: [
      basicSetup,
      yaml(),
      editorTheme,
      syntaxHighlighting(yamlHighlight),
      Prec.high(keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => { handlers.onSave(); return true },
        },
        {
          key: 'Tab',
          run: view => { view.dispatch(view.state.replaceSelection('  ')); return true },
        },
      ])),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !applyingExternalValue) handlers.onChange(update.state.doc.toString())
      }),
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false' }),
    ],
  })
  return {
    view,
    setValue(next) {
      const current = view.state.doc.toString()
      if (next === current) return
      applyingExternalValue = true
      try { view.dispatch({ changes: { from: 0, to: current.length, insert: next } }) }
      finally { applyingExternalValue = false }
    },
    setHandlers(next) { Object.assign(handlers, next) },
    focus() { view.focus() },
    destroy() { view.destroy() },
  }
}

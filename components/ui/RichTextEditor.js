"use client"

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Highlight from '@tiptap/extension-highlight'

// ─── Toolbar button helper ──────────────────────────────────────────────────
function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`rte-btn${active ? ' rte-btn--active' : ''}${disabled ? ' rte-btn--disabled' : ''}`}
    >
      {children}
    </button>
  )
}

function ToolbarSeparator() {
  return <span className="rte-sep" />
}

// ─── Main Toolbar ───────────────────────────────────────────────────────────
function Toolbar({ editor }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  if (!editor) return null

  const openLinkPanel = () => {
    setLinkUrl(editor.getAttributes('link').href || '')
    setLinkOpen(true)
  }
  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run()
    }
    setLinkOpen(false)
    setLinkUrl("")
  }
  const cancelLink = () => {
    setLinkOpen(false)
    setLinkUrl("")
    editor.chain().focus().run()
  }

  return (
    <div className="rte-toolbar">
      {/* Text style */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><strong>B</strong></ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><em>I</em></ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Superscript">x²</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Subscript">x₂</ToolbarButton>

      <ToolbarSeparator />

      {/* Heading */}
      <select
        className="rte-select"
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1'
          : editor.isActive('heading', { level: 2 }) ? 'h2'
          : editor.isActive('heading', { level: 3 }) ? 'h3'
          : editor.isActive('heading', { level: 4 }) ? 'h4'
          : editor.isActive('heading', { level: 5 }) ? 'h5'
          : editor.isActive('heading', { level: 6 }) ? 'h6'
          : editor.isActive('blockquote') ? 'blockquote'
          : 'p'
        }
        onChange={(e) => {
          const v = e.target.value
          if (v === 'p') editor.chain().focus().setParagraph().run()
          else if (v === 'blockquote') editor.chain().focus().setBlockquote().run()
          else editor.chain().focus().toggleHeading({ level: parseInt(v[1]) }).run()
        }}
      >
        <option value="p">Normal</option>
        <option value="h1">H1</option>
        <option value="h2">H2</option>
        <option value="h3">H3</option>
        <option value="h4">H4</option>
        <option value="h5">H5</option>
        <option value="h6">H6</option>
        <option value="blockquote">Quote</option>
      </select>

      <ToolbarSeparator />

      {/* Alignment */}
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">⬅</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">☰</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">➡</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">≡</ToolbarButton>

      <ToolbarSeparator />

      {/* Lists */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">• List</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">1. List</ToolbarButton>

      <ToolbarSeparator />

      {/* Color picker */}
      <span className="rte-color-wrap" title="Text Color">
        <span className="rte-color-icon">A</span>
        <input
          type="color"
          className="rte-color-input"
          defaultValue="#000000"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          title="Pick text color"
        />
      </span>

      <ToolbarSeparator />

      {/* Link */}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <ToolbarButton onClick={openLinkPanel} active={editor.isActive('link')} title="Insert Link">🔗</ToolbarButton>
        {editor.isActive('link') && (
          <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} title="Remove Link">✂</ToolbarButton>
        )}
        {linkOpen && (
          <div className="rte-link-panel">
            <label className="rte-link-label">URL</label>
            <input
              type="url"
              className="rte-link-input"
              placeholder="https://example.com"
              value={linkUrl}
              autoFocus
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                if (e.key === 'Escape') { e.preventDefault(); cancelLink() }
              }}
            />
            <div className="rte-link-actions">
              <button type="button" className="rte-link-btn rte-link-apply" onClick={applyLink}>Apply</button>
              <button type="button" className="rte-link-btn rte-link-cancel" onClick={cancelLink}>Cancel</button>
            </div>
          </div>
        )}
      </span>

      <ToolbarSeparator />

      {/* History */}
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">↩</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">↪</ToolbarButton>
    </div>
  )
}

// ─── CSS injected once ──────────────────────────────────────────────────────
const CSS = `
  .rte-wrapper { font-family: inherit; }
  .rte-container { border: 1px solid #dee2e6; border-radius: 0.375rem; overflow: hidden; }
  .rte-container:focus-within { border-color: #86b7fe; box-shadow: 0 0 0 0.25rem rgba(13,110,253,.25); }
  .rte-container.rte-error { border-color: #dc3545; }
  .rte-toolbar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
    padding: 6px 8px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;
  }
  .rte-btn {
    min-width: 28px; height: 28px; padding: 0 5px; border: 1px solid transparent;
    border-radius: 3px; background: transparent; cursor: pointer; font-size: 12px;
    display: inline-flex; align-items: center; justify-content: center; transition: all .15s ease;
  }
  .rte-btn:hover { background: #e9ecef; border-color: #dee2e6; }
  .rte-btn--active { background: #0d6efd !important; color: #fff !important; border-color: #0d6efd !important; }
  .rte-btn--disabled { opacity: .4; cursor: default; }
  .rte-sep { width: 1px; height: 20px; background: #dee2e6; margin: 0 2px; }
  .rte-select {
    height: 28px; padding: 0 4px; font-size: 12px; border: 1px solid #dee2e6;
    border-radius: 3px; background: #fff; cursor: pointer;
  }
  .rte-color-wrap { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
  .rte-color-icon {
    min-width: 28px; height: 28px; padding: 0 5px; border: 1px solid #dee2e6; border-radius: 3px;
    background: transparent; font-size: 12px; font-weight: bold; display: inline-flex;
    align-items: center; justify-content: center;
  }
  .rte-color-input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  .rte-editor .ProseMirror {
    padding: 10px 12px; line-height: 1.6; font-size: 11px; outline: none; min-height: inherit;
  }
  .rte-editor .ProseMirror p { margin-bottom: 0.5em; }
  .rte-editor .ProseMirror h1 { font-size: 24px; margin-bottom: 0.5em; }
  .rte-editor .ProseMirror h2 { font-size: 20px; margin-bottom: 0.5em; }
  .rte-editor .ProseMirror h3 { font-size: 16px; margin-bottom: 0.5em; }
  .rte-editor .ProseMirror h4 { font-size: 14px; margin-bottom: 0.5em; }
  .rte-editor .ProseMirror h5 { font-size: 12px; margin-bottom: 0.5em; }
  .rte-editor .ProseMirror h6 { font-size: 10px; margin-bottom: 0.5em; }
  .rte-editor .ProseMirror blockquote {
    border-left: 3px solid #0d6efd; padding-left: 10px; margin-left: 0; font-style: italic; color: #6c757d;
  }
  .rte-editor .ProseMirror ul { padding-left: 1.5em; list-style: disc; }
  .rte-editor .ProseMirror ol { padding-left: 1.5em; list-style: decimal; }
  .rte-editor .ProseMirror a { color: #0d6efd; text-decoration: underline; cursor: pointer; }
  .rte-editor .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder); color: #adb5bd; pointer-events: none; float: left; height: 0;
  }
  .rte-link-panel {
    position: absolute; top: 100%; left: 0; z-index: 120; min-width: 280px;
    background: #fff; border: 1px solid #cbd5e1; border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0,0,0,.15); padding: 0.65rem;
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .rte-link-label { font-size: 0.78rem; font-weight: 600; color: #334155; }
  .rte-link-input {
    width: 100%; padding: 0.4rem 0.55rem; font-size: 0.85rem;
    border: 1px solid #cbd5e1; border-radius: 5px; outline: none;
  }
  .rte-link-input:focus { border-color: #0d6efd; box-shadow: 0 0 0 2px rgba(13,110,253,.15); }
  .rte-link-actions { display: flex; gap: 0.35rem; }
  .rte-link-btn {
    padding: 0.28rem 0.7rem; font-size: 0.78rem; font-weight: 600;
    border-radius: 5px; border: 1px solid transparent; cursor: pointer;
  }
  .rte-link-apply { background: #0d6efd; color: #fff; }
  .rte-link-apply:hover { background: #0b5ed7; }
  .rte-link-cancel { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
  .rte-link-cancel:hover { background: #e2e8f0; }
`

let cssInjected = false
function injectCSS() {
  if (typeof document === 'undefined' || cssInjected) return
  cssInjected = true
  const el = document.createElement('style')
  el.setAttribute('data-rte', 'tiptap')
  el.textContent = CSS
  document.head.appendChild(el)
}

// ─── RichTextEditor ─────────────────────────────────────────────────────────
/**
 * RichTextEditor — drop-in replacement for react-draft-wysiwyg, powered by Tiptap.
 *
 * Props (unchanged from old API):
 * @param {string}   value            HTML content value
 * @param {Function} onChange         Called with HTML string on every change
 * @param {string}   placeholder      Placeholder text
 * @param {number}   minHeight        Min height in px (default 80)
 * @param {string}   className        Extra CSS classes on wrapper
 * @param {boolean}  disabled         Read-only mode
 * @param {string}   label            Optional label above editor
 * @param {boolean}  required         Show asterisk next to label
 * @param {string}   error            Error message shown below editor
 * @param {string}   defaultAlignment Initial text alignment (left|center|right|justify)
 */
export default function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Enter text...",
  minHeight = 80,
  className = "",
  disabled = false,
  label,
  required = false,
  error,
  defaultAlignment = "left",
}) {
  injectCSS()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      Subscript,
      Superscript,
      Highlight,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment }),
    ],
    content: value || '',
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      if (!onChange) return
      const html = editor.isEmpty ? '' : editor.getHTML()
      onChange(html)
    },
  })

  // Sync external value changes (e.g., form reset)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const current = editor.isEmpty ? '' : editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  // Sync disabled/editable state
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  return (
    <div className={`rte-wrapper ${className}`}>
      {label && (
        <label className="form-label">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}

      <div className={`rte-container${error ? ' rte-error' : ''}`} style={disabled ? { opacity: 0.6 } : {}}>
        {!disabled && <Toolbar editor={editor} />}
        <div className="rte-editor">
          <EditorContent editor={editor} />
        </div>
      </div>

      {error && <div className="invalid-feedback d-block">{error}</div>}
    </div>
  )
}

// ─── RichTextUtils — pure string helpers, kept identical to old API ──────────
export const RichTextUtils = {
  htmlToPlainText: (html) => {
    if (!html) return ""
    return html.replace(/<[^>]*>/g, '').trim()
  },

  getWordCount: (html) => {
    const text = RichTextUtils.htmlToPlainText(html)
    return text ? text.split(/\s+/).filter(Boolean).length : 0
  },

  isEmpty: (html) => {
    if (!html) return true
    return !RichTextUtils.htmlToPlainText(html)
  },

  truncateHtml: (html, maxLength = 100) => {
    const text = RichTextUtils.htmlToPlainText(html)
    if (text.length <= maxLength) return text
    return `${text.substring(0, maxLength).trim()}…`
  },

  validateRequired: (html, fieldName = "Field") => {
    if (RichTextUtils.isEmpty(html)) return `${fieldName} is required`
    return null
  },

  validateMinWords: (html, minWords, fieldName = "Field") => {
    const count = RichTextUtils.getWordCount(html)
    if (count < minWords) return `${fieldName} must contain at least ${minWords} words`
    return null
  },
}

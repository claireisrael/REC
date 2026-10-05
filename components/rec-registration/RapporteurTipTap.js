"use client"

import { useEffect, useMemo } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Paragraph from "@tiptap/extension-paragraph"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { purposeFromDocument } from "@/lib/rec-conference/rapporteur-rules.mjs"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faAlignCenter,
  faAlignLeft,
  faAlignRight,
  faArrowRotateLeft,
  faArrowRotateRight,
  faBold,
  faItalic,
  faListOl,
  faListUl,
  faTable,
  faUnderline,
} from "@fortawesome/free-solid-svg-icons"

const TemplateParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      field: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-field"),
        renderHTML: (attributes) => (attributes.field ? { "data-field": attributes.field } : {}),
      },
      note: {
        default: null,
        parseHTML: (element) => (element.classList.contains("note") ? "note" : null),
        renderHTML: (attributes) => (attributes.note ? { class: "note" } : {}),
      },
    }
  },
})

function ToolButton({ title, active, disabled, onClick, icon }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={active ? "is-active" : ""}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null
  return (
    <div className="rec-tiptap-toolbar" role="toolbar" aria-label="Report editing">
      <ToolButton title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} icon={faArrowRotateLeft} />
      <ToolButton title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} icon={faArrowRotateRight} />
      <ToolButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} icon={faBold} />
      <ToolButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} icon={faItalic} />
      <ToolButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} icon={faUnderline} />
      <ToolButton title="Bullets" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={faListUl} />
      <ToolButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={faListOl} />
      <ToolButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} icon={faAlignLeft} />
      <ToolButton title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} icon={faAlignCenter} />
      <ToolButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} icon={faAlignRight} />
      <ToolButton
        title="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        icon={faTable}
      />
    </div>
  )
}

export default function RapporteurTipTap({ html, editable, onChange }) {
  const extensions = useMemo(() => [
    StarterKit.configure({
      paragraph: false,
      link: false,
      underline: false,
      undoRedo: { depth: 200, newGroupDelay: 300 },
    }),
    TemplateParagraph,
    Underline,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ], [])

  const editor = useEditor({
    extensions,
    content: html,
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: "rec-tiptap-prose" },
    },
    onUpdate: ({ editor: current }) => {
      const next = current.getHTML()
      onChange(next, purposeFromDocument(next))
    },
  })

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(editable)
  }, [editor, editable])

  return (
    <div className="rec-doc-canvas">
      {editable ? <Toolbar editor={editor} /> : null}
      <div className="rec-doc-sheet">
        <img className="rec-doc-mark" src="/reporting/nrep-mark.png" alt="NREP" width="123" height="124" />
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

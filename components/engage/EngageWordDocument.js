"use client"

import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef, Component } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import Link from "@tiptap/extension-link"
import Underline from "@tiptap/extension-underline"
import Subscript from "@tiptap/extension-subscript"
import Superscript from "@tiptap/extension-superscript"
import Highlight from "@tiptap/extension-highlight"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faAlignCenter,
  faAlignJustify,
  faAlignLeft,
  faAlignRight,
  faArrowRotateLeft,
  faArrowRotateRight,
  faEraser,
  faFileImage,
  faGripLines,
  faIndent,
  faLink,
  faListOl,
  faListUl,
  faMinus,
  faOutdent,
  faPlus,
  faTable,
  faTableCells,
  faUnlink,
} from "@fortawesome/free-solid-svg-icons"
import { getNrepLogoUrl } from "@/lib/branding"
import {
  ENGAGE_DOC_COLORS,
  ENGAGE_DOC_FONTS,
  ENGAGE_DOC_FONT_SIZES,
  ENGAGE_DEFAULT_FONT_SIZE_PT,
  ENGAGE_DOC_GRADIENTS,
  ENGAGE_DOC_HIGHLIGHTS,
  FontFamily,
  FontSize,
  BlockTextStyle,
  IMAGE_SIZE_PRESETS,
  ImageFigure,
  PARA_BORDER_PRESETS,
  ParagraphBorders,
  PageBreak,
  SafeColor,
  TABLE_BORDER_PRESETS,
  TableCellFormat,
  EngageUndoRedoKeys,
  TextGradient,
  applyEngageTextAppearance,
  collectImageFilesFromDataTransfer,
  createEngageTableCell,
  fontSizeToPt,
  formatEngageFontSizePt,
  insertEngageImagesFromFiles,
  uploadEngageImageForEditor,
  getCaptionFormatTarget,
  presetWidthPx,
  resolveEngageFontId,
  resolveEngageFontSizePt,
  resolveEngageFontValue,
  restoreOrExpandTextSelection,
  sanitizeEngageDocumentHtml,
} from "@/components/engage/engage-word-editor-kit"
import { buildSectionTableHtml, isTableSection } from "@/lib/engage/report-tables"
import {
  A4_HEIGHT_MM,
  A4_LANDSCAPE_WIDTH_MM,
  A4_WIDTH_MM,
  CSS_PX_PER_MM,
  isBccecLetterheadProfile,
  letterheadLogoStyle,
  letterheadLogosForProfile,
  stripPartnerLetterheadFromHtml,
} from "@/lib/engage/letterhead.mjs"
import { EngageRemoteCarets } from "@/components/engage/EngageRemoteCarets"
import { EngageSignatureProof } from "@/components/engage/EngageSignatureProof"

/** Strip "Label:" prefix from document-head paragraph text. */
function plainValueAfterLabel(el) {
  let text = String(el?.textContent || "").trim()
  const strong = el?.querySelector?.("strong")
  if (strong) {
    const label = String(strong.textContent || "").replace(/:\s*$/, "").trim()
    if (label) {
      const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i")
      text = text.replace(re, "").trim()
    }
  }
  return text
}

function ToolbarButton({ onClick, active, disabled, title, children, variant = "default" }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick?.()
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`engage-word-tool-btn${variant === "icon" ? " engage-word-tool-btn--icon" : ""}${variant === "ribbon" ? " engage-word-tool-btn--ribbon" : ""}${active ? " is-active" : ""}`}
    >
      {children}
    </button>
  )
}

function ToolIcon({ icon }) {
  return <FontAwesomeIcon icon={icon} className="engage-word-tool-icon" />
}

function RibbonLabel({ icon, label }) {
  return (
    <>
      <ToolIcon icon={icon} />
      <span className="engage-word-tool-ribbon-label">{label}</span>
    </>
  )
}

function ToolbarSep() {
  return <span className="engage-word-toolbar-sep" />
}

function transformEngageTextCase(text, mode) {
  const value = String(text || "")
  switch (mode) {
    case "upper":
      return value.toLocaleUpperCase()
    case "lower":
      return value.toLocaleLowerCase()
    case "title":
      return value.replace(/\S+/g, (word) => {
        const first = word.charAt(0).toLocaleUpperCase()
        const rest = word.slice(1).toLocaleLowerCase()
        return `${first}${rest}`
      })
    case "toggle":
      return value.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]/g, (ch) =>
        ch === ch.toLocaleUpperCase() ? ch.toLocaleLowerCase() : ch.toLocaleUpperCase()
      )
    case "sentence":
      return value.toLocaleLowerCase().replace(/(^\s*[a-zà-öø-ÿ]|[.!?]\s+[a-zà-öø-ÿ])/g, (match) =>
        match.toLocaleUpperCase()
      )
    default:
      return value
  }
}

function applyEngageTextCase(editor, mode) {
  if (!editor) return false
  const { from, to, empty } = editor.state.selection
  if (empty || from === to) return false
  const selected = editor.state.doc.textBetween(from, to, "\n")
  if (!selected) return false
  const next = transformEngageTextCase(selected, mode)
  if (next === selected) {
    editor.chain().focus().run()
    return true
  }
  return editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      if (dispatch) tr.insertText(next, from, to)
      return true
    })
    .run()
}

const CHANGE_CASE_OPTIONS = [
  { id: "sentence", label: "Sentence case.", sample: "Sentence case." },
  { id: "lower", label: "lowercase", sample: "lowercase" },
  { id: "upper", label: "UPPERCASE", sample: "UPPERCASE" },
  { id: "title", label: "Capitalize Each Word", sample: "Capitalize Each Word" },
  { id: "toggle", label: "tOGGLE cASE", sample: "tOGGLE cASE" },
]

function CaseMenu({ open, onClose, onPick }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.()
    }
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="engage-word-color-menu engage-word-case-menu" ref={panelRef} role="dialog" aria-label="Change case">
      <p className="engage-word-color-menu-title">Change case</p>
      <p className="engage-word-case-hint">Select text first, then choose a case.</p>
      {CHANGE_CASE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="engage-word-case-option"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onPick?.(option.id)
            onClose?.()
          }}
        >
          {option.sample}
        </button>
      ))}
    </div>
  )
}

const RIBBON_TABS = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "table", label: "Table" },
]

const TABLE_INSERT_SIZES = [
  { label: "2×2", rows: 2, cols: 2 },
  { label: "3×3", rows: 3, cols: 3 },
  { label: "4×4", rows: 4, cols: 4 },
  { label: "5×5", rows: 5, cols: 5 },
  { label: "6×8", rows: 6, cols: 8 },
  { label: "8×10", rows: 8, cols: 10 },
]

const CELL_BORDER_WIDTHS = [
  { label: "½ pt", value: "0.5pt" },
  { label: "1 pt", value: "1pt" },
  { label: "1½ pt", value: "1.5pt" },
  { label: "2¼ pt", value: "2.25pt" },
  { label: "3 pt", value: "3pt" },
  { label: "4½ pt", value: "4.5pt" },
  { label: "6 pt", value: "6pt" },
]

function ColorMenu({
  open,
  onClose,
  title,
  colors = [],
  gradients = [],
  onPickColor,
  onPickGradient,
  onClear,
  clearLabel = "Automatic",
  allowCustom = false,
  customDefault = "#2E9ECC",
}) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.()
    }
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="engage-word-color-menu" ref={panelRef} role="dialog" aria-label={title}>
      <p className="engage-word-color-menu-title">{title}</p>
      {colors.length ? (
        <>
          <p className="engage-word-color-menu-section">Theme colors</p>
          <div className="engage-word-color-grid">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                className="engage-word-swatch"
                style={{
                  background: c.swatch || c.value,
                  borderColor: c.value === "#ffffff" || c.value === "#fff59d" ? "#cbd5e1" : "transparent",
                }}
                title={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickColor?.(c.value)
                  onClose?.()
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      {gradients.length ? (
        <>
          <p className="engage-word-color-menu-section">Gradients</p>
          <div className="engage-word-color-grid engage-word-color-grid-wide">
            {gradients.map((g) => (
              <button
                key={g.label}
                type="button"
                className="engage-word-swatch engage-word-swatch-gradient"
                style={{ background: g.value }}
                title={g.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickGradient?.(g.value)
                  onClose?.()
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      {allowCustom ? (
        <label className="engage-word-color-menu-custom">
          <span>More colors</span>
          <input
            type="color"
            defaultValue={customDefault}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => {
              onPickColor?.(e.target.value)
              onClose?.()
            }}
          />
        </label>
      ) : null}
      {onClear ? (
        <button
          type="button"
          className="engage-word-color-menu-clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onClear()
            onClose?.()
          }}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}

function WordToolbar({ editor }) {
  const fileRef = useRef(null)
  const captionFormatRef = useRef(null)
  const lastTextSelectionRef = useRef(null)
  const [ribbonTab, setRibbonTab] = useState("home")
  const [colorMenu, setColorMenu] = useState(null)
  const [imagePanelOpen, setImagePanelOpen] = useState(false)
  const [pendingSrc, setPendingSrc] = useState("")
  const [pendingName, setPendingName] = useState("")
  const [pendingSize, setPendingSize] = useState("lg")
  const [pendingCaption, setPendingCaption] = useState("")
  const [imageError, setImageError] = useState("")
  const [linkPanelOpen, setLinkPanelOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [, setToolbarTick] = useState(0)

  // Keep font size / style controls in sync with caret — same as Word.
  // Caption inputs sit outside TipTap marks, so remember the last caption
  // target while the author uses the Font ribbon (mousedown blurs the input).
  useEffect(() => {
    if (!editor) return undefined
    const refresh = () => setToolbarTick((n) => n + 1)
    const rememberTextSelection = () => {
      try {
        const { from, to, empty } = editor.state.selection
        if (!empty && to > from) lastTextSelectionRef.current = { from, to }
      } catch {
        /* ignore */
      }
      refresh()
    }
    const onFocusIn = (event) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.matches?.("[data-engage-caption-input]") ||
          target.classList?.contains("engage-word-figcaption-input"))
      ) {
        captionFormatRef.current = getCaptionFormatTarget(editor)
      } else if (target instanceof Element && target.closest?.(".engage-word-toolbar-wrap")) {
        // Keep last caption target while using Home font/size controls.
      } else if (
        target instanceof Element &&
        (target.closest?.(".ProseMirror") || target.isContentEditable)
      ) {
        captionFormatRef.current = null
      }
      refresh()
    }
    const onFocusOut = () => refresh()
    editor.on("selectionUpdate", rememberTextSelection)
    editor.on("transaction", refresh)
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    return () => {
      editor.off("selectionUpdate", rememberTextSelection)
      editor.off("transaction", refresh)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
    }
  }, [editor])

  if (!editor) return null

  const liveCaptionTarget = getCaptionFormatTarget(editor)
  const captionTarget = liveCaptionTarget
    ? {
        ...liveCaptionTarget,
        input: liveCaptionTarget.input || captionFormatRef.current?.input || null,
      }
    : captionFormatRef.current
  const captionAttrs = captionTarget?.node?.attrs || null

  const rememberSelectionForToolbar = () => {
    try {
      const { from, to, empty } = editor.state.selection
      if (!empty && to > from) lastTextSelectionRef.current = { from, to }
    } catch {
      /* ignore */
    }
  }

  const applyBodyFontFamily = (fontValue) =>
    applyEngageTextAppearance(
      editor,
      { fontFamily: fontValue || null },
      lastTextSelectionRef.current
    )

  const applyBodyFontSize = (sizeValue) =>
    applyEngageTextAppearance(
      editor,
      { fontSize: sizeValue || null },
      lastTextSelectionRef.current
    )

  const applyBodyColor = (colorValue) =>
    applyEngageTextAppearance(
      editor,
      { color: colorValue, clearGradient: true },
      lastTextSelectionRef.current
    )

  const clearBodyColor = () =>
    applyEngageTextAppearance(
      editor,
      { clearColor: true, clearGradient: true },
      lastTextSelectionRef.current
    )

  const applyCaptionFontFamily = (fontValue) => {
    if (!captionTarget) return false
    const next = String(fontValue || "").trim() || null
    const input = captionTarget.input
    editor
      .chain()
      .setNodeSelection(captionTarget.pos)
      .updateImageFigure({ captionFontFamily: next })
      .run()
    captionFormatRef.current = {
      ...captionTarget,
      node: editor.state.doc.nodeAt(captionTarget.pos) || captionTarget.node,
    }
    if (input) {
      requestAnimationFrame(() => {
        try {
          input.focus({ preventScroll: true })
        } catch {
          input.focus()
        }
      })
    }
    return true
  }

  const applyCaptionFontSize = (sizeValue) => {
    if (!captionTarget) return false
    const next = String(sizeValue || "").trim() || null
    const input = captionTarget.input
    editor
      .chain()
      .setNodeSelection(captionTarget.pos)
      .updateImageFigure({ captionFontSize: next })
      .run()
    captionFormatRef.current = {
      ...captionTarget,
      node: editor.state.doc.nodeAt(captionTarget.pos) || captionTarget.node,
    }
    if (input) {
      requestAnimationFrame(() => {
        try {
          input.focus({ preventScroll: true })
        } catch {
          input.focus()
        }
      })
    }
    return true
  }

  const blockColor =
    editor.getAttributes("heading")?.blockColor ||
    editor.getAttributes("paragraph")?.blockColor ||
    ""
  const currentColor =
    editor.getAttributes("textStyle").color || blockColor || "#2E9ECC"
  const currentHighlight = editor.getAttributes("highlight").color || "#fff59d"

  const openLinkPanel = () => {
    const previous = editor.getAttributes("link").href || ""
    setLinkUrl(previous)
    setLinkPanelOpen(true)
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run()
    }
    setLinkPanelOpen(false)
    setLinkUrl("")
  }

  const cancelLink = () => {
    setLinkPanelOpen(false)
    setLinkUrl("")
    editor.chain().focus().run()
  }

  const onPickImage = async (file) => {
    if (!file) return
    setImageError("")
    try {
      const uploaded = await uploadEngageImageForEditor(file)
      setPendingSrc(uploaded.src)
      setPendingName(uploaded.alt || file.name || "Report image")
      setPendingCaption("")
      setPendingSize("md")
      setImagePanelOpen(true)
      if (uploaded.warning) setImageError(uploaded.warning)
    } catch (err) {
      setImageError(err?.message || "Could not add that image. Try a smaller JPG.")
      setImagePanelOpen(true)
    }
  }

  const insertPendingImage = () => {
    if (!pendingSrc) {
      setImageError("Choose an image first.")
      return
    }
    editor
      .chain()
      .focus()
      .setImageFigure({
        src: pendingSrc,
        alt: pendingName || "Report image",
        caption: pendingCaption.trim(),
        size: IMAGE_SIZE_PRESETS[pendingSize] && pendingSize !== "sm" && pendingSize !== "xs" ? pendingSize : "lg",
        width: presetWidthPx(
          IMAGE_SIZE_PRESETS[pendingSize] && pendingSize !== "sm" && pendingSize !== "xs" ? pendingSize : "lg"
        ),
      })
      .run()
    setPendingSrc("")
    setPendingName("")
    setPendingCaption("")
    setPendingSize("md")
    setImageError("")
    setImagePanelOpen(false)
  }

  const currentSizePt = captionAttrs
    ? fontSizeToPt(captionAttrs.captionFontSize) || ENGAGE_DEFAULT_FONT_SIZE_PT
    : resolveEngageFontSizePt(editor)
  const currentSizeValue = formatEngageFontSizePt(currentSizePt)
  const sizeOptions = ENGAGE_DOC_FONT_SIZES.includes(currentSizePt)
    ? ENGAGE_DOC_FONT_SIZES
    : [...ENGAGE_DOC_FONT_SIZES, currentSizePt].sort((a, b) => a - b)
  const currentFontId = resolveEngageFontId(
    captionAttrs
      ? captionAttrs.captionFontFamily || ""
      : editor.getAttributes("textStyle").fontFamily ||
          editor.getAttributes("heading")?.blockFontFamily ||
          editor.getAttributes("paragraph")?.blockFontFamily ||
          ""
  )
  const figureActive = editor.isActive("imageFigure")
  const figureAttrs = figureActive ? editor.getAttributes("imageFigure") : null

  const switchTab = (id) => {
    setRibbonTab(id)
    setColorMenu(null)
  }

  return (
    <div className="engage-word-toolbar-wrap">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) onPickImage(file)
        }}
      />
      <div className="engage-word-toolbar" role="toolbar" aria-label="Document editing tools">
        <div className="engage-word-ribbon-tabs" role="tablist" aria-label="Formatting ribbon">
          {RIBBON_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={ribbonTab === tab.id}
              className={`engage-word-ribbon-tab${ribbonTab === tab.id ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {ribbonTab === "home" ? (
          <div className="engage-word-toolbar-row" role="tabpanel" aria-label="Home">
            <div className="engage-word-tool-group" data-label="Clipboard">
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo (Ctrl+Z)"
              >
                <ToolIcon icon={faArrowRotateLeft} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo (Ctrl+Y)"
              >
                <ToolIcon icon={faArrowRotateRight} />
              </ToolbarButton>
            </div>

            <div className="engage-word-tool-group" data-label="Font">
              <select
                className="engage-word-tool-select engage-word-tool-select-wide"
                value={currentFontId}
                onMouseDown={rememberSelectionForToolbar}
                onChange={(e) => {
                  const next = resolveEngageFontValue(e.target.value)
                  if (applyCaptionFontFamily(next)) return
                  applyBodyFontFamily(next)
                }}
                title={captionTarget ? "Caption font" : "Font"}
                aria-label={captionTarget ? "Caption font" : "Font"}
              >
                {ENGAGE_DOC_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>

              <select
                className="engage-word-tool-select engage-word-tool-select-size"
                value={currentSizeValue}
                onMouseDown={rememberSelectionForToolbar}
                onChange={(e) => {
                  const v = e.target.value
                  if (applyCaptionFontSize(v || null)) return
                  applyBodyFontSize(v || null)
                }}
                title={captionTarget ? "Caption font size (points)" : "Font size (points)"}
                aria-label={captionTarget ? "Caption font size" : "Font size"}
              >
                {sizeOptions.map((pt) => (
                  <option key={pt} value={formatEngageFontSizePt(pt)}>
                    {pt}
                  </option>
                ))}
              </select>

              <select
                className="engage-word-tool-select"
                value={
                  editor.isActive("heading", { level: 1 })
                    ? "h1"
                    : editor.isActive("heading", { level: 2 })
                      ? "h2"
                      : editor.isActive("heading", { level: 3 })
                        ? "h3"
                        : editor.isActive("heading", { level: 4 })
                          ? "h4"
                          : editor.isActive("blockquote")
                            ? "blockquote"
                            : "p"
                }
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "p") editor.chain().focus().setParagraph().run()
                  else if (v === "blockquote") editor.chain().focus().toggleBlockquote().run()
                  else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) }).run()
                }}
                title="Styles"
                aria-label="Styles"
              >
                <option value="p">Normal</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
                <option value="h4">Heading 4</option>
                <option value="blockquote">Quote</option>
              </select>

              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="Bold"
              >
                <strong>B</strong>
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="Italic"
              >
                <em>I</em>
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                active={editor.isActive("underline")}
                title="Underline"
              >
                <u>U</u>
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive("strike")}
                title="Strikethrough"
              >
                <s>abc</s>
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleSuperscript().run()}
                active={editor.isActive("superscript")}
                title="Superscript"
              >
                x²
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleSubscript().run()}
                active={editor.isActive("subscript")}
                title="Subscript"
              >
                x₂
              </ToolbarButton>

              <div className="engage-word-color-trigger-wrap">
                <button
                  type="button"
                  className={`engage-word-color-trigger engage-word-case-trigger${colorMenu === "case" ? " is-open" : ""}`}
                  title="Change case"
                  aria-label="Change case"
                  aria-haspopup="dialog"
                  aria-expanded={colorMenu === "case"}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "case" ? null : "case"))
                  }}
                >
                  <span className="engage-word-case-trigger-label">
                    <span>Aa</span>
                    <span className="engage-word-color-trigger-caret" aria-hidden>
                      ▾
                    </span>
                  </span>
                </button>
                {colorMenu === "case" ? (
                  <CaseMenu
                    open
                    onClose={() => setColorMenu(null)}
                    onPick={(mode) => applyEngageTextCase(editor, mode)}
                  />
                ) : null}
              </div>

              <div className="engage-word-color-trigger-wrap">
                <button
                  type="button"
                  className={`engage-word-color-trigger${colorMenu === "font" ? " is-open" : ""}`}
                  title="Font color"
                  aria-label="Font color"
                  aria-haspopup="dialog"
                  aria-expanded={colorMenu === "font"}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    rememberSelectionForToolbar()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "font" ? null : "font"))
                  }}
                >
                  <span className="engage-word-color-trigger-stack">
                    <span className="engage-word-color-trigger-letter">A</span>
                    <span className="engage-word-color-trigger-bar" style={{ background: currentColor }} />
                  </span>
                  <span className="engage-word-color-trigger-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                <ColorMenu
                  open={colorMenu === "font"}
                  onClose={() => setColorMenu(null)}
                  title="Font color"
                  colors={ENGAGE_DOC_COLORS}
                  gradients={ENGAGE_DOC_GRADIENTS}
                  allowCustom
                  customDefault={currentColor}
                  clearLabel="Automatic"
                  onPickColor={(value) => applyBodyColor(value)}
                  onPickGradient={(value) => {
                    restoreOrExpandTextSelection(editor, lastTextSelectionRef.current)
                    editor.chain().focus().unsetColor().setTextGradient(value).run()
                    const blockType = editor.state.selection.$from.parent?.type?.name
                    if (blockType === "paragraph" || blockType === "heading") {
                      editor.commands.updateAttributes(blockType, { blockColor: null })
                    }
                  }}
                  onClear={() => clearBodyColor()}
                />
              </div>

              <div className="engage-word-color-trigger-wrap">
                <button
                  type="button"
                  className={`engage-word-color-trigger engage-word-color-trigger-highlight${colorMenu === "highlight" ? " is-open" : ""}`}
                  title="Text highlight color"
                  aria-label="Text highlight color"
                  aria-haspopup="dialog"
                  aria-expanded={colorMenu === "highlight"}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "highlight" ? null : "highlight"))
                  }}
                >
                  <span className="engage-word-color-trigger-letter" style={{ background: currentHighlight }}>
                    ab
                  </span>
                  <span className="engage-word-color-trigger-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                <ColorMenu
                  open={colorMenu === "highlight"}
                  onClose={() => setColorMenu(null)}
                  title="Highlight color"
                  colors={ENGAGE_DOC_HIGHLIGHTS.filter((h) => h.value)}
                  clearLabel="No color"
                  onPickColor={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
                  onClear={() => editor.chain().focus().unsetHighlight().run()}
                />
              </div>
            </div>

            <div className="engage-word-tool-group" data-label="Paragraph">
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
                active={editor.isActive({ textAlign: "left" })}
                title="Align left"
              >
                <ToolIcon icon={faAlignLeft} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("center").run()}
                active={editor.isActive({ textAlign: "center" })}
                title="Align center"
              >
                <ToolIcon icon={faAlignCenter} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("right").run()}
                active={editor.isActive({ textAlign: "right" })}
                title="Align right"
              >
                <ToolIcon icon={faAlignRight} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("justify").run()}
                active={editor.isActive({ textAlign: "justify" })}
                title="Justify"
              >
                <ToolIcon icon={faAlignJustify} />
              </ToolbarButton>
              <ToolbarSep />
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive("bulletList")}
                title="Bullets"
              >
                <ToolIcon icon={faListUl} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                title="Numbering"
              >
                <ToolIcon icon={faListOl} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
                title="Increase indent"
              >
                <ToolIcon icon={faIndent} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().liftListItem("listItem").run()}
                title="Decrease indent"
              >
                <ToolIcon icon={faOutdent} />
              </ToolbarButton>
            </div>

            <div className="engage-word-tool-group" data-label="Borders & shading">
              <label className="engage-word-tool-select-wrap" title="Paragraph border (Word-style)">
                <span className="engage-word-tool-select-label">Border</span>
                <select
                  className="engage-word-tool-select"
                  value={
                    editor.getAttributes("paragraph").paraFrame ||
                    editor.getAttributes("heading").paraFrame ||
                    "none"
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const v = e.target.value
                    editor.chain().focus().setParagraphBorderPreset(v).run()
                  }}
                >
                  {PARA_BORDER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="engage-word-color-trigger-wrap" style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`engage-word-color-trigger${colorMenu === "paraBorder" ? " is-open" : ""}`}
                  title="Paragraph border color"
                  aria-label="Paragraph border color"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "paraBorder" ? null : "paraBorder"))
                  }}
                >
                  <span
                    className="engage-word-color-trigger-letter"
                    style={{
                      borderBottom: `3px solid ${
                        editor.getAttributes("paragraph").paraBorderColor ||
                        editor.getAttributes("heading").paraBorderColor ||
                        "#334155"
                      }`,
                    }}
                  >
                    ▭
                  </span>
                  <span className="engage-word-color-trigger-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                <ColorMenu
                  open={colorMenu === "paraBorder"}
                  onClose={() => setColorMenu(null)}
                  title="Border color"
                  colors={ENGAGE_DOC_COLORS}
                  allowCustom
                  customDefault="#334155"
                  clearLabel="Automatic"
                  onPickColor={(value) => editor.chain().focus().setParagraphBorderColor(value).run()}
                  onClear={() => editor.chain().focus().setParagraphBorderColor(null).run()}
                />
              </div>
              <div className="engage-word-color-trigger-wrap" style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`engage-word-color-trigger engage-word-color-trigger-highlight${
                    colorMenu === "paraShade" ? " is-open" : ""
                  }`}
                  title="Paragraph shading"
                  aria-label="Paragraph shading"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "paraShade" ? null : "paraShade"))
                  }}
                >
                  <span
                    className="engage-word-color-trigger-letter"
                    style={{
                      background:
                        editor.getAttributes("paragraph").paraShading ||
                        editor.getAttributes("heading").paraShading ||
                        "#e2e8f0",
                    }}
                  >
                    ¶
                  </span>
                  <span className="engage-word-color-trigger-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                <ColorMenu
                  open={colorMenu === "paraShade"}
                  onClose={() => setColorMenu(null)}
                  title="Paragraph shading"
                  colors={ENGAGE_DOC_HIGHLIGHTS.filter((h) => h.value).concat(ENGAGE_DOC_COLORS)}
                  allowCustom
                  customDefault="#f1f5f9"
                  clearLabel="No shading"
                  onPickColor={(value) => editor.chain().focus().setParagraphShading(value).run()}
                  onClear={() => editor.chain().focus().setParagraphShading(null).run()}
                />
              </div>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().clearParagraphBorders().run()}
                title="Clear paragraph borders & shading"
              >
                <ToolIcon icon={faEraser} />
              </ToolbarButton>
            </div>
          </div>
        ) : null}

        {ribbonTab === "insert" ? (
          <div className="engage-word-toolbar-row" role="tabpanel" aria-label="Insert">
            <div className="engage-word-tool-group" data-label="Links" style={{ position: "relative" }}>
              <ToolbarButton variant="ribbon" onClick={openLinkPanel} active={editor.isActive("link")} title="Insert link">
                <RibbonLabel icon={faLink} label="Link" />
              </ToolbarButton>
              {editor.isActive("link") ? (
                <ToolbarButton
                  variant="ribbon"
                  onClick={() => editor.chain().focus().unsetLink().run()}
                  title="Remove link"
                >
                  <RibbonLabel icon={faUnlink} label="Unlink" />
                </ToolbarButton>
              ) : null}
              {linkPanelOpen ? (
                <div className="engage-word-link-panel">
                  <label className="engage-word-link-panel-label">URL</label>
                  <input
                    type="url"
                    className="engage-word-link-panel-input"
                    placeholder="https://example.com"
                    value={linkUrl}
                    autoFocus
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); applyLink() }
                      if (e.key === "Escape") { e.preventDefault(); cancelLink() }
                    }}
                  />
                  <div className="engage-word-link-panel-actions">
                    <button type="button" className="engage-word-link-panel-btn apply" onClick={applyLink}>
                      Apply
                    </button>
                    <button type="button" className="engage-word-link-panel-btn cancel" onClick={cancelLink}>
                      Cancel
                    </button>
                    {editor.isActive("link") ? (
                      <button
                        type="button"
                        className="engage-word-link-panel-btn remove"
                        onClick={() => {
                          editor.chain().focus().extendMarkRange("link").unsetLink().run()
                          setLinkPanelOpen(false)
                          setLinkUrl("")
                        }}
                      >
                        Remove link
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="engage-word-tool-group" data-label="Illustrations">
              <ToolbarButton
                variant="ribbon"
                onClick={() => {
                  setImageError("")
                  setPendingSrc("")
                  setPendingName("")
                  setPendingCaption("")
                  setPendingSize("md")
                  setImagePanelOpen(true)
                  // Prefer upload over paste: open the file picker immediately.
                  setTimeout(() => fileRef.current?.click(), 0)
                }}
                active={imagePanelOpen}
                title="Upload a picture into the report"
              >
                <RibbonLabel icon={faFileImage} label="Upload picture" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => {
                  const logoUrl = getNrepLogoUrl()
                  if (!logoUrl) return
                  editor
                    .chain()
                    .focus()
                    .setImageFigure({
                      src: logoUrl,
                      alt: "NREP",
                      caption: "",
                      size: "xs",
                      isLogo: true,
                    })
                    .run()
                }}
                title="Insert NREP logo"
              >
                <RibbonLabel icon={faFileImage} label="Logo" />
              </ToolbarButton>
            </div>

            <div className="engage-word-tool-group" data-label="Pages">
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().setPageBreak().run()}
                title="Insert page break"
              >
                <RibbonLabel icon={faGripLines} label="Page break" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Insert horizontal line"
              >
                <RibbonLabel icon={faMinus} label="Line" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                title="Clear all formatting"
              >
                <RibbonLabel icon={faEraser} label="Clear all" />
              </ToolbarButton>
            </div>
          </div>
        ) : null}

        {ribbonTab === "table" ? (
          <div className="engage-word-toolbar-row" role="tabpanel" aria-label="Table">
            <div className="engage-word-tool-group" data-label="Insert">
              <label className="engage-word-tool-select-wrap" title="Insert table size">
                <span className="engage-word-tool-select-label">Size</span>
                <select
                  className="engage-word-tool-select"
                  defaultValue="3x3"
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const size = TABLE_INSERT_SIZES.find((s) => s.label === e.target.value)
                    if (!size) return
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: size.rows, cols: size.cols, withHeaderRow: true })
                      .run()
                  }}
                >
                  {TABLE_INSERT_SIZES.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <ToolbarButton
                variant="ribbon"
                onClick={() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
                active={editor.isActive("table")}
                title="Insert 3×3 table"
              >
                <RibbonLabel icon={faTable} label="Table" />
              </ToolbarButton>
            </div>

            <div className="engage-word-tool-group" data-label="Rows & columns">
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().addRowBefore().run()}
                disabled={!editor.can().addRowBefore()}
                title="Insert row above"
              >
                <RibbonLabel icon={faPlus} label="Row above" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                disabled={!editor.can().addRowAfter()}
                title="Insert row below"
              >
                <RibbonLabel icon={faPlus} label="Row below" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().deleteRow().run()}
                disabled={!editor.can().deleteRow()}
                title="Delete row"
              >
                <RibbonLabel icon={faMinus} label="Delete row" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                disabled={!editor.can().addColumnBefore()}
                title="Insert column left"
              >
                <RibbonLabel icon={faTableCells} label="Col left" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                disabled={!editor.can().addColumnAfter()}
                title="Insert column right"
              >
                <RibbonLabel icon={faTableCells} label="Col right" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                disabled={!editor.can().deleteColumn()}
                title="Delete column"
              >
                <RibbonLabel icon={faMinus} label="Delete col" />
              </ToolbarButton>
            </div>

            <div className="engage-word-tool-group" data-label="Merge">
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().mergeCells().run()}
                disabled={!editor.can().mergeCells()}
                title="Merge cells"
              >
                <RibbonLabel icon={faTableCells} label="Merge" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().splitCell().run()}
                disabled={!editor.can().splitCell()}
                title="Split cell"
              >
                <RibbonLabel icon={faTable} label="Split" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                disabled={!editor.isActive("table")}
                title="Toggle header row"
              >
                <RibbonLabel icon={faGripLines} label="Header row" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                disabled={!editor.isActive("table")}
                title="Toggle header column"
              >
                <RibbonLabel icon={faGripLines} label="Header col" />
              </ToolbarButton>
            </div>

            <div className="engage-word-tool-group" data-label="Borders">
              <label className="engage-word-tool-select-wrap" title="Cell border style">
                <span className="engage-word-tool-select-label">Borders</span>
                <select
                  className="engage-word-tool-select"
                  value={
                    editor.getAttributes("tableCell").borderPreset ||
                    editor.getAttributes("tableHeader").borderPreset ||
                    "all"
                  }
                  disabled={!editor.isActive("table")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => editor.chain().focus().setCellBorderPreset(e.target.value).run()}
                >
                  {TABLE_BORDER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="engage-word-tool-select-wrap" title="Border weight">
                <span className="engage-word-tool-select-label">Weight</span>
                <select
                  className="engage-word-tool-select"
                  value={
                    editor.getAttributes("tableCell").borderWidth ||
                    editor.getAttributes("tableHeader").borderWidth ||
                    "1pt"
                  }
                  disabled={!editor.isActive("table")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => editor.chain().focus().setCellBorderWidth(e.target.value).run()}
                >
                  {CELL_BORDER_WIDTHS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="engage-word-color-trigger-wrap" style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`engage-word-color-trigger${colorMenu === "cellBorder" ? " is-open" : ""}`}
                  title="Cell border color"
                  disabled={!editor.isActive("table")}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "cellBorder" ? null : "cellBorder"))
                  }}
                >
                  <span
                    className="engage-word-color-trigger-letter"
                    style={{
                      border: `2px solid ${
                        editor.getAttributes("tableCell").borderColor ||
                        editor.getAttributes("tableHeader").borderColor ||
                        "#475569"
                      }`,
                    }}
                  >
                    ▢
                  </span>
                  <span className="engage-word-color-trigger-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                <ColorMenu
                  open={colorMenu === "cellBorder"}
                  onClose={() => setColorMenu(null)}
                  title="Cell border color"
                  colors={ENGAGE_DOC_COLORS}
                  allowCustom
                  customDefault="#475569"
                  onPickColor={(value) => editor.chain().focus().setCellBorderColor(value).run()}
                  onClear={() => editor.chain().focus().setCellBorderColor(null).run()}
                />
              </div>
            </div>

            <div className="engage-word-tool-group" data-label="Shading & align">
              <div className="engage-word-color-trigger-wrap" style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`engage-word-color-trigger engage-word-color-trigger-highlight${
                    colorMenu === "cellShade" ? " is-open" : ""
                  }`}
                  title="Cell shading — click one cell (or select several), then pick a fill. Each cell keeps its own colour."
                  disabled={!editor.isActive("table")}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setColorMenu((m) => (m === "cellShade" ? null : "cellShade"))
                  }}
                >
                  <span
                    className="engage-word-color-trigger-letter"
                    style={{
                      background:
                        editor.getAttributes("tableCell").backgroundColor ||
                        editor.getAttributes("tableHeader").backgroundColor ||
                        "#e2e8f0",
                    }}
                  >
                    ▮
                  </span>
                  <span className="engage-word-color-trigger-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                <ColorMenu
                  open={colorMenu === "cellShade"}
                  onClose={() => setColorMenu(null)}
                  title="Cell shading"
                  colors={ENGAGE_DOC_HIGHLIGHTS.filter((h) => h.value).concat(ENGAGE_DOC_COLORS)}
                  allowCustom
                  customDefault="#e2e8f0"
                  clearLabel="No shading"
                  onPickColor={(value) => editor.chain().focus().setCellShading(value).run()}
                  onClear={() => editor.chain().focus().setCellShading(null).run()}
                />
              </div>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
                disabled={!editor.isActive("table")}
                active={editor.isActive({ textAlign: "left" })}
                title="Align cell text left"
              >
                <ToolIcon icon={faAlignLeft} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("center").run()}
                disabled={!editor.isActive("table")}
                active={editor.isActive({ textAlign: "center" })}
                title="Align cell text center"
              >
                <ToolIcon icon={faAlignCenter} />
              </ToolbarButton>
              <ToolbarButton
                variant="icon"
                onClick={() => editor.chain().focus().setTextAlign("right").run()}
                disabled={!editor.isActive("table")}
                active={editor.isActive({ textAlign: "right" })}
                title="Align cell text right"
              >
                <ToolIcon icon={faAlignRight} />
              </ToolbarButton>
              <label className="engage-word-tool-select-wrap" title="Vertical align">
                <span className="engage-word-tool-select-label">V-align</span>
                <select
                  className="engage-word-tool-select"
                  value={
                    editor.getAttributes("tableCell").verticalAlign ||
                    editor.getAttributes("tableHeader").verticalAlign ||
                    "top"
                  }
                  disabled={!editor.isActive("table")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => editor.chain().focus().setCellVerticalAlign(e.target.value).run()}
                >
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().clearCellFormatting().run()}
                disabled={!editor.isActive("table")}
                title="Clear cell borders & shading"
              >
                <RibbonLabel icon={faEraser} label="Clear cell" />
              </ToolbarButton>
              <ToolbarButton
                variant="ribbon"
                onClick={() => editor.chain().focus().deleteTable().run()}
                disabled={!editor.can().deleteTable()}
                title="Delete table"
              >
                <RibbonLabel icon={faEraser} label="Delete table" />
              </ToolbarButton>
            </div>
          </div>
        ) : null}
      </div>

      {imagePanelOpen ? (
        <div className="engage-word-image-panel" role="dialog" aria-label="Upload picture">
          <div className="engage-word-image-panel-title">Upload picture into the report</div>
          <p className="engage-word-image-panel-hint">
            Prefer clicking a dashed photo box in the report (or Add another photo on a selected photo).
            Captions go under each picture. Photos are compressed before upload so Save draft stays reliable.
          </p>
          <div className="engage-word-image-panel-row">
            <button type="button" className="engage-word-tool-btn is-active" onClick={() => fileRef.current?.click()}>
              {pendingSrc ? "Change photo" : "Choose photo from computer"}
            </button>
            <select
              className="engage-word-tool-select"
              value={pendingSize}
              onChange={(e) => setPendingSize(e.target.value)}
              title="Starting size"
            >
              {Object.entries(IMAGE_SIZE_PRESETS)
                .filter(([key]) => key !== "custom" && key !== "xs" && key !== "sm")
                .map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
            </select>
          </div>
          <label className="engage-word-image-caption-label">
            Caption (shown under the photo)
            <input
              className="engage-word-image-caption-field"
              type="text"
              value={pendingCaption}
              onChange={(e) => setPendingCaption(e.target.value)}
              placeholder="e.g. Solar dryer at the demonstration site"
            />
          </label>
          <div className="engage-word-image-panel-row">
            <button
              type="button"
              className="engage-word-tool-btn is-active"
              onClick={insertPendingImage}
              disabled={!pendingSrc}
            >
              Insert into document
            </button>
            <button
              type="button"
              className="engage-word-tool-btn"
              onClick={() => {
                setImagePanelOpen(false)
                setPendingSrc("")
                setPendingName("")
                setPendingCaption("")
                setImageError("")
              }}
            >
              Cancel
            </button>
          </div>
          {pendingSrc ? (
            <div className="engage-word-image-preview">
              <img src={pendingSrc} alt={pendingName || "Preview"} />
              {pendingCaption.trim() ? (
                <div className="engage-word-figcaption">{pendingCaption.trim()}</div>
              ) : (
                <div className="engage-word-figcaption engage-muted">Caption will appear here</div>
              )}
            </div>
          ) : null}
          {imageError ? <p className="engage-word-image-error">{imageError}</p> : null}
        </div>
      ) : null}

      {figureActive && figureAttrs && !imagePanelOpen && !figureAttrs.isLogo && figureAttrs.alt !== "NREP" ? (
        <div className="engage-word-image-panel">
          <div className="engage-word-image-panel-title">
            {figureAttrs.src ? "Selected picture" : "Empty photo slot"}
          </div>
          <p className="engage-word-image-panel-hint">
            {figureAttrs.src
              ? "Type the caption in the line under the photo. Use the size menu under the photo to resize."
              : "Click the dashed box in the document to upload a photo, then type the caption under it."}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function toPlain(value) {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") {
    if (value.includes("<")) {
      return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    }
    return value
  }
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function cleanWordSections(sections = []) {
  return (Array.isArray(sections) ? sections : []).map((section, index) => ({
    key: section.key || `section_${index}`,
    label: section.label || `Section ${index + 1}`,
    type: section.type || "text",
    columns: Array.isArray(section.columns) ? section.columns : null,
    defaultRows: Array.isArray(section.defaultRows) ? section.defaultRows : null,
    hint: section.hint || null,
    placeholder: section.placeholder || null,
    slotLabel: section.slotLabel || null,
  }))
}

/**
 * Every field report must allow photos. If a template schema forgot image sections
 * (stale Appwrite row, custom template, older draft), append a Pictures appendix.
 */
function withGuaranteedPhotoSections(sections = []) {
  // Do not invent photo sections — only use what the official template defines.
  return cleanWordSections(sections)
}

function hasEngageImageContent(value) {
  if (typeof value !== "string" || !value.trim()) return false
  if (/data-engage-figure/i.test(value)) return true
  if (/<img[\s>]/i.test(value)) return true
  return false
}

/** Empty template photo slot — report-sized upload box + caption under the photo. */
function buildEmptyImageSlotHtml({
  label = "Photo",
  captionPlaceholder = "",
  uploadTitle = "",
  uploadSub = "",
  gallery = false,
} = {}) {
  const captionHint =
    captionPlaceholder || "Type caption here (what this photo shows)"
  const slotLabel = label || "Photo"
  const title = uploadTitle || `Upload photo — ${slotLabel}`
  const sub = uploadSub || "Click to choose a picture"
  // Seed Large so quarterly / report photos match the page, not a 140px stamp.
  const size = "lg"
  const width = 540
  const layoutClass = gallery
    ? `engage-word-figure engage-word-figure--slot engage-word-figure--${size} engage-word-figure--gallery`
    : `engage-word-figure engage-word-figure--slot engage-word-figure--${size}`
  const layoutStyle = gallery
    ? `max-width:${width}px;width:min(100%,${width}px);margin:0.85rem auto;text-align:center;clear:both;`
    : `max-width:${width}px;width:min(100%,${width}px);margin:0.85rem auto;text-align:center;clear:both;`
  return `<figure data-engage-figure="true" data-empty-slot="true" data-size="${size}" data-width="${width}" data-slot-label="${escapeHtml(slotLabel)}" data-caption-placeholder="${escapeHtml(captionHint)}" class="${layoutClass}" style="${layoutStyle}"><div class="engage-word-image-slot" data-engage-slot-upload="true" contenteditable="false"><span class="engage-word-image-slot-title">${escapeHtml(title)}</span><span class="engage-word-image-slot-sub">${escapeHtml(sub)}</span></div></figure>`
}

function galleryPhotoLabel(section, index) {
  const custom = String(section?.slotLabel || "").trim()
  if (custom) return `${custom} ${index}`
  const key = String(section?.key || "")
  if (key === "pictures") return `Field image ${index}`
  if (key === "activityPictures") return `Activity photo ${index}`
  if (key === "evidence") return `Evidence photo ${index}`
  return `Photo ${index}`
}

function buildImageSectionBody(section, value) {
  if (hasEngageImageContent(value)) return value

  const captionPlaceholder =
    section.placeholder || "Type a short caption under this photo"

  if (section.type === "imageCaption") {
    return buildEmptyImageSlotHtml({
      label: section.label || "Image",
      captionPlaceholder,
      gallery: false,
    })
  }

  // Multi-photo gallery: three clickable boxes (typical “2–3 photos”). Extra photos via “Add another photo” on a selected photo — no toolbar/cursor dance.
  const slotCount = Math.max(3, Number(section.starterSlots) || 3)
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const n = i + 1
    return buildEmptyImageSlotHtml({
      label: galleryPhotoLabel(section, n),
      captionPlaceholder,
      uploadTitle: n === 1 ? "Add photo" : n === slotCount ? "Add another (optional)" : `Add photo ${n}`,
      uploadSub: "Click this box to choose a picture",
      gallery: true,
    })
  })
  // Quiet tip — extras use the in-document “Add another photo box” link.
  return `${slots.join("")}<p class="engage-doc-hint engage-doc-hint--gallery"><em>Caption each photo under its box.</em></p>`
}

/**
 * Keep empty photo slots present for image sections that already exist in the HTML.
 * Do NOT rewrite the official template layout (e.g. Field Article Image 1/2/3).
 * Dedupes accidental repeated "Pictures" blocks from earlier bad injects.
 */
export function ensureTemplateImageSlots(html, sections = []) {
  if (!html || typeof DOMParser === "undefined") return html
  const cleanSections = withGuaranteedPhotoSections(sections)
  const imageSections = cleanSections.filter(
    (s) => s?.type === "imageCaption" || s?.type === "images"
  )

  const doc = new DOMParser().parseFromString(`<div id="engage-root">${html}</div>`, "text/html")
  const root = doc.getElementById("engage-root")
  if (!root) return html

  let changed = false

  // If this template uses Image 1/2/3, strip the mistaken "Pictures" appendix we once injected.
  const usesInterleavedImages = imageSections.some((s) => /^image\d+$/i.test(String(s.key || "")))
  if (usesInterleavedImages) {
    Array.from(root.querySelectorAll('[data-section-key="pictures"], [data-section-key="reportPictures"]')).forEach(
      (wrap) => {
        if (wrap.querySelector("img[src]")) return
        let cursor = wrap.previousElementSibling
        if (
          cursor &&
          (cursor.classList?.contains("engage-doc-hint") ||
            /upload|caption|photo|image|picture/i.test(cursor.textContent || ""))
        ) {
          const hint = cursor
          cursor = cursor.previousElementSibling
          hint.remove()
        }
        if (cursor?.tagName === "H2" && /image|picture|photo/i.test(cursor.textContent || "")) {
          cursor.remove()
        }
        wrap.remove()
        changed = true
      }
    )
  }

  // Remove duplicate empty "Pictures" appendix blocks (same key repeated).
  const seenKeys = new Set()
  Array.from(root.querySelectorAll("[data-section-key]")).forEach((wrap) => {
    const key = String(wrap.getAttribute("data-section-key") || "").trim()
    const type = String(wrap.getAttribute("data-section-type") || "")
    if (!key) return
    if (type !== "images" && type !== "imageCaption" && key !== "pictures" && key !== "reportPictures") {
      return
    }
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      return
    }
    // Duplicate — only drop if it has no real photo yet
    if (wrap.querySelector("img[src]")) return
    let cursor = wrap.previousElementSibling
    if (
      cursor &&
      (cursor.classList?.contains("engage-doc-hint") ||
        /upload|caption|photo|image|picture/i.test(cursor.textContent || ""))
    ) {
      const hint = cursor
      cursor = cursor.previousElementSibling
      hint.remove()
    }
    if (cursor?.tagName === "H2" && /image|picture|photo/i.test(cursor.textContent || "")) {
      cursor.remove()
    }
    wrap.remove()
    changed = true
  })

  // Also strip orphan repeated H2 "Pictures" + empty upload stacks without section keys
  // left behind when TipTap dropped data-section-key attributes.
  const pictureHeadings = Array.from(root.querySelectorAll("h2")).filter((h) =>
    /^(pictures|field images|appendix\s*[—\-–]?\s*pictures)$/i.test(
      String(h.textContent || "").trim()
    )
  )
  if (pictureHeadings.length > 1) {
    pictureHeadings.slice(1).forEach((h2) => {
      let node = h2.nextElementSibling
      h2.remove()
      while (node) {
        const next = node.nextElementSibling
        const isHint =
          node.classList?.contains("engage-doc-hint") ||
          /upload|caption|photo|toolbar/i.test(node.textContent || "")
        const isEmptySlot =
          node.matches?.("figure[data-empty-slot], figure.engage-word-figure--slot") ||
          node.querySelector?.("figure[data-empty-slot], .engage-word-image-slot")
        const isCaptionOnly =
          node.classList?.contains("engage-word-figcaption-input") ||
          (node.tagName === "P" && /caption/i.test(node.textContent || ""))
        if (isHint || isEmptySlot || isCaptionOnly || node.getAttribute?.("data-section-key") === "pictures") {
          if (node.querySelector?.("img[src]")) break
          node.remove()
          node = next
          continue
        }
        break
      }
      changed = true
    })
  }

  // Fill empty wrappers that belong to the real template — never invent a new layout.
  for (const section of imageSections) {
    const key = String(section.key || "").trim()
    if (!key) continue
    const wraps = Array.from(
      root.querySelectorAll(`[data-section-key="${key}"]`)
    )
    if (!wraps.length) continue
    wraps.forEach((wrap, index) => {
      if (index > 0 && !wrap.querySelector("img[src]")) {
        // Extra empty clones of the same section key
        let cursor = wrap.previousElementSibling
        if (cursor?.classList?.contains("engage-doc-hint")) cursor.remove()
        const h = wrap.previousElementSibling
        if (h?.tagName === "H2") h.remove()
        wrap.remove()
        changed = true
        return
      }
      const hasSlotOrPhoto =
        wrap.querySelector("figure[data-engage-figure]") || wrap.querySelector("img[src]")
      if (hasSlotOrPhoto) return
      wrap.setAttribute("data-section-type", section.type)
      wrap.innerHTML = buildImageSectionBody(section, "")
      changed = true
    })
  }

  // Soft-migrate photo galleries: drop the old “toolbar + cursor” tip, keep uploads on the boxes.
  for (const section of imageSections) {
    if (section.type !== "images") continue
    const key = String(section.key || "").trim()
    if (!key) continue
    const wrap = root.querySelector(`[data-section-key="${key}"]`)
    if (!wrap) continue

    Array.from(wrap.querySelectorAll("p.engage-doc-hint, p")).forEach((p) => {
      const text = String(p.textContent || "")
      if (
        /Need more than two|Place the cursor here|Upload picture in the toolbar/i.test(text)
      ) {
        p.classList.add("engage-doc-hint", "engage-doc-hint--gallery")
        p.innerHTML = "<em>Caption each photo under its box.</em>"
        changed = true
      }
    })

    const figures = Array.from(wrap.querySelectorAll("figure[data-engage-figure]"))
    const targetSlots = Math.max(3, Number(section.starterSlots) || 3)
    if (figures.length && figures.length < targetSlots) {
      const captionPlaceholder =
        section.placeholder || "Type a short caption under this photo"
      const owner = wrap.ownerDocument
      let hint = wrap.querySelector("p.engage-doc-hint--gallery")
      for (let n = figures.length + 1; n <= targetSlots; n += 1) {
        const tmp = owner.createElement("div")
        tmp.innerHTML = buildEmptyImageSlotHtml({
          label: galleryPhotoLabel(section, n),
          captionPlaceholder,
          uploadTitle: n === targetSlots ? "Add another (optional)" : `Add photo ${n}`,
          uploadSub: "Click this box to choose a picture",
          gallery: true,
        })
        const fig = tmp.firstElementChild
        if (!fig) continue
        if (hint) wrap.insertBefore(fig, hint)
        else wrap.appendChild(fig)
        changed = true
      }
      if (!hint) {
        hint = owner.createElement("p")
        hint.className = "engage-doc-hint engage-doc-hint--gallery"
        hint.innerHTML = "<em>Caption each photo under its box.</em>"
        wrap.appendChild(hint)
        changed = true
      }
    }
  }

  return changed ? root.innerHTML : html
}

function prepareEditableDocumentHtml(html, sections = []) {
  return stripPartnerLetterheadFromHtml(ensureTemplateImageSlots(html || "", sections))
}

export function buildEngageDocumentHtml({
  docName = "NREP Report",
  documentDisplayName = null,
  documentSubtitle = null,
  reportTitle = "",
  titleFieldKey = null,
  headerFieldKeys = null,
  showTitleHeading = null,
  numberBodySections = null,
  letterhead = null,
  sections = [],
  content = {},
} = {}) {
  const cleanSections = withGuaranteedPhotoSections(sections)
  if (content?._documentHtml) {
    return prepareEditableDocumentHtml(content._documentHtml, cleanSections)
  }

  const orgLine = String(content._orgLine || "National Renewable Energy Platform").trim()
  const typeName = String(
    content._docTypeName || documentDisplayName || docName || "NREP Report"
  ).trim()
  const typeSub = String(
    content._docSubtitle !== undefined && content._docSubtitle !== null
      ? content._docSubtitle
      : documentSubtitle || ""
  ).trim()

  const sectionByKey = new Map(cleanSections.map((section) => [section.key, section]))

  const defaultHeaderKeys = ["date", "location", "author", "authorName", "authorPosition"]
  const resolvedHeaderKeys = Array.isArray(headerFieldKeys)
    ? headerFieldKeys.filter(Boolean)
    : [...defaultHeaderKeys, titleFieldKey].filter(Boolean)

  const headerKeySet = new Set(resolvedHeaderKeys)
  // Never also render the article/meeting title field as a duplicate body section
  if (titleFieldKey) headerKeySet.add(titleFieldKey)

  const shouldShowTitleHeading =
    showTitleHeading === null || showTitleHeading === undefined
      ? Boolean(titleFieldKey) && !["mission", "activityName"].includes(String(titleFieldKey))
      : Boolean(showTitleHeading)

  const shouldNumberBody =
    numberBodySections === null || numberBodySections === undefined
      ? false
      : Boolean(numberBodySections)

  const heading = String(
    (titleFieldKey && content?.[titleFieldKey]) || content._heading || reportTitle || ""
  ).trim()

  const pffLocationKeys = ["district", "subcounty", "parish", "village"]
  const usesLocationBlock = pffLocationKeys.every((key) => sectionByKey.has(key))

  const metaHtmlParts = []
  if (usesLocationBlock) {
    for (const key of resolvedHeaderKeys) {
      if (pffLocationKeys.includes(key)) continue
      const section = sectionByKey.get(key)
      if (!section) continue
      const value = toPlain(content[section.key]) || ""
      metaHtmlParts.push(
        `<p data-section-key="${escapeHtml(section.key)}"><strong>${escapeHtml(section.label)}:</strong> ${escapeHtml(value)}</p>`
      )
    }
    metaHtmlParts.push(`<p><strong>Activity Location</strong></p>`)
    for (const key of pffLocationKeys) {
      const section = sectionByKey.get(key)
      if (!section) continue
      const value = toPlain(content[section.key]) || ""
      metaHtmlParts.push(
        `<p data-section-key="${escapeHtml(section.key)}" style="margin-left:1rem;"><strong>${escapeHtml(section.label)}:</strong> ${escapeHtml(value)}</p>`
      )
    }
  } else {
    for (const key of resolvedHeaderKeys) {
      const section = sectionByKey.get(key)
      if (!section) continue
      const value = toPlain(content[section.key]) || ""
      metaHtmlParts.push(
        `<p data-section-key="${escapeHtml(section.key)}"><strong>${escapeHtml(section.label)}:</strong> ${escapeHtml(value)}</p>`
      )
    }
  }
  const metaHtml = metaHtmlParts.join("")

  const bodySections = cleanSections.filter(
    (section) => !headerKeySet.has(section.key) && section.key !== "actionPoints"
  )
  const bodyHtml = bodySections
    .map((section, index) => {
      const alreadyNumbered = /^\d+[\.)]\s/.test(String(section.label || ""))
      const headingLabel =
        shouldNumberBody && !alreadyNumbered
          ? `${index + 1}. ${section.label}`
          : section.label
      const value = content[section.key]
      let body
      if (isTableSection(section)) {
        body = buildSectionTableHtml(section, value)
      } else if (section.type === "imageCaption" || section.type === "images") {
        body = buildImageSectionBody(section, value)
      } else if (typeof value === "string" && value.includes("<")) {
        body = value
      } else if (toPlain(value)) {
        body = `<p>${escapeHtml(toPlain(value))}</p>`
      } else if (section.defaultBody) {
        body = section.defaultBody
      } else {
        body = `<p></p>`
      }
      const hint =
        section.type === "imageCaption" || section.type === "images"
          ? `<p class="engage-doc-hint"><em>${escapeHtml(
              section.hint ||
                "Upload the photo in the box below, then type the caption in the line under it."
            )}</em></p>`
          : section.hint
            ? `<p class="engage-doc-hint"><em>${escapeHtml(section.hint)}</em></p>`
            : ""
      const isLandscape = String(section.pageOrientation || "").toLowerCase() === "landscape"
      // Official BCCEC Word template: KPI section is landscape A4 — keep heading+table together.
      if (isLandscape) {
        return `
        <div class="engage-word-landscape-page" data-page-orientation="landscape" data-page-size="A4-landscape" data-section-key="${escapeHtml(section.key)}" data-section-type="${escapeHtml(section.type || "text")}">
          <h2>${escapeHtml(headingLabel)}</h2>
          ${hint}
          ${body}
        </div>
      `
      }
      return `
        <h2>${escapeHtml(headingLabel)}</h2>
        ${hint}
        <div data-section-key="${escapeHtml(section.key)}" data-section-type="${escapeHtml(section.type || "text")}">${body}</div>
      `
    })
    .join("")

  const letterheadProfile = letterhead || content?._letterhead || null
  const letterheadHtml = letterheadProfile
    ? ""
    : `<figure data-engage-figure="true" data-engage-logo="true" data-size="xs" class="engage-word-figure engage-word-figure--xs" style="max-width:72px;margin:0.85rem auto;text-align:center;clear:both;">
      <img src="${escapeHtml(getNrepLogoUrl())}" alt="NREP" width="72" class="engage-word-doc-image engage-word-logo" style="max-width:72px;width:auto;height:auto;display:block;margin:0 auto;" />
    </figure>`
  const isPffLetterhead = ["pff", "power-for-food", "powerforfood"].includes(
    String(letterheadProfile || "").trim().toLowerCase()
  )
  const titleStyle = isPffLetterhead
    ? "clear:both;margin:0 0 10pt;text-align:center;color:#00B0F0;font-family:'Calibri Light',Calibri,'Segoe UI',sans-serif;font-size:12pt;font-weight:700;"
    : "clear:both;text-align:center;"

  return `
    ${letterheadHtml}
    ${
      letterheadProfile
        ? ""
        : `<p data-field="_orgLine" style="clear:both;margin:0.4rem 0;text-align:center;"><strong>${escapeHtml(orgLine)}</strong></p>`
    }
    <h1 data-field="_docTypeName" style="${titleStyle}">${escapeHtml(typeName)}</h1>
    ${typeSub ? `<p data-field="_docSubtitle" style="clear:both;text-align:center;"><em>${escapeHtml(typeSub)}</em></p>` : ""}
    ${isPffLetterhead ? `<p style="margin:10pt 0 4pt;"><strong>Overview</strong></p><p style="margin:0 0 8pt;"><strong>General Information</strong></p>` : "<hr />"}
    ${shouldShowTitleHeading ? `<h1 data-section-key="${escapeHtml(titleFieldKey || "_heading")}">${escapeHtml(heading)}</h1>` : ""}
    ${metaHtml}
    ${metaHtml && !isPffLetterhead ? "<hr />" : ""}
    ${bodyHtml}
  `
}

function extractTitleFromHtml(html = "", titleFieldKey = null) {
  if (typeof window === "undefined" || !html) return {}
  const doc = new DOMParser().parseFromString(html, "text/html")
  const headingEl = titleFieldKey
    ? doc.querySelector(`[data-section-key="${titleFieldKey}"]`)
    : doc.querySelector("h1[data-section-key], h1")
  if (!headingEl) return {}
  const text = plainValueAfterLabel(headingEl)
  if (!text) return {}
  const patch = { __title__: text }
  if (titleFieldKey) patch[titleFieldKey] = text
  else patch._heading = text
  return patch
}

/**
 * On save/flush only — pull Mission / Date / Activity (and other header rows)
 * from the live TipTap HTML for every Word template. Never call this on each keystroke.
 */
function extractHeaderFieldsFromHtml(html = "", headerFieldKeys = null, titleFieldKey = null) {
  const patch = { ...extractTitleFromHtml(html, titleFieldKey) }
  if (typeof window === "undefined" || !html) return patch
  const allow = Array.isArray(headerFieldKeys) && headerFieldKeys.length
    ? new Set(headerFieldKeys.map(String))
    : null
  if (titleFieldKey) {
    if (!allow) {
      /* extract all simple header nodes below */
    } else {
      allow.add(String(titleFieldKey))
    }
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  doc.querySelectorAll("p[data-section-key], h1[data-section-key]").forEach((el) => {
    const key = String(el.getAttribute("data-section-key") || "").trim()
    if (!key) return
    if (allow && !allow.has(key)) return
    const text = plainValueAfterLabel(el)
    if (text) patch[key] = text
  })
  return patch
}

function commitPendingEngageCaptions(root = null) {
  if (typeof document === "undefined") return
  const active = document.activeElement
  if (active?.classList?.contains("engage-word-figcaption-input")) {
    active.blur()
  }
  const scope = root && root.querySelectorAll ? root : document
  scope.querySelectorAll?.(".engage-word-figcaption-input").forEach((input) => {
    if (document.activeElement === input && typeof input.blur === "function") input.blur()
  })
}

function normalizeEngageEditorHtml(html, sections = [], letterhead = null) {
  void letterhead
  return sanitizeEngageDocumentHtml(prepareEditableDocumentHtml(html || "", sections))
}

function buildEditorContentPatch(html, titleFieldKey = null, headerFieldKeys = null) {
  return {
    _documentHtml: html,
    ...extractHeaderFieldsFromHtml(html, headerFieldKeys, titleFieldKey),
  }
}

/** Keeps a TipTap failure from taking down the whole Continue-editing page. */
class EngageWordEditorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch() {
    /* logged by React; UI shows fallback below */
  }

  render() {
    if (this.state.error) {
      return (
        <div className="engage-word-editor">
          <div className="engage-word-image-panel">
            <p className="engage-word-image-error">
              The document editor hit a problem loading this draft. Try Reload, or open the report
              view and Continue editing again.
            </p>
            <button
              type="button"
              className="engage-word-tool-btn"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export const EngageWordDocument = forwardRef(function EngageWordDocument(
  {
  docName = "NREP Report",
  documentDisplayName = null,
  documentSubtitle = null,
  reportTitle = "",
  titleFieldKey = null,
  headerFieldKeys = null,
  showTitleHeading = null,
  numberBodySections = null,
  letterhead = null,
  sections = [],
  content = {},
  editable = false,
  remoteEditors = [],
  onChangeField,
  officialTemplate = false,
  signatures = null,
},
  ref
) {
  const [editorError, setEditorError] = useState("")
  const [pageZoom, setPageZoom] = useState(1)
  const pagesRef = useRef(null)
  const isOfficialSheet = Boolean(officialTemplate || letterhead)
  const isBccecSheet = isBccecLetterheadProfile(letterhead)
  // Official BCCEC DOCX uses landscape A4 for KPIs — keep the stage that wide so pages are not clipped.
  const stageWidthMm = isBccecSheet ? A4_LANDSCAPE_WIDTH_MM : A4_WIDTH_MM
  const sectionKey = useMemo(
    () => (Array.isArray(sections) ? sections : []).map((s) => s.key).join("|"),
    [sections]
  )
  const layoutKey = useMemo(
    () =>
      [
        documentDisplayName || "",
        documentSubtitle || "",
        titleFieldKey || "",
        Array.isArray(headerFieldKeys) ? headerFieldKeys.join(",") : "",
        String(showTitleHeading),
        String(numberBodySections),
        String(letterhead || ""),
      ].join("|"),
    [
      documentDisplayName,
      documentSubtitle,
      titleFieldKey,
      headerFieldKeys,
      showTitleHeading,
      numberBodySections,
      letterhead,
    ]
  )
  const headerLogos = useMemo(() => letterheadLogosForProfile(letterhead), [letterhead])
  // Structural seed only — never fingerprint typed string lengths. Doing so rebuilt
  // the blank template on every keystroke in Mission / Date / Activity and reset TipTap.
  const contentSeedKey = useMemo(
    () => `${sectionKey}|v:${String(content?._templateSeedVersion || "")}`,
    [sectionKey, content?._templateSeedVersion]
  )
  const blankSeedHtml = useMemo(
    () =>
      buildEngageDocumentHtml({
        docName,
        documentDisplayName,
        documentSubtitle,
        reportTitle,
        titleFieldKey,
        headerFieldKeys,
        showTitleHeading,
        numberBodySections,
        letterhead,
        sections,
        content: { ...content, _documentHtml: undefined, _letterhead: letterhead || undefined },
      }),
    // Intentionally omit live `content` / typed field lengths. Template shell is
    // rebuilt only when layout, sections, or template seed version change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docName, layoutKey, sectionKey, contentSeedKey, letterhead, reportTitle, titleFieldKey, headerFieldKeys, showTitleHeading, numberBodySections]
  )
  // Once the author (or onCreate) has a live document body, never feed the blank
  // template shell back into TipTap — that wiped Mission / Date / Activity typing.
  const seedHtml = String(content?._documentHtml || "").trim() ? "" : blankSeedHtml

  const initialHtmlRef = useRef(
    normalizeEngageEditorHtml(content?._documentHtml || "", sections, letterhead) || null
  )
  const applyingRef = useRef(false)
  const lastEmittedHtml = useRef(initialHtmlRef.current || "")
  const lastLocalEditAtRef = useRef(0)
  /** After TipTap has the author's live doc, never setContent from React props again. */
  const authorOwnsDocRef = useRef(Boolean(initialHtmlRef.current))
  const emitTimerRef = useRef(null)
  const editorRef = useRef(null)
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const letterheadRef = useRef(letterhead)
  letterheadRef.current = letterhead
  const titleFieldKeyRef = useRef(titleFieldKey)
  titleFieldKeyRef.current = titleFieldKey
  const headerFieldKeysRef = useRef(headerFieldKeys)
  headerFieldKeysRef.current = headerFieldKeys
  const onChangeFieldRef = useRef(onChangeField)
  onChangeFieldRef.current = onChangeField
  // Prefer saved HTML over an empty template seed whenever it exists.
  const startupHtml =
    initialHtmlRef.current ||
    (content?._documentHtml
      ? normalizeEngageEditorHtml(content._documentHtml, sections, letterhead)
      : seedHtml || null)

  const EngageTableCell = useMemo(
    () =>
      createEngageTableCell(TableCell).configure({
        HTMLAttributes: { class: "engage-doc-td" },
      }),
    []
  )
  const EngageTableHeader = useMemo(
    () =>
      createEngageTableCell(TableHeader).configure({
        HTMLAttributes: { class: "engage-doc-th" },
      }),
    []
  )

  const editorExtensions = useMemo(
    () => [
      StarterKit.configure({
        // Deeper stack + tighter grouping so Ctrl+Z/Y feel like Word across all report templates.
        undoRedo: {
          depth: 200,
          newGroupDelay: 300,
        },
        link: false,
        underline: false,
      }),
      EngageUndoRedoKeys,
      Underline,
      Subscript,
      Superscript,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      FontSize,
      FontFamily,
      SafeColor,
      BlockTextStyle,
      TextGradient,
      ParagraphBorders,
      ImageFigure,
      PageBreak,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
        HTMLAttributes: {
          class: "engage-doc-table",
        },
      }),
      TableRow,
      EngageTableHeader,
      EngageTableCell,
      TableCellFormat,
    ],
    [EngageTableCell, EngageTableHeader]
  )

  const editor = useEditor({
    extensions: editorExtensions,
    content: startupHtml || seedHtml,
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "engage-word-prose",
      },
      handleKeyDown: (_view, event) => {
        // Belt-and-suspenders: stop the browser undoing the whole page/contenteditable
        // when TipTap already owns History (shared by every Word report template).
        if (!editable) return false
        const key = String(event.key || "").toLowerCase()
        const mod = event.ctrlKey || event.metaKey
        if (!mod || event.altKey) return false
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return false
        if (key === "z" && !event.shiftKey) {
          event.preventDefault()
          if (ed.can().undo()) ed.commands.undo()
          return true
        }
        if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault()
          if (ed.can().redo()) ed.commands.redo()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        if (!editable) return false
        const files = collectImageFilesFromDataTransfer(event.clipboardData)
        if (!files.length) return false
        event.preventDefault()
        void insertEngageImagesFromFiles(editorRef.current, files).catch((err) => {
          setEditorError(err?.message || "Could not paste image")
        })
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!editable || moved) return false
        const files = collectImageFilesFromDataTransfer(event.dataTransfer)
        if (!files.length) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        void (async () => {
          const ed = editorRef.current
          if (!ed || ed.isDestroyed) return
          try {
            if (coords?.pos != null) {
              ed.chain().focus().setTextSelection(coords.pos).run()
            }
            await insertEngageImagesFromFiles(ed, files)
          } catch (err) {
            setEditorError(err?.message || "Could not drop image")
          }
        })()
        return true
      },
    },
    onCreate: ({ editor: current }) => {
      setEditorError("")
      // Mark ownership immediately so a late parent setState cannot setContent and
      // throw the caret to the end of the document.
      authorOwnsDocRef.current = true
      const html = sanitizeEngageDocumentHtml(current.getHTML() || "")
      lastEmittedHtml.current = html
      const notify = onChangeFieldRef.current
      if (!initialHtmlRef.current && notify && html) {
        notify("__patch__", buildEditorContentPatch(html, titleFieldKeyRef.current, headerFieldKeysRef.current))
      }
    },
    onUpdate: ({ editor: current }) => {
      const notify = onChangeFieldRef.current
      if (!notify || applyingRef.current) return
      try {
        lastLocalEditAtRef.current = Date.now()
        authorOwnsDocRef.current = true
        // Keep TipTap's own HTML — heavy normalize/prepare on every keystroke made
        // parent HTML diverge and invited setContent resets (cursor → end of doc).
        const html = sanitizeEngageDocumentHtml(current.getHTML() || "")
        if (html === lastEmittedHtml.current) return
        lastEmittedHtml.current = html
        if (emitTimerRef.current) clearTimeout(emitTimerRef.current)
        emitTimerRef.current = setTimeout(() => {
          emitTimerRef.current = null
          const latest = onChangeFieldRef.current
          if (!latest) return
          latest("__patch__", { _documentHtml: lastEmittedHtml.current })
        }, 450)
      } catch (err) {
        setEditorError(err?.message || "Document update failed")
      }
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    return () => {
      if (emitTimerRef.current) clearTimeout(emitTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isOfficialSheet) {
      setPageZoom(1)
      return undefined
    }
    const scroller = pagesRef.current
    if (!scroller) return undefined
    const update = () => {
      const available = Math.max(0, scroller.clientWidth - 24)
      const pagePx = stageWidthMm * CSS_PX_PER_MM
      if (!available || !pagePx) return
      // Only shrink to fit a narrow viewport — never stretch the page to fill the gray canvas.
      // Word-style: fixed A4 sits centered with breathing room on both sides.
      const fit = Math.round((available / pagePx) * 100) / 100
      setPageZoom(Math.min(1, Math.max(0.55, fit)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [isOfficialSheet, stageWidthMm])

  useImperativeHandle(
    ref,
    () => ({
      getDocumentHtml: () => {
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return content?._documentHtml || lastEmittedHtml.current || ""
        commitPendingEngageCaptions(ed.view?.dom)
        return normalizeEngageEditorHtml(ed.getHTML(), sections, letterhead)
      },
      flushDocument: () => {
        if (emitTimerRef.current) {
          clearTimeout(emitTimerRef.current)
          emitTimerRef.current = null
        }
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) commitPendingEngageCaptions(ed.view?.dom)
        const html = normalizeEngageEditorHtml(
          ed && !ed.isDestroyed ? ed.getHTML() : content?._documentHtml || lastEmittedHtml.current || "",
          sections,
          letterhead
        )
        if (!html) return {}
        lastEmittedHtml.current = html
        const patch = buildEditorContentPatch(html, titleFieldKey, headerFieldKeys)
        if (onChangeField) onChangeField("__patch__", patch)
        return patch
      },
      /**
       * Colleague sync only. Never call while the author is typing — setContent
       * always moves the caret to the end of the document.
       */
      replaceDocumentHtml: (nextHtml = "") => {
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return false
        if (Date.now() - lastLocalEditAtRef.current < 2500) return false
        if (ed.isFocused) return false
        const incoming = normalizeEngageEditorHtml(nextHtml, sections, letterhead)
        if (!incoming) return false
        if (incoming === lastEmittedHtml.current) return true
        applyingRef.current = true
        try {
          // Do not push load/sync into Ctrl+Z history — that made undo jump unpredictably.
          ed.chain().setMeta("addToHistory", false).setContent(incoming, { emitUpdate: false }).run()
          lastEmittedHtml.current = incoming
          initialHtmlRef.current = incoming
          authorOwnsDocRef.current = true
          return true
        } catch {
          return false
        } finally {
          applyingRef.current = false
        }
      },
      getEditor: () => editorRef.current,
      getSelectionSnapshot: () => {
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return null
        try {
          const { from, to } = ed.state.selection
          const start = Math.max(0, Math.min(from, to) - 20)
          const end = Math.min(ed.state.doc.content.size, Math.max(from, to) + 28)
          const snippet = ed.state.doc.textBetween(start, end, " ").replace(/\s+/g, " ").trim()
          return { from, to, snippet: snippet.slice(0, 80) }
        } catch {
          return null
        }
      },
    }),
    [onChangeField, titleFieldKey, headerFieldKeys, sections, letterhead]
  )

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(editable)
  }, [editor, editable])

  // Props → TipTap sync. Editable drafts: TipTap owns the document after first paint.
  // Calling setContent while typing is what throws the caret to the end of the doc.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const storedHtml = String(content?._documentHtml || "").trim()
    const incoming = normalizeEngageEditorHtml(
      storedHtml || (!editable ? seedHtml || blankSeedHtml || "" : "") || "",
      sections,
      letterhead
    )

    if (!editable) {
      if (!incoming || incoming === lastEmittedHtml.current) return
      applyingRef.current = true
      try {
        editor.chain().setMeta("addToHistory", false).setContent(incoming, { emitUpdate: false }).run()
        lastEmittedHtml.current = incoming
      } catch (err) {
        setEditorError(err?.message || "Could not load saved document")
      }
      applyingRef.current = false
      return
    }

    // Author already typing / editor already owns the live document.
    if (authorOwnsDocRef.current || lastLocalEditAtRef.current > 0 || editor.isFocused) {
      return
    }

    // Late hydrate: first saved body arrived before the author typed — load once.
    if (!storedHtml) return
    if (!incoming || incoming === lastEmittedHtml.current) {
      authorOwnsDocRef.current = true
      return
    }
    applyingRef.current = true
    try {
      editor.chain().setMeta("addToHistory", false).setContent(incoming, { emitUpdate: false }).run()
      lastEmittedHtml.current = incoming
      initialHtmlRef.current = incoming
      authorOwnsDocRef.current = true
      setEditorError("")
    } catch (err) {
      setEditorError(err?.message || "Could not load saved document")
    }
    applyingRef.current = false
    // Intentionally ignore seedHtml identity — editable mode must not re-apply templates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editable, content?._documentHtml, sectionKey, content?._templateSeedVersion, letterhead])

  if (editorError) {
    return (
      <div className="engage-word-editor">
        <div className="engage-word-image-panel">
          <p className="engage-word-image-error">{editorError}</p>
          <button type="button" className="engage-word-tool-btn" onClick={() => setEditorError("")}>
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return (
    <EngageWordEditorBoundary>
      <div className="engage-word-editor">
        {editable ? <WordToolbar editor={editor} /> : null}
        <div className="engage-word-pages engage-word-pages--canvas" ref={pagesRef}>
          <div
            className={isOfficialSheet ? "engage-word-a4-stage" : undefined}
            data-page-stage={isBccecSheet ? "a4-with-landscape" : isOfficialSheet ? "a4" : undefined}
            style={
              isOfficialSheet
                ? {
                    width: `${stageWidthMm * pageZoom}mm`,
                    minHeight: `${A4_HEIGHT_MM * pageZoom}mm`,
                  }
                : undefined
            }
          >
            <article
              className={`engage-word-sheet engage-word-page${
                isOfficialSheet ? " engage-word-sheet--official" : " engage-word-sheet-paged"
              }`}
              data-engage-letterhead={letterhead || undefined}
              style={
                isOfficialSheet
                  ? {
                      width: `${A4_WIDTH_MM}mm`,
                      minHeight: `${A4_HEIGHT_MM}mm`,
                      transform: pageZoom === 1 ? undefined : `scale(${pageZoom})`,
                      transformOrigin: isBccecSheet ? "top center" : "top left",
                    }
                  : undefined
              }
            >
              {headerLogos.length ? (
                <div
                  className="engage-letterhead"
                  data-engage-letterhead={letterhead}
                  data-letterhead-layout={
                    isBccecLetterheadProfile(letterhead)
                      ? "optical-balance"
                      : "absolute"
                  }
                  contentEditable={false}
                >
                  {headerLogos.map((logo) => {
                    const isBccec = isBccecLetterheadProfile(letterhead)
                    const img = (
                      <img
                        src={logo.src}
                        alt={logo.alt}
                        className={`engage-letterhead-logo engage-letterhead-logo--${logo.variant}`}
                        style={letterheadLogoStyle(logo, { absolute: !isBccec })}
                        draggable={false}
                      />
                    )
                    if (isBccec) {
                      return (
                        <div key={logo.src} className="engage-letterhead-slot">
                          {img}
                        </div>
                      )
                    }
                    return <span key={logo.src}>{img}</span>
                  })}
                </div>
              ) : null}
              <EditorContent editor={editor} />
              {Array.isArray(signatures) && signatures.length ? (
                <EngageSignatureProof signatures={signatures} compact />
              ) : null}
              {editable ? <EngageRemoteCarets editor={editor} editors={remoteEditors} /> : null}
            </article>
          </div>
        </div>
      </div>
    </EngageWordEditorBoundary>
  )
})

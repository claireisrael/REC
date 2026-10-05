"use client"

import { Node, Mark, mergeAttributes, Extension } from "@tiptap/core"

export const ENGAGE_DOC_FONTS = [
  { id: "default", label: "Default", value: "" },
  { id: "lora", label: "Lora", value: "Lora, Georgia, serif" },
  { id: "poppins", label: "Poppins", value: "Poppins, Arial, sans-serif" },
  { id: "merriweather", label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { id: "source-sans", label: "Source Sans 3", value: '"Source Sans 3", Arial, sans-serif' },
  { id: "nunito", label: "Nunito", value: "Nunito, Arial, sans-serif" },
  { id: "playfair", label: "Playfair Display", value: '"Playfair Display", Georgia, serif' },
  { id: "roboto-slab", label: "Roboto Slab", value: '"Roboto Slab", Georgia, serif' },
  { id: "open-sans", label: "Open Sans", value: '"Open Sans", Arial, sans-serif' },
  { id: "calibri", label: "Calibri", value: "Calibri, sans-serif" },
  { id: "cambria", label: "Cambria", value: 'Cambria, "Times New Roman", serif' },
  { id: "times", label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { id: "arial", label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { id: "georgia", label: "Georgia", value: "Georgia, serif" },
  { id: "verdana", label: "Verdana", value: "Verdana, sans-serif" },
  { id: "courier", label: "Courier New", value: '"Courier New", Courier, monospace' },
]

export function resolveEngageFontId(fontFamily = "") {
  const raw = String(fontFamily || "").trim().toLowerCase().replace(/['"]/g, "")
  if (!raw) return "default"
  const match = ENGAGE_DOC_FONTS.find((font) => {
    if (!font.value) return false
    const token = font.value.toLowerCase().replace(/['"]/g, "").split(",")[0].trim()
    return raw === token || raw.startsWith(`${token},`) || raw.includes(token)
  })
  return match?.id || "default"
}

export function resolveEngageFontValue(fontId = "default") {
  return ENGAGE_DOC_FONTS.find((font) => font.id === fontId)?.value || ""
}

/** Word-style point sizes shown in the font size box. */
export const ENGAGE_DEFAULT_FONT_SIZE_PT = 12

export const ENGAGE_DOC_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

export function fontSizeToPt(value) {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return null
  const num = parseFloat(raw)
  if (!Number.isFinite(num) || num <= 0) return null
  if (raw.endsWith("px")) return Math.max(1, Math.round((num * 72) / 96))
  if (raw.endsWith("pt") || raw.endsWith("pc")) return Math.max(1, Math.round(num))
  return Math.max(1, Math.round(num))
}

export function formatEngageFontSizePt(pt) {
  const n = Number(pt)
  if (!Number.isFinite(n) || n <= 0) return `${ENGAGE_DEFAULT_FONT_SIZE_PT}pt`
  return `${Math.round(n)}pt`
}

/** Current font size in pt for the caret/selection — like Word's size box. */
export function resolveEngageFontSizePt(editor) {
  if (!editor) return ENGAGE_DEFAULT_FONT_SIZE_PT
  const marked = fontSizeToPt(editor.getAttributes("textStyle")?.fontSize)
  if (marked) return marked
  const blockAttrs =
    editor.getAttributes("heading") || editor.getAttributes("paragraph") || {}
  const blockMarked = fontSizeToPt(blockAttrs.blockFontSize)
  if (blockMarked) return blockMarked
  if (editor.isActive("heading", { level: 1 })) return 24
  if (editor.isActive("heading", { level: 2 })) return 18
  if (editor.isActive("heading", { level: 3 })) return 14
  if (editor.isActive("heading", { level: 4 })) return 12
  return ENGAGE_DEFAULT_FONT_SIZE_PT
}

export const ENGAGE_DOC_COLORS = [
  { label: "NREP Blue", value: "#176F91", swatch: "#176F91" },
  { label: "NREP Blue light", value: "#2E9ECC", swatch: "#2E9ECC" },
  { label: "NREP Blue dark", value: "#0B5E78", swatch: "#0B5E78" },
  { label: "NREP Orange", value: "#EFA74F", swatch: "#EFA74F" },
  { label: "NREP Orange light", value: "#F5C078", swatch: "#F5C078" },
  { label: "NREP Orange dark", value: "#B45309", swatch: "#B45309" },
  { label: "Ink", value: "#0f172a", swatch: "#0f172a" },
  { label: "Slate", value: "#475569", swatch: "#475569" },
  { label: "Muted", value: "#94a3b8", swatch: "#94a3b8" },
  { label: "White", value: "#ffffff", swatch: "#ffffff" },
  { label: "Success", value: "#16a34a", swatch: "#16a34a" },
  { label: "Danger", value: "#dc2626", swatch: "#dc2626" },
]

export const ENGAGE_DOC_GRADIENTS = [
  {
    label: "NREP Blue → Orange",
    value: "linear-gradient(90deg, #176F91 0%, #EFA74F 100%)",
  },
  {
    label: "NREP Blue depth",
    value: "linear-gradient(90deg, #0B5E78 0%, #176F91 55%, #2E9ECC 100%)",
  },
  {
    label: "NREP Orange glow",
    value: "linear-gradient(90deg, #B45309 0%, #EFA74F 55%, #F5C078 100%)",
  },
]

export const ENGAGE_DOC_HIGHLIGHTS = [
  { label: "None", value: "" },
  { label: "NREP Blue soft", value: "#d7eef7" },
  { label: "NREP Orange soft", value: "#fcebda" },
  { label: "Yellow", value: "#fff59d" },
  { label: "Green soft", value: "#dcfce7" },
  { label: "Pink soft", value: "#fce7f3" },
]

export const IMAGE_SIZE_PRESETS = {
  xs: { label: "Logo", maxWidth: "72px" },
  sm: { label: "Small", maxWidth: "240px" },
  md: { label: "Medium", maxWidth: "420px" },
  lg: { label: "Large", maxWidth: "540px" },
  full: { label: "Full width", maxWidth: "100%" },
  custom: { label: "Custom", maxWidth: "420px" },
}

/** Stable pixel widths for presets — used in HTML, on-screen, and Word/PDF export. */
export const IMAGE_SIZE_WIDTH_PX = {
  xs: 72,
  sm: 240,
  md: 420,
  lg: 540,
  full: 620,
  custom: 420,
}

export function presetWidthPx(size) {
  const key = IMAGE_SIZE_WIDTH_PX[size] ? size : "md"
  return IMAGE_SIZE_WIDTH_PX[key]
}

/**
 * Lock every report photo to an explicit pixel width so sizes do not drift
 * when the review layout is narrower than the editor, or when Word export runs.
 * Photos keep their natural aspect ratio — never stretched or squashed.
 */
export function lockEngageFigureDisplaySizes(html) {
  if (typeof html !== "string" || !html || typeof DOMParser === "undefined") return html
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html")
    let changed = false
    doc.body.querySelectorAll("figure[data-engage-figure], figure.engage-word-figure").forEach((figure) => {
      const isLogo =
        figure.getAttribute("data-engage-logo") === "true" ||
        figure.classList.contains("engage-word-figure--xs") ||
        figure.querySelector('img[alt="NREP"]')
      if (isLogo) return

      const img = figure.querySelector("img")
      const sizeRaw = String(figure.getAttribute("data-size") || "").trim()
      const size = IMAGE_SIZE_PRESETS[sizeRaw] ? sizeRaw : img?.getAttribute("src") ? "md" : sizeRaw || "md"
      const widthAttr = parseInt(figure.getAttribute("data-width") || "", 10)
      const style = String(figure.getAttribute("style") || "")
      const styleMatch = style.match(/(?:^|;)\s*(?:max-)?width:\s*(\d+(?:\.\d+)?)px/i)
      const styleWidth = styleMatch ? Math.round(Number(styleMatch[1])) : 0
      const locked =
        Number.isFinite(widthAttr) && widthAttr > 0
          ? widthAttr
          : styleWidth > 0
            ? styleWidth
            : presetWidthPx(size === "custom" ? "md" : size)

      if (String(figure.getAttribute("data-size") || "") !== size) {
        figure.setAttribute("data-size", size)
        changed = true
      }
      if (String(figure.getAttribute("data-width") || "") !== String(locked)) {
        figure.setAttribute("data-width", String(locked))
        changed = true
      }
      figure.style.setProperty("--engage-fig-w", `${locked}px`)

      // Fixed display width (chosen size). Parent scrolls if the column is narrower —
      // do not shrink photos to “fit” the review sidebar layout.
      const isFull = size === "full"
      const nextStyle = isFull
        ? `width:${locked}px;max-width:100%;margin:0.85rem auto;text-align:center;clear:both;--engage-fig-w:${locked}px;`
        : `width:${locked}px;max-width:${locked}px;margin:0.85rem auto;text-align:center;clear:both;--engage-fig-w:${locked}px;`
      if (String(figure.getAttribute("style") || "").replace(/\s+/g, "") !== nextStyle.replace(/\s+/g, "")) {
        figure.setAttribute("style", nextStyle)
        changed = true
      }

      const sizeClass = `engage-word-figure--${size === "custom" ? "custom" : size}`
      const classes = new Set(
        String(figure.getAttribute("class") || "")
          .split(/\s+/)
          .filter(Boolean)
          .filter((c) => !/^engage-word-figure--/.test(c))
      )
      classes.add("engage-word-figure")
      if (!img?.getAttribute("src") && figure.getAttribute("data-empty-slot") === "true") {
        classes.add("engage-word-figure--slot")
      }
      classes.add(sizeClass)
      const classStr = Array.from(classes).join(" ")
      if (String(figure.getAttribute("class") || "") !== classStr) {
        figure.setAttribute("class", classStr)
        changed = true
      }

      if (img?.getAttribute("src")) {
        // HTML width/height attrs create a fake aspect-ratio and cause squashing
        // when CSS width differs — strip them and size with CSS only.
        if (img.hasAttribute("width") || img.hasAttribute("height")) {
          img.removeAttribute("width")
          img.removeAttribute("height")
          changed = true
        }
        const imgStyle =
          "display:block;width:100%;max-width:100%;height:auto;object-fit:contain;object-position:center;margin:0 auto;border-radius:4px;"
        if (String(img.getAttribute("style") || "").replace(/\s+/g, "") !== imgStyle.replace(/\s+/g, "")) {
          img.setAttribute("style", imgStyle)
          changed = true
        }
        if (figure.getAttribute("data-empty-slot") === "true") {
          figure.removeAttribute("data-empty-slot")
          changed = true
        }
      }
    })
    return changed ? doc.body.innerHTML : html
  } catch {
    return html
  }
}

const TRANSPARENT_TEXT_COLOR_RE =
  /(?:^|;)\s*color\s*:\s*transparent\s*;?/gi

function isInvisibleTextColor(raw = "") {
  const c = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/['"]+/g, "")
  if (!c) return false
  if (c === "transparent" || c === "white" || c === "#fff" || c === "#ffffff") return true
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("")
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return r > 245 && g > 245 && b > 245
  }
  const rgb = c.match(/^rgba?\((\d+),(\d+),(\d+)/)
  if (rgb) {
    return Number(rgb[1]) > 245 && Number(rgb[2]) > 245 && Number(rgb[3]) > 245
  }
  return false
}

/**
 * Strip invisible text colors so drafts don't reopen as blank white-on-white pages.
 * Do not rewrite the rest of the saved document.
 */
export function sanitizeEngageDocumentHtml(html) {
  if (typeof html !== "string" || !html) return html
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(TRANSPARENT_TEXT_COLOR_RE, ";")
  }

  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    doc.body.querySelectorAll("[style]").forEach((el) => {
      const style = el.getAttribute("style") || ""
      if (el.hasAttribute("data-text-gradient") || /background-clip\s*:\s*text/i.test(style)) {
        return
      }
      let cleaned = style
      if (/color\s*:\s*transparent/i.test(cleaned)) {
        cleaned = cleaned.replace(TRANSPARENT_TEXT_COLOR_RE, ";")
      }
      cleaned = cleaned.replace(/(?:^|;)\s*color\s*:\s*([^;]+)\s*/gi, (match, value, offset, full) => {
        // Do not treat background-color / border-color as text colour.
        const before = String(full || "").slice(Math.max(0, offset - 12), offset)
        if (/background-$/i.test(before) || /border-$/i.test(before) || /outline-$/i.test(before)) {
          return match
        }
        return isInvisibleTextColor(value) ? ";" : match
      })
      cleaned = cleaned.replace(/;;+/g, ";").replace(/^;|;$/g, "").trim()
      if (cleaned) el.setAttribute("style", cleaned)
      else el.removeAttribute("style")
    })
    return lockEngageFigureDisplaySizes(doc.body.innerHTML)
  } catch {
    return html.replace(TRANSPARENT_TEXT_COLOR_RE, ";")
  }
}

/** TipTap Color, but ignore transparent fills left by gradient spans (invisible text on reload). */
export const SafeColor = Extension.create({
  name: "color",
  addOptions() {
    return { types: ["textStyle"] }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => {
              if (element?.getAttribute?.("data-text-gradient")) return null
              const raw = element?.style?.color?.replace(/['"]+/g, "") || ""
              if (!raw) return null
              if (raw.toLowerCase() === "transparent") return null
              if (isInvisibleTextColor(raw)) return null
              return raw
            },
            renderHTML: (attributes) => {
              if (!attributes.color) return {}
              return { style: `color: ${attributes.color}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setColor:
        (color) =>
        ({ chain }) => {
          if (!color || String(color).toLowerCase() === "transparent" || isInvisibleTextColor(color)) {
            return chain().setMark("textStyle", { color: null }).removeEmptyTextStyle().run()
          }
          return chain().setMark("textStyle", { color }).run()
        },
      unsetColor:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { color: null }).removeEmptyTextStyle().run(),
    }
  },
})

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})

export const FontFamily = Extension.create({
  name: "fontFamily",
  addOptions() {
    return { types: ["textStyle"] }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => element.style.fontFamily || null,
            renderHTML: (attributes) => {
              if (!attributes.fontFamily) return {}
              return { style: `font-family: ${attributes.fontFamily}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontFamily:
        (fontFamily) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily }).run(),
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run(),
    }
  },
})

/** Word-like paragraph / heading border presets (Borders & Shading). */
export const PARA_BORDER_PRESETS = [
  { id: "none", label: "No Border" },
  { id: "box", label: "Box" },
  { id: "outline", label: "Outside" },
  { id: "bottom", label: "Bottom" },
  { id: "top", label: "Top" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "double-bottom", label: "Double bottom" },
]

function paraBorderCss(preset, color = "#334155") {
  const c = color || "#334155"
  switch (String(preset || "")) {
    case "box":
    case "outline":
      return `border: 1.5pt solid ${c}; padding: 0.4rem 0.55rem;`
    case "bottom":
      return `border: none; border-bottom: 1.5pt solid ${c}; padding-bottom: 0.3rem;`
    case "top":
      return `border: none; border-top: 1.5pt solid ${c}; padding-top: 0.3rem;`
    case "left":
      return `border: none; border-left: 3pt solid ${c}; padding-left: 0.55rem;`
    case "right":
      return `border: none; border-right: 3pt solid ${c}; padding-right: 0.55rem;`
    case "double-bottom":
      return `border: none; border-bottom: 3pt double ${c}; padding-bottom: 0.35rem;`
    default:
      return ""
  }
}

function activeBlockType(state) {
  const name = state?.selection?.$from?.parent?.type?.name
  if (name === "paragraph" || name === "heading") return name
  return null
}

/**
 * Word-like: with only a caret in a title/paragraph, format the whole line —
 * TipTap marks alone only affect the next typed character.
 */
export function expandSelectionToTextBlock(editor) {
  if (!editor || editor.isDestroyed) return false
  const { selection } = editor.state
  if (!selection.empty) return true
  const { $from } = selection
  const parent = $from.parent
  if (!parent?.isTextblock) return false
  const from = $from.start()
  const to = $from.end()
  if (from >= to) return false
  return editor.commands.setTextSelection({ from, to })
}

/** Restore a prior range, or expand an empty caret to its paragraph/heading. */
export function restoreOrExpandTextSelection(editor, saved = null) {
  if (!editor || editor.isDestroyed) return false
  if (saved && typeof saved.from === "number" && typeof saved.to === "number" && saved.to > saved.from) {
    const size = editor.state.doc.content.size
    const from = Math.max(0, Math.min(saved.from, size))
    const to = Math.max(from, Math.min(saved.to, size))
    if (to > from) {
      editor.commands.setTextSelection({ from, to })
      return true
    }
  }
  return expandSelectionToTextBlock(editor)
}

/**
 * Apply font/size/color so report heads (and any line) actually change:
 * marks on the text + block attrs so sheet CSS cannot pin heading defaults.
 */
export function applyEngageTextAppearance(editor, patch = {}, savedSelection = null) {
  if (!editor || editor.isDestroyed) return false

  const selection = editor.state.selection
  const inCellSelection = typeof selection.forEachCell === "function"

  // Cell selections cannot take text marks directly — format each cell’s text instead.
  if (inCellSelection) {
    const ranges = []
    selection.forEachCell((node, pos) => {
      const from = pos + 1
      const to = pos + node.nodeSize - 1
      if (to > from) ranges.push({ from, to })
    })
    if (!ranges.length) return false

    let chain = editor.chain().focus()
    for (const range of ranges) {
      chain = chain.setTextSelection(range)
      if (patch.clearGradient && typeof editor.commands.unsetTextGradient === "function") {
        chain = chain.unsetTextGradient()
      }
      if (patch.clearColor) chain = chain.unsetColor()
      if (patch.fontFamily !== undefined) {
        const fontFamily = String(patch.fontFamily || "").trim() || null
        chain = fontFamily ? chain.setFontFamily(fontFamily) : chain.unsetFontFamily()
      }
      if (patch.fontSize !== undefined) {
        const fontSize = String(patch.fontSize || "").trim() || null
        chain = fontSize ? chain.setFontSize(fontSize) : chain.unsetFontSize()
      }
      if (patch.color !== undefined && !patch.clearColor) {
        const color = String(patch.color || "").trim() || null
        chain = color ? chain.setColor(color) : chain.unsetColor()
      }
    }
    return chain.run()
  }

  restoreOrExpandTextSelection(editor, savedSelection)

  const fontFamily =
    patch.fontFamily === undefined ? undefined : String(patch.fontFamily || "").trim() || null
  const fontSize =
    patch.fontSize === undefined ? undefined : String(patch.fontSize || "").trim() || null
  const color = patch.color === undefined ? undefined : String(patch.color || "").trim() || null
  const clearColor = Boolean(patch.clearColor)
  const clearGradient = Boolean(patch.clearGradient)

  let chain = editor.chain().focus()

  if (clearGradient && typeof editor.commands.unsetTextGradient === "function") {
    chain = chain.unsetTextGradient()
  }
  if (clearColor) {
    chain = chain.unsetColor()
  }

  if (fontFamily !== undefined) {
    if (!fontFamily) chain = chain.unsetFontFamily()
    else chain = chain.setFontFamily(fontFamily)
  }
  if (fontSize !== undefined) {
    if (!fontSize) chain = chain.unsetFontSize()
    else chain = chain.setFontSize(fontSize)
  }
  if (color !== undefined && !clearColor) {
    if (!color) chain = chain.unsetColor()
    else chain = chain.setColor(color)
  }

  // Block attrs are for titles/paragraphs — skip inside table cells so cell
  // shading/borders are not fighting paragraph-level colour.
  const inTableCell = findTableCellDepth(editor.state.selection.$from) > 0
  const blockType = !inTableCell ? activeBlockType(editor.state) : null
  if (blockType) {
    const blockPatch = {}
    if (fontFamily !== undefined) blockPatch.blockFontFamily = fontFamily
    if (fontSize !== undefined) blockPatch.blockFontSize = fontSize
    if (clearColor) blockPatch.blockColor = null
    else if (color !== undefined) blockPatch.blockColor = color
    if (Object.keys(blockPatch).length) {
      chain = chain.updateAttributes(blockType, blockPatch)
    }
  }

  return chain.run()
}

/**
 * Keep data-field on report heads + allow block-level font/size/color so
 * official-sheet CSS (forced h1 size/color) cannot ignore author formatting.
 */
function buildBlockAppearanceHtmlAttrs(attributes = {}) {
  const out = {}
  const parts = []
  if (attributes.blockFontFamily) {
    out["data-font-family"] = attributes.blockFontFamily
    parts.push(`font-family: ${attributes.blockFontFamily}`)
  }
  if (attributes.blockFontSize) {
    out["data-font-size"] = attributes.blockFontSize
    parts.push(`font-size: ${attributes.blockFontSize}`)
  }
  if (attributes.blockColor) {
    out["data-font-color"] = attributes.blockColor
    // !important so official-sheet / inherit rules cannot pin report heads to black.
    parts.push(`color: ${attributes.blockColor} !important`)
  }
  if (parts.length) out.style = parts.join("; ")
  return out
}

export const BlockTextStyle = Extension.create({
  name: "blockTextStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          dataField: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-field") || null,
            renderHTML: (attributes) =>
              attributes.dataField ? { "data-field": attributes.dataField } : {},
          },
          blockFontFamily: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-font-family") ||
              (element.style?.fontFamily ? String(element.style.fontFamily).trim() : null) ||
              null,
            // Emit full appearance bundle so font/size/color never overwrite each other.
            renderHTML: (attributes) =>
              attributes.blockFontFamily || attributes.blockFontSize || attributes.blockColor
                ? buildBlockAppearanceHtmlAttrs(attributes)
                : {},
          },
          blockFontSize: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-font-size") ||
              (element.style?.fontSize ? String(element.style.fontSize).trim() : null) ||
              null,
            renderHTML: (attributes) =>
              attributes.blockFontFamily || attributes.blockFontSize || attributes.blockColor
                ? buildBlockAppearanceHtmlAttrs(attributes)
                : {},
          },
          blockColor: {
            default: null,
            parseHTML: (element) => {
              if (element.getAttribute("data-text-gradient")) return null
              const fromData = element.getAttribute("data-font-color")
              if (fromData) return fromData
              const raw = element.style?.color ? String(element.style.color).trim() : ""
              if (!raw || raw.toLowerCase() === "transparent") return null
              if (isInvisibleTextColor(raw)) return null
              return raw || null
            },
            renderHTML: (attributes) =>
              attributes.blockFontFamily || attributes.blockFontSize || attributes.blockColor
                ? buildBlockAppearanceHtmlAttrs(attributes)
                : {},
          },
        },
      },
    ]
  },
})

export const ParagraphBorders = Extension.create({
  name: "paragraphBorders",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          paraFrame: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-para-border") || null,
            renderHTML: (attributes) => {
              const preset = attributes.paraFrame
              if (!preset || preset === "none") return {}
              const color = attributes.paraBorderColor || "#334155"
              const css = paraBorderCss(preset, color)
              return {
                "data-para-border": preset,
                ...(attributes.paraBorderColor
                  ? { "data-para-border-color": attributes.paraBorderColor }
                  : {}),
                ...(css ? { style: css } : {}),
                class: "engage-para-bordered",
              }
            },
          },
          paraBorderColor: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-para-border-color") || null,
            // Rendered together with paraFrame so styles do not clobber each other.
            renderHTML: () => ({}),
          },
          paraShading: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-para-shading") ||
              element.style?.backgroundColor ||
              null,
            renderHTML: (attributes) => {
              if (!attributes.paraShading) return {}
              return {
                "data-para-shading": attributes.paraShading,
                style: `background-color: ${attributes.paraShading}`,
              }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setParagraphBorderPreset:
        (preset) =>
        ({ state, commands }) => {
          const type = activeBlockType(state)
          if (!type) return false
          const next = !preset || preset === "none" ? null : preset
          return commands.updateAttributes(type, { paraFrame: next })
        },
      setParagraphBorderColor:
        (color) =>
        ({ state, commands }) => {
          const type = activeBlockType(state)
          if (!type) return false
          const attrs = state.selection.$from.parent.attrs || {}
          const preset = attrs.paraFrame || "box"
          return commands.updateAttributes(type, {
            paraBorderColor: color || null,
            paraFrame: preset,
          })
        },
      setParagraphShading:
        (color) =>
        ({ state, commands }) => {
          const type = activeBlockType(state)
          if (!type) return false
          return commands.updateAttributes(type, { paraShading: color || null })
        },
      clearParagraphBorders:
        () =>
        ({ state, commands }) => {
          const type = activeBlockType(state)
          if (!type) return false
          return commands.updateAttributes(type, {
            paraFrame: null,
            paraBorderColor: null,
            paraShading: null,
          })
        },
    }
  },
})

/** Word-like cell shading / border controls for tables. */
export const TABLE_BORDER_PRESETS = [
  { id: "all", label: "All borders" },
  { id: "outside", label: "Outside" },
  { id: "inside", label: "Inside" },
  { id: "none", label: "No border" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
]

function cellBorderCss(preset, color = "#475569", width = "1px") {
  const c = color || "#475569"
  const w = width || "1px"
  switch (String(preset || "all")) {
    case "none":
      return `border: none !important`
    case "outside":
    case "all":
      return `border: ${w} solid ${c} !important`
    case "top":
      return `border-style: solid !important; border-width: ${w} 0 0 0 !important; border-color: ${c} !important`
    case "bottom":
      return `border-style: solid !important; border-width: 0 0 ${w} 0 !important; border-color: ${c} !important`
    case "left":
      return `border-style: solid !important; border-width: 0 0 0 ${w} !important; border-color: ${c} !important`
    case "right":
      return `border-style: solid !important; border-width: 0 ${w} 0 0 !important; border-color: ${c} !important`
    case "inside":
      return `border: ${w} solid ${c} !important`
    default:
      return `border: ${w} solid ${c} !important`
  }
}

/** One style string per cell so border/shading/align never clobber each other. */
function buildCellStyleAttrs(attributes = {}) {
  const styles = []
  const html = {}

  if (attributes.backgroundColor) {
    html["data-cell-bg"] = attributes.backgroundColor
    styles.push(`background-color: ${attributes.backgroundColor} !important`)
  }
  if (attributes.borderPreset) {
    html["data-cell-border"] = attributes.borderPreset
    if (attributes.borderColor) html["data-cell-border-color"] = attributes.borderColor
    if (attributes.borderWidth) html["data-cell-border-width"] = attributes.borderWidth
    styles.push(cellBorderCss(attributes.borderPreset, attributes.borderColor, attributes.borderWidth))
  }
  if (attributes.verticalAlign) {
    html["data-valign"] = attributes.verticalAlign
    styles.push(`vertical-align: ${attributes.verticalAlign}`)
  }
  if (styles.length) html.style = styles.filter(Boolean).join("; ")
  return html
}

function dataOnlyCellAttrs(attributes = {}) {
  const html = {}
  if (attributes.backgroundColor) html["data-cell-bg"] = attributes.backgroundColor
  if (attributes.borderPreset) html["data-cell-border"] = attributes.borderPreset
  if (attributes.borderColor) html["data-cell-border-color"] = attributes.borderColor
  if (attributes.borderWidth) html["data-cell-border-width"] = attributes.borderWidth
  if (attributes.verticalAlign) html["data-valign"] = attributes.verticalAlign
  return html
}

function findTableCellDepth($pos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth)?.type?.name
    if (name === "tableCell" || name === "tableHeader") return depth
  }
  return -1
}

/** Patch every selected table cell (or the cell around the caret) in one transaction. */
function patchSelectedTableCells(state, dispatch, patch = {}) {
  const { selection, doc, schema } = state
  const cells = []

  if (typeof selection.forEachCell === "function") {
    selection.forEachCell((node, pos) => {
      cells.push({ node, pos })
    })
  } else {
    const depth = findTableCellDepth(selection.$from)
    if (depth > 0) {
      const pos = selection.$from.before(depth)
      const node = doc.nodeAt(pos)
      if (node) cells.push({ node, pos })
    }
  }

  if (!cells.length) return false
  if (!dispatch) return true

  let tr = state.tr
  for (const { node, pos } of cells) {
    if (!schema.nodes[node.type.name]) continue
    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...patch,
    })
  }
  dispatch(tr)
  return true
}

export function createEngageTableCell(BaseCell) {
  const tag = BaseCell.name === "tableHeader" ? "th" : "td"
  return BaseCell.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        backgroundColor: {
          default: null,
          parseHTML: (element) =>
            element.getAttribute("data-cell-bg") ||
            element.style?.backgroundColor ||
            null,
          // Data only — consolidated style is emitted from renderHTML below.
          renderHTML: (attributes) =>
            attributes.backgroundColor ? { "data-cell-bg": attributes.backgroundColor } : {},
        },
        borderPreset: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-cell-border") || null,
          renderHTML: (attributes) =>
            attributes.borderPreset ? { "data-cell-border": attributes.borderPreset } : {},
        },
        borderColor: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-cell-border-color") || null,
          renderHTML: (attributes) =>
            attributes.borderColor ? { "data-cell-border-color": attributes.borderColor } : {},
        },
        borderWidth: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-cell-border-width") || null,
          renderHTML: (attributes) =>
            attributes.borderWidth ? { "data-cell-border-width": attributes.borderWidth } : {},
        },
        verticalAlign: {
          default: null,
          parseHTML: (element) =>
            element.style?.verticalAlign || element.getAttribute("data-valign") || null,
          renderHTML: (attributes) =>
            attributes.verticalAlign ? { "data-valign": attributes.verticalAlign } : {},
        },
      }
    },

    renderHTML({ node, HTMLAttributes }) {
      // Emit one style blob here so TipTap attribute merges cannot drop shading when
      // borders/align/colwidth also contribute styles.
      const styleAttrs = buildCellStyleAttrs(node?.attrs || {})
      return [
        tag,
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, styleAttrs, dataOnlyCellAttrs(node?.attrs || {})),
        0,
      ]
    },
  })
}

export const TableCellFormat = Extension.create({
  name: "tableCellFormat",
  addCommands() {
    return {
      setCellShading:
        (color) =>
        ({ state, dispatch }) =>
          patchSelectedTableCells(state, dispatch, {
            backgroundColor: color || null,
          }),
      setCellBorderPreset:
        (preset) =>
        ({ state, dispatch }) => {
          const next = !preset || preset === "all" ? "all" : preset
          return patchSelectedTableCells(state, dispatch, { borderPreset: next })
        },
      setCellBorderColor:
        (color) =>
        ({ state, dispatch }) => {
          let existingPreset = null
          if (typeof state.selection.forEachCell === "function") {
            state.selection.forEachCell((node) => {
              if (!existingPreset && node.attrs?.borderPreset) {
                existingPreset = node.attrs.borderPreset
              }
            })
          } else {
            const depth = findTableCellDepth(state.selection.$from)
            if (depth > 0) {
              existingPreset =
                state.doc.nodeAt(state.selection.$from.before(depth))?.attrs?.borderPreset || null
            }
          }
          const patch = { borderColor: color || null }
          // Colour alone is invisible without a border preset — keep Word-like behaviour.
          if (color && !existingPreset) patch.borderPreset = "all"
          return patchSelectedTableCells(state, dispatch, patch)
        },
      setCellBorderWidth:
        (width) =>
        ({ state, dispatch }) => {
          let existingPreset = null
          if (typeof state.selection.forEachCell === "function") {
            state.selection.forEachCell((node) => {
              if (!existingPreset && node.attrs?.borderPreset) {
                existingPreset = node.attrs.borderPreset
              }
            })
          } else {
            const depth = findTableCellDepth(state.selection.$from)
            if (depth > 0) {
              existingPreset =
                state.doc.nodeAt(state.selection.$from.before(depth))?.attrs?.borderPreset || null
            }
          }
          const patch = { borderWidth: width || null }
          if (width && !existingPreset) patch.borderPreset = "all"
          return patchSelectedTableCells(state, dispatch, patch)
        },
      setCellVerticalAlign:
        (align) =>
        ({ state, dispatch }) =>
          patchSelectedTableCells(state, dispatch, {
            verticalAlign: align || null,
          }),
      clearCellFormatting:
        () =>
        ({ state, dispatch }) =>
          patchSelectedTableCells(state, dispatch, {
            backgroundColor: null,
            borderPreset: null,
            borderColor: null,
            borderWidth: null,
            verticalAlign: null,
          }),
    }
  },
})

/**

 * Own Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z so the browser’s contenteditable undo
 * cannot fight TipTap History (that made undo/redo feel broken in reports).
 */
export const EngageUndoRedoKeys = Extension.create({
  name: "engageUndoRedoKeys",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => {
        if (this.editor.can().undo()) this.editor.commands.undo()
        return true
      },
      "Shift-Mod-z": () => {
        if (this.editor.can().redo()) this.editor.commands.redo()
        return true
      },
      "Mod-y": () => {
        if (this.editor.can().redo()) this.editor.commands.redo()
        return true
      },
    }
  },
})

/** Brand / custom text gradients (NREP blue↔orange and depth variants). */
export const TextGradient = Mark.create({
  name: "textGradient",
  excludes: "textGradient",
  parseHTML() {
    return [
      {
        tag: "span[data-text-gradient]",
        getAttrs: (el) => ({ gradient: el.getAttribute("data-text-gradient") || null }),
      },
    ]
  },
  addAttributes() {
    return {
      gradient: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-text-gradient") || null,
        renderHTML: (attributes) => {
          if (!attributes.gradient) return {}
          return {
            "data-text-gradient": attributes.gradient,
            style: `background-image:${attributes.gradient};-webkit-background-clip:text;background-clip:text;color:transparent;`,
          }
        },
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0]
  },
  addCommands() {
    return {
      setTextGradient:
        (gradient) =>
        ({ commands }) =>
          commands.setMark(this.name, { gradient }),
      unsetTextGradient:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})

/** Image + caption figure with size presets / optional pixel width. Shared by every Engage report template. */
/**
 * Plain TipTap NodeView (no React) — captions stay under the photo and typing does not remount.
 * ReactNodeViewRenderer previously crashed Continue-editing pages in production.
 */
function createEngageImageFigureNodeView({ node, getPos, editor }) {
  const dom = document.createElement("figure")
  dom.setAttribute("data-engage-figure", "true")

  const fileInput = document.createElement("input")
  fileInput.type = "file"
  fileInput.accept = "image/*"
  fileInput.hidden = true

  const frame = document.createElement("div")
  frame.className = "engage-word-figure-frame"

  const img = document.createElement("img")
  img.className = "engage-word-doc-image"
  img.draggable = false

  const slotBtn = document.createElement("button")
  slotBtn.type = "button"
  slotBtn.className = "engage-word-image-slot"
  slotBtn.setAttribute("data-engage-slot-upload", "true")
  slotBtn.innerHTML =
    '<span class="engage-word-image-slot-title"></span><span class="engage-word-image-slot-sub">Click to choose a picture from your computer</span>'

  const captionInput = document.createElement("input")
  captionInput.type = "text"
  captionInput.className = "engage-word-figcaption-input"
  captionInput.setAttribute("aria-label", "Photo caption")
  captionInput.setAttribute("data-engage-caption-input", "true")

  const captionRead = document.createElement("figcaption")
  captionRead.className = "engage-word-figcaption"

  const applyCaptionTypography = (target, attrs = {}) => {
    if (!target) return
    const family = String(attrs.captionFontFamily || "").trim()
    const size = String(attrs.captionFontSize || "").trim()
    target.style.fontFamily = family || ""
    target.style.fontSize = size || ""
    if (family) target.setAttribute("data-caption-font", family)
    else target.removeAttribute("data-caption-font")
    if (size) target.setAttribute("data-caption-size", size)
    else target.removeAttribute("data-caption-size")
  }

  const errorEl = document.createElement("p")
  errorEl.className = "engage-word-image-error"
  errorEl.hidden = true

  const controls = document.createElement("div")
  controls.className = "engage-word-figure-controls"
  controls.contentEditable = "false"

  const sizeSelect = document.createElement("select")
  sizeSelect.title = "Photo size"
  Object.entries(IMAGE_SIZE_PRESETS)
    .filter(([key]) => key !== "custom" && key !== "xs" && key !== "sm")
    .forEach(([key, preset]) => {
      const opt = document.createElement("option")
      opt.value = key
      opt.textContent = preset.label
      sizeSelect.appendChild(opt)
    })
  const customOpt = document.createElement("option")
  customOpt.value = "custom"
  customOpt.textContent = "Custom"
  sizeSelect.appendChild(customOpt)

  const replaceBtn = document.createElement("button")
  replaceBtn.type = "button"
  replaceBtn.textContent = "Replace photo"

  const addAnotherBtn = document.createElement("button")
  addAnotherBtn.type = "button"
  addAnotherBtn.textContent = "Add another photo"
  addAnotherBtn.title = "Insert another empty photo box below this one"

  const addAnotherLink = document.createElement("button")
  addAnotherLink.type = "button"
  addAnotherLink.className = "engage-word-add-photo-link"
  addAnotherLink.textContent = "Add another photo box"
  addAnotherLink.title = "Insert another empty photo box below this one"

  const removeBtn = document.createElement("button")
  removeBtn.type = "button"
  removeBtn.textContent = "Remove"

  controls.appendChild(sizeSelect)
  controls.appendChild(replaceBtn)
  controls.appendChild(addAnotherBtn)
  controls.appendChild(removeBtn)

  let current = node
  let uploading = false
  let selected = false
  let promotedStampSize = false

  const isEditable = () => editor?.isEditable !== false

  const isLogoNode = (n) => {
    const a = n?.attrs || {}
    return (
      Boolean(a.isLogo) ||
      a.alt === "NREP" ||
      a.size === "xs" ||
      /NREP_LOGO|nrep_logo/i.test(String(a.src || ""))
    )
  }

  const writeAttrs = (patch) => {
    if (typeof getPos !== "function") return
    const pos = getPos()
    if (typeof pos !== "number") return
    const next = { ...current.attrs, ...patch }
    editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, next))
  }

  /** Empty slots used to seed as Small; that stamp size is wrong for report photos. */
  const promoteStampSizeIfNeeded = () => {
    if (promotedStampSize || isLogoNode(current)) return
    const attrs = current.attrs || {}
    const src = attrs.src ? String(attrs.src).trim() : ""
    if (!src) return
    const sizeKey = IMAGE_SIZE_PRESETS[attrs.size] ? attrs.size : "md"
    const width = Number(attrs.width) > 0 ? Number(attrs.width) : presetWidthPx(sizeKey)
    if (sizeKey !== "sm" && sizeKey !== "xs" && width > 240) return
    promotedStampSize = true
    writeAttrs({ size: "lg", width: presetWidthPx("lg") })
  }

  const setError = (msg) => {
    if (!msg) {
      errorEl.hidden = true
      errorEl.textContent = ""
      return
    }
    errorEl.hidden = false
    errorEl.textContent = msg
  }

  const paint = () => {
    const attrs = current.attrs || {}
    const logo = isLogoNode(current)
    const src = attrs.src ? String(attrs.src).trim() : ""
    const hasPhoto = Boolean(src)
    const sizeKey = IMAGE_SIZE_PRESETS[attrs.size] ? attrs.size : "md"
    const width =
      Number(attrs.width) > 0
        ? Number(attrs.width)
        : presetWidthPx(sizeKey === "custom" ? "md" : sizeKey)
    const alt = attrs.alt || "Report image"
    const captionHint =
      attrs.captionPlaceholder || "Type caption here (what this photo shows)"
    const editable = isEditable()
    const captionFocused = document.activeElement === captionInput

    dom.className = `engage-word-figure engage-word-figure--${logo ? "xs" : sizeKey}${
      selected ? " is-selected" : ""
    }${hasPhoto ? "" : " engage-word-figure--slot"}`
    dom.setAttribute("data-size", logo ? "xs" : sizeKey)
    if (logo) {
      dom.setAttribute("data-engage-logo", "true")
      dom.removeAttribute("data-empty-slot")
      dom.removeAttribute("data-width")
      dom.style.cssText =
        "max-width:72px;margin:0.85rem auto;text-align:center;clear:both;"
    } else {
      dom.removeAttribute("data-engage-logo")
      if (!hasPhoto) dom.setAttribute("data-empty-slot", "true")
      else dom.removeAttribute("data-empty-slot")
      dom.setAttribute("data-width", String(width))
      dom.setAttribute("data-slot-label", alt)
      dom.setAttribute("data-caption-placeholder", captionHint)
      const capFamily = String(attrs.captionFontFamily || "").trim()
      const capSize = String(attrs.captionFontSize || "").trim()
      if (capFamily) dom.setAttribute("data-caption-font", capFamily)
      else dom.removeAttribute("data-caption-font")
      if (capSize) dom.setAttribute("data-caption-size", capSize)
      else dom.removeAttribute("data-caption-size")
      dom.style.cssText =
        sizeKey === "full"
          ? `width:${width}px;max-width:100%;margin:0.85rem auto;text-align:center;clear:both;--engage-fig-w:${width}px;`
          : `width:${width}px;max-width:${width}px;margin:0.85rem auto;text-align:center;clear:both;--engage-fig-w:${width}px;`
    }

    // Never detach the caption field while the author is typing in it.
    Array.from(dom.childNodes).forEach((child) => {
      if (child === fileInput) return
      if (child === captionInput && captionFocused) return
      child.remove()
    })
    if (!fileInput.isConnected) dom.insertBefore(fileInput, dom.firstChild)

    if (logo && hasPhoto) {
      img.src = src
      img.alt = "NREP"
      img.width = 72
      img.className = "engage-word-doc-image engage-word-logo"
      img.style.cssText =
        "max-width:72px;width:auto;height:auto;display:block;margin:0 auto;"
      dom.appendChild(img)
      return
    }

    img.className = "engage-word-doc-image"
    img.style.cssText =
      "display:block;width:100%;max-width:100%;height:auto;object-fit:contain;object-position:center;margin:0 auto;border-radius:4px;"

    if (!hasPhoto) {
      const title = slotBtn.querySelector(".engage-word-image-slot-title")
      if (title) {
        title.textContent = uploading
          ? "Adding photo…"
          : `Upload photo — ${alt || "Image"}`
      }
      slotBtn.disabled = uploading || !editable
      if (editable) dom.appendChild(slotBtn)
      else {
        const empty = document.createElement("div")
        empty.className = "engage-word-image-slot is-readonly"
        empty.innerHTML = '<span class="engage-word-image-slot-title">No photo added</span>'
        dom.appendChild(empty)
      }
    } else {
      img.src = src
      img.alt = alt
      img.removeAttribute("width")
      frame.replaceChildren(img)
      dom.appendChild(frame)
    }

    // Caption belongs under the photo in the document — never in the toolbar.
    if (!logo) {
      if (editable) {
        captionInput.placeholder = captionHint
        if (!captionFocused) {
          captionInput.value = String(attrs.caption || "")
        }
        applyCaptionTypography(captionInput, attrs)
        if (!captionInput.isConnected) dom.appendChild(captionInput)
        else dom.appendChild(captionInput) // keep after photo/slot
      } else if (String(attrs.caption || "").trim()) {
        captionRead.textContent = String(attrs.caption || "")
        applyCaptionTypography(captionRead, attrs)
        dom.appendChild(captionRead)
      }
    }

    if (editable && selected && !logo) {
      let sizeValue = IMAGE_SIZE_PRESETS[sizeKey] ? sizeKey : "custom"
      if (sizeValue === "sm" || sizeValue === "xs") sizeValue = "lg"
      sizeSelect.value = sizeValue
      customOpt.textContent = `Custom (${width}px)`
      customOpt.hidden = sizeValue !== "custom"
      replaceBtn.hidden = !hasPhoto
      replaceBtn.textContent = hasPhoto ? "Replace photo" : "Upload photo"
      addAnotherBtn.hidden = false
      addAnotherBtn.textContent = "Add another photo"
      removeBtn.textContent = hasPhoto ? "Remove" : "Remove slot"
      dom.appendChild(controls)
    } else if (editable && !logo && !hasPhoto) {
      // Quiet extra-box option on empty slots — no toolbar / cursor placement needed.
      dom.appendChild(addAnotherLink)
    }

    if (!errorEl.hidden) dom.appendChild(errorEl)
  }

  const onPick = async (file) => {
    if (!file || !isEditable() || uploading || isLogoNode(current)) return
    uploading = true
    setError("")
    paint()
    try {
      const uploaded = await uploadEngageImageForEditor(file)
      // Never keep the old Small stamp size for a real report photo.
      writeAttrs({
        src: uploaded.src,
        alt: uploaded.alt || current.attrs?.alt || "Report image",
        size: "lg",
        width: presetWidthPx("lg"),
        isLogo: false,
      })
      promotedStampSize = true
      if (uploaded.warning) setError(uploaded.warning)
    } catch (err) {
      setError(err?.message || "Could not add that image. Try a smaller JPG.")
    } finally {
      uploading = false
      fileInput.value = ""
      paint()
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0]
    if (file) void onPick(file)
  })

  slotBtn.addEventListener("mousedown", (e) => e.preventDefault())
  slotBtn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isEditable() || uploading) return
    fileInput.click()
  })

  captionInput.addEventListener("pointerdown", (e) => e.stopPropagation())
  captionInput.addEventListener("mousedown", (e) => e.stopPropagation())
  captionInput.addEventListener("mouseup", (e) => e.stopPropagation())
  captionInput.addEventListener("click", (e) => {
    e.stopPropagation()
    if (isEditable()) captionInput.focus()
  })
  captionInput.addEventListener("keydown", (e) => e.stopPropagation())
  captionInput.addEventListener("keyup", (e) => e.stopPropagation())
  captionInput.addEventListener("keypress", (e) => e.stopPropagation())
  captionInput.addEventListener("beforeinput", (e) => e.stopPropagation())

  // Keep text in the input while typing — writing attrs on every keystroke
  // bounced HTML into React and remounted the editor (caption felt broken).
  let captionDirty = false
  const commitCaption = () => {
    if (!captionDirty) return
    captionDirty = false
    const next = captionInput.value
    if (String(current.attrs?.caption || "") === next) return
    writeAttrs({ caption: next })
  }
  captionInput.addEventListener("input", () => {
    captionDirty = true
  })
  captionInput.addEventListener("blur", () => {
    commitCaption()
  })
  captionInput.addEventListener("change", () => {
    captionDirty = true
    commitCaption()
  })

  sizeSelect.addEventListener("mousedown", (e) => e.stopPropagation())
  sizeSelect.addEventListener("change", () => {
    const next = sizeSelect.value
    if (next === "custom") return
    writeAttrs({ size: next, width: presetWidthPx(next) })
  })

  replaceBtn.addEventListener("mousedown", (e) => e.preventDefault())
  replaceBtn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    fileInput.click()
  })

  const insertEmptySlotBelow = () => {
    if (!isEditable() || typeof getPos !== "function") return
    commitCaption()
    const pos = getPos()
    if (typeof pos !== "number") return
    const insertAt = pos + current.nodeSize
    const slotLabel = String(current.attrs?.alt || "Photo").replace(/\s+\d+$/, "").trim() || "Photo"
    editor
      .chain()
      .focus()
      .insertContentAt(insertAt, {
        type: "imageFigure",
        attrs: {
          src: "",
          alt: slotLabel,
          caption: "",
          captionPlaceholder:
            current.attrs?.captionPlaceholder || "Type caption here (what this photo shows)",
          size: "lg",
          width: presetWidthPx("lg"),
          isLogo: false,
        },
      })
      .run()
  }

  addAnotherBtn.addEventListener("mousedown", (e) => e.preventDefault())
  addAnotherBtn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    insertEmptySlotBelow()
  })

  addAnotherLink.addEventListener("mousedown", (e) => e.preventDefault())
  addAnotherLink.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    insertEmptySlotBelow()
  })

  removeBtn.addEventListener("mousedown", (e) => e.preventDefault())
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    commitCaption()
    if (typeof getPos !== "function") return
    const pos = getPos()
    if (typeof pos !== "number") return
    editor.view.dispatch(
      editor.view.state.tr.delete(pos, pos + current.nodeSize)
    )
  })

  paint()
  queueMicrotask(() => promoteStampSizeIfNeeded())

  return {
    dom,
    selectNode() {
      selected = true
      promoteStampSizeIfNeeded()
      paint()
    },
    deselectNode() {
      selected = false
      commitCaption()
      paint()
    },
    update(updatedNode) {
      if (updatedNode.type.name !== "imageFigure") return false
      current = updatedNode
      promoteStampSizeIfNeeded()
      paint()
      return true
    },
    ignoreMutation(mutation) {
      if (mutation.type === "selection") return false
      const target = mutation.target
      if (!(target instanceof Node)) return true
      return (
        target === captionInput ||
        captionInput.contains(target) ||
        target === sizeSelect ||
        controls.contains(target) ||
        slotBtn.contains(target) ||
        target === fileInput
      )
    },
    stopEvent(event) {
      const target = event.target
      if (!(target instanceof Element) && !(target instanceof Node)) return false
      const el = target instanceof Element ? target : target.parentElement
      if (!el) return false
      if (el === captionInput || el.closest?.(".engage-word-figcaption-input") === captionInput) {
        return true
      }
      if (el === sizeSelect || controls.contains(el)) return true
      if (el === slotBtn || slotBtn.contains(el)) return true
      if (el === fileInput) return true
      return false
    },
    destroy() {
      commitCaption()
    },
  }
}

export const ImageFigure = Node.create({
  name: "imageFigure",
  group: "block",
  atom: true,
  // Dragging fights caption typing inside the node view.
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      // All visual attrs are serialized only in node renderHTML from node.attrs.
      // TipTap attribute renderHTML replaces the attr name (e.g. size → data-size),
      // so reading HTMLAttributes.size in renderHTML always failed and snapped to md/320.
      src: {
        default: null,
        renderHTML: () => ({}),
      },
      alt: {
        default: "Report image",
        renderHTML: () => ({}),
      },
      caption: {
        default: "",
        renderHTML: () => ({}),
      },
      captionPlaceholder: {
        default: "Type caption here (what this photo shows)",
        renderHTML: () => ({}),
      },
      captionFontFamily: {
        default: null,
        parseHTML: (el) => {
          const cap =
            el.querySelector?.("figcaption") ||
            el.querySelector?.(".engage-word-figcaption-input")
          return (
            el.getAttribute?.("data-caption-font") ||
            cap?.getAttribute?.("data-caption-font") ||
            (cap?.style?.fontFamily ? String(cap.style.fontFamily).trim() : null) ||
            null
          )
        },
        renderHTML: () => ({}),
      },
      captionFontSize: {
        default: null,
        parseHTML: (el) => {
          const cap =
            el.querySelector?.("figcaption") ||
            el.querySelector?.(".engage-word-figcaption-input")
          return (
            el.getAttribute?.("data-caption-size") ||
            cap?.getAttribute?.("data-caption-size") ||
            (cap?.style?.fontSize ? String(cap.style.fontSize).trim() : null) ||
            null
          )
        },
        renderHTML: () => ({}),
      },
      isLogo: {
        default: false,
        parseHTML: (el) => {
          if (el.getAttribute("data-engage-logo") === "true") return true
          const img = el.querySelector?.("img") || (el.tagName === "IMG" ? el : null)
          const alt = img?.getAttribute?.("alt") || ""
          const src = img?.getAttribute?.("src") || ""
          const size = el.getAttribute?.("data-size") || ""
          if (alt === "NREP") return true
          if (/NREP_LOGO|nrep_logo/i.test(src)) return true
          if (size === "xs" && /nrep/i.test(src)) return true
          return false
        },
        renderHTML: () => ({}),
      },
      size: {
        default: "md",
        parseHTML: (el) => {
          const raw = el.getAttribute("data-size") || ""
          return IMAGE_SIZE_PRESETS[raw] ? raw : "md"
        },
        renderHTML: () => ({}),
      },
      width: {
        default: IMAGE_SIZE_WIDTH_PX.md,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-width")
          if (raw) {
            const n = parseInt(raw, 10)
            if (Number.isFinite(n) && n > 0) return n
          }
          const style = String(el.getAttribute("style") || "")
          const match = style.match(/(?:^|;)\s*(?:max-)?width:\s*(\d+(?:\.\d+)?)px/i)
          if (match) {
            const n = Math.round(Number(match[1]))
            if (Number.isFinite(n) && n > 0) return n
          }
          const size = el.getAttribute("data-size") || "md"
          return presetWidthPx(IMAGE_SIZE_PRESETS[size] ? size : "md")
        },
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-engage-figure]",
        getAttrs: (el) => {
          const img = el.querySelector("img")
          const caption =
            el.querySelector("figcaption")?.textContent ||
            el.querySelector(".engage-word-figcaption-input")?.value ||
            el.querySelector(".engage-word-figcaption-input")?.getAttribute("value") ||
            ""
          const widthRaw = el.getAttribute("data-width")
          let width = widthRaw ? parseInt(widthRaw, 10) : null
          const src = img?.getAttribute("src") || null
          if (/\/letterhead\/(?:ecooking|pff)\/|\/snv\.PNG$|\/[1-6]\.png$/i.test(src || "")) return false
          const alt = img?.getAttribute("alt") || el.getAttribute("data-slot-label") || "Report image"
          const sizeRaw = el.getAttribute("data-size") || ""
          const size = IMAGE_SIZE_PRESETS[sizeRaw] ? sizeRaw : width ? "custom" : "md"
          const isLogo =
            el.getAttribute("data-engage-logo") === "true" ||
            alt === "NREP" ||
            /NREP_LOGO|nrep_logo/i.test(src || "")
          if (!Number.isFinite(width) || width <= 0) {
            const style = String(el.getAttribute("style") || "")
            const match = style.match(/(?:^|;)\s*(?:max-)?width:\s*(\d+(?:\.\d+)?)px/i)
            width = match ? Math.round(Number(match[1])) : presetWidthPx(size)
          }
          const capEl =
            el.querySelector("figcaption") || el.querySelector(".engage-word-figcaption-input")
          return {
            src: src && String(src).trim() ? src : null,
            alt,
            caption: isLogo ? "" : caption,
            captionPlaceholder:
              el.getAttribute("data-caption-placeholder") ||
              "Type caption here (what this photo shows)",
            captionFontFamily: isLogo
              ? null
              : el.getAttribute("data-caption-font") ||
                capEl?.getAttribute?.("data-caption-font") ||
                (capEl?.style?.fontFamily ? String(capEl.style.fontFamily).trim() : null) ||
                null,
            captionFontSize: isLogo
              ? null
              : el.getAttribute("data-caption-size") ||
                capEl?.getAttribute?.("data-caption-size") ||
                (capEl?.style?.fontSize ? String(capEl.style.fontSize).trim() : null) ||
                null,
            isLogo,
            size: isLogo ? "xs" : size,
            width: isLogo ? null : width,
          }
        },
      },
      {
        tag: "img[src]",
        getAttrs: (el) => {
          if (el.closest?.("figure[data-engage-figure]")) return false
          if (el.closest?.("[data-engage-letterhead], .engage-letterhead")) return false
          if (el.classList?.contains("engage-letterhead-logo")) return false
          const src = el.getAttribute("src")
          if (/\/letterhead\/(?:ecooking|pff)\/|\/snv\.PNG$|\/[1-6]\.png$/i.test(src || "")) return false
          const alt = el.getAttribute("alt") || "Report image"
          const isLogo = alt === "NREP" || /NREP_LOGO|nrep_logo/i.test(src || "")
          const widthAttr = parseInt(el.getAttribute("width") || "", 10)
          return {
            src,
            alt,
            caption: "",
            captionPlaceholder: "Type caption here (what this photo shows)",
            captionFontFamily: null,
            captionFontSize: null,
            isLogo,
            size: isLogo ? "xs" : "md",
            width: isLogo
              ? null
              : Number.isFinite(widthAttr) && widthAttr > 0
                ? widthAttr
                : presetWidthPx("md"),
          }
        },
      },
    ]
  },

  renderHTML({ node }) {
    const attrs = node.attrs || {}
    const isLogo = Boolean(attrs.isLogo)
    const size = isLogo
      ? "xs"
      : IMAGE_SIZE_PRESETS[attrs.size]
        ? attrs.size
        : "md"
    const width = !isLogo
      ? Number(attrs.width) > 0
        ? Number(attrs.width)
        : presetWidthPx(size)
      : null
    const caption = isLogo ? "" : String(attrs.caption || "").trim()
    const src = attrs.src ? String(attrs.src).trim() : ""
    const alt = attrs.alt || "Report image"
    const captionPlaceholder =
      attrs.captionPlaceholder || "Type caption here (what this photo shows)"
    const captionFontFamily = String(attrs.captionFontFamily || "").trim()
    const captionFontSize = String(attrs.captionFontSize || "").trim()
    const captionStyleParts = [
      "margin-top:0.4rem",
      "color:#64748b",
      "font-style:italic",
      "text-align:center",
      captionFontSize ? `font-size:${captionFontSize}` : "font-size:0.82rem",
      captionFontFamily ? `font-family:${captionFontFamily}` : null,
    ].filter(Boolean)
    const captionHtmlAttrs = {
      class: "engage-word-figcaption",
      style: captionStyleParts.join(";"),
      ...(captionFontFamily ? { "data-caption-font": captionFontFamily } : {}),
      ...(captionFontSize ? { "data-caption-size": captionFontSize } : {}),
    }
    const figureCaptionData = {
      ...(captionFontFamily ? { "data-caption-font": captionFontFamily } : {}),
      ...(captionFontSize ? { "data-caption-size": captionFontSize } : {}),
    }

    if (isLogo && src) {
      return [
        "figure",
        {
          "data-engage-figure": "true",
          "data-engage-logo": "true",
          "data-size": "xs",
          class: "engage-word-figure engage-word-figure--xs",
          style: "max-width:72px;margin:0.85rem auto;text-align:center;clear:both;",
        },
        [
          "img",
          {
            src,
            alt: "NREP",
            width: "72",
            class: "engage-word-doc-image engage-word-logo",
            style: "max-width:72px;width:auto;height:auto;display:block;margin:0 auto;",
          },
        ],
      ]
    }

    if (!src) {
      const slotW = width || presetWidthPx("md")
      const slotLabel = alt || "Photo"
      return [
        "figure",
        {
          "data-engage-figure": "true",
          "data-empty-slot": "true",
          "data-size": size,
          "data-width": String(slotW),
          "data-caption-placeholder": captionPlaceholder,
          "data-slot-label": slotLabel,
          class: "engage-word-figure engage-word-figure--slot engage-word-figure--" + size,
          style:
            "max-width:" +
            slotW +
            "px;width:" +
            slotW +
            "px;margin:0.85rem auto;text-align:center;clear:both;",
          ...figureCaptionData,
        },
        [
          "div",
          {
            class: "engage-word-image-slot",
            "data-engage-slot-upload": "true",
            contenteditable: "false",
          },
          [
            "span",
            { class: "engage-word-image-slot-title" },
            `Upload photo — ${slotLabel}`,
          ],
          [
            "span",
            { class: "engage-word-image-slot-sub" },
            "Click to choose a picture from your computer",
          ],
        ],
        caption
          ? ["figcaption", captionHtmlAttrs, caption]
          : [
              "div",
              {
                class: "engage-word-image-slot-caption-hint",
                contenteditable: "false",
              },
              "Type the caption under the photo after you upload it.",
            ],
      ]
    }

    const children = [
      [
        "img",
        {
          src,
          alt,
          class: "engage-word-doc-image",
          style:
            "display:block;width:100%;max-width:100%;height:auto;object-fit:contain;object-position:center;margin:0 auto;border-radius:4px;",
        },
      ],
    ]
    if (caption) {
      children.push(["figcaption", captionHtmlAttrs, caption])
    }
    return [
      "figure",
      {
        "data-engage-figure": "true",
        "data-size": size,
        "data-width": String(width),
        "data-caption-placeholder": captionPlaceholder,
        class: "engage-word-figure engage-word-figure--" + size,
        style:
          size === "full"
            ? `width:${width}px;max-width:100%;margin:0.85rem auto;text-align:center;clear:both;--engage-fig-w:${width}px;`
            : `width:${width}px;max-width:${width}px;margin:0.85rem auto;text-align:center;clear:both;--engage-fig-w:${width}px;`,
        ...figureCaptionData,
      },
      ...children,
    ]
  },

  addNodeView() {
    return createEngageImageFigureNodeView
  },

  addCommands() {
    return {
      setImageFigure:
        (attrs = {}) =>
        ({ commands }) => {
          const size = IMAGE_SIZE_PRESETS[attrs.size] ? attrs.size : "md"
          const width = attrs.width > 0 ? Number(attrs.width) : presetWidthPx(size)
          return commands.insertContent({
            type: this.name,
            attrs: {
              alt: "Report image",
              caption: "",
              captionPlaceholder: "Type caption here (what this photo shows)",
              isLogo: false,
              ...attrs,
              size,
              width,
            },
          })
        },
      updateImageFigure:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    }
  },
})

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }]
  },

  renderHTML() {
    return [
      "div",
      {
        "data-page-break": "true",
        class: "engage-word-page-break",
        contenteditable: "false",
      },
      ["span", {}, "Page break"],
    ]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },
})

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file && file.size > 8 * 1024 * 1024) {
      reject(new Error("Image is larger than 8MB. Choose a smaller file."))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Could not read image file"))
    reader.readAsDataURL(file)
  })
}

/** Downscale large photos so report saves stay reliable (always prefer compact JPEG). */
export async function optimizeImageFile(file, { maxWidth = 800, quality = 0.52 } = {}) {
  if (!file || typeof window === "undefined") return file
  if (!file.type?.startsWith("image/")) return file
  if (file.type.includes("svg")) return file

  const dataUrl = await readFileAsDataUrl(file)
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error("Could not process image"))
    el.src = dataUrl
  })

  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return file

  const scale = Math.min(1, maxWidth / width)
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))

  // Tiny already — keep original only if under ~120KB
  if (scale >= 1 && file.size < 120 * 1024) return file

  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) return file
  // Honor EXIF orientation so phone photos are not sideways/squashed after compress
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, targetW, targetH)

  // Always JPEG for report photos — much smaller than PNG screenshots
  let q = quality
  let blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", q)
  })
  // If still large, compress harder
  if (blob && blob.size > 350 * 1024) {
    q = 0.45
    blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", q)
    })
  }
  if (blob && blob.size > 450 * 1024 && Math.max(targetW, targetH) > 720) {
    const shrink = 720 / Math.max(targetW, targetH)
    const w2 = Math.max(1, Math.round(targetW * shrink))
    const h2 = Math.max(1, Math.round(targetH * shrink))
    canvas.width = w2
    canvas.height = h2
    ctx.drawImage(img, 0, 0, w2, h2)
    blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.45)
    })
  }
  if (!blob) return file

  const name = String(file.name || "image").replace(/\.\w+$/, ".jpg")
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() })
}

/**
 * Upload an optimized image to Engage storage and return a same-origin media URL.
 * If Appwrite storage createFile is down, keep a compressed data URL so drafts still save.
 */
export async function uploadEngageImageForEditor(file) {
  const optimized = await optimizeImageFile(file)
  const form = new FormData()
  form.append("file", optimized, optimized.name || "photo.jpg")

  let response
  try {
    response = await fetch("/api/engage/media", {
      method: "POST",
      credentials: "include",
      body: form,
    })
  } catch (err) {
    // Network down — still allow a compact inline photo
    if (optimized.size <= 220 * 1024) {
      return {
        src: await readFileAsDataUrl(optimized),
        alt: optimized.name || file.name || "Report image",
        uploaded: false,
        inlineFallback: true,
        warning:
          "Could not reach storage. Photo kept compressed in the draft — Save draft may still work.",
      }
    }
    throw new Error(
      "Could not reach the server to upload the photo. Check that the app is running, then try again."
    )
  }

  const payload = await response.json().catch(() => null)
  const data = payload?.data || payload
  if (response.ok && data?.url) {
    return {
      src: data.url,
      alt: optimized.name || file.name || "Report image",
      uploaded: true,
      fileId: data.fileId,
      bucketId: data.bucketId,
    }
  }

  const apiError = String(payload?.error || data?.error || "").trim()
  const storageDown =
    response.status === 502 ||
    payload?.code === "storage_server_error" ||
    /storage is temporarily unable|createFile/i.test(apiError)

  // Real storage outage — keep a compressed JPEG inline when small enough
  if (storageDown && optimized.size <= 220 * 1024) {
    return {
      src: await readFileAsDataUrl(optimized),
      alt: optimized.name || file.name || "Report image",
      uploaded: false,
      inlineFallback: true,
      warning:
        "Photo storage had a temporary problem, so this photo was compressed and kept in the draft. Save draft should still work for a few small photos. Try uploading again in a moment.",
    }
  }

  // Auth / other failures should not pretend storage is down
  if (response.status === 401 || response.status === 403) {
    throw new Error("Your session expired. Refresh the page, sign in again, then add the photo.")
  }

  if (optimized.size <= 220 * 1024 && response.status >= 500) {
    return {
      src: await readFileAsDataUrl(optimized),
      alt: optimized.name || file.name || "Report image",
      uploaded: false,
      inlineFallback: true,
      warning:
        apiError ||
        "Could not upload the photo to storage just now. It was compressed and kept in the draft — try Save draft, then re-upload if needed.",
    }
  }

  throw new Error(
    apiError ||
      "Could not upload the photo. Try a smaller JPG, or save draft and try again."
  )
}

/** Collect image files from paste or drag-and-drop. */
export function collectImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return []
  const files = []
  const seen = new Set()

  const push = (file) => {
    if (!file || !file.type?.startsWith("image/")) return
    const key = `${file.name}-${file.size}-${file.lastModified}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }

  if (dataTransfer.files?.length) {
    Array.from(dataTransfer.files).forEach(push)
  }

  if (dataTransfer.items?.length) {
    Array.from(dataTransfer.items).forEach((item) => {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        push(item.getAsFile())
      }
    })
  }

  return files
}

export async function insertEngageImagesFromFiles(editor, files, { size = "lg" } = {}) {
  if (!editor || editor.isDestroyed || !files?.length) return 0
  const nextSize = IMAGE_SIZE_PRESETS[size] && size !== "sm" && size !== "xs" ? size : "lg"
  let inserted = 0
  for (const raw of files) {
    const uploaded = await uploadEngageImageForEditor(raw)
    editor
      .chain()
      .focus()
      .setImageFigure({
        src: uploaded.src,
        alt: uploaded.alt || "Report image",
        caption: "",
        size: nextSize,
        width: presetWidthPx(nextSize),
      })
      .run()
    inserted += 1
  }
  return inserted
}

/** Resolve a TipTap imageFigure node from a DOM figure / slot click target. */
export function resolveImageFigurePosFromDom(view, domNode) {
  if (!view || !domNode) return null
  const figure =
    typeof domNode.closest === "function"
      ? domNode.closest("figure[data-engage-figure]")
      : null
  const target =
    figure ||
    (domNode.matches?.("figure[data-engage-figure]") ? domNode : null)
  if (!target) return null

  try {
    const pos = view.posAtDOM(target, 0)
    const direct = view.state.doc.nodeAt(pos)
    if (direct?.type?.name === "imageFigure") return { pos, node: direct }

    const beforePos = Math.max(0, pos - 1)
    const before = view.state.doc.nodeAt(beforePos)
    if (before?.type?.name === "imageFigure") return { pos: beforePos, node: before }

    const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size))
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth)
      if (node?.type?.name === "imageFigure") {
        return { pos: $pos.before(depth), node }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** When a photo caption is focused (or its figure selected), Home font/size applies to the caption. */
export function getCaptionFormatTarget(editor) {
  if (!editor || editor.isDestroyed || typeof document === "undefined") return null
  const active = document.activeElement
  if (
    active instanceof HTMLElement &&
    (active.matches?.("[data-engage-caption-input]") ||
      active.classList?.contains("engage-word-figcaption-input"))
  ) {
    const hit = resolveImageFigurePosFromDom(editor.view, active)
    if (hit?.node && !hit.node.attrs?.isLogo) {
      return { ...hit, input: active, restoreFocus: true }
    }
  }
  if (editor.isActive("imageFigure")) {
    const { from } = editor.state.selection
    const node = editor.state.doc.nodeAt(from)
    if (node?.type?.name === "imageFigure" && !node.attrs?.isLogo) {
      return { pos: from, node, input: null, restoreFocus: false }
    }
  }
  return null
}

/**
 * Fill an empty template photo slot by clicking the dashed box.
 * Safe without ReactNodeViewRenderer (which previously crashed Continue editing).
 */
export async function fillEngageImageSlotFromFile(editor, figureDom, file) {
  if (!editor || editor.isDestroyed || !file) return null
  const hit = resolveImageFigurePosFromDom(editor.view, figureDom)
  if (!hit) throw new Error("Could not find that photo slot. Click an empty photo box in the report, or select a photo and choose Add another photo.")

  const uploaded = await uploadEngageImageForEditor(file)
  const sizeKey = IMAGE_SIZE_PRESETS[hit.node.attrs?.size] ? hit.node.attrs.size : "md"
  const nextSize = sizeKey === "custom" ? "md" : sizeKey
  const width = presetWidthPx(nextSize)
  const alt =
    hit.node.attrs?.alt && hit.node.attrs.alt !== "Report image"
      ? hit.node.attrs.alt
      : uploaded.alt || "Report image"

  editor
    .chain()
    .focus()
    .setNodeSelection(hit.pos)
    .updateAttributes("imageFigure", {
      src: uploaded.src,
      alt,
      size: nextSize,
      width,
      isLogo: false,
    })
    .run()

  return { warning: uploaded.warning || null }
}

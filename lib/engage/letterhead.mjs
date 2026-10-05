/**
 * Partner letterheads from the official Word headers — not invented layouts.
 * BCCEC: partner logos in an even header row (UK aid and MECS as separate marks).
 * PFF: Power for Food Partnership brand mark on the A4 header.
 */

export const LETTERHEAD_VERSION = "bccec-optical-balance-v13"

/** CSS reference: 96px = 1in = 25.4mm. */
export const CSS_PX_PER_MM = 96 / 25.4
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
/** Official BCCEC Word template uses landscape A4 for the KPI section. */
export const A4_LANDSCAPE_WIDTH_MM = 297
export const A4_LANDSCAPE_HEIGHT_MM = 210
/** Word pgMar 1440 twips = 1 inch on the official quarterly templates. */
export const WORD_PAGE_MARGIN_MM = 25.4
export const WORD_PAGE_MARGIN_TWIPS = 1440
export const A4_PORTRAIT_TWIPS = Object.freeze({ width: 11906, height: 16838 })
export const A4_LANDSCAPE_TWIPS = Object.freeze({ width: 16838, height: 11906 })
/** Official PFF Word template page margins (twips → mm). */
export const PFF_PAGE_MARGIN_TWIPS = Object.freeze({
  top: 1985,
  right: 1133,
  bottom: 1701,
  left: 1588,
})
export const PFF_PAGE_MARGIN_MM = Object.freeze({
  top: 35.01, // 1985 twips
  right: 19.99, // 1133 twips
  bottom: 30.01, // 1701 twips
  left: 28.01, // 1588 twips
})

/** In-flow header band — must reserve space so the title never overlaps logos. */
export const BCCEC_LETTERHEAD_HEIGHT_MM = 34

/**
 * Base sitting height before per-mark opticalScale.
 * Seals get boosted; wide wordmarks get pulled back so the row looks even.
 */
export const BCCEC_LETTERHEAD_LOGO_HEIGHT_MM = 18
export const BCCEC_LETTERHEAD_LOGO_BOX_MM = 18

/** Side inset on the letterhead band. */
export const BCCEC_LETTERHEAD_SIDE_PAD_MM = 5

export function mmToCssPx(mm) {
  return Math.round(Number(mm) * CSS_PX_PER_MM * 100) / 100
}

/**
 * Place logos in equal page columns (centers evenly across the page).
 * Kept for unit tests / reference; live BCCEC layout uses layoutLetterheadLogosEvenly.
 */
export function balanceLetterheadLogoRow(
  logos = [],
  {
    pageWidthMm = A4_WIDTH_MM,
    bandHeightMm = BCCEC_LETTERHEAD_HEIGHT_MM,
    sidePadMm = BCCEC_LETTERHEAD_SIDE_PAD_MM,
  } = {}
) {
  const list = (Array.isArray(logos) ? logos : []).map((logo) => ({ ...logo }))
  if (!list.length) return list
  const usable = Math.max(0, Number(pageWidthMm) - Number(sidePadMm) * 2)
  const col = usable / list.length
  for (let i = 0; i < list.length; i += 1) {
    const logo = list[i]
    const width = Number(logo.widthMm || 0)
    const height = Number(logo.heightMm || 0)
    logo.leftMm = Math.round((Number(sidePadMm) + col * i + (col - width) / 2) * 100) / 100
    logo.topMm = Math.round(((Number(bandHeightMm) - height) / 2) * 100) / 100
    logo.columnIndex = i
  }
  return list
}

/**
 * Even horizontal gaps + optically balanced sizes.
 * Seals (MEMD/NREP) get opticalScale > 1; wide wordmarks (MECS/GGGI) get < 1
 * so the ministry mark is never the smallest thing in the row.
 */
export function layoutLetterheadLogosEvenly(
  logos = [],
  {
    pageWidthMm = A4_WIDTH_MM,
    bandHeightMm = BCCEC_LETTERHEAD_HEIGHT_MM,
    sidePadMm = BCCEC_LETTERHEAD_SIDE_PAD_MM,
    displayHeightMm = BCCEC_LETTERHEAD_LOGO_HEIGHT_MM,
    maxLogoWidthMm = null,
    minGapMm = 3.5,
  } = {}
) {
  const source = (Array.isArray(logos) ? logos : []).map((logo) => ({
    ...logo,
    naturalWidthMm: Math.max(0.1, Number(logo.widthMm || 30)),
    naturalHeightMm: Math.max(0.1, Number(logo.heightMm || 20)),
    opticalScale: Math.max(0.5, Number(logo.opticalScale ?? 1)),
  }))
  if (!source.length) return []

  const usable = Math.max(0, Number(pageWidthMm) - Number(sidePadMm) * 2)
  const widthCap =
    maxLogoWidthMm != null
      ? Number(maxLogoWidthMm)
      : Math.max(56, Math.floor((usable / source.length) * 1.6 * 100) / 100)

  const sizeAtBaseHeight = (baseH) =>
    source.map((logo) => {
      let renderHeightMm = Number(baseH) * logo.opticalScale
      let renderWidthMm = (logo.naturalWidthMm / logo.naturalHeightMm) * renderHeightMm
      if (renderWidthMm > widthCap) {
        const shrink = widthCap / renderWidthMm
        renderWidthMm = widthCap
        renderHeightMm *= shrink
      }
      if (renderHeightMm > Number(bandHeightMm) - 2) {
        const shrink = (Number(bandHeightMm) - 2) / renderHeightMm
        renderHeightMm *= shrink
        renderWidthMm *= shrink
      }
      return {
        ...logo,
        renderWidthMm: Math.round(renderWidthMm * 100) / 100,
        renderHeightMm: Math.round(renderHeightMm * 100) / 100,
      }
    })

  let baseH = Number(displayHeightMm)
  let sized = sizeAtBaseHeight(baseH)
  let totalLogoW = sized.reduce((sum, logo) => sum + logo.renderWidthMm, 0)
  let gap = (usable - totalLogoW) / (source.length + 1)
  while (gap < Number(minGapMm) && baseH > 10) {
    baseH -= 0.25
    sized = sizeAtBaseHeight(baseH)
    totalLogoW = sized.reduce((sum, logo) => sum + logo.renderWidthMm, 0)
    gap = (usable - totalLogoW) / (source.length + 1)
  }
  gap = Math.max(2.5, Math.round(gap * 100) / 100)

  let x = Number(sidePadMm) + gap
  return sized.map((logo, i) => {
    const topMm =
      Math.round(((Number(bandHeightMm) - Number(logo.renderHeightMm)) / 2) * 100) / 100
    const next = {
      ...logo,
      widthMm: logo.renderWidthMm,
      heightMm: logo.renderHeightMm,
      renderWidthMm: logo.renderWidthMm,
      renderHeightMm: logo.renderHeightMm,
      leftMm: Math.round(x * 100) / 100,
      topMm,
      columnIndex: i,
      gapMm: gap,
    }
    x += logo.renderWidthMm + gap
    return next
  })
}

/**
 * Equal columns across the page — logos centered in each cell (shared midline).
 * maxLogoW leaves gap so UK aid and MECS never look glued.
 */
export function layoutLetterheadLogosInColumns(
  logos = [],
  {
    pageWidthMm = A4_WIDTH_MM,
    bandHeightMm = BCCEC_LETTERHEAD_HEIGHT_MM,
    sidePadMm = BCCEC_LETTERHEAD_SIDE_PAD_MM,
    displayHeightMm = BCCEC_LETTERHEAD_LOGO_HEIGHT_MM,
    verticalAlign = "center",
  } = {}
) {
  const source = (Array.isArray(logos) ? logos : []).map((logo) => ({
    ...logo,
    naturalWidthMm: Math.max(0.1, Number(logo.widthMm || 30)),
    naturalHeightMm: Math.max(0.1, Number(logo.heightMm || 20)),
  }))
  if (!source.length) return []

  const usable = Math.max(0, Number(pageWidthMm) - Number(sidePadMm) * 2)
  const colW = usable / source.length
  const maxLogoW = Math.max(12, colW * 0.82)

  return source.map((logo, i) => {
    // Contain-fit inside equal column box (maxLogoW × displayHeightMm).
    const scale = Math.min(
      Number(displayHeightMm) / logo.naturalHeightMm,
      maxLogoW / logo.naturalWidthMm
    )
    const renderWidthMm = Math.round(logo.naturalWidthMm * scale * 100) / 100
    const renderHeightMm = Math.round(logo.naturalHeightMm * scale * 100) / 100
    const leftMm =
      Math.round((Number(sidePadMm) + colW * i + (colW - renderWidthMm) / 2) * 100) / 100
    const topMm =
      verticalAlign === "bottom"
        ? Math.round((Number(bandHeightMm) - renderHeightMm) * 100) / 100
        : Math.round(((Number(bandHeightMm) - renderHeightMm) / 2) * 100) / 100
    return {
      ...logo,
      widthMm: renderWidthMm,
      heightMm: renderHeightMm,
      renderWidthMm,
      renderHeightMm,
      leftMm,
      topMm,
      columnIndex: i,
    }
  })
}

const BCCEC_LETTERHEAD_LOGO_DEFS = [
  {
    src: "/letterhead/ecooking/memd.png",
    alt: "Ministry of Energy and Mineral Development",
    variant: "memd",
    widthMm: 24.87,
    heightMm: 24.87,
    // Seals read small in PDF/print — keep MEMD at least as tall as NREP.
    opticalScale: 1.55,
  },
  {
    src: "/letterhead/ecooking/nrep.png?v=nrep_logo_v2",
    alt: "National Renewable Energy Platform",
    variant: "nrep",
    widthMm: 23.81,
    heightMm: 23.81,
    opticalScale: 1.4,
  },
  {
    src: "/letterhead/ecooking/iclei.png",
    alt: "ICLEI Local Governments for Sustainability",
    variant: "iclei",
    widthMm: 35.19,
    heightMm: 26.19,
    opticalScale: 1.05,
  },
  {
    src: "/letterhead/ecooking/gggi.png",
    alt: "Global Green Growth Institute",
    variant: "gggi",
    widthMm: 46.57,
    heightMm: 17.99,
    opticalScale: 1.0,
  },
  {
    src: "/letterhead/ecooking/ukaid.png?v=split_clean_v3",
    alt: "UK aid from the British people",
    variant: "ukaid",
    widthMm: 11.96,
    heightMm: 13.41,
    opticalScale: 1.15,
  },
  {
    src: "/letterhead/ecooking/mecs.png?v=split_clean_v3",
    alt: "Modern Energy Cooking Services",
    variant: "mecs",
    widthMm: 32.47,
    heightMm: 13.41,
    opticalScale: 0.9,
  },
]

/**
 * Live BCCEC row: optically balanced sizes + equal edge gaps.
 */
export const BCCEC_LETTERHEAD_LOGOS = Object.freeze(
  layoutLetterheadLogosEvenly(BCCEC_LETTERHEAD_LOGO_DEFS, {
    pageWidthMm: A4_WIDTH_MM,
    bandHeightMm: BCCEC_LETTERHEAD_HEIGHT_MM,
    sidePadMm: BCCEC_LETTERHEAD_SIDE_PAD_MM,
    displayHeightMm: BCCEC_LETTERHEAD_LOGO_HEIGHT_MM,
    maxLogoWidthMm: 48,
    minGapMm: 3.2,
  })
)

/** Power for Food Partnership brand mark (icon + wordmark). */
export const PFF_LETTERHEAD_HEIGHT_MM = 52.2

export const PFF_LETTERHEAD_LOGOS = Object.freeze([
  {
    src: "/letterhead/pff/partnership.png?v=pff_logo_v2",
    alt: "Power for Food Partnership",
    variant: "partnership",
    // Asset is ~2.47:1 (1476×597). Sized to fit the A4 header band.
    widthMm: 79.1,
    heightMm: 32,
    leftMm: 12.5,
    topMm: 10.1,
  },
])

const LETTERHEAD_SRC_RE =
  /\/letterhead\/(?:ecooking|pff)\/|\/PFF(?:%20| )?logo\.png|\/snv\.PNG$|\/[1-6]\.png(?:$|[?#])/i

export function isEngageLetterheadSrc(src) {
  return LETTERHEAD_SRC_RE.test(String(src || ""))
}

export function letterheadLogosForProfile(profile) {
  const key = String(profile || "").trim().toLowerCase()
  if (key === "bccec" || key === "beccec" || key === "ecooking") return BCCEC_LETTERHEAD_LOGOS
  if (key === "pff" || key === "power-for-food" || key === "powerforfood") return PFF_LETTERHEAD_LOGOS
  return []
}

export function isBccecLetterheadProfile(profile) {
  const key = String(profile || "").trim().toLowerCase()
  return key === "bccec" || key === "beccec" || key === "ecooking"
}

export function escapeLetterheadHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** Image sizing — BCCEC uses optically balanced flex sizes; PFF stays absolute. */
export function letterheadLogoStyle(logo, { absolute = false } = {}) {
  if (!absolute) {
    const widthMm = Number(logo.widthMm || logo.renderWidthMm || 20)
    const heightMm = Number(logo.heightMm || logo.renderHeightMm || BCCEC_LETTERHEAD_LOGO_HEIGHT_MM)
    return {
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      maxWidth: `${widthMm}mm`,
      maxHeight: `${heightMm}mm`,
      objectFit: "contain",
      objectPosition: "center center",
      border: 0,
      display: "block",
      position: "static",
      flex: "0 0 auto",
    }
  }
  const widthPx = mmToCssPx(logo.widthMm)
  const heightPx = mmToCssPx(logo.heightMm)
  const style = {
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "contain",
    border: 0,
    display: "block",
  }
  if (logo.leftMm != null && logo.topMm != null) {
    style.position = "absolute"
    style.left = `${mmToCssPx(logo.leftMm)}px`
    style.top = `${mmToCssPx(logo.topMm)}px`
  }
  return style
}

export function letterheadLogoInlineStyle(logo, { absolute = false } = {}) {
  const style = letterheadLogoStyle(logo, { absolute })
  if (!absolute) {
    return [
      `width:${style.width}`,
      `height:${style.height}`,
      `max-width:${style.maxWidth}`,
      `max-height:${style.maxHeight}`,
      "object-fit:contain",
      "object-position:center center",
      "border:0",
      "display:block",
      "position:static",
      "flex:0 0 auto",
    ].join(";")
  }
  const parts = [
    `width:${style.width}`,
    `height:${style.height}`,
    "max-width:none",
    "max-height:none",
    "object-fit:contain",
    "border:0",
    "display:block",
  ]
  if (style.position === "absolute") {
    parts.push("position:absolute", `left:${style.left}`, `top:${style.top}`)
  }
  return parts.join(";")
}

export function buildPartnerLetterheadHtml(profile) {
  const logos = letterheadLogosForProfile(profile)
  if (!logos.length) return ""
  const bccec = isBccecLetterheadProfile(profile)
  const items = logos
    .map((logo) => {
      if (!bccec) {
        return `<img src="${escapeLetterheadHtml(logo.src)}" alt="${escapeLetterheadHtml(logo.alt)}" class="engage-letterhead-logo engage-letterhead-logo--${escapeLetterheadHtml(logo.variant)}" width="${Math.round((logo.widthMm || 30) * 3.78)}" height="${Math.round((logo.heightMm || 20) * 3.78)}" style="${letterheadLogoInlineStyle(logo, { absolute: true })}" />`
      }
      const img = `<img src="${escapeLetterheadHtml(logo.src)}" alt="${escapeLetterheadHtml(logo.alt)}" class="engage-letterhead-logo engage-letterhead-logo--${escapeLetterheadHtml(logo.variant)}" style="${letterheadLogoInlineStyle(logo, { absolute: false })}" />`
      return `<div class="engage-letterhead-slot">${img}</div>`
    })
    .join("")
  return `<div class="engage-letterhead" data-engage-letterhead="${escapeLetterheadHtml(profile)}" data-letterhead-version="${LETTERHEAD_VERSION}" data-letterhead-layout="${bccec ? "optical-balance" : "absolute"}">${items}</div>`
}

function removeLetterheadHosts(root) {
  root
    .querySelectorAll("[data-engage-letterhead], table.engage-letterhead, .engage-letterhead")
    .forEach((el) => el.remove())
  root.querySelectorAll("img").forEach((img) => {
    if (!isEngageLetterheadSrc(img.getAttribute("src") || "")) return
    const host = img.closest("figure, table, .engage-letterhead-item, .engage-letterhead-slot, td") || img
    if (host.tagName === "TD") {
      const table = host.closest("table")
      host.innerHTML = ""
      if (table) {
        const leftover = String(table.textContent || "")
          .replace(/Type caption here[^\n]*/gi, "")
          .trim()
        if (!table.querySelector("img") && !leftover) table.remove()
      }
      return
    }
    host.remove()
  })
  root.querySelectorAll("table").forEach((table) => {
    if (
      table.classList.contains("engage-doc-table") ||
      table.hasAttribute("data-engage-table") ||
      table.closest("[data-section-key]")
    ) {
      return
    }
    const leftover = String(table.textContent || "")
      .replace(/Type caption here[^\n]*/gi, "")
      .trim()
    if (!table.querySelector("img") && !leftover) table.remove()
  })
}

export function stripPartnerLetterheadFromHtml(html) {
  let next = String(html || "")
  if (!next) return ""
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(`<div id="engage-root">${next}</div>`, "text/html")
      const root = doc.getElementById("engage-root")
      if (root) {
        removeLetterheadHosts(root)
        next = root.innerHTML
      }
    } catch {
      /* regex fallback below */
    }
  }
  return next
    .replace(/<(div|table)[^>]*(?:data-engage-letterhead|engage-letterhead)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(
      /<figure[^>]*>[\s\S]*?(?:\/letterhead\/(?:ecooking|pff)\/|snv\.PNG|\/[1-6]\.png)[\s\S]*?<\/figure>/gi,
      ""
    )
    .replace(
      /<img[^>]+src="[^"]*(?:\/letterhead\/(?:ecooking|pff)\/|snv\.PNG|\/[1-6]\.png)[^"]*"[^>]*\/?>/gi,
      ""
    )
    // Only bare empty tables — never touch engage-doc-table / data-engage-table.
    .replace(
      /<table(?![^>]*(?:engage-doc-table|data-engage-table|data-section-key))[^>]*>\s*(?:<tbody>)?\s*(?:<tr[^>]*>\s*(?:<t[dh][^>]*>\s*<\/t[dh]>\s*)+<\/tr>\s*)+(?:<\/tbody>)?\s*<\/table>/gi,
      ""
    )
}

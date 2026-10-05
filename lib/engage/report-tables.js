/**
 * Template table helpers for Engage Word reports (PFF, BTOR, Meeting, Incident).
 * Safe for client + server.
 */

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Default data rows matching official Word templates when none are stored yet. */
export function defaultRowsForTableSection(section = {}) {
  if (Array.isArray(section.defaultRows) && section.defaultRows.length) {
    return section.defaultRows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []))
  }

  const columns = Array.isArray(section.columns) ? section.columns : []
  const colCount = Math.max(columns.length, 1)
  const key = String(section.key || "")

  if (key === "participantsReached") {
    return [
      ["People with Disabilities", "", "", "", "", ""],
      ["Persons without Disabilities", "", "", "", "", ""],
      ["Total", "", "", "", "", ""],
    ].map((row) => {
      while (row.length < colCount) row.push("")
      return row.slice(0, colCount)
    })
  }

  if (key === "challenges") {
    return [
      ["1", "", ""],
      ["2", "", ""],
      ["3", "", ""],
    ].map((row) => {
      while (row.length < colCount) row.push("")
      return row.slice(0, colCount)
    })
  }

  return [0, 1, 2].map(() => Array.from({ length: colCount }, () => ""))
}

function cellHtml(text, { header = false } = {}) {
  const tag = header ? "th" : "td"
  const attrs = header ? ' data-engage-table-header="true"' : ""
  const inner = escapeHtml(text || "")
  return `<${tag}${attrs}>${inner || (header ? "" : "<p></p>")}</${tag}>`
}

/**
 * Build an editable HTML table for a template section.
 * Prefer existing HTML / row arrays from content when present.
 * Official BCCEC labeled tables use headerRow: false (prompt/answer rows, no thead).
 */
export function buildSectionTableHtml(section = {}, value) {
  if (typeof value === "string" && /<table[\s>]/i.test(value)) {
    return value
  }

  const columns = Array.isArray(section.columns) && section.columns.length
    ? section.columns
    : ["Column 1", "Column 2", "Column 3"]
  const colCount = Math.max(columns.length, 1)
  const showHeader = section.headerRow !== false

  let rows = null
  if (Array.isArray(value) && value.length) {
    rows = value.map((row) => {
      if (Array.isArray(row)) {
        const next = row.map((cell) => String(cell ?? ""))
        while (next.length < colCount) next.push("")
        return next.slice(0, colCount)
      }
      if (row && typeof row === "object") {
        return columns.map((col) => String(row[col] ?? row[col.toLowerCase?.()] ?? ""))
      }
      return Array.from({ length: colCount }, () => "")
    })
  }
  if (!rows || !rows.length) rows = defaultRowsForTableSection({ ...section, columns })

  const head = showHeader
    ? `<thead><tr>${columns.map((col) => cellHtml(col, { header: true })).join("")}</tr></thead>`
    : ""
  const body = rows
    .map((row) => {
      const cells = Array.from({ length: colCount }, (_, i) => cellHtml(row[i] ?? ""))
      return `<tr>${cells.join("")}</tr>`
    })
    .join("")

  return `<table class="engage-doc-table" data-engage-table="true">${head}<tbody>${body}</tbody></table>`
}

export function isTableSection(section = {}) {
  return String(section?.type || "").toLowerCase() === "table"
}

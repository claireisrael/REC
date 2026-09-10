export function recEditionYearCode(year) {
  const digits = String(year ?? "").replace(/\D/g, "")
  if (digits.length >= 2) return digits.slice(-2)
  return ""
}

export function recEditionFullYear(year) {
  const digits = String(year ?? "").replace(/\D/g, "")
  if (digits.length >= 4) return digits.slice(0, 4)
  if (digits.length === 2) return `20${digits}`
  return ""
}

export function formatRecEdition(year) {
  const code = recEditionYearCode(year)
  return code ? `REC${code}` : "REC"
}

export function formatRecEditionLabel(source) {
  if (source && typeof source === "object") {
    return formatRecEdition(source.year ?? source.conferenceYear ?? source.conference)
  }
  return formatRecEdition(source)
}

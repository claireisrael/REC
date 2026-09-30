// Code 128, set B. Patterns are bar/space widths; the stop pattern is 13 modules.
const CODE128_PATTERNS = Object.freeze([
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
])

const START_B = 104
const STOP = 106

if (CODE128_PATTERNS.length !== 107) {
  throw new Error("Code 128 pattern table is incomplete.")
}
if (CODE128_PATTERNS[START_B] !== "211214" || CODE128_PATTERNS[STOP] !== "2331112") {
  throw new Error("Code 128 start or stop pattern is wrong.")
}
for (let index = 0; index < CODE128_PATTERNS.length; index += 1) {
  const modules = [...CODE128_PATTERNS[index]].reduce((sum, digit) => sum + Number(digit), 0)
  const expected = index === STOP ? 13 : 11
  if (modules !== expected) throw new Error(`Code 128 pattern ${index} has ${modules} modules.`)
}

export function code128DataUrl(value) {
  const text = String(value || "")
  if (!text) return ""
  const codes = [START_B]
  for (const char of text) {
    const code = char.charCodeAt(0) - 32
    if (code < 0 || code > 94) return ""
    codes.push(code)
  }
  let checksum = START_B
  for (let index = 1; index < codes.length; index += 1) {
    checksum += codes[index] * index
  }
  codes.push(checksum % 103)
  codes.push(STOP)

  const quiet = 10
  let x = quiet
  const bars = []
  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code]
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index])
      if (index % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="80"/>`)
      }
      x += width
    }
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + quiet} 80" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${bars.join("")}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

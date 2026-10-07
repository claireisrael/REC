import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import QRCode from "qrcode";
import { BADGE_PRINT_DEFAULTS, BADGE_PRINT_FIELDS } from "./badge-print-options.mjs";
class RecBadgeError extends Error {
  constructor(message, status = 400, code = "badge_error") {
    super(message)
    this.status = status
    this.code = code
  }
}

export const BADGE_TEMPLATE_VERSION = "rec26-provided-template";
export const BADGE_SIZE = { width: 93, height: 125, bleed: 3, dpi: 662 };
const pt = 72 / 25.4;
const colors = {
  blue: "#176F91",
  gold: "#EFA74F",
  ink: "#182D38",
  white: "#FFFFFF",
};
let assetPromise;
async function assets() {
  if (!assetPromise)
    assetPromise = (async () => {
      const file = (name) =>
        readFile(path.join(process.cwd(), "public", "rec-badges", name));
      const regular = await file("NotoSans-Regular.ttf"),
        bold = await file("NotoSans-Bold.ttf");
      const { data, info } = await sharp(await file("energy-landscape.jpg"))
        .resize(1600, 660, { fit: "cover" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Flatten the fade once so PDF viewers and raster exports have no stitching lines.
      for (let y = 0; y < 330; y++)
        for (let x = 0; x < info.width; x++)
          for (let c = 0; c < info.channels; c++) {
            const i = (y * info.width + x) * info.channels + c;
            data[i] = Math.round(255 + (data[i] - 255) * (y / 329));
          }
      const background = await sharp(data, { raw: info })
        .jpeg({ quality: 92 })
        .toBuffer();
      return {
        regular,
        bold,
        background,
        ministry: await file("reference-logo-a.png"),
        nrep: await file("reference-logo-b.png"),
      };
    })().catch((error) => {
      assetPromise = null;
      throw error;
    });
  return assetPromise;
}
const clean = (value) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[ch],
  );
const color = (hex) =>
  rgb(
    ...hex
      .slice(1)
      .match(/../g)
      .map((c) => parseInt(c, 16) / 255),
  );

export function badgeRenderOptions(input = {}) {
  const format = input.format || "png";
  if (!["png", "pdf"].includes(format))
    throw new RecBadgeError("Choose PDF or PNG.");
  if (
    input.bleed != null &&
    ![true, false, "true", "false"].includes(input.bleed)
  )
    throw new RecBadgeError("Bleed must be enabled or disabled.");
  const details = {};
  for (const { key, label } of BADGE_PRINT_FIELDS) {
    if (input[key] === undefined) details[key] = BADGE_PRINT_DEFAULTS[key];
    else if ([true, false, "true", "false"].includes(input[key]))
      details[key] = input[key] === true || input[key] === "true";
    else throw new RecBadgeError(`${label} must be enabled or disabled.`);
  }
  return { format, bleed: input.bleed === true || input.bleed === "true", ...details };
}

// All coordinates are millimetres. Both renderers consume this same measured layout.
export async function badgeLayout(badge, input = {}) {
  const options = badgeRenderOptions(input),
    b = options.bleed ? BADGE_SIZE.bleed : 0;
  const media = await assets(),
    pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {
    regular: await pdf.embedFont(media.regular, { subset: true }),
    bold: await pdf.embedFont(media.bold, { subset: true }),
  };
  const ops = [],
    width = 93 + b * 2,
    height = 125 + b * 2;
  const rect = (x, y, w, h, fill, opacity = 1) =>
    ops.push({ type: "rect", x: x + b, y: y + b, w, h, fill, opacity });
  const image = (key, x, y, w, h) =>
    ops.push({ type: "image", key, x: x + b, y: y + b, w, h });
  const words = (value, font, size, maxWidth) => {
    const lines = [],
      measure = (text) => font.widthOfTextAtSize(text, size);
    let line = "";
    for (const word of clean(value).split(" ")) {
      if (measure(word) > maxWidth) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const ch of Array.from(word)) {
          if (measure(line + ch) > maxWidth && line) {
            lines.push(line);
            line = "";
          }
          line += ch;
        }
      } else if (line && measure(`${line} ${word}`) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (
    value,
    x,
    y,
    w,
    h,
    {
      size = 3,
      min = 2,
      weight = "regular",
      fill = colors.ink,
      align = "center",
    } = {},
  ) => {
    const font = fonts[weight],
      content = clean(value);
    if (!content) return;
    let lines, chosen;
    for (let s = size; s >= min - 0.001; s -= 0.1) {
      lines = words(content, font, s, w);
      if (lines.length * s * 1.3 <= h) {
        chosen = s;
        break;
      }
    }
    if (!chosen)
      throw new RecBadgeError(
        "A name or badge detail is too long for the print area. Shorten the registration detail before exporting.",
        422,
        "badge_layout_overflow",
      );
    const top = y + (h - lines.length * chosen * 1.3) / 2;
    lines.forEach((line, i) => {
      const measured = font.widthOfTextAtSize(line, chosen);
      ops.push({
        type: "text",
        value: line,
        x: x + b + (align === "center" ? (w - measured) / 2 : 0),
        y: top + b + chosen + i * chosen * 1.3,
        size: chosen,
        weight,
        fill,
      });
    });
  };
  const c = badge.conference,
    r = badge.registration;
  if (!badge.qrPayload || !r?.name || !c?.year)
    throw new RecBadgeError("This badge is missing its print details.", 409);
  rect(-b, -b, width, height, colors.white);
  image("background", -b, 89, width, 36 + b);
  rect(-b, -b, 6 + b, height, colors.gold);
  rect(6, -b, 0.65, height, colors.blue);
  image("ministry", 32, 6, 17, 17);
  image("nrep", 51, 6, 17, 17);
  text("RENEWABLE ENERGY", 10, 26, 78, 6, {
    size: 5.2,
    min: 4,
    weight: "bold",
  });
  text(`CONFERENCE ${c.year} & EXPO`, 10, 32.5, 78, 5, {
    size: 3.9,
    min: 3,
    fill: colors.blue,
  });
  const date = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-GB", {
          timeZone: "Africa/Kampala",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
  text(
    [date(c.startDate), date(c.endDate)].filter(Boolean).join(" - "),
    10,
    38,
    78,
    3,
    { size: 2.3, weight: "bold" },
  );
  text([c.venue, c.location].filter(Boolean).join(" | "), 10, 41, 78, 3.5, {
    size: 2.2,
    min: 1.8,
  });
  rect(13, 45, 72, 0.25, colors.gold);
  text(r.name, 11, 47, 76, 12, {
    size: 5.5,
    min: 2.5,
    weight: "bold",
    fill: colors.blue,
  });
  text(r.organization || "Conference participant", 11, 60.5, 76, 9, {
    size: 3.2,
    min: 2.1,
  });
  if (options.showCategory)
    text(
      `ACCESS PASS | ${(r.registrationTypes || [r.registrationType]).filter(Boolean).join(" / ")}`,
      11,
      70,
      76,
      4,
      { size: 2.6, min: 2, weight: "bold" },
    );
  if (options.showAttendanceDates) {
    let conferenceDays = c.days;
    if (typeof conferenceDays === "string") {
      try { conferenceDays = JSON.parse(conferenceDays); }
      catch { conferenceDays = []; }
    }
    const attendance = (r.daysAttending || []).map((label) => {
      const day = Array.isArray(conferenceDays)
        ? conferenceDays.find((day) => day.label === label)
        : null;
      return day?.date
        ? new Date(
            `${String(day.date).slice(0, 10)}T12:00:00+03:00`,
          ).toLocaleDateString("en-GB", {
            timeZone: "Africa/Kampala",
            day: "numeric",
            month: "short",
          })
        : label;
    });
    text(
      `ATTENDANCE: ${attendance.join(" / ") || "See registration"}`,
      11,
      75,
      76,
      5,
      { size: 2.2, min: 1.7 },
    );
  }
  const qr = QRCode.create(badge.qrPayload, { errorCorrectionLevel: "M" }),
    n = qr.modules.size;
  const unit = 29 / (n + 8),
    qrX = 35,
    qrY = 81.5;
  rect(qrX, qrY, 29, 29, colors.white);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++)
      if (qr.modules.get(row, col))
        rect(
          qrX + (col + 4) * unit,
          qrY + (row + 4) * unit,
          unit,
          unit,
          "#000000",
        );
  if (options.showHashtag) {
    rect(23, 111.5, 53, 5, colors.white, 0.97);
    text(
      `#REC${String(c.year).slice(-2)}&EXPO`,
      24,
      111.7,
      51,
      4.5,
      { size: 2.7, min: 2.2, weight: "bold" },
    );
  }
  rect(6.65, 118, 86.35 + b, 7 + b, colors.blue, 0.94);
  text(c.theme || c.title, 10, 118.5, 78, 6, {
    size: 2.3,
    min: 1.7,
    weight: "bold",
    fill: colors.white,
  });
  if (options.showRecId)
    ops.push({
      type: "text",
      value: `REC-ID No. ${clean(badge.badge.badgeNumberLabel || badge.badge.badgeNumber)}`,
      x: 4 + b,
      y: 113 + b,
      size: 2.3,
      weight: "bold",
      fill: colors.ink,
      rotate: -90,
    });
  return { ops, width, height, bleed: b, media, pdf, fonts, options };
}

const PLATE_WIDTH = 2424;
const PLATE_HEIGHT = 3258;
const TEMPLATE_PAGE = { width: 790.5, height: 1062.75 };
const PLATE_SCALE = PLATE_WIDTH / 1098;
const plateX = (x) => Math.round((x / TEMPLATE_PAGE.width) * PLATE_WIDTH);
const plateY = (y) => Math.round((y / TEMPLATE_PAGE.height) * PLATE_HEIGHT);
const platePx = (pixels) => Math.round(pixels * PLATE_SCALE);

function fittedFontSize(value, max, min, maxWidth) {
  const text = clean(value);
  if (!text) return max;
  let size = max;
  while (size > min && text.length * size * 0.58 > maxWidth) size -= 1;
  return size;
}

const platePath = path.join(process.cwd(), "public", "badge", "rec26-plate.png");

let clearedPlatePromise;

function clearedTemplatePlate() {
  if (!clearedPlatePromise) clearedPlatePromise = buildClearedTemplatePlate();
  return clearedPlatePromise;
}

async function buildClearedTemplatePlate() {
  const tileLeft = plateX(72);
  const tileTop = plateY(408);
  const tileWidth = plateX(130) - tileLeft;
  const tileHeight = plateY(438) - tileTop;
  const paperTile = await sharp(platePath)
    .extract({ left: tileLeft, top: tileTop, width: tileWidth, height: tileHeight })
    .png()
    .toBuffer();
  const coverLayers = [];
  for (let top = plateY(448); top < plateY(620); top += tileHeight) {
    for (let left = plateX(68); left < plateX(730); left += tileWidth) {
      coverLayers.push({ input: paperTile, left, top });
    }
  }
  return sharp(platePath).composite(coverLayers).png().toBuffer();
}

async function renderProvidedTemplate(badge) {
  const registration = badge.registration || {};
  const name = clean(registration.name || "Participant");
  const organization = clean(registration.organization || "");
  const category = clean(registration.participantCategoryTag || "");
  const badgeNumber = clean(badge.badge?.badgeNumberLabel || badge.badge?.badgeNumber || "");
  if (!badge.qrPayload || !name)
    throw new RecBadgeError("This badge is missing its print details.", 409);

  const qrPad = platePx(8);
  const qrSize = plateX(148);
  const qrLeft = plateX((314.9 + 516.7) / 2) - Math.round(qrSize / 2);
  const qrTop = plateY(708);
  const qr = await QRCode.toBuffer(badge.qrPayload, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: qrSize,
    color: { dark: "#5c3208", light: "#ffffff" },
  });
  const qrCenterX = qrLeft + Math.round(qrSize / 2);
  const nameSize = fittedFontSize(name, platePx(72), platePx(28), plateX(520));
  const orgSize = fittedFontSize(organization, platePx(32), platePx(16), plateX(540));
  const categorySize = fittedFontSize(category, platePx(28), platePx(16), plateX(460));
  const numberSize = fittedFontSize(badgeNumber, platePx(26), platePx(16), plateY(250));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PLATE_WIDTH}" height="${PLATE_HEIGHT}">
    <rect x="${qrLeft - qrPad}" y="${qrTop - qrPad}" width="${qrSize + qrPad * 2}" height="${qrSize + qrPad * 2}" fill="#ffffff"/>
    <text x="${PLATE_WIDTH / 2}" y="${plateY(500)}" text-anchor="middle" font-family="Noto Sans" font-size="${nameSize}" font-weight="700" fill="#7c4409">${escape(name.toUpperCase())}</text>
    ${organization ? `<text x="${PLATE_WIDTH / 2}" y="${plateY(555)}" text-anchor="middle" font-family="Noto Sans" font-size="${orgSize}" font-weight="700" fill="#ff9700">${escape(organization.toUpperCase())}</text>` : ""}
    ${category ? `<text x="${qrCenterX}" y="${plateY(934)}" text-anchor="middle" font-family="Noto Sans" font-size="${categorySize}" font-weight="700" fill="#3a2410">${escape(category)}</text><text x="${qrCenterX}" y="${plateY(932)}" text-anchor="middle" font-family="Noto Sans" font-size="${categorySize}" font-weight="700" fill="#ffe3c4">${escape(category)}</text>` : ""}
    ${badgeNumber ? `<text x="${plateX(37)}" y="${plateY(790)}" text-anchor="start" font-family="Noto Sans" font-size="${numberSize}" font-weight="700" fill="none" stroke="#fff6e8" stroke-width="${(1.6 * PLATE_SCALE).toFixed(2)}" transform="rotate(-90 ${plateX(37)} ${plateY(790)})">${escape(badgeNumber)}</text>` : ""}
  </svg>`;
  const overlay = new Resvg(svg, {
    font: {
      fontFiles: ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"].map((file) =>
        path.join(process.cwd(), "public", "rec-badges", file),
      ),
      defaultFontFamily: "Noto Sans",
      loadSystemFonts: false,
    },
  }).render().asPng();

  return sharp(await clearedTemplatePlate())
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: qr, left: qrLeft, top: qrTop },
    ])
    .withMetadata({ density: BADGE_SIZE.dpi })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function renderBadge(badge, input = {}) {
  const options = badgeRenderOptions(input);
  const png = await renderProvidedTemplate(badge);
  if (options.format === "pdf") {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([93 * pt, 125 * pt]);
    page.drawImage(await pdf.embedPng(png), {
      x: 0,
      y: 0,
      width: 93 * pt,
      height: 125 * pt,
    });
    const label = badge.badge?.badgeNumberLabel || badge.badge?.badgeNumber || "badge";
    pdf.setTitle(`REC ${badge.conference?.year || ""} - ${label}`);
    pdf.setProducer(`NREP ${BADGE_TEMPLATE_VERSION}`);
    return Buffer.from(await pdf.save());
  }
  return png;
}

const A3_SHEET = { width: 297, height: 420, columns: 3, rows: 3, cardWidth: 93, cardHeight: 125, columnGap: 6, rowGap: 8 };

function drawA3CutGuides(page) {
  const contentWidth = A3_SHEET.columns * A3_SHEET.cardWidth + (A3_SHEET.columns - 1) * A3_SHEET.columnGap;
  const contentHeight = A3_SHEET.rows * A3_SHEET.cardHeight + (A3_SHEET.rows - 1) * A3_SHEET.rowGap;
  const originX = (A3_SHEET.width - contentWidth) / 2;
  const originY = (A3_SHEET.height - contentHeight) / 2;
  const color = rgb(0.45, 0.45, 0.45);
  const thickness = 0.4;
  for (let column = 0; column < A3_SHEET.columns - 1; column += 1) {
    const x = (originX + (column + 1) * A3_SHEET.cardWidth + column * A3_SHEET.columnGap + A3_SHEET.columnGap / 2) * pt;
    page.drawLine({
      start: { x, y: (originY - 2) * pt },
      end: { x, y: (originY + contentHeight + 2) * pt },
      thickness,
      color,
    });
  }
  for (let gap = 0; gap < A3_SHEET.rows - 1; gap += 1) {
    const y = (originY + (gap + 1) * A3_SHEET.cardHeight + gap * A3_SHEET.rowGap + A3_SHEET.rowGap / 2) * pt;
    page.drawLine({
      start: { x: (originX - 2) * pt, y },
      end: { x: (originX + contentWidth + 2) * pt, y },
      thickness,
      color,
    });
  }
}

export async function addA3BadgePages(pdf, pngBuffers) {
  const contentWidth = A3_SHEET.columns * A3_SHEET.cardWidth + (A3_SHEET.columns - 1) * A3_SHEET.columnGap;
  const contentHeight = A3_SHEET.rows * A3_SHEET.cardHeight + (A3_SHEET.rows - 1) * A3_SHEET.rowGap;
  const originX = (A3_SHEET.width - contentWidth) / 2;
  const originY = (A3_SHEET.height - contentHeight) / 2;
  const perSheet = A3_SHEET.columns * A3_SHEET.rows;
  for (let start = 0; start < pngBuffers.length; start += perSheet) {
    const page = pdf.addPage([A3_SHEET.width * pt, A3_SHEET.height * pt]);
    drawA3CutGuides(page);
    const slice = pngBuffers.slice(start, start + perSheet);
    for (let index = 0; index < slice.length; index += 1) {
      const image = await pdf.embedPng(slice[index]);
      const column = index % A3_SHEET.columns;
      const row = Math.floor(index / A3_SHEET.columns);
      page.drawImage(image, {
        x: (originX + column * (A3_SHEET.cardWidth + A3_SHEET.columnGap)) * pt,
        y: (originY + (A3_SHEET.rows - 1 - row) * (A3_SHEET.cardHeight + A3_SHEET.rowGap)) * pt,
        width: A3_SHEET.cardWidth * pt,
        height: A3_SHEET.cardHeight * pt,
      });
    }
  }
}

export async function renderA3BadgePdf(pngBuffers) {
  const pdf = await PDFDocument.create();
  await addA3BadgePages(pdf, pngBuffers);
  pdf.setProducer(`NREP ${BADGE_TEMPLATE_VERSION}`);
  return Buffer.from(await pdf.save());
}

export async function combineBadgePdfs(buffers) {
  const pdf = await PDFDocument.create();
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer);
    for (const page of await pdf.copyPages(source, source.getPageIndices()))
      pdf.addPage(page);
  }
  return Buffer.from(await pdf.save());
}

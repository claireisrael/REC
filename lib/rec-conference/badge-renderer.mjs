import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import QRCode from "qrcode";
class RecBadgeError extends Error {
  constructor(message, status = 400, code = "badge_error") {
    super(message)
    this.status = status
    this.code = code
  }
}

export const BADGE_TEMPLATE_VERSION = "rec-tag-2026-v1";
export const BADGE_SIZE = { width: 93, height: 125, bleed: 3, dpi: 300 };
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
  return { format, bleed: input.bleed === true || input.bleed === "true" };
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
  text(
    `ACCESS PASS | ${(r.registrationTypes || [r.registrationType]).filter(Boolean).join(" / ")}`,
    11,
    70,
    76,
    4,
    { size: 2.6, min: 2, weight: "bold" },
  );
  const attendance = (r.daysAttending || []).map((label) => {
    const day = Array.isArray(c.days)
      ? c.days.find((day) => day.label === label)
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
  rect(23, 111.5, 53, 5, colors.white, 0.97);
  text(
    badge.badge.badgeNumberLabel || badge.badge.badgeNumber,
    24,
    111.7,
    51,
    4.5,
    { size: 2.7, min: 2.2, weight: "bold" },
  );
  rect(6.65, 118, 86.35 + b, 7 + b, colors.blue, 0.94);
  text(c.theme || c.title, 10, 118.5, 78, 6, {
    size: 2.3,
    min: 1.7,
    weight: "bold",
    fill: colors.white,
  });
  ops.push({
    type: "text",
    value: `# REC${String(c.year).slice(-2)}&EXPO`,
    x: 4 + b,
    y: 113 + b,
    size: 2.3,
    weight: "bold",
    fill: colors.ink,
    rotate: -90,
  });
  return { ops, width, height, bleed: b, media, pdf, fonts, options };
}

export async function renderBadge(badge, input = {}) {
  const layout = await badgeLayout(badge, input),
    { ops, width, height, bleed, media, pdf, fonts, options } = layout;
  if (options.format === "pdf") {
    const page = pdf.addPage([width * pt, height * pt]);
    page.setTrimBox(bleed * pt, bleed * pt, 93 * pt, 125 * pt);
    page.setBleedBox(0, 0, width * pt, height * pt);
    const images = {};
    for (const key of ["background", "ministry", "nrep"])
      images[key] =
        key === "background"
          ? await pdf.embedJpg(media[key])
          : await pdf.embedPng(media[key]);
    for (const op of ops) {
      if (op.type === "rect")
        page.drawRectangle({
          x: op.x * pt,
          y: (height - op.y - op.h) * pt,
          width: op.w * pt,
          height: op.h * pt,
          color: color(op.fill),
          opacity: op.opacity,
        });
      if (op.type === "image")
        page.drawImage(images[op.key], {
          x: op.x * pt,
          y: (height - op.y - op.h) * pt,
          width: op.w * pt,
          height: op.h * pt,
        });
      if (op.type === "text")
        page.drawText(op.value, {
          x: op.x * pt,
          y: (height - op.y) * pt,
          size: op.size * pt,
          font: fonts[op.weight],
          color: color(op.fill),
          rotate: degrees(-(op.rotate || 0)),
        });
    }
    pdf.setTitle(
      `REC ${badge.conference.year} - ${badge.badge.badgeNumberLabel}`,
    );
    pdf.setProducer(`NREP ${BADGE_TEMPLATE_VERSION}`);
    return Buffer.from(await pdf.save());
  }
  const elements = ops
    .map((op) => {
      if (op.type === "rect")
        return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${op.fill}" opacity="${op.opacity}"/>`;
      if (op.type === "image")
        return `<image x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" preserveAspectRatio="none" href="data:image/${op.key === "background" ? "jpeg" : "png"};base64,${media[op.key].toString("base64")}"/>`;
      return `<text x="${op.x}" y="${op.y}" font-family="Noto Sans" font-size="${op.size}" font-weight="${op.weight === "bold" ? 700 : 400}" fill="${op.fill}"${op.rotate ? ` transform="rotate(${op.rotate} ${op.x} ${op.y})"` : ""}>${escape(op.value)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round((width / 25.4) * 300)}" height="${Math.round((height / 25.4) * 300)}" viewBox="0 0 ${width} ${height}">${elements}</svg>`;
  const png = new Resvg(svg, {
    font: {
      fontFiles: ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"].map((name) =>
        path.join(process.cwd(), "public", "rec-badges", name),
      ),
      defaultFontFamily: "Noto Sans",
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng();
  return sharp(png).withMetadata({ density: 300 }).png().toBuffer();
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

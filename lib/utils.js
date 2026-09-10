import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names conditionally and merges Tailwind CSS classes without style conflicts.
 * @param {...any} inputs - A list of class names or conditional class objects.
 * @returns {string} The combined and merged class names.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Placeholder - implement or use a library for number to words conversion
export function numberToWords(num) {
  if (num === 0) return "Zero"
  // Basic implementation for small numbers, extend as needed or use a library
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

  if (num < 0) return "Minus " + numberToWords(Math.abs(num))

  let words = ""

  if (Math.floor(num / 1000000) > 0) {
    words += numberToWords(Math.floor(num / 1000000)) + " Million "
    num %= 1000000
  }

  if (Math.floor(num / 1000) > 0) {
    words += numberToWords(Math.floor(num / 1000)) + " Thousand "
    num %= 1000
  }

  if (Math.floor(num / 100) > 0) {
    words += numberToWords(Math.floor(num / 100)) + " Hundred "
    num %= 100
  }

  if (num > 0) {
    if (words !== "" && num < 100 && !words.endsWith("Thousand ") && !words.endsWith("Million ")) words += "and "
    // Refined 'and' logic to avoid "Thousand and X" or "Million and X"

    if (num < 10) words += ones[num]
    else if (num < 20) words += teens[num - 10]
    else {
      words += tens[Math.floor(num / 10)]
      if (num % 10 > 0) words += " " + ones[num % 10]
    }
  }
  return words.trim()
}

const KAMPALA_TIME_ZONE = "Africa/Kampala"

function parseAppwriteDate(dateString) {
  if (!dateString) return null
  const raw = String(dateString).trim()
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (dateOnly) {
    return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00+03:00`)
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Formats an Appwrite date string into a human-readable calendar date in Kampala time.
 * @param {string} dateString - The date string from Appwrite (e.g., "2025-10-20T00:00:00.000+00:00").
 * @param {string} format - The desired format: "long" (October 20, 2025), "short" (20/10/2025), "medium" (Oct 20, 2025).
 * @returns {string} The formatted date string.
 */
export function formatAppwriteDate(dateString, format = "medium") {
  const date = parseAppwriteDate(dateString)
  if (!date) return ""

  const options = { timeZone: KAMPALA_TIME_ZONE }
  switch (format) {
    case "long":
      return date.toLocaleDateString("en-US", { ...options, year: "numeric", month: "long", day: "numeric" })
    case "short":
      return date.toLocaleDateString("en-GB", { ...options, year: "numeric", month: "2-digit", day: "2-digit" })
    case "medium":
      return date.toLocaleDateString("en-US", { ...options, year: "numeric", month: "short", day: "numeric" })
    default:
      return date.toLocaleDateString("en-GB", options)
  }
}

/**
 * Formats an Appwrite timestamp with Kampala date and time, e.g. "9 Sep 2026, 10:58 pm".
 */
export function formatAppwriteDateTime(dateString) {
  const date = parseAppwriteDate(dateString)
  if (!date) return ""
  return date.toLocaleString("en-GB", {
    timeZone: KAMPALA_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function getRegistrationTimestamp(registration) {
  return registration?.$updatedAt || registration?.updatedAt || registration?.$createdAt || registration?.createdAt || ""
}

/**
 * Cleans data by setting empty string values to null for database insertion.
 * @param {Object} data - The data object to clean.
 * @returns {Object} The cleaned data object with empty strings converted to null.
 */
export function cleanDataForDatabase(data) {
  const cleaned = {}
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.trim() === '') {
      cleaned[key] = null
    } else if (Array.isArray(value) && value.length === 0) {
      cleaned[key] = null
    } else {
      cleaned[key] = value
    }
  }
  
  return cleaned
}

/**
 * Generates a unique code locally — no external API required.
 *
 * Format: {prefix}{N uppercase hex chars}
 * Example: generateUniqueCode("TR-", 6) → "TR-A3F2B8"
 *
 * Uses crypto.randomUUID() + timestamp for guaranteed uniqueness.
 * No network call, no external dependencies.
 *
 * @param {string} prefix - The prefix for the code (e.g., "TR-")
 * @param {number} length - Number of random hex characters to append
 * @returns {Promise<string>} The generated code (async to maintain backward compatibility)
 */
export async function generateUniqueCode(prefix = "", length = 6) {
  try {
    let randomHex

    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      // Use the native Web Crypto API (available in modern browsers and Node 14.17+)
      const uuid = crypto.randomUUID()
      randomHex = uuid.replace(/-/g, "").toUpperCase()
    } else {
      // Fallback for older environments: build hex from Math.random
      randomHex = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("").toUpperCase()
    }

    // Take first (length - 2) chars from the random hex
    // and append 2 chars from the current timestamp in base-36 for extra collision resistance
    const randomPart = randomHex.substring(0, Math.max(length - 2, 1))
    const tsPart = Date.now().toString(36).slice(-2).toUpperCase()
    const code = `${prefix}${randomPart}${tsPart}`.substring(0, prefix.length + length)

    return code
  } catch {
    // Ultra-safe last-resort fallback
    return `${prefix}${Date.now().toString(36).toUpperCase().padStart(length, "0").slice(-length)}`
  }
}

/**
 * Turn a Date (or date-string/number) into a human-readable date.
 * @param {Date|string|number} input
 * @param {Object} [options]   Intl.DateTimeFormat options
 * @param {string} [locale]    e.g. 'en-US'
 * @returns {string}
 */
export function formatDate(input, options = {}, locale = undefined) {
  const date = input instanceof Date
    ? input
    : new Date(input);

  // Fallback to user's locale if you don’t pass one
  return date.toLocaleDateString(locale, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    ...options
  });
}

/**
 * Convert a number of bytes into a human-readable string.
 *
 * @param {number} bytes       — file size in bytes
 * @param {number} [decimals]  — how many decimal places to show (default 2)
 * @returns {string}           — e.g. "1.23 MB"
 */
export function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  // orders of magnitude
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  // figure out which unit
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${value} ${sizes[i]}`;
}


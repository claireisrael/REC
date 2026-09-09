import {
  TIME_BLOCK_TYPE_LABELS,
  formatBlockTimeRange,
  formatMinutesAsClock,
  isVenueAllowedForBlock,
  sessionOccupiesBlock,
  sortTimeBlocks,
} from "./schedule"

const CONFERENCE_START_HOUR = 8
const CONFERENCE_END_HOUR = 17

const sanitizeFilePart = (value = "rec-timetable") => (
  String(value)
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "rec-timetable"
)

const splitIntoChunks = (items, size) => {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

const splitHoursForReadablePages = (hours, shouldSplit) => {
  if (!shouldSplit || hours.length <= 5) return [hours]

  const midpoint = Math.ceil(hours.length / 2)
  return [hours.slice(0, midpoint), hours.slice(midpoint)]
}

const splitBlocksForReadablePages = (blocks, shouldSplit) => {
  if (!shouldSplit || blocks.length <= 5) return [blocks]

  const midpoint = Math.ceil(blocks.length / 2)
  return [blocks.slice(0, midpoint), blocks.slice(midpoint)]
}

const getMultiVenuePageFormat = (venueCount) => {
  if (venueCount > 8) return "a2"
  if (venueCount > 5) return "a3"
  return "a4"
}

const getTableDensity = (venueCount, isSingleVenue) => {
  if (isSingleVenue) return { fontSize: 8, cellPadding: 5, minCellHeight: 42 }
  if (venueCount > 8) return { fontSize: 4.8, cellPadding: 2, minCellHeight: 30 }
  if (venueCount > 5) return { fontSize: 5.8, cellPadding: 3, minCellHeight: 32 }
  return { fontSize: 6.8, cellPadding: 4, minCellHeight: 36 }
}

const formatHourLabel = (hour) => {
  const period = hour >= 12 ? "PM" : "AM"
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${String(displayHour).padStart(2, "0")}:00 ${period}`
}

const formatSlotRange = (hour) => `${formatHourLabel(hour)} - ${formatHourLabel(hour + 1)}`

const getCellSessionsForExport = (rows, dayNumber, venue, hour) => {
  const slotStart = hour * 60
  const slotEnd = (hour + 1) * 60

  return rows
    .filter((row) => (
      row.dayNumber === dayNumber &&
      row.venueKey === venue &&
      !Number.isNaN(row.startMinutes) &&
      !Number.isNaN(row.endMinutes) &&
      row.startMinutes < slotEnd &&
      row.endMinutes > slotStart
    ))
}

const getBlockSessionsForExport = (rows, dayNumber, venue, block) => (
  rows.filter((row) => (
    row.dayNumber === dayNumber &&
    row.venueKey === venue &&
    sessionOccupiesBlock(row, block)
  ))
)

const buildCellText = (sessions) => {
  if (!sessions.length) return ""

  return sessions.map((session) => {
    const lines = [
      session.title || "Untitled Session",
      `${session.startTimeLabel || "TBD"} - ${session.endTimeLabel || "TBD"}`,
    ]

    if (session.theme) lines.push(session.theme)
    if (session.organizer) lines.push(`Organizer: ${session.organizer}`)
    if (session.statusLabel) lines.push(`Status: ${session.statusLabel}`)
    if (session.conflictIds?.length > 0) lines.push(`Overlap: ${session.conflictIds.length}`)

    return lines.join("\n")
  }).join("\n\n")
}

const buildBlockCellText = (block, venue, sessions) => {
  if (!isVenueAllowedForBlock(block, venue)) return ""

  if (!block.allowSessions) {
    const typeLabel = TIME_BLOCK_TYPE_LABELS[block.type] || block.type || "Activity"
    return [block.label || typeLabel, typeLabel].filter(Boolean).join("\n")
  }

  return buildCellText(sessions)
}

const escapeCsvValue = (value) => {
  const stringValue = String(value ?? "")
  if (!/[",\n\r]/.test(stringValue)) return stringValue
  return `"${stringValue.replace(/"/g, '""')}"`
}

const downloadTextFile = (content, fileName, mimeType) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const drawHeader = (doc, options) => {
  const {
    title,
    programTitle,
    conferenceTitle,
    dayLabel,
    venueLabel,
    hourLabel,
    generatedAt,
    margin,
  } = options

  const pageWidth = doc.internal.pageSize.width
  let y = margin

  doc.setTextColor(5, 70, 83)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(title, pageWidth / 2, y, { align: "center" })

  y += 16
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(71, 85, 105)
  doc.text(`Program: ${programTitle || "N/A"}`, margin, y)
  y += 12

  if (conferenceTitle) {
    doc.text(`Conference: ${conferenceTitle}`, margin, y)
    y += 12
  }

  doc.text(`Day: ${dayLabel}`, margin, y)
  y += 12
  doc.text(`Venues: ${venueLabel}`, margin, y)
  y += 12
  doc.text(`Hours: ${hourLabel} | Timezone: Africa/Kampala`, margin, y)
  y += 12
  doc.text(`Generated: ${generatedAt}`, margin, y)
  y += 10

  doc.setDrawColor(226, 232, 240)
  doc.line(margin, y, pageWidth - margin, y)

  return y + 12
}

export const exportRecTimetablePdf = async ({
  programTitle,
  conferenceTitle,
  days,
  venues,
  rows,
  fileName,
  title = "REC Conference Time Slots",
  startHour = CONFERENCE_START_HOUR,
  endHour = CONFERENCE_END_HOUR,
  timeBlocks = [],
}) => {
  const visibleDays = Array.isArray(days) ? days : []
  const visibleVenues = Array.isArray(venues) ? venues : []
  const timetableRows = Array.isArray(rows) ? rows : []

  if (!visibleDays.length || !visibleVenues.length) {
    throw new Error("No timetable data is available to export.")
  }

  const jsPDFModule = await import("jspdf")
  const jsPDF = jsPDFModule.default
  const autoTableModule = await import("jspdf-autotable")
  if (autoTableModule.applyPlugin) {
    autoTableModule.applyPlugin(jsPDF)
  }

  const isSingleVenue = visibleVenues.length === 1
  const orientation = isSingleVenue ? "portrait" : "landscape"
  const doc = new jsPDF({
    orientation,
    unit: "pt",
    format: isSingleVenue ? "a4" : getMultiVenuePageFormat(visibleVenues.length),
    compress: true
  })
  const margin = 28
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const allHours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
  const hourChunks = splitHoursForReadablePages(allHours, !isSingleVenue)
  const scheduleBlocks = sortTimeBlocks(Array.isArray(timeBlocks) ? timeBlocks : [])
  const venueChunks = isSingleVenue ? splitIntoChunks(visibleVenues, 1) : [visibleVenues]
  let hasContent = false

  visibleDays.forEach((day) => {
    venueChunks.forEach((venueChunk, venueChunkIndex) => {
      const dayBlocks = scheduleBlocks.filter((block) => (
        Number(block.day) === Number(day.value) &&
        venueChunk.some((venue) => isVenueAllowedForBlock(block, venue))
      ))
      const rowChunks = dayBlocks.length > 0 ? splitBlocksForReadablePages(dayBlocks, !isSingleVenue) : hourChunks

      rowChunks.forEach((rowChunk, hourChunkIndex) => {
        if (hasContent) doc.addPage(orientation)
        hasContent = true

        const isScheduleChunk = dayBlocks.length > 0
        const hourLabel = isScheduleChunk
          ? `${formatMinutesAsClock(rowChunk[0].startMinutes)} - ${formatMinutesAsClock(rowChunk[rowChunk.length - 1].endMinutes)}`
          : `${formatHourLabel(rowChunk[0])} - ${formatHourLabel(rowChunk[rowChunk.length - 1] + 1)}`
        const venueLabel = venueChunk.join(", ")
        const startY = drawHeader(doc, {
          title,
          programTitle,
          conferenceTitle,
          dayLabel: day.label,
          venueLabel,
          hourLabel,
          generatedAt,
          margin,
        })

        const body = rowChunk.map((rowItem) => (
          isScheduleChunk
            ? [
                formatBlockTimeRange(rowItem),
                ...venueChunk.map((venue) => buildBlockCellText(rowItem, venue, getBlockSessionsForExport(timetableRows, day.value, venue, rowItem))),
              ]
            : [
                formatSlotRange(rowItem),
                ...venueChunk.map((venue) => buildCellText(getCellSessionsForExport(timetableRows, day.value, venue, rowItem))),
              ]
        ))

        const pageWidth = doc.internal.pageSize.width
        const usableWidth = pageWidth - (margin * 2)
        const timeColumnWidth = isSingleVenue ? 96 : 82
        const venueWidth = (usableWidth - timeColumnWidth) / venueChunk.length
        const density = getTableDensity(venueChunk.length, isSingleVenue)
        const columnStyles = {
          0: {
            cellWidth: timeColumnWidth,
            fontStyle: "bold",
            fillColor: [248, 250, 252],
            textColor: [51, 65, 85],
          },
        }

        venueChunk.forEach((_, index) => {
          columnStyles[index + 1] = { cellWidth: venueWidth }
        })

        doc.autoTable({
          startY,
          head: [["Time", ...venueChunk]],
          body,
          theme: "grid",
          margin: { left: margin, right: margin },
          styles: {
            fontSize: density.fontSize,
            cellPadding: density.cellPadding,
            overflow: "linebreak",
            valign: "top",
            lineColor: [226, 232, 240],
            lineWidth: 0.4,
            minCellHeight: density.minCellHeight,
          },
          headStyles: {
            fillColor: [11, 113, 134],
            textColor: 255,
            fontStyle: "bold",
            halign: "left",
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251],
          },
          columnStyles,
          didDrawPage: () => {
            const pageNumber = doc.internal.getNumberOfPages()
            const pageHeight = doc.internal.pageSize.height
            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)
            doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 14, { align: "right" })
          },
        })

        if (!isSingleVenue && (venueChunks.length > 1 || hourChunks.length > 1)) {
          const pageHeight = doc.internal.pageSize.height
          doc.setFontSize(7)
          doc.setTextColor(100, 116, 139)
          doc.text(
            `Section ${venueChunkIndex + 1}/${venueChunks.length}, time block ${hourChunkIndex + 1}/${rowChunks.length}`,
            margin,
            pageHeight - 14
          )
        }
      })
    })
  })

  doc.save(`${sanitizeFilePart(fileName || programTitle || "REC_Time_Slots")}.pdf`)
}

export const exportRecTimetableCsv = ({
  programTitle,
  conferenceTitle,
  days,
  venues,
  rows,
  fileName,
  startHour = CONFERENCE_START_HOUR,
  endHour = CONFERENCE_END_HOUR,
  timeBlocks = [],
}) => {
  const visibleDays = Array.isArray(days) ? days : []
  const visibleVenues = Array.isArray(venues) ? venues : []
  const timetableRows = Array.isArray(rows) ? rows : []

  if (!visibleDays.length || !visibleVenues.length) {
    throw new Error("No timetable data is available to export.")
  }

  const allHours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
  const scheduleBlocks = sortTimeBlocks(Array.isArray(timeBlocks) ? timeBlocks : [])
  const csvRows = [[
    "Program",
    "Conference",
    "Day",
    "Time Slot",
    "Venue",
    "Session Title",
    "Start Time",
    "End Time",
    "Theme",
    "Organizer",
    "Status",
    "Overlap Count",
  ]]

  visibleDays.forEach((day) => {
    const dayBlocks = scheduleBlocks.filter((block) => (
      Number(block.day) === Number(day.value) &&
      visibleVenues.some((venue) => isVenueAllowedForBlock(block, venue))
    ))
    const rowChunks = dayBlocks.length > 0
      ? splitBlocksForReadablePages(dayBlocks, visibleVenues.length > 1)
      : splitHoursForReadablePages(allHours, visibleVenues.length > 1)

    rowChunks.forEach((rowChunk) => {
      rowChunk.forEach((rowItem) => {
        visibleVenues.forEach((venue) => {
          const isScheduleRow = dayBlocks.length > 0
          if (isScheduleRow && !isVenueAllowedForBlock(rowItem, venue)) {
            return
          }

          const sessions = isScheduleRow
            ? getBlockSessionsForExport(timetableRows, day.value, venue, rowItem)
            : getCellSessionsForExport(timetableRows, day.value, venue, rowItem)
          const slotLabel = isScheduleRow ? formatBlockTimeRange(rowItem) : formatSlotRange(rowItem)

          if (isScheduleRow && !rowItem.allowSessions) {
            csvRows.push([
              programTitle || "",
              conferenceTitle || "",
              day.label,
              slotLabel,
              venue,
              rowItem.label || "",
              "",
              "",
              TIME_BLOCK_TYPE_LABELS[rowItem.type] || rowItem.type || "",
              "",
              rowItem.allowSessions ? "Available" : "Blocked",
              "",
            ])
            return
          }

          if (!sessions.length) {
            csvRows.push([
              programTitle || "",
              conferenceTitle || "",
              day.label,
              slotLabel,
              venue,
              "",
              "",
              "",
              "",
              "",
              "Available",
              "",
            ])
            return
          }

          sessions.forEach((session) => {
            csvRows.push([
              programTitle || "",
              conferenceTitle || "",
              day.label,
              slotLabel,
              venue,
              session.title || "Untitled Session",
              session.startTimeLabel || "",
              session.endTimeLabel || "",
              session.theme || "",
              session.organizer || "",
              session.statusLabel || "",
              session.conflictIds?.length || 0,
            ])
          })
        })
      })
    })
  })

  const csv = csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n")
  downloadTextFile(csv, `${sanitizeFilePart(fileName || programTitle || "REC_Time_Slots")}.csv`, "text/csv;charset=utf-8")
}

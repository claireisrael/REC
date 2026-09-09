export const KAMPALA_TIME_ZONE = "Africa/Kampala"
export const KAMPALA_OFFSET = "+03:00"

export const TIME_BLOCK_TYPES = {
  SESSION: "SESSION",
  BREAK: "BREAK",
  LUNCH: "LUNCH",
  SOCIAL: "SOCIAL",
  CEREMONY: "CEREMONY",
  EXHIBITION: "EXHIBITION",
  OTHER: "OTHER",
}

export const TIME_BLOCK_TYPE_LABELS = {
  [TIME_BLOCK_TYPES.SESSION]: "Session",
  [TIME_BLOCK_TYPES.BREAK]: "Break / Tea",
  [TIME_BLOCK_TYPES.LUNCH]: "Lunch Break",
  [TIME_BLOCK_TYPES.SOCIAL]: "Social Activity",
  [TIME_BLOCK_TYPES.CEREMONY]: "Ceremony",
  [TIME_BLOCK_TYPES.EXHIBITION]: "Exhibition",
  [TIME_BLOCK_TYPES.OTHER]: "Other Activity",
}

export const SESSION_SPAN_TYPES = {
  CUSTOM: "CUSTOM",
  SINGLE_BLOCK: "SINGLE_BLOCK",
  MORNING_HALF: "MORNING_HALF",
  AFTERNOON_HALF: "AFTERNOON_HALF",
  FULL_DAY: "FULL_DAY",
  MULTI_BLOCK: "MULTI_BLOCK",
}

export const SESSION_SPAN_TYPE_LABELS = {
  [SESSION_SPAN_TYPES.SINGLE_BLOCK]: "Single Schedule Block",
  [SESSION_SPAN_TYPES.MORNING_HALF]: "Morning Half Day",
  [SESSION_SPAN_TYPES.AFTERNOON_HALF]: "Afternoon Half Day",
  [SESSION_SPAN_TYPES.FULL_DAY]: "Full Day",
  [SESSION_SPAN_TYPES.MULTI_BLOCK]: "Multiple Blocks",
  [SESSION_SPAN_TYPES.CUSTOM]: "Custom Time Inside Block",
}

export const VENUE_SCOPES = {
  ALL: "ALL",
  SELECTED: "SELECTED",
}

export const DEFAULT_PROGRAM_BLOCKS = [
  { start: "08:30", end: "10:30", type: TIME_BLOCK_TYPES.SESSION, label: "Morning Session", allowSessions: true },
  { start: "10:30", end: "11:00", type: TIME_BLOCK_TYPES.BREAK, label: "Tea Break", allowSessions: false },
  { start: "11:00", end: "13:00", type: TIME_BLOCK_TYPES.SESSION, label: "Late Morning Session", allowSessions: true },
  { start: "13:00", end: "14:00", type: TIME_BLOCK_TYPES.LUNCH, label: "Lunch Break", allowSessions: false },
  { start: "14:00", end: "15:30", type: TIME_BLOCK_TYPES.SESSION, label: "Afternoon Session", allowSessions: true },
  { start: "15:30", end: "17:00", type: TIME_BLOCK_TYPES.SESSION, label: "Late Afternoon Session", allowSessions: true },
]

export const normalizeDateOnlyValue = (dateValue = "") => {
  const match = String(dateValue).match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

export const hasExplicitTimezone = (dateTime = "") => /(?:Z|[+-]\d{2}:\d{2})$/.test(String(dateTime))

export const formatDateForKampalaInput = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KAMPALA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value
    return acc
  }, {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export const getKampalaDateTimeLocalValue = (dateTime) => {
  if (!dateTime) return ""

  if (hasExplicitTimezone(dateTime)) {
    const date = new Date(dateTime)
    if (!Number.isNaN(date.getTime())) {
      return formatDateForKampalaInput(date)
    }
  }

  const match = String(dateTime).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?/)
  return match ? `${match[1]}T${match[2]}` : ""
}

export const getKampalaDateOnlyValue = (dateTime) => {
  if (!dateTime) return ""

  if (hasExplicitTimezone(dateTime)) {
    const date = new Date(dateTime)
    if (!Number.isNaN(date.getTime())) {
      return formatDateForKampalaInput(date).split("T")[0]
    }
  }

  return normalizeDateOnlyValue(dateTime)
}

export const addDaysToDateValue = (dateValue, daysToAdd) => {
  const normalized = normalizeDateOnlyValue(dateValue)
  if (!normalized) return ""

  const [year, month, day] = normalized.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd))
  return date.toISOString().split("T")[0]
}

export const parseTimeToMinutes = (timeValue = "") => {
  const match = String(timeValue).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return Number.NaN

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
    return Number.NaN
  }
  if (hours === 24 && minutes !== 0) return Number.NaN

  return (hours * 60) + minutes
}

export const formatMinutesAsTimeInput = (minutesValue) => {
  const minutes = Number(minutesValue)
  if (Number.isNaN(minutes)) return ""

  const bounded = Math.max(0, Math.min(1440, minutes))
  const hours = Math.floor(bounded / 60)
  const mins = bounded % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

export const formatMinutesAsClock = (minutesValue) => {
  const minutes = Number(minutesValue)
  if (Number.isNaN(minutes)) return "TBD"

  const bounded = Math.max(0, Math.min(1440, minutes))
  const hours24 = Math.floor(bounded / 60)
  const mins = bounded % 60
  const period = hours24 >= 12 && hours24 < 24 ? "PM" : "AM"
  const displayHour = hours24 === 0 || hours24 === 24 ? 12 : hours24 > 12 ? hours24 - 12 : hours24

  return `${String(displayHour).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`
}

export const formatBlockTimeRange = (block) => (
  `${formatMinutesAsClock(block.startMinutes)} - ${formatMinutesAsClock(block.endMinutes)}`
)

const addDaysForMinutes = (dateValue, minutes) => {
  const normalized = normalizeDateOnlyValue(dateValue)
  if (!normalized) return ""

  const [year, month, day] = normalized.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + Math.floor(minutes / 1440)))
  return date.toISOString().split("T")[0]
}

export const buildKampalaDateTime = (dateValue, minutesValue) => {
  const minutes = Number(minutesValue)
  if (!dateValue || Number.isNaN(minutes)) return ""

  const datePart = addDaysForMinutes(dateValue, minutes)
  const dayMinutes = ((minutes % 1440) + 1440) % 1440
  const timePart = formatMinutesAsTimeInput(dayMinutes)
  if (!datePart || !timePart) return ""

  return `${datePart}T${timePart}:00.000${KAMPALA_OFFSET}`
}

export const sortTimeBlocks = (blocks = []) => (
  [...blocks].sort((a, b) => {
    if (Number(a.day) !== Number(b.day)) return Number(a.day) - Number(b.day)
    if (Number(a.startMinutes) !== Number(b.startMinutes)) return Number(a.startMinutes) - Number(b.startMinutes)
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
  })
)

export const isSessionAllowedBlock = (block) => Boolean(block?.allowSessions)

export const isVenueAllowedForBlock = (block, venueHall) => {
  if (!block) return false
  if (block.venueScope !== VENUE_SCOPES.SELECTED) return true

  const halls = Array.isArray(block.venueHalls) ? block.venueHalls : []
  return halls.includes(venueHall)
}

const isSelectedVenueBlock = (block) => (
  block?.venueScope === VENUE_SCOPES.SELECTED &&
  Array.isArray(block.venueHalls) &&
  block.venueHalls.length > 0
)

const blocksShareScheduleLane = (firstBlock, secondBlock) => {
  const firstSelected = isSelectedVenueBlock(firstBlock)
  const secondSelected = isSelectedVenueBlock(secondBlock)

  if (!firstSelected && !secondSelected) return true
  if (!firstSelected || !secondSelected) return false

  const secondVenues = new Set(secondBlock.venueHalls)
  return firstBlock.venueHalls.some((venue) => secondVenues.has(venue))
}

const blocksOverlapInTime = (firstBlock, secondBlock) => (
  Number(firstBlock.startMinutes) < Number(secondBlock.endMinutes) &&
  Number(secondBlock.startMinutes) < Number(firstBlock.endMinutes)
)

export const createDefaultProgramTimeBlocks = ({ program, conference, programDays }) => {
  const dayCount = Number(program?.daysCount) || Number(conference?.daysCount) || programDays?.length || 1
  const fallbackStartDate = getKampalaDateOnlyValue(conference?.startDate)

  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1
    const date = programDays?.[index]?.date || addDaysToDateValue(fallbackStartDate, index)

    return DEFAULT_PROGRAM_BLOCKS.map((block, blockIndex) => {
      const startMinutes = parseTimeToMinutes(block.start)
      const endMinutes = parseTimeToMinutes(block.end)

      return {
        localId: `default-${day}-${blockIndex}`,
        conferenceId: program?.conferenceId || conference?.$id || "",
        programId: program?.$id || "",
        day,
        date,
        startMinutes,
        endMinutes,
        startTime: buildKampalaDateTime(date, startMinutes),
        endTime: buildKampalaDateTime(date, endMinutes),
        type: block.type,
        label: block.label,
        allowSessions: block.allowSessions,
        venueScope: VENUE_SCOPES.ALL,
        venueHalls: [],
        sortOrder: blockIndex,
        notes: "",
      }
    })
  }).flat()
}

export const normalizeTimeBlockForSave = (block, context = {}) => {
  const day = Number(block.day)
  const startMinutes = Number(block.startMinutes)
  const endMinutes = Number(block.endMinutes)
  const date = normalizeDateOnlyValue(block.date || context.date)

  return {
    conferenceId: block.conferenceId || context.conferenceId || "",
    programId: block.programId || context.programId || "",
    day,
    date,
    startTime: buildKampalaDateTime(date, startMinutes),
    endTime: buildKampalaDateTime(date, endMinutes),
    startMinutes,
    endMinutes,
    type: block.type || TIME_BLOCK_TYPES.SESSION,
    label: String(block.label || "").trim(),
    allowSessions: Boolean(block.allowSessions),
    venueScope: block.venueScope || VENUE_SCOPES.ALL,
    venueHalls: block.venueScope === VENUE_SCOPES.SELECTED && Array.isArray(block.venueHalls) ? block.venueHalls : [],
    sortOrder: Number(block.sortOrder || 0),
    notes: block.notes || "",
  }
}

export const validateTimeBlocks = (blocks = []) => {
  const errors = []
  const normalized = sortTimeBlocks(blocks)

  normalized.forEach((block, index) => {
    if (!Number(block.day) || Number(block.day) < 1) errors.push(`Block ${index + 1}: day is required.`)
    if (!block.label?.trim()) errors.push(`Block ${index + 1}: label is required.`)
    if (Number.isNaN(Number(block.startMinutes)) || Number.isNaN(Number(block.endMinutes))) {
      errors.push(`Block ${index + 1}: start and end times are required.`)
    } else if (Number(block.startMinutes) >= Number(block.endMinutes)) {
      errors.push(`Block ${index + 1}: end time must be after start time.`)
    }
    if (block.venueScope === VENUE_SCOPES.SELECTED && (!Array.isArray(block.venueHalls) || block.venueHalls.length === 0)) {
      errors.push(`Block ${index + 1}: select at least one venue or use all venues.`)
    }
  })

  const byDay = new Map()
  normalized.forEach((block) => {
    const day = Number(block.day)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(block)
  })

  byDay.forEach((dayBlocks, day) => {
    for (let firstIndex = 0; firstIndex < dayBlocks.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < dayBlocks.length; secondIndex += 1) {
        if (
          blocksShareScheduleLane(dayBlocks[firstIndex], dayBlocks[secondIndex]) &&
          blocksOverlapInTime(dayBlocks[firstIndex], dayBlocks[secondIndex])
        ) {
          errors.push(`Day ${day}: schedule blocks cannot overlap within the same venue scope.`)
          return
        }
      }
    }
  })

  return errors
}

const getLunchBlock = (blocks) => sortTimeBlocks(blocks).find((block) => block.type === TIME_BLOCK_TYPES.LUNCH)

const resolveHalfDayBlocks = (blocks, spanType) => {
  const sessionBlocks = sortTimeBlocks(blocks).filter(isSessionAllowedBlock)
  if (!sessionBlocks.length) return []

  const lunchBlock = getLunchBlock(blocks)
  if (lunchBlock && spanType === SESSION_SPAN_TYPES.MORNING_HALF) {
    return sessionBlocks.filter((block) => Number(block.endMinutes) <= Number(lunchBlock.startMinutes))
  }
  if (lunchBlock && spanType === SESSION_SPAN_TYPES.AFTERNOON_HALF) {
    return sessionBlocks.filter((block) => Number(block.startMinutes) >= Number(lunchBlock.endMinutes))
  }

  const midpoint = Math.ceil(sessionBlocks.length / 2)
  return spanType === SESSION_SPAN_TYPES.MORNING_HALF
    ? sessionBlocks.slice(0, midpoint)
    : sessionBlocks.slice(midpoint)
}

export const getBlocksForSessionSpan = ({
  day,
  venueHall,
  spanType,
  selectedBlockIds = [],
  timeBlocks = [],
}) => {
  const dayBlocks = sortTimeBlocks(timeBlocks).filter((block) => Number(block.day) === Number(day))
  const selectableBlocks = dayBlocks.filter((block) => isSessionAllowedBlock(block) && isVenueAllowedForBlock(block, venueHall))
  const selectedSet = new Set(selectedBlockIds)

  if (spanType === SESSION_SPAN_TYPES.FULL_DAY) return selectableBlocks
  if (spanType === SESSION_SPAN_TYPES.MORNING_HALF || spanType === SESSION_SPAN_TYPES.AFTERNOON_HALF) {
    return resolveHalfDayBlocks(selectableBlocks, spanType)
  }
  if (spanType === SESSION_SPAN_TYPES.SINGLE_BLOCK || spanType === SESSION_SPAN_TYPES.CUSTOM) {
    const selected = selectableBlocks.find((block) => selectedSet.has(block.$id || block.localId))
    return selected ? [selected] : []
  }
  if (spanType === SESSION_SPAN_TYPES.MULTI_BLOCK) {
    return selectableBlocks.filter((block) => selectedSet.has(block.$id || block.localId))
  }

  return []
}

export const deriveSessionTimingFromBlocks = ({
  day,
  date,
  venueHall,
  spanType,
  selectedBlockIds = [],
  customStartMinutes,
  customEndMinutes,
  timeBlocks = [],
}) => {
  const resolvedBlocks = getBlocksForSessionSpan({ day, venueHall, spanType, selectedBlockIds, timeBlocks })

  if (!resolvedBlocks.length) {
    return { valid: false, error: "Select at least one valid session time block." }
  }

  if (spanType === SESSION_SPAN_TYPES.CUSTOM) {
    const hostBlock = resolvedBlocks[0]
    const startMinutes = Number(customStartMinutes)
    const endMinutes = Number(customEndMinutes)

    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
      return { valid: false, error: "Enter valid custom start and end times." }
    }
    if (startMinutes >= endMinutes) {
      return { valid: false, error: "End time must be after start time." }
    }
    if (startMinutes < Number(hostBlock.startMinutes) || endMinutes > Number(hostBlock.endMinutes)) {
      return { valid: false, error: "Custom time must stay inside the selected session block." }
    }

    return {
      valid: true,
      timeBlockIds: [hostBlock.$id || hostBlock.localId],
      startTime: buildKampalaDateTime(date || hostBlock.date, startMinutes),
      toTime: buildKampalaDateTime(date || hostBlock.date, endMinutes),
      startMinutes,
      endMinutes,
      blocks: resolvedBlocks,
    }
  }

  const sortedBlocks = sortTimeBlocks(resolvedBlocks)
  const startMinutes = Number(sortedBlocks[0].startMinutes)
  const endMinutes = Number(sortedBlocks[sortedBlocks.length - 1].endMinutes)

  return {
    valid: true,
    timeBlockIds: sortedBlocks.map((block) => block.$id || block.localId).filter(Boolean),
    startTime: buildKampalaDateTime(date || sortedBlocks[0].date, startMinutes),
    toTime: buildKampalaDateTime(date || sortedBlocks[sortedBlocks.length - 1].date, endMinutes),
    startMinutes,
    endMinutes,
    blocks: sortedBlocks,
  }
}

export const getSessionBlocks = (session, timeBlocks = []) => {
  const selectedIds = Array.isArray(session?.timeBlockIds) ? new Set(session.timeBlockIds) : new Set()
  if (selectedIds.size > 0) {
    const selectedBlocks = sortTimeBlocks(timeBlocks).filter((block) => selectedIds.has(block.$id || block.localId))
    if (selectedBlocks.length > 0) return selectedBlocks
  }

  const startMinutes = Number(session?.startMinutes)
  const endMinutes = Number(session?.endMinutes)
  const day = Number(session?.dayNumber || session?.day)
  const venue = session?.venueKey || session?.venueHall

  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return []

  return sortTimeBlocks(timeBlocks).filter((block) => (
    Number(block.day) === day &&
    isSessionAllowedBlock(block) &&
    isVenueAllowedForBlock(block, venue) &&
    startMinutes < Number(block.endMinutes) &&
    endMinutes > Number(block.startMinutes)
  ))
}

export const sessionOccupiesBlock = (session, block) => {
  const blockId = block?.$id || block?.localId
  if (!session || !block) return false

  if (Array.isArray(session.timeBlockIds) && session.timeBlockIds.length > 0) {
    if (session.timeBlockIds.includes(blockId)) return true
  }

  return (
    Number(session.dayNumber || session.day) === Number(block.day) &&
    Number(session.startMinutes) < Number(block.endMinutes) &&
    Number(session.endMinutes) > Number(block.startMinutes)
  )
}

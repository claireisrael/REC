import { Query, ID } from "appwrite";
import { config } from "./config";

/**
 * Status options for conference sessions
 */
export const SESSION_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ONGOING: "ONGOING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
};

const MAX_SESSION_UPDATE_HISTORY_ENTRIES = 100;

export const parseRecSessionUpdateHistory = (updateHistory) => {
  if (!updateHistory) return [];
  if (!Array.isArray(updateHistory) && typeof updateHistory !== "string") return [];

  try {
    const parsedHistory = Array.isArray(updateHistory) ? updateHistory : JSON.parse(updateHistory);
    if (!Array.isArray(parsedHistory)) return [];

    return parsedHistory
      .filter((entry) => entry && typeof entry === "object" && entry.updatedAt)
      .map((entry) => ({
        userId: entry.userId ? String(entry.userId) : "",
        updatedAt: String(entry.updatedAt)
      }));
  } catch (error) {
    console.error("Error parsing REC session update history:", error);
    return [];
  }
};

const stringifyRecSessionUpdateHistory = (history) => (
  JSON.stringify(history.slice(-MAX_SESSION_UPDATE_HISTORY_ENTRIES))
);

/**
 * Get sessions status badge configuration
 */
export const getStatusConfig = (status) => {
  const configs = {
    [SESSION_STATUS.DRAFT]: { bg: "secondary", icon: "📝", label: "Draft" },
    [SESSION_STATUS.PUBLISHED]: { bg: "success", icon: "✅", label: "Published" },
    [SESSION_STATUS.ONGOING]: { bg: "warning", icon: "🟡", label: "Ongoing" },
    [SESSION_STATUS.COMPLETED]: { bg: "primary", icon: "✅", label: "Completed" },
    [SESSION_STATUS.CANCELLED]: { bg: "danger", icon: "❌", label: "Cancelled" }
  };
  return configs[status] || configs[SESSION_STATUS.DRAFT];
};

/**
 * Calculate conference days from start and end dates
 * @param {string} startDate - Conference start date (YYYY-MM-DD)
 * @param {string} endDate - Conference end date (YYYY-MM-DD)
 * @returns {Array} Array of day options
 */
export const calculateConferenceDays = (startDate, endDate) => {
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = [];

  let currentDate = new Date(start);
  let dayNumber = 1;

  while (currentDate <= end) {
    const dayLabel = currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });

    days.push({
      value: dayNumber,
      label: `Day ${dayNumber} - ${dayLabel}`,
      date: currentDate.toISOString().split('T')[0]
    });

    currentDate.setDate(currentDate.getDate() + 1);
    dayNumber++;
  }

  return days;
};

/**
 * Create a new conference session
 * @param {Object} sessionData - Session form data
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {string} userId - ID of the user creating the session
 * @returns {Promise<Object>} Created session document
 */
export const createRecSession = async (sessionData, appwriteServices, userId) => {
  try {
    const sessionPayload = {
      ...sessionData,
      createdBy: userId,
      updateHistory: "[]",
      status: sessionData.status || SESSION_STATUS.DRAFT,
      createdAt: new Date().toISOString()
    };

    const response = await appwriteServices.databases.createDocument(
      config.databaseId,
      config.recSessionsCollectionId,
      ID.unique(),
      sessionPayload
    );

    return response;
  } catch (error) {
    console.error("Error creating REC session:", error);
    throw error;
  }
};

/**
 * Update an existing conference session
 * @param {string} sessionId - Session document ID
 * @param {Object} updateData - Data to update
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {string} userId - Optional ID of the user updating the session
 * @returns {Promise<Object>} Updated session document
 */
export const updateRecSession = async (sessionId, updateData, appwriteServices, userId = "") => {
  try {
    const updatedAt = new Date().toISOString();
    const updaterUserId = userId ? String(userId) : "";
    let updateHistory = updateData.updateHistory;

    if (updaterUserId) {
      const currentSession = await appwriteServices.databases.getDocument(
        config.databaseId,
        config.recSessionsCollectionId,
        sessionId
      );
      updateHistory = stringifyRecSessionUpdateHistory([
        ...parseRecSessionUpdateHistory(currentSession.updateHistory),
        { userId: updaterUserId, updatedAt }
      ]);
    }

    const response = await appwriteServices.databases.updateDocument(
      config.databaseId,
      config.recSessionsCollectionId,
      sessionId,
      {
        ...updateData,
        ...(typeof updateHistory !== "undefined" ? { updateHistory } : {}),
        updatedAt
      }
    );

    return response;
  } catch (error) {
    console.error("Error updating REC session:", error);
    throw error;
  }
};

/**
 * Get a REC session by document ID
 * @param {string} sessionId - Session document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Session document
 */
export const getRecSessionById = async (sessionId, appwriteServices) => {
  try {
    return await appwriteServices.databases.getDocument(
      config.databaseId,
      config.recSessionsCollectionId,
      sessionId
    );
  } catch (error) {
    console.error("Error fetching REC session:", error);
    throw error;
  }
};

/**
 * Delete a conference session
 * @param {string} sessionId - Session document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<void>}
 */
export const deleteRecSession = async (sessionId, appwriteServices) => {
  try {
    await appwriteServices.databases.deleteDocument(
      config.databaseId,
      config.recSessionsCollectionId,
      sessionId
    );
  } catch (error) {
    console.error("Error deleting REC session:", error);
    throw error;
  }
};

/**
 * Get sessions by conference ID (legacy support)
 * @param {string} conferenceId - Conference document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} additionalQueries - Additional query filters
 * @returns {Promise<Object>} List of session documents
 */
export const getSessionsByConference = async (conferenceId, appwriteServices, additionalQueries = []) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recSessionsCollectionId,
      [
        Query.equal("conferenceId", conferenceId),
        Query.orderAsc("day"),
        Query.orderAsc("startTime"),
        Query.limit(1000),
        ...additionalQueries
      ]
    );

    return response;
  } catch (error) {
    console.error("Error fetching sessions by conference:", error);
    throw error;
  }
};

/**
 * Get sessions by program ID
 * @param {string} programId - Program document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} additionalQueries - Additional query filters
 * @returns {Promise<Object>} List of session documents
 */
export const getSessionsByProgram = async (programId, appwriteServices, additionalQueries = []) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recSessionsCollectionId,
      [
        Query.equal("programId", programId),
        Query.orderAsc("day"),
        Query.orderAsc("startTime"),
        Query.limit(1000),
        ...additionalQueries
      ]
    );

    console.log("Sessions for program:", response);

    return response;
  } catch (error) {
    console.error("Error fetching sessions by program:", error);
    throw error;
  }
};

/**
 * Get sessions by day for a conference
 * @param {string} conferenceId - Conference document ID
 * @param {number} day - Day number
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} List of session documents for the day
 */
export const getSessionsByDay = async (conferenceId, day, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recSessionsCollectionId,
      [
        Query.equal("conferenceId", conferenceId),
        Query.equal("day", day),
        Query.orderAsc("startTime"),
        Query.limit(1000),
      ]
    );

    return response;
  } catch (error) {
    console.error("Error fetching sessions by day:", error);
    throw error;
  }
};

/**
 * Get sessions by status
 * @param {string} conferenceId - Conference document ID
 * @param {string} status - Session status
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} List of session documents
 */
export const getSessionsByStatus = async (conferenceId, status, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recSessionsCollectionId,
      [
        Query.equal("conferenceId", conferenceId),
        Query.equal("status", status),
        Query.orderAsc("day"),
        Query.orderAsc("startTime"),
        Query.limit(1000),
      ]
    );

    return response;
  } catch (error) {
    console.error("Error fetching sessions by status:", error);
    throw error;
  }
};

/**
 * Get all sessions with pagination
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} queries - Additional query filters
 * @param {number} limit - Number of documents to return
 * @param {number} offset - Number of documents to skip
 * @returns {Promise<Object>} List of session documents
 */
export const getAllRecSessions = async (appwriteServices, queries = [], limit = 100, offset = 0) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recSessionsCollectionId,
      [
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
        Query.offset(offset),
        ...queries
      ]
    );

    return response;
  } catch (error) {
    console.error("Error fetching all REC sessions:", error);
    throw error;
  }
};

/**
 * Update session status based on time
 * @param {string} sessionId - Session document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated session document
 */
export const updateSessionStatusByTime = async (sessionId, appwriteServices) => {
  try {
    // Get the session first
    const session = await appwriteServices.databases.getDocument(
      config.databaseId,
      config.recSessionsCollectionId,
      sessionId
    );

    const now = new Date();
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.toTime);

    let newStatus = session.status;

    // Determine status based on time
    if (session.status !== SESSION_STATUS.CANCELLED) {
      if (now >= startTime && now <= endTime) {
        newStatus = SESSION_STATUS.ONGOING;
      } else if (now > endTime) {
        newStatus = SESSION_STATUS.COMPLETED;
      }
    }

    // Update if status changed
    if (newStatus !== session.status) {
      return await updateRecSession(sessionId, { status: newStatus }, appwriteServices);
    }

    return session;
  } catch (error) {
    console.error("Error updating session status by time:", error);
    throw error;
  }
};

/**
 * Get session analytics for a conference
 * @param {string} conferenceId - Conference document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Session analytics data
 */
export const getSessionAnalytics = async (conferenceId, appwriteServices) => {
  try {
    const sessions = await getSessionsByConference(conferenceId, appwriteServices);

    const analytics = {
      total: sessions.documents.length,
      byStatus: {
        [SESSION_STATUS.DRAFT]: 0,
        [SESSION_STATUS.PUBLISHED]: 0,
        [SESSION_STATUS.ONGOING]: 0,
        [SESSION_STATUS.COMPLETED]: 0,
        [SESSION_STATUS.CANCELLED]: 0
      },
      byDay: {},
      byTheme: {},
      byVenue: {},
      byOrganizer: {},
      averageSessionDuration: 0,
      totalDuration: 0
    };

    let totalMinutes = 0;

    sessions.documents.forEach(session => {
      // Count by status
      analytics.byStatus[session.status] = (analytics.byStatus[session.status] || 0) + 1;

      // Count by day
      analytics.byDay[session.day] = (analytics.byDay[session.day] || 0) + 1;

      // Count by theme
      if (session.theme) {
        analytics.byTheme[session.theme] = (analytics.byTheme[session.theme] || 0) + 1;
      }

      // Count by venue
      if (session.venueHall) {
        analytics.byVenue[session.venueHall] = (analytics.byVenue[session.venueHall] || 0) + 1;
      }

      // Count by organizer
      if (session.organizer) {
        analytics.byOrganizer[session.organizer] = (analytics.byOrganizer[session.organizer] || 0) + 1;
      }

      // Calculate duration
      if (session.startTime && session.toTime) {
        const start = new Date(session.startTime);
        const end = new Date(session.toTime);
        const durationMinutes = (end - start) / (1000 * 60);
        totalMinutes += durationMinutes;
      }
    });

    analytics.totalDuration = totalMinutes;
    analytics.averageSessionDuration = analytics.total > 0 ? Math.round(totalMinutes / analytics.total) : 0;

    return analytics;
  } catch (error) {
    console.error("Error getting session analytics:", error);
    throw error;
  }
};

/**
 * Bulk update session status
 * @param {Array} sessionIds - Array of session document IDs
 * @param {string} status - New status
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Array>} Array of updated session documents
 */
export const bulkUpdateSessionStatus = async (sessionIds, status, appwriteServices) => {
  try {
    const updates = sessionIds.map(sessionId =>
      updateRecSession(sessionId, { status }, appwriteServices)
    );

    return await Promise.all(updates);
  } catch (error) {
    console.error("Error bulk updating session status:", error);
    throw error;
  }
};

/**
 * Search sessions by text
 * @param {string} conferenceId - Conference document ID
 * @param {string} searchTerm - Text to search for
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Filtered session documents
 */
export const searchSessions = async (conferenceId, searchTerm, appwriteServices) => {
  try {
    const sessions = await getSessionsByConference(conferenceId, appwriteServices);

    const filteredSessions = sessions.documents.filter(session => {
      const searchText = searchTerm.toLowerCase();
      return (
        session.title?.toLowerCase().includes(searchText) ||
        session.theme?.toLowerCase().includes(searchText) ||
        session.organizer?.toLowerCase().includes(searchText) ||
        session.venueHall?.toLowerCase().includes(searchText) ||
        session.preamble?.toLowerCase().includes(searchText)
      );
    });

    return {
      ...sessions,
      documents: filteredSessions,
      total: filteredSessions.length
    };
  } catch (error) {
    console.error("Error searching sessions:", error);
    throw error;
  }
};

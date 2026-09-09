import { Query, ID } from "appwrite";
import { config } from "./config";

/**
 * Status options for conference programs
 */
export const PROGRAM_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED"
};

/**
 * Get programs status badge configuration
 */
export const getProgramStatusConfig = (status) => {
  const configs = {
    [PROGRAM_STATUS.DRAFT]: { bg: "secondary", icon: "📝", label: "Draft" },
    [PROGRAM_STATUS.PUBLISHED]: { bg: "success", icon: "✅", label: "Published" },
    [PROGRAM_STATUS.ARCHIVED]: { bg: "warning", icon: "📦", label: "Archived" }
  };
  return configs[status] || configs[PROGRAM_STATUS.DRAFT];
};

/**
 * Generate program days options from daysCount
 * @param {number} daysCount - Number of program days
 * @returns {Array} Array of day options
 */
export const generateProgramDays = (daysCount) => {
  if (!daysCount || daysCount < 1) return [];

  const days = [];
  for (let i = 1; i <= daysCount; i++) {
    days.push({
      value: i,
      label: `Day ${i}`
    });
  }
  return days;
};

/**
 * Create a new conference program
 * @param {Object} programData - Program form data
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {string} userId - ID of the user creating the program
 * @returns {Promise<Object>} Created program document
 */
export const createRecProgram = async (programData, appwriteServices, userId) => {
  try {
    const programPayload = {
      ...programData,
      createdBy: userId,
      status: programData.status || PROGRAM_STATUS.DRAFT,
      createdAt: new Date().toISOString()
    };

    const response = await appwriteServices.databases.createDocument(
      config.databaseId,
      config.recProgrammesCollectionId,
      ID.unique(),
      programPayload
    );

    return response;
  } catch (error) {
    console.error("Error creating REC program:", error);
    throw error;
  }
};

/**
 * Update an existing conference program
 * @param {string} programId - Program document ID
 * @param {Object} updateData - Data to update
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated program document
 */
export const updateRecProgram = async (programId, updateData, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.updateDocument(
      config.databaseId,
      config.recProgrammesCollectionId,
      programId,
      {
        ...updateData,
        updatedAt: new Date().toISOString()
      }
    );

    return response;
  } catch (error) {
    console.error("Error updating REC program:", error);
    throw error;
  }
};

/**
 * Delete a conference program
 * @param {string} programId - Program document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<void>}
 */
export const deleteRecProgram = async (programId, appwriteServices) => {
  try {
    await appwriteServices.databases.deleteDocument(
      config.databaseId,
      config.recProgrammesCollectionId,
      programId
    );
  } catch (error) {
    console.error("Error deleting REC program:", error);
    throw error;
  }
};

/**
 * Get programs by conference ID
 * @param {string} conferenceId - Conference document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} additionalQueries - Additional query filters
 * @returns {Promise<Object>} List of program documents
 */
export const getProgramsByConference = async (conferenceId, appwriteServices, additionalQueries = []) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recProgrammesCollectionId,
      [
        Query.equal("conferenceId", conferenceId),
        Query.orderAsc("$createdAt"),
        ...additionalQueries
      ]
    );

    return response;
  } catch (error) {
    console.error("Error fetching programs by conference:", error);
    throw error;
  }
};

/**
 * Get program by ID
 * @param {string} programId - Program document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Program document
 */
export const getRecProgramById = async (programId, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.getDocument(
      config.databaseId,
      config.recProgrammesCollectionId,
      programId
    );

    return response;
  } catch (error) {
    console.error("Error fetching REC program by ID:", error);
    throw error;
  }
};

/**
 * Get all programs with pagination
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} queries - Additional query filters
 * @param {number} limit - Number of documents to return
 * @param {number} offset - Number of documents to skip
 * @returns {Promise<Object>} List of program documents
 */
export const getAllRecPrograms = async (appwriteServices, queries = [], limit = 100, offset = 0) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recProgrammesCollectionId,
      [
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
        Query.offset(offset),
        ...queries
      ]
    );

    return response;
  } catch (error) {
    console.error("Error fetching all REC programs:", error);
    throw error;
  }
};

/**
 * Get or create default program for conference
 * @param {string} conferenceId - Conference document ID
 * @param {Object} conference - Conference object
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {string} userId - ID of the user
 * @returns {Promise<Object>} Program document
 */
export const getOrCreateDefaultProgram = async (conferenceId, conference, appwriteServices, userId) => {
  try {
    // First try to get existing programs for this conference
    const programs = await getProgramsByConference(conferenceId, appwriteServices);

    // If programs exist, return the first one (primary program)
    if (programs.documents.length > 0) {
      return programs.documents[0];
    }

    // Calculate default days count from conference dates
    let daysCount = 1;
    if (conference.startDate && conference.endDate) {
      const start = new Date(conference.startDate);
      const end = new Date(conference.endDate);
      daysCount = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }

    // Create default program
    const defaultProgramData = {
      conferenceId: conferenceId,
      title: `${conference.title} - Main Program`,
      description: `Main conference program for ${conference.title}`,
      daysCount: daysCount,
      venueHalls: ["Main Hall", "Conference Room A", "Conference Room B"], // Default venues
      status: PROGRAM_STATUS.DRAFT,
      slug: `${conference.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-main-program`
    };

    const newProgram = await createRecProgram(defaultProgramData, appwriteServices, userId);
    return newProgram;

  } catch (error) {
    console.error("Error getting or creating default program:", error);
    throw error;
  }
};

/**
 * Get program analytics
 * @param {string} programId - Program document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Program analytics data
 */
export const getProgramAnalytics = async (programId, appwriteServices) => {
  try {
    // Note: This would need to be implemented after updating sessions to reference programs
    // For now, return basic program info
    const program = await getRecProgramById(programId, appwriteServices);

    const analytics = {
      program: program,
      totalSessions: 0, // Will be calculated from sessions
      sessionsByDay: {},
      sessionsByVenue: {},
      totalDuration: 0
    };

    return analytics;
  } catch (error) {
    console.error("Error getting program analytics:", error);
    throw error;
  }
};

/**
 * Search programs by text
 * @param {string} conferenceId - Conference document ID (optional)
 * @param {string} searchTerm - Text to search for
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Filtered program documents
 */
export const searchPrograms = async (conferenceId, searchTerm, appwriteServices) => {
  try {
    let queries = [];

    if (conferenceId) {
      queries.push(Query.equal("conferenceId", conferenceId));
    }

    const programs = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recProgrammesCollectionId,
      queries
    );

    const filteredPrograms = programs.documents.filter(program => {
      const searchText = searchTerm.toLowerCase();
      return (
        program.title?.toLowerCase().includes(searchText) ||
        program.description?.toLowerCase().includes(searchText) ||
        program.slug?.toLowerCase().includes(searchText)
      );
    });

    return {
      ...programs,
      documents: filteredPrograms,
      total: filteredPrograms.length
    };
  } catch (error) {
    console.error("Error searching programs:", error);
    throw error;
  }
};
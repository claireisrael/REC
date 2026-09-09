import { Query, ID } from "appwrite";
import { config } from "./config";

/**
 * Upload sponsorship package file to Appwrite storage
 * @param {File} file - File to upload
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<string>} File URL
 */
const uploadSponsorshipPackage = async (file, appwriteServices) => {
  try {
    // Create a unique file ID
    const fileId = `sponsorship-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Upload file to storage
    const uploadedFile = await appwriteServices.storage.createFile(
      config.recConferenceBucketId,
      fileId,
      file
    );
    
    // Generate file URL
    const fileUrl = appwriteServices.storage.getFileView(
      config.recConferenceBucketId,
      uploadedFile.$id
    );
    
    return fileUrl;
  } catch (error) {
    console.error("Error uploading sponsorship package:", error);
    throw error;
  }
};

/**
 * Prepare conference data for storage by stringifying object fields
 * @param {Object} conferenceData - Raw conference data
 * @returns {Object} Conference data with stringified objects
 */
const prepareConferenceDataForStorage = (conferenceData) => {
  const prepared = { ...conferenceData };
  
  // Stringify object fields that Appwrite doesn't support
  if (prepared.registrationFee && typeof prepared.registrationFee === 'object') {
    prepared.registrationFee = JSON.stringify(prepared.registrationFee);
  }
  
  if (prepared.maxLimits && typeof prepared.maxLimits === 'object') {
    prepared.maxLimits = JSON.stringify(prepared.maxLimits);
  }
  
  if (prepared.currentCounts && typeof prepared.currentCounts === 'object') {
    prepared.currentCounts = JSON.stringify(prepared.currentCounts);
  }
  
  if (prepared.days && Array.isArray(prepared.days)) {
    prepared.days = JSON.stringify(prepared.days);
  }

  // Bundle socials, features, and googleMapsUrl into socialsJson
  // This field stores a composite JSON object to work within Appwrite column size limits.
  if (prepared.socialsJson && typeof prepared.socialsJson === 'object') {
    prepared.socialsJson = JSON.stringify(prepared.socialsJson);
  }
  
  return prepared;
};

/**
 * Parse conference data by converting string fields back to objects
 * @param {Object} conferenceDoc - Conference document from database
 * @returns {Object} Conference data with parsed objects
 */
const parseConferenceData = (conferenceDoc) => {
  if (!conferenceDoc) return null;
  
  const parsed = { ...conferenceDoc };
  
  // Parse string fields back to objects
  if (parsed.registrationFee && typeof parsed.registrationFee === 'string') {
    try {
      parsed.registrationFee = JSON.parse(parsed.registrationFee);
      // Ensure no null values in registrationFee object
      if (parsed.registrationFee) {
        parsed.registrationFee = {
          attendee: parsed.registrationFee.attendee ?? 0,
          exhibitor: parsed.registrationFee.exhibitor ?? 500000,
          sponsor: parsed.registrationFee.sponsor ?? 2000000
        };
      }
    } catch (error) {
      console.warn('Error parsing registrationFee:', error);
      parsed.registrationFee = { attendee: 0, exhibitor: 500000, sponsor: 2000000 };
    }
  }
  
  if (parsed.maxLimits && typeof parsed.maxLimits === 'string') {
    try {
      parsed.maxLimits = JSON.parse(parsed.maxLimits);
      // Ensure no null values in maxLimits object
      if (parsed.maxLimits) {
        parsed.maxLimits = {
          attendee: parsed.maxLimits.attendee ?? 800,
          exhibitor: parsed.maxLimits.exhibitor ?? 150,
          sponsor: parsed.maxLimits.sponsor ?? 50
        };
      }
    } catch (error) {
      console.warn('Error parsing maxLimits:', error);
      parsed.maxLimits = { attendee: 800, exhibitor: 150, sponsor: 50 };
    }
  }
  
  if (parsed.currentCounts && typeof parsed.currentCounts === 'string') {
    try {
      parsed.currentCounts = JSON.parse(parsed.currentCounts);
      // Ensure no null values in currentCounts object
      if (parsed.currentCounts) {
        parsed.currentCounts = {
          attendee: parsed.currentCounts.attendee ?? 0,
          exhibitor: parsed.currentCounts.exhibitor ?? 0,
          sponsor: parsed.currentCounts.sponsor ?? 0
        };
      }
    } catch (error) {
      console.warn('Error parsing currentCounts:', error);
      parsed.currentCounts = { attendee: 0, exhibitor: 0, sponsor: 0 };
    }
  }
  
  // Ensure these objects exist even if they weren't stored as strings
  if (!parsed.registrationFee) {
    parsed.registrationFee = { attendee: 0, exhibitor: 500000, sponsor: 2000000 };
  } else {
    // Ensure no null values in existing registrationFee
    parsed.registrationFee = {
      attendee: parsed.registrationFee.attendee ?? 0,
      exhibitor: parsed.registrationFee.exhibitor ?? 500000,
      sponsor: parsed.registrationFee.sponsor ?? 2000000
    };
  }
  
  if (!parsed.maxLimits) {
    parsed.maxLimits = { attendee: 800, exhibitor: 150, sponsor: 50 };
  } else {
    // Ensure no null values in existing maxLimits
    parsed.maxLimits = {
      attendee: parsed.maxLimits.attendee ?? 800,
      exhibitor: parsed.maxLimits.exhibitor ?? 150,
      sponsor: parsed.maxLimits.sponsor ?? 50
    };
  }
  
  if (!parsed.currentCounts) {
    parsed.currentCounts = { attendee: 0, exhibitor: 0, sponsor: 0 };
  } else {
    // Ensure no null values in existing currentCounts
    parsed.currentCounts = {
      attendee: parsed.currentCounts.attendee ?? 0,
      exhibitor: parsed.currentCounts.exhibitor ?? 0,
      sponsor: parsed.currentCounts.sponsor ?? 0
    };
  }
  
  if (parsed.days && typeof parsed.days === 'string') {
    try {
      parsed.days = JSON.parse(parsed.days);
    } catch (error) {
      console.warn('Error parsing days:', error);
      parsed.days = [];
    }
  }

  // Parse socialsJson (composite: socials, features, googleMapsUrl)
  if (parsed.socialsJson && typeof parsed.socialsJson === 'string') {
    try {
      parsed.socialsJson = JSON.parse(parsed.socialsJson);
    } catch (error) {
      console.warn('Error parsing socialsJson:', error);
      parsed.socialsJson = { socials: {}, features: [], googleMapsUrl: '' };
    }
  }
  if (!parsed.socialsJson) {
    parsed.socialsJson = { socials: {}, features: [], googleMapsUrl: '' };
  }

  parsed.couponRequired = parsed.couponRequired === true;
  
  return parsed;
};

/**
 * Create a new REC conference configuration
 * @param {Object} conferenceData - Conference configuration data
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {File} sponsorshipPackageFile - Optional sponsorship package file
 * @returns {Promise<Object>} Created conference document
 */
export const createRecConference = async (conferenceData, appwriteServices, sponsorshipPackageFile = null) => {
  try {
    let finalData = { ...conferenceData };
    
    // Upload sponsorship package if provided
    if (sponsorshipPackageFile) {
      const sponsorshipPackageUrl = await uploadSponsorshipPackage(sponsorshipPackageFile, appwriteServices);
      finalData.sponsorshipPackageUrl = sponsorshipPackageUrl;
    }
    
    const preparedData = prepareConferenceDataForStorage(finalData);
    const response = await appwriteServices.databases.createDocument(
      config.databaseId,
      config.recConferencesCollectionId,
      ID.unique(),
      preparedData
    );
    return parseConferenceData(response);
  } catch (error) {
    console.error("Error creating REC conference:", error);
    throw error;
  }
};

/**
 * Get REC conference by year
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object|null>} Conference document or null if not found
 */
export const getRecConferenceByYear = async (year, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recConferencesCollectionId,
      [Query.equal("year", year)]
    );
    return response.documents.length > 0 ? parseConferenceData(response.documents[0]) : null;
  } catch (error) {
    console.error("Error fetching REC conference by year:", error);
    throw error;
  }
};

/**
 * Get REC conference by document ID
 * @param {string} documentId - Conference document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object|null>} Conference document or null if not found
 */
export const getRecConferenceById = async (documentId, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.getDocument(
      config.databaseId,
      config.recConferencesCollectionId,
      documentId
    );
    return parseConferenceData(response);
  } catch (error) {
    console.error(`Error fetching REC conference by ID ${documentId}:`, error);
    throw error;
  }
};

/**
 * Get active/current REC conference
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object|null>} Active conference document or null if not found
 */
export const getActiveRecConference = async (appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recConferencesCollectionId,
      [
        Query.equal("isActive", true),
        Query.orderDesc("year")
      ]
    );
    return response.documents.length > 0 ? parseConferenceData(response.documents[0]) : null;
  } catch (error) {
    console.error("Error fetching active REC conference:", error);
    throw error;
  }
};

/**
 * Get all REC conferences
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} List of conference documents
 */
export const getAllRecConferences = async (appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recConferencesCollectionId,
      [Query.orderDesc("year")]
    );
    
    // Parse all conference documents
    const parsedDocuments = response.documents.map(doc => parseConferenceData(doc));
    
    return {
      ...response,
      documents: parsedDocuments
    };
  } catch (error) {
    console.error("Error fetching REC conferences:", error);
    throw error;
  }
};

/**
 * Update REC conference
 * @param {string} documentId - Document ID to update
 * @param {Object} updateData - Data to update
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {File} sponsorshipPackageFile - Optional sponsorship package file
 * @returns {Promise<Object>} Updated conference document
 */
export const updateRecConference = async (documentId, updateData, appwriteServices, sponsorshipPackageFile = null) => {
  try {
    let finalData = { ...updateData };
    
    // Upload sponsorship package if provided
    if (sponsorshipPackageFile) {
      const sponsorshipPackageUrl = await uploadSponsorshipPackage(sponsorshipPackageFile, appwriteServices);
      finalData.sponsorshipPackageUrl = sponsorshipPackageUrl;
    }
    
    const preparedData = prepareConferenceDataForStorage(finalData);
    const response = await appwriteServices.databases.updateDocument(
      config.databaseId,
      config.recConferencesCollectionId,
      documentId,
      preparedData
    );
    return parseConferenceData(response);
  } catch (error) {
    console.error("Error updating REC conference:", error);
    throw error;
  }
};

/**
 * Set conference as active (deactivates others)
 * @param {number} year - Conference year to activate
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated conference document
 */
export const setActiveConference = async (year, appwriteServices) => {
  try {
    // First, deactivate all conferences
    const allConferences = await getAllRecConferences(appwriteServices);
    for (const conference of allConferences.documents) {
      if (conference.isActive) {
        await updateRecConference(conference.$id, { isActive: false }, appwriteServices);
      }
    }

    // Then activate the specified year
    const targetConference = await getRecConferenceByYear(year, appwriteServices);
    if (targetConference) {
      return await updateRecConference(targetConference.$id, { isActive: true }, appwriteServices);
    } else {
      throw new Error(`Conference for year ${year} not found`);
    }
  } catch (error) {
    console.error("Error setting active conference:", error);
    throw error;
  }
};

/**
 * Get conference years for dropdown
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Array>} Array of conference years
 */
export const getConferenceYears = async (appwriteServices) => {
  try {
    const response = await getAllRecConferences(appwriteServices);
    return response.documents.map(conf => conf.year).sort((a, b) => b - a);
  } catch (error) {
    console.error("Error fetching conference years:", error);
    throw error;
  }
};

/**
 * Initialize default conference configurations
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Array>} Created conference documents
 */
export const initializeDefaultConferences = async (appwriteServices) => {
  try {
    const currentYear = new Date().getFullYear();
    const conferences = [];

    // Create conferences for current year and next 3 years
    for (let i = 0; i < 4; i++) {
      const year = currentYear + i;
      const existing = await getRecConferenceByYear(year, appwriteServices);
      
      if (!existing) {
        const conferenceData = {
          year: year,
          title: `Renewable Energy Conference & Expo ${year}`,
          description: `Uganda's premier renewable energy conference for ${year}`,
          startDate: `${year}-10-20`, // Default October 20-22
          endDate: `${year}-10-22`,
          location: "Kampala, Uganda",
          venue: "TBD",
          isActive: year === currentYear, // Current year is active by default
          registrationOpen: true,
          couponRequired: false,
          maxAttendees: 1000, // Keep for backward compatibility
          maxLimits: {
            attendee: 800,
            exhibitor: 150,
            sponsor: 50
          },
          currentCounts: {
            attendee: 0,
            exhibitor: 0,
            sponsor: 0
          },
          registrationFee: {
            attendee: 0,
            exhibitor: 500000, // UGX
            sponsor: 2000000   // UGX
          },
          sponsorshipPackageUrl: null, // No package by default
          days: [
            { 
              date: `${year}-10-20`, 
              label: "20th October – Day 1",
              theme: "Renewable Energy Policy & Investment"
            },
            { 
              date: `${year}-10-21`, 
              label: "21st October – Day 2",
              theme: "Technology & Innovation"
            },
            { 
              date: `${year}-10-22`, 
              label: "22nd October – Day 3",
              theme: "Implementation & Sustainability"
            }
          ]
        };
        
        const created = await createRecConference(conferenceData, appwriteServices);
        conferences.push(created);
      }
    }

    return conferences;
  } catch (error) {
    console.error("Error initializing default conferences:", error);
    throw error;
  }
};

/**
 * Check if registration type has reached its limit
 * @param {string} registrationType - Type of registration (attendee, exhibitor, sponsor)
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<boolean>} True if limit reached, false otherwise
 */
export const isRegistrationTypeFull = async (registrationType, year, appwriteServices) => {
  try {
    const conference = await getRecConferenceByYear(year, appwriteServices);
    
    if (!conference) {
      throw new Error(`Conference for year ${year} not found`);
    }

    const maxLimits = conference.maxLimits || { attendee: 800, exhibitor: 150, sponsor: 50 };
    const currentCounts = conference.currentCounts || { attendee: 0, exhibitor: 0, sponsor: 0 };
    
    const typeKey = registrationType.toLowerCase();
    const maxLimit = maxLimits[typeKey];
    const currentCount = currentCounts[typeKey];
    
    return currentCount >= maxLimit;
  } catch (error) {
    console.error("Error checking registration type limit:", error);
    throw error;
  }
};

/**
 * Get current registration counts and limits for a conference
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Object containing current counts and limits
 */
export const getRegistrationStats = async (year, appwriteServices) => {
  try {
    const conference = await getRecConferenceByYear(year, appwriteServices);
    
    if (!conference) {
      throw new Error(`Conference for year ${year} not found`);
    }

    const maxLimits = conference.maxLimits || { attendee: 800, exhibitor: 150, sponsor: 50 };
    const currentCounts = conference.currentCounts || { attendee: 0, exhibitor: 0, sponsor: 0 };
    
    return {
      maxLimits,
      currentCounts,
      availability: {
        attendee: maxLimits.attendee - currentCounts.attendee,
        exhibitor: maxLimits.exhibitor - currentCounts.exhibitor,
        sponsor: maxLimits.sponsor - currentCounts.sponsor
      }
    };
  } catch (error) {
    console.error("Error getting registration stats:", error);
    throw error;
  }
};

/**
 * Increment registration count for a specific type
 * @param {string} registrationType - Type of registration (attendee, exhibitor, sponsor)
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated conference document
 */
export const incrementRegistrationCount = async (registrationType, year, appwriteServices) => {
  try {
    const conference = await getRecConferenceByYear(year, appwriteServices);
    
    if (!conference) {
      throw new Error(`Conference for year ${year} not found`);
    }

    const currentCounts = conference.currentCounts || { attendee: 0, exhibitor: 0, sponsor: 0 };
    const typeKey = registrationType.toLowerCase();
    
    // Increment the count for the specific type
    currentCounts[typeKey] = (currentCounts[typeKey] || 0) + 1;
    
    // Update the conference document
    return await updateRecConference(conference.$id, { currentCounts }, appwriteServices);
  } catch (error) {
    console.error("Error incrementing registration count:", error);
    throw error;
  }
};

/**
 * Decrement registration count for a specific type
 * @param {string} registrationType - Type of registration (attendee, exhibitor, sponsor)
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated conference document
 */
export const decrementRegistrationCount = async (registrationType, year, appwriteServices) => {
  try {
    const conference = await getRecConferenceByYear(year, appwriteServices);
    
    if (!conference) {
      throw new Error(`Conference for year ${year} not found`);
    }

    const currentCounts = conference.currentCounts || { attendee: 0, exhibitor: 0, sponsor: 0 };
    const typeKey = registrationType.toLowerCase();
    
    // Decrement the count for the specific type, but don't go below 0
    currentCounts[typeKey] = Math.max(0, (currentCounts[typeKey] || 0) - 1);
    
    // Update the conference document
    return await updateRecConference(conference.$id, { currentCounts }, appwriteServices);
  } catch (error) {
    console.error("Error decrementing registration count:", error);
    throw error;
  }
};

// Export the upload function for use in components
export { uploadSponsorshipPackage };

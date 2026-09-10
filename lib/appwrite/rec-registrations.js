import { Query, ID } from "appwrite";
import { config } from "./config";
import { cleanDataForDatabase } from "../utils";
import { formatRecOptionalSessions } from "../rec-conference/registration-tracks.mjs";
import { formatRecEdition } from "../rec-conference/rec-edition.mjs";

/**
 * Create a new REC registration
 * @param {Object} registrationData - Registration form data
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Created registration document
 */
export const createRecRegistration = async (registrationData, appwriteServices) => {
  try {
    const cleanedData = cleanDataForDatabase(registrationData);
    // console.log("Cleaned data for database:", cleanedData);
    const response = await appwriteServices.databases.createDocument(
      config.databaseId,
      config.recRegistrationsCollectionId,
      ID.unique(),
      cleanedData
    );
    return response;
  } catch (error) {
    console.error("Error creating REC registration:", error);
    throw error;
  }
};

/**
 * Get REC registration by email
 * @param {string} email - Email to search for
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object|null>} Registration document or null if not found
 */
export const getRecRegistrationByEmail = async (email, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [Query.equal("email", email)]
    );
    return response.documents.length > 0 ? response.documents[0] : null;
  } catch (error) {
    console.error("Error fetching REC registration by email:", error);
    throw error;
  }
};

/**
 * Get REC registration by document ID
 * @param {string} documentId - Registration document ID
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object|null>} Registration document or null if not found
 */
export const getRecRegistrationById = async (documentId, appwriteServices) => {
  try {
    return await appwriteServices.databases.getDocument(
      config.databaseId,
      config.recRegistrationsCollectionId,
      documentId
    );
  } catch (error) {
    console.error("Error fetching REC registration by ID:", error);
    throw error;
  }
};

const getNormalizedConferenceYears = (conferenceYears) => (
  Array.isArray(conferenceYears) ? conferenceYears.filter(Boolean) : []
);

/**
 * Register or update user for a selected conference year.
 * Existing rows are keyed by email, so registering for a new year overwrites
 * shared profile fields while appending the selected year.
 * @param {string} email - User's email
 * @param {Object} registrationData - Registration form data
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Registration document
 */
export const registerForConferenceYear = async (email, registrationData, year, appwriteServices) => {
  try {
    const { getRecConferenceByYear, incrementRegistrationCount, decrementRegistrationCount } = await import("./rec-conferences");
    const conference = await getRecConferenceByYear(year, appwriteServices);

    if (!conference) {
      throw new Error(`Conference for year ${year} not found`);
    }

    const existingRegistration = await getRecRegistrationByEmail(email, appwriteServices);

    if (existingRegistration) {
      const conferenceYears = getNormalizedConferenceYears(existingRegistration.conferenceYears);
      const isNewYearRegistration = !conferenceYears.includes(year);
      const previousRegistrationType = existingRegistration.registrationType;

      if (isNewYearRegistration) {
        conferenceYears.push(year);
      }

      const result = await updateRecRegistration(existingRegistration.$id, {
        ...registrationData,
        conferenceYears
      }, appwriteServices);

      if (isNewYearRegistration) {
        await incrementRegistrationCount(registrationData.registrationType, year, appwriteServices);
      } else if (previousRegistrationType && previousRegistrationType !== registrationData.registrationType) {
        await decrementRegistrationCount(previousRegistrationType, year, appwriteServices);
        await incrementRegistrationCount(registrationData.registrationType, year, appwriteServices);
      }

      return result;
    }

    const result = await createRecRegistration({
      ...registrationData,
      conferenceYears: [year]
    }, appwriteServices);

    await incrementRegistrationCount(registrationData.registrationType, year, appwriteServices);

    return result;
  } catch (error) {
    console.error("Error registering for conference year:", error);
    throw error;
  }
};

/**
 * Update a registration for a selected conference year.
 * @param {string} documentId - Registration document ID
 * @param {Object} registrationData - Registration form data
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated registration document
 */
export const updateRegistrationForConferenceYear = async (documentId, registrationData, year, appwriteServices) => {
  try {
    const { getRecConferenceByYear, incrementRegistrationCount, decrementRegistrationCount } = await import("./rec-conferences");
    const conference = await getRecConferenceByYear(year, appwriteServices);

    if (!conference) {
      throw new Error(`Conference for year ${year} not found`);
    }

    const existingRegistration = await getRecRegistrationById(documentId, appwriteServices);
    const conferenceYears = getNormalizedConferenceYears(existingRegistration.conferenceYears);
    const isNewYearRegistration = !conferenceYears.includes(year);
    const previousRegistrationType = existingRegistration.registrationType;

    if (isNewYearRegistration) {
      conferenceYears.push(year);
    }

    const result = await updateRecRegistration(documentId, {
      ...registrationData,
      conferenceYears
    }, appwriteServices);

    if (isNewYearRegistration) {
      await incrementRegistrationCount(registrationData.registrationType, year, appwriteServices);
    } else if (previousRegistrationType && previousRegistrationType !== registrationData.registrationType) {
      await decrementRegistrationCount(previousRegistrationType, year, appwriteServices);
      await incrementRegistrationCount(registrationData.registrationType, year, appwriteServices);
    }

    return result;
  } catch (error) {
    console.error("Error updating registration for conference year:", error);
    throw error;
  }
};

/**
 * Register or update user for current active conference
 * @param {string} email - User's email
 * @param {Object} registrationData - Registration form data
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Registration document
 */
export const registerForActiveConference = async (email, registrationData, appwriteServices) => {
  try {
    // Get active conference
    const { getActiveRecConference } = await import("./rec-conferences");
    const activeConference = await getActiveRecConference(appwriteServices);

    if (!activeConference) {
      throw new Error("No active conference found");
    }

    return await registerForConferenceYear(email, registrationData, activeConference.year, appwriteServices);
  } catch (error) {
    console.error("Error registering for active conference:", error);
    throw error;
  }
};

/**
 * Check if user is registered for a specific year
 * @param {string} email - User's email
 * @param {number} year - Conference year to check
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<boolean>} True if registered for that year
 */
export const isRegisteredForYear = async (email, year, appwriteServices) => {
  try {
    const registration = await getRecRegistrationByEmail(email, appwriteServices);
    return registration && registration.conferenceYears && registration.conferenceYears.includes(year);
  } catch (error) {
    console.error("Error checking registration for year:", error);
    throw error;
  }
};

/**
 * Update an existing REC registration
 * @param {string} documentId - Document ID to update
 * @param {Object} updateData - Data to update
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated registration document
 */
export const updateRecRegistration = async (documentId, updateData, appwriteServices) => {
  try {
    const cleanedData = cleanDataForDatabase(updateData);
    // console.log("Cleaned data for update:", cleanedData);
    const response = await appwriteServices.databases.updateDocument(
      config.databaseId,
      config.recRegistrationsCollectionId,
      documentId,
      cleanedData
    );
    return response;
  } catch (error) {
    console.error("Error updating REC registration:", error);
    throw error;
  }
};

/**
 * Get all REC registrations with pagination and filtering
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} queries - Additional query filters
 * @param {number} limit - Number of documents to return
 * @param {number} offset - Number of documents to skip
 * @returns {Promise<Object>} List of registration documents
 */
export const getRecRegistrations = async (appwriteServices, queries = [], limit = 25, offset = 0) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [
        Query.orderDesc("$updatedAt"),
        Query.limit(limit),
        Query.offset(offset),
        ...queries
      ]
    );
    return response;
  } catch (error) {
    console.error("Error fetching REC registrations:", error);
    throw error;
  }
};

/**
 * Get REC registrations by year
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} additionalQueries - Additional query filters
 * @param {number} limit - Number of documents to return
 * @param {number} offset - Number of documents to skip
 * @returns {Promise<Object>} List of registration documents for the year
 */
export const getRecRegistrationsByYear = async (year, appwriteServices, additionalQueries = [], limit = 100, offset = 0) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [
        Query.contains("conferenceYears", year),
        Query.orderDesc("$updatedAt"),
        Query.limit(limit),
        Query.offset(offset),
        ...additionalQueries
      ]
    );
    return response;
  } catch (error) {
    console.error("Error fetching REC registrations by year:", error);
    throw error;
  }
};

/**
 * Delete a REC registration
 * @param {string} documentId - Document ID to delete
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<void>}
 */
export const deleteRecRegistration = async (regData, appwriteServices, year = null) => {
  try {
    console.log("Deleting REC registration:", regData);
    const { getActiveRecConference, decrementRegistrationCount } = await import("./rec-conferences");
    const activeConference = year ? null : await getActiveRecConference(appwriteServices);
    const targetYear = year || activeConference?.year;

    if (!targetYear) {
      throw new Error("No conference year available for deletion");
    }

    const conferenceYears = getNormalizedConferenceYears(regData.conferenceYears);
    const remainingYears = conferenceYears.filter(conferenceYear => conferenceYear !== targetYear);

    if (conferenceYears.length > 1 && remainingYears.length > 0) {
      await updateRecRegistration(regData.$id, { conferenceYears: remainingYears }, appwriteServices);
    } else {
      await appwriteServices.databases.deleteDocument(
        config.databaseId,
        config.recRegistrationsCollectionId,
        regData.$id
      );
    }

    await decrementRegistrationCount(regData.registrationType, targetYear, appwriteServices);

  } catch (error) {
    console.error("Error deleting REC registration:", error.message);
    throw error.message || "Failed to delete REC registration";
  }
};

/**
 * Get registrations by type for reporting
 * @param {string} registrationType - Type of registration (Attendee, Exhibitor, Sponsor)
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Filtered registration documents
 */
export const getRecRegistrationsByType = async (registrationType, year, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [
        Query.equal("registrationType", registrationType),
        Query.contains("conferenceYears", year),
        Query.orderDesc("$createdAt")
      ]
    );
    return response;
  } catch (error) {
    console.error("Error fetching REC registrations by type:", error);
    throw error;
  }
};

/**
 * Get registrations by days attending for planning
 * @param {Array} daysAttending - Array of days to filter by
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Filtered registration documents
 */
export const getRecRegistrationsByDays = async (daysAttending, year, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [
        Query.contains("daysAttending", daysAttending),
        Query.contains("conferenceYears", year),
        Query.orderDesc("$createdAt")
      ]
    );
    return response;
  } catch (error) {
    console.error("Error fetching REC registrations by days:", error);
    throw error;
  }
};

/**
 * Get registration statistics for a year
 * @param {number} year - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Registration statistics
 */
export const getRegistrationStats = async (year, appwriteServices) => {
  try {
    const registrations = [];
    const pageSize = 100;
    let offset = 0;
    let total = 0;

    do {
      const page = await getRecRegistrationsByYear(year, appwriteServices, [], pageSize, offset);
      registrations.push(...(page.documents || []));
      total = page.total || registrations.length;
      offset += pageSize;
    } while (registrations.length < total);

    const stats = {
      total: registrations.length,
      byType: {
        attendee: registrations.filter(r => r.registrationType === 'Attendee').length,
        exhibitor: registrations.filter(r => r.registrationType === 'Exhibitor').length,
        sponsor: registrations.filter(r => r.registrationType === 'Sponsor').length
      },
      bySector: {},
      bySponsor: {},
      byCountry: {},
      sponsoredRegistrations: registrations.filter(r => Boolean(r.sponsorOrganization)).length,
      visaLettersRequired: registrations.filter(r => r.visaLetterRequired).length,
      byDays: {}
    };

    // Count by sector
    registrations.forEach(reg => {
      if (reg.sector && Array.isArray(reg.sector)) {
        reg.sector.forEach(sector => {
          stats.bySector[sector] = (stats.bySector[sector] || 0) + 1;
        });
      }
    });

    registrations.forEach(reg => {
      if (reg.sponsorOrganization) {
        stats.bySponsor[reg.sponsorOrganization] = (stats.bySponsor[reg.sponsorOrganization] || 0) + 1;
      }
    });

    // Count by country
    registrations.forEach(reg => {
      if (reg.country) {
        stats.byCountry[reg.country] = (stats.byCountry[reg.country] || 0) + 1;
      }
    });

    // Count by days
    registrations.forEach(reg => {
      if (reg.daysAttending && Array.isArray(reg.daysAttending)) {
        reg.daysAttending.forEach(day => {
          stats.byDays[day] = (stats.byDays[day] || 0) + 1;
        });
      }
    });

    return stats;
  } catch (error) {
    console.error("Error fetching registration statistics:", error);
    throw error;
  }
};

/**
 * Send confirmation email (placeholder for email service integration)
 * @param {Object} registrationData - Registration data for email content
 * @param {number} year - Conference year
 * @param {string} sponsorshipPackageUrl - URL to sponsorship package (optional)
 * @returns {Promise<boolean>} Success status
 */
export const sendConfirmationEmail = async (registrationData, year = null, sponsorshipPackageUrl = null) => {
  const response = await fetch("/api/rec/send-reg-confirmation-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      registrationData,
      year,
      sponsorshipPackageUrl,
      administrativeInvite: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("Server error:", response.status, text);
    throw new Error(`Failed to send confirmation email: ${response.status}`);
  }

  return true;
};


/** * Build confirmation email content
 * @param {Object} data - Registration data
 * @returns {string} HTML content for the confirmation email
 */
export const buildConfirmationEmail = (data, year = null, sponsorshipPackageUrl = null) => {
  // default to [] if undefined or not an array
  const sector = Array.isArray(data.sector) ? data.sector : [];
  const daysAttending = Array.isArray(data.daysAttending) ? data.daysAttending : [];
  const conferenceYears = Array.isArray(data.conferenceYears) ? data.conferenceYears : [];

  return `
    <div
      style="
        font-family: Arial, sans-serif;
        font-size: 14px;
        background-color: #f9f9f9;
        padding: 20px;
        border-radius: 6px;
        color: #333;
      "
    >
      <h2 style="color: #2a7ae2; margin-top: 0;">
       ${formatRecEdition(year)} Registration Confirmation
      </h2>
      <p style="line-height: 1.5;">
        Thank you for registering. Below are your details:
      </p>
      <table
        cellpadding="0"
        cellspacing="0"
        style="
          border-collapse: collapse;
          width: 100%;
          margin-top: 15px;
        "
      >
        <thead>
          <tr>
            <th
              style="
                background-color: #2a7ae2;
                color: #fff;
                padding: 10px;
                text-align: left;
                border: 1px solid #ddd;
                border-radius: 4px 0 0 0;
              "
            >
              Field
            </th>
            <th
              style="
                background-color: #2a7ae2;
                color: #fff;
                padding: 10px;
                text-align: left;
                border: 1px solid #ddd;
                border-radius: 0 4px 0 0;
              "
            >
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;">
              <strong>Full Name</strong>
            </td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.title} ${data.firstName} ${data.otherName || ''} ${data.lastName}
            </td>
          </tr>
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.email}</td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Other Email</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.otherEmail || 'N/A'}
            </td>
          </tr>
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.phone}</td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Other Phone</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.otherPhone || 'N/A'}
            </td>
          </tr>
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Organization</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.organization}
            </td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sector</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${sector.length ? sector.join(', ') : 'N/A'}
            </td>
          </tr>
          ${data.sponsorOrganization ? `
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sponsored By</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.sponsorOrganization}${data.sponsorSector ? ` (${data.sponsorSector})` : ''}
            </td>
          </tr>
          ` : ''}
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>City</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.city}</td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>State/Region</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.stateRegion}
            </td>
          </tr>
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Country</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.country}
            </td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Registration Type</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.registrationType}
            </td>
          </tr>
          ${data.registrationType && data.registrationType.toLowerCase() === 'exhibitor' ? `
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Exhibition Details</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.exhibitionDetails || 'N/A'}
            </td>
          </tr>
          ` : ''}
          ${data.registrationType && data.registrationType.toLowerCase() === 'sponsor' && sponsorshipPackageUrl ? `
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sponsorship Package</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              <a href="${sponsorshipPackageUrl}" target="_blank" rel="noopener noreferrer" 
                 style="color: #2a7ae2; text-decoration: none;">
                📄 View Sponsorship Package Details
              </a>
            </td>
          </tr>
          ` : ''}
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Days Attending</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${daysAttending.length ? daysAttending.join(', ') : 'N/A'}
            </td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Participant category</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${formatRecOptionalSessions(data.additionalSessions, year).join(', ')}
            </td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Visa Letter Required</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.visaLetterRequired ? 'Yes' : 'No'}
            </td>
          </tr>
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Additional Comments</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${data.additionalComments || 'N/A'}
            </td>
          </tr>
          <tr style="background-color: #fff;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Conference Attended</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${conferenceYears.length ? conferenceYears.join(', ') : 'N/A'}
            </td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 20px; line-height: 1.5;">
        We look forward to seeing you at the event!
      </p>
    </div>
  `;
};


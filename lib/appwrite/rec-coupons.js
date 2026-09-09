import { Query, ID } from "appwrite";
import { config } from "./config";

/**
 * Generate a random coupon code
 * @param {number} length - Length of the coupon code (max 10)
 * @returns {string} Generated coupon code
 */
const generateCouponCode = (length = 8) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < Math.min(length, 10); i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const toPositiveInteger = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const validateCouponSponsorship = (couponData) => {
  const organization = String(couponData.organization || "").trim();
  const sector = String(couponData.sector || "").trim();

  if (!organization) {
    throw new Error("Sponsoring organization is required");
  }
  if (!sector) {
    throw new Error("Sponsoring organization sector is required");
  }

  return { organization, sector };
};

/**
 * Check if coupon code already exists
 * @param {string} couponCode - Coupon code to check
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<boolean>} True if exists, false otherwise
 */
const couponCodeExists = async (couponCode, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recCouponsCollectionId,
      [Query.equal("coupon", couponCode)]
    );
    return response.documents.length > 0;
  } catch (error) {
    console.error("Error checking coupon code:", error);
    return false;
  }
};

/**
 * Create a new REC coupon
 * @param {Object} couponData - Coupon data
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {string} userId - ID of the user creating the coupon
 * @returns {Promise<Object>} Created coupon document
 */
export const createRecCoupon = async (couponData, appwriteServices, userId) => {
  try {
    let couponCode = String(couponData.coupon || "").trim().toUpperCase();
    const numberOfUsers = toPositiveInteger(couponData.numberOfUsers, 1);
    const sponsorship = validateCouponSponsorship(couponData);

    // If no coupon code provided or auto-generate requested, generate one
    if (!couponCode || couponData.autoGenerate) {
      let attempts = 0;
      do {
        couponCode = generateCouponCode(couponData.codeLength || 8);
        attempts++;
        if (attempts > 10) {
          throw new Error("Unable to generate unique coupon code after 10 attempts");
        }
      } while (await couponCodeExists(couponCode, appwriteServices));
    } else {
      // Check if manually entered code already exists
      const exists = await couponCodeExists(couponCode, appwriteServices);
      if (exists) {
        throw new Error(`Coupon code "${couponCode}" already exists`);
      }
    }

    const finalCouponData = {
      coupon: couponCode,
      organization: sponsorship.organization,
      sector: sponsorship.sector,
      numberOfUsers,
      usersLeft: numberOfUsers,
      type: couponData.type,
      createdBy: userId,
      conference: toPositiveInteger(couponData.conference, new Date().getFullYear()),
      isActive: true
    };

    const response = await appwriteServices.databases.createDocument(
      config.databaseId,
      config.recCouponsCollectionId,
      ID.unique(),
      finalCouponData
    );

    return response;
  } catch (error) {
    console.error("Error creating REC coupon:", error);
    throw error;
  }
};

/**
 * Get all REC coupons with optional filtering
 * @param {Object} appwriteServices - Appwrite services instance
 * @param {Array} queries - Additional query filters
 * @param {number} limit - Number of documents to return
 * @param {number} offset - Number of documents to skip
 * @returns {Promise<Object>} List of coupon documents
 */
export const getRecCoupons = async (appwriteServices, queries = [], limit = 100, offset = 0) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recCouponsCollectionId,
      [
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
        Query.offset(offset),
        ...queries
      ]
    );
    return response;
  } catch (error) {
    console.error("Error fetching REC coupons:", error);
    throw error;
  }
};

/**
 * Get REC coupons by conference
 * @param {number} conferenceYear - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} List of coupon documents for the conference
 */
export const getRecCouponsByConference = async (
  conferenceYear,
  appwriteServices,
  additionalQueries = [],
  limit = 100,
  offset = 0
) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recCouponsCollectionId,
      [
        Query.equal("conference", conferenceYear),
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
        Query.offset(offset),
        ...additionalQueries
      ]
    );
    return response;
  } catch (error) {
    console.error("Error fetching REC coupons by conference:", error);
    throw error;
  }
};

/**
 * Get coupon by code
 * @param {string} couponCode - Coupon code to search for
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object|null>} Coupon document or null if not found
 */
export const getRecCouponByCode = async (couponCode, appwriteServices) => {
  try {
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recCouponsCollectionId,
      [Query.equal("coupon", couponCode)]
    );
    return response.documents.length > 0 ? response.documents[0] : null;
  } catch (error) {
    console.error("Error fetching REC coupon by code:", error);
    throw error;
  }
};

/**
 * Update a REC coupon
 * @param {string} documentId - Document ID to update
 * @param {Object} updateData - Data to update
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated coupon document
 */
export const updateRecCoupon = async (documentId, updateData, appwriteServices) => {
  try {
    const payload = { ...updateData };
    if (Object.prototype.hasOwnProperty.call(payload, "organization")) {
      payload.organization = String(payload.organization || "").trim();
      if (!payload.organization) throw new Error("Sponsoring organization is required");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "sector")) {
      payload.sector = String(payload.sector || "").trim();
      if (!payload.sector) throw new Error("Sponsoring organization sector is required");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "numberOfUsers")) {
      payload.numberOfUsers = toPositiveInteger(payload.numberOfUsers, 1);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "usersLeft")) {
      payload.usersLeft = Math.max(0, toPositiveInteger(payload.usersLeft, 0));
    }

    const response = await appwriteServices.databases.updateDocument(
      config.databaseId,
      config.recCouponsCollectionId,
      documentId,
      payload
    );
    return response;
  } catch (error) {
    console.error("Error updating REC coupon:", error);
    throw error;
  }
};

const listAllCouponsForAnalytics = async (appwriteServices, queries = []) => {
  const pageSize = 100;
  let offset = 0;
  let documents = [];
  let total = 0;

  do {
    const response = await getRecCoupons(appwriteServices, queries, pageSize, offset);
    documents = documents.concat(response.documents || []);
    total = response.total || documents.length;
    offset += pageSize;
  } while (documents.length < total);

  return documents;
};

/**
 * Delete a REC coupon
 * @param {string} documentId - Document ID to delete
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<void>}
 */
export const deleteRecCoupon = async (documentId, appwriteServices) => {
  try {
    await appwriteServices.databases.deleteDocument(
      config.databaseId,
      config.recCouponsCollectionId,
      documentId
    );
  } catch (error) {
    console.error("Error deleting REC coupon:", error);
    throw error;
  }
};

/**
 * Use a coupon (decrement usersLeft by 1)
 * @param {string} couponCode - Coupon code to use
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Updated coupon document
 */
export const useRecCoupon = async (couponCode, appwriteServices) => {
  try {
    const coupon = await getRecCouponByCode(couponCode, appwriteServices);

    if (!coupon) {
      throw new Error("Coupon not found");
    }

    if (!coupon.isActive) {
      throw new Error("Coupon is not active");
    }

    if (coupon.usersLeft <= 0) {
      throw new Error("Coupon has no uses left");
    }

    const updatedCoupon = await updateRecCoupon(
      coupon.$id,
      {
        usersLeft: coupon.usersLeft - 1,
        isActive: coupon.usersLeft - 1 > 0 // Deactivate if no uses left
      },
      appwriteServices
    );

    return updatedCoupon;
  } catch (error) {
    console.error("Error using REC coupon:", error);
    throw error;
  }
};

/**
 * Validate coupon for use
 * @param {string} couponCode - Coupon code to validate
 * @param {string} registrationType - Registration type (attendee, exhibitor)
 * @param {number} conferenceYear - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Validation result with coupon data
 */
export const validateRecCoupon = async (couponCode, registrationType, conferenceYear, appwriteServices) => {
  try {
    const coupon = await getRecCouponByCode(couponCode, appwriteServices);

    if (!coupon) {
      return { valid: false, message: "Coupon not found" };
    }

    if (!coupon.isActive) {
      return { valid: false, message: "Coupon is not active" };
    }

    if (coupon.usersLeft <= 0) {
      return { valid: false, message: "Coupon has no uses left" };
    }

    if (coupon.type !== registrationType) {
      return { valid: false, message: `Coupon is only valid for ${coupon.type} registration` };
    }

    if (coupon.conference !== conferenceYear) {
      return { valid: false, message: `Coupon is only valid for REC ${coupon.conference}` };
    }

    return {
      valid: true,
      message: "Coupon is valid",
      coupon: coupon
    };
  } catch (error) {
    console.error("Error validating REC coupon:", error);
    return { valid: false, message: "Error validating coupon" };
  }
};

/**
 * Get coupon analytics for a specific conference
 * @param {number} conferenceYear - Conference year
 * @param {Object} appwriteServices - Appwrite services instance
 * @returns {Promise<Object>} Analytics data
 */
export const getRecCouponAnalytics = async (conferenceYear, appwriteServices) => {
  try {
    const queries = conferenceYear ? [Query.equal("conference", conferenceYear)] : [];
    const couponDocuments = await listAllCouponsForAnalytics(appwriteServices, queries);

    const analytics = {
      total: couponDocuments.length,
      active: 0,
      inactive: 0,
      totalUsers: 0,
      usersUsed: 0,
      usersLeft: 0,
      byType: {
        attendee: 0,
        exhibitor: 0
      },
      bySector: {},
      byOrganization: {},
      topOrganizations: [],
      mostUsedCoupons: []
    };

    couponDocuments.forEach(coupon => {
      // Basic counts
      if (coupon.isActive && coupon.usersLeft > 0) {
        analytics.active++;
      } else {
        analytics.inactive++;
      }

      // User statistics
      analytics.totalUsers += coupon.numberOfUsers;
      analytics.usersUsed += (coupon.numberOfUsers - coupon.usersLeft);
      analytics.usersLeft += coupon.usersLeft;

      // By type
      analytics.byType[coupon.type] = (analytics.byType[coupon.type] || 0) + 1;

      // By sector
      if (coupon.sector) {
        analytics.bySector[coupon.sector] = (analytics.bySector[coupon.sector] || 0) + 1;
      }

      // By sponsoring organization
      if (coupon.organization) {
        analytics.byOrganization[coupon.organization] = (analytics.byOrganization[coupon.organization] || 0) + coupon.numberOfUsers;
      }
    });

    // Top sponsoring organizations by total users
    analytics.topOrganizations = Object.entries(analytics.byOrganization)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([org, users]) => ({ organization: org, totalUsers: users }));

    // Most used coupons
    analytics.mostUsedCoupons = couponDocuments
      .map(coupon => ({
        coupon: coupon.coupon,
        organization: coupon.organization,
        used: coupon.numberOfUsers - coupon.usersLeft,
        total: coupon.numberOfUsers,
        usagePercentage: Math.round(((coupon.numberOfUsers - coupon.usersLeft) / coupon.numberOfUsers) * 100)
      }))
      .sort((a, b) => b.used - a.used)
      .slice(0, 10);

    return analytics;
  } catch (error) {
    console.error("Error getting REC coupon analytics:", error);
    throw error;
  }
};

// Export utility function for generating coupon codes (for use in components)
export { generateCouponCode };

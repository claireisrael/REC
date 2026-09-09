# REC (Renewable Energy Conference) Simplified Multi-Year Module Implementation

## Overview
This document outlines the complete implementation of the simplified Renewable Energy Conference & Expo (REC) Registration Module for the NREP HR System. The system uses a single registration record per user with automatic year tracking, providing an intuitive user experience while supporting multiple conference years (2024, 2025, 2026, etc.).

## Files Created/Modified

### 1. Database Configuration
- **File**: `lib/appwrite/config.js`
- **Changes**: Added `recRegistrationsCollectionId` and `recConferencesCollectionId`
- **Note**: Collection ID placeholders need to be replaced with actual Appwrite collection IDs

### 2. Conference Management API
- **File**: `lib/appwrite/rec-conferences.js` (NEW)
- **Purpose**: Manages conference configurations across multiple years
- **Functions**:
  - `createRecConference()` - Create new conference year
  - `getRecConferenceByYear()` - Get conference by specific year
  - `getActiveRecConference()` - Get currently active conference
  - `getAllRecConferences()` - List all conferences
  - `updateRecConference()` - Update conference settings
  - `setActiveConference()` - Set active conference year
  - `getConferenceYears()` - Get available conference years
  - `initializeDefaultConferences()` - Create default conferences for 4 years
  - `isRegistrationTypeFull()` - Check if registration type has reached its limit
  - `getRegistrationStats()` - Get current registration counts and availability
  - `incrementRegistrationCount()` - Increment counter for specific registration type
  - `decrementRegistrationCount()` - Decrement counter for specific registration type

### 3. Registration API Functions
- **File**: `lib/appwrite/rec-registrations.js` (COMPLETELY REDESIGNED)
- **Purpose**: Handles simplified single-record multi-year registration operations
- **Key Functions**:
  - `getRecRegistrationByEmail()` - Get user's single registration record
  - `registerForActiveConference()` - Automatically register for current active conference
  - `isRegisteredForYear()` - Check if user is registered for specific year
  - `createRecRegistration()` - Create new registration (used internally)
  - `updateRecRegistration()` - Update existing registration (used internally)
  - `getRecRegistrations()` - List all registrations with pagination
  - `getRecRegistrationsByYear()` - Get registrations for specific year (uses array contains)
  - `deleteRecRegistration()` - Delete registration
  - `getRecRegistrationsByType()` - Filter by registration type and year
  - `getRecRegistrationsByDays()` - Filter by days attending and year
  - `getRegistrationStats()` - Get detailed statistics for a year
  - `sendConfirmationEmail()` - Send confirmation email (placeholder)

### 4. Registration Form Component
- **File**: `components/rec-registration/RecRegistrationForm.js` (COMPLETELY REDESIGNED)
- **Purpose**: Simplified registration form with automatic year tracking
- **Features**:
  - **No Year Selection**: Automatically registers for active conference
  - **Smart Email Check**: Detects existing registrations and offers to update
  - **Intelligent Pre-filling**: Uses previous registration data to speed up new year registration
  - **Automatic Year Tracking**: Adds current year to user's `conferenceYears` array
  - **Single User Record**: One registration record per email address
  - **Comprehensive Form**: All required fields with validation
  - **Dynamic Configuration**: Days options based on active conference settings
  - **Phone Input**: Country selection support
  - **Multi-select Fields**: Sectors and days attending
  - **Smart Status Display**: Shows if updating existing or using previous data

### 5. Public Registration Page
- **File**: `app/rec-registration/page.js` (UPDATED)
- **Purpose**: Publicly accessible registration page
- **Features**:
  - No authentication required
  - Dynamic conference information based on active year
  - Responsive design

### 6. Management Dashboard Component
- **File**: `components/rec-registration/RecRegistrationsList.js` (UPDATED)
- **Purpose**: Multi-year admin interface for Senior Managers
- **Features**:
  - Year selector with statistics dashboard
  - Advanced filtering (type, days, country, sector, visa) by year
  - Registration details modal
  - Delete functionality with confirmation
  - CSV export with year-specific naming
  - Real-time statistics cards
  - Responsive table design

### 7. Dashboard Management Page
- **File**: `app/dashboard/rec-registrations/page.js` (UPDATED)
- **Purpose**: Protected dashboard page for Senior Managers
- **Features**:
  - Role-based access control (Senior Manager only)
  - Integration with authentication system
  - Multi-year support

### 8. Conference Management Component
- **File**: `components/rec-registration/RecConferencesManager.js` (NEW)
- **Purpose**: Conference configuration management for Senior Managers
- **Features**:
  - Create new conference years
  - Edit existing conference settings
  - Set active conference
  - Configure days, themes, and dates
  - Set registration fees
  - Initialize default configurations
  - Manage registration status

### 9. Conference Management Page
- **File**: `app/dashboard/rec-conferences/page.js` (NEW)
- **Purpose**: Conference administration interface
- **Features**:
  - Full conference lifecycle management
  - Multi-year configuration
  - Registration settings control

### 10. Navigation Updates
- **File**: `components/layout/sidebar.js`
- **Changes**: Added "REC Registrations" and "REC Conferences" menu items
- **Access**: Both restricted to Senior Manager role only

## Database Schema

### Collection: `REC_Conferences`

**Fields:**
- `year` (integer, unique, required) - Conference year
- `title` (string, required) - Conference title
- `description` (string, optional) - Conference description
- `startDate` (string, required) - Start date (YYYY-MM-DD)
- `endDate` (string, required) - End date (YYYY-MM-DD)
- `location` (string, required) - Conference location
- `venue` (string, optional) - Specific venue name
- `isActive` (boolean, required) - Whether this is the active conference
- `registrationOpen` (boolean, required) - Whether registration is open
- `maxAttendees` (integer, optional) - Maximum number of attendees (kept for backward compatibility)
- `maxLimits` (string, optional) - Maximum limits for each registration type (stored as JSON string)
- `currentCounts` (string, optional) - Current registration counts for each registration type (stored as JSON string)
- `registrationFee` (string, optional) - Fee structure for different registration types (stored as JSON string)
- `days` (array, optional) - Array of conference days with themes

**Note**: 
- Appwrite automatically provides `$createdAt` and `$updatedAt` fields
- Object fields (maxLimits, currentCounts, registrationFee) are stored as JSON strings since Appwrite doesn't support object data types
- The application automatically serializes objects to strings when saving and deserializes them back to objects when retrieving

**Indexes Required:**
- Unique index on `year`
- Index on `isActive`

### Collection: `REC_Registrations` (Simplified Schema)

**Fields:**
- `email` (string, unique, required) - User's primary email
- `conferenceYears` (array of integers, required) - Years user has attended [2024, 2025, etc.]
- `title` (string, optional)
- `firstName` (string, required)
- `lastName` (string, required)
- `otherName` (string, optional)
- `phone` (string, required)
- `otherPhone` (string, optional)
- `otherEmail` (string, optional)
- `organization` (string, required)
- `sector` (array of strings, required)
- `city` (string, required)
- `stateRegion` (string, required)
- `country` (string, required)
- `registrationType` (string, required) - Latest registration type
- `daysAttending` (array of strings, required) - Days for current/latest registration
- `visaLetterRequired` (boolean, optional)
- `passportNumber` (string, optional) - Required when visa letter is needed
- `additionalComments` (string, optional)

**Note**: Appwrite automatically provides `$createdAt` and `$updatedAt` fields

**Indexes Required:**
- Unique index on `email`
- Index on `conferenceYears` (for year-based queries)
- Index on `registrationType`

## Simplified Multi-Year Features

### Automatic Registration Flow
1. **Email Entry**: User enters email address only
2. **Smart Detection**: System automatically detects existing registrations
3. **Intelligent Pre-filling**: 
   - If user exists: Offers to use previous information for speed
   - If already registered for current year: Offers to update existing registration
   - If new user: Starts with fresh form
4. **Automatic Year Tracking**: System automatically adds current active conference year to user's `conferenceYears` array
5. **Single Record Management**: All user data maintained in one record across years

### Conference Management
- **Year Configuration**: Senior Managers can create and configure multiple conference years
- **Active Conference**: One conference year is marked as "active" for new registrations
- **Dynamic Content**: Registration form automatically adapts to active conference
- **Statistics**: Year-based analytics using array queries

### User Experience Benefits
- **No Year Selection**: Users don't need to choose years - automatic
- **Faster Registration**: Previous data pre-filled automatically
- **Single Account**: One registration record across all years
- **Smart Updates**: Easy modification while preserving year history
- **Automatic Tracking**: System handles all year management behind the scenes
- **Registration Type Limits**: Separate limits for attendees, exhibitors, and sponsors
- **Smart Registration**: Users can modify their registration even if their type becomes full later
- **Type-Specific Availability**: Real-time display of available spots for each registration type

## Access Control Implementation

### Public Access
- **URL**: `/rec-registration`
- **Access**: Anyone can access the registration form
- **Purpose**: Allow public registration for any available conference year

### Admin Access - Registrations
- **URL**: `/dashboard/rec-registrations`
- **Access**: Only users with `systemRole: "Senior Manager"`
- **Purpose**: View and manage registrations by year

### Admin Access - Conference Management
- **URL**: `/dashboard/rec-conferences`
- **Access**: Only users with `systemRole: "Senior Manager"`
- **Purpose**: Configure conference settings across multiple years

## Form Validation

- **Required fields**: Email, First Name, Last Name, Phone, Organization, City, State/Region, Country, Registration Type, Days Attending, Sector
- **Email validation**: Proper email format checking
- **Sector validation**: At least one sector must be selected
- **Days validation**: At least one day must be selected
- **Phone validation**: Uses react-phone-input-2 with country codes

## Features Implemented

### Registration Form Features
- ✅ Multi-step form flow with registration type selection
- ✅ Email duplication check
- ✅ Pre-filled form for existing registrations
- ✅ Phone input with country selector
- ✅ Multi-select sectors and days
- ✅ Form validation and error handling
- ✅ Success confirmation
- ✅ Registration type-specific limits and availability display
- ✅ Smart registration type selection (allows current type even if full)

### Management Features
- ✅ Role-based access control
- ✅ Registration listing with filters
- ✅ Detailed registration view
- ✅ Delete functionality
- ✅ CSV export
- ✅ Search and filter capabilities
- ✅ Conference-specific registration limits management
- ✅ Real-time registration statistics and availability tracking

### Registration Type Limits Features
- ✅ Separate maximum limits for attendees, exhibitors, and sponsors
- ✅ Real-time tracking of current registration counts
- ✅ Type-specific availability validation
- ✅ Smart counter management (increment/decrement based on changes)
- ✅ Protection against registration type changes to full types
- ✅ Allow existing registrants to modify details without losing their spot

## Setup Instructions

### 1. Create Appwrite Collections

#### REC_Conferences Collection
1. Login to your Appwrite console
2. Create a new collection named `REC_Conferences`
3. Add all the fields as specified in the database schema:
   - `year` (integer, required, unique)
   - `title` (string, required)
   - `description` (string, optional)
   - `startDate` (string, required)
   - `endDate` (string, required)
   - `location` (string, required)
   - `venue` (string, optional)
   - `isActive` (boolean, required)
   - `registrationOpen` (boolean, required)
   - `maxAttendees` (integer, optional)
   - `maxLimits` (string, optional) - Will store JSON objects
   - `currentCounts` (string, optional) - Will store JSON objects
   - `registrationFee` (string, optional) - Will store JSON objects
   - `days` (string, optional) - Will store JSON arrays
4. Create the required indexes (unique on `year`, index on `isActive`)
5. Replace `"REC_CONFERENCES_COLLECTION_ID"` in `lib/appwrite/config.js` with the actual collection ID

#### REC_Registrations Collection
1. Create a new collection named `REC_Registrations` (or update existing)
2. Add all the fields as specified in the database schema
3. Create the required indexes (composite unique on `email` + `conferenceYear`, etc.)
4. Replace `"REC_REGISTRATIONS_COLLECTION_ID"` in `lib/appwrite/config.js` with the actual collection ID

### 2. Initialize Conference Data
1. Access `/dashboard/rec-conferences` as a Senior Manager
2. Click "Initialize Default Conferences" to create conferences for current and next 3 years
3. Configure specific conference details as needed
4. Set the appropriate conference as "Active"

### 3. Email Service Integration
The `sendConfirmationEmail()` function in `lib/appwrite/rec-registrations.js` currently contains placeholder code. To enable email functionality:
1. Choose an email service (SendGrid, Mailgun, etc.)
2. Add the appropriate API credentials to your environment
3. Implement the actual email sending logic

### 4. Migration (if updating from single-year system)
1. Follow the migration strategy in `REC_MIGRATION_STRATEGY.md`
2. Add `conferenceYear` field to existing registrations
3. Update database indexes as specified

### 5. Test the Implementation
1. Access `/rec-registration` to test the public registration form
2. Test year selection and form pre-filling from previous years
3. Login as a Senior Manager and access `/dashboard/rec-registrations` to test the management interface
4. Test conference configuration via `/dashboard/rec-conferences`
5. Test the complete multi-year registration flow

## URLs and Routes

### Public Routes
- `/rec-registration` - Public registration form

### Protected Routes (Senior Manager only)
- `/dashboard/rec-registrations` - Registration management dashboard (multi-year)
- `/dashboard/rec-conferences` - Conference configuration management

## Dependencies Used

All required dependencies are already available in the project:
- `react-phone-input-2` - Phone input with country selection
- Portal-native UI components from `components/ui/portal-kit.js`
- `appwrite` - Database operations
- `@fortawesome/react-fontawesome` - Icons

## Security Considerations

- ✅ Role-based access control implemented
- ✅ Email validation to prevent duplicates
- ✅ Proper error handling and user feedback
- ✅ Protected admin routes
- ✅ Input sanitization through React and Appwrite

## Future Enhancements

1. **Email Integration**: Implement actual email sending service
2. **Advanced Reporting**: Add more detailed analytics and reports across years
3. **Bulk Operations**: Add bulk edit/delete capabilities across years
4. **QR Code Generation**: Generate QR codes for registrations
5. **Payment Integration**: Add payment processing for paid registrations
6. **Calendar Integration**: Sync with calendar applications
7. **Registration Caps**: Implement per-year attendance limits
8. **Waitlist Management**: Add waitlist functionality when conferences are full
9. **Badge Generation**: Generate conference badges with QR codes
10. **Multi-language Support**: Support for multiple languages

## Testing Checklist

### Database Setup
- [ ] Create REC_Conferences collection with proper schema
- [ ] Create/Update REC_Registrations collection with conferenceYear field
- [ ] Set up all required indexes
- [ ] Update collection IDs in config.js

### Conference Management
- [ ] Test conference creation and editing
- [ ] Test setting active conferences
- [ ] Test default conference initialization
- [ ] Test conference configuration validation

### Multi-Year Registration
- [ ] Test public registration form with year selection
- [ ] Test email duplication check per year
- [ ] Test form pre-filling from previous years
- [ ] Test new user registration flow
- [ ] Test existing user updating registration
- [ ] Test form validation

### Admin Dashboard
- [ ] Test Senior Manager dashboard access
- [ ] Test year-based filtering and statistics
- [ ] Test registration management per year
- [ ] Test CSV export with year-specific naming
- [ ] Test delete functionality
- [ ] Test responsive design on mobile devices

### Integration Testing
- [ ] Test complete multi-year flow (register 2024, then 2025)
- [ ] Test data consistency across years
- [ ] Test conference switching and data display
- [ ] Test navigation and access control

## Support

For issues or questions regarding this implementation, refer to:
- NREP HR System documentation
- Appwrite documentation
- React Bootstrap documentation
- Next.js documentation

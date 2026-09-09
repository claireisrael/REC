# REC Simplified Migration Strategy

## Overview
This document outlines the migration strategy from the multi-year system to the simplified single-record approach where users have one registration record with a `conferenceYears` array tracking their participation across multiple years.

## New Simplified Approach

### Key Benefits
1. **Simpler User Experience**: No year selection required - automatic for active conference
2. **Single User Record**: One registration per email with years array
3. **Automatic Year Tracking**: System automatically adds current year to user's record
4. **Smart Data Migration**: Uses previous year's data to pre-fill new registrations
5. **Cleaner Database**: No duplicate records for same user across years

## Updated Database Schema

### Collection: `REC_Registrations` (Updated)

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

### Collection: `REC_Conferences` (Updated with Registration Type Limits)

**New Attributes Added:**
- `maxLimits` (string, optional) - Maximum limits for each registration type (stored as JSON string)
  - When parsed: `{ attendee: 800, exhibitor: 150, sponsor: 50 }`
- `currentCounts` (string, optional) - Current registration counts for each type (stored as JSON string)
  - When parsed: `{ attendee: 45, exhibitor: 12, sponsor: 5 }`

**Note**: 
- The existing `maxAttendees` field is kept for backward compatibility
- Object fields are stored as JSON strings since Appwrite doesn't support object data types
- The application automatically handles serialization/deserialization

## Migration Steps

### Phase 1: Database Schema Update

1. **Update REC_Registrations Collection**
   ```javascript
   // In Appwrite Console:
   // 1. Add 'conferenceYears' attribute (array of integers, required)
   // 2. Remove composite unique index on ['email', 'conferenceYear'] 
   // 3. Add unique index on 'email'
   // 4. Remove 'conferenceYear' attribute (single integer)
   // 5. Add index on 'conferenceYears'
   ```

### Phase 2: Data Migration

```javascript
// Migration script to consolidate records
import { Query } from "appwrite";
import { config } from "./lib/appwrite/config";

async function migrateToSimplifiedSchema(appwriteServices) {
  try {
    console.log("Starting migration to simplified schema...");
    
    // Get all existing registrations
    const response = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [Query.limit(1000)]
    );
    
    const registrations = response.documents;
    const userGroups = {};
    
    // Group registrations by email
    registrations.forEach(reg => {
      if (!userGroups[reg.email]) {
        userGroups[reg.email] = [];
      }
      userGroups[reg.email].push(reg);
    });
    
    console.log(`Found ${Object.keys(userGroups).length} unique users`);
    
    // Process each user group
    for (const [email, userRegistrations] of Object.entries(userGroups)) {
      if (userRegistrations.length === 1) {
        // Single registration - just update to array format
        const reg = userRegistrations[0];
        const conferenceYears = reg.conferenceYear ? [reg.conferenceYear] : [2024];
        
        await appwriteServices.databases.updateDocument(
          config.databaseId,
          config.recRegistrationsCollectionId,
          reg.$id,
          {
            conferenceYears: conferenceYears
          }
        );
        
        console.log(`Updated single registration for ${email}`);
      } else {
        // Multiple registrations - consolidate into one
        const sortedRegs = userRegistrations.sort((a, b) => 
          new Date(b.$updatedAt) - new Date(a.$updatedAt)
        );
        
        const mostRecent = sortedRegs[0];
        const conferenceYears = userRegistrations
          .map(reg => reg.conferenceYear || 2024)
          .filter((year, index, arr) => arr.indexOf(year) === index) // Remove duplicates
          .sort((a, b) => a - b);
        
        // Update the most recent record with consolidated data
        await appwriteServices.databases.updateDocument(
          config.databaseId,
          config.recRegistrationsCollectionId,
          mostRecent.$id,
          {
            conferenceYears: conferenceYears
          }
        );
        
        // Delete the older records
        for (let i = 1; i < sortedRegs.length; i++) {
          await appwriteServices.databases.deleteDocument(
            config.databaseId,
            config.recRegistrationsCollectionId,
            sortedRegs[i].$id
          );
        }
        
        console.log(`Consolidated ${userRegistrations.length} records for ${email} into years: ${conferenceYears.join(', ')}`);
      }
    }
    
    console.log("Migration completed successfully!");
    
    // Verify migration
    const afterMigration = await appwriteServices.databases.listDocuments(
      config.databaseId,
      config.recRegistrationsCollectionId,
      [Query.limit(1000)]
    );
    
    console.log(`After migration: ${afterMigration.documents.length} total records`);
    
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}
```

### Phase 3: Clean Up Schema

After successful migration:
```javascript
// In Appwrite Console:
// 1. Remove 'conferenceYear' attribute (single integer) if it still exists
// 2. Verify all records have 'conferenceYears' array
// 3. Update any remaining indexes
```

## New User Registration Flow

### 1. User Experience
1. User enters email address
2. System checks for existing registration record
3. If exists:
   - Check if already registered for current active year
   - If yes: Offer to update existing registration
   - If no: Pre-fill form with previous data, reset year-specific fields
4. If new user: Start with fresh form
5. On submission: Add current year to `conferenceYears` array

### 2. API Functions Updated

```javascript
// Key functions implemented:

// Register for current active conference
registerForActiveConference(email, formData, appwriteServices)

// Check if registered for specific year  
isRegisteredForYear(email, year, appwriteServices)

// Get user's single registration record
getRecRegistrationByEmail(email, appwriteServices)
```

## Admin Dashboard Changes

### 1. Registration List View
- Shows one record per user
- Displays all years user has attended as badges
- Highlights current year registrations
- Filters work by checking if year exists in `conferenceYears` array

### 2. Statistics and Reporting
- Statistics calculated by checking `conferenceYears` contains target year
- CSV export includes all years user has attended
- Year-based filtering still works via array queries

## Testing Checklist

### Pre-Migration
- [ ] Backup all existing registration data
- [ ] Test migration script in development environment
- [ ] Verify migration logic handles all edge cases
- [ ] Prepare rollback plan

### Post-Migration Testing
- [ ] Verify user records consolidated correctly
- [ ] Test new registration flow for existing users
- [ ] Test new registration flow for new users
- [ ] Verify year-based queries still work
- [ ] Test admin dashboard with new schema
- [ ] Verify CSV export includes years correctly
- [ ] Test statistics calculation for each year

### User Experience Testing
- [ ] Test email check flow
- [ ] Test pre-filling from previous registrations
- [ ] Test updating existing registration for current year
- [ ] Test registering for new year with existing account
- [ ] Verify conference year automatically added to array

## Rollback Strategy

If issues arise:

1. **Immediate Rollback**
   - Restore from backup
   - Revert to previous code version
   - Update schema back to multi-record approach

2. **Partial Rollback**
   - Keep simplified code but revert schema changes
   - Temporarily disable new features

## Benefits of New Approach

### For Users
- **Simplified Interface**: No year selection required
- **Faster Registration**: Auto-populated from previous years
- **Single Account**: One registration record to manage
- **Smart Defaults**: System knows user's history

### For Administrators
- **Cleaner Data**: No duplicate user records
- **Better Analytics**: Clear view of user participation across years
- **Easier Management**: One record per user to maintain
- **Reduced Storage**: Less database space used

### For System
- **Better Performance**: Fewer records to query
- **Simpler Logic**: No complex year-based unique constraints
- **Easier Maintenance**: Less code complexity
- **Better UX**: More intuitive user flow

## Timeline

### Week 1: Preparation
- Backup existing data
- Test migration script
- Prepare rollback procedures

### Week 2: Migration
- Update database schema
- Run migration script
- Verify data integrity

### Week 3: Deployment
- Deploy updated application code
- Test all functionality
- Monitor for issues

### Week 4: Validation
- User acceptance testing
- Performance validation
- Documentation updates

## Support Documentation

### For Users
- Updated registration instructions
- How the new system works
- Benefits explanation

### For Administrators
- New dashboard features
- How to read the years array
- Reporting changes

The simplified approach provides a much better user experience while maintaining all the functionality needed for multi-year conference management.
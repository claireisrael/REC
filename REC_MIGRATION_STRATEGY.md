# REC Multi-Year Migration Strategy

## Overview
This document outlines the strategy for migrating from the single-year REC registration system to the new multi-year conference management system.

## Database Schema Changes

### New Collections Required

#### 1. REC_Conferences Collection
**Collection ID**: `recConferencesCollectionId` (to be created)

**Attributes**:
- `year` (integer, required, unique) - Conference year
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

**Indexes**:
- Unique index on `year`
- Index on `isActive`

#### 2. Updated REC_Registrations Collection
**New Attributes to Add**:
- `conferenceYear` (integer, required) - Year of the conference the registration is for

**Updated Indexes**:
- Composite unique index on `email` + `conferenceYear` (replaces single email unique index)
- Index on `conferenceYear`
- Composite index on `conferenceYear` + `registrationType`
- Composite index on `conferenceYear` + `daysAttending`

## Migration Steps

### Phase 1: Database Setup
1. **Create REC_Conferences Collection**
   ```javascript
   // In Appwrite Console
   // 1. Create new collection "REC_Conferences"
   // 2. Add all required attributes
   // 3. Set up indexes
   // 4. Update config.js with actual collection ID
   ```

2. **Update REC_Registrations Collection**
   ```javascript
   // In Appwrite Console
   // 1. Add 'conferenceYear' attribute (integer, required, default: 2024)
   // 2. Update indexes:
   //    - Remove unique index on 'email'
   //    - Add composite unique index on ['email', 'conferenceYear']
   //    - Add index on 'conferenceYear'
   //    - Add composite indexes for reporting
   ```

### Phase 2: Data Migration
1. **Migrate Existing Registrations**
   ```javascript
   // Migration script to run once
   import { Query } from "appwrite";
   import { config } from "./lib/appwrite/config";
   
   async function migrateExistingRegistrations(appwriteServices) {
     try {
       // Get all existing registrations
       const response = await appwriteServices.databases.listDocuments(
         config.databaseId,
         config.recRegistrationsCollectionId,
         [Query.limit(1000)]
       );
       
       // Update each registration to include conferenceYear: 2024
       for (const registration of response.documents) {
         if (!registration.conferenceYear) {
           await appwriteServices.databases.updateDocument(
             config.databaseId,
             config.recRegistrationsCollectionId,
             registration.$id,
             {
               conferenceYear: 2024
             }
           );
         }
       }
       
       console.log(`Migrated ${response.documents.length} registrations`);
     } catch (error) {
       console.error("Migration error:", error);
     }
   }
   ```

2. **Initialize Conference Configurations**
   ```javascript
   // Use the initializeDefaultConferences function
   import { initializeDefaultConferences } from "./lib/appwrite/rec-conferences";
   
   async function setupConferences(appwriteServices) {
     await initializeDefaultConferences(appwriteServices);
   }
   ```

### Phase 3: Frontend Updates
1. **Deploy Updated Code**
   - All new components and API functions are already implemented
   - Update configuration files with actual collection IDs
   - Test the new multi-year functionality

2. **Verify Migration**
   - Check that existing registrations display correctly
   - Test new registration flow
   - Verify admin dashboard functionality

## Configuration Updates Required

### 1. Update config.js
```javascript
// Replace placeholder with actual collection ID
recConferencesCollectionId: "ACTUAL_COLLECTION_ID_HERE"
```

### 2. Environment Variables (if needed)
```env
# Add any new environment variables for email services, etc.
EMAIL_SERVICE_API_KEY=your_key_here
```

## Testing Checklist

### Pre-Migration Testing
- [ ] Backup existing REC_Registrations data
- [ ] Test database schema changes in development environment
- [ ] Verify migration scripts work correctly

### Post-Migration Testing
- [ ] Existing registrations display correctly with year 2024
- [ ] New registrations can be created for different years
- [ ] Email check logic works for multi-year scenarios
- [ ] Dashboard filtering by year works correctly
- [ ] Conference management interface functions properly
- [ ] CSV export includes conference year
- [ ] User can register for multiple years
- [ ] Form pre-filling works from previous years

## Rollback Strategy

If issues arise during migration:

1. **Immediate Rollback**
   - Revert to previous code version
   - Remove `conferenceYear` attribute requirement temporarily
   - Restore original indexes

2. **Data Recovery**
   - Restore from backup if data corruption occurs
   - Remove conference configurations if needed

## Security Considerations

1. **Access Control**
   - Conference management restricted to Senior Managers
   - Registration data isolated by year
   - Proper validation on year selection

2. **Data Integrity**
   - Validate conference year exists before registration
   - Ensure unique email per conference year
   - Prevent orphaned registrations

## Performance Considerations

1. **Database Optimization**
   - Proper indexing for year-based queries
   - Pagination for large datasets
   - Efficient filtering and searching

2. **Frontend Optimization**
   - Cache conference configurations
   - Lazy load registration data
   - Efficient state management

## Maintenance Requirements

1. **Annual Tasks**
   - Create new conference configuration for upcoming year
   - Set appropriate active conference
   - Archive or backup old registration data

2. **Monitoring**
   - Track registration volumes by year
   - Monitor system performance
   - Regular data validation

## Timeline

### Week 1: Database Setup
- Create REC_Conferences collection
- Update REC_Registrations collection schema
- Test schema changes

### Week 2: Data Migration
- Run migration scripts
- Initialize conference configurations
- Validate migrated data

### Week 3: Frontend Deployment
- Deploy updated application
- Update configuration
- User acceptance testing

### Week 4: Go Live
- Final testing
- Documentation updates
- User training/communication

## Support Documentation

### For Senior Managers
- How to create new conference years
- How to set active conferences
- How to manage registration settings

### For End Users
- How to register for different years
- How to update existing registrations
- How to view registration history

## Monitoring and Alerts

Set up monitoring for:
- Registration submission errors
- Database performance issues
- Conference configuration changes
- User access issues

## Success Metrics

- Zero data loss during migration
- All existing registrations properly migrated
- New multi-year functionality working correctly
- User satisfaction with new features
- Improved administrative efficiency
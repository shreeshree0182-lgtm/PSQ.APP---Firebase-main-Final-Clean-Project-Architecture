/**
 * Airtable Persistence — thin re-export layer.
 *
 * All logic has been migrated to airtableService.js.
 * This file preserves the import paths that the rest of the app already uses.
 */
export {
  saveToAirtable,
  fetchAllProjects,
  fetchProjectById,
  deleteProjectById,
  generateCleanProjectId,
  buildProjectFields,
  buildMeasurementRecords,
  buildBoqRecords,
} from "./airtableService";

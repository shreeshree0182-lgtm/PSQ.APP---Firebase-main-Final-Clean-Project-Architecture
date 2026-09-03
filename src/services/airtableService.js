/**
 * Airtable Service — Projects table payload mapping & sync.
 *
 * This module is responsible ONLY for:
 *   1. Generating a clean 5-digit Project ID (PRJ-XXXXX).
 *   2. Building the field-mapped payload for the Airtable "Projects" table.
 *   3. Syncing that payload to Airtable with safe error handling.
 *
 * It does NOT touch UI components, state structures, or calculation logic.
 */

const BASE_ID = "appwFrqVsk7nDOOiZ";
const ACCESS_TOKEN = "pat6zhOHG05oMKoff.4a92482a905d17906b17eb43dc8f2bc916e2332fb4ff005796d72e4bc997325e";
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};

/**
 * Generates a clean 5-digit Project ID: PRJ- + random 5 digits.
 * @returns {string} e.g. "PRJ-10234"
 */
export function generateCleanProjectId() {
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `PRJ-${digits}`;
}

/**
 * Formats a Date to YYYY-MM-DD string.
 */
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Strips undefined/null/empty-string fields so Airtable doesn't reject the payload.
 */
function cleanPayload(fields) {
  const cleaned = {};
  Object.keys(fields).forEach((key) => {
    const v = fields[key];
    if (v !== undefined && v !== null && v !== "") {
      cleaned[key] = v;
    }
  });
  return cleaned;
}

/**
 * Builds the strictly-mapped field payload for the Airtable "Projects" table.
 *
 * @param {object} projectData - The full project object from app state.
 * @param {object} user - The active user object (name, id).
 * @param {string|null} pdfUrl - URL of generated PDF, if any.
 * @returns {object} Cleaned fields object ready for Airtable.
 */
export function buildProjectFields(projectData, user, pdfUrl = null) {
  const cust = projectData.customer || {};
  const projectName = projectData.projectName || projectData.name || projectData.clientName || cust.name || "";
  const clientName = cust.name || cust.fullName || projectData.clientName || "";
  const clientPhone = cust.mobile || cust.phone || projectData.clientMobile || "";
  const clientEmail = cust.email || projectData.clientEmail || "";

  const addressParts = [
    cust.address || projectData.location || "",
    cust.pincode ? String(cust.pincode) : "",
    cust.location || cust.landmark || "",
  ].filter(Boolean);
  const fullAddress = addressParts.join(", ");

  const supervisorName = user?.name || user?.displayName || "Unknown";
  const supervisorId = user?.id || user?.uid || "SUP-UNKNOWN";

  const now = new Date();
  const warrantyStart = toDateString(now);
  const warrantyEnd = toDateString(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));

  const projectId = generateCleanProjectId();

  return cleanPayload({
    "Project ID": projectId,
    "Project Name": projectName,
    "Client Name": clientName,
    "Client Phone": String(clientPhone),
    "Client Email": clientEmail,
    "Address": fullAddress,
    "Supervisor Name": supervisorName,
    "Supervisor ID": supervisorId,
    "PDF File": pdfUrl ? [{ url: pdfUrl }] : [],
    "Warranty Start Date": warrantyStart,
    "Warranty End Date": warrantyEnd,
    "Warranty Status": "Active",
  });
}

/**
 * Syncs a single project record to the Airtable "Projects" table.
 *
 * Keeps existing try-catch patterns: logs errors clearly and returns a
 * structured result without throwing, so the UI execution flow never breaks.
 *
 * @param {object} fields - Pre-built field payload (from buildProjectFields).
 * @returns {Promise<{ok: boolean, recordId?: string, error?: string}>}
 */
export async function syncProjectToAirtable(fields) {
  try {
    if (!fields || Object.keys(fields).length === 0) {
      throw new Error("Empty fields payload — nothing to sync to Airtable.");
    }

    const response = await fetch(`${BASE_URL}/Projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields, typecast: true }),
    });

    const resJson = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[Airtable Sync Error] Projects table:", resJson);
      return { ok: false, error: resJson.error?.message || `Airtable sync failed (status ${response.status})` };
    }

    return { ok: true, recordId: resJson.id };
  } catch (err) {
    console.error("[Airtable Sync Fatal] Projects table:", err);
    return { ok: false, error: err.message || "Unknown sync error" };
  }
}

/**
 * High-level helper: build fields from project data + user, then sync.
 *
 * @param {object} projectData - Full project object from app state.
 * @param {object} user - Active user object.
 * @param {string|null} pdfUrl - PDF URL if generated, else null.
 * @returns {Promise<{ok: boolean, projectId?: string, recordId?: string, error?: string}>}
 */
export async function saveProjectToAirtable(projectData, user, pdfUrl = null) {
  try {
    const fields = buildProjectFields(projectData, user, pdfUrl);
    const projectId = fields["Project ID"];

    const result = await syncProjectToAirtable(fields);

    if (!result.ok) {
      console.error("[Airtable Save Error] Project sync failed:", result.error);
      return { ok: false, projectId, error: result.error };
    }

    return { ok: true, projectId, recordId: result.recordId };
  } catch (err) {
    console.error("[Airtable Save Fatal]:", err);
    return { ok: false, error: err.message || "Unknown save error" };
  }
}

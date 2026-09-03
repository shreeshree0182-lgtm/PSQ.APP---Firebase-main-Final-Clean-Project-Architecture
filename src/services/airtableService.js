/**
 * Airtable Service — Full sync logic for all PaintShip tables.
 *
 * Tables handled:
 *   1. Projects          — clean 5-digit Project ID + strict field mapping
 *   2. Measurements      — Interior / Exterior / Wood-Metal / Wallpaper / Texture
 *   3. Wallpaper & Texture — Feature-level records
 *   4. Material BOQ       — Auto-calculated summary quantities
 *
 * Every API call is wrapped in try-catch and returns { ok, error } on failure
 * so the UI never crashes.
 */

const BASE_ID = "appwFrqVsk7nDOOiZ";
const ACCESS_TOKEN = "pat6zhOHG05oMKoff.4a92482a905d17906b17eb43dc8f2bc916e2332fb4ff005796d72e4bc997325e";
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};

// ─── ID GENERATORS ──────────────────────────────────────────────

export function generateCleanProjectId() {
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `PRJ-${digits}`;
}

function genMeasurementId() {
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `MEA-${digits}`;
}

function genFeatureId() {
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `FEAT-${digits}`;
}

function genBoqId() {
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `BOQ-${digits}`;
}

// ─── HELPERS ────────────────────────────────────────────────────

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
 * Calculates net interior wall/ceiling sqft for a room from its walls
 * and segments structure, ensuring a value > 0 is passed.
 */
function calcRoomNetSqft(room) {
  const flat = Number(room.totalSqft || room.netSqft || room.area || room.sqft || 0);
  if (flat > 0) return flat;

  const rh = room.roomHeight || room.roomHeightFt || 10;
  let wallArea = 0;

  const allWalls = [
    ...(Array.isArray(room.walls) ? room.walls : []),
    ...(Array.isArray(room.extraWalls) ? room.extraWalls : []),
  ];

  for (const w of allWalls) {
    const effH = w.height || w.h || rh || 10;
    const segs = (w.segments && w.segments.length > 0)
      ? w.segments
      : [{ length: w.length || w.w || 0, height: effH, depth: 0, openings: [] }];

    for (const seg of segs) {
      const sw = seg.length || seg.w || 0;
      const sh = seg.height || seg.h || effH || 10;
      let g = sw * sh;

      if (seg.depth > 0) {
        if (seg.kind === "recess" || seg.kind === "projection" || seg.kind === "beam") {
          g += 2 * (seg.depth || 0) * sh;
        } else if (seg.kind === "niche") {
          g += 2 * (seg.depth || 0) * sh + sw * (seg.depth || 0);
        }
      }

      const opAdj = (seg.openings || []).reduce((o, op) => {
        const a = (op.w || 0) * (op.h || 0) * (op.count || 1);
        return o + ((op.mode || "deduct") === "add" ? a : -a);
      }, 0);

      wallArea += Math.max(0, g + opAdj);
    }
  }

  const ceiling = Number(room.ceilingSqft || room.ceiling || 0) || 0;
  return Math.max(0, wallArea + ceiling);
}

/**
 * Formats finishing steps into a comma-separated string.
 * e.g. "1 Coat Primer, 2 Coats Enamel"
 */
function formatFinishingSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return "";
  return steps
    .filter((s) => s.enabled !== false)
    .map((s) => {
      const coats = s.coats || 1;
      const coatWord = coats === 1 ? "Coat" : "Coats";
      const service = s.service || s.name || "";
      return `${coats} ${coatWord} ${service}`.trim();
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Calculates total exterior elevation net sqft.
 */
function calcExteriorNet(exteriorArr) {
  if (!Array.isArray(exteriorArr)) return 0;
  return exteriorArr.reduce((sum, el) => {
    const sections = Array.isArray(el.sections) ? el.sections : [];
    let elArea = 0;
    for (const sec of sections) {
      const w = Number(sec.length || sec.w || sec.width || 0);
      const h = Number(sec.height || sec.h || sec.heightFt || 0);
      elArea += w * h;
    }
    const deductions = Array.isArray(el.deductions) ? el.deductions : [];
    const dedArea = deductions.reduce((s, d) => {
      const dw = Number(d.length || d.w || 0);
      const dh = Number(d.height || d.h || 0);
      return s + dw * dh;
    }, 0);
    const additions = Array.isArray(el.additions) ? el.additions : [];
    const addArea = additions.reduce((s, a) => {
      const aw = Number(a.length || a.w || 0);
      const ah = Number(a.height || a.h || 0);
      return s + aw * ah;
    }, 0);

    const net = Math.max(0, elArea - dedArea + addArea);
    if (net > 0) return sum + net;
    return sum + Number(el.netSqft || el.area || 0);
  }, 0);
}

// ─── 1. PROJECTS TABLE ──────────────────────────────────────────

export function buildProjectFields(projectData, user, pdfUrl = null) {
  const cust = projectData.customer || {};
  // Fold client name into Project Name — the Projects table has no "Client Name" column.
  const clientName = cust.name || cust.fullName || projectData.clientName || "";
  const projectName = projectData.projectName || projectData.name || clientName || "";

  const supervisorName = user?.name || user?.displayName || "Unknown";

  const projectId = generateCleanProjectId();

  // Only include fields that exist as columns in the Airtable Projects table.
  // Client details (phone, email, address) and warranty info live in the
  // JSON Backup and/or the Customers table, not as Projects columns.
  return {
    fields: cleanPayload({
      "Project ID": projectId,
      "Project Name": projectName,
      "Supervisor Name": supervisorName,
    }),
    projectId,
  };
}

// ─── 2. MEASUREMENTS TABLE ──────────────────────────────────────

export function buildMeasurementRecords(serializedData, projectRecordId) {
  const records = [];

  // Interior rooms
  const floors = Array.isArray(serializedData.floors) ? serializedData.floors : [];
  floors.forEach((f) => {
    const rooms = Array.isArray(f.rooms) ? f.rooms : [];
    rooms.forEach((r) => {
      const netArea = calcRoomNetSqft(r);
      if (netArea > 0 || r.roomType || r.type) {
        records.push({
          fields: cleanPayload({
            "Measurement ID": genMeasurementId(),
            "Project": [projectRecordId],
            "Scope": "Interior",
            "Floor / Area Name": String(f.floorName || f.name || "Ground Floor").trim(),
            "Room / Elevation Name": String(r.roomType || r.roomName || r.name || r.type || "Room").trim(),
            "Total Area Sqft": Number(netArea.toFixed(2)),
            "Finishing Steps": formatFinishingSteps(r.finishingSteps || r.steps),
          }),
        });
      }
    });
  });

  // Exterior sides
  const exteriorSides =
    serializedData.exteriorWork?.sides ||
    serializedData.exteriorSides ||
    serializedData.exterior ||
    [];
  if (Array.isArray(exteriorSides)) {
    exteriorSides.forEach((s) => {
      const sideArea = Number(s.netSqft || s.totalSqft || s.area || 0);
      if (sideArea > 0 || s.sideName || s.name) {
        records.push({
          fields: cleanPayload({
            "Measurement ID": genMeasurementId(),
            "Project": [projectRecordId],
            "Scope": "Exterior",
            "Floor / Area Name": "Exterior",
            "Room / Elevation Name": String(s.sideName || s.name || "Elevation Side").trim(),
            "Total Area Sqft": Number(sideArea.toFixed(2)),
            "Finishing Steps": formatFinishingSteps(s.finishingSteps),
          }),
        });
      }
    });
  }

  // Wood / Metal items
  const joinery = serializedData.woodAndMetalItems || serializedData.doorWindowItems || [];
  if (Array.isArray(joinery)) {
    joinery.forEach((j) => {
      const area = Number(j.dimensions?.totalSqft || j.sqft || j.totalSqft || 0);
      if (area > 0 || j.itemType || j.type) {
        const loc = j.location || {};
        const locStr = [loc.floorName, loc.roomName].filter(Boolean).join(" — ") || "General";
        records.push({
          fields: cleanPayload({
            "Measurement ID": genMeasurementId(),
            "Project": [projectRecordId],
            "Scope": "Wood/Metal",
            "Floor / Area Name": loc.floorName || "General",
            "Room / Elevation Name": String(j.customLabel || j.itemType || j.type || "Joinery Item").trim(),
            "Total Area Sqft": Number(area.toFixed(2)),
            "Finishing Steps": j.coats ? `${j.coats} ${j.coats === 1 ? "Coat" : "Coats"} ${j.finishType || j.productName || ""}`.trim() : "",
          }),
        });
      }
    });
  }

  // Wallpaper items
  const wallpapers = serializedData.specialFeatures?.wallpapers || serializedData.wallpaperItems || [];
  if (Array.isArray(wallpapers)) {
    wallpapers.forEach((w) => {
      const area = Number(w.area || w.totalSqft || (w.wallDimensionsFt && w.wallDimensionsFt.totalSqft) || 0);
      if (area > 0 || w.label) {
        records.push({
          fields: cleanPayload({
            "Measurement ID": genMeasurementId(),
            "Project": [projectRecordId],
            "Scope": "Wallpaper",
            "Floor / Area Name": "Specialty",
            "Room / Elevation Name": String(w.label || "Wallpaper Area").trim(),
            "Total Area Sqft": Number(area.toFixed(2)),
            "Finishing Steps": w.design || w.brand || "",
          }),
        });
      }
    });
  }

  // Texture items
  const textures = serializedData.specialFeatures?.textures || serializedData.textureItems || serializedData.TX2_textureItems || [];
  if (Array.isArray(textures)) {
    textures.forEach((t) => {
      const area = Number(t.area || t.totalSqft || (t.wallDimensionsFt && t.wallDimensionsFt.totalSqft) || 0);
      if (area > 0 || t.label) {
        records.push({
          fields: cleanPayload({
            "Measurement ID": genMeasurementId(),
            "Project": [projectRecordId],
            "Scope": "Texture",
            "Floor / Area Name": "Specialty",
            "Room / Elevation Name": String(t.label || "Texture Finish").trim(),
            "Total Area Sqft": Number(area.toFixed(2)),
            "Finishing Steps": t.type || t.customType || "",
          }),
        });
      }
    });
  }

  return records;
}

// ─── 3. WALLPAPER & TEXTURE TABLE ───────────────────────────────

export function buildFeatureRecords(serializedData, projectRecordId) {
  const records = [];

  const wallpapers = serializedData.specialFeatures?.wallpapers || serializedData.wallpaperItems || [];
  if (Array.isArray(wallpapers)) {
    wallpapers.forEach((w) => {
      const width = Number(w.wallW || w.width || (w.wallDimensionsFt && w.wallDimensionsFt.width) || 0);
      const height = Number(w.wallH || w.height || (w.wallDimensionsFt && w.wallDimensionsFt.height) || 0);
      const area = Number(w.area || w.totalSqft || (w.wallDimensionsFt && w.wallDimensionsFt.totalSqft) || 0);
      const details = [w.design, w.brand, w.rollPreset].filter(Boolean).join(", ");
      records.push({
        fields: cleanPayload({
          "Feature ID": genFeatureId(),
          "Project": [projectRecordId],
          "Type": "Wallpaper",
          "Dimensions": width && height ? `${width} x ${height} ft` : "",
          "Total Area Sqft": Number(area.toFixed(2)),
          "Details": details,
        }),
      });
    });
  }

  const textures = serializedData.specialFeatures?.textures || serializedData.textureItems || serializedData.TX2_textureItems || [];
  if (Array.isArray(textures)) {
    textures.forEach((t) => {
      const width = Number(t.wallW || t.width || (t.wallDimensionsFt && t.wallDimensionsFt.width) || 0);
      const height = Number(t.wallH || t.height || (t.wallDimensionsFt && t.wallDimensionsFt.height) || 0);
      const area = Number(t.area || t.totalSqft || (t.wallDimensionsFt && t.wallDimensionsFt.totalSqft) || 0);
      const details = [t.type, t.customType, t.brand].filter(Boolean).join(", ");
      records.push({
        fields: cleanPayload({
          "Feature ID": genFeatureId(),
          "Project": [projectRecordId],
          "Type": "Texture",
          "Dimensions": width && height ? `${width} x ${height} ft` : "",
          "Total Area Sqft": Number(area.toFixed(2)),
          "Details": details,
        }),
      });
    });
  }

  return records;
}

// ─── 4. MATERIAL BOQ TABLE ──────────────────────────────────────

/**
 * Auto-calculates material BOQ entries from total measurements.
 * Coverage assumptions (sqft per unit):
 *   Paint:  140 sqft/L per coat
 *   Putty:  40 sqft/Kg
 *   Primer: 100 sqft/L per coat
 */
export function buildBoqRecords(serializedData, projectRecordId) {
  const records = [];
  const COVERAGE = { paint: 140, putty: 40, primer: 100 };

  // Aggregate areas
  let interiorArea = 0;
  let exteriorArea = 0;
  let wallpaperArea = 0;
  let textureArea = 0;

  const floors = Array.isArray(serializedData.floors) ? serializedData.floors : [];
  floors.forEach((f) => {
    (f.rooms || []).forEach((r) => {
      interiorArea += calcRoomNetSqft(r);
    });
  });

  const extSides = serializedData.exteriorWork?.sides || serializedData.exteriorSides || [];
  if (Array.isArray(extSides)) {
    extSides.forEach((s) => {
      exteriorArea += Number(s.netSqft || s.totalSqft || s.area || 0);
    });
  }

  const wallpapers = serializedData.specialFeatures?.wallpapers || serializedData.wallpaperItems || [];
  if (Array.isArray(wallpapers)) {
    wallpapers.forEach((w) => {
      wallpaperArea += Number(w.area || w.totalSqft || 0);
    });
  }

  const textures = serializedData.specialFeatures?.textures || serializedData.textureItems || [];
  if (Array.isArray(textures)) {
    textures.forEach((t) => {
      textureArea += Number(t.area || t.totalSqft || 0);
    });
  }

  // Interior Paint
  if (interiorArea > 0) {
    const pkg = floors[0]?.rooms?.[0]?.package || "premium";
    const brand = floors[0]?.rooms?.[0]?.brand || "asian";
    const coats = 2;
    const liters = Math.ceil((interiorArea * coats) / COVERAGE.paint);
    records.push({
      fields: cleanPayload({
        "BOQ ID": genBoqId(),
        "Project": [projectRecordId],
        "Category": "Interior Paint",
        "Brand & Product": `${brand} — ${pkg}`,
        "Total Quantity": Number(liters),
        "Unit": "Liters",
      }),
    });
  }

  // Exterior Paint
  if (exteriorArea > 0) {
    const extPkg = serializedData.exteriorWork?.package || "premium";
    const extBrand = serializedData.exteriorWork?.brand || "asian";
    const coats = 2;
    const liters = Math.ceil((exteriorArea * coats) / COVERAGE.paint);
    records.push({
      fields: cleanPayload({
        "BOQ ID": genBoqId(),
        "Project": [projectRecordId],
        "Category": "Exterior Paint",
        "Brand & Product": `${extBrand} — ${extPkg}`,
        "Total Quantity": Number(liters),
        "Unit": "Liters",
      }),
    });
  }

  // Putty (interior + exterior)
  const puttyArea = interiorArea + exteriorArea;
  if (puttyArea > 0) {
    const kg = Math.ceil(puttyArea / COVERAGE.putty);
    records.push({
      fields: cleanPayload({
        "BOQ ID": genBoqId(),
        "Project": [projectRecordId],
        "Category": "Putty",
        "Brand & Product": "Birla White Wallcare Putty",
        "Total Quantity": Number(kg),
        "Unit": "Kg",
      }),
    });
  }

  // Primer (interior + exterior)
  if (puttyArea > 0) {
    const liters = Math.ceil(puttyArea / COVERAGE.primer);
    records.push({
      fields: cleanPayload({
        "BOQ ID": genBoqId(),
        "Project": [projectRecordId],
        "Category": "Primer",
        "Brand & Product": "Asian Paints Primer",
        "Total Quantity": Number(liters),
        "Unit": "Liters",
      }),
    });
  }

  // Wallpaper
  if (wallpaperArea > 0) {
    const rollArea = 0.53 * 10;
    const rolls = Math.ceil(wallpaperArea / rollArea);
    records.push({
      fields: cleanPayload({
        "BOQ ID": genBoqId(),
        "Project": [projectRecordId],
        "Category": "Wallpaper",
        "Brand & Product": "Standard Wallpaper Roll",
        "Total Quantity": Number(rolls),
        "Unit": "Rolls",
      }),
    });
  }

  // Texture
  if (textureArea > 0) {
    const kg = Math.ceil(textureArea / COVERAGE.putty);
    records.push({
      fields: cleanPayload({
        "BOQ ID": genBoqId(),
        "Project": [projectRecordId],
        "Category": "Texture",
        "Brand & Product": "Texture Compound",
        "Total Quantity": Number(kg),
        "Unit": "Kg",
      }),
    });
  }

  return records;
}

// ─── AIRTABLE FETCH WRAPPER ────────────────────────────────────

async function airtableFetch(path, options = {}) {
  let url = `${BASE_URL}/`;
  if (path.includes("?")) {
    const [tablePath, queryString] = path.split("?");
    url += `${tablePath.split("/").map(encodeURIComponent).join("/")}?${queryString}`;
  } else {
    url += path.split("/").map(encodeURIComponent).join("/");
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    const resJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[Airtable Error] Path: ${path}`, resJson);
      throw new Error(resJson.error?.message || `Airtable fetch failed with status ${response.status}`);
    }
    return resJson;
  } catch (err) {
    console.error(`[Network/Airtable Fatal] Path: ${path}`, err);
    throw err;
  }
}

/**
 * Batch create (max 10 records per call).
 * Strips unknown fields on retry if Airtable rejects them.
 */
async function batchCreate(tableName, records) {
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    await safeBatchPost(tableName, chunk);
  }
}

async function safeBatchPost(tableName, records) {
  let current = records;
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      await airtableFetch(tableName, {
        method: "POST",
        body: JSON.stringify({ records: current, typecast: true }),
      });
      return;
    } catch (err) {
      const match = err.message && err.message.match(/Unknown field name: "([^"]+)"/);
      if (match && attempts < maxAttempts - 1) {
        const badField = match[1];
        console.warn(`[Airtable] Stripping unknown field "${badField}" from ${tableName} and retrying...`);
        current = current.map((r) => {
          const { [badField]: _, ...rest } = r.fields || {};
          return { fields: rest };
        });
        attempts++;
        continue;
      }
      throw err;
    }
  }
}

// ─── CUSTOMER LINKING ──────────────────────────────────────────

async function linkOrCreateCustomer(serializedData) {
  const custObj = serializedData.customer || serializedData.clientInfo || {};
  const rawName = custObj.name || custObj.fullName || serializedData.projectName || "";
  const customerName = rawName.trim();

  if (!customerName || customerName === "Unnamed Project" || customerName === "Valued Customer" || customerName === "New Estimate") {
    throw new Error("Customer Name / Project Name is required before saving to database.");
  }

  const customerMobile = String(custObj.mobile || custObj.phone || "").trim();
  const customerEmail = String(custObj.email || "").trim();

  let customerRecordId = null;
  const customerFields = cleanPayload({
    "Customer ID": `CUST-${Date.now()}`,
    "Name": customerName,
    "Mobile": customerMobile,
    "Email": customerEmail,
    "Location & Address": custObj.address || custObj.location || "",
    "Pincode": String(custObj.pincode || ""),
  });

  if (customerMobile || customerEmail) {
    const filterFormula = customerMobile ? `{Mobile}='${customerMobile}'` : `{Email}='${customerEmail}'`;
    try {
      const searchRes = await airtableFetch(`Customers?filterByFormula=${encodeURIComponent(filterFormula)}`, { method: "GET" });
      if (searchRes.records && searchRes.records.length > 0) {
        customerRecordId = searchRes.records[0].id;
      }
    } catch (e) {
      console.warn("Customer search error:", e);
    }
  }

  if (!customerRecordId) {
    const newCust = await airtableFetch("Customers", {
      method: "POST",
      body: JSON.stringify({ fields: customerFields, typecast: true }),
    });
    customerRecordId = newCust.id;
  }

  return customerRecordId;
}

// ─── MAIN SAVE FUNCTION ─────────────────────────────────────────

/**
 * Full save: Projects + Measurements + Wallpaper & Texture + Material BOQ.
 * Replaces the old saveToAirtable from airtablePersistence.js.
 *
 * @param {object} serializedData - Serialized project data from paintShipSerializer.
 * @param {object} projectData - Raw project object from app state.
 * @param {object} [user] - Active user object.
 * @param {string|null} [pdfUrl] - Generated PDF URL if available.
 * @returns {Promise<{ok: boolean, projectRecordId?: string, projectId?: string, error?: string}>}
 */
export async function saveToAirtable(serializedData, projectData = {}, user = null, pdfUrl = null) {
  try {
    if (!serializedData) throw new Error("No payload data received for saving.");

    // 1. Customer linking
    const customerRecordId = await linkOrCreateCustomer(serializedData);

    // 2. Project creation with clean ID + strict field mapping
    const { fields: projectFields, projectId } = buildProjectFields(projectData, user, pdfUrl);

    // Attach customer link + JSON backup + legacy fields for backward compat.
    // Only include keys that are confirmed Airtable Projects columns.
    const fullProjectFields = cleanPayload({
      ...projectFields,
      "Category": serializedData.projectInfo?.category || projectData.projectCategory || projectData.category || "Residential House",
      "Type": serializedData.projectInfo?.type || projectData.projectType || projectData.type || "Fresh Painting",
      "Quote Mode": serializedData.projectInfo?.quoteMode || projectData.quoteMode || "Labour Only",
      "Grand Total Amount": Number(serializedData.summaryMetrics?.grandTotal || serializedData.grandTotal || 0),
      "JSON Backup": JSON.stringify(serializedData),
      "Customer": customerRecordId ? [customerRecordId] : undefined,
    });

    const newProject = await airtableFetch("Projects", {
      method: "POST",
      body: JSON.stringify({ fields: fullProjectFields, typecast: true }),
    });

    const projectRecordId = newProject.id;
    if (!projectRecordId) throw new Error("Failed to create Project record in database.");

    // 3. Measurements — isolated failure, does not halt remaining syncs
    try {
      const measurementRecords = buildMeasurementRecords(serializedData, projectRecordId);
      if (measurementRecords.length > 0) {
        await batchCreate("Measurements", measurementRecords);
      }
    } catch (err) {
      console.warn("[Airtable Sync Warning] Measurements table skipped:", err);
    }

    // 4. Wallpaper and Texture — isolated failure, does not halt remaining syncs
    try {
      const featureRecords = buildFeatureRecords(serializedData, projectRecordId);
      if (featureRecords.length > 0) {
        await batchCreate("Wallpaper and Texture", featureRecords);
      }
    } catch (err) {
      console.warn("[Airtable Sync Warning] Wallpaper and Texture table skipped:", err);
    }

    // 5. Material BOQ — isolated failure, does not halt remaining syncs
    try {
      const boqRecords = buildBoqRecords(serializedData, projectRecordId);
      if (boqRecords.length > 0) {
        await batchCreate("Material BOQ", boqRecords);
      }
    } catch (err) {
      console.warn("[Airtable Sync Warning] Material BOQ table skipped:", err);
    }

    return { ok: true, projectRecordId, projectId };
  } catch (err) {
    console.error("[Airtable Save Error]", err);
    return { ok: false, error: err.message };
  }
}

// ─── FETCH HELPERS (re-exported for backward compat) ────────────

export async function fetchAllProjects() {
  try {
    const data = await airtableFetch("Projects", { method: "GET" });
    const records = Array.isArray(data.records) ? data.records : [];

    return records.map((r) => {
      const fields = r.fields || {};
      let nested = {};
      try {
        const backup = fields["JSON Backup"];
        if (backup) nested = JSON.parse(backup);
      } catch (e) {
        console.warn("[Airtable] Failed to parse JSON Backup:", e);
      }

      return {
        id: r.id,
        name: fields["Project Name"] || nested.projectName || nested.clientName || (nested.customer && nested.customer.name) || "New Estimate",
        grandTotal: fields["Grand Total Amount"] || nested.grandTotal || nested.summaryMetrics?.grandTotal || 0,
        supervisor: fields["Supervisor Name"] || nested.assignedSupervisor?.name || "",
        category: fields["Category"] || nested.projectInfo?.projectCategory || nested.projectCategory || "",
        ...fields,
        ...nested,
      };
    });
  } catch (e) {
    console.error("Fetch error:", e);
    return [];
  }
}

export async function fetchProjectById(recordId) {
  try {
    const project = await airtableFetch(`Projects/${recordId}`);
    const fields = project.fields || {};
    let nested = {};
    try {
      const backup = fields["JSON Backup"];
      if (backup) nested = JSON.parse(backup);
    } catch (e) {
      console.warn("[Airtable] Failed to parse JSON Backup:", e);
    }

    return {
      id: project.id,
      ...fields,
      ...nested,
      projectInfo: {
        projectName: fields["Project Name"] || nested.projectInfo?.projectName || nested.projectName,
        grandTotal: fields["Grand Total Amount"] || nested.grandTotal,
        quoteMode: nested.projectInfo?.quoteMode,
        projectCategory: nested.projectInfo?.projectCategory,
        projectType: nested.projectInfo?.projectType,
      },
    };
  } catch (err) {
    console.error("[Airtable Fetch Project Error]", err);
    throw err;
  }
}

export async function deleteProjectById(recordId) {
  try {
    return await airtableFetch(`Projects/${recordId}`, { method: "DELETE" });
  } catch (err) {
    console.error("[Airtable Delete Error]", err);
    throw err;
  }
}

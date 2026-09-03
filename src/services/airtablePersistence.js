const BASE_ID = "appwFrqVsk7nDOOiZ";
const ACCESS_TOKEN = "pat6zhOHG05oMKoff.4a92482a905d17906b17eb43dc8f2bc916e2332fb4ff005796d72e4bc997325e";
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};

/**
  Core Airtable fetch wrapper handling query params and error handling safely
 */
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
  Strips undefined, null, or empty string fields to prevent Airtable validation payload errors
 */
function cleanPayload(fields) {
  const cleaned = {};
  Object.keys(fields).forEach((key) => {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") {
      cleaned[key] = fields[key];
    }
  });
  return cleaned;
}

/**
  Helper: Calculate Total Sqft dynamically from all scopes
 */
function calculateProjectTotalSqft(nested = {}) {
  let total = 0;

  // 1. Interior Floors Sqft — compute from walls/segments when flat fields missing
  const floors = Array.isArray(nested.floors) ? nested.floors : [];
  floors.forEach((f) => {
    const rooms = Array.isArray(f.rooms) ? f.rooms : [];
    rooms.forEach((r) => {
      const flat = Number(r.totalSqft || r.netSqft || r.area || r.sqft || 0);
      if (flat > 0) {
        total += flat;
        return;
      }
      // Compute from walls/segments
      const rh = r.roomHeight || 10;
      const wallArea = (r.walls || []).reduce((s, w) => {
        const effH = w.height || rh || 10;
        const segs = (w.segments || []).length > 0
          ? w.segments
          : [{ length: w.length || 0, height: effH, depth: 0, openings: [] }];
        return s + segs.reduce((ss, seg) => {
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
          return ss + Math.max(0, g + opAdj);
        }, 0);
      }, 0);
      total += wallArea;
    });
  });

  // 2. Exterior Sides Sqft
  const exteriorSides = nested.exteriorSides || nested.exteriorWork?.sides || nested.exterior?.sides || [];
  if (Array.isArray(exteriorSides)) {
    exteriorSides.forEach((s) => {
      total += Number(s.netSqft || s.totalSqft || s.area || 0);
    });
  }

  // 3. Joinery Items Sqft
  const joinery = nested.doorWindowItems || nested.woodAndMetalItems || nested.joineryItems || [];
  if (Array.isArray(joinery)) {
    joinery.forEach((j) => {
      total += Number(j.dimensions?.totalSqft || j.sqft || j.totalSqft || 0);
    });
  }

  // 4. Fallback checks if calculated total is still 0
  if (total === 0) {
    total = Number(
      nested.totalSqft ||
      nested.totalSqFt ||
      nested.summaryMetrics?.totalInteriorSqft ||
      nested.summaryMetrics?.grandTotalSqft ||
      0
    );
  }

  return total;
}

/**
  Batch create helper (max 10 records per API call as per Airtable limits)
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

/**
  Explicit Save Function: Call ONLY when user manually clicks Save button
 */
export async function saveToAirtable(serializedData, projectData = {}) {
  try {
    if (!serializedData) throw new Error("No payload data received for saving.");

    // Calculate total sqft accurately before payload structure
    const calculatedSqft = calculateProjectTotalSqft(serializedData);

    // 1. CUSTOMER LINKING & VALIDATION
    const custObj = serializedData.customer || serializedData.clientInfo || {};
    const rawName = custObj.name || custObj.fullName || custObj.clientName || serializedData.projectName || "";
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
      const filterFormula = customerMobile
        ? `{Mobile}='${customerMobile}'`
        : `{Email}='${customerEmail}'`;
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

    // Embed calculated totalSqft inside JSON Backup
    serializedData.totalSqft = calculatedSqft;

    // 2. PROJECT CREATION
    const project = serializedData.project || serializedData.projectInfo || {};
    const selectedCategory = serializedData.projectInfo?.category || project.category || "Residential House";
    const selectedSupervisor = serializedData.assignedSupervisor?.name || project.supervisor || "Raj";
    const selectedType = serializedData.projectInfo?.type || project.type || "Fresh Painting";

    const projectFields = cleanPayload({
      "Project ID": project.id || `PROJ-${Date.now()}`,
      "Project Name": project.projectName || customerName,
      "Supervisor Name": selectedSupervisor,
      "Category": selectedCategory,
      "Type": selectedType,
      "Quote Mode": serializedData.projectInfo?.quoteMode || "Labour Only",
      "Grand Total Amount": Number(serializedData.summaryMetrics?.grandTotal || serializedData.grandTotal || 0),
      "JSON Backup": JSON.stringify(serializedData),
      "Customer": customerRecordId ? [customerRecordId] : undefined,
    });

    const newProject = await airtableFetch("Projects", {
      method: "POST",
      body: JSON.stringify({ fields: projectFields, typecast: true }),
    });

    const projectRecordId = newProject.id;
    if (!projectRecordId) throw new Error("Failed to create Project ID record in database.");

    // 3. MEASUREMENTS
    const measurements = [];
    let measurementIndex = 0;

    const floors = Array.isArray(serializedData.floors) ? serializedData.floors : [];
    floors.forEach((f) => {
      const rooms = Array.isArray(f.rooms) ? f.rooms : [];
      rooms.forEach((r) => {
        measurementIndex++;
        measurements.push({
          fields: cleanPayload({
            "Measurement ID": `MEAS-${measurementIndex}`,
            "Scope": "Interior",
            "Floor / Area Name": String(f.floorName || f.name || "Ground Floor").trim(),
            "Room / Elevation Name": String(r.roomType || r.roomName || r.name || "Room").trim(),
            "Total Area Sqft": Number(r.totalSqft || r.netSqft || r.area || r.sqft || 0),
            "Project": [projectRecordId],
          }),
        });
      });
    });

    const exteriorSides = serializedData.exteriorWork?.sides || serializedData.exterior?.sides || serializedData.exteriorSides || [];
    if (Array.isArray(exteriorSides)) {
      exteriorSides.forEach((s) => {
        const sideArea = Number(s.netSqft || s.totalSqft || s.area || 0);
        if (sideArea > 0 || s.sideName || s.name) {
          measurementIndex++;
          measurements.push({
            fields: cleanPayload({
              "Measurement ID": `MEAS-${measurementIndex}`,
              "Scope": "Exterior",
              "Floor / Area Name": "Exterior",
              "Room / Elevation Name": String(s.sideName || s.name || "Elevation Side").trim(),
              "Total Area Sqft": sideArea,
              "Project": [projectRecordId],
            }),
          });
        }
      });
    }

    if (measurements.length > 0) {
      await batchCreate("Measurements", measurements);
    }

    // 4. JOINERY
    const joineryRaw = serializedData.doorWindowItems || serializedData.woodAndMetalItems || serializedData.joineryItems || [];
    if (Array.isArray(joineryRaw) && joineryRaw.length > 0) {
      const joineryItems = joineryRaw.map((j, idx) => ({
        fields: cleanPayload({
          "Item ID": `JOIN-${idx + 1}`,
          "Item Type": String(j.itemType || j.type || "Other").trim(),
          "Custom Label": String(j.customLabel || j.label || "").trim(),
          "Dimensions Sqft": Number(j.dimensions?.totalSqft || j.sqft || j.totalSqft || 0),
          "Finish Type & Product": `${j.finishType || ""} - ${j.productName || j.product || ""}`.trim(),
          "Project": [projectRecordId],
        }),
      }));
      await batchCreate("Joinery", joineryItems);
    }

    return { ok: true, projectRecordId };
  } catch (err) {
    console.error("Save Error:", err);
    return { ok: false, error: err.message };
  }
}

/**
  Fetch all valid projects with FULL Dynamic Sqft Parsing
 */
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

      const derivedSqft = calculateProjectTotalSqft(nested);
      const name = fields["Project Name"] || nested.projectName || nested.clientName || (nested.customer && nested.customer.name) || "New Estimate";

      return {
        id: r.id,
        name,
        grandTotal: fields["Grand Total Amount"] || nested.grandTotal || nested.summaryMetrics?.grandTotal || 0,
        totalSqft: derivedSqft,
        supervisor: fields["Supervisor Name"] || nested.assignedSupervisor?.name || nested.supervisorName || "",
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

/**
  Fetch a specific project details by ID with complete restored state
 */
export async function fetchProjectById(recordId) {
  const project = await airtableFetch(`Projects/${recordId}`);
  const fields = project.fields || {};
  let nested = {};
  try {
    const backup = fields["JSON Backup"];
    if (backup) nested = JSON.parse(backup);
  } catch (e) {
    console.warn("[Airtable] Failed to parse JSON Backup:", e);
  }

  const derivedSqft = calculateProjectTotalSqft(nested);

  return {
    id: project.id,
    ...fields,
    ...nested,
    totalSqft: derivedSqft,
    projectInfo: {
      projectName: fields["Project Name"] || nested.projectInfo?.projectName || nested.projectName,
      grandTotal: fields["Grand Total Amount"] || nested.grandTotal,
      totalSqft: derivedSqft,
      quoteMode: nested.projectInfo?.quoteMode,
      projectCategory: nested.projectInfo?.projectCategory,
      projectType: nested.projectInfo?.projectType,
    },
  };
}

/**
  Delete specific project by Record ID
 */
export async function deleteProjectById(recordId) {
  return await airtableFetch(`Projects/${recordId}`, {
    method: "DELETE",
  });
}

/**
  Utility: Cleanup all junk/unnamed projects created by auto-save loops
 */
export async function deleteAllUnnamedProjects() {
  try {
    const data = await airtableFetch("Projects", { method: "GET" });
    const records = data.records || [];

    const junk = records.filter((r) => {
      const customer = r.fields["Customer"];
      const jsonBackup = r.fields["JSON Backup"] || "";
      const projectId = String(r.fields["Project ID"] || "");

      const noCustomer = !customer || customer.length === 0;
      const hasUnnamedInJson = jsonBackup.includes("Unnamed") || JSON.stringify(r.fields).includes("Unnamed");
      const isAutoSavedId = projectId.startsWith("PROJ-");

      return noCustomer || hasUnnamedInJson || isAutoSavedId;
    });

    for (let i = 0; i < junk.length; i += 10) {
      const chunk = junk.slice(i, i + 10);
      const idsParam = chunk.map((r) => `records[]=${r.id}`).join("&");
      await airtableFetch(`Projects?${idsParam}`, { method: "DELETE" });
    }
    return { ok: true, deletedCount: junk.length };
  } catch (err) {
    console.error("Cleanup error:", err);
    return { ok: false, error: err.message };
  }
}
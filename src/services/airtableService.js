/**
 * Airtable Service — Full sync logic for all PaintShip tables.
 *
 * Tables handled:
 *   1. Projects          — clean 5-digit Project ID + strict field mapping
 *   2. Measurements      — Interior / Exterior / Wood-Metal / Wallpaper / Texture
 *   3. Material BOQ       — Auto-calculated summary quantities
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

/** Formats a number in Indian currency style with grouping, e.g. 227755 → "₹2,27,755" */
function formatIndianCurrency(n) {
  const s = Math.round(n || 0).toString();
  if (s.length <= 3) return "₹" + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return "₹" + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

/** Parses a dimensions string like "10 x 10 ft" or "20 x 25 ft" and returns the product (area). */
function parseDimensionsToArea(dimStr) {
  if (!dimStr || typeof dimStr !== "string") return 0;
  const nums = dimStr.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return 0;
  return Number(nums[0]) * Number(nums[1]);
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

/**
 * Collects joinery / wood-metal items and groups them by floor+room.
 * Returns a Map keyed by "floorName||roomName" → summary string.
 * Items with no room match go under a "__global" key.
 */
function buildJoineryByRoom(serializedData) {
  const items = serializedData.woodAndMetalItems || serializedData.doorWindowItems || [];
  const byRoom = new Map();
  if (!Array.isArray(items) || items.length === 0) return byRoom;

  for (const item of items) {
    const label = (item.itemType || item.customLabel || item.kind || "Item").trim();
    const display = label.charAt(0).toUpperCase() + label.slice(1);
    const sqft = Number(item.dimensions?.totalSqft || item.totalSqft || item.area || 0);
    const qty = Number(item.dimensions?.qty || item.qty || 1) || 1;
    const floorName = String(item.location?.floorName || "").trim();
    const roomName = String(item.location?.roomName || "").trim();
    const key = floorName || roomName ? `${floorName}||${roomName}` : "__global";

    if (!byRoom.has(key)) byRoom.set(key, { groups: {}, totalArea: 0 });
    const entry = byRoom.get(key);
    if (!entry.groups[display]) entry.groups[display] = { count: 0, area: 0 };
    entry.groups[display].count += qty;
    entry.groups[display].area += sqft;
    entry.totalArea += sqft;
  }

  return byRoom;
}

function joineryMapToString(entry) {
  if (!entry) return "";
  return Object.entries(entry.groups)
    .map(([label, g]) => {
      const areaPart = g.area > 0 ? ` (${g.area.toFixed(2)} sqft total)` : "";
      return `${g.count}x ${label}${areaPart}`;
    })
    .join(", ");
}

// ─── 1. PROJECTS TABLE ──────────────────────────────────────────

// Allowlist of confirmed Airtable Projects table column names.
// Any key not in this set is stripped before the API call to prevent
// 422 "Unknown field name" errors.
const PROJECTS_TABLE_FIELDS = new Set([
  "Project ID",
  "Project Name",
  "Supervisor Name",
  "Category",
  "Type",
  "Quote Mode",
  "Grand Total Amount",
  "JSON Backup",
  "Customer",
  "Warranty Start Date",
  "Warranty End Date",
  "Warranty Status",
  "PDF File",
]);

function sanitizeToSchema(fields, allowlist) {
  const cleaned = {};
  Object.keys(fields).forEach((key) => {
    const v = fields[key];
    if (!allowlist.has(key)) return;
    if (v !== undefined && v !== null && v !== "") {
      cleaned[key] = v;
    }
  });
  return cleaned;
}

function toISODateString(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return "";
  return toDateString(d);
}

function buildPdfAttachment(pdfUrl) {
  if (!pdfUrl || typeof pdfUrl !== "string") return null;
  if (pdfUrl.startsWith("data:")) {
    const match = pdfUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return [{ content: match[2], filename: "project-invoice.pdf" }];
    return null;
  }
  return [{ url: pdfUrl }];
}

export function buildProjectFields(projectData, user, pdfUrl = null) {
  const cust = projectData.customer || {};
  const clientName = cust.name || cust.fullName || projectData.clientName || "";
  const projectName = projectData.projectName || projectData.name || clientName || "";

  const supervisorName = user?.name || user?.displayName || projectData?.supervisorName || "Unknown";
  const supervisorId = projectData?.supervisorId || user?.cardId || "";

  const supervisorDisplay = supervisorId
    ? `${supervisorName} (${supervisorId})`
    : supervisorName;

  const projectId = generateCleanProjectId();

  const warranty = projectData.warranty || {};
  const warrantyStart = toISODateString(warranty.startDate || warranty.start || "");
  const warrantyEnd = toISODateString(warranty.endDate || warranty.end || "");
  const warrantyStatus = warranty.status || "Active";

  const pdfAttachment = buildPdfAttachment(pdfUrl);

  return {
    fields: sanitizeToSchema(
      {
        "Project ID": projectId,
        "Project Name": projectName,
        "Supervisor Name": supervisorDisplay,
        "Warranty Start Date": warrantyStart,
        "Warranty End Date": warrantyEnd,
        "Warranty Status": warrantyStatus,
        "PDF File": pdfAttachment,
      },
      PROJECTS_TABLE_FIELDS
    ),
    projectId,
  };
}

// ─── 2. MEASUREMENTS TABLE ──────────────────────────────────────

/**
 * Aggregates all wallpaper and texture items into a single summary string.
 * e.g. "Wallpaper: 20x20ft (400 sqft) | Texture: 10x12ft (120 sqft)"
 */
function formatWallpaperTextureSummary(serializedData) {
  const parts = [];

  const wallpapers = serializedData.specialFeatures?.wallpapers || serializedData.wallpaperItems || [];
  if (Array.isArray(wallpapers) && wallpapers.length > 0) {
    let totalArea = 0;
    const dims = [];
    for (const w of wallpapers) {
      const width = Number(w.wallW || w.width || (w.wallDimensionsFt && w.wallDimensionsFt.width) || 0);
      const height = Number(w.wallH || w.height || (w.wallDimensionsFt && w.wallDimensionsFt.height) || 0);
      let area = Number(w.area || w.totalSqft || (w.wallDimensionsFt && w.wallDimensionsFt.totalSqft) || 0);
      if ((!area || area === 0) && width && height) area = width * height;
      totalArea += area;
      if (width && height) dims.push(`${width}x${height}ft`);
    }
    const dimStr = dims.length > 0 ? dims.join(", ") : "";
    const areaPart = totalArea > 0 ? ` (${totalArea.toFixed(2)} sqft)` : "";
    parts.push(`Wallpaper: ${dimStr}${areaPart}`);
  }

  const textures = serializedData.specialFeatures?.textures || serializedData.textureItems || serializedData.TX2_textureItems || [];
  if (Array.isArray(textures) && textures.length > 0) {
    let totalArea = 0;
    const dims = [];
    for (const t of textures) {
      const width = Number(t.wallW || t.width || (t.wallDimensionsFt && t.wallDimensionsFt.width) || 0);
      const height = Number(t.wallH || t.height || (t.wallDimensionsFt && t.wallDimensionsFt.height) || 0);
      let area = Number(t.area || t.totalSqft || (t.wallDimensionsFt && t.wallDimensionsFt.totalSqft) || 0);
      if ((!area || area === 0) && width && height) area = width * height;
      totalArea += area;
      if (width && height) dims.push(`${width}x${height}ft`);
    }
    const dimStr = dims.length > 0 ? dims.join(", ") : "";
    const areaPart = totalArea > 0 ? ` (${totalArea.toFixed(2)} sqft)` : "";
    parts.push(`Texture: ${dimStr}${areaPart}`);
  }

  return parts.join(" | ");
}

export function buildMeasurementRecords(serializedData, projectRecordId) {
  const records = [];
  const joineryByRoom = buildJoineryByRoom(serializedData);
  const globalJoinery = joineryByRoom.get("__global");
  const globalJoineryStr = globalJoinery ? joineryMapToString(globalJoinery) : "";
  const wallpaperTextureSummary = formatWallpaperTextureSummary(serializedData);

  // Collect interior room entries
  const interiorEntries = [];
  const floors = Array.isArray(serializedData.floors) ? serializedData.floors : [];
  floors.forEach((f) => {
    const rooms = Array.isArray(f.rooms) ? f.rooms : [];
    rooms.forEach((r) => {
      const netArea = calcRoomNetSqft(r);
      if (netArea > 0 || r.roomType || r.type) {
        const floorName = String(f.floorName || f.name || "Ground Floor").trim();
        const roomName = String(r.roomType || r.roomName || r.name || r.type || "Room").trim();
        const joineryEntry = joineryByRoom.get(`${floorName}||${roomName}`);
        interiorEntries.push({
          floorName,
          roomName,
          area: Number(netArea.toFixed(2)),
          finishing: formatFinishingSteps(r.finishingSteps || r.steps),
          joinery: joineryEntry ? joineryMapToString(joineryEntry) : "",
        });
      }
    });
  });

  // Collect exterior side entries
  const exteriorEntries = [];
  const exteriorSides =
    serializedData.exteriorWork?.sides ||
    serializedData.exteriorSides ||
    serializedData.exterior ||
    [];
  if (Array.isArray(exteriorSides)) {
    exteriorSides.forEach((s) => {
      const sideArea = Number(s.netSqft || s.totalSqft || s.area || 0);
      if (sideArea > 0 || s.sideName || s.name) {
        exteriorEntries.push({
          elevationName: String(s.sideName || s.name || "Elevation Side").trim(),
          area: Number(sideArea.toFixed(2)),
          finishing: formatFinishingSteps(s.finishingSteps),
        });
      }
    });
  }

  // Build unified side-by-side records — pair interior and exterior by index
  // on the same row to minimize record count.
  const maxLen = Math.max(interiorEntries.length, exteriorEntries.length);
  for (let i = 0; i < maxLen; i++) {
    const intEntry = interiorEntries[i] || null;
    const extEntry = exteriorEntries[i] || null;

    records.push({
      fields: cleanPayload({
        "Measurement ID": genMeasurementId(),
        "Project": [projectRecordId],
        "Floor Name": intEntry?.floorName || "",
        "Room Name": intEntry?.roomName || "",
        "Interior Area Sqft": intEntry?.area || "",
        "Interior Finishing Steps": intEntry?.finishing || "",
        "Elevation Name": extEntry?.elevationName || "",
        "Exterior Area Sqft": extEntry?.area || "",
        "Exterior Finishing Steps": extEntry?.finishing || "",
        "Joinery Details": intEntry?.joinery || globalJoineryStr || "",
        "Wallpaper & Texture Details": wallpaperTextureSummary || "",
      }),
    });
  }

  return records;
}

// ─── 3. MATERIAL BOQ TABLE ──────────────────────────────────────

const BOQ_TABLE_FIELDS = new Set([
  "BOQ ID",
  "Project",
  "Category",
  "Brand",
  "Product Line",
  "Total Quantity",
  "Unit",
]);

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

  // Brand name lookup maps — resolve internal brand keys to display names
  const BRAND_NAMES = {
    asian: "Asian Paints", berger: "Berger Paints", nerolac: "Kansai Nerolac",
    indigo: "Indigo Paints", jsw: "JSW Paints", shalimar: "Shalimar Paints",
    birla: "Birla Opus", nippon: "Nippon Paint", della: "Della Paints",
    dulux: "Dulux", akzo: "Akzo Nobel", benjamin: "Benjamin Moore",
    sherwin: "Sherwin-Williams", farrow: "Farrow & Ball", jotun: "Jotun",
    other: "Other Brand",
  };
  const BRAND_PRODUCTS_MAP = {
    asian:    { interior:{ economy:"Tractor Emulsion", premium:"Apcolite Premium", luxury:"Royale Luxury Emulsion", ultra_luxury:"Royale Aspira" }, exterior:{ economy:"Ace Exterior Emulsion", premium:"Apex Exterior Emulsion", luxury:"Apex Ultima", ultra_luxury:"Apex Ultima Protek" } },
    berger:   { interior:{ economy:"Bison Emulsion", premium:"Easy Clean", luxury:"Silk Luxury Emulsion", ultra_luxury:"Silk Glamour" }, exterior:{ economy:"Rangoli Total Care", premium:"WeatherCoat All Guard", luxury:"WeatherCoat Long Life", ultra_luxury:"WeatherCoat Antidust" } },
    nerolac:  { interior:{ economy:"Beauty Gold", premium:"Impressions", luxury:"Impressions HD", ultra_luxury:"Impressions Shyne" }, exterior:{ economy:"Nerolac Excel Total", premium:"Excel Mica Marble", luxury:"Excel Duraplus", ultra_luxury:"Nerolac Excel Ultima" } },
    other:    { interior:{}, exterior:{} },
  };

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

  // Resolve the actual selected brand names from project data
  const intBrandKey = floors[0]?.rooms?.[0]?.brand || "asian";
  const intBrandName = BRAND_NAMES[intBrandKey] || intBrandKey;
  const intPkg = floors[0]?.rooms?.[0]?.package || "premium";
  const intProduct = BRAND_PRODUCTS_MAP[intBrandKey]?.interior?.[intPkg] || intPkg;

  const extBrandKey = serializedData.exteriorWork?.brand || "asian";
  const extBrandName = BRAND_NAMES[extBrandKey] || extBrandKey;
  const extPkg = serializedData.exteriorWork?.package || "premium";
  const extProduct = BRAND_PRODUCTS_MAP[extBrandKey]?.exterior?.[extPkg] || extPkg;

  const addBoq = (category, brand, productLine, qty, unit) => {
    records.push({
      fields: sanitizeToSchema(
        {
          "BOQ ID": genBoqId(),
          "Project": [projectRecordId],
          "Category": category,
          "Brand": brand,
          "Product Line": productLine,
          "Total Quantity": Number(qty),
          "Unit": unit,
        },
        BOQ_TABLE_FIELDS
      ),
    });
  };

  // Interior Paint
  if (interiorArea > 0) {
    const coats = 2;
    const liters = Math.ceil((interiorArea * coats) / COVERAGE.paint);
    addBoq("Interior Paint", intBrandName, `${intProduct} (${liters} L)`, liters, "Liters");
  }

  // Exterior Paint
  if (exteriorArea > 0) {
    const coats = 2;
    const liters = Math.ceil((exteriorArea * coats) / COVERAGE.paint);
    addBoq("Exterior Paint", extBrandName, `${extProduct} (${liters} L)`, liters, "Liters");
  }

  // Putty (interior + exterior)
  const puttyArea = interiorArea + exteriorArea;
  if (puttyArea > 0) {
    const kg = Math.ceil(puttyArea / COVERAGE.putty);
    addBoq("Putty", intBrandName, `Wall Care Putty (${kg} Kg)`, kg, "Kg");
  }

  // Primer (interior + exterior)
  if (puttyArea > 0) {
    const liters = Math.ceil(puttyArea / COVERAGE.primer);
    addBoq("Primer", intBrandName, `Primer (${liters} L)`, liters, "Liters");
  }

  // Wallpaper
  if (wallpaperArea > 0) {
    const rollArea = 0.53 * 10;
    const rolls = Math.ceil(wallpaperArea / rollArea);
    const wpBrand = (serializedData.specialFeatures?.wallpapers || serializedData.wallpaperItems || [])[0]?.brand || "Standard";
    addBoq("Wallpaper", wpBrand, `Wallpaper Roll (${rolls} rolls)`, rolls, "Rolls");
  }

  // Texture
  if (textureArea > 0) {
    const kg = Math.ceil(textureArea / COVERAGE.putty);
    const texBrand = (serializedData.specialFeatures?.textures || serializedData.textureItems || serializedData.TX2_textureItems || [])[0]?.brand || "Standard";
    addBoq("Texture", texBrand, `Texture Compound (${kg} Kg)`, kg, "Kg");
  }

  // Joinery & Wood Finishes — enamel + putty for all wood/metal items
  const woodItems = serializedData.woodAndMetalItems || serializedData.doorWindowItems || [];
  if (Array.isArray(woodItems) && woodItems.length > 0) {
    let joineryArea = 0;
    let totalCoats = 0;
    let primaryBrand = "";
    let primaryProduct = "";
    for (const item of woodItems) {
      const sqft = Number(item.dimensions?.totalSqft || item.totalSqft || item.area || 0);
      const qty = Number(item.dimensions?.qty || item.qty || 1) || 1;
      const coats = Number(item.coats || 1) || 1;
      joineryArea += sqft * qty;
      totalCoats += coats;
      if (!primaryBrand) primaryBrand = item.brand || "";
      if (!primaryProduct) primaryProduct = item.productName || item.product || "";
    }
    if (joineryArea > 0) {
      const enamelCoverage = 160; // sqft/L per coat
      const avgCoats = totalCoats > 0 ? Math.ceil(totalCoats / woodItems.length) : 2;
      const enamelLiters = Math.ceil((joineryArea * avgCoats) / enamelCoverage);
      const puttyKg = Math.ceil(joineryArea / COVERAGE.putty);
      const brand = primaryBrand || intBrandName;
      const product = primaryProduct || "Enamel Wood Finish";
      addBoq("Joinery & Wood Finishes", brand, `${product} + Putty (${enamelLiters} L + ${puttyKg} Kg)`, enamelLiters + puttyKg, "L + Kg");
    }
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
 * Full save: Projects + Measurements + Material BOQ.
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
    // Sanitized through the Projects table allowlist to prevent 422 errors.
    const fullProjectFields = sanitizeToSchema(
      {
        ...projectFields,
        "Category": serializedData.projectInfo?.category || projectData.projectCategory || projectData.category || "Residential House",
        "Type": serializedData.projectInfo?.type || projectData.projectType || projectData.type || "Fresh Painting",
        "Quote Mode": serializedData.projectInfo?.quoteMode || projectData.quoteMode || "Labour Only",
        "Grand Total Amount": formatIndianCurrency(Number(serializedData.summaryMetrics?.grandTotal || serializedData.grandTotal || 0)),
        "JSON Backup": JSON.stringify(serializedData),
        "Customer": customerRecordId ? [customerRecordId] : undefined,
      },
      PROJECTS_TABLE_FIELDS
    );

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

    // 3. Material BOQ — isolated failure, does not halt remaining syncs
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

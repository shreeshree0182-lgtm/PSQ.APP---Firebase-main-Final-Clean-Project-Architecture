import { saveToAirtable, fetchAllProjects, fetchProjectById, deleteProjectById, generateCleanProjectId } from "./airtablePersistence";
import { serializeMasterJSON } from "../utils/paintShipSerializer";

const LOCAL_KEY = "paintpro_v9";

const PRJ_REGEX = /^PRJ-\d{5}$/;

const ensureValidId = (id) => {
  if (id && PRJ_REGEX.test(id)) return id;
  return generateCleanProjectId();
};

function readLocalAll() {
  try {
    const s = localStorage.getItem(LOCAL_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {
    console.error("[airtablePersistence] Error reading localStorage:", e);
  }
  return [];
}

function writeLocalAll(arr) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.error("[airtablePersistence] Error writing localStorage:", e);
    return false;
  }
}

function upsertLocal(project) {
  const all = readLocalAll();
  const idx = all.findIndex(p => String(p.id) === String(project.id));
  if (idx >= 0) all[idx] = project; else all.unshift(project);
  writeLocalAll(all);
}

function removeLocal(projectId) {
  writeLocalAll(readLocalAll().filter(p => String(p.id) !== String(projectId)));
}

/**
 * Normalizes both internal-format and schema-serialized field names.
 * Restores walls, segments, length, height, textures, wallpaper, and exterior configurations safely.
 */
export function rehydrateProject(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const p = { ...raw };

  p.doorWindowItems = raw.doorWindowItems || raw.woodAndMetalItems || [];
  p.exteriorSides = raw.exteriorSides || raw.exteriorWork?.sides || raw.exterior || [];
  p.textureItems = raw.textureItems || raw.textureWork || raw.specialFeatures?.textures || raw.TX2_textureItems || [];
  p.wallpaperItems = raw.wallpaperItems || raw.wallpapers || raw.specialFeatures?.wallpapers || [];

  p.clientName = raw.clientName || (raw.customer && raw.customer.name) || "";

  if (!p.customer) p.customer = {};
  if (!p.customer.name) p.customer.name = p.clientName || "";

  p.projectCategory = raw.projectCategory || (raw.projectInfo && raw.projectInfo.projectCategory) || "residential";
  p.projectType = raw.projectType || (raw.projectInfo && raw.projectInfo.projectType) || "fresh";
  p.quoteMode = raw.quoteMode || (raw.projectInfo && raw.projectInfo.quoteMode) || "with_material";
  p.scope = raw.scope || (raw.projectInfo && raw.projectInfo.scope) || "interior";

  // FIX: Restore Deep Floors -> Rooms -> Walls -> Segments structure with key mapping support (length/w, height/h)
  const rawFloors = Array.isArray(raw.floors) ? raw.floors : (raw.interiorWork?.floors || []);
  p.floors = rawFloors.map(floor => ({
    ...floor,
    rooms: Array.isArray(floor.rooms) ? floor.rooms.map(room => ({
      ...room,
      walls: Array.isArray(room.walls) ? room.walls.map(wall => {
        const length = wall.length ?? wall.w ?? 0;
        const height = wall.height ?? wall.h ?? 10;
        return {
          ...wall,
          length: length,
          height: height,
          w: length,
          h: height,
          segments: Array.isArray(wall.segments) ? wall.segments.map(seg => {
            const segLength = seg.length ?? seg.w ?? 0;
            const segHeight = seg.height ?? seg.h ?? 10;
            return {
              ...seg,
              length: segLength,
              height: segHeight,
              w: segLength,
              h: segHeight
            };
          }) : []
        };
      }) : []
    })) : []
  }));

  // FIX: Restore Exterior sections structure from serialized sides if available
  const rawExterior = Array.isArray(raw.exterior) ? raw.exterior : [];
  const serializedSides = raw.exteriorWork?.sides || raw.exteriorSides || [];
  
  if (serializedSides.length > 0 && (rawExterior.length === 0 || !rawExterior[0]?.sections)) {
    p.exterior = serializedSides.map(s => ({
      id: s.id || s.exteriorId || s.sideId || `ext_${Date.now()}_${Math.random()}`,
      name: s.sideName?.replace(" Elevation", "") || s.name || "Elevation",
      sections: s.sections || (s.netSqft ? [{ id: `sec_${Date.now()}`, length: s.netSqft / 10, height: 10 }] : []),
      deductions: s.deductions || [],
      additions: s.additions || [],
      condition: s.condition || "Good",
      exteriorOverride: s.exteriorOverride || (s.selectedProduct || s.brand || s.packageType ? {
        useGlobal: false,
        config: {
          package: s.packageType || s.selectedProduct || "",
          brand: s.brand || "",
          finishing: {
            paint: {
              on: true,
              type: s.selectedProduct || ""
            }
          }
        }
      } : { useGlobal: true, config: null })
    }));
  } else {
    p.exterior = rawExterior;
  }
  
  p.exteriorConfig = raw.exteriorConfig || raw.exteriorWork?.config || {};

  p.warranty = raw.warranty || { startDate: "", endDate: "", status: "" };

  const sm = raw.summaryMetrics || {};
  if (!p.grandTotal) p.grandTotal = raw.grandTotal || sm.grandTotal || raw.totalAmount || 0;
  if (!p.totalSqft) p.totalSqft = raw.totalSqft || sm.totalInteriorSqft || 0;

  return p;
}

export async function saveProject(project, user = null, pdfUrl = null) {
  if (!project) return { ok: false, synced: false, error: "Missing project data" };
  
  project.id = ensureValidId(project.id);

  const serialized = serializeMasterJSON(project);
  upsertLocal(project);

  try {
    const result = await saveToAirtable(serialized, project, user, pdfUrl);
    
    if (!result.ok) throw new Error(result.error);

    return { ok: true, synced: true, project, airtableId: result.projectRecordId, projectId: result.projectId };
  } catch (err) {
    console.error("[Airtable Save Error]", err);
    return { ok: false, synced: true, project, fallbackLocal: true };
  }
}

export const updateProject = saveProject;
export const saveProjectData = saveProject;

export async function loadProject(id) {
  try {
    const raw = await fetchProjectById(id);
    if (!raw) return {};
    return rehydrateProject(raw);
  } catch (err) {
    console.warn("[Airtable Load Error] Falling back to local storage:", err);
    const local = readLocalAll().find(p => String(p.id) === String(id));
    if (local) return rehydrateProject(local);
    return {};
  }
}

export const getProjectData = loadProject;

export async function loadAllProjects() {
  try {
    const projects = await fetchAllProjects();
    const rehydrated = projects.map(p => rehydrateProject(p));
    
    writeLocalAll(rehydrated);
    return rehydrated;
  } catch (err) {
    console.warn("[Airtable Load All Error] Returning local projects:", err);
    return readLocalAll().map(p => rehydrateProject(p));
  }
}

export async function deleteProject(id) {
  removeLocal(id);
  try {
    await deleteProjectById(id);
    return { ok: true, synced: true };
  } catch (err) {
    console.error("[Airtable Delete Error]", err);
    return { ok: false, synced: false, error: err.message };
  }
}
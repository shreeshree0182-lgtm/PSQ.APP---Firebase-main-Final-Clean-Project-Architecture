import { z } from "zod";

export const MasterJSONSchema = z.object({
  projectInfo: z.object({
    projectId: z.string().uuid(), // Enforce UUID format in schema
    projectName: z.string(),
    projectCategory: z.string(),
    projectType: z.string(),
    quoteMode: z.enum(["with_material", "labor_only"]),
    totalBudget: z.number().optional(),
    createdAt: z.string(),
    notes: z.string(),
    scope: z.string().optional(),
    measureType: z.string().optional(),
  }),

  customer: z.object({
    name: z.string(),
    mobile: z.string(),
    email: z.string(),
    pincode: z.string(),
    address: z.string(),
    location: z.string()
  }),

  assignedSupervisor: z.object({
    id: z.string(),
    name: z.string()
  }),

  summaryMetrics: z.object({
    totalInteriorSqft: z.number(),
    totalExteriorSqft: z.number(),
    totalDoorsWindowsQty: z.number(),
    grandTotal: z.number().optional(),
    estimatedTotalDays: z.number().nullable(),
    estimatedWorkersPerDay: z.number().nullable()
  }),

  materialBillOfQuantities: z.array(z.object({
    materialId: z.string(),
    category: z.enum(["Interior", "Exterior", "Joinery", "Texture", "Wallpaper"]),
    brand: z.string(),
    productName: z.string(),
    totalQuantity: z.number(),
    unit: z.enum(["L", "Kg", "rolls"]),
    packSize: z.number().nullable()
  })),

  exteriorWork: z.object({
    totalAreaSqft: z.number(),
    package: z.enum(["economy", "premium", "luxury"]),
    brand: z.string(),
    sides: z.array(z.object({
         sideName: z.enum(["Front", "Rear", "Left", "Right", "Front Elevation", "Rear Elevation", "Left Elevation", "Right Elevation"]),
         netSqft: z.number(),
         condition: z.string(),
         hasIssues: z.boolean(),
         isExterior: z.boolean().optional(),
         selectedProduct: z.string().optional(),
         brand: z.string().optional(),
         packageType: z.string().optional(),
         sections: z.array(z.any()).optional(),
         deductions: z.array(z.any()).optional(),
         additions: z.array(z.any()).optional(),
         finishingSteps: z.array(z.object({
           stepOrder: z.number(),
           service: z.string(),
           product: z.string(),
           coats: z.number(),
           enabled: z.boolean()
         })).optional()
       })),
    treatments: z.array(z.object({
      type: z.string(),
      name: z.string(),
      coats: z.number(),
      enabled: z.boolean()
    }))
  }),

  floors: z.array(z.object({
    floorId: z.string(),
    floorName: z.string(),
    rooms: z.array(z.object({
      roomId: z.string(),
      roomType: z.string(),
      package: z.string(),
      brand: z.string(),
      roomHeightFt: z.number(),
      netWallSqft: z.number(),
      ceilingSqft: z.number(),
      totalSqft: z.number(),
      walls: z.array(z.any()).optional(),
      extraWalls: z.array(z.any()).optional(),
      openings: z.array(z.any()).optional(),
      ceiling: z.any().optional(),
      finishingSteps: z.array(z.object({
        stepOrder: z.number(),
        service: z.string(),
        product: z.string(),
        coats: z.number(),
        enabled: z.boolean()
      }))
    }))
  })),

  woodAndMetalItems: z.array(z.object({
    itemId: z.string(),
    itemType: z.string(),
    customLabel: z.string(),
    location: z.object({
      floorName: z.string(),
      roomName: z.string()
    }),
    dimensions: z.object({
      widthFt: z.number(),
      heightFt: z.number(),
      qty: z.number(),
      totalSqft: z.number()
    }),
    finishType: z.string(),
    productName: z.string(),
    coats: z.number()
  })),

  specialFeatures: z.object({
    wallpapers: z.array(z.any()),
    textures: z.array(z.any())
  })
});

/**
 * Ensures the provided ID is a valid UUID v4.
 * If not, generates a new valid UUID.
 */
const ensureValidUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (id && uuidRegex.test(id)) return id;
  try {
    return crypto.randomUUID();
  } catch (e) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

export function serializeMasterJSON(projectData) {
  const normalizedData = {
    projectInfo: {
      projectId: ensureValidUUID(projectData.projectInfo ? projectData.projectInfo.projectId : projectData.id),
      projectName: projectData.projectInfo ? projectData.projectInfo.projectName : (projectData.projectName || projectData.name || "PaintPro Project"),
      projectCategory: projectData.projectInfo ? projectData.projectInfo.projectCategory : (projectData.projectCategory || "residential"),
      projectType: projectData.projectInfo ? projectData.projectInfo.projectType : (projectData.projectType || "fresh"),
      quoteMode: (function() {
        var qm = projectData.projectInfo ? projectData.projectInfo.quoteMode : projectData.quoteMode;
        if (qm === "with_material" || qm === "labor_only") return qm;
        return "with_material";
      })(),
      totalBudget: Number((projectData.projectInfo ? projectData.projectInfo.totalBudget : (projectData.totalBudget || 0)) || 0),
      createdAt: (function() {
        const raw = projectData.projectInfo ? projectData.projectInfo.createdAt : projectData.createdAt;
        const d = raw ? new Date(raw) : new Date();
        return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      })(),
       notes: projectData.projectInfo ? projectData.projectInfo.notes : (projectData.notes || ""),
       scope: projectData.projectInfo ? projectData.projectInfo.scope : (projectData.scope || "interior"),
       measureType: projectData.projectInfo ? projectData.projectInfo.measureType : (projectData.measureType || "interior"),
     },

    customer: {
      name: projectData.customer ? projectData.customer.name : (projectData.clientName || ""),
      mobile: projectData.customer ? projectData.customer.mobile : (projectData.clientMobile || ""),
      email: projectData.customer ? projectData.customer.email : (projectData.clientEmail || ""),
      pincode: projectData.customer ? projectData.customer.pincode : (projectData.pincode || ""),
      address: projectData.customer ? projectData.customer.address : (projectData.address || ""),
      location: projectData.customer ? projectData.customer.location : (projectData.location || "")
    },

    assignedSupervisor: {
      id: projectData.assignedSupervisor ? projectData.assignedSupervisor.id : (projectData.supervisorId || ""),
      name: projectData.assignedSupervisor ? projectData.assignedSupervisor.name : (projectData.supervisorName || "")
    },

    summaryMetrics: (function() {
      const totalInteriorSqft = Number(projectData.summaryMetrics ? projectData.summaryMetrics.totalInteriorSqft : (projectData.totalInteriorSqft || 0)) || 0;
      const totalExteriorSqft = Number(projectData.summaryMetrics ? projectData.summaryMetrics.totalExteriorSqft : (projectData.totalExteriorSqft || 0)) || 0;
      const totalDoorsWindowsQty = Number(projectData.summaryMetrics ? projectData.summaryMetrics.totalDoorsWindowsQty : (projectData.totalDoorsWindowsQty || 0)) || 0;
      const grandTotal = Number(projectData.summaryMetrics ? projectData.summaryMetrics.grandTotal : (projectData.grandTotal || 0)) || 0;
      let estimatedTotalDays = projectData.summaryMetrics ? projectData.summaryMetrics.estimatedTotalDays : (projectData.estimatedTotalDays ?? null);
      let estimatedWorkersPerDay = projectData.summaryMetrics ? projectData.summaryMetrics.estimatedWorkersPerDay : (projectData.estimatedWorkersPerDay ?? null);
      // Recompute timeline from total workload area if not already provided.
      const totalWorkloadArea = totalInteriorSqft + totalExteriorSqft;
      const DAILY_WORKER_COVERAGE = 350; // sq.ft/day per painter (realistic range 300–400)
      const crewSize = 2;
      if (totalWorkloadArea > 0) {
        if (estimatedTotalDays == null || estimatedTotalDays === 0) {
          estimatedTotalDays = Math.ceil(totalWorkloadArea / (crewSize * DAILY_WORKER_COVERAGE));
        }
        if (estimatedWorkersPerDay == null || estimatedWorkersPerDay === 0) {
          estimatedWorkersPerDay = crewSize;
        }
      } else {
        if (estimatedTotalDays == null) estimatedTotalDays = null;
        if (estimatedWorkersPerDay == null) estimatedWorkersPerDay = null;
      }
      return {
        totalInteriorSqft: totalInteriorSqft,
        totalExteriorSqft: totalExteriorSqft,
        totalDoorsWindowsQty: totalDoorsWindowsQty,
        grandTotal: grandTotal,
        estimatedTotalDays: estimatedTotalDays,
        estimatedWorkersPerDay: estimatedWorkersPerDay
      };
    })(),

    materialBillOfQuantities: (projectData.materialBillOfQuantities || []).map(function(item) {
      const brand = item.brand;
      const productName = item.productName || item.product || item.material || "";
      return {
        materialId: item.materialId || item.id || ("mat_" + Date.now()),
        category: item.category || "Interior",
        brand: (brand && brand.trim() !== "" && brand !== "-") ? brand : "Generic / Standard",
        productName: (productName && productName.trim() !== "" && productName !== "-") ? productName : "Generic / Standard",
        totalQuantity: Number(Number(item.totalQuantity != null ? item.totalQuantity : (item.qty || 0)).toFixed(2)),
        unit: item.unit || "L",
        packSize: item.packSize || null
      };
    }),

    exteriorWork: {
      totalAreaSqft: Number((projectData.exteriorWork ? projectData.exteriorWork.totalAreaSqft : (projectData.totalExteriorSqft || 0)) || 0),
      package: (function() {
        const p = (projectData.exteriorWork ? projectData.exteriorWork.package : "") || projectData.exteriorConfig?.package || projectData.defaultPkg || "";
        return (p === "economy" || p === "premium" || p === "luxury") ? p : "premium";
      })(),
      brand: projectData.exteriorWork ? (projectData.exteriorWork.brand || projectData.exteriorConfig?.brand || "asian") : (projectData.exteriorConfig?.brand || "asian"),
      sides: ((projectData?.exteriorWork?.sides) || projectData?.exteriorSides || projectData?.exterior || []).map(function(side) {
        return {
          sideName: (function() {
            const allowed = ["Front", "Rear", "Left", "Right", "Front Elevation", "Rear Elevation", "Left Elevation", "Right Elevation"];
            const name = side.sideName || side.name || "";
            return allowed.indexOf(name) >= 0 ? name : (allowed.indexOf(name + " Elevation") >= 0 ? name + " Elevation" : "Front");
          })(),
          netSqft: Number(side.netSqft || side.totalSqft || side.area || 0) || 0,
          condition: side.condition || "Good",
          hasIssues: Boolean(side.hasIssues || (side.conditionIssues && side.conditionIssues.length > 0)),
          isExterior: side.isExterior === false ? false : true,
          selectedProduct: side.selectedProduct || side.exteriorOverride?.package || "",
          brand: side.brand || side.exteriorOverride?.brand || "",
          packageType: side.packageType || side.exteriorOverride?.package || "",
          sections: side.sections || [],
          deductions: side.deductions || [],
          additions: side.additions || [],
          finishingSteps: (side.finishingSteps || []).map(function(step, index) {
            return {
              stepOrder: Number(step.stepOrder || (index + 1)) || (index + 1),
              service: step.service || step.name || "",
              product: step.product || "",
              coats: Number(step.coats || 1) || 1,
              enabled: step.enabled !== false
            };
          })
        };
      }),
      treatments: ((projectData?.exteriorWork?.treatments) || projectData?.exteriorTreatments || []).map(function(treatment) {
        return {
          type: treatment.type || "",
          name: treatment.name || "",
          coats: Number(treatment.coats || 1) || 1,
          enabled: treatment.enabled !== false
        };
      })
    },

    floors: (projectData.floors || []).map(function(floor) {
      return {
        floorId: floor.floorId || floor.id || ("floor_" + Date.now()),
        floorName: floor.floorName || floor.name || "",
        rooms: (floor.rooms || []).map(function(room) {
          return {
            roomId: room.roomId || room.id || ("room_" + Date.now()),
            roomType: room.roomType || room.type || "",
            package: room.package || "",
            brand: room.brand || "",
            roomHeightFt: Number(room.roomHeightFt || room.roomHeight || 10) || 10,
            netWallSqft: Number(room.netWallSqft || room.net || 0) || 0,
            ceilingSqft: Number(room.ceilingSqft || room.ceiling || 0) || 0,
            totalSqft: Number(room.totalSqft || room.sqft || room.areaSqft || 0) || 0,
            walls: room.walls || [],
            extraWalls: room.extraWalls || [],
            openings: room.openings || [],
            ceiling: room.ceiling || null,
            finishingSteps: (room.finishingSteps || room.steps || []).map(function(step, index) {
              return {
                stepOrder: Number(step.stepOrder || (index + 1)) || (index + 1),
                service: step.service || step.name || "",
                product: step.product || "",
                coats: Number(step.coats || 1) || 1,
                enabled: step.enabled !== false
              };
            })
          };
        })
      };
    }),

    woodAndMetalItems: (projectData.woodAndMetalItems || []).map(function(item) {
      return {
        itemId: item.itemId || item.id || ("item_" + Date.now()),
        itemType: item.itemType || item.kind || "",
        customLabel: item.customLabel || "",
        location: (function() {
          const loc = item.location || {};
          const fName = loc.floorName || loc.floor || "";
          const rName = loc.roomName || loc.room || loc.name || "";
          return {
            floorName: typeof fName === 'object' ? (fName?.name || fName?.floorName || String(fName)) : String(fName || "Ground Floor"),
            roomName: typeof rName === 'object' ? (rName?.name || rName?.roomName || String(rName)) : String(rName || "General")
          };
        })(),
        dimensions: {
          widthFt: Number(item.dimensions ? item.dimensions.widthFt : (item.widthFt || 0)) || 0,
          heightFt: Number(item.dimensions ? item.dimensions.heightFt : (item.heightFt || 0)) || 0,
          qty: Number(item.dimensions ? item.dimensions.qty : (item.qty || 0)) || 0,
          totalSqft: Number((Number(item.dimensions ? item.dimensions.widthFt : (item.widthFt || 0)) || 0) * (Number(item.dimensions ? item.dimensions.heightFt : (item.heightFt || 0)) || 0)) || 0
        },
        finishType: item.finishType || item.finish || "",
        productName: item.productName || item.product || "",
        coats: Number(item.coats || 1) || 1
      };
    }),

    specialFeatures: {
      wallpapers: ((projectData?.specialFeatures?.wallpapers) || projectData?.wallpaperItems || []).map(function(wallpaper) {
        return {
          ...wallpaper,
          wallpaperId: wallpaper.wallpaperId || wallpaper.id || ("wp_" + Date.now()),
          wallDimensionsFt: wallpaper.wallDimensionsFt || {
            width: Number(wallpaper.width || 0),
            height: Number(wallpaper.height || 0),
            totalSqft: Number(wallpaper.totalSqft || 0)
          }
        };
      }),
      textures: ((projectData?.specialFeatures?.textures) || projectData?.textureItems || projectData?.TX2_textureItems || []).map(function(texture) {
        return {
          ...texture,
          textureId: texture.textureId || texture.id || ("tex_" + Date.now()),
          wallDimensionsFt: texture.wallDimensionsFt || {
            width: Number(texture.width || 0),
            height: Number(texture.height || 0),
            totalSqft: Number(texture.totalSqft || 0)
          }
        };
      })
    }
  };

  let validationResult = MasterJSONSchema.safeParse(normalizedData);

  if (!validationResult.success) {
    console.error("Master JSON Schema Validation Errors:", JSON.stringify(validationResult.error.errors || validationResult.error, null, 2));
    // Attempt soft-recovery: fill missing required fields with sensible defaults
    var recovered = JSON.parse(JSON.stringify(normalizedData));
    // Ensure all required top-level keys exist
    if (!recovered.projectInfo) recovered.projectInfo = {};
    if (!recovered.customer) recovered.customer = {};
    if (!recovered.summaryMetrics) recovered.summaryMetrics = {};
    if (!recovered.materialBillOfQuantities) recovered.materialBillOfQuantities = [];
    if (!recovered.exteriorWork) recovered.exteriorWork = {};
    if (!recovered.floors) recovered.floors = [];
    if (!recovered.woodAndMetalItems) recovered.woodAndMetalItems = [];
    if (!recovered.specialFeatures) recovered.specialFeatures = {};
    // Fix known required field types/compat
    if (typeof recovered.projectInfo.projectId !== "string") recovered.projectInfo.projectId = ensureValidUUID(null);
    if (typeof recovered.projectInfo.createdAt !== "string") recovered.projectInfo.createdAt = new Date().toISOString();
    if (typeof recovered.projectInfo.projectName !== "string") recovered.projectInfo.projectName = "Paint Project";
    if (typeof recovered.customer.name !== "string") recovered.customer.name = "";
    if (typeof recovered.customer.mobile !== "string") recovered.customer.mobile = "";
    if (typeof recovered.summaryMetrics.totalInteriorSqft !== "number") recovered.summaryMetrics.totalInteriorSqft = 0;
    if (typeof recovered.summaryMetrics.totalExteriorSqft !== "number") recovered.summaryMetrics.totalExteriorSqft = 0;
    if (typeof recovered.summaryMetrics.estimatedTotalDays !== "number" && recovered.summaryMetrics.estimatedTotalDays !== null) recovered.summaryMetrics.estimatedTotalDays = null;
    if (typeof recovered.summaryMetrics.estimatedWorkersPerDay !== "number" && recovered.summaryMetrics.estimatedWorkersPerDay !== null) recovered.summaryMetrics.estimatedWorkersPerDay = null;
    
    // Ensure woodAndMetalItems location strings are valid
    if (Array.isArray(recovered.woodAndMetalItems)) {
      recovered.woodAndMetalItems = recovered.woodAndMetalItems.map(item => {
        if (item.location) {
          if (typeof item.location.floorName !== "string") item.location.floorName = String(item.location.floorName || "Ground Floor");
          if (typeof item.location.roomName !== "string") item.location.roomName = String(item.location.roomName || "General");
        }
        return item;
      });
    }
    
    validationResult = MasterJSONSchema.safeParse(recovered);
    if (!validationResult.success) {
      throw new Error("Invalid PaintPro JSON Schema Generated. Export Aborted.");
    }
  }

  return validationResult.data;
}

export const serializeAndValidatePaintProJSON = serializeMasterJSON;

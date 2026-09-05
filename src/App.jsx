import React, { useState, useEffect, useRef } from "react";
import { auth, firebaseConfigured } from "./firebase";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from "firebase/auth";
import { saveProject, saveProjectData, loadProject, getProjectData, loadAllProjects, deleteProject } from "./services/projectPersistence";
import Header from "./components/Header.jsx";
import MeasurementView from "./components/MeasurementView.jsx";
import InvoiceModal from "./components/InvoiceModal.jsx";
import MasterRatesModal from "./components/MasterRatesModal.jsx";
import { getStoredMasterRates, saveMasterRates, getRateForFinish } from "./data/finishMasterRates.ts";
import { verifySupervisorPin } from "./data/supervisorPin.ts";
import { serializeAndValidatePaintProJSON } from "./utils/paintShipSerializer";

// ── Master-rate sync: when a finish rate changes in Unlocked mode, persist it
//    to the localStorage master so it becomes the new default everywhere.
//    Maps the interior FinishingModule sub-category key to the master category.
const FIN_CATEGORY_MAP = {
  surfacePrep:"interior", putty:"interior", primer:"interior", paint:"interior", topcoat:"interior",
  oilPaint:"woodMetal", polish:"woodMetal", texture:"texture", wallpaper:"wallpaper",
};
function persistFinishRate(subKey, tierId, newRate, paintingType = "fresh") {
  const catKey = FIN_CATEGORY_MAP[subKey];
  if (!catKey || tierId === "custom") return;
  try {
    const ratesState = getStoredMasterRates();
    const modeRates = ratesState[paintingType] || ratesState.fresh;
    const cat = modeRates.find(c => c.key === catKey);
    if (!cat) return;
    for (const sub of cat.subCategories) {
      if (sub.key !== subKey) continue;
      const tier = sub.tiers.find(t => t.id === tierId);
      if (tier) { tier.r = newRate; saveMasterRates(ratesState); }
      return;
    }
  } catch {}
}

// ─── CONSTANTS ────────────────────────────────────────────────────
// Logo rendered as inline SVG — no external file dependency

const C = {
  orange:"#E8A020",  orangeL:"#FFF8E7",
  navy:"#0F1E3C",    navyL:"#1A2F5A",
  green:"#16A34A",   greenL:"#F0FDF4",
  red:"#DC2626",     redL:"#FEF2F2",
  blue:"#1E40AF",    blueL:"#EFF6FF",
  purple:"#7C3AED",  purpleL:"#F5F3FF",
  gold:"#E8A020",    goldL:"#FFF8E7",
  teal:"#0D9488",    tealL:"#F0FDFA",
  gray:"#6B7280",    bg:"#F0F4F8",
  border:"#D1D9E6",  white:"#FFFFFF",
};

const BRAND_PRODUCTS = {
  asian:    { name:"Asian Paints",     interior:{ economy:"Tractor Emulsion", premium:"Apcolite Premium", luxury:"Royale Luxury Emulsion", ultra_luxury:"Royale Aspira" }, exterior:{ economy:"Ace Exterior Emulsion", premium:"Apex Exterior Emulsion", luxury:"Apex Ultima", ultra_luxury:"Apex Ultima Protek" } },
  berger:   { name:"Berger Paints",    interior:{ economy:"Bison Emulsion", premium:"Easy Clean", luxury:"Silk Luxury Emulsion", ultra_luxury:"Silk Glamour" }, exterior:{ economy:"Rangoli Total Care", premium:"WeatherCoat All Guard", luxury:"WeatherCoat Long Life", ultra_luxury:"WeatherCoat Antidust" } },
  nerolac:  { name:"Kansai Nerolac",   interior:{ economy:"Beauty Gold", premium:"Impressions", luxury:"Impressions HD", ultra_luxury:"Impressions Shyne" }, exterior:{ economy:"Nerolac Excel Total", premium:"Excel Mica Marble", luxury:"Excel Duraplus", ultra_luxury:"Nerolac Excel Ultima" } },
  indigo:   { name:"Indigo Paints",    interior:{ economy:"Bronze Series", premium:"Silver Series", luxury:"Gold Series", ultra_luxury:"Platinum Series" }, exterior:{ economy:"Exterior Acrylic Emulsion", premium:"Exterior Premium Emulsion", luxury:"Exterior Lustre", ultra_luxury:"Exterior Superstar" } },
  jsw:      { name:"JSW Paints",       interior:{ economy:"Pixa Elegant Interiors", premium:"Halo Majestic Interiors", luxury:"Aurus Regal Interiors", ultra_luxury:"Aurus Regal Interiors" }, exterior:{ economy:"Pixa Exterior", premium:"Halo Exterior", luxury:"Aurus Exterior", ultra_luxury:"Aurus Exterior Shield" } },
  shalimar: { name:"Shalimar Paints",  interior:{ economy:"Charm Interior", premium:"Signature Interior", luxury:"Signature Emulsion", ultra_luxury:"Signature Emulsion" }, exterior:{ economy:"Superlac Exterior", premium:"Weatherproof Exterior", luxury:"Superlac Hi-Gloss", ultra_luxury:"Superlac Weatherproof Advance" } },
  birla:    { name:"Birla Opus",       interior:{ economy:"Style Super Bright", premium:"Calista Ever Wash", luxury:"One Pure Elegance", ultra_luxury:"One Pure Elegance" }, exterior:{ economy:"Exterior Emulsion", premium:"Exterior Premium", luxury:"Exterior Luxury", ultra_luxury:"Exterior Ultra Luxury" } },
  nippon:   { name:"Nippon Paint",     interior:{ economy:"Matex", premium:"Spotless NXT", luxury:"Momento", ultra_luxury:"Momento Luxury" }, exterior:{ economy:"Weatherbond", premium:"Weatherbond Pro", luxury:"Weatherbond Flex", ultra_luxury:"Weatherbond Superior" } },
  della:    { name:"Della Paints",     interior:{ economy:"Standard Interior", premium:"Designer Textures", luxury:"Super Luxury Interior", ultra_luxury:"Super Luxury Interior" }, exterior:{ economy:"Standard Exterior", premium:"Designer Exterior", luxury:"Luxury Exterior", ultra_luxury:"Luxury Exterior Shield" } },
  dulux:    { name:"Dulux",            interior:{ economy:"Promise Interior", premium:"EasyCare", luxury:"Velux Touch", ultra_luxury:"Ambiance" }, exterior:{ economy:"Weathershield", premium:"Weathershield Powerflexx", luxury:"Weathershield Max", ultra_luxury:"Weathershield Max Protect" } },
  akzo:     { name:"Akzo Nobel",       interior:{ economy:"", premium:"", luxury:"", ultra_luxury:"" }, exterior:{ economy:"", premium:"", luxury:"", ultra_luxury:"" } },
  benjamin: { name:"Benjamin Moore",   interior:{ economy:"", premium:"", luxury:"Regal Select", ultra_luxury:"Aura" }, exterior:{ economy:"", premium:"Aura Exterior", luxury:"Aura Grand Entrance", ultra_luxury:"Aura Grand Entrance" } },
  sherwin:  { name:"Sherwin-Williams", interior:{ economy:"", premium:"SuperPaint Interior", luxury:"Emerald Interior", ultra_luxury:"Emerald Designer Edition" }, exterior:{ economy:"", premium:"SuperPaint Exterior", luxury:"Emerald Exterior", ultra_luxury:"Emerald Rain Refresh" } },
  farrow:   { name:"Farrow & Ball",    interior:{ economy:"", premium:"", luxury:"", ultra_luxury:"Estate Emulsion" }, exterior:{ economy:"", premium:"", luxury:"", ultra_luxury:"Exterior Masonry" } },
  jotun:    { name:"Jotun",            interior:{ economy:"", premium:"Majestic True Beauty", luxury:"Majestic Diamond", ultra_luxury:"Majestic Diamond" }, exterior:{ economy:"Jotashield Primer", premium:"Jotashield Antifade", luxury:"Jotashield Extreme", ultra_luxury:"Jotashield Extreme 25" } },
  other:    { name:"Other Brand",      interior:{ economy:"", premium:"", luxury:"", ultra_luxury:"" }, exterior:{ economy:"", premium:"", luxury:"", ultra_luxury:"" } },
};

// ─── MATERIAL BRAND/PRODUCT LOOKUP DICTIONARY ─────────────────────────────────
// Dynamic brand lookup for all material categories (Putty, Primer, Emulsion, Exterior, Joinery)
// Replaces hardcoded fallbacks like "asian / Apcolite Premium" across non-emulsion items
const MATERIAL_BRAND_PRODUCTS = {
  putty:                     { brand: "Birla / Asian",              product: "Wall Care Acrylic Putty",               unit: "Kg", coverage: 40 },
  primer:                    { brand: "Asian Paints",               product: "Decoprime Wall Primer",                  unit: "L",  coverage: 140 },
  economy_emulsion:        { brand: "Asian Paints",               product: "Tractor Emulsion",                       unit: "L",  coverage: 70 },
  interior_premium_emulsion: { brand: "Asian Paints",               product: "Apcolite Premium",                       unit: "L",  coverage: 80 },
  exterior_putty:          { brand: "Asian Paints",               product: "TruCare Exterior Putty",                unit: "Kg", coverage: 35 },
  exterior_primer:         { brand: "Asian Paints",               product: "Exterior Wall Primer",                  unit: "L",  coverage: 120 },
  premium_exterior_emulsion: { brand: "Asian Paints",               product: "Apex Weatherproof Emulsion",            unit: "L",  coverage: 60 },
  french_polish:          { brand: "Asian Paints",               product: "Touchwood Wood Polish",                 unit: "L",  coverage: 60 },
  water_based_paint:      { brand: "Dulux / Asian",              product: "Aquatech Gloss",                        unit: "L",  coverage: 80 },
  synthetic_enamel:       { brand: "Asian Paints",               product: "Apcolite Gloss Enamel",                 unit: "L",  coverage: 90 },
};

// ─── PACKING SIZES FOR COMMERCIAL PROCUREMENT ─────────────────────────────────
// Standard commercial packing buckets for tins and bags
const PACKING_SIZES = {
  L: [20, 10, 4, 1],
  Kg: [40, 20, 5],
};

// Compute optimized packing buckets: maximize larger containers, remainder in smallest
function computeOptimalPacking(qty, unit) {
  const sizes = unit === "Kg" ? PACKING_SIZES.Kg : PACKING_SIZES.L;
  const result = [];
  let remaining = qty;
  for (const size of sizes) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      result.push({ size, qty: count });
      remaining -= count * size;
    }
  }
  if (remaining > 0) {
    const smallestSize = sizes[sizes.length - 1];
    const existingSmallest = result.find(r => r.size === smallestSize);
    if (existingSmallest) {
      existingSmallest.qty += Math.ceil(remaining / smallestSize);
    } else {
      result.push({ size: smallestSize, qty: Math.ceil(remaining / smallestSize) });
    }
  }
  return result;
}

function formatPackingLabel(packing, unit) {
  // Safe guard: ensure packing is an array before .map()
  const safePacking = Array.isArray(packing) ? packing : [];
  const unitLabel = unit === "Kg" ? "Kg" : "L";
  return safePacking.map(p => `${p.qty} x ${p.size}${unitLabel}`).join(" + ");
}

function computeFinalOrderQty(qty, unit) {
  const packing = computeOptimalPacking(qty, unit);
  if (!Array.isArray(packing) || packing.length === 0) return Math.ceil(qty);
  const total = packing.reduce((sum, p) => sum + (Number(p.qty) * Number(p.size)), 0);
  return total;
}

// Helper: map a material key to MATERIAL_BRAND_PRODUCTS entry + unit + coverage
function getMaterialMeta(key, surface = "interior") {
  const baseMap = {
    putty: "putty",
    primer: "primer",
    paint: surface === "exterior" ? "premium_exterior_emulsion" : "economy_emulsion",
    topcoat: surface === "exterior" ? "premium_exterior_emulsion" : null,
    polish: "french_polish",
    texture: null,
  };
  const mbKey = baseMap[key] || null;
  if (!mbKey) return { brand: "", product: "", unit: "L", coverage: 80 };
  const meta = MATERIAL_BRAND_PRODUCTS[mbKey];
  if (!meta) return { brand: "", product: "", unit: "L", coverage: 80 };
  // Adjust coverage for 2-coat system where needed
  const coverage = meta.coverage * (key === "paint" && surface === "interior" ? 1 : 1);
  return { brand: meta.brand, product: meta.product, unit: meta.unit, coverage };
}

const TIER_BADGE = {
  economy:     { label:"Economy",      bg:"#DCFCE7", color:"#16A34A" },
  premium:     { label:"Premium",      bg:"#DBEAFE", color:"#2563EB" },
  luxury:      { label:"Luxury",       bg:"#EDE9FE", color:"#7C3AED" },
  ultra_luxury:{ label:"Ultra Luxury", bg:"#FEF3C7", color:"#D97706" },
};

const PACKAGES = {
  economy:     { id:"economy",      label:"Economy",      icon:"🌿", color:C.green,  colorL:C.greenL,  putty:8,  primer:6,  paint:18, topcoat:0,  labour:20, labourExcl:12 },
  premium:     { id:"premium",      label:"Premium",      icon:"💎", color:C.blue,   colorL:C.blueL,   putty:12, primer:9,  paint:28, topcoat:10, labour:30, labourExcl:18 },
  luxury:      { id:"luxury",       label:"Luxury",       icon:"👑", color:C.purple, colorL:C.purpleL, putty:18, primer:14, paint:45, topcoat:18, labour:40, labourExcl:25 },
  ultra_luxury:{ id:"ultra_luxury", label:"Ultra Luxury", icon:"✨", color:C.gold,   colorL:C.goldL,   putty:28, primer:20, paint:70, topcoat:30, labour:60, labourExcl:40 },
};

const PUTTY_T   = [{id:"white_cement",label:"White Cement Putty",r:8},{id:"wall_putty",label:"Wall Putty",r:10},{id:"acrylic_putty",label:"Acrylic Putty",r:14},{id:"polymer",label:"Polymer Putty",r:15},{id:"waterproof",label:"Waterproof Putty",r:20}];
const PRIMER_T  = [{id:"interior",label:"Interior Primer",base:"water",r:7},{id:"acrylic_p",label:"Acrylic Primer",base:"water",r:8},{id:"wood",label:"Wood Primer",base:"oil",r:11},{id:"metal",label:"Metal Primer",base:"oil",r:12}];
const PAINT_T   = [{id:"distemper",label:"Distemper",base:"water",r:10},{id:"economy_emulsion",label:"Economy Emulsion",base:"water",r:18},{id:"premium_emulsion",label:"Premium Emulsion",base:"water",r:32},{id:"luxury_emulsion",label:"Luxury Emulsion",base:"water",r:45},{id:"designer_finish",label:"Designer Finish",base:"water",r:60},{id:"anti_fungal",label:"Anti-Fungal Paint",base:"water",r:28},{id:"washable",label:"Washable Paint",base:"water",r:25},{id:"synthetic_enamel",label:"Synthetic Enamel",base:"oil",r:25},{id:"high_gloss",label:"High Gloss Enamel",base:"oil",r:30}];
const TOPCOAT_T = [{id:"clear_varnish",label:"Clear Varnish",r:12},{id:"polyurethane",label:"Polyurethane",r:18}];
const OIL_T     = [{id:"synthetic_enamel",label:"Synthetic Enamel",r:25},{id:"high_gloss",label:"High Gloss",r:30},{id:"oil_paint",label:"Oil Paint",r:28},{id:"duco_finish",label:"Duco Finish",r:55}];
const POLISH_T  = [{id:"melamine",label:"Melamine Polish",r:35},{id:"pu",label:"PU Polish",r:45},{id:"nc",label:"NC Polish",r:28},{id:"french",label:"French Polish",r:50},{id:"wood_stain",label:"Wood Stain",r:20}];
const TEXTURE_T = [{id:"roller",label:"Roller Texture",r:22},{id:"metallic",label:"Metallic Finish",r:50},{id:"venetian",label:"Venetian Finish",r:70},{id:"stucco",label:"Stucco Finish",r:35}];
const WP_ROLL_PRESETS = [
  { id:"std",   label:"Standard 10m × 0.53m", w:0.53, l:10 },
  { id:"wide",  label:"Wide 10m × 1.06m",     w:1.06, l:10 },
  { id:"euro",  label:"Euro 15m × 0.53m",     w:0.53, l:15 },
  { id:"custom",label:"Custom",               w:0,    l:0  },
];
const TEXTURE_APPLY_MODES = ["Full Wall","Feature Wall","Accent Band","Custom Area"];

// Each entry's `custom` field describes the synthetic "Custom …" option that
// mergeCustomFinishTypes() appends to `types` at render time (see below) —
// replaces the old hardcoded {id:"custom"} objects that used to live inside
// PUTTY_T/PRIMER_T/etc. Selecting it still reveals the "Material Name" input
// exactly as before; it's just generated dynamically instead of being baked
// into the source data.
const FIN_META = {
  putty:    { label:"Wall Putty",   icon:"🪣", types:PUTTY_T,    custom:{ label:"Custom Putty",  base:"none"  } },
  primer:   { label:"Primer",       icon:"🧴", types:PRIMER_T,   custom:{ label:"Custom Primer", base:"water" } },
  paint:    { label:"Wall Paint",   icon:"🎨", types:PAINT_T,    custom:{ label:"Custom Paint",  base:"water" } },
  topcoat:  { label:"Topcoat",      icon:"✨", types:TOPCOAT_T, custom:{ label:"Custom",         base:"none"  } },
  oilPaint: { label:"Enamel / Trim", icon:"🛢", types:OIL_T,   custom:{ label:"Custom",         base:"oil"   } },
  polish:   { label:"Polish",       icon:"💅", types:POLISH_T,  custom:{ label:"Custom",         base:"none"  } },
  texture:  { label:"Texture",      icon:"🏔", types:TEXTURE_T, custom:{ label:"Custom",         base:"none"  } },
  wallpaper:{ label:"Wallpaper",    icon:"🖼", types:[]        },
};

const EXT_PUTTY_T      = [{id:"white_cement_ext",label:"White Cement",r:8},{id:"exterior_putty",label:"Exterior Putty",r:12}];
const EXT_PRIMER_T     = [{id:"exterior_primer",label:"Exterior Primer",base:"water",r:9},{id:"alkali_primer",label:"Alkali Resistant Primer",base:"water",r:11}];
const EXT_PAINT_T      = [{id:"economy_ext",label:"Economy Exterior Emulsion",base:"water",r:20},{id:"premium_ext",label:"Premium Exterior Emulsion",base:"water",r:32},{id:"luxury_ext",label:"Luxury Exterior Emulsion",base:"water",r:50},{id:"ultra_luxury_ext",label:"Ultra Luxury Exterior Emulsion",base:"water",r:75}];
const EXT_PROTECTION_T = [{id:"waterproof",label:"Waterproof Coating",r:18},{id:"elastomeric",label:"Elastomeric Coating",r:25},{id:"anti_fungal_ext",label:"Anti-Fungal Coating",r:20}];
const EXT_TEXTURE_T    = [{id:"exterior_texture",label:"Exterior Texture",r:35},{id:"stone_finish",label:"Stone Finish",r:55},{id:"sand_texture",label:"Sand Texture",r:28}];

const EXT_FIN_META = {
  putty:      { label:"Surface Prep / Putty", icon:"🪣", types:EXT_PUTTY_T,      custom:{ label:"Custom Putty",          base:"none"  } },
  primer:     { label:"Primer",               icon:"🧴", types:EXT_PRIMER_T,     custom:{ label:"Custom Primer",         base:"water" } },
  paint:      { label:"Exterior Paint",       icon:"🎨", types:EXT_PAINT_T,      custom:{ label:"Custom Exterior Paint", base:"water" } },
  protection: { label:"Protection Coating",   icon:"🛡", types:EXT_PROTECTION_T, custom:{ label:"Custom Coating",        base:"none"  } },
  texture:    { label:"Decorative Finish",    icon:"🏔", types:EXT_TEXTURE_T,    custom:{ label:"Custom Texture",        base:"none"  } },
};

// ── Dynamic Custom Finishes: merge user-added tiers (Master Rates Manager →
//    "+ Add Custom Finish") into the static type lists above, live, on every
//    render. This is what makes a custom finish (e.g. "Italian Marble
//    Finish") show up in the room finish selectors immediately after it's
//    saved, without a code change or reload. Read-only merge — the static
//    FIN_META/EXT_FIN_META objects above stay as the built-in fallback.
function mergeCustomFinishTypes(baseMeta, resolveCategoryKey, paintingType = "fresh") {
  try {
    const ratesState = getStoredMasterRates();
    const rates = ratesState[paintingType] || ratesState.fresh;
    const merged = {};
    for (const [subKey, cfg] of Object.entries(baseMeta)) {
      const catKey = resolveCategoryKey(subKey);
      const cat = rates.find(c => c.key === catKey);
      const sub = cat && cat.subCategories.find(s => s.key === subKey);
      const customTiers = sub ? sub.tiers.filter(t => t.isCustom) : [];
      const newTypes = [...cfg.types, ...customTiers];
      if (cfg.custom) newTypes.push({ id: "custom", label: cfg.custom.label, base: cfg.custom.base, r: 0 });
      merged[subKey] = { ...cfg, types: newTypes };
    }
    return merged;
  } catch {
    return baseMeta;
  }
}
function getFinMeta(paintingType = "fresh") { return mergeCustomFinishTypes(FIN_META, k => FIN_CATEGORY_MAP[k] || "interior", paintingType); }
function getExtFinMeta(paintingType = "fresh") { return mergeCustomFinishTypes(EXT_FIN_META, () => "exterior", paintingType); }

const CONSUMPTION_DEFAULTS = {
  paint:    { coverage:80,  wastage:10, packSize:4,  ratePerL:350 },
  oilPaint: { coverage:60,  wastage:10, packSize:1,  ratePerL:300 },
  topcoat:  { coverage:90,  wastage:8,  packSize:1,  ratePerL:400 },
  polish:   { coverage:70,  wastage:10, packSize:1,  ratePerL:450 },
  texture:  { coverage:30,  wastage:15, packSize:5,  ratePerL:250 },
  putty:    { coverage:40,  wastage:10, packSize:20, ratePerL:25  },
  primer:   { coverage:100, wastage:8,  packSize:4,  ratePerL:150 },
};
const CONSUMPTION_ENABLED = ["paint","oilPaint","topcoat","polish","texture","putty","primer"];

const ROOM_TYPES  = ["Living Room","Hall","Bedroom","Master Bedroom","Kitchen","Dining Room","Bathroom","Balcony","Pooja Room","Store Room","Utility","Passage","Staircase","Custom"];
const ROOM_TYPES_BY_CATEGORY = {
  residential: ["Living Room","Hall","Bedroom","Master Bedroom","Kitchen","Dining Room","Bathroom","Balcony","Pooja Room","Store Room","Utility","Passage","Staircase","Custom"],
  apartment:   ["Living Room","Hall","Bedroom","Master Bedroom","Kitchen","Dining Room","Bathroom","Balcony","Pooja Room","Store Room","Utility","Passage","Staircase","Custom"],
  villa:       ["Living Room","Hall","Bedroom","Master Bedroom","Kitchen","Dining Room","Bathroom","Balcony","Pooja Room","Store Room","Utility","Passage","Staircase","Custom"],
  rental:      ["Living Room","Hall","Bedroom","Master Bedroom","Kitchen","Dining Room","Bathroom","Balcony","Pooja Room","Store Room","Utility","Passage","Staircase","Custom"],
  commercial:  ["Reception","Cabin","Conference Room","Work Area","Pantry","Washroom","Store","Custom"],
  office:      ["Reception","Cabin","Conference Room","Work Area","Pantry","Washroom","Store","Custom"],
  retail:      ["Shop Floor","Display Area","Cash Counter","Store Room","Trial Room","Washroom","Custom"],
  industrial:  ["Office","Production Area","Storage","Staff Room","Washroom","Utility","Custom"],
  other:       ["Custom","Living Room","Hall","Bedroom","Master Bedroom","Kitchen","Dining Room","Bathroom","Balcony","Pooja Room","Store Room","Utility","Passage","Staircase"],
};
function roomTypesForCategory(category) {
  return ROOM_TYPES_BY_CATEGORY[category] || ROOM_TYPES;
}
const FLOOR_NAMES = ["Ground Floor","First Floor","Second Floor","Third Floor","Fourth Floor"];
const WALL_CONDS  = ["Good","Minor Cracks","Major Cracks","Dampness","Peeling Paint","Stains","Mould","Weathering"];
const COND_ICONS  = { Good:"✅","Minor Cracks":"🔧","Major Cracks":"⚠️",Dampness:"💧","Peeling Paint":"🪣",Stains:"🟤",Mould:"🟢",Weathering:"🌧️" };
const EXT_COND_LEVELS = ["Good","Fair","Poor"];
const EXT_COND_LEVEL_ICONS = { Good:"✅", Fair:"⚠️", Poor:"🚨" };
const EXT_ISSUE_TAGS = ["Cracks","Dampness","Peeling Paint","Water Seepage","Mould","Stains","Surface Damage","Other"];
const ELEVATIONS  = ["Front","Rear","Left","Right"];
const EXT_DEDUCTION_TYPES = ["Window","Door","Sliding Door","Open Space","Custom Opening"];
const EXT_ADDITION_TYPES  = ["Projection","Column","Balcony Face","Feature Band","Custom Area"];
const SCOPE_OPTIONS = [{ id:"interior", label:"Interior", icon:"🏠" },{ id:"exterior", label:"Exterior", icon:"🏗" },{ id:"both", label:"Both", icon:"🔄" }];
const PROJECT_CATEGORIES = [
  { id:"residential",  label:"Residential House",   icon:"🏠" },
  { id:"apartment",    label:"Apartment / Flat",    icon:"🏢" },
  { id:"villa",        label:"Villa",               icon:"🏡" },
  { id:"rental",       label:"Rental House",        icon:"🔑" },
  { id:"commercial",   label:"Commercial Building", icon:"🏗"  },
  { id:"office",       label:"Office Space",        icon:"💼" },
  { id:"retail",       label:"Shops / Retail",      icon:"🛍" },
  { id:"industrial",   label:"Industrial / Factory",icon:"🏭" },
  { id:"other",        label:"Other",               icon:"📌" },
];
const USERS = [
  { cardId:"PS-ADM-01", pin:"981245", mobile:"9876543210", name:"Admin User",      role:"Admin",              isAdmin:true  },
  { cardId:"PS-SUP-101", pin:"450912", mobile:"9876543211", name:"Rahul Sharma",  role:"Senior Supervisor", isAdmin:false },
  { cardId:"PS-SUP-102", pin:"671239", mobile:"9876543212", name:"Anjali Mehta",   role:"Site Supervisor",   isAdmin:false },
];

// ─── OTP AUTH ADAPTER — Firebase Phone Authentication ──────────────────
// Real SMS OTP via Firebase Auth's Web SDK. Firebase sends the actual SMS
// and verifies the code server-side — nothing here is faked or hardcoded.
// A verified phone number must still match a `mobile` on the local USERS
// list to get app-level access (name/role/cardId), same as before.
let confirmationResultRef = null;
let recaptchaVerifierRef = null;

function getRecaptchaVerifier() {
  if (!auth) return null;
  if (!recaptchaVerifierRef) {
    recaptchaVerifierRef = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
  }
  return recaptchaVerifierRef;
}

function mapFirebaseAuthError(e) {
  switch (e?.code) {
    case "auth/invalid-phone-number": return "That doesn't look like a valid mobile number.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/quota-exceeded": return "SMS quota exceeded for this project. Please try again later.";
    case "auth/invalid-verification-code": return "Incorrect OTP. Please check the code and try again.";
    case "auth/code-expired": return "This OTP has expired. Please request a new one.";
    case "auth/network-request-failed": return "No internet connection. Please check your network and try again.";
    case "auth/captcha-check-failed": return "Verification check failed. Please reload and try again.";
    default: return e?.message || "Something went wrong. Please try again.";
  }
}

const OtpAuthAdapter = {
  sendOtp: async (mobile) => {
    if (!firebaseConfigured) {
      return { ok:false, error:"Firebase is not configured for this deployment. Set the VITE_FIREBASE_* environment variables (see .env.example). Use Employee ID + PIN login below in the meantime." };
    }
    const digits = (mobile||"").trim();
    if (!/^\d{10}$/.test(digits)) return { ok:false, error:"Enter a valid 10-digit mobile number." };
    const u = USERS.find(u=>u.mobile===digits);
    if (!u) return { ok:false, error:"This mobile number is not registered as a Supervisor." };
    try {
      const verifier = getRecaptchaVerifier();
      confirmationResultRef = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      return { ok:true };
    } catch (e) {
      // Reset the reCAPTCHA widget so the next attempt gets a fresh token.
      try { recaptchaVerifierRef?.clear(); } catch {}
      recaptchaVerifierRef = null;
      return { ok:false, error: mapFirebaseAuthError(e) };
    }
  },
  verifyOtp: async (mobile, otp) => {
    if (!confirmationResultRef) return { ok:false, error:"Session expired. Please request a new OTP." };
    try {
      await confirmationResultRef.confirm(otp);
      // Firebase now holds a real authenticated session (persisted via
      // browserLocalPersistence in firebase.js). Map the verified mobile
      // number to the existing app-level Supervisor record.
      const digits = (mobile||"").trim();
      const u = USERS.find(u=>u.mobile===digits);
      if (!u) {
        await signOut(auth);
        return { ok:false, error:"This mobile number verified successfully but is not registered as a Supervisor." };
      }
      return { ok:true, user:u };
    } catch (e) {
      return { ok:false, error: mapFirebaseAuthError(e) };
    }
  },
};

const DW_ITEM_TYPES = ["Wooden Door","Flush Door","Main Door","Window","Window Grill","Safety Grill","Gate","Rolling Shutter","Metal Frame","Custom Item"];
const DW_FINISH_TYPES = [
  {id:"oil_paint",label:"Oil Paint",r:25},{id:"water_paint",label:"Water Based Paint",r:18},
  {id:"pu_paint",label:"PU Paint",r:55},{id:"duco_paint",label:"Duco Paint",r:60},
  {id:"melamine",label:"Melamine Polish",r:35},{id:"pu_polish",label:"PU Polish",r:45},
  {id:"nc_polish",label:"NC Polish",r:28},{id:"wood_stain",label:"Wood Stain",r:20},
  {id:"texture",label:"Texture Finish",r:38},{id:"wallpaper",label:"Wallpaper Finish",r:50},
  {id:"custom",label:"Custom Finish",r:0},
];

// ─── HELPERS ──────────────────────────────────────────────────────
const uid = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    // Fallback for environments where crypto.randomUUID is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

const MASTER_HARDWARE_CHECKLIST = [
  { category:"Interior",     material:"Sanding Paper (120/180 Grit)", brand:"-",                product:"Sheets",                unit:"sheets", defaultQty:0 },
  { category:"Interior",     material:"Masking Tape (1.5\")",         brand:"3M",               product:"Scotch Blue",           unit:"rolls",  defaultQty:0 },
  { category:"Interior",     material:"Paint Rollers (9\")",          brand:"-",                product:"Units",                 unit:"pcs",    defaultQty:0 },
  { category:"Interior",     material:"Paint Brushes (2\" & 3\")",    brand:"-",                product:"1 Pair",                unit:"pair",   defaultQty:0 },
  { category:"Interior",     material:"Floor Protection Sheet",       brand:"-",                product:"Sq Ft",                 unit:"sqft",   defaultQty:0 },
  { category:"Interior",     material:"Wall Putty (2mm coat)",        brand:"Birla / Asian",    product:"Wall Care Acrylic Putty",unit:"kg",    defaultQty:0 },
  { category:"Interior",     material:"Interior Wall Primer",         brand:"Asian Paints",     product:"Decoprime Wall Primer", unit:"L",      defaultQty:0 },
  { category:"Interior",     material:"Wall Filler / Crack Filler",   brand:"Birla / Asian",    product:"Acrylic Wall Filler",   unit:"kg",     defaultQty:0 },
  { category:"Interior",     material:"Corner Bead (Internal)",       brand:"Standard",         product:"Galvanized",            unit:"pcs",    defaultQty:0 },
  { category:"Interior",     material:"Screws & Wall Plugs (1\")",    brand:"Standard",         product:"Nylon Plugs + Screws",  unit:"pcs",    defaultQty:0 },
  { category:"Interior",     material:"Adhesive for Skirting",        brand:"Fevicol / Pidilite",product:"SH+ / Steel",           unit:"kg",     defaultQty:0 },
  { category:"Interior",     material:"Cotton Waste",                 brand:"-",                product:"Cleaning Grade",        unit:"kg",     defaultQty:0 },
  { category:"Interior",     material:"Putty Blade / Trowel",         brand:"Standard",         product:"Steel Blade",           unit:"pcs",    defaultQty:0 },
  { category:"Exterior",     material:"Exterior Wall Putty",          brand:"Asian Paints",     product:"TruCare Exterior Putty",unit:"kg",     defaultQty:0 },
  { category:"Exterior",     material:"Exterior Wall Primer",         brand:"Asian Paints",     product:"Exterior Wall Primer",  unit:"L",      defaultQty:0 },
  { category:"Exterior",     material:"Exterior Wall Filler",         brand:"Birla / Asian",    product:"Acrylic Wall Filler",   unit:"kg",     defaultQty:0 },
  { category:"Exterior",     material:"Corner Bead (External)",       brand:"Standard",         product:"Galvanized",            unit:"pcs",    defaultQty:0 },
  { category:"Exterior",     material:"Exterior Masking Tape",        brand:"3M",               product:"Scotch Blue",           unit:"rolls",  defaultQty:0 },
  { category:"Exterior",     material:"Sand Paper (Exterior Prep)",   brand:"Standard",         product:"80/120 Grit",           unit:"sheets", defaultQty:0 },
  { category:"Exterior",     material:"Screws & Wall Plugs (1.5\")", brand:"Standard",         product:"Nylon Plugs + Screws",  unit:"pcs",    defaultQty:0 },
  { category:"Exterior",     material:"Waterproofing Adhesive",       brand:"Dr. Fixit / Pidilite",product:"Liquid Waterproofing",unit:"kg",     defaultQty:0 },
  { category:"Exterior",     material:"Exterior Brush Set",           brand:"Standard",         product:"Flat / Angular Set",    unit:"set",    defaultQty:0 },
  { category:"Exterior",     material:"Dust Sheet / Polythene",       brand:"-",                product:"Heavy Duty",            unit:"pcs",    defaultQty:0 },
  { category:"Wood & Metal", material:"Wood Filler / Stopper",        brand:"Dr. Fixit / Fevicol",product:"Wood Epoxy / Shine",   unit:"kg",     defaultQty:0 },
  { category:"Wood & Metal", material:"Wood Primer / Sealer",         brand:"Asian Paints",     product:"Wood Primer",           unit:"L",      defaultQty:0 },
  { category:"Wood & Metal", material:"Enamel Polish (Wood/Metal)",   brand:"Asian Paints",     product:"Apcolite Gloss Enamel", unit:"L",      defaultQty:0 },
  { category:"Wood & Metal", material:"MTO Thinner",                  brand:"Asian Paints",     product:"MTO Thinner",           unit:"L",      defaultQty:0 },
  { category:"Wood & Metal", material:"Steel Wool (000 Grade)",       brand:"Standard",         product:"Fine Grade",            unit:"pcs",    defaultQty:0 },
  { category:"Wood & Metal", material:"Sand Paper (for Wood/Metal)", brand:"Standard",         product:"180/320 Grit",          unit:"sheets", defaultQty:0 },
  { category:"Wood & Metal", material:"Wood Screws (1\" to 3\")",    brand:"Standard",         product:"Chromated",             unit:"pcs",    defaultQty:0 },
  { category:"Wood & Metal", material:"Hinges (3\" / 4\" / 5\")",    brand:"Standard",         product:"Butt Hinges SS",        unit:"pcs",    defaultQty:0 },
  { category:"Wood & Metal", material:"Door Handles / Locks",         brand:"Standard",         product:"Mortise / Handles",     unit:"pcs",    defaultQty:0 },
  { category:"Wood & Metal", material:"Wire Nails",                   brand:"Standard",         product:"Galvanized",            unit:"kg",     defaultQty:0 },
  { category:"Wood & Metal", material:"Nylon Brushes (for polish)",  brand:"Standard",         product:"Cleaning Grade",        unit:"pcs",    defaultQty:0 },
  { category:"Wood & Metal", material:"Metal Primer",                 brand:"Asian Paints",     product:"Metal Primer Enamel",   unit:"L",      defaultQty:0 },
  { category:"Wood & Metal", material:"PU Polish",                    brand:"Asian Paints",     product:"PU Polish",             unit:"L",      defaultQty:0 },
  { category:"Texture",      material:"Texture Base Coat / Primer",   brand:"Asian Paints",     product:"Texture Primer",        unit:"L",      defaultQty:0 },
  { category:"Texture",      material:"Texture Material / Putty",     brand:"Asian Paints",     product:"Designer Texture",      unit:"kg",     defaultQty:0 },
  { category:"Texture",      material:"Texture Roller (Textured)",    brand:"Standard",         product:"Pattern Roller",        unit:"pcs",    defaultQty:0 },
  { category:"Texture",      material:"Putty Knife / Trowel (Texture)",brand:"Standard",        product:"Steel Blade",           unit:"pcs",    defaultQty:0 },
  { category:"Texture",      material:"Sand Paper (Fine for Texture)",brand:"Standard",        product:"220/320 Grit",          unit:"sheets", defaultQty:0 },
  { category:"Texture",      material:"Texture Sealer / Topcoat",     brand:"Asian Paints",     product:"Texture Sealer",        unit:"L",      defaultQty:0 },
  { category:"Wallpaper",    material:"Wallpaper Adhesive",           brand:"Fevicol / Pidilite",product:"Wallpaper Adhesive",   unit:"kg",     defaultQty:0 },
  { category:"Wallpaper",    material:"Seam Roller",                  brand:"Standard",         product:"Silicone Roller",       unit:"pcs",    defaultQty:0 },
  { category:"Wallpaper",    material:"Wallpaper Brush",              brand:"Standard",         product:"Soft Bristle",          unit:"pcs",    defaultQty:0 },
  { category:"Wallpaper",    material:"Utility Knife",                brand:"Stanley / Standard",product:"Cutter Knife",          unit:"pcs",    defaultQty:0 },
  { category:"Wallpaper",    material:"Smoothing Tool",               brand:"Standard",         product:"Plastic Smoother",      unit:"pcs",    defaultQty:0 },
  { category:"Wallpaper",    material:"Pasting Table",                brand:"Standard",         product:"6ft x 3ft",             unit:"pcs",    defaultQty:0 },
];
const fmt  = n  => parseFloat((n || 0).toFixed(2));
const inr  = n  => { const s=Math.round(n||0).toString(); if(s.length<=3) return "₹"+s; const last3=s.slice(-3); const rest=s.slice(0,-3); return "₹"+rest.replace(/\B(?=(\d{2})+(?!\d))/g,",")+","+last3; };
// Persistence (Firestore + Storage, localStorage fallback) now lives in
// src/services/projectPersistence.js — see saveProject/loadAllProjects/
// deleteProject imported above the component. This keeps the same project
// object shape and the same call sites below (doSave/dupProject/delProject),
// just backed by a real database instead of a single localStorage blob.

function calcConsumption(area, coats, coverage, wastage, packSize, ratePerL) {
  if (!area || !coverage) return { litres:0, litresWithWaste:0, packs:0, cost:0 };
  const litres = (Math.max(0, area) * coats) / coverage;
  const litresWithWaste = litres * (1 + (wastage||0)/100);
  const packs = Math.ceil(litresWithWaste / (packSize||1));
  const cost = litresWithWaste * (ratePerL||0);
  return { litres:fmt(litres), litresWithWaste:fmt(litresWithWaste), packs, cost:fmt(cost) };
}
function defConsumption(key) {
  const d = CONSUMPTION_DEFAULTS[key] || { coverage:80, wastage:10, packSize:4, ratePerL:0 };
  return { enabled:false, coverage:d.coverage, wastage:d.wastage, packSize:d.packSize, ratePerL:d.ratePerL, overrideLitres:false, manualLitres:0 };
}
function defConsumptionObj(key) { return CONSUMPTION_ENABLED.includes(key) ? defConsumption(key) : null; }

function defFinishing(pkg = "premium", paintingType = "fresh") {
  const p = PACKAGES[pkg] || PACKAGES.premium;
  const puttyRate = getRateForFinish("interior", "white_cement", "putty", paintingType) || p.putty;
  const primerRate = getRateForFinish("interior", "interior", "primer", paintingType) || p.primer;
  const paintRate = getRateForFinish("interior", "economy_emulsion", "paint", paintingType) || p.paint;
  const topcoatRate = getRateForFinish("interior", "clear_varnish", "topcoat", paintingType) || p.topcoat;
  return {
    putty:    { on:true,  type:"white_cement",    customName:"", rate:puttyRate,   coats:2, area:0, useRoom:true,  consumption:defConsumptionObj("putty")    },
    primer:   { on:true,  type:"interior",         customName:"", rate:primerRate,  coats:1, area:0, useRoom:true,  consumption:defConsumptionObj("primer")   },
    paint:    { on:true,  type:"economy_emulsion", customName:"", rate:paintRate,   coats:2, area:0, useRoom:true,  consumption:defConsumptionObj("paint")    },
    topcoat:  { on:false, type:"clear_varnish",    customName:"", rate:topcoatRate, coats:1, area:0, useRoom:true,  consumption:defConsumptionObj("topcoat")  },
    oilPaint: { on:false, type:"synthetic_enamel", customName:"", rate:0,         coats:2, area:0, useRoom:false, consumption:defConsumptionObj("oilPaint") },
    polish:   { on:false, type:"melamine",          customName:"", rate:0,         coats:2, area:0, useRoom:false, consumption:defConsumptionObj("polish")   },
    texture:  { on:false, type:"roller",            customName:"", rate:0,         coats:1, area:0, useRoom:false, consumption:defConsumptionObj("texture")  },
    wallpaper:{ on:false, type:"",                  customName:"", rate:0,         coats:1, area:0, useRoom:false, installRate:0, rollSize:"", consumption:null },
  };
}
function defExteriorFinishing(pkg = "premium", paintingType = "fresh") {
  const p = PACKAGES[pkg] || PACKAGES.premium;
  const puttyRate = getRateForFinish("exterior", "exterior_putty", "putty", paintingType) || 12;
  const primerRate = getRateForFinish("exterior", "exterior_primer", "primer", paintingType) || p.primer;
  const paintRate = getRateForFinish("exterior", "premium_ext", "paint", paintingType) || p.paint;
  const protRate = getRateForFinish("exterior", "waterproof", "protection", paintingType) || 18;
  const texRate = getRateForFinish("exterior", "exterior_texture", "texture", paintingType) || 35;
  return {
    putty:      { on:true,  type:"exterior_putty",   customName:"", rate:puttyRate,  coats:2, area:0, useRoom:true },
    primer:     { on:true,  type:"exterior_primer",  customName:"", rate:primerRate, coats:1, area:0, useRoom:true },
    paint:      { on:true,  type:"premium_ext",      customName:"", rate:paintRate,  coats:2, area:0, useRoom:true },
    protection: { on:false, type:"waterproof",       customName:"", rate:protRate,   coats:1, area:0, useRoom:true },
    texture:    { on:false, type:"exterior_texture", customName:"", rate:texRate,    coats:1, area:0, useRoom:false },
  };
}
function newOpening(kind, mode="deduct") { return { id:uid(), kind, label:kind, length:0, height:0, count:1, mode, notes:"" }; }
function newExtraWall(mode) { return { id:uid(), label:mode==="add"?"Extra Wall":"Deduction", length:0, height:0, mode }; }

// ── Segmented wall system ──
const SEG_KINDS = [
  { id:"flat",       label:"Normal Wall",        icon:"▬", color:C.navy,   desc:"Standard flat wall surface" },
  { id:"recess",     label:"Inside Cut / Recess",icon:"⬇", color:C.blue,   desc:"Inset / recessed area — sides painted too" },
  { id:"projection", label:"Outside Projection", icon:"⬆", color:C.orange, desc:"Projection / bump-out — sides painted too" },
  { id:"column",     label:"Column",             icon:"⬛", color:C.teal,   desc:"Column face — 3 exposed sides" },
  { id:"beam",       label:"Beam",               icon:"━",  color:C.purple, desc:"Beam soffit — bottom face + 2 sides" },
  { id:"niche",      label:"Wall Niche",         icon:"🔲", color:C.green,  desc:"Wall niche — interior faces" },
];
const SEG_OPEN_KINDS = ["Door","Window","Sliding Door","Arch","Open Space","Custom"];
const SEG_ADD_KINDS = ["Column","Projection","Custom"];

function newSegment(kind="flat") {
  return { id:uid(), kind, label:"", length:0, height:null, depth:0, openings:[] };
}
function newSegOpening(kind="Door", mode="deduct") {
  return { id:uid(), kind, label:kind, mode, length:0, height:0, count:1, notes:"" };
}
function newWall(label) {
  return { id:uid(), label:label||"Wall", height:null, segments:[newSegment("flat")] };
}

// Calculate gross paintable area for a single segment given its effective height
function calcSegArea(seg, wall = {}, roomHeight = 10) {
  const sh = seg.height || seg.h || wall.height || roomHeight || 10;
  const sw = seg.length || seg.w || wall.length || 0;
  // Column: always 3 faces (front + 2 sides), depth not required
  if (seg.kind === "column") {
    const gross = sw * sh * 3;
    const opAdj = (seg.openings||[]).reduce((s,o)=>{
      const a = (o.length||o.w||0)*(o.height||o.h||0)*(o.count||1);
      return s + ((o.mode||"deduct")==="add" ? a : -a);
    }, 0);
    return Math.max(0, gross + opAdj);
  }
  let gross = sw * sh;
  if (seg.depth > 0) {
    if (seg.kind === "recess" || seg.kind === "projection") {
      gross += 2 * (seg.depth||0) * sh; // left + right sides
    } else if (seg.kind === "beam") {
      gross += 2 * (seg.depth||0) * sh; // soffit in w×h, add 2 face drops
    } else if (seg.kind === "niche") {
      gross += 2 * (seg.depth||0) * sh + sw * (seg.depth||0); // 2 sides + back
    }
  }
  const opAdj = (seg.openings||[]).reduce((s,o)=>{
    const a = (o.length||o.w||0)*(o.height||o.h||0)*(o.count||1);
    return s + ((o.mode||"deduct")==="add" ? a : -a);
  }, 0);
  return Math.max(0, gross + opAdj);
}

function calcWallArea(wall, roomHeight = 10) {
  const segments = (wall.segments || []).length > 0 ? wall.segments : [{ id: uid(), kind: "flat", label: "", length: wall.length || wall.w || 0, height: wall.height || wall.h || roomHeight, depth: 0, openings: [] }];
  return segments.reduce((s,seg)=>s+calcSegArea(seg, wall, roomHeight), 0);
}

// Migrate old {w,h}×4 room to new segmented format — backward safe
function migrateRoom(r) {
  if (!r.walls || r.walls.length === 0) return r;
  // Already migrated if first wall has segments
  if (r.walls[0] && r.walls[0].segments) return r;
  // Infer common room height from the old walls (use max h, fallback 10)
  const maxH = r.walls.reduce((m,w)=>Math.max(m,w.h||0),0)||10;
  return {
    ...r,
    roomHeight: maxH,
    useRoomHeight: true,
    finishing: r.finishing || defFinishing(r.package || "premium"),
    walls: (r.walls || []).map((w, i) => ({
      id: uid(),
      label: `Wall ${i+1}`,
      height: null,                          // use roomHeight
      segments: [{
        id: uid(),
        kind: "flat",
        label: "",
        length: w.length || w.w || 0,
        height: w.height || w.h || null,     // use wall height
        depth: 0,
        openings: []
      }]
    }))
  };
}
function newRoom(type, pkg, brand) {
  const currentPkg = PACKAGES?.[pkg] || {};
  const labourRate = currentPkg?.labour ?? 0;
  const labourRateExcl = currentPkg?.labourExcl ?? 0;
  return { id:uid(), type, customType:"", package:pkg, brand, customBrand:"",
    roomHeight:10, useRoomHeight:true,
    walls:[newWall("Wall 1"), newWall("Wall 2"), newWall("Wall 3"), newWall("Wall 4")],
    extraWalls:[], ceiling:{l:0,w:0,on:true},
    openings:[], condition:"Good", conditionNotes:"", conditionPhotos:[],
    finishing:defFinishing(pkg), labourRate, labourRateExcl,
    labourMethod:"sqft", dailyRate:0, workers:1, days:1 };
}
function newFloor(name, pkg, brand) { return { id:uid(), name, rooms:[newRoom("Living Room", pkg, brand)] }; }
function defSectionCharges() { return { additionalCharges:0, discount:0, gst:0 }; }
function defExteriorConfig() {
  const extPkg = PACKAGES?.["premium"] || {};
  return { package:"premium", brand:"asian", customBrand:"", labourRate:extPkg?.labour ?? 0, labourRateExcl:extPkg?.labourExcl ?? 0, labourMethod:"sqft", dailyRate:0, workers:1, days:1, finishing:defExteriorFinishing("premium") };
}
// PAINT-EXT-002B — per-elevation override default. useGlobal:true + config:null means
// "no override, inherit everything from project.exteriorConfig". Actively read/written by
// the Exterior Paint editor, calcExteriorConfiguredTotals, Quote Summary, and generatePDF().
function defExteriorOverride() { return { useGlobal:true, config:null }; }
function defExterior() { return ELEVATIONS.map(name => ({ id:uid(), name, sections:[{id:uid(),label:"",length:0,height:0}], deductions:[], additions:[], condition:"Good", conditionIssues:[], conditionNotes:"", conditionPhotos:[], exteriorOverride:defExteriorOverride() })); }
function newCondPhoto(image, label) { return { id:uid(), image, label:label||"", timestamp:new Date().toISOString() }; }
function newExtSection() { return { id:uid(), label:"", length:0, height:0 }; }
function newExtDeduction(kind) { return { id:uid(), kind, label:kind, length:0, height:0, qty:1 }; }
function newExtAddition(kind)  { return { id:uid(), kind, label:kind, length:0, height:0, qty:1 }; }
function migrateElevation(el) {
  if (el.sections) return el; // already new format
  return { ...el, sections:[{ id:uid(), label:"", length:el.length||el.w||0, height:el.height||el.h||0 }] };
}
function newDWItem() { return { id:uid(), kind:"Wooden Door", label:"Wooden Door", length:0, height:0, qty:1, finish:"oil_paint", customFinish:"", rate:25, coats:2, labourRate:15 }; }
function createNewProject(user) {
  const newId = `PROJ-${Date.now()}`;
  return { id: newId, supervisorId:user.cardId, supervisorName:user.name,
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    customer:{ name:"", mobile:"", contact:"", email:"", pincode:"", address:"", location:"" },
    clientName:"", clientMobile:"", contact:"",
    projectCategory:"residential", projectType:"fresh", scope:"interior", quoteMode:"with_material", includeBrand:true, measureType:"interior",
    defaultPkg:"premium", defaultBrand:"asian", notes:"",
    isAutoToolsMode: true,
    hardwareItemOverrides: {},
    customHardwareItems: [],
    dwItems:[], wpItems:[], textureItems:[], polishItems:defPolish(),
    exterior:defExterior(), exteriorConfig:defExteriorConfig(),
    interiorCharges:defSectionCharges(), exteriorCharges:defSectionCharges(),
    warranty:{ startDate:"", endDate:"", status:"" },
    floors:[newFloor("Ground Floor","premium","asian")] };
}

// ─── REHYDRATION: convert a raw project (from Airtable JSON Backup + flat fields,
// or from local storage internal format) into a fully-formed internal project state.
// Starts from createNewProject(user) as the base so every internal-format field exists
// with sane defaults, then deep-merges the raw data with field-name mapping for
// the serialized shape (floorId→id, roomId→id, netWallSqft→synthetic wall,
// finishingSteps→finishing object, exteriorWork.sides→exterior, etc.).
function rehydrateProject(raw, user) {
  if (!raw) return createNewProject(user);
  const base = createNewProject(user);
  const p = { ...base, ...raw };

  // ── Customer ──
  p.customer = { ...base.customer, ...(raw.customer || {}) };
  p.clientName = raw.clientName || raw.customer?.name || "";

  // ── Project info: map serialized projectInfo → top-level internal fields ──
  const pInfo = raw.projectInfo || {};
  p.projectCategory = pInfo.projectCategory || raw.projectCategory || p.projectCategory;
  p.projectType     = pInfo.projectType     || raw.projectType     || p.projectType;
  p.quoteMode       = pInfo.quoteMode       || raw.quoteMode       || p.quoteMode;
  p.notes           = pInfo.notes           || raw.notes           || p.notes;
  if (pInfo.createdAt) p.createdAt = pInfo.createdAt;
  if (raw.updatedAt)   p.updatedAt = raw.updatedAt;

  // ── Scope / measureType (internal-only; reconstruct from saved data if present) ──
  p.scope       = raw.scope || pInfo.scope || (Array.isArray(raw.exteriorWork?.sides) && raw.exteriorWork.sides.length > 0 ? "both" : "interior");
  p.measureType = raw.measureType || "interior";

  // ── Summary metrics ──
  const sm = raw.summaryMetrics || {};
  p.grandTotal  = raw.grandTotal  || sm.grandTotal  || raw.totalAmount || 0;
  p.totalSqft   = raw.totalSqft   || sm.totalInteriorSqft || raw.totalInteriorSqft || 0;

  // ── Material BOQ ──
  p.materialBillOfQuantities = raw.materialBillOfQuantities || raw.boq || [];

  // ── Floors → rooms: deep-map serialized format to internal format ──
  const baseRoom = base.floors[0]?.rooms[0] || {};
  p.floors = (raw.floors || []).map(fl => {
    const floor = { ...(base.floors[0] || {}), ...fl };
    floor.id = fl.id || fl.floorId || uid();
    floor.name = fl.name || fl.floorName || "Ground Floor";
    floor.rooms = (fl.rooms || []).map(r => {
      const room = { ...baseRoom, ...r };
      // Map serialized field names → internal names
      room.id         = r.id || r.roomId || uid();
      room.type       = r.type || r.roomType || "Living Room";
      room.customType = r.customType || "";
      room.brand      = r.brand || "asian";
      room.customBrand= r.customBrand || "";
      room.package    = r.package || "premium";
      room.roomHeight = r.roomHeight || r.roomHeightFt || 10;
      room.useRoomHeight = r.useRoomHeight !== undefined ? r.useRoomHeight : true;

      // Measurements: prioritize detailed walls array if present
      const rw = r.walls;
      if (rw && Array.isArray(rw) && rw.length > 0) {
        room.walls = rw;
      } else {
        const net = Number(r.netWallSqft || r.net || 0);
        const rh = room.roomHeight || 10;
        if (net > 0) {
          const ww = net / rh;
          room.walls = [{ 
            id: uid(), 
            label: "Wall 1", 
            length: ww, 
            height: rh, 
            segments: [{ id: uid(), kind: "flat", label: "", length: ww, height: rh, depth: 0, openings: [] }] 
          }];
        } else {
          room.walls = [newWall("Wall 1"), newWall("Wall 2"), newWall("Wall 3"), newWall("Wall 4")];
        }
      }
      // Normalize: ensure wall length/height are preserved and default segment exists
      room.walls = (room.walls || []).map(wall => {
        const length = wall.length || wall.w || 0;
        const height = wall.height || wall.h || room.roomHeight || 10;
        const segments = (wall.segments || []).length > 0 
          ? wall.segments.map(s => ({ 
              ...s, 
              length: s.length || s.w || length, 
              height: s.height || s.h || height 
            }))
          : [{ id: uid(), kind: "flat", label: "", length, height, depth: 0, openings: [] }];
        return { ...wall, length, height, segments };
      });
      room.extraWalls = r.extraWalls || [];
      room.openings   = r.openings   || [];
      
      // Ceiling: prioritize detailed ceiling object
      if (r.ceiling && typeof r.ceiling === 'object') {
        room.ceiling = r.ceiling;
      } else {
        room.ceiling = { l: 0, w: 0, on: false };
        if (r.ceilingSqft) { 
          const cs = Number(r.ceilingSqft) || 0; 
          if (cs > 0) { room.ceiling.on = true; room.ceiling.l = cs; room.ceiling.w = 1; } 
        }
      }

      // Finishing: serialized uses finishingSteps[]; internal uses finishing object
      room.finishing = r.finishing || defFinishing(r.package || "premium", p.projectType || "fresh");
      // Toggle finishing layers from finishingSteps if present
      const steps = (r.finishingSteps || r.steps || []).filter(s => s && s.enabled !== false);
      if (steps.length > 0) {
        const svc = steps.map(s => (s.service || "").toLowerCase());
        if (room.finishing.putty)   room.finishing.putty.on   = svc.includes("putty");
        if (room.finishing.primer)  room.finishing.primer.on  = svc.includes("primer");
        if (room.finishing.paint)   room.finishing.paint.on   = svc.includes("paint");
        if (room.finishing.texture) room.finishing.texture.on = svc.includes("texture");
      }

      // Labour
      room.labourRate      = r.labourRate      || baseRoom.labourRate      || 0;
      room.labourRateExcl  = r.labourRateExcl  || baseRoom.labourRateExcl  || 0;
      room.labourMethod    = r.labourMethod    || baseRoom.labourMethod    || "sqft";
      room.dailyRate       = r.dailyRate       || baseRoom.dailyRate       || 0;
      room.workers         = r.workers         || baseRoom.workers         || 1;
      room.days            = r.days            || baseRoom.days            || 1;
      room.condition       = r.condition       || "Good";
      room.conditionNotes  = r.conditionNotes  || "";
      room.conditionPhotos = r.conditionPhotos || [];
      room.totalSqft       = r.totalSqft       || 0;

      return migrateRoom(room);
    });
    return floor;
  });

  // ── Exterior: map serialized exteriorWork.sides → internal exterior elevations ──
  // PAINT-EXT-FIX: Prioritize exteriorWork.sides as it's the Master JSON source of truth.
  // Only fallback to raw.exterior if it exists AND contains detailed sections.
  const hasDetailedExterior = raw.exterior && Array.isArray(raw.exterior) && raw.exterior.length > 0 && raw.exterior[0].sections;
  const sides = (raw.exteriorWork && raw.exteriorWork.sides) || raw.exteriorSides || [];

  if (sides.length > 0) {
    p.exterior = sides.map((s, i) => {
      const elName = (s.sideName || ELEVATIONS[i] || `Side ${i + 1}`).replace(" Elevation", "");
      // Try to find matching default elevation for brand/package
      const def = (base.exterior || defExterior()).find(e => e.name === elName) || (base.exterior || defExterior())[i] || (base.exterior || defExterior())[0];
      
      // Prioritize detailed sections if present
      const sections = (s.sections && Array.isArray(s.sections) && s.sections.length > 0)
        ? s.sections
        : (function() {
            const net = Number(s.netSqft || s.area || 0);
            const rh = 10;
            const ww = net > 0 ? net / rh : 0;
            return ww > 0 ? [{ id: uid(), label: elName, length: ww, height: rh }] : (def.sections || []);
          })();

      return {
        ...def,
        id: s.id || s.exteriorId || uid(),
        name: elName,
        sections: sections,
        deductions: s.deductions || def.deductions || [],
        additions: s.additions || def.additions || [],
        condition: s.condition || "Good",
        conditionIssues: s.conditionIssues || [],
        conditionNotes: s.conditionNotes || "",
        conditionPhotos: s.conditionPhotos || [],
        exteriorOverride: s.exteriorOverride || (s.selectedProduct || s.brand || s.packageType ? {
          useGlobal: false,
          config: {
            package: s.packageType || s.selectedProduct || "",
            brand: s.brand || "",
            finishing: s.finishingSteps && s.finishingSteps.length > 0
              ? (() => {
                  const fin = defExteriorFinishing(s.packageType || "premium", p.projectType || "fresh");
                  const svc = s.finishingSteps.map(st => (st.service || "").toLowerCase());
                  if (fin.putty) fin.putty.on = svc.includes("putty");
                  if (fin.primer) fin.primer.on = svc.includes("primer");
                  if (fin.paint) fin.paint.on = svc.includes("paint");
                  if (fin.protection) fin.protection.on = svc.includes("protection");
                  if (fin.texture) fin.texture.on = svc.includes("texture");
                  return fin;
                })()
              : undefined
          }
        } : defExteriorOverride()),
      };
    });
  } else if (hasDetailedExterior) {
    p.exterior = raw.exterior.map(el => migrateElevation(el));
  }

  // Rehydrate exteriorConfig: deep-merge raw.exteriorConfig (internal format) with
  // defaults, or reconstruct from serialized exteriorWork fields (package, brand).
  // Ensures all finishing layers exist and retains saved brand/package/finishing.
  (function() {
    const def = defExteriorConfig();
    const rawCfg = raw.exteriorConfig || {};
    const extWork = raw.exteriorWork || {};
    const pkg = rawCfg.package || extWork.package || raw.defaultPkg || "premium";
    const brand = rawCfg.brand || extWork.brand || raw.defaultBrand || "asian";
    const defFin = defExteriorFinishing(pkg, p.projectType || "fresh");
    const rawFin = rawCfg.finishing || {};
    const mergedFinishing = {};
    Object.keys(defFin).forEach(key => {
      mergedFinishing[key] = { ...defFin[key], ...(rawFin[key] || {}) };
    });
    p.exteriorConfig = {
      ...def,
      ...rawCfg,
      package: pkg,
      brand: brand,
      customBrand: rawCfg.customBrand || "",
      labourRate: rawCfg.labourRate ?? (PACKAGES[pkg]?.labour ?? def.labourRate),
      labourRateExcl: rawCfg.labourRateExcl ?? (PACKAGES[pkg]?.labourExcl ?? def.labourRateExcl),
      labourMethod: rawCfg.labourMethod || "sqft",
      dailyRate: rawCfg.dailyRate || 0,
      workers: rawCfg.workers || 1,
      days: rawCfg.days || 1,
      finishing: mergedFinishing,
    };
  })();

  // ── Door / Window / Joinery ──
  const rawDW = raw.doorWindowItems || (raw.woodAndMetalItems || []).filter(it => !it.itemType?.includes("Polish"));
  p.doorWindowItems = rawDW.map((it, idx) => ({
    ...it,
    id: it.id || it.itemId || uid(),
    floorId: it.floorId || "",
    roomId: it.roomId || "",
    itemType: it.itemType || "Wooden Door",
    label: it.customLabel || it.label || "",
    length: it.dimensions ? it.dimensions.widthFt : (it.widthFt || 0),
    height: it.dimensions ? it.dimensions.heightFt : (it.heightFt || 0),
    qty: it.dimensions ? it.dimensions.qty : (it.qty || 1),
    finishType: it.finishType || it.finish || "oil_paint",
    productName: it.productName || it.product || "",
    coats: it.coats || 2,
    rate: it.rate || 25,
    labourRate: it.labourRate || 15,
    totalSqft: it.dimensions ? it.dimensions.totalSqft : (it.totalSqft || 0),
  }));
  p.polishItems = raw.polishItems || (raw.woodAndMetalItems || []).filter(it => it.itemType?.includes("Polish") || it.itemType?.includes("Enamel")) || [];
  p.dwItems = raw.dwItems || [];
  p.wpItems = raw.wpItems || [];
  p.textureItems = raw.textureItems || raw.textureWork || [];
  p.exteriorSides = raw.exteriorSides || (raw.exteriorWork && raw.exteriorWork.sides) || [];

  // ── Special features: wallpaper & texture ──
  const sf = raw.specialFeatures || {};
  p.wallpaperItems = raw.wallpaperItems || (sf.wallpapers || []).map(w => ({
    ...w,
    id: w.wallpaperId || w.id || uid(),
    location: w.location || "",
    wallDimensionsFt: w.wallDimensionsFt || { width: 0, height: 0, totalSqft: 0 },
    brand: w.brand || "Generic / Standard",
    collection: w.collection || "",
    rollsRequired: w.rollsRequired || 0,
    finishType: w.finishType || "",
    productName: w.productName || "",
  })) || [];
  p.TX2_textureItems = raw.TX2_textureItems || (sf.textures || []).map(t => ({
    ...t,
    id: t.textureId || t.id || uid(),
    location: t.location || "",
    wallDimensionsFt: t.wallDimensionsFt || { width: 0, height: 0, totalSqft: 0 },
    textureType: t.textureType || t.type || "",
    brand: t.brand || "",
    coats: t.coats || 1,
  })) || [];

  // ── Section charges ──
  p.interiorCharges = raw.interiorCharges || defSectionCharges();
  p.exteriorCharges = raw.exteriorCharges || defSectionCharges();

  // ── Warranty ──
  p.warranty = raw.warranty || { startDate:"", endDate:"", status:"" };

  // ── Misc internal flags ──
  p.isAutoToolsMode = raw.isAutoToolsMode !== undefined ? raw.isAutoToolsMode : true;
  p.hardwareItemOverrides = raw.hardwareItemOverrides || {};
  p.customHardwareItems = raw.customHardwareItems || [];
  p.includeBrand = raw.includeBrand !== undefined ? raw.includeBrand : true;
  p.defaultPkg = raw.defaultPkg || "premium";
  p.defaultBrand = raw.defaultBrand || "asian";

  return recalculateProjectTotals(p);
}

function calcNet(r) {
  if (!r) return 0;
  let walls = 0;
  if (r.walls && r.walls.length > 0) {
    if (r.walls[0]?.segments) {
      const rh = r.roomHeight ?? 10;
      const useDefault = r.useRoomHeight !== false; // true unless explicitly false
      for (const wall of r.walls) {
        if (!wall) continue;
        // When toggle ON, strip wall.height so calcWallArea falls back to rh
        const effWall = useDefault ? { ...wall, height: null } : wall;
        walls += calcWallArea(effWall, rh);
      }
    } else {
      // Legacy flat format {length, height}
      walls = r.walls.reduce((s, w) => s + (w?.length || w?.w || w?.width || 0) * (w?.height || w?.h || w?.height || 0), 0);
    }
  }
  const extra = (r.extraWalls || []).reduce((s, e) => s + (e?.mode === "add" ? 1 : -1) * (e?.length || e?.w || e?.width || 0) * (e?.height || e?.h || e?.height || 0), 0);
  const ceil = r.ceiling?.on ? (r.ceiling?.l || r.ceiling?.length || 0) * (r.ceiling?.w || r.ceiling?.width || 0) : 0;
  const open = (r.openings || []).reduce((s, o) => {
    const a = (o?.length || o?.w || o?.width || 0) * (o?.height || o?.h || o?.height || 0) * (o?.count || o?.qty || 1);
    return s + ((o?.mode || "deduct") === "add" ? -a : a);
  }, 0);
  return Math.max(0, walls + extra + ceil - open);
}
function recalculateProjectTotals(p) {
  if (!p?.floors) return p;
  const fresh = { ...p };
  let totalInteriorSqft = 0;
  let totalExteriorSqft = 0;
  const projectType = fresh.projectType || "fresh";

  (fresh.floors || []).forEach(f => {
    (f.rooms || []).forEach(r => {
      if (!r) return;
      const roomHeight = r.roomHeight ?? 10;
      const wallSqft = (r.walls || []).reduce((sum, w) => sum + calcWallArea(w, roomHeight), 0);
      r.totalSqft = wallSqft;
      
      // Update price totals
      const roomCalc = calcRoom(r, projectType);
      r.netSqft = roomCalc.net;
      r.materialCost = roomCalc.mat;
      r.labourCost = roomCalc.lab;
      r.totalCost = roomCalc.total;

      totalInteriorSqft += wallSqft;
      if (r.ceiling?.on) {
        totalInteriorSqft += (r.ceiling.l || 0) * (r.ceiling.w || 0);
      }
    });
  });

  (fresh.exterior || []).forEach(e => {
    const sides = (e.sections || []).filter(s => (s.length || s.w) && (s.height || s.h));
    const exteriorArea = sides.reduce((sum, s) => sum + (s.length || s.w || 0) * (s.height || s.h || 0), 0);
    totalExteriorSqft += exteriorArea;
  });

  // Recalculate global project totals using the unified service aggregator
  const st = getProjectServiceTotals(fresh);
  fresh.totalSqft = st.grandArea;
  fresh.totalArea = st.grandArea;
  fresh.grandTotal = st.grandTotal;
  fresh.totalAmount = st.grandTotal;
  
  return fresh;
}
function calcFinCost(fin, net, paintingType = "fresh") {
  return Object.entries(fin).reduce((s,[k,f]) => {
    if (!f.on) return s;
    const a = f.useRoom ? net : (f.area||0);
    const catKey = FIN_CATEGORY_MAP[k] || "interior";
    const r = f.rate || getRateForFinish(catKey, f.type, k, paintingType) || 0;
    return s + r*(f.coats||1)*a + (k==="wallpaper" ? (f.installRate||0)*a : 0);
  }, 0);
}
function calcRoom(r, paintingType = "fresh") {
  const net = calcNet(r);
  const finishing = r.finishing || defFinishing(r.package, paintingType);
  const mat = calcFinCost(finishing, net, paintingType);
  let lab, labEx;
  if (r.labourMethod === "daily") { const t=(r.dailyRate||0)*(r.workers||1)*(r.days||1); lab=t; labEx=t; }
  else { lab=net*(r.labourRate||0); labEx=net*(r.labourRateExcl||0); }
  return { net, mat, lab, labEx, total:mat+lab };
}
function projectTotals(p) {
  let net=0, mat=0, lab=0, labEx=0;
  const pType = p.projectType || "fresh";
  (p.floors || []).forEach(fl => (fl.rooms || []).forEach(r => {
    if (!r) return;
    const safeRoom = {
      ...r,
      finishing: r.finishing || defFinishing(r.package, pType)
    };
    const c=calcRoom(safeRoom, pType); net+=c.net; mat+=c.mat; lab+=c.lab; labEx+=c.labEx;
  }));
  return { net, mat, lab, labEx, totalIncl:mat+lab, totalExcl:labEx };
}
// Package-based fallback rates for exterior finishing when master rate lookup returns 0
const EXT_PKG_FALLBACK_RATES = { putty: 12, primer: 9, paint: 32, protection: 18, texture: 35 };
function calcExteriorMaterialCost(finishing, netArea, paintingType = "fresh") {
  return Object.entries(finishing||{}).reduce((s,[k,f]) => {
    if(!f.on) return s;
    const a=f.useRoom?netArea:(f.area||0);
    const r = f.rate || getRateForFinish("exterior", f.type, k, paintingType) || EXT_PKG_FALLBACK_RATES[k] || 0;
    return s+r*(f.coats||1)*a;
  }, 0);
}
function calcExteriorLabourCost(config, netArea) {
  if ((config.labourMethod||"sqft")==="daily") return (config.dailyRate||0)*(config.workers||1)*(config.days||1);
  const pkg = config.package || "premium";
  const pkgLabour = { economy: 20, premium: 30, luxury: 40, ultra_luxury: 60 };
  return netArea*(config.labourRate || pkgLabour[pkg] || 0);
}
function calcExteriorLabourCostExcl(config, netArea) {
  if ((config.labourMethod||"sqft")==="daily") return (config.dailyRate||0)*(config.workers||1)*(config.days||1);
  const pkg = config.package || "premium";
  const pkgLabourExcl = { economy: 12, premium: 18, luxury: 25, ultra_luxury: 40 };
  return netArea*(config.labourRateExcl || pkgLabourExcl[pkg] || 0);
}
// PAINT-EXT-002B — pure resolver. Old elevations saved before this ticket have no
// exteriorOverride field at all; missing is treated identically to {useGlobal:true,
// config:null} — no migration/rewrite of saved data is performed or required. Global
// config is always the source of truth for any field the override doesn't explicitly
// set; finishing is merged one layer at a time (not as a whole object) so an override
// that only touches e.g. finishing.paint still inherits putty/primer/protection/texture
// from global untouched. Actively used by calcExteriorConfiguredTotals, the Exterior Paint
// editor, Quote Summary, and generatePDF().
function resolveExteriorConfig(elevation, globalConfig) {
  const ov = elevation && elevation.exteriorOverride;
  const useGlobal = !ov || ov.useGlobal !== false; // missing/malformed → treat as global, fail safe
  if (useGlobal) return globalConfig;
  const patch = ov.config || {};
  const merged = { ...globalConfig, ...patch };
  const globalFinishing = globalConfig.finishing || {};
  const patchFinishing = patch.finishing || {};
  merged.finishing = { ...globalFinishing };
  Object.keys(patchFinishing).forEach(key => {
    merged.finishing[key] = { ...(globalFinishing[key]||{}), ...patchFinishing[key] };
  });
  return merged;
}
// PAINT-EXT-002C Part 6 — pure sparse-diff helper. Given a fully-resolved edited config
// (as produced by ExteriorMaterialPanel's onChange, which always returns a complete
// object built by spreading its `config` prop) and the current global config, returns
// only the fields that differ from global — so what gets written to an elevation's
// exteriorOverride.config stays a sparse patch, matching resolveExteriorConfig's merge
// contract above. Never mutates either input.
function buildExteriorOverridePatch(resolvedEditedConfig, globalConfig) {
  const gc = globalConfig || {};
  const edited = resolvedEditedConfig || {};
  const patch = {};
  ["package","brand","customBrand","labourRate","labourRateExcl","labourMethod","dailyRate","workers","days"].forEach(key => {
    if (edited[key] !== gc[key]) patch[key] = edited[key];
  });
  const gcFin = gc.finishing || {};
  const edFin = edited.finishing || {};
  const finPatch = {};
  Object.keys(edFin).forEach(layerKey => {
    const gcLayer = gcFin[layerKey] || {};
    const edLayer = edFin[layerKey] || {};
    const layerPatch = {};
    Object.keys(edLayer).forEach(field => {
      if (edLayer[field] !== gcLayer[field]) layerPatch[field] = edLayer[field];
    });
    if (Object.keys(layerPatch).length > 0) finPatch[layerKey] = layerPatch;
  });
  if (Object.keys(finPatch).length > 0) patch.finishing = finPatch;
  return patch;
}
function calcExteriorTotals(exterior=[]) {
  return exterior.reduce((s,el) => {
    const gross = el.sections
      ? el.sections.reduce((t,sec) => t+(sec.w||0)*(sec.h||0), 0)
      : (el.w||0)*(el.h||0); // legacy fallback — unmigrated data safe
    const add=(el.additions||[]).reduce((a,x)=>a+(x.w||0)*(x.h||0)*(x.qty||1),0);
    const ded=(el.deductions||[]).reduce((a,x)=>a+(x.w||0)*(x.h||0)*(x.qty||1),0);
    return s+Math.max(0,gross+add-ded);
  }, 0);
}
// PAINT-EXT-002D Part 1 — single-elevation net area, same geometry rules as
// calcExteriorTotals's per-elevation term above (kept byte-for-byte identical on purpose
// so calcExteriorTotals(exterior) === sum of calcExteriorElevationNet(el) over exterior,
// by construction, not by coincidence).
function calcExteriorElevationNet(el) {
  const gross = el.sections
    ? el.sections.reduce((t,sec) => t+(sec.length||sec.w||0)*(sec.height||sec.h||0), 0)
    : (el.length||el.w||0)*(el.height||el.h||0); // legacy fallback — unmigrated data safe
  const add=(el.additions||[]).reduce((a,x)=>a+(x.length||x.w||0)*(x.height||x.h||0)*(x.qty||1),0);
  const ded=(el.deductions||[]).reduce((a,x)=>a+(x.length||x.w||0)*(x.height||x.h||0)*(x.qty||1),0);
  return Math.max(0,gross+add-ded);
}
// PAINT-EXT-002D Parts 2-9 — per-elevation exterior aggregator. Reuses
// calcExteriorMaterialCost / calcExteriorLabourCost(Excl) / resolveExteriorConfig exactly
// as they exist; this function only decides, per elevation, what area/config to call them
// with and how to sum the results — it never touches their formulas.
//
// Two categories of cost are project-wide "lump sums" today, not truly per-elevation:
//   - a useRoom:false (manual-area) global finishing layer (one fixed ₹ amount)
//   - a daily-labour global config (one fixed crew/day charge)
// Both must be counted exactly once across all elevations still on useGlobal:true, or the
// existing total would get multiplied by elevation count. An elevation with its own
// override is isolated by definition — its manual-area layers and/or daily-labour charge
// (whether the specific field was overridden or inherited from global) belong to that one
// elevation only, so no dedupe applies there.
function calcExteriorConfiguredTotals(exterior, globalConfig, quoteMode, paintingType = "fresh") {
  const els = exterior || [];
  const gc = globalConfig || defExteriorConfig();
  const withMat = quoteMode === "with_material";

  const splitFinishing = (finishing) => {
    const auto = {}, manual = {};
    Object.entries(finishing || {}).forEach(([k, f]) => {
      auto[k]   = f.useRoom ? f : { ...f, on:false };
      manual[k] = f.useRoom ? { ...f, on:false } : f;
    });
    return { auto, manual };
  };

  const globalManual = splitFinishing(gc.finishing).manual;
  const globalManualMaterial = calcExteriorMaterialCost(globalManual, 0, paintingType);
  const globalIsDaily = (gc.labourMethod || "sqft") === "daily";
  const globalDailyLabour = !globalIsDaily ? 0
    : (withMat ? calcExteriorLabourCost(gc, 0) : calcExteriorLabourCostExcl(gc, 0));

  let globalManualCharged = false;
  let globalDailyCharged = false;
  let area = 0, material = 0, labour = 0;

  const elevations = els.map(el => {
    const elArea = calcExteriorElevationNet(el);
    let resolved = resolveExteriorConfig(el, gc);
    
    // BUG-FIX: Fallback auto-selection if area > 0 but no paint system selected.
    //   Use the package type to derive the correct tier ID (e.g. "premium" →
    //   "premium_ext") so getRateForFinish finds a real rate, not ₹0.
    if (elArea > 0) {
      const hasPaint = resolved.finishing?.paint?.on && resolved.finishing?.paint?.type;
      if (!hasPaint) {
        const fallbackPkg = resolved.package || gc.package || "premium";
        const pkgToTierId = { economy: "economy_ext", premium: "premium_ext", luxury: "luxury_ext", ultra_luxury: "ultra_luxury_ext" };
        const fallbackTierId = pkgToTierId[fallbackPkg] || "premium_ext";
        const fallbackRate = getRateForFinish("exterior", fallbackTierId, "paint", paintingType);
        resolved = {
          ...resolved,
          finishing: {
            ...(resolved.finishing || {}),
            paint: {
              on: true,
              useRoom: true,
              type: fallbackTierId,
              rate: fallbackRate,
              coats: 2
            }
          }
        };
      }
    }
    // Ensure every active finishing layer has a non-zero rate by falling back to
    //   the master rate table or the package default.
    if (elArea > 0 && resolved.finishing) {
      const pkg = resolved.package || gc.package || "premium";
      const pkgFallbackRate = { putty: 12, primer: 9, paint: 32, protection: 18, texture: 35 };
      for (const layerKey of Object.keys(resolved.finishing)) {
        const layer = resolved.finishing[layerKey];
        if (!layer || !layer.on) continue;
        if (!layer.rate || layer.rate === 0) {
          const masterRate = getRateForFinish("exterior", layer.type, layerKey, paintingType);
          layer.rate = masterRate || pkgFallbackRate[layerKey] || 0;
        }
      }
    }

    const ov = el && el.exteriorOverride;
    const useGlobal = !ov || ov.useGlobal !== false;

    // Material
    let elMaterial = 0;
    if (withMat) {
      const { auto, manual } = splitFinishing(resolved.finishing);
      elMaterial += calcExteriorMaterialCost(auto, elArea, paintingType);
      if (!useGlobal) {
        elMaterial += calcExteriorMaterialCost(manual, 0, paintingType);
      } else if (!globalManualCharged) {
        elMaterial += globalManualMaterial;
        globalManualCharged = true;
      }
    }

    // Labour
    const resolvedIsDaily = (resolved.labourMethod || "sqft") === "daily";
    let elLabour;
    if (!useGlobal) {
      // Override elevation — sqft or daily, always isolated to this one elevation.
      elLabour = withMat ? calcExteriorLabourCost(resolved, elArea) : calcExteriorLabourCostExcl(resolved, elArea);
    } else if (resolvedIsDaily) {
      // Global daily crew — one charge total, assigned to the first eligible global elevation.
      if (!globalDailyCharged) { elLabour = globalDailyLabour; globalDailyCharged = true; }
      else elLabour = 0;
    } else {
      // Global sqft mode — naturally per-elevation by area, no dedupe needed.
      elLabour = withMat ? calcExteriorLabourCost(resolved, elArea) : calcExteriorLabourCostExcl(resolved, elArea);
    }

    area += elArea; material += elMaterial; labour += elLabour;
    return { id:el.id, name:el.name, area:elArea, material:elMaterial, labour:elLabour, total:elMaterial+elLabour, useGlobal, config:resolved };
  });

  return { area, material, labour, total:material+labour, elevations };
}
function calcSectionTotal(mat, lab, charges) {
  const { additionalCharges=0, discount=0, gst=0 } = charges||{};
  const sub = mat+lab+additionalCharges;
  const discountAmt = sub*discount/100;
  const afterDiscount = sub-discountAmt;
  const gstAmt = afterDiscount*gst/100;
  return { sub, discountAmt, afterDiscount, gstAmt, total:afterDiscount+gstAmt };
}
function calcDWItem(it) {
  const area=(it.length||it.w||0)*(it.height||it.h||0)*(it.qty||1);
  const mat=area*(it.rate||0)*(it.coats||1);
  const lab=area*(it.labourRate||0);
  return { area, mat, lab, total:mat+lab };
}
function calcDWTotals(items=[]) {
  return items.reduce((s,it)=>{ const c=calcDWItem(it); return {mat:s.mat+c.mat,lab:s.lab+c.lab,total:s.total+c.total}; },{mat:0,lab:0,total:0});
}
function newWPItem() {
  return { id:uid(), label:"Wallpaper Area", design:"", brand:"", rollPreset:"std", rollW:0.53, rollL:10, wallW:0, wallH:0, areaMode:"manual", area:0, rate:0, installRate:0 };
}
function calcWPItem(it) {
  const rollArea = parseFloat(((it.rollW||0.53)*(it.rollL||10)).toFixed(3));
  const area     = it.area||0;
  const rolls    = rollArea>0 ? Math.ceil(area/rollArea) : 0;
  const mat      = rolls*(it.rate||0);
  const lab      = area*(it.installRate||0);
  return { area, rollArea, rolls, mat:parseFloat(mat.toFixed(2)), lab:parseFloat(lab.toFixed(2)), total:parseFloat((mat+lab).toFixed(2)) };
}
function calcWPTotals(items=[]) {
  return items.reduce((s,it)=>{ const c=calcWPItem(it); return {mat:s.mat+c.mat,lab:s.lab+c.lab,total:s.total+c.total}; },{mat:0,lab:0,total:0});
}
function newTextureItem() {
  return { id:uid(), label:"Texture Finish", type:"roller", customType:"", applyMode:"Full Wall", areaMode:"manual", wallW:0, wallH:0, area:0, rate:22, coats:1, labourRate:15 };
}
function calcTextureItem(it) {
  const area=it.area||0;
  const mat=parseFloat((area*(it.rate||0)*(it.coats||1)).toFixed(2));
  const lab=parseFloat((area*(it.labourRate||0)).toFixed(2));
  return { area, mat, lab, total:parseFloat((mat+lab).toFixed(2)) };
}
function calcTextureTotals(items=[]) {
  return items.reduce((s,it)=>{ const c=calcTextureItem(it); return {mat:s.mat+c.mat,lab:s.lab+c.lab,total:s.total+c.total}; },{mat:0,lab:0,total:0});
}
function getBrandName(r) { return r.brand==="other"?(r.customBrand||"Other"):(BRAND_PRODUCTS[r.brand]?.name||"—"); }
function getProductName(brandId, pkgId, surface="interior") {
  const b = BRAND_PRODUCTS[brandId]; if (!b) return "";
  const map = { economy:"economy", premium:"premium", luxury:"luxury", ultra_luxury:"ultra_luxury" };
  return (b[surface]||b["interior"]||{})[map[pkgId]||"premium"] || "";
}

// ─── UI ATOMS ─────────────────────────────────────────────────────
const LBL  = { fontSize:10, color:C.gray, fontWeight:700, letterSpacing:"0.06em", marginBottom:4, textTransform:"uppercase", display:"block" };
const INP  = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:16, outline:"none", background:"#FAFAFA", color:"#111", boxSizing:"border-box" };
const CARD = { background:C.white, borderRadius:14, padding:"16px 18px", marginBottom:10, border:`1px solid ${C.border}` };

function Inp({ label, value, onChange, type="text", placeholder="", rows, maxLength, disabled=false }) {
  const dis = disabled ? {opacity:0.55,cursor:"not-allowed",background:"#EDEDED"} : {};
  return <div>{label && <span style={LBL}>{label}</span>}
    {rows ? <textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} style={{...INP,resize:"none",...dis}} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          : <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled} style={{...INP,...dis}} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>}
  </div>;
}
function NumInp({ value, onChange, small, prefix, placeholder="0", disabled=false }) {
  const [raw, setRaw] = React.useState(value==null||value===0?"":String(value));
  const focused = React.useRef(false);

  // Sync inward only when parent changes AND field is not being typed into
  React.useEffect(()=>{
    if(!focused.current){
      setRaw(value==null||value===0?"":String(value));
    }
  },[value]);

  const commit = (str) => {
    const n = parseFloat(str);
    onChange(isNaN(n) ? 0 : n);
  };

  return <div style={{position:"relative"}}>
    {prefix && <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#aaa",fontWeight:700,pointerEvents:"none"}}>{prefix}</span>}
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder}
      disabled={disabled}
      onChange={e=>{
        if(disabled) return;
        const str = e.target.value;
        // Allow digits, one decimal point, leading minus (for future use)
        if(str===""||/^-?\d*\.?\d*$/.test(str)){
          setRaw(str);
          // Commit immediately if it's a valid complete number
          const n=parseFloat(str);
          if(!isNaN(n)) onChange(n);
        }
      }}
      onFocus={e=>{
        focused.current=true;
        e.target.style.borderColor=C.orange;
      }}
      onBlur={e=>{
        focused.current=false;
        e.target.style.borderColor=C.border;
        commit(raw);
        // Normalise display: strip trailing dot
        setRaw(v=>v.endsWith(".")?v.slice(0,-1):v);
      }}
      style={{...INP,padding:small?`8px 8px 8px ${prefix?"26px":"8px"}`:"11px 10px",fontSize:small?14:20,fontWeight:600,textAlign:prefix?"left":"center",...(disabled?{opacity:0.55,cursor:"not-allowed",background:"#EDEDED"}:{})}}
    />
    {disabled && <span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:11,pointerEvents:"none"}}>🔒</span>}
  </div>;
}
function DropSel({ label, value, onChange, options, style={}, disabled=false }) {
  const dis = disabled ? {opacity:0.55,cursor:"not-allowed",background:"#EDEDED"} : {};
  return <div style={style}>{label && <span style={LBL}>{label}{disabled?" 🔒":""}</span>}
    <div style={{position:"relative"}}>
      <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} style={{...INP,appearance:"none",WebkitAppearance:"none",paddingRight:28,cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontSize:13,...dis}}
        onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"#aaa",pointerEvents:"none"}}>{disabled?"🔒":"▾"}</span>
    </div>
  </div>;
}
// ─── CONDITION PHOTO MANAGER (Phase 1 — capture only, no PDF wiring) ──
function CondPhotoManager({ photos, onChange, placeholder }) {
  const list = photos||[];
  const addPhoto = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange([...list, newCondPhoto(ev.target.result, "")]);
    reader.readAsDataURL(file);
  };
  const setLabel = (id, label) => onChange(list.map(p=>p.id===id?{...p,label}:p));
  const removePhoto = id => onChange(list.filter(p=>p.id!==id));
  return <div style={{marginTop:10}}>
    <label style={{display:"inline-block",padding:"8px 14px",background:C.navy,color:"#fff",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>
      + Add Condition Photo
      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" style={{display:"none"}}
        onChange={e=>{ addPhoto(e.target.files&&e.target.files[0]); e.target.value=""; }}/>
    </label>
    {list.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginTop:10}}>
      {list.map(p=>
        <div key={p.id} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
          <img src={p.image} alt={p.label||"Condition photo"} style={{width:"100%",height:90,objectFit:"cover",display:"block",background:"#F1F5F9"}}/>
          <div style={{padding:8}}>
            <input value={p.label} onChange={e=>setLabel(p.id,e.target.value)}
              placeholder={placeholder||"e.g. North Wall Crack"}
              style={{width:"100%",fontSize:11,color:C.navy,border:`1px solid ${C.border}`,borderRadius:6,
                padding:"5px 7px",background:"#FAFAFA",outline:"none",marginBottom:6,boxSizing:"border-box"}}/>
            <button onClick={()=>removePhoto(p.id)}
              style={{width:"100%",background:C.redL,border:"none",borderRadius:6,padding:"4px 0",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>}
  </div>;
}
function SecLabel({ n, label }) {
  return <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
    <span style={{fontSize:10,color:"#aaa",fontWeight:700,letterSpacing:"0.08em"}}>{n}/</span>
    <span style={{fontSize:11,color:C.navy,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</span>
  </div>;
}
function CoatStepper({ value, onChange, disabled=false }) {
  const disBtn = disabled ? {cursor:"not-allowed",opacity:0.5} : {cursor:"pointer"};
  return <div style={{display:"flex",alignItems:"center",gap:8,height:36,opacity:disabled?0.6:1}}>
    <button onClick={()=>{if(!disabled)onChange(Math.max(1,(value||1)-1))}} disabled={disabled} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:16,fontWeight:700,color:C.orange,...disBtn}}>−</button>
    <span style={{fontSize:17,fontWeight:800,minWidth:22,textAlign:"center",color:C.navy}}>{value||1}</span>
    <button onClick={()=>{if(!disabled)onChange((value||1)+1)}} disabled={disabled} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:16,fontWeight:700,color:C.orange,...disBtn}}>+</button>
  </div>;
}
function RoomSVG({ aw }) {
  const pos = [{x:128,y:14},{x:248,y:82},{x:128,y:150},{x:9,y:82}];
  return <svg viewBox="0 0 258 165" style={{width:"100%",maxWidth:200}}>
    <rect x="7" y="7" width="244" height="150" rx="8" fill="#F5E8DC" stroke={C.orange} strokeWidth="2"/>
    <rect x="26" y="26" width="206" height="112" rx="3" fill="#FDF7F3" stroke={C.orange} strokeWidth="1" strokeDasharray="5 3"/>
    {["W1","W2","W3","W4"].map((l,i)=><text key={i} x={pos[i].x} y={pos[i].y} textAnchor="middle" fontSize="10" fill={i===aw?C.orange:"#bbb"} fontWeight="700" fontFamily="system-ui">{l}</text>)}
  </svg>;
}

// ─── BRAND LOGO ───────────────────────────────────────────────────
function BrandLogo({ id, size=40 }) {
  const r = Math.round(size*0.18);
  const T = (x,y,sz,wt,clr,txt) => <text x={x} y={y} textAnchor="middle" fontSize={sz} fill={clr} fontWeight={wt} fontFamily="Arial,sans-serif">{txt}</text>;
  const logos = {
    asian:    <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#E31837"/>{T(20,17,8,"900","#fff","ASIAN")}{T(20,27,7,"400","#fff","PAINTS")}<rect x="8" y="30" width="24" height="2" rx="1" fill="#FFD700"/></svg>,
    berger:   <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#003087"/>{T(20,16,7.5,"900","#fff","BERGER")}{T(20,26,6.5,"400","#fff","PAINTS")}<rect x="6" y="30" width="28" height="3" rx="1.5" fill="#E31837"/></svg>,
    nerolac:  <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#CC0000"/>{T(20,19,7.5,"900","#fff","NEROLAC")}{T(20,29,6,"400","#FFE066","KANSAI")}</svg>,
    indigo:   <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#3B0F8C"/>{T(20,18,8,"900","#fff","INDIGO")}{T(20,28,7,"400","#DDB8FF","PAINTS")}</svg>,
    jsw:      <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#00205B"/>{T(20,25,15,"900","#fff","JSW")}</svg>,
    shalimar: <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#1B6B3A"/>{T(20,17,6.5,"900","#FFD700","SHALIMAR")}{T(20,28,6.5,"400","#fff","PAINTS")}</svg>,
    birla:    <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#1C3B72"/>{T(20,17,7.5,"900","#FFD700","BIRLA")}{T(20,27,7,"400","#fff","OPUS")}<circle cx="20" cy="33" r="2.5" fill="#FFD700"/></svg>,
    nippon:   <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#CC0000"/><circle cx="20" cy="17" r="7" fill="white"/><circle cx="20" cy="17" r="3.5" fill="#CC0000"/>{T(20,32,6,"700","#fff","NIPPON")}</svg>,
    della:    <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#2C2C2C"/>{T(20,19,9,"900","#E8A020","DELLA")}{T(20,29,6,"400","#aaa","PAINTS")}</svg>,
    dulux:    <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#E2001A"/>{T(20,24,13,"900","#fff","Dulux")}</svg>,
    akzo:     <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#E63329"/>{T(20,17,7.5,"900","#fff","AKZO")}{T(20,28,7,"400","#fff","NOBEL")}</svg>,
    benjamin: <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#F5C500"/>{T(20,16,6,"900","#1A1A1A","BENJAMIN")}{T(20,25,6,"400","#1A1A1A","MOORE")}<rect x="8" y="28" width="24" height="3" rx="1.5" fill="#1A1A1A"/></svg>,
    sherwin:  <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#003087"/>{T(20,16,6,"900","#fff","SHERWIN")}{T(20,25,6,"400","#fff","WILLIAMS")}<rect x="6" y="29" width="28" height="3" rx="1.5" fill="#E31837"/></svg>,
    farrow:   <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#2C2C2C"/>{T(20,16,5.5,"700","#fff","FARROW")}{T(20,24,5,"400","#C9A96E","& BALL")}<rect x="10" y="27" width="20" height="1.5" fill="#C9A96E"/></svg>,
    jotun:    <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#1E4D92"/>{T(20,24,12,"900","#fff","jotun")}</svg>,
    other:    <svg width={size} height={size} viewBox="0 0 40 40"><rect width="40" height="40" rx={r} fill="#9CA3AF"/>{T(20,22,9,"700","#fff","OTHER")}</svg>,
  };
  return logos[id] || logos.other;
}

function PaintShipLogo({ size=72 }) {
  return (
    <img
      src="/Paintship B-Logo.png"
      alt="PaintShip"
      style={{ height: size, width: "auto", objectFit: "contain", display: "block" }}
    />
  );
}

// ─── BRAND POPUP ──────────────────────────────────────────────────
function BrandPopup({ current, customBrand, onSelect, onCustom, onClose }) {
  const [custom, setCustom] = useState(customBrand||"");
  const indianIds = ["asian","berger","nerolac","indigo","jsw","shalimar","birla","nippon","della"];
  const intlIds   = ["dulux","akzo","benjamin","sherwin","farrow","jotun"];
  function BBtn({ id }) {
    const sel=current===id;
    const tier=(id==="dulux"||id==="akzo"||id==="jotun")?"luxury":(id==="benjamin"||id==="sherwin"||id==="farrow")?"ultra_luxury":"premium";
    const badge=TIER_BADGE[tier];
    return <button onClick={()=>{ onSelect(id); if(id!=="other") onClose(); }}
      style={{padding:"10px 6px",borderRadius:10,textAlign:"center",cursor:"pointer",border:`2px solid ${sel?C.navy:C.border}`,background:sel?C.navy:C.white,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <div style={{borderRadius:7,overflow:"hidden"}}><BrandLogo id={id} size={32}/></div>
      <div style={{fontSize:8,fontWeight:700,color:sel?"#fff":"#555",lineHeight:1.2,maxWidth:56,textAlign:"center"}}>{BRAND_PRODUCTS[id]?.name||id}</div>
      <span style={{fontSize:7,fontWeight:700,borderRadius:20,padding:"1px 5px",background:sel?"rgba(255,255,255,0.2)":badge.bg,color:sel?"#fff":badge.color}}>{badge.label}</span>
      {sel&&<div style={{fontSize:9,color:C.orange,fontWeight:700}}>✓</div>}
    </button>;
  }
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:"20px 20px 0 0",padding:"20px 16px 40px",width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:800,color:C.navy}}>Select Paint Brand</div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:"#bbb",cursor:"pointer"}}>✕</button>
      </div>
      <div style={{fontSize:10,color:"#aaa",fontWeight:700,letterSpacing:"0.07em",marginBottom:10}}>🇮🇳 INDIAN BRANDS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>{indianIds.map(id=><BBtn key={id} id={id}/>)}</div>
      <div style={{fontSize:10,color:"#aaa",fontWeight:700,letterSpacing:"0.07em",marginBottom:10}}>🌍 INTERNATIONAL BRANDS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>{intlIds.map(id=><BBtn key={id} id={id}/>)}</div>
      <button onClick={()=>onSelect("other")} style={{width:"100%",padding:"10px 14px",borderRadius:10,cursor:"pointer",marginBottom:8,border:`2px solid ${current==="other"?C.orange:C.border}`,background:current==="other"?C.orangeL:C.white,color:current==="other"?C.orange:"#555",fontWeight:700,fontSize:13,textAlign:"left"}}>
        🖌 Other Brand {current==="other"&&"✓"}
      </button>
      {current==="other"&&<input value={custom} onChange={e=>{setCustom(e.target.value);onCustom(e.target.value);}} placeholder="Enter brand name..." style={{...INP,marginBottom:10}} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>}
      <button onClick={onClose} style={{width:"100%",padding:13,background:C.navy,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>Confirm</button>
    </div>
  </div>;
}

// ─── CONSUMPTION PANEL ────────────────────────────────────────────
function ConsumptionPanel({ f, net, onChange, finKey }) {
  const c=f.consumption; if(!c) return null;
  const isPowder = finKey === "putty";
  const u = isPowder ? "Kg" : "L";
  const uLbl = isPowder ? "Kg" : "L";
  const area=f.useRoom?net:(f.area||0);
  const auto=calcConsumption(area,f.coats||1,c.coverage,c.wastage,c.packSize,c.ratePerL);
  const displayL=c.overrideLitres?(c.manualLitres||0):auto.litresWithWaste;
  const displayPacks=c.overrideLitres?Math.ceil((c.manualLitres||0)/(c.packSize||1)):auto.packs;
  const displayCost=c.overrideLitres?(c.manualLitres||0)*(c.ratePerL||0):auto.cost;
  const upC=(field,val)=>onChange({...f,consumption:{...c,[field]:val}});
  return <div style={{marginTop:12,background:"#F0F9FF",borderRadius:10,padding:"12px 14px",border:`1px solid ${C.blue}33`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <span style={{fontSize:12,fontWeight:800,color:C.blue}}>🧮 Paint Consumption</span>
      <button onClick={()=>upC("enabled",!c.enabled)} style={{fontSize:10,fontWeight:700,borderRadius:20,padding:"3px 10px",border:"none",cursor:"pointer",background:c.enabled?C.blue:"#CBD5E1",color:"#fff"}}>{c.enabled?"ON":"OFF"}</button>
    </div>
    {c.enabled&&<>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><span style={LBL}>COVERAGE (sf/{uLbl})</span><NumInp small value={c.coverage} onChange={v=>upC("coverage",v)}/></div>
        <div><span style={LBL}>WASTAGE (%)</span><NumInp small value={c.wastage} onChange={v=>upC("wastage",v)}/></div>
        <div><span style={LBL}>PACK SIZE ({uLbl})</span><NumInp small value={c.packSize} onChange={v=>upC("packSize",v)}/></div>
        <div><span style={LBL}>RATE (₹/{uLbl})</span><NumInp small prefix="₹" value={c.ratePerL} onChange={v=>upC("ratePerL",v)}/></div>
      </div>
      <div style={{background:C.white,borderRadius:8,padding:"8px 10px",marginBottom:8,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,color:"#aaa",fontWeight:700,marginBottom:4}}>AUTO CALCULATION</div>
        <div style={{fontSize:11,color:"#555"}}>({area.toFixed(1)} sf × {f.coats||1}) ÷ {c.coverage} = <b>{auto.litres} {u}</b> + {c.wastage}% = <b style={{color:C.blue}}>{auto.litresWithWaste} {u}</b></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:"#555"}}>Override:</span>
        {["Auto","Manual"].map((lbl,i)=><button key={lbl} onClick={()=>upC("overrideLitres",i===1)} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${(i===1?c.overrideLitres:!c.overrideLitres)?C.navy:C.border}`,background:(i===1?c.overrideLitres:!c.overrideLitres)?C.navy:C.white,color:(i===1?c.overrideLitres:!c.overrideLitres)?"#fff":"#888",cursor:"pointer"}}>{lbl}</button>)}
      </div>
      {c.overrideLitres&&<div style={{marginBottom:8}}><span style={LBL}>MANUAL {isPowder?"KG":"LITRES"}</span><NumInp small value={c.manualLitres||0} onChange={v=>upC("manualLitres",v)}/></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:6}}>
        {[[isPowder?"Total Kg":"Total Litres",`${fmt(displayL)} ${u}`,C.blue],[isPowder?"Bags Req.":"Packs Req.",`${displayPacks} ${isPowder?"bags":"packs"}`,C.purple],["Mat. Cost",`₹${fmt(displayCost)}`,C.orange]].map(([label,val,col])=>(
          <div key={label} style={{background:C.white,borderRadius:8,padding:"8px 6px",textAlign:"center",border:`1px solid ${col}22`}}>
            <div style={{fontSize:9,color:"#aaa",fontWeight:700}}>{label}</div>
            <div style={{fontSize:13,fontWeight:800,color:col,marginTop:2}}>{val}</div>
          </div>
        ))}
      </div>
    </>}
  </div>;
}

// ─── PIN ENTRY MODAL (rate-lock unlock) ──────────────────────────
function PinEntryModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => {
    if (verifySupervisorPin(pin)) { onSuccess(); }
    else { setErr("Incorrect PIN. Try again."); setPin(""); inputRef.current?.focus(); }
  };
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:16,padding:"28px 24px",width:"100%",maxWidth:320,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{textAlign:"center",marginBottom:18}}>
        <div style={{fontSize:36,marginBottom:8}}>🔒</div>
        <div style={{fontSize:16,fontWeight:800,color:C.navy}}>Enter PIN to Unlock</div>
        <div style={{fontSize:11,color:C.gray,marginTop:4}}>Enter the security PIN to edit finish rates.</div>
      </div>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={e=>{ setErr(""); setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,4)); }}
        onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
        placeholder="••••"
        maxLength={4}
        style={{...INP,textAlign:"center",fontSize:24,letterSpacing:"0.5em",fontWeight:800}}
        onFocus={e=>e.target.style.borderColor=C.orange}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
      {err && <div style={{fontSize:11,color:C.red,fontWeight:700,textAlign:"center",marginTop:8}}>{err}</div>}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button onClick={onClose} style={{flex:1,padding:"12px",background:"#F0F4F8",color:C.navy,border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>Cancel</button>
        <button onClick={submit} style={{flex:1,padding:"12px",background:C.navy,color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>Unlock</button>
      </div>
    </div>
  </div>;
}

// ─── INTERIOR FINISHING MODULE ────────────────────────────────────
function FinishingModule({ finishing, onChange, net, visibleKeys=null, showNetLabel=true, locked=false, paintingType="fresh", hideRates=false }) {
  const [openMap,setOpenMap]=useState({});
  const tog=k=>setOpenMap(p=>({...p,[k]:!p[k]}));
  const upF=(k,f,v)=>{ if(locked) return; onChange({...finishing,[k]:{...finishing[k],[f]:v}}); };
  const finMeta=getFinMeta(paintingType);
  const changeType=(k,typeId)=>{
    if(locked) return;
    const types=finMeta[k]?.types||[];
    const t=types.find(x=>x.id===typeId)||types[0];
    const catKey=FIN_CATEGORY_MAP[k]||"interior";
    const masterRate=getRateForFinish(catKey,typeId,k,paintingType);
    onChange({...finishing,[k]:{...finishing[k],type:typeId,rate:masterRate||t?.r||0}});
  };
  // When a rate is edited in Unlocked mode, persist to master rates.
  const upFRate=(k,v)=>{ if(locked) return; const f=finishing[k]||{}; onChange({...finishing,[k]:{...f,rate:v}}); persistFinishRate(k,f.type,v,paintingType); };
  const finMetaEntries=Object.entries(finMeta).filter(([key])=>!visibleKeys||visibleKeys.includes(key));
  return <div>
    {showNetLabel&&<div style={{fontSize:12,color:"#aaa",marginBottom:12}}>Net area: <b style={{color:C.orange}}>{net.toFixed(2)} sq ft</b></div>}
    {finMetaEntries.map(([key,cfg])=>{
      const f=finishing[key]||{};
      const types=cfg.types;
      const selT=types.find(t=>t.id===f.type)||types[0];
      const area=f.useRoom?net:(f.area||0);
      const cost=(f.rate||0)*(f.coats||1)*area+(key==="wallpaper"?(f.installRate||0)*area:0);
      const isOpen=openMap[key];
      return <div key={key} style={{borderRadius:12,border:`1.5px solid ${f.on?C.orange:C.border}`,marginBottom:8,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:f.on?C.orangeL:C.white,cursor:locked?"not-allowed":"pointer"}} onClick={()=>{if(locked)return;if(!f.on)upF(key,"on",true);tog(key);}}>
          <input type="checkbox" checked={!!f.on} disabled={locked} onChange={e=>{e.stopPropagation();upF(key,"on",e.target.checked);}} style={{width:16,height:16,accentColor:C.orange,cursor:locked?"not-allowed":"pointer",flexShrink:0}}/>
          <span style={{fontSize:17}}>{cfg.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:f.on?C.navy:"#aaa"}}>{cfg.label}</div>
             {f.on&&<div style={{fontSize:10,color:"#888",marginTop:1}}>{selT?.label||""} · {f.coats||1} coat(s){!hideRates&&<> · ₹{cost.toFixed(0)}</>}</div>}
          </div>
          <span style={{fontSize:11,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s"}}>▾</span>
        </div>
        {f.on&&isOpen&&<div style={{padding:"12px 14px",background:C.white,borderTop:`1px solid ${C.border}`}}>
          {key==="wallpaper"
            ?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Inp label="Type / Design" value={f.type||""} onChange={v=>upF(key,"type",v)} placeholder="e.g. Floral" disabled={locked}/>
              <Inp label="Roll Size" value={f.rollSize||""} onChange={v=>upF(key,"rollSize",v)} placeholder="e.g. 10m×0.53m" disabled={locked}/>
            </div>
            :types.length>0&&<DropSel label="Type / Variant" value={f.type||types[0]?.id} onChange={v=>changeType(key,v)} options={types.map(t=>({value:t.id,label:t.label+(t.base?` (${t.base==="water"?"Water":"Oil"}-based)`:"")})) } style={{marginBottom:10}} disabled={locked}/>}
          {(f.type==="custom"||key==="wallpaper")&&<div style={{marginBottom:10}}><Inp label="Material Name" value={f.customName||""} onChange={v=>upF(key,"customName",v)} placeholder="Enter name..." disabled={locked}/></div>}
          {selT?.base&&<div style={{background:selT.base==="water"?C.blueL:"#FFF7ED",borderRadius:8,padding:"5px 10px",marginBottom:10,fontSize:11,color:selT.base==="water"?C.blue:C.gold,fontWeight:600}}>{selT.base==="water"?"💧 Water-Based":"🛢 Oil-Based"}</div>}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:11,color:"#555",fontWeight:600}}>Area:</span>
            {["Room Net","Custom"].map((lbl,i)=><button key={lbl} disabled={locked} onClick={()=>upF(key,"useRoom",i===0)} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${(i===0?f.useRoom:!f.useRoom)?C.navy:C.border}`,background:(i===0?f.useRoom:!f.useRoom)?C.navy:C.white,color:(i===0?f.useRoom:!f.useRoom)?"#fff":"#888",cursor:locked?"not-allowed":"pointer",opacity:locked?0.6:1}}>{lbl}</button>)}
          </div>
          {!f.useRoom&&<div style={{marginBottom:10}}><span style={LBL}>CUSTOM AREA (sf)</span><NumInp small value={f.area||0} onChange={v=>upF(key,"area",v)} disabled={locked}/></div>}
          {!hideRates&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
             <div><span style={LBL}>RATE (₹/sf){locked?" 🔒":""}</span><NumInp small prefix="₹" value={f.rate||0} onChange={v=>upFRate(key,v)} disabled={locked}/></div>
             <div><span style={LBL}>{key==="wallpaper"?"INSTALL (₹/sf)":"COATS"}</span>
               {key==="wallpaper"?<NumInp small prefix="₹" value={f.installRate||0} onChange={v=>upF(key,"installRate",v)} disabled={locked}/>:<CoatStepper value={f.coats||1} onChange={v=>upF(key,"coats",v)} disabled={locked}/>}
             </div>
           </div>}
           {hideRates&&<div style={{marginBottom:10}}><span style={LBL}>COATS</span><CoatStepper value={f.coats||1} onChange={v=>upF(key,"coats",v)} disabled={locked}/></div>}
           {!hideRates&&<div style={{background:C.orangeL,borderRadius:8,padding:"8px 12px",marginTop:10,display:"flex",justifyContent:"space-between"}}>
             <span style={{fontSize:11,color:"#c97a40",fontWeight:600}}>{area.toFixed(1)} sf × ₹{f.rate||0} × {f.coats||1}</span>
             <span style={{fontSize:15,fontWeight:800,color:C.orange}}>₹{cost.toFixed(0)}</span>
           </div>}
          {CONSUMPTION_ENABLED.includes(key)&&<ConsumptionPanel f={f} net={net} onChange={upd=>onChange({...finishing,[key]:upd})} finKey={key}/>}
        </div>}
      </div>;
    })}
  </div>;
}

// ─── EXTERIOR FINISHING MODULE ────────────────────────────────────
function ExteriorFinishingModule({ finishing, onChange, net, locked=false, paintingType="fresh" }) {
  const [openMap,setOpenMap]=useState({});
  const tog=k=>setOpenMap(p=>({...p,[k]:!p[k]}));
  const upF=(k,f,v)=>{ if(locked) return; onChange({...finishing,[k]:{...finishing[k],[f]:v}}); };
  const extFinMeta=getExtFinMeta(paintingType);
  const changeType=(k,typeId)=>{
    if(locked) return;
    const types=extFinMeta[k]?.types||[];
    const t=types.find(x=>x.id===typeId)||types[0];
    const masterRate=getRateForFinish("exterior",typeId,k,paintingType);
    onChange({...finishing,[k]:{...finishing[k],type:typeId,rate:masterRate||t?.r||0}});
  };
  const entries=Object.entries(extFinMeta);
  return <div>
    <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:14}}>Net exterior area: <b style={{color:C.orange}}>{net.toFixed(2)} sq ft</b></div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:10,marginBottom:10}}>
      {entries.map(([key,cfg])=>{
        const f=finishing[key]||{};
        const types=cfg.types;
        const selT=types.find(t=>t.id===f.type)||types[0];
        const area=f.useRoom?net:(f.area||0);
        const cost=(f.rate||0)*(f.coats||1)*area;
        return <button key={key} onClick={()=>{if(locked)return;if(!f.on)upF(key,"on",true);tog(key);}} style={{
            textAlign:"left",cursor:locked?"not-allowed":"pointer",position:"relative",
            borderRadius:12,padding:"14px 14px 12px",
            border:`1.5px solid ${f.on?C.teal:C.border}`,
            background:f.on?"#F0FDFA":C.white,
            boxShadow:f.on?"0 2px 8px rgba(13,148,136,0.10)":"none",
            transition:"all 0.15s",
            opacity:locked?0.7:1,
          }}>
          <span onClick={e=>{e.stopPropagation();if(!locked)upF(key,"on",!f.on);}} style={{
              position:"absolute",top:10,right:10,width:18,height:18,borderRadius:"50%",cursor:locked?"not-allowed":"pointer",
              background:f.on?C.teal:C.white,border:`1.5px solid ${f.on?C.teal:C.border}`,
              color:"#fff",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{f.on?"✓":""}</span>
          <div style={{fontSize:19,marginBottom:8}}>{cfg.icon}</div>
          <div style={{fontSize:12.5,fontWeight:800,color:f.on?C.navy:"#8B95A5",lineHeight:1.25,marginBottom:f.on?3:0}}>{cfg.label}</div>
          {f.on&&<div style={{fontSize:10,color:"#7A8699",fontWeight:600,lineHeight:1.3}}>{selT?.label||""}</div>}
          {f.on&&<div style={{fontSize:9.5,color:C.teal,fontWeight:700,marginTop:4}}>{f.coats||1} coat(s) · ₹{cost.toFixed(0)}</div>}
        </button>;
      })}
    </div>

    {entries.map(([key,cfg])=>{
      const f=finishing[key]||{};
      const types=cfg.types;
      const selT=types.find(t=>t.id===f.type)||types[0];
      const area=f.useRoom?net:(f.area||0);
      const cost=(f.rate||0)*(f.coats||1)*area;
      const isOpen=openMap[key];
      if(!(f.on&&isOpen)) return null;
      return <div key={key} style={{borderRadius:12,border:`1.5px solid ${C.teal}`,background:C.white,padding:"16px 18px",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <span style={{fontSize:16}}>{cfg.icon}</span>
          <span style={{fontSize:12.5,fontWeight:800,color:C.navy}}>{cfg.label}</span>
        </div>
        {types.length>0&&<DropSel label="Type / Variant" value={f.type||types[0]?.id} onChange={v=>changeType(key,v)} options={types.map(t=>({value:t.id,label:t.label+(t.base?` (${t.base==="water"?"Water":"Oil"}-based)`:"")})) } style={{marginBottom:12}} disabled={locked}/>}
        {f.type==="custom"&&<div style={{marginBottom:12}}><Inp label="Material Name" value={f.customName||""} onChange={v=>upF(key,"customName",v)} placeholder="Enter name..." disabled={locked}/></div>}
        {selT?.base&&<div style={{background:selT.base==="water"?C.blueL:"#FFF7ED",borderRadius:10,padding:"7px 12px",marginBottom:12,fontSize:11,color:selT.base==="water"?C.blue:C.gold,fontWeight:600}}>{selT.base==="water"?"💧 Water-Based":"🛢 Oil-Based"}</div>}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:11,color:C.gray,fontWeight:700}}>Area:</span>
          {["Elevation Net","Custom"].map((lbl,i)=><button key={lbl} disabled={locked} onClick={()=>upF(key,"useRoom",i===0)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${(i===0?f.useRoom:!f.useRoom)?C.navy:C.border}`,background:(i===0?f.useRoom:!f.useRoom)?C.navy:C.white,color:(i===0?f.useRoom:!f.useRoom)?"#fff":C.gray,cursor:locked?"not-allowed":"pointer",opacity:locked?0.6:1}}>{lbl}</button>)}
        </div>
        {!f.useRoom&&<div style={{marginBottom:12}}><span style={LBL}>Custom Area (sf)</span><NumInp small value={f.area||0} onChange={v=>upF(key,"area",v)} disabled={locked}/></div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><span style={LBL}>Rate (₹/sf){locked?" 🔒":""}</span><NumInp small prefix="₹" value={f.rate||0} onChange={v=>upF(key,"rate",v)} disabled={locked}/></div>
          <div><span style={LBL}>Coats</span><CoatStepper value={f.coats||1} onChange={v=>upF(key,"coats",v)} disabled={locked}/></div>
        </div>
        <div style={{background:"#F0FDFA",borderRadius:10,padding:"10px 14px",marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#0D9488",fontWeight:600}}>{area.toFixed(1)} sf × ₹{f.rate||0} × {f.coats||1}</span>
          <span style={{fontSize:16,fontWeight:800,color:C.teal}}>₹{cost.toFixed(0)}</span>
        </div>
      </div>;
    })}
  </div>;
}

// ─── HOISTED SUB-COMPONENTS (module level — never recreated on render) ────────

// Measurement screen header: floor chips, room chips
// Package/brand/finishing selection moved to Finish step — see Paints & Finish (Step 5).
function MeasurementHeader({ project, floor, room, af, ar, setAf, setAr, upRoom, withMat, inr, calcRoom, calcNet, addRoom, addFloor, up }) {
  const safeProject = project || {};
  const safeFloor = floor || {};
  const safeRoom = room || {};

  const removeFloor = (fi) => {
    const floors = safeProject.floors || [];
    if (floors.length <= 1) return;
    const next = floors.filter((_, i) => i !== fi);
    up(p => ({ ...p, floors: next }));
    if (fi === af) {
      setAf(Math.max(0, fi - 1));
      setAr(0);
    } else if (fi < af) {
      setAf(af - 1);
    }
  };

  const removeRoom = (ri) => {
    const rooms = safeFloor.rooms || [];
    if (rooms.length <= 1) return;
    const next = rooms.filter((_, i) => i !== ri);
    up(p => {
      const floors = (p.floors || []).map((fl, fi) => fi === af ? { ...fl, rooms: next } : fl);
      return { ...p, floors };
    });
    if (ri === ar) {
      setAr(Math.max(0, ri - 1));
    } else if (ri < ar) {
      setAr(ar - 1);
    }
  };

  return <>
    {/* ── Breadcrumb: Selected Floor → Selected Room ── */}
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7,padding:"6px 10px",
      background:C.navy,borderRadius:10,flexWrap:"wrap"}}>
      <span style={{fontSize:12,fontWeight:800,color:"#fff"}}>{safeFloor.name || ''}</span>
      <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>→</span>
      <span style={{fontSize:12,fontWeight:800,color:C.gold}}>
        {safeRoom.type==="Custom"?(safeRoom.customType||"Custom"):(safeRoom.type || '')}
      </span>
    </div>

    {/* ── Floor chips — always visible ── */}
    <div style={{marginBottom:6}}>
      <div style={{fontSize:9,fontWeight:700,color:C.gray,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Floor</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {(safeProject.floors || []).map((fl,fi)=>{
          const nameStr = (fl.name || '').toString();
          const abbr = nameStr.replace("Ground","GF").replace("First","FF").replace("Second","SF").replace("Third","TF").replace("Fourth","4F").replace(" Floor","").replace("Floor","").trim() || (fl.name || '').slice(0,3);
          const canRemoveFloor = (safeProject.floors || []).length > 1;
          return <div key={fl.id || fi} style={{display:"inline-flex",alignItems:"center",gap:0}}>
            <button onClick={()=>{setAf(fi);setAr(0);}}
              style={{padding:"5px 14px",minHeight:32,borderRadius:"20px 0 0 20px",fontSize:11,fontWeight:700,cursor:"pointer",
                border:`2px solid ${fi===af?C.orange:C.border}`,
                background:fi===af?C.orange:"#F8FAFC",
                color:fi===af?"#fff":C.gray,transition:"all 0.15s"}}>
              {abbr}
            </button>
            {canRemoveFloor && <button onClick={(e)=>{e.stopPropagation();removeFloor(fi);}}
              style={{padding:"5px 8px",minHeight:32,borderRadius:"0 20px 20px 0",fontSize:11,fontWeight:800,cursor:"pointer",
                border:`2px solid ${fi===af?C.orange:C.border}`,borderLeft:"none",
                background:fi===af?C.orange:"#F8FAFC",
                color:fi===af?"rgba(255,255,255,0.8)":C.red,transition:"all 0.15s",lineHeight:1}}>
              ✕
            </button>}
          </div>;
        })}
        <button onClick={addFloor}
          style={{padding:"5px 14px",minHeight:32,borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
            border:`2px dashed ${C.green}`,background:C.greenL,color:C.green,
            transition:"all 0.15s",flexShrink:0}}>
          + Floor
        </button>
      </div>
    </div>

    {/* ── Room chips ── */}
    <div style={{marginBottom:8}}>
      <div style={{fontSize:9,fontWeight:700,color:C.gray,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Room</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {(safeFloor.rooms || []).map((r,ri)=>{
          const rc2=calcRoom(r); const net2=calcNet(r); const sel=ri===ar;
          const canRemoveRoom = (safeFloor.rooms || []).length > 1;
          return <div key={r.id || ri} style={{display:"inline-flex",alignItems:"stretch",gap:0}}>
            <button onClick={()=>setAr(ri)}
              style={{padding:"6px 12px",borderRadius:"20px 0 0 20px",fontSize:11,fontWeight:700,cursor:"pointer",
                border:`2px solid ${sel?C.navy:C.border}`,
                background:sel?C.navy:"#F8FAFC",color:sel?"#fff":C.gray,
                transition:"all 0.15s",textAlign:"left"}}>
              <div>{r.type==="Custom"?(r.customType||"Custom"):r.type}{r.condition!=="Good"?" ⚠":""}</div>
              <div style={{fontSize:9,fontWeight:600,color:sel?"rgba(255,255,255,0.65)":C.orange,marginTop:1}}>
                {net2>0?`${inr(withMat?rc2.total:rc2.labEx)} · ${net2.toFixed(0)}sf`:"tap to measure"}
              </div>
            </button>
            {canRemoveRoom && <button onClick={(e)=>{e.stopPropagation();removeRoom(ri);}}
              style={{padding:"0 8px",borderRadius:"0 20px 20px 0",fontSize:11,fontWeight:800,cursor:"pointer",
                border:`2px solid ${sel?C.navy:C.border}`,borderLeft:"none",
                background:sel?C.navy:"#F8FAFC",
                color:sel?"rgba(255,255,255,0.8)":C.red,transition:"all 0.15s",lineHeight:1}}>
              ✕
            </button>}
          </div>;
        })}
        <button onClick={addRoom}
          style={{padding:"6px 14px",minHeight:32,borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
            border:`2px dashed ${C.green}`,background:C.greenL,color:C.green,
            transition:"all 0.15s",flexShrink:0}}>
          + Room
        </button>
      </div>
    </div>

  </>;
}

// ── Wall adjustment card — supports both Add and Deduct modes
function SegOpCard({ op, onUpdate, onRemove }) {
  const isAdd = (op.mode||"deduct")==="add";
  const accent = isAdd ? C.green : C.red;
  const accentL = isAdd ? C.greenL : C.redL;
  const kindIcon = op.kind==="Door"?"🚪":op.kind==="Window"?"🪟":op.kind==="Sliding Door"?"🛤":op.kind==="Arch"?"🔠":op.kind==="Open Space"?"⬜":op.kind==="Column"?"⬛":op.kind==="Projection"?"⬆":"✏️";
  const area = (op.length||op.w||0)*(op.height||op.h||0)*(op.count||1);
  return <div style={{background:accentL,borderRadius:10,padding:"10px 12px",marginBottom:6,border:`1.5px solid ${accent}33`}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
      <span style={{fontSize:16,flexShrink:0}}>{kindIcon}</span>
      <input value={op.label} onChange={e=>onUpdate({...op,label:e.target.value})}
        style={{flex:1,fontSize:12,fontWeight:700,color:C.navy,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 8px",background:C.white,outline:"none"}}/>
      <button onClick={()=>onUpdate({...op,mode:isAdd?"deduct":"add"})}
        style={{fontSize:11,fontWeight:800,color:accent,background:"#fff",borderRadius:20,padding:"2px 8px",border:`1px solid ${accent}33`,flexShrink:0,cursor:"pointer"}}>
        {isAdd?"+ADD":"−DED"}
      </button>
      <button onClick={onRemove} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,fontWeight:800,padding:"0 4px",flexShrink:0}}>✕</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 16px 1fr 90px",alignItems:"end",gap:6,marginBottom:6}}>
      <div><div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:3}}>W (ft)</div><NumInp small value={op.length||op.w} onChange={v=>onUpdate({...op,length:v})}/></div>
      <div style={{textAlign:"center",fontSize:15,color:"#ccc",fontWeight:700,paddingBottom:7}}>×</div>
      <div><div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:3}}>H (ft)</div><NumInp small value={op.height||op.h} onChange={v=>onUpdate({...op,height:v})}/></div>
      <div>
        <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:3}}>QTY</div>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <button onClick={()=>onUpdate({...op,count:Math.max(1,(op.count||1)-1)})} style={{width:28,height:34,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:16,fontWeight:700,color:C.red}}>−</button>
          <span style={{fontSize:14,fontWeight:800,minWidth:18,textAlign:"center",color:C.navy}}>{op.count||1}</span>
          <button onClick={()=>onUpdate({...op,count:(op.count||1)+1})} style={{width:28,height:34,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:16,fontWeight:700,color:C.green}}>+</button>
        </div>
      </div>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",background:"#fff",borderRadius:7,padding:"5px 10px",border:`1px solid ${accent}22`}}>
      <span style={{fontSize:10,color:"#aaa"}}>{(op.length||op.w||0).toFixed(1)} × {(op.height||op.h||0).toFixed(1)} × {op.count||1}</span>
      <span style={{fontSize:12,fontWeight:800,color:accent}}>{isAdd?"+":"−"}{area.toFixed(2)} sf</span>
    </div>
  </div>;
}

// ── Wall strip visualiser — CSS only, no canvas, no coordinates
function WallViz({ wall, roomHeight, activeSegIdx, onSegClick }) {
  const effH = wall.height ?? roomHeight ?? 10;
  const segs = wall.segments||[];
  const totalW = segs.reduce((s,sg)=>s+(sg.length||sg.w||0),0)||1;
  const SEG_COLORS = { flat:C.navy, recess:C.blue, projection:C.orange, column:C.teal, beam:C.purple, niche:C.green };
  const SEG_ICONS  = { flat:"▬", recess:"⬇", projection:"⬆", column:"⬛", beam:"━", niche:"🔲" };
  return <div style={{background:"#F0F4F8",borderRadius:10,padding:"8px",marginBottom:10}}>
    <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>
      Wall Preview · {totalW.toFixed(1)}ft wide · {effH.toFixed(1)}ft high
    </div>
    {/* Proportional section strip */}
    <div style={{display:"flex",gap:2,height:42,borderRadius:7,overflow:"hidden",border:`1px solid ${C.border}`}}>
      {segs.map((seg,idx)=>{
        const pct = ((seg.length||seg.w||0)/totalW)*100;
        const col = SEG_COLORS[seg.kind]||C.navy;
        const active = idx===activeSegIdx;
        const segArea = calcSegArea(seg, wall, roomHeight);
        const hasOp = (seg.openings||[]).length>0;
        return <button key={seg.id} onClick={()=>onSegClick(idx)}
          style={{flex:`0 0 ${Math.max(pct,4)}%`,background:active?col:col+"44",
            border:`2px solid ${active?col:"transparent"}`,
            cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",transition:"all 0.15s",position:"relative",padding:0}}>
          <span style={{fontSize:10,color:active?"#fff":col,fontWeight:800}}>{SEG_ICONS[seg.kind]||"▬"}</span>
          <span style={{fontSize:7,color:active?"rgba(255,255,255,0.8)":col,fontWeight:600,marginTop:1}}>{segArea.toFixed(1)}</span>
          {hasOp&&<span style={{position:"absolute",top:1,right:2,fontSize:7,color:C.red}}>●</span>}
        </button>;
      })}
    </div>
    {/* Section labels below */}
    <div style={{display:"flex",gap:2,marginTop:3}}>
      {segs.map((seg,idx)=>{
        const pct = ((seg.length||seg.w||0)/totalW)*100;
        const col = SEG_COLORS[seg.kind]||C.navy;
        return <div key={seg.id} style={{flex:`0 0 ${Math.max(pct,4)}%`,textAlign:"center"}}>
          <span style={{fontSize:7,color:idx===activeSegIdx?col:"#aaa",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",display:"block"}}>
            {seg.label||seg.kind}
          </span>
        </div>;
      })}
    </div>
  </div>;
}

// ── Full wall editor — simplified default flow, advanced shapes collapsed
// ── Quick Name suggestions — collapsed, low-visual-weight by default
function RenameSuggestions({ wall, onUpdate }) {
  const [open, setOpen] = useState(false);
  const names = ["TV Wall","Window Wall","Entrance Wall","Balcony Wall","Kitchen Wall"];
  return <div style={{marginTop:5}}>
    <button onClick={()=>setOpen(v=>!v)}
      style={{background:"transparent",border:"none",padding:"2px 0",cursor:"pointer",
        fontSize:10,color:"#aaa",fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
      {open?"▾":"▸"} Quick Name
    </button>
    {open&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
      {names.map(n=>(
        <button key={n} onClick={()=>onUpdate({...wall,label:n})}
          style={{padding:"5px 10px",borderRadius:20,fontSize:10,fontWeight:600,cursor:"pointer",
            border:`1px solid ${C.border}`,background:"#FAFAFA",color:"#999"}}>
          {n}
        </button>
      ))}
    </div>}
  </div>;
}

function WallEditor({ wall, roomHeight, useRoomHeight, onUpdate }) {
  const [activeSeg, setActiveSeg] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAdvOptions, setShowAdvOptions] = useState(false);
  // Reset to first segment when user switches to a different wall
  useEffect(() => { setActiveSeg(0); }, [wall?.id]);
  // When the room-level toggle is ON, every wall uses roomHeight regardless of any stored override.
  // When OFF, each wall's own wall.height is used (manual per-wall mode).
  const effH = useRoomHeight ? (roomHeight ?? 10) : (wall?.height ?? roomHeight ?? 10);
  const segs = wall?.segments || [];
  const seg = segs[activeSeg] || segs[0];
  const segArea = seg ? calcSegArea(seg, wall, roomHeight) : 0;
  const wallArea = calcWallArea({ ...wall, height: useRoomHeight ? null : wall?.height }, roomHeight);
  const SEG_COLORS = { flat: C.navy, recess: C.blue, projection: C.orange, column: C.teal, beam: C.purple, niche: C.green };
  const needsDepth = seg && ["recess", "projection", "column", "beam", "niche"].includes(seg.kind);
  const hasMultipleSections = segs.length > 1;
  const hasAdvancedShape = segs.some(s => s?.kind !== "flat");
  // Auto-expand advanced view if the room already has non-flat sections (e.g. loaded project)
  useEffect(() => { if (hasMultipleSections || hasAdvancedShape) setShowAdvanced(true); }, [wall?.id]);
  // Auto-expand Advanced Options row if this wall already has openings (loaded project)
  useEffect(() => { if ((segs[0]?.openings || []).length > 0) setShowAdvOptions(true); }, [wall?.id]);

  const upSeg = (idx, patch) => onUpdate({
    ...wall,
    segments: segs.map((s, i) => i === idx ? { ...s, ...patch } : s)
  });
  const addSeg = (kind) => {
    const ns = newSegment(kind);
    onUpdate({ ...wall, segments: [...segs, ns] });
    setActiveSeg(segs.length);
  };
  const remSeg = (idx) => {
    if (segs.length <= 1) return; // always keep at least one segment
    const next = Math.min(activeSeg, segs.length - 2);
    onUpdate({ ...wall, segments: segs.filter((_, i) => i !== idx) });
    setActiveSeg(next);
  };
  const addSegOp = (kind, mode = "deduct") => upSeg(activeSeg, {
    openings: [...(seg?.openings || []), newSegOpening(kind, mode)]
  });
  const upSegOp = (opId, patch) => upSeg(activeSeg, {
    openings: (seg?.openings || []).map(o => o?.id === opId ? { ...o, ...patch } : o)
  });
  const remSegOp = (opId) => upSeg(activeSeg, {
    openings: (seg?.openings || []).filter(o => o?.id !== opId)
  });
  const deductCount = (seg?.openings || []).filter(o => (o?.mode || "deduct") !== "add").length;
  const addCount = (seg?.openings || []).filter(o => o?.mode === "add").length;

  return <div>
    {/* Wall name */}
    <div style={{ marginBottom: 10 }}>
      <span style={LBL}>Wall Name</span>
      <input value={wall?.label || ""} onChange={e => onUpdate({ ...wall, label: e.target.value })}
        style={{ ...INP, fontSize: 13, padding: "8px 10px" }} />
      {/* Quick Name suggestions — de-emphasized, collapsed by default */}
      <RenameSuggestions wall={wall} onUpdate={onUpdate} />
    </div>

    {/* ── SIMPLE MODE: Wall Length × Height = Area ── */}
    {!showAdvanced && seg && <div>
      {useRoomHeight ? (
        <>
          <div style={{ marginBottom: 6 }}>
            <span style={LBL}>Wall Length (ft)</span>
            <NumInp value={seg?.length || seg?.w || seg?.width || 0} onChange={v => upSeg(activeSeg, { length: v })} />
          </div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 12 }}>
            Height used: {effH} ft
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <span style={LBL}>Wall Length (ft)</span>
            <NumInp value={seg?.length || seg?.w || seg?.width || 0} onChange={v => upSeg(activeSeg, { length: v })} />
          </div>
          <div>
            <span style={LBL}>Wall Height (ft)</span>
            <NumInp value={wall?.height ?? roomHeight ?? 10}
              onChange={v => onUpdate({ ...wall, height: v })} />
          </div>
        </div>
      )}

      {/* Area preview */}
      {(!(seg?.length || seg?.w || seg?.width) || (seg?.length || seg?.w || seg?.width) <= 0) ? (
        <div style={{
          background: "#FFF7E6", border: `1px solid ${C.orange}44`, borderRadius: 10,
          padding: "10px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8
        }}>
          <span style={{ fontSize: 16 }}>📏</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#c97a40" }}>Enter wall length first.</div>
            <div style={{ fontSize: 11, color: "#c97a40", opacity: .8, marginTop: 1 }}>Area = Length × Height.</div>
          </div>
        </div>
      ) : (
        <div style={{ background: C.orangeL, borderRadius: 10, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.orange}33` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#c97a40", fontWeight: 700 }}>Area</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.orange }}>{segArea.toFixed(2)} sqft</span>
          </div>
        </div>
      )}

      {/* Advanced Options — collapsed by default, single accordion row wrapping Wall Adjustments + Advanced Wall Shape */}
      {!showAdvOptions ? (
        <button onClick={() => setShowAdvOptions(true)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer",
            border: `1.5px dashed ${C.border}`, background: "transparent", color: C.gray, marginBottom: 8
          }}>
          <span>⚙ Advanced Options</span>
          <span style={{ fontSize: 11, color: "#ccc" }}>
            {(deductCount + addCount) > 0 ? `${deductCount + addCount} added  ▼` : "▼"}
          </span>
        </button>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setShowAdvOptions(false)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 0", border: "none", background: "transparent",
              color: C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 6
            }}>
            ▲ Collapse Advanced Options
          </button>

          <div style={{ fontSize: 10, fontWeight: 700, color: C.gray, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Wall Adjustments</div>

          <div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, marginBottom: 4 }}>− DEDUCT AREA</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {SEG_OPEN_KINDS.map(kind => (
              <button key={kind} onClick={() => addSegOp(kind, "deduct")}
                style={{
                  padding: "9px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${C.red}`, background: C.redL, color: C.red, flexShrink: 0
                }}>
                {kind === "Door" ? "🚪" : kind === "Window" ? "🪟" : kind === "Sliding Door" ? "🛤" : kind === "Arch" ? "🔠" : kind === "Open Space" ? "⬜" : "✏️"} {kind}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, marginBottom: 4 }}>+ ADD AREA</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: (seg?.openings || []).length > 0 ? 10 : 8 }}>
            {SEG_ADD_KINDS.map(kind => (
              <button key={kind} onClick={() => addSegOp(kind, "add")}
                style={{
                  padding: "9px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${C.green}`, background: C.greenL, color: C.green, flexShrink: 0
                }}>
                {kind === "Column" ? "⬛" : kind === "Projection" ? "⬆" : "✏️"} {kind}
              </button>
            ))}
          </div>

          {(seg?.openings || []).map(op => (
            <SegOpCard key={op?.id || Math.random()} op={op}
              onUpdate={patch => upSegOp(op?.id, patch)}
              onRemove={() => remSegOp(op?.id)} />
          ))}

          <div style={{ fontSize: 10, fontWeight: 700, color: C.gray, textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 0 6px" }}>Advanced Wall Shape</div>
          <button onClick={() => setShowAdvanced(true)}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: `1.5px dashed ${C.border}`, background: "transparent", color: C.gray
            }}>
            ⚙ Advanced Wall Shape (recess, projection, column, beam, niche)
          </button>
        </div>
      )}
    </div>}

    {/* ── ADVANCED MODE: full segment system ── */}
    {showAdvanced && <div>
      <button onClick={() => setShowAdvanced(false)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 0", border: "none", background: "transparent",
          color: C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 10
        }}>
        ← Back to simple view
      </button>

      {/* Wall visualiser */}
      <WallViz wall={wall} roomHeight={roomHeight} activeSegIdx={activeSeg} onSegClick={setActiveSeg} />

      {/* Section selector chips */}
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
        {segs.map((sg, idx) => {
          const col = SEG_COLORS[sg?.kind] || C.navy;
          const sel = idx === activeSeg;
          return <button key={sg?.id || idx} onClick={() => setActiveSeg(idx)}
            style={{
              flexShrink: 0, padding: "8px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
              border: `2px solid ${sel ? col : C.border}`, background: sel ? col + "18" : "#F8FAFC", color: sel ? col : C.gray
            }}>
            {sg?.label || SEG_KINDS.find(k => k.id === sg?.kind)?.label || `Section ${idx + 1}`}
            <span style={{ fontSize: 9, color: sel ? col : "#bbb", marginLeft: 4 }}>{calcSegArea(sg, wall, roomHeight).toFixed(1)}sf</span>
          </button>;
        })}
      </div>

      {/* Add section kind buttons */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Add Wall Section</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {SEG_KINDS.map(sk => (
            <button key={sk.id} onClick={() => addSeg(sk.id)}
              style={{
                padding: "8px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${sk.color}`, background: sk.color + "12", color: sk.color
              }}>
              {sk.icon} {sk.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active section editor */}
      {seg && <div style={{
        background: "#F8FAFC", borderRadius: 12, padding: "12px 14px", marginBottom: 10,
        border: `2px solid ${SEG_COLORS[seg?.kind] || C.navy}33`
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{SEG_KINDS.find(s => s.id === seg?.kind)?.icon || "▬"}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: SEG_COLORS[seg?.kind] || C.navy }}>
                {SEG_KINDS.find(s => s.id === seg?.kind)?.label || seg?.kind}
                {seg?.label ? ` · ${seg?.label}` : ""}
              </div>
              <div style={{ fontSize: 10, color: C.gray, marginTop: 1 }}>{SEG_KINDS.find(s => s.id === seg?.kind)?.desc}</div>
            </div>
          </div>
          {segs.length > 1 && <button onClick={() => remSeg(activeSeg)}
            style={{ background: C.redL, border: "none", borderRadius: 8, padding: "6px 12px", color: C.red, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Remove</button>}
        </div>

        {/* Section label */}
        <div style={{ marginBottom: 8 }}>
          <span style={LBL}>Section Label (optional)</span>
          <input value={seg?.label || ""} onChange={e => upSeg(activeSeg, { label: e.target.value })}
            placeholder={seg?.kind === "flat" ? "e.g. Main wall, TV wall..." : "e.g. Bay window recess, Column A..."}
            style={{ ...INP, fontSize: 13, padding: "7px 10px" }} />
        </div>

        {/* Width × Height */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", alignItems: "end", gap: 6, marginBottom: needsDepth ? 8 : 10 }}>
          <div>
            <span style={LBL}>Width (ft)</span>
            <NumInp value={seg?.length || seg?.w || seg?.width || 0} onChange={v => upSeg(activeSeg, { length: v })} />
          </div>
          <div style={{ textAlign: "center", fontSize: 18, color: "#ccc", fontWeight: 700, paddingBottom: 10 }}>×</div>
          <div>
            <span style={LBL}>Height (ft)</span>
            <NumInp value={seg?.height ?? seg?.h ?? ""} placeholder={`${effH} (wall default)`}
              onChange={v => upSeg(activeSeg, { height: v || null })} />
          </div>
        </div>

        {/* Width=0 helper, even in advanced mode */}
        {(!(seg?.length || seg?.w || seg?.width) || (seg?.length || seg?.w || seg?.width) <= 0) && <div style={{
          background: "#FFF7E6", border: `1px solid ${C.orange}44`, borderRadius: 10,
          padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "#c97a40", fontWeight: 600
        }}>
          📏 Enter wall length first. Area = Length × Height.
        </div>}

        {/* Depth — only for non-flat kinds, with contextual label */}
        {needsDepth && <div style={{ marginBottom: 10 }}>
          <span style={LBL}>
            {seg?.kind === "recess" ? "How far in (ft) — side walls will be added" :
              seg?.kind === "projection" ? "How far out (ft) — side walls will be added" :
                seg?.kind === "beam" ? "Face drop (ft) — height of visible beam face" :
                  seg?.kind === "niche" ? "How deep (ft) — sides and back will be added" :
                    "Depth (ft)"}
          </span>
          <NumInp value={seg?.depth || 0} onChange={v => upSeg(activeSeg, { depth: v })} />
        </div>}

        {/* Area chip */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: (SEG_COLORS[seg?.kind] || C.navy) + "12", borderRadius: 8, padding: "7px 12px", marginBottom: 12
        }}>
          <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>
            {seg?.w || seg?.width || 0}ft × {seg?.h ?? effH}ft
            {(seg?.depth || 0) > 0 ? ` + ${seg?.depth}ft depth` : ""}
            {(seg?.openings || []).length > 0 ? ` − ${(seg?.openings || []).length} opening(s)` : ""}
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: SEG_COLORS[seg?.kind] || C.navy }}>{segArea.toFixed(2)} sf</span>
        </div>

        {/* Per-section openings */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.gray, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Openings on this section</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: (seg?.openings || []).length > 0 ? 10 : 0 }}>
            {SEG_OPEN_KINDS.map(kind => (
              <button key={kind} onClick={() => addSegOp(kind)}
                style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${C.red}`, background: C.redL, color: C.red
                }}>
                {kind === "Door" ? "🚪" : kind === "Window" ? "🪟" : kind === "Sliding Door" ? "🛤" : kind === "Arch" ? "🔠" : "✏️"} {kind} −
              </button>
            ))}
          </div>
          {(seg?.openings || []).map(op => (
            <SegOpCard key={op?.id || Math.random()} op={op}
              onUpdate={patch => upSegOp(op?.id, patch)}
              onRemove={() => remSegOp(op?.id)} />
          ))}
        </div>
      </div>}
    </div>}
  </div>;
}

function DimRow({wVal,hVal,onW,onH,wLabel="WIDTH (ft)",hLabel="HEIGHT (ft)"}) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 28px 1fr",alignItems:"end",gap:6,marginBottom:8}}>
      <div><span style={LBL}>{wLabel}</span><NumInp value={wVal} onChange={onW}/></div>
      <div style={{textAlign:"center",fontSize:18,color:"#ccc",fontWeight:700,paddingBottom:10}}>×</div>
      <div><span style={LBL}>{hLabel}</span><NumInp value={hVal} onChange={onH}/></div>
    </div>
  );
}

function SecHead({sec,isOpen,onToggle}) {
  return (
    <button onClick={()=>{ if(!isOpen) onToggle(sec.id); }}
      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"14px 16px",
        background:isOpen?C.orangeL:C.white,border:"none",cursor:"pointer",
        borderBottom:isOpen?`1px solid ${C.orange}22`:"none",textAlign:"left"}}>
      <span style={{fontSize:20,flexShrink:0}}>{sec.icon}</span>
      <span style={{flex:1,fontSize:14,fontWeight:800,color:isOpen?C.orange:C.navy}}>{sec.label}</span>
      <span style={{fontSize:11,fontWeight:700,color:sec.badgeColor,background:sec.badgeColor+"18",
        borderRadius:20,padding:"3px 10px",flexShrink:0}}>{sec.badge}</span>
      <span style={{fontSize:11,color:isOpen?C.orange:"#ccc",flexShrink:0,marginLeft:4}}>{isOpen?"▲":"▼"}</span>
    </button>
  );
}

function OpCard({op,upOp,remOp}) {
  const isDeduct=op.mode!=="add";
  const area=(op.w||0)*(op.h||0)*(op.count||1);
  const kindIcon=op.kind==="Door"?"🚪":op.kind==="Window"?"🪟":op.kind==="Grill"?"🔲":op.kind==="Frame"?"🖼":"✏️";
  const accent=isDeduct?C.red:C.green;
  const accentL=isDeduct?C.redL:C.greenL;
  return <div style={{background:"#FAFAFA",borderRadius:12,padding:"14px",marginBottom:8,
    border:`2px solid ${accent}33`,position:"relative"}}>
    {/* Header row */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:20}}>{kindIcon}</span>
        <input value={op.label} onChange={e=>upOp(op.id,"label",e.target.value)}
          style={{fontSize:13,fontWeight:700,color:C.navy,border:`1.5px solid ${C.border}`,
            borderRadius:8,padding:"6px 10px",background:C.white,outline:"none",
            width:120,minWidth:0}}/>
        <span style={{fontSize:10,fontWeight:800,borderRadius:20,padding:"3px 10px",
          background:accentL,color:accent,flexShrink:0}}>
          {isDeduct?"− DEDUCT":"+ ADD"}
        </span>
      </div>
      <button onClick={()=>remOp(op.id)}
        style={{background:C.redL,border:"none",borderRadius:8,padding:"6px 10px",
          color:C.red,cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0}}>✕</button>
    </div>
    {/* W × H × QTY row */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 18px 1fr 1fr",alignItems:"end",gap:8,marginBottom:10}}>
      <div>
        <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:4}}>WIDTH (ft)</div>
        <NumInp small value={op.w} onChange={v=>upOp(op.id,"w",v)}/>
      </div>
      <div style={{textAlign:"center",fontSize:16,color:"#ccc",fontWeight:700,paddingBottom:9}}>×</div>
      <div>
        <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:4}}>HEIGHT (ft)</div>
        <NumInp small value={op.h} onChange={v=>upOp(op.id,"h",v)}/>
      </div>
      <div>
        <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:4}}>QTY</div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>upOp(op.id,"count",Math.max(1,(op.count||1)-1))}
            style={{width:32,height:38,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:18,fontWeight:700,color:C.red}}>−</button>
          <span style={{fontSize:16,fontWeight:800,minWidth:22,textAlign:"center",color:C.navy}}>{op.count||1}</span>
          <button onClick={()=>upOp(op.id,"count",(op.count||1)+1)}
            style={{width:32,height:38,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:18,fontWeight:700,color:C.green}}>+</button>
        </div>
      </div>
    </div>
    {/* Auto area chip */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      background:accentL,borderRadius:8,padding:"7px 12px",marginBottom:10}}>
      <span style={{fontSize:11,color:accent,fontWeight:600}}>
        {(op.w||0).toFixed(1)} × {(op.h||0).toFixed(1)} × {op.count||1}
      </span>
      <span style={{fontSize:14,fontWeight:800,color:accent}}>
        {isDeduct?"−":"+"}{area.toFixed(2)} sf
      </span>
    </div>
    {/* Notes (optional) */}
    <div>
      <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:4}}>NOTES (optional)</div>
      <textarea value={op.notes||""} onChange={e=>upOp(op.id,"notes",e.target.value)}
        placeholder="e.g. Bay window, arched top, tinted glass..."
        rows={2}
        style={{width:"100%",fontSize:12,color:C.navy,border:`1px solid ${C.border}`,
          borderRadius:8,padding:"7px 10px",background:C.white,outline:"none",
          resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
    </div>
  </div>;
}

// ─── POLISH / ENAMEL MODULE ───────────────────────────────────────────────────
const POLISH_ITEM_CATEGORIES = ["Door","Window","Furniture","Wardrobe","Other Woodwork","Window Grill","Safety Grill","Railing","Gate","Rolling Shutter","Metal Frame","Custom Item"];
const POLISH_PACKAGES = {
  economy:      { id:"economy",      label:"Economy",      icon:"🌿", color:C.green,  colorL:C.greenL,  defRate:25,  defLabour:12 },
  premium:      { id:"premium",      label:"Premium",      icon:"💎", color:C.blue,   colorL:C.blueL,   defRate:45,  defLabour:18 },
  luxury:       { id:"luxury",       label:"Luxury",       icon:"👑", color:C.purple, colorL:C.purpleL, defRate:70,  defLabour:25 },
  ultra_luxury: { id:"ultra_luxury", label:"Ultra Luxury", icon:"✨", color:C.gold,   colorL:C.goldL,   defRate:95,  defLabour:35 },
};

const POLISH_BRANDS = [
  {id:"asian_paints",  label:"Asian Paints"},
  {id:"berger",        label:"Berger Paints"},
  {id:"nerolac",       label:"Kansai Nerolac"},
  {id:"indigo",        label:"Indigo Paints"},
  {id:"jsw",           label:"JSW Paints"},
  {id:"shalimar",      label:"Shalimar Paints"},
  {id:"birla_opus",    label:"Birla Opus"},
  {id:"nippon",        label:"Nippon Paint"},
  {id:"dulux",         label:"Dulux"},
  {id:"jotun",         label:"Jotun"},
  {id:"other",         label:"Other Brand"},
];

// Product → Rate mapping (keyed by package tier encoded in the product name)
const POLISH_PRODUCT_RATES = {
  economy:      { material:25, labour:12 },
  premium:      { material:45, labour:18 },
  luxury:       { material:70, labour:25 },
  ultra_luxury: { material:95, labour:35 },
};
// Product names per package tier are placeholders until the real product
// catalog (per Finish Type × Brand × Package) is supplied.
function getPolishProducts(finishId, brandId) {
  return [
    {package:"economy",      name:"Economy Product"},
    {package:"premium",      name:"Premium Product"},
    {package:"luxury",       name:"Luxury Product"},
    {package:"ultra_luxury", name:"Ultra Luxury Product"},
  ];
}

const POLISH_FINISH_TYPES = [
  // legacy — id/label/rate untouched from before consolidation; no canonical equivalent exists
  // (superseded by Synthetic Enamel / High-Gloss Enamel below), kept only for old saved items
  {id:"enamel",     label:"Enamel Paint",    icon:"🛢", defRate:25,  defLabour:12, legacy:true, groups:[]},
  {id:"texture_finish",   label:"Texture Finish",   icon:"🧱", defRate:0, defLabour:0, legacy:true, groups:[]},
  {id:"wallpaper_finish", label:"Wallpaper Finish", icon:"🖼", defRate:0, defLabour:0, legacy:true, groups:[]},
  // PAINT & ENAMEL
  {id:"oil_paint",        label:"Oil Paint",               groups:["PAINT & ENAMEL"],        icon:"🛢", defRate:0,  defLabour:0},
  {id:"water_based",      label:"Water-Based Paint",       groups:["PAINT & ENAMEL"],        icon:"🎨", defRate:0,  defLabour:0},
  {id:"synthetic_enamel", label:"Synthetic Enamel",        groups:["PAINT & ENAMEL"],        icon:"🛢", defRate:0,  defLabour:0},
  {id:"high_gloss_enamel",label:"High-Gloss Enamel",       groups:["PAINT & ENAMEL"],        icon:"✨", defRate:0,  defLabour:0},
  {id:"pu_paint",         label:"PU Paint",                groups:["PAINT & ENAMEL"],        icon:"💎", defRate:0,  defLabour:0},
  {id:"duco",             label:"Duco Paint",              groups:["PAINT & ENAMEL"],        icon:"🎨", defRate:55, defLabour:25},
  {id:"metal_primer_enamel", label:"Metal Primer + Enamel", groups:["PAINT & ENAMEL"],       icon:"🔩", defRate:0,  defLabour:0},
  // POLISH & CLEAR FINISH
  {id:"melamine",         label:"Melamine Polish",         groups:["POLISH & CLEAR FINISH"], icon:"✨", defRate:35, defLabour:18},
  {id:"pu",               label:"PU Polish",               groups:["POLISH & CLEAR FINISH"], icon:"💎", defRate:45, defLabour:22},
  {id:"nc_polish",        label:"NC Polish",               groups:["POLISH & CLEAR FINISH"], icon:"💅", defRate:0,  defLabour:0},
  {id:"french_polish",    label:"French Polish",           groups:["POLISH & CLEAR FINISH"], icon:"🎻", defRate:0,  defLabour:0},
  {id:"wood_stain",       label:"Wood Stain",              groups:["POLISH & CLEAR FINISH"], icon:"🪵", defRate:20, defLabour:10},
  {id:"clear_varnish",    label:"Clear Varnish",           groups:["POLISH & CLEAR FINISH"], icon:"🧴", defRate:0,  defLabour:0},
  {id:"poly_clear_coat",  label:"Polyurethane Clear Coat", groups:["POLISH & CLEAR FINISH"], icon:"🧴", defRate:0,  defLabour:0},
  // shared
  {id:"custom",     label:"Custom Finish",   groups:["PAINT & ENAMEL","POLISH & CLEAR FINISH"], icon:"✏️", defRate:0, defLabour:0 },
];
const POLISH_FINISH_GROUPS = ["PAINT & ENAMEL", "POLISH & CLEAR FINISH"];
const POLISH_ADDITION_KINDS  = ["Extra Frame","Side Panel","Additional Surface","Custom Area"];
const POLISH_DEDUCTION_KINDS = ["Glass Portion","Mirror Portion","Open Area","Cutout","Custom Deduction"];

function newPolishAdj(kind, mode="add") {
  return { id:uid(), kind, mode, label:kind, l:0, h:0, qty:1 };
}
function newPolishItem(category="Door") {
  const defaultId = joineryDefaultFinishIdFor(category);
  const fin = POLISH_FINISH_TYPES.find(f=>f.id===defaultId) || POLISH_FINISH_TYPES.find(f=>f.id==="melamine");
  return {
    id:uid(), category, label:"", finishId:fin.id,
    l:0, h:0, qty:1, notes:"",
    rate:fin.defRate, labourRate:fin.defLabour,
    additions:[], deductions:[],
    floorIndex: 0,
  };
}
function defPolish() { return []; }

// calcPolish: standalone, no dependency on calcNet/calcRoom/exterior
// gross = l × h × qty
// net   = gross + Σ(additions l×h×qty) − Σ(deductions l×h×qty)
// mat   = net × rate
// lab   = net × labourRate
// total = mat + lab
function calcPolishItem(item) {
  const gross = (item.l||0) * (item.h||0) * (item.qty||1);
  const addA  = (item.additions||[]).reduce((s,a)=>(s+(a.l||0)*(a.h||0)*(a.qty||1)),0);
  const dedA  = (item.deductions||[]).reduce((s,d)=>(s+(d.l||0)*(d.h||0)*(d.qty||1)),0);
  const net   = Math.max(0, gross + addA - dedA);
  const mat   = net * (item.rate||0);
  const lab   = net * (item.labourRate||0);
  return { gross, addA, dedA, net, mat, lab, total: mat+lab };
}
function calcPolish(polishItems=[]) {
  return polishItems.reduce((acc,item)=>{
    const c = calcPolishItem(item);
    return { net:acc.net+c.net, mat:acc.mat+c.mat, lab:acc.lab+c.lab, total:acc.total+c.total };
  }, {net:0,mat:0,lab:0,total:0});
}

// ─── MATERIAL CONSUMPTION (display-only, does not affect mat/lab/total above) ──
const POLISH_CONSUMPTION_DEFAULTS = {
  enamel:     {coverage:60, coats:2, wastage:10, packSize:1, ratePerL:300},
  melamine:   {coverage:70, coats:2, wastage:10, packSize:1, ratePerL:450},
  pu:         {coverage:75, coats:2, wastage:10, packSize:1, ratePerL:550},
  duco:       {coverage:55, coats:2, wastage:12, packSize:1, ratePerL:600},
  wood_stain: {coverage:90, coats:1, wastage:8,  packSize:1, ratePerL:350},
  custom:     {coverage:70, coats:1, wastage:10, packSize:1, ratePerL:0},
};
function calcPolishConsumption(item) {
  const net = calcPolishItem(item).net;
  const cons = item.consumption || POLISH_CONSUMPTION_DEFAULTS[item.finishId] || POLISH_CONSUMPTION_DEFAULTS.enamel;
  const litres = (cons.coverage>0) ? (net * (cons.coats||0)) / cons.coverage : 0;
  const litresWithWaste = litres * (1 + (cons.wastage||0)/100);
  const packs = (cons.packSize>0) ? Math.ceil(litresWithWaste / cons.packSize) : 0;
  const consumptionCost = litresWithWaste * (cons.ratePerL||0);
  return { ...cons, litres, litresWithWaste, packs, consumptionCost };
}


// ─── POLISH / ENAMEL MODULE UI ────────────────────────────────────────────────
function PolishAdjCard({ adj, onUpdate, onRemove }) {
  const isAdd = adj.mode === "add";
  const accent = isAdd ? C.green : C.red;
  const accentL = isAdd ? C.greenL : C.redL;
  const area = (adj.l||0)*(adj.h||0)*(adj.qty||1);
  return <div style={{background:accentL,borderRadius:10,padding:"10px 12px",marginBottom:6,border:`1.5px solid ${accent}33`}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
      <span style={{fontSize:11,fontWeight:800,color:accent,background:"#fff",borderRadius:20,padding:"2px 8px",border:`1px solid ${accent}33`,flexShrink:0}}>{isAdd?"+ ADD":"− DED"}</span>
      <input value={adj.label||""} onChange={e=>onUpdate({...adj,label:e.target.value})}
        style={{flex:1,fontSize:11,fontWeight:700,color:C.navy,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 8px",background:C.white,outline:"none"}}/>
      <span style={{fontSize:11,fontWeight:700,color:accent,flexShrink:0}}>{isAdd?"+":"−"}{area.toFixed(2)} sf</span>
      <button onClick={onRemove} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,fontWeight:800,padding:"0 4px",flexShrink:0}}>✕</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 16px 1fr 80px",alignItems:"end",gap:6}}>
      <div><div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:3}}>L (ft)</div><NumInp small value={adj.l} onChange={v=>onUpdate({...adj,l:v})}/></div>
      <div style={{textAlign:"center",fontSize:15,color:"#ccc",fontWeight:700,paddingBottom:7}}>×</div>
      <div><div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:3}}>H (ft)</div><NumInp small value={adj.h} onChange={v=>onUpdate({...adj,h:v})}/></div>
      <div><div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:3}}>QTY</div>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <button onClick={()=>onUpdate({...adj,qty:Math.max(1,(adj.qty||1)-1)})} style={{width:28,height:34,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.red}}>−</button>
          <span style={{fontSize:13,fontWeight:800,minWidth:18,textAlign:"center",color:C.navy}}>{adj.qty||1}</span>
          <button onClick={()=>onUpdate({...adj,qty:(adj.qty||1)+1})} style={{width:28,height:34,borderRadius:7,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.green}}>+</button>
        </div>
      </div>
    </div>
  </div>;
}

function PolishItemCard({ item, onUpdate, onRemove, isExpanded, onOpen, floors }) {
  const [openPanel, setOpenPanel] = useState(null); // null | "advanced" | "adjustments" | "consumption" — only one open at a time, per item
  const togglePanel = key => setOpenPanel(p => p===key ? null : key);
  const fin = POLISH_FINISH_TYPES.find(f=>f.id===item.finishId)||POLISH_FINISH_TYPES[0];
  const c = calcPolishItem(item);
  const purpleL = "#F5F3FF";
  const catIcon = (typeof DW2_ITEM_ICONS!=="undefined" && DW2_ITEM_ICONS[item.category]) || "🔧";

  // Compact bordered collapsible-panel header, shared visual system for all three panels
  function PanelHeader({ title, subtitle, badge, panelKey }) {
    const open = openPanel===panelKey;
    return <button onClick={()=>togglePanel(panelKey)}
      style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
        padding:"10px 12px",borderRadius:12,cursor:"pointer",textAlign:"left",marginTop:8,
        border:`1.5px solid ${C.border}`,background:C.white}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:12,fontWeight:800,color:C.navy}}>{title}</div>
        <div style={{fontSize:10,color:"#aaa",marginTop:1}}>{subtitle}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <span style={{fontSize:10,fontWeight:700,color:C.gray,background:"#F1F5F9",borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{badge}</span>
        <span style={{fontSize:11,color:"#aaa"}}>{open?"▲":"▼"}</span>
      </div>
    </button>;
  }

  const addAdj = (kind,mode) => onUpdate({...item,
    additions: mode==="add" ? [...(item.additions||[]), newPolishAdj(kind,"add")] : (item.additions||[]),
    deductions: mode==="deduct" ? [...(item.deductions||[]), newPolishAdj(kind,"deduct")] : (item.deductions||[]),
  });
  const upAdj = (mode,id,patch) => onUpdate({...item,
    additions: mode==="add" ? (item.additions||[]).map(a=>a.id===id?{...a,...patch}:a) : (item.additions||[]),
    deductions: mode==="deduct" ? (item.deductions||[]).map(a=>a.id===id?{...a,...patch}:a) : (item.deductions||[]),
  });
  const remAdj = (mode,id) => onUpdate({...item,
    additions: mode==="add" ? (item.additions||[]).filter(a=>a.id!==id) : (item.additions||[]),
    deductions: mode==="deduct" ? (item.deductions||[]).filter(a=>a.id!==id) : (item.deductions||[]),
  });

  return <div style={{background:"#FAFAFA",borderRadius:12,marginBottom:10,border:`2px solid ${C.border}`,overflow:"hidden"}}>
    {/* Compact accordion header — always visible */}
    <button onClick={onOpen}
      style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
        padding:"12px 14px",cursor:"pointer",border:"none",background:C.white,textAlign:"left"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <span style={{fontSize:16,flexShrink:0}}>{catIcon}</span>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:C.navy}}>{item.category||"Item"}</div>
          {item.label && <div style={{fontSize:11,color:"#aaa",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label}</div>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.gray}}>{c.net.toFixed(1)} sf</div>
          <div style={{fontSize:13,fontWeight:800,color:"#7C3AED"}}>₹{c.total.toFixed(0)}</div>
        </div>
        <span style={{fontSize:11,color:"#aaa"}}>{isExpanded?"▲":"▼"}</span>
        <button onClick={e=>{e.stopPropagation(); onRemove();}}
          style={{background:C.redL,border:"none",borderRadius:12,padding:"5px 10px",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>
          Remove
        </button>
      </div>
    </button>

    {isExpanded && <div style={{padding:"12px 14px 14px",borderTop:`1px solid ${C.border}`}}>
    {/* Floor selector, Category select, Label, Length×Height×Qty and the
        Area+cost preview card are intentionally not rendered here — they
        duplicate the Items & Measurement workflow. The underlying fields
        (item.floorIndex, item.category, item.label, item.l/h/qty) and every
        calculation that reads them (c = calcPolishItem(item) above, and the
        collapsed header's sf/₹ summary) are untouched — UI hidden only. */}

    {/* Finish chips */}
    <div style={{marginBottom:10}}>
      <span style={LBL}>Finish Type</span>
      {POLISH_FINISH_GROUPS.filter(grp=>joineryVisibleGroupsFor(item.category).includes(grp)).map(grp=>(
        <div key={grp} style={{marginTop:6}}>
          <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:"0.05em",marginBottom:3}}>{grp}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {POLISH_FINISH_TYPES.filter(f=>(f.groups||[]).includes(grp)).map(f=>{
              const sel = item.finishId===f.id;
              return <button key={grp+"_"+f.id}
                onClick={()=>{
                  const hasConfiguredRate = (f.defRate>0) || (f.defLabour>0);
                  onUpdate({...item,finishId:f.id,brand:"",product:"",
                    ...(hasConfiguredRate ? {rate:f.defRate,labourRate:f.defLabour} : {})});
                }}
                style={{padding:"6px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
                  border:`2px solid ${sel?"#7C3AED":C.border}`,
                  background:sel?purpleL:"#F8FAFC",color:sel?"#7C3AED":C.gray,flexShrink:0}}>
                {f.icon} {f.label}
              </button>;
            })}
          </div>
        </div>
      ))}
      {/* Legacy finish — only surfaces if this item already has it; disappears once changed to a modern option */}
      {POLISH_FINISH_TYPES.filter(f=>f.legacy && item.finishId===f.id).map(f=>(
        <div key={f.id} style={{marginTop:6}}>
          <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:"0.05em",marginBottom:3}}>LEGACY</div>
          <button
            style={{padding:"6px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"default",
              border:`2px solid #7C3AED`,background:purpleL,color:"#7C3AED"}}>
            {f.icon} {f.label} (Legacy)
          </button>
        </div>
      ))}
    </div>

    {/* Rates */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
      <div><span style={LBL}>Material Rate (₹/sf)</span><NumInp small prefix="₹" value={item.rate} onChange={v=>onUpdate({...item,rate:v})}/></div>
      <div><span style={LBL}>Labour Rate (₹/sf)</span><NumInp small prefix="₹" value={item.labourRate} onChange={v=>onUpdate({...item,labourRate:v})}/></div>
    </div>
    {(Number(item.rate)||0)===0 && (Number(item.labourRate)||0)===0 && (
      <div style={{background:"#FFF7ED",border:"1px solid #FDBA74",borderRadius:12,padding:"6px 10px",marginBottom:10,fontSize:11,color:"#c2610a",fontWeight:600}}>
        ⚠ Rate not configured — enter material and labour rates.
      </div>
    )}

    {/* Area + cost preview card intentionally not rendered — duplicated the
        Measurement workflow. calcPolishItem(item) above (c) is untouched and
        still drives the collapsed header's sf/₹ summary. */}

    {/* E. Advanced Finishing Options — Package, Brand, Product, Notes */}
    {(()=>{
      const pkgObj = item.package ? POLISH_PACKAGES[item.package] : null;
      const brandObj = item.brand ? POLISH_BRANDS.find(b=>b.id===item.brand) : null;
      const advBadge = [pkgObj?pkgObj.label:"Not configured", brandObj?brandObj.label:"Not configured", item.product||"Not configured"].join(" · ");
      const productList = getPolishProducts(item.finishId, item.brand);
      return <>
        <PanelHeader title="Advanced Finishing Options" subtitle="Package, brand, product and notes" badge={advBadge} panelKey="advanced"/>
        {openPanel==="advanced"&&<div style={{marginTop:8}}>
          <div style={{marginBottom:10}}>
            <span style={LBL}>Package</span>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {Object.values(POLISH_PACKAGES).map(pk=>{
                const sel = item.package===pk.id;
                return <button key={pk.id}
                  onClick={()=>onUpdate({...item,package:pk.id,rate:pk.defRate,labourRate:pk.defLabour,product:(getPolishProducts(item.finishId,item.brand).find(p=>p.package===pk.id)||{}).name||item.product})}
                  style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`2px solid ${sel?pk.color:C.border}`,
                    background:sel?pk.colorL:"#F8FAFC",
                    color:sel?pk.color:C.gray,transition:"all 0.15s",
                    display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:12}}>{pk.icon}</span>{pk.label}
                </button>;
              })}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <DropSel label="Brand" value={item.brand||""}
              onChange={v=>onUpdate({...item,brand:v,product:""})}
              options={[{value:"",label:"Select Brand"},...POLISH_BRANDS.map(b=>({value:b.id,label:b.label}))]}/>
            <DropSel label="Product" value={item.product||""}
              onChange={v=>{
                const picked = productList.find(p=>p.name===v);
                const rates = picked ? POLISH_PRODUCT_RATES[picked.package] : null;
                onUpdate({...item,product:v,...(rates?{rate:rates.material,labourRate:rates.labour}:{})});
              }}
              options={[{value:"",label:"Select Product"},...productList.map(p=>({value:p.name,label:p.name}))]}/>
          </div>
          {/* Notes field intentionally not rendered — duplicated UI. item.notes
              and its onUpdate path stay in the data model, untouched. */}
        </div>}
      </>;
    })()}

    {/* F. Adjustments */}
    <PanelHeader title="Adjustments" subtitle="Additions and deductions"
      badge={`${(item.additions||[]).length} additions · ${(item.deductions||[]).length} deductions`} panelKey="adjustments"/>
    {openPanel==="adjustments"&&<div style={{marginTop:8}}>
      <div style={{fontSize:9,color:"#aaa",fontWeight:700,textTransform:"uppercase",marginBottom:4,marginTop:4}}>+ Add Area</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
        {POLISH_ADDITION_KINDS.map(kind=>(
          <button key={kind} onClick={()=>addAdj(kind,"add")}
            style={{padding:"7px 10px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
              border:`1.5px solid ${C.green}`,background:C.greenL,color:C.green,flexShrink:0}}>+ {kind}</button>
        ))}
      </div>
      {(item.additions||[]).map(a=>(
        <PolishAdjCard key={a.id} adj={a} onUpdate={p=>upAdj("add",a.id,p)} onRemove={()=>remAdj("add",a.id)}/>
      ))}
      <div style={{fontSize:9,color:"#aaa",fontWeight:700,textTransform:"uppercase",marginBottom:4,marginTop:8}}>− Deduct Area</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
        {POLISH_DEDUCTION_KINDS.map(kind=>(
          <button key={kind} onClick={()=>addAdj(kind,"deduct")}
            style={{padding:"7px 10px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
              border:`1.5px solid ${C.red}`,background:C.redL,color:C.red,flexShrink:0}}>− {kind}</button>
        ))}
      </div>
      {(item.deductions||[]).map(d=>(
        <PolishAdjCard key={d.id} adj={d} onUpdate={p=>upAdj("deduct",d.id,p)} onRemove={()=>remAdj("deduct",d.id)}/>
      ))}
    </div>}

    {/* G. Material Consumption (display-only) */}
    {(()=>{
      const hasCons = !!item.consumption;
      const cc = calcPolishConsumption(item);
      const consBadge = hasCons ? `${cc.litresWithWaste.toFixed(1)} L · ${cc.packs} packs` : "Off";
      return <>
        <PanelHeader title="Material Consumption" subtitle="Coverage, wastage and pack estimate" badge={consBadge} panelKey="consumption"/>
        {openPanel==="consumption"&&(()=>{
          const cons = item.consumption || POLISH_CONSUMPTION_DEFAULTS[item.finishId] || POLISH_CONSUMPTION_DEFAULTS.enamel;
          const setCons = patch => onUpdate({...item, consumption:{...cons, ...patch}});
          return <div style={{marginTop:8}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
              <div><span style={LBL}>Coats</span><NumInp small value={cons.coats} onChange={v=>setCons({coats:v})}/></div>
              <div><span style={LBL}>Coverage (sqft/L)</span><NumInp small value={cons.coverage} onChange={v=>setCons({coverage:v})}/></div>
              <div><span style={LBL}>Wastage %</span><NumInp small value={cons.wastage} onChange={v=>setCons({wastage:v})}/></div>
              <div><span style={LBL}>Pack Size (L)</span><NumInp small value={cons.packSize} onChange={v=>setCons({packSize:v})}/></div>
              <div><span style={LBL}>Rate per Litre (₹)</span><NumInp small prefix="₹" value={cons.ratePerL} onChange={v=>setCons({ratePerL:v})}/></div>
            </div>
            <div style={{background:purpleL,borderRadius:12,padding:"10px 14px",border:"1px solid #DDD6FE"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[["Total Litres",`${cc.litres.toFixed(2)} L`],["Litres w/ Wastage",`${cc.litresWithWaste.toFixed(2)} L`],["Packs Required",`${cc.packs}`],["Consumption Cost",`₹${cc.consumptionCost.toFixed(0)}`]].map(([l,v])=>(
                  <div key={l} style={{background:"rgba(124,58,237,0.08)",borderRadius:12,padding:"5px 8px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#7C3AED",fontWeight:700}}>{l}</div>
                    <div style={{fontSize:12,fontWeight:800,color:"#7C3AED"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>;
        })()}
      </>;
    })()}
    </div>}
  </div>;
}

// ─── DOOR & WINDOW MODULE (integrated from DoorWindowModule.jsx) ─────────────
const DW2_ITEM_TYPES = [
  "Door", "Window", "Furniture", "Wardrobe", "Other Woodwork",
  "Window Grill", "Safety Grill", "Railing", "Gate", "Rolling Shutter",
  "Metal Frame", "Custom Item",
];
// Legacy values from before the category expansion — kept selectable ONLY for items that
// already have one of these saved, so old data stays valid without polluting the picker for new items.
const DW2_LEGACY_ITEM_TYPES = ["Sliding Door", "Grill", "Frame", "Custom"];
const DW2_ITEM_ICONS = {
  "Door":"🚪", "Window":"🪟", "Furniture":"🪑", "Wardrobe":"🗄️",
  "Other Woodwork":"🪵", "Window Grill":"🔲", "Safety Grill":"🛡️",
  "Railing":"⛓️", "Gate":"🚧", "Rolling Shutter":"🎛️",
  "Metal Frame":"🖼️", "Custom Item":"✨",
  "Sliding Door":"🚪", "Grill":"🔲", "Frame":"🖼️", "Custom":"✨",
};
const DW2_ITEM_PLACEHOLDERS = {
  "Door":"e.g. Main Door", "Window":"e.g. Living Room Window", "Furniture":"e.g. TV Unit",
  "Wardrobe":"e.g. Master Bedroom Wardrobe", "Other Woodwork":"e.g. Wall Panelling",
  "Window Grill":"e.g. Window Grill", "Safety Grill":"e.g. Safety Grill",
  "Railing":"e.g. Staircase Railing", "Gate":"e.g. Main Entrance Gate",
  "Rolling Shutter":"e.g. Shop Front Shutter", "Metal Frame":"e.g. MS Window Frame",
  "Custom Item":"e.g. Custom Joinery Item",
  "Sliding Door":"e.g. Balcony Sliding Door", "Grill":"e.g. Window Grill",
  "Frame":"e.g. MS Window Frame", "Custom":"e.g. Custom Joinery Item",
};

// PAINT-JOINERY-ITEM-IMAGE (item preview sprite) — crops a real product photo
// out of the shared public/item-card-image's.png sprite sheet (5 cols x 3 rows)
// per item type, in place of the emoji placeholders. Purely visual: no effect
// on itemType values, calculations, or persisted data. Falls back to the
// existing emoji (DW2_ITEM_ICONS) for types with no photographed tile
// (e.g. Custom Item).
const ITEM_IMAGE_SPRITE = "/item-card-image's.png";
const ITEM_IMAGE_GRID = { cols: 5, rows: 3 };
const ITEM_IMAGE_MAP = {
  // Row 0 (Wood Items)
  "Door":                  { col: 0, row: 0 },
  "Window":                { col: 1, row: 0 },
  "Furniture":             { col: 2, row: 0 },
  "Wardrobe":              { col: 3, row: 0 },
  "Railing/Stairs":        { col: 4, row: 0 },
  "Other Woodwork":        { col: 4, row: 0 },
  // Row 1 (Metal Items)
  "Window Grill":          { col: 0, row: 1 },
  "Safety Grill":          { col: 1, row: 1 },
  "Railing":               { col: 2, row: 1 },
  "Gate":                  { col: 3, row: 1 },
  "Rolling Shutter":       { col: 4, row: 1 },
  // Row 2 (Joinery/Frames)
  "Metal Frame":           { col: 0, row: 2 },
  "Structural Framework": { col: 0, row: 2 },
  // Legacy type aliases — reuse the equivalent current tile
  "Sliding Door":          { col: 0, row: 0 },
  "Grill":                 { col: 0, row: 1 },
  "Frame":                 { col: 0, row: 2 },
};
function ItemPreviewImage({ itemType, size=64, radius=12, fallback }) {
  const m = ITEM_IMAGE_MAP[itemType];
  if (!m || m.col === undefined || m.row === undefined) return <span style={{fontSize:Math.round(size*0.5)}}>{fallback}</span>;
  const inset = 2;
  const contentSize = size - inset * 2;
  const tileWidth = contentSize;
  const tileHeight = contentSize;
  const bgW = ITEM_IMAGE_GRID.cols * tileWidth;
  const bgH = ITEM_IMAGE_GRID.rows * tileHeight;
  const bgX = -(m.col * tileWidth);
  const bgY = -(m.row * tileHeight);
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0,
      padding: `${inset}px`, boxSizing: "border-box"
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: Math.max(0, radius - inset), overflow: "hidden",
        backgroundImage: `url("${ITEM_IMAGE_SPRITE}")`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundRepeat: "no-repeat",
        backgroundOrigin: "content-box"
      }} />
    </div>
  );
}

const DW2_FINISH_TYPES = [
  // PAINT & ENAMEL
  { id: "oil_paint", label: "Oil Paint", groups: ["PAINT & ENAMEL"], defMat: 25, defLabour: 15 },
  { id: "water_based", label: "Water-Based Paint", groups: ["PAINT & ENAMEL"], defMat: 18, defLabour: 12 },
  { id: "synthetic_enamel", label: "Synthetic Enamel", groups: ["PAINT & ENAMEL"], defMat: 0, defLabour: 0 },
  { id: "high_gloss_enamel", label: "High-Gloss Enamel", groups: ["PAINT & ENAMEL"], defMat: 0, defLabour: 0 },
  { id: "pu_paint", label: "PU Paint", groups: ["PAINT & ENAMEL"], defMat: 55, defLabour: 25 },
  { id: "duco_paint", label: "Duco Paint", groups: ["PAINT & ENAMEL"], defMat: 60, defLabour: 30 },
  { id: "metal_primer_enamel", label: "Metal Primer + Enamel", groups: ["PAINT & ENAMEL"], defMat: 0, defLabour: 0 },
  // POLISH & CLEAR FINISH
  { id: "melamine", label: "Melamine Polish", groups: ["POLISH & CLEAR FINISH"], defMat: 35, defLabour: 18 },
  { id: "pu_polish", label: "PU Polish", groups: ["POLISH & CLEAR FINISH"], defMat: 45, defLabour: 22 },
  { id: "nc_polish", label: "NC Polish", groups: ["POLISH & CLEAR FINISH"], defMat: 0, defLabour: 0 },
  { id: "french_polish", label: "French Polish", groups: ["POLISH & CLEAR FINISH"], defMat: 0, defLabour: 0 },
  { id: "wood_stain", label: "Wood Stain", groups: ["POLISH & CLEAR FINISH"], defMat: 20, defLabour: 10 },
  { id: "clear_varnish", label: "Clear Varnish", groups: ["POLISH & CLEAR FINISH"], defMat: 0, defLabour: 0 },
  { id: "poly_clear_coat", label: "Polyurethane Clear Coat", groups: ["POLISH & CLEAR FINISH"], defMat: 0, defLabour: 0 },
  // shared
  { id: "custom", label: "Custom Finish", groups: ["PAINT & ENAMEL","POLISH & CLEAR FINISH"], defMat: 0, defLabour: 0 },
  // legacy — no longer offered for new selections; kept only so old items with these values still resolve
  { id: "texture_finish", label: "Texture Finish", groups: [], legacy: true, defMat: 0, defLabour: 0 },
  { id: "wallpaper_finish", label: "Wallpaper Finish", groups: [], legacy: true, defMat: 0, defLabour: 0 },
];
const DW2_FINISH_GROUPS = ["PAINT & ENAMEL", "POLISH & CLEAR FINISH"];

// PAINT-JOINERY-FINISH-MASTER (PASS 6.2) — centralized Brand → Product config
// for Joinery Finish Details. Descriptive metadata only: brand/product/coats
// selections are NEVER read by calcDoorWindowItem, consumption, or any rate
// logic. Starter/representative catalog only, not exhaustive — intentionally
// scoped per PASS 6.2 ("expanded later"). Keyed to the real, currently
// selectable DW2_FINISH_TYPES ids above; "Laminate Finish"/"Veneer Finish"
// have no corresponding finishType id, so they're not included here — there's
// no dropdown value they could ever attach to.
const JOINERY_FINISH_MASTER = {
  oil_paint: { brands: [
    { name: "Asian Paints", products: ["Utsav Enamel", "Apcolite Premium Enamel"] },
    { name: "Berger", products: ["Luxol Hi-Gloss Enamel"] },
    { name: "Nerolac", products: ["Synthetic Enamel Gold"] },
    { name: "Shalimar", products: ["Superlac Enamel"] },
  ]},
  water_based: { brands: [
    { name: "Asian Paints", products: ["Apcolite Aqua Gloss Enamel"] },
    { name: "Berger", products: ["Silk Glamour Aqua"] },
    { name: "Nerolac", products: ["Suraksha Aqua Enamel"] },
  ]},
  synthetic_enamel: { brands: [
    { name: "Asian Paints", products: ["Apcolite Premium Enamel"] },
    { name: "Berger", products: ["Luxol Hi-Gloss Enamel"] },
    { name: "Nerolac", products: ["Synthetic Enamel Gold"] },
    { name: "Indigo Paints", products: ["Indigo Enamel"] },
  ]},
  high_gloss_enamel: { brands: [
    { name: "Asian Paints", products: ["Apcolite Premium Gloss Enamel"] },
    { name: "Berger", products: ["Luxol Hi-Gloss Enamel"] },
    { name: "Nerolac", products: ["Excel Gloss Enamel"] },
  ]},
  pu_paint: { brands: [
    { name: "Asian Paints", products: ["Apcolite PU Enamel"] },
    { name: "Sirca", products: ["PU Topcoat"] },
    { name: "ICA", products: ["PU Enamel System"] },
  ]},
  duco_paint: { brands: [
    { name: "Asian Paints", products: ["Duco Nitrocellulose Paint"] },
    { name: "Berger", products: ["Duco Finish"] },
  ]},
  metal_primer_enamel: { brands: [
    { name: "Asian Paints", products: ["Apcolite Red Oxide Primer", "Apcolite Premium Enamel"] },
    { name: "Berger", products: ["Berger Zinc Chromate Primer", "Luxol Hi-Gloss Enamel"] },
    { name: "Nerolac", products: ["Nerolac Red Oxide Primer"] },
    { name: "Shalimar", products: ["Shalimar Metal Primer"] },
  ]},
  melamine: { brands: [
    { name: "Asian Paints", products: ["Melamyne Melamine Polish"] },
    { name: "Berger", products: ["Woodkeep Melamine"] },
    { name: "Sirca", products: ["Melamine Topcoat System"] },
  ]},
  pu_polish: { brands: [
    { name: "Asian Paints", products: ["Woodtech PU Polish"] },
    { name: "Sirca", products: ["PU Wood Finish"] },
    { name: "ICA", products: ["PU Clear Wood System"] },
  ]},
  nc_polish: { brands: [
    { name: "Asian Paints", products: ["NC Sealer & Topcoat"] },
    { name: "Sirca", products: ["NC Lacquer"] },
  ]},
  french_polish: { brands: [
    { name: "Traditional / Local", products: ["Shellac French Polish"] },
  ]},
  wood_stain: { brands: [
    { name: "Asian Paints", products: ["Woodtech Wood Stain"] },
    { name: "Berger", products: ["Woodkeep Stain"] },
    { name: "ICA", products: ["Wood Stain System"] },
  ]},
  clear_varnish: { brands: [
    { name: "Asian Paints", products: ["Apcolite Clear Varnish"] },
    { name: "Berger", products: ["Clear Spar Varnish"] },
  ]},
  poly_clear_coat: { brands: [
    { name: "Sirca", products: ["PU Clear Topcoat"] },
    { name: "ICA", products: ["Polyurethane Clear Coat"] },
  ]},
};
const JOINERY_COAT_OPTIONS = ["1 Coat", "2 Coats", "3 Coats", "4 Coats", "Custom"];

// PAINT-JOINERY-FINISH-PREVIEW (PASS 6.5) — centralized visual identity per
// finish family. The Preview card reads ONLY from this map (single lookup,
// no switch/ternary chains in JSX). If real PNG/WebP assets are added later,
// only this object changes — the Preview JSX stays untouched. CSS/emoji
// placeholders only; no real image assets exist anywhere in this app.
const FINISH_PREVIEW_MAP = {
  oil_paint:           { previewTitle:"Oil Paint",           previewSubtitle:"Warm oil-based finish",         previewIcon:"🪣", previewBackground:"#FFF8E8", previewBorder:"#C99A3D" },
  water_based:         { previewTitle:"Water Based Paint",   previewSubtitle:"Light, water-based coat",       previewIcon:"💧", previewBackground:"#EAF4FB", previewBorder:"#5B9BD5" },
  synthetic_enamel:    { previewTitle:"Synthetic Enamel",    previewSubtitle:"Deep enamel colour",            previewIcon:"🎨", previewBackground:"#EDEFF7", previewBorder:"#4C5C88" },
  high_gloss_enamel:   { previewTitle:"High Gloss Enamel",   previewSubtitle:"Glossy reflective finish",      previewIcon:"✨", previewBackground:"#F5F7FA", previewBorder:"#8891A0" },
  pu_paint:            { previewTitle:"PU Paint",            previewSubtitle:"Premium metallic-look PU",      previewIcon:"🛡️", previewBackground:"#F0F1F3", previewBorder:"#7A8087" },
  duco_paint:          { previewTitle:"Duco Paint",          previewSubtitle:"Automotive-grade finish",       previewIcon:"🚗", previewBackground:"#FDEDED", previewBorder:"#C65C5C" },
  metal_primer_enamel: { previewTitle:"Metal Primer + Enamel", previewSubtitle:"Rust-protective primer & enamel", previewIcon:"🛡️", previewBackground:"#FDECE1", previewBorder:"#C97A45" },
  melamine:            { previewTitle:"Melamine",            previewSubtitle:"Natural wood grain texture",    previewIcon:"🪵", previewBackground:"#F5E6D3", previewBorder:"#A9793E" },
  pu_polish:           { previewTitle:"PU Polish",            previewSubtitle:"Premium walnut polish",         previewIcon:"🌰", previewBackground:"#EFE3D6", previewBorder:"#7A5230" },
  nc_polish:           { previewTitle:"NC Polish",            previewSubtitle:"Teak-textured satin polish",    previewIcon:"🪵", previewBackground:"#F2E4D0", previewBorder:"#96693A" },
  french_polish:       { previewTitle:"French Polish",        previewSubtitle:"Traditional mahogany polish",   previewIcon:"🟤", previewBackground:"#F0DCD5", previewBorder:"#7A4B3D" },
  wood_stain:          { previewTitle:"Wood Stain",           previewSubtitle:"Natural timber stain",          previewIcon:"🪵", previewBackground:"#F3E8D8", previewBorder:"#A9793E" },
  clear_varnish:       { previewTitle:"Clear Varnish",        previewSubtitle:"Transparent amber varnish",     previewIcon:"🍯", previewBackground:"#FDF3DC", previewBorder:"#C9A23D" },
  poly_clear_coat:     { previewTitle:"Poly Clear Coat",      previewSubtitle:"Crystal-clear glossy coat",     previewIcon:"💎", previewBackground:"#F0F9FC", previewBorder:"#5CA8BE" },
  custom:              { previewTitle:"Custom Finish",        previewSubtitle:"Neutral finish placeholder",    previewIcon:"⚙️", previewBackground:"#F3F4F6", previewBorder:"#9AA5B1" },
};
// PAINT-JOINERY-FINISH-IMAGE — crops a real material swatch photo out of the
// shared public/preview-card-image's.png sprite sheet (5 cols x 3 rows, same
// grid system as the item-image sprite) per finish id, in place of the emoji
// placeholder in the Finish Preview card. Tile order follows FINISH_PREVIEW_MAP
// key order (row-major, 5 per row). Purely visual: no effect on finishType
// values or calculations. Falls back to the existing emoji for ids with no
// photographed tile (custom).
const FINISH_IMAGE_SPRITE = "/preview-card- image's.png";
const FINISH_IMAGE_GRID = { naturalW: 1536, naturalH: 1024, cellW: 1536/5, cellH: 1024/3 };
const FINISH_IMAGE_ORDER = [
  "oil_paint","water_based","synthetic_enamel","high_gloss_enamel","pu_paint",
  "duco_paint","metal_primer_enamel","melamine","pu_polish","nc_polish",
  "french_polish","wood_stain","clear_varnish","poly_clear_coat",
];
const FINISH_IMAGE_MAP = Object.fromEntries(FINISH_IMAGE_ORDER.map((id,i)=>[id,{col:i%5,row:Math.floor(i/5)}]));
// Per-finish crop rects, individually measured (connected-component
// detection on the actual sprite, then verified by rendering each crop)
// against every swatch's own true content bounds — NOT a uniform grid.
// Row 2 only has 4 swatches and they are wider/differently spaced than the
// 5-per-row cells in rows 0–1, which is what produced the earlier "half
// tile" artifact on Polyurethane Clear Coat. One explicit rect per finish,
// in the same finish→tile order as FINISH_IMAGE_MAP (mapping unchanged).
const FINISH_IMAGE_RECTS = {
  oil_paint:            [34,50,300,332],
  water_based:          [330,49,602,330],
  synthetic_enamel:     [632,49,901,331],
  high_gloss_enamel:    [932,47,1202,328],
  pu_paint:             [1230,47,1495,327],
  duco_paint:           [34,362,298,641],
  metal_primer_enamel:  [330,362,600,640],
  melamine:             [632,362,899,641],
  pu_polish:            [932,362,1200,640],
  nc_polish:            [1230,362,1495,640],
  french_polish:        [34,674,376,975],
  wood_stain:           [412,675,746,975],
  clear_varnish:        [781,674,1119,976],
  poly_clear_coat:      [1155,674,1495,974],
};
function FinishPreviewImage({ finishId, size=64, radius=14, fallback }) {
  const m = FINISH_IMAGE_MAP[finishId];
  const rect = FINISH_IMAGE_RECTS[finishId];
  if (!m || !rect) return <span style={{fontSize:Math.round(size*0.44)}}>{fallback}</span>;
  const [x0,y0,x1,y1] = rect;
  const tileW=x1-x0, tileH=y1-y0;
  const scale = size / Math.min(tileW, tileH);
  const bgW = FINISH_IMAGE_GRID.naturalW*scale, bgH = FINISH_IMAGE_GRID.naturalH*scale;
  const bgX = -x0*scale - (tileW*scale - size)/2, bgY = -y0*scale - (tileH*scale - size)/2;
  return <div style={{
      width:size, height:size, borderRadius:radius, overflow:"hidden", flexShrink:0,
      backgroundImage:`url("${FINISH_IMAGE_SPRITE}")`,
      backgroundSize:`${bgW}px ${bgH}px`, backgroundPosition:`${bgX}px ${bgY}px`, backgroundRepeat:"no-repeat",
    }}/>;
}
const JOINERY_METAL_CATEGORIES = ["Window Grill", "Safety Grill", "Railing", "Gate", "Rolling Shutter", "Metal Frame"];
function joineryVisibleGroupsFor(category) {
  return JOINERY_METAL_CATEGORIES.includes(category) ? ["PAINT & ENAMEL"] : DW2_FINISH_GROUPS;
}
function joineryDefaultFinishIdFor(category) {
  return JOINERY_METAL_CATEGORIES.includes(category) ? "synthetic_enamel" : "melamine";
}
function joineryFinishValidForCategory(finishId, category, finishList) {
  const f = finishList.find(x => x.id === finishId);
  if (!f) return false;
  if (f.legacy) return true;
  const allowed = joineryVisibleGroupsFor(category);
  return (f.groups || []).some(g => allowed.includes(g));
}

// Door & Window Material Consumption defaults (display-only; does not affect mat/lab/total above)
const DW2_CONSUMPTION_DEFAULTS = {
  oil_paint:    { coats:2, coverage:60, wastage:10, packSize:1, ratePerL:300 },
  water_based:  { coats:2, coverage:80, wastage:10, packSize:4, ratePerL:250 },
  pu_paint:     { coats:2, coverage:75, wastage:10, packSize:1, ratePerL:550 },
  duco_paint:   { coats:2, coverage:55, wastage:12, packSize:1, ratePerL:600 },
  melamine:     { coats:2, coverage:70, wastage:10, packSize:1, ratePerL:450 },
  pu_polish:    { coats:2, coverage:75, wastage:10, packSize:1, ratePerL:550 },
  wood_stain:   { coats:1, coverage:90, wastage:8,  packSize:1, ratePerL:350 },
  custom:       { coats:1, coverage:70, wastage:10, packSize:1, ratePerL:0   },
};
function calcDoorWindowConsumption(item) {
  const area = calcDoorWindowItem(item).area;
  const cons = item.consumption || DW2_CONSUMPTION_DEFAULTS[item.finishType] || DW2_CONSUMPTION_DEFAULTS.oil_paint;
  const litres = (cons.coverage>0) ? (area * (cons.coats||0)) / cons.coverage : 0;
  const litresWithWaste = litres * (1 + (cons.wastage||0)/100);
  const packs = (cons.packSize>0) ? Math.ceil(litresWithWaste / cons.packSize) : 0;
  const consumptionCost = litresWithWaste * (cons.ratePerL||0);
  return { ...cons, litres, litresWithWaste, packs, consumptionCost };
}

// ─── Quick Item Presets (JOINERY-001E) ─────────────────────────────
// Presets only prefill editable fields on top of the existing item constructors.
// No new calculation logic; rates are pulled from the existing canonical finish
// tables (defMat/defLabour, defRate/defLabour) — never invented here.
const JOINERY_ITEM_PRESETS = [
  { group:"DOORS", presets:[
    { id:"main_door",      buttonLabel:"Main Door",      itemType:"Door", label:"Main Door",      length:4,   height:7, qty:1, finishId:"oil_paint" },
    { id:"internal_door",  buttonLabel:"Internal Door",  itemType:"Door", label:"Internal Door",  length:3,   height:7, qty:1, finishId:"oil_paint" },
    { id:"bathroom_door",  buttonLabel:"Bathroom Door",  itemType:"Door", label:"Bathroom Door",  length:2.5, height:7, qty:1, finishId:"water_based" },
  ]},
  { group:"WINDOWS & GRILLS", presets:[
    { id:"standard_window", buttonLabel:"Standard Window", itemType:"Window",        label:"Standard Window", length:4, height:4, qty:1, finishId:"water_based" },
    { id:"sliding_window",  buttonLabel:"Sliding Window",  itemType:"Window",        label:"Sliding Window",  length:6, height:4, qty:1, finishId:"water_based" },
    { id:"window_grill",    buttonLabel:"Window Grill",    itemType:"Window Grill",  label:"Window Grill",    length:4, height:4, qty:1, finishId:"synthetic_enamel" },
    { id:"safety_grill",    buttonLabel:"Safety Grill",    itemType:"Safety Grill",  label:"Safety Grill",    length:4, height:4, qty:1, finishId:"synthetic_enamel" },
  ]},
  { group:"METALWORK", presets:[
    { id:"main_gate",          buttonLabel:"Main Gate",          itemType:"Gate",           label:"Main Entrance Gate", length:10, height:6, qty:1, finishId:"metal_primer_enamel" },
    { id:"balcony_railing",    buttonLabel:"Balcony Railing",    itemType:"Railing",        label:"Balcony Railing",    length:10, height:3, qty:1, finishId:"metal_primer_enamel" },
    { id:"staircase_railing",  buttonLabel:"Staircase Railing",  itemType:"Railing",        label:"Staircase Railing",  length:12, height:3, qty:1, finishId:"metal_primer_enamel" },
    { id:"rolling_shutter",    buttonLabel:"Rolling Shutter",    itemType:"Rolling Shutter",label:"Rolling Shutter",    length:10, height:8, qty:1, finishId:"synthetic_enamel" },
    { id:"metal_frame",        buttonLabel:"Metal Frame",        itemType:"Metal Frame",    label:"Metal Frame",        length:4,  height:7, qty:1, finishId:"metal_primer_enamel" },
  ]},
  { group:"WOODWORK", presets:[
    { id:"wardrobe",       buttonLabel:"Wardrobe",       itemType:"Wardrobe",       label:"Wardrobe",       length:6,  height:7, qty:1, finishId:"melamine" },
    { id:"tv_unit",        buttonLabel:"TV Unit",        itemType:"Furniture",      label:"TV Unit",        length:6,  height:5, qty:1, finishId:"melamine" },
    { id:"wall_panelling", buttonLabel:"Wall Panelling", itemType:"Other Woodwork", label:"Wall Panelling", length:10, height:8, qty:1, finishId:"pu_polish" },
    { id:"other_woodwork", buttonLabel:"Other Woodwork", itemType:"Other Woodwork", label:"Other Woodwork", length:0,  height:0, qty:1, finishId:"melamine" },
  ]},
];
const JOINERY_FINISH_PRESETS = [
  { id:"door_enamel",      buttonLabel:"Door Enamel",          category:"Door",           label:"Door Enamel",              finishId:"synthetic_enamel",    qty:1 },
  { id:"grill_enamel",     buttonLabel:"Grill Enamel",         category:"Window Grill",   label:"Grill Enamel",             finishId:"synthetic_enamel",    qty:1 },
  { id:"gate_enamel",      buttonLabel:"Gate Enamel",          category:"Gate",           label:"Gate Enamel",              finishId:"metal_primer_enamel", qty:1 },
  { id:"railing_enamel",   buttonLabel:"Railing Enamel",       category:"Railing",        label:"Railing Enamel",           finishId:"metal_primer_enamel", qty:1 },
  { id:"wardrobe_melamine",buttonLabel:"Wardrobe Melamine",    category:"Wardrobe",       label:"Wardrobe Melamine Polish", finishId:"melamine",            qty:1 },
  { id:"furniture_pu",     buttonLabel:"Furniture PU Polish",  category:"Furniture",      label:"Furniture PU Polish",      finishId:"pu",                  qty:1 },
  { id:"woodwork_stain",   buttonLabel:"Woodwork Wood Stain",  category:"Other Woodwork", label:"Woodwork Wood Stain",      finishId:"wood_stain",           qty:1 },
  { id:"custom_finishing", buttonLabel:"Custom Finishing Item",category:"Custom Item",    label:"Custom Finishing Item",    finishId:"custom",              qty:1 },
];
// Starts from newDoorWindowItem() (keeps its generated id), overrides only category/label/dims/qty/finish + the finish's existing configured rate.
function createDoorWindowFromPreset(preset) {
  const item = newDoorWindowItem();
  const fin = DW2_FINISH_TYPES.find(f=>f.id===preset.finishId);
  return {
    ...item,
    itemType: preset.itemType,
    customType: preset.label,
    length: preset.length,
    height: preset.height,
    qty: preset.qty,
    finishType: preset.finishId,
    materialRate: fin ? fin.defMat : 0,
    labourRate: fin ? fin.defLabour : 0,
  };
}
// Starts from newPolishItem() (keeps its generated id), overrides only category/label/qty/finish + the finish's existing configured rate.
function createPolishFromPreset(preset) {
  const item = newPolishItem(preset.category);
  const fin = POLISH_FINISH_TYPES.find(f=>f.id===preset.finishId);
  return {
    ...item,
    category: preset.category,
    label: preset.label,
    finishId: preset.finishId,
    qty: preset.qty,
    rate: fin ? fin.defRate : 0,
    labourRate: fin ? fin.defLabour : 0,
  };
}

function newDoorWindowItem() {
  return {
    id: uid(),
    itemType: "Door",
    customType: "",
    length: 0,
    height: 0,
    qty: 1,
    finishType: "oil_paint",
    customFinish: "",
    materialRate: 0,
    labourRate: 0,
    notes: "",
    // PAINT-JOINERY-FINISH-MASTER (PASS 6.2) — descriptive metadata only.
    // Never read by calcDoorWindowItem or any consumption/rate logic.
    brand: "",
    product: "",
    coats: "",
    // Minimal floor reference for rendering/grouping only — index into
    // project.floors. Never read by any calculation.
    floorIndex: 0,
  };
}

function calcDoorWindowItem(it) {
  const area = Math.max(0, (Number(it.length) || 0) * (Number(it.height) || 0) * (Number(it.qty) || 0));
  const enamelMaterial = area * (Number(it.materialRate) || 0);
  const enamelLabour = area * (Number(it.labourRate) || 0);
  const enamelTotal = enamelMaterial + enamelLabour;
  // Metal Primer stage (Stage 1) — optional, metal categories only. Same
  // area (measured once, reused), same material/labour formula pattern as
  // the existing Stage 2 (Enamel) calc above — not a new formula, the same
  // one applied to the primer's own rate/labourRate. Absent/off on
  // pre-existing items (backward compatible: total is unchanged when there
  // is no primer stage).
  const p = it.primer;
  const primerOn = !!(p && p.on);
  const primerMaterial = primerOn ? area * (Number(p.materialRate) || 0) : 0;
  const primerLabour = primerOn ? area * (Number(p.labourRate) || 0) : 0;
  const primerTotal = primerMaterial + primerLabour;
  // material/labour/total are the combined (both-stage) figures — kept as
  // the single source every existing consumer (per-item cost row,
  // calcDoorWindowTotals, PDF subtotal) already reads, so material+labour
  // always equals total, with or without a primer stage.
  const material = enamelMaterial + primerMaterial;
  const labour = enamelLabour + primerLabour;
  const total = material + labour; // Metal Finish Total = Primer Cost + Enamel Cost
  return { area, material, labour, total, primerOn, primerMaterial, primerLabour, primerTotal, enamelMaterial, enamelLabour, enamelTotal };
}

function calcDoorWindowTotals(items = []) {
  return items.reduce(
    (s, it) => {
      const c = calcDoorWindowItem(it);
      return { area: s.area + c.area, material: s.material + c.material, labour: s.labour + c.labour, total: s.total + c.total };
    },
    { area: 0, material: 0, labour: 0, total: 0 }
  );
}

function calcDoorWindow(items) { return calcDoorWindowTotals(items || []); }

// Zero-input display helper: shows empty instead of literal 0 while typing,
// calculations already coerce "" back to 0 via Number(x)||0.
function zi(v) { return (v === 0 || v === "0") ? "" : v; }

function DoorWindowConsumptionSection({ item, onUpdate }) {
  const [show, setShow] = useState(false);
  const cons = item.consumption || DW2_CONSUMPTION_DEFAULTS[item.finishType] || DW2_CONSUMPTION_DEFAULTS.oil_paint;
  const cc = calcDoorWindowConsumption(item);
  const setCons = patch => onUpdate({ ...item, consumption: { ...cons, ...patch } });
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setShow(v => !v)}
        style={{ width: "100%", padding: "10px 0", borderRadius: 12, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          border: `1.5px dashed ${C.border}`, background: "transparent", color: C.gray }}
      >
        {show ? "▾" : "▸"} Material Consumption
      </button>
      {show && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><span style={LBL}>Coats</span>
              <input type="number" value={zi(cons.coats)} onChange={e=>setCons({coats:e.target.value})}
                style={{ width: "100%", height:44, boxSizing:"border-box", padding: "0 12px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize:13, fontWeight:700 }}/></div>
            <div><span style={LBL}>Coverage (sqft/L)</span>
              <input type="number" value={zi(cons.coverage)} onChange={e=>setCons({coverage:e.target.value})}
                style={{ width: "100%", height:44, boxSizing:"border-box", padding: "0 12px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize:13, fontWeight:700 }}/></div>
            <div><span style={LBL}>Wastage %</span>
              <input type="number" value={zi(cons.wastage)} onChange={e=>setCons({wastage:e.target.value})}
                style={{ width: "100%", height:44, boxSizing:"border-box", padding: "0 12px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize:13, fontWeight:700 }}/></div>
            <div><span style={LBL}>Pack Size (L)</span>
              <input type="number" value={zi(cons.packSize)} onChange={e=>setCons({packSize:e.target.value})}
                style={{ width: "100%", height:44, boxSizing:"border-box", padding: "0 12px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize:13, fontWeight:700 }}/></div>
            <div><span style={LBL}>Rate per Litre (₹)</span>
              <input type="number" value={zi(cons.ratePerL)} onChange={e=>setCons({ratePerL:e.target.value})}
                style={{ width: "100%", height:44, boxSizing:"border-box", padding: "0 12px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize:13, fontWeight:700 }}/></div>
          </div>
          <div style={{ background: "#F5F3FF", borderRadius: 12, padding: "14px 16px", border: "1px solid #DDD6FE" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Total Litres",`${cc.litres.toFixed(2)} L`],["Litres w/ Wastage",`${cc.litresWithWaste.toFixed(2)} L`],["Packs Required",`${cc.packs}`],["Consumption Cost",`₹${cc.consumptionCost.toFixed(0)}`]].map(([l,v])=>(
                <div key={l} style={{ background: "rgba(124,58,237,0.08)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#7C3AED", fontWeight: 700, letterSpacing:"0.03em", textTransform:"uppercase" }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#7C3AED", marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// PAINT-JOINERY-DW-REBUILD — presentation rebuild only.
// Preserved exactly: list/update/remove/calcDoorWindowItem/calcDoorWindowTotals,
// activeItemId+prevLen auto-open-on-add accordion behavior, the itemType-change
// finish-reset logic (joineryFinishValidForCategory/joineryDefaultFinishIdFor),
// the finishType-change rate-fill logic, zero-rate warning, custom finish name
// field, notes, DoorWindowConsumptionSection (untouched, same props), per-item
// cost row, Section Total footer. DW2_ITEM_TYPES/DW2_ITEM_ICONS/DW2_ITEM_PLACEHOLDERS/
// DW2_LEGACY_ITEM_TYPES/DW2_FINISH_TYPES/DW2_FINISH_GROUPS/joineryVisibleGroupsFor/zi
// all reused unchanged, no new schema.
//
// ONE flagged, minimal deviation: add() now takes the picked itemType so the new
// Category→Type→Add flow actually applies it (previously always defaulted to "Door").
// pickCategory/pickType/pickerOpen are new LOCAL UI-only state — not persisted, not
// schema — purely for the two-step picker, same pattern as showFinishing/openMap
// elsewhere in this app.
function DoorWindowMeasurementTab({ items, onChange, floors }) {
  const list = items || [];

  const [activeItemId, setActiveItemId] = useState(null);
  const prevLen = useRef(list.length);
  useEffect(() => {
    if (list.length > prevLen.current && list.length>0) {
      setActiveItemId(list[list.length-1].id);
    }
    prevLen.current = list.length;
  }, [list]);

  const update = (id, patch) => {
    onChange(list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const remove = (id) => {
    const idx = list.findIndex((it) => it.id === id);
    const remaining = list.filter((it) => it.id !== id);
    if (remaining.length===0) {
      setActiveItemId(null);
    } else if (activeItemId===id) {
      const next = remaining[idx] || remaining[idx-1] || remaining[0];
      setActiveItemId(next.id);
    }
    onChange(remaining);
  };
  // Minimal extension (see header note): accepts the picked type, else same default as before.
  const add = (type) => {
    const created = { ...newDoorWindowItem(), ...(type ? { itemType: type } : {}) };
    onChange([...list, created]);
  };

  const totals = calcDoorWindowTotals(list);

  // Presentation-only menu grouping for the Category→Type picker. Not schema —
  // itemType is still the single stored field, same values as DW2_ITEM_TYPES.
  const CATEGORY_GROUPS = [
    { id:"wood",  label:"Wood",  icon:"🪵", types:["Door","Window","Furniture","Wardrobe","Other Woodwork"] },
    { id:"metal", label:"Metal", icon:"🔩", types: JOINERY_METAL_CATEGORIES },
    { id:"other", label:"Joinery", icon:"✨", types:["Custom Item"] },
  ];
  const [pickCategory, setPickCategory] = useState("wood");
  const [pickType, setPickType] = useState(null);
  const activeGroup = CATEGORY_GROUPS.find(g=>g.id===pickCategory) || CATEGORY_GROUPS[0];

  return (
    <div style={{ fontFamily: "inherit" }}>

      {/* ── SECTION 1 — Category & Item Selection (RC-001 PASS 1 rebuild) ── */}
      <div style={PCARD}>
        <div style={{fontSize:10,fontWeight:800,color:C.orange,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Step 1</div>
        <div style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:4}}>Category &amp; Type Selection</div>
        <div style={{fontSize:12,color:C.gray,marginBottom:20}}>Choose the category and item type you want to estimate.</div>

        <span style={LBL}>Category</span>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8,marginBottom:20}}>
          {CATEGORY_GROUPS.map(g=>{
            const sel=pickCategory===g.id;
            return <button key={g.id} onClick={()=>{setPickCategory(g.id);setPickType(null);}} style={{
                height:56,borderRadius:12,cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",gap:3,
                border:`1.5px solid ${sel?C.orange:C.border}`,background:sel?C.orangeL:C.white,transition:"all 0.15s",
              }}>
              <span style={{fontSize:15}}>{g.icon}</span>
              <span style={{fontSize:11,fontWeight:700,color:sel?C.orange:C.navy}}>{g.label}</span>
            </button>;
          })}
        </div>

        <span style={LBL}>Item Type</span>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:6,marginBottom:20}}>
          {activeGroup.types.map(t=>{
            const sel=pickType===t;
            return <button key={t} onClick={()=>setPickType(t)} style={{
                height:56,borderRadius:12,cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",gap:3,padding:"0 4px",
                border:`1.5px solid ${sel?C.orange:C.border}`,background:sel?C.orangeL:C.white,transition:"all 0.15s",
              }}>
              <ItemPreviewImage itemType={t} size={22} radius={6} fallback={DW2_ITEM_ICONS[t]||"🔧"}/>
              <span style={{fontSize:10.5,fontWeight:700,color:sel?C.orange:C.navy,textAlign:"center",lineHeight:1.15}}>{t}</span>
            </button>;
          })}
        </div>

        <button onClick={()=>add(pickType)} style={{
            width:"100%",height:48,borderRadius:12,border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${C.navy},${C.navyL})`,color:"#fff",fontSize:13,fontWeight:800,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>+ Add Item</button>
      </div>

      {/* ── Item cards ── */}
      {list.map((it, index) => {
        const c = calcDoorWindowItem(it);
        const isOpen = activeItemId === it.id;
        const catIcon = DW2_ITEM_ICONS[it.itemType] || "🔧";
        const rateConfigured = (Number(it.materialRate)||0)>0 || (Number(it.labourRate)||0)>0;

        const changeType = (newType) => {
          if (joineryFinishValidForCategory(it.finishType, newType, DW2_FINISH_TYPES)) {
            update(it.id, { itemType: newType });
          } else {
            const targetId = joineryDefaultFinishIdFor(newType);
            const targetFin = DW2_FINISH_TYPES.find(f=>f.id===targetId);
            const hasConfiguredRate = targetFin && ((targetFin.defMat>0)||(targetFin.defLabour>0));
            update(it.id, { itemType: newType, finishType: targetId,
              ...(hasConfiguredRate ? {materialRate:targetFin.defMat, labourRate:targetFin.defLabour} : {}) });
          }
        };
        const changeFinish = (finId) => {
          const f = DW2_FINISH_TYPES.find(x=>x.id===finId);
          const hasConfiguredRate = f && ((f.defMat>0) || (f.defLabour>0));
          // PASS 6.2: brand/product cleared on finish-family change since the
          // brand catalog is keyed per finish family — a brand valid for one
          // finish isn't necessarily valid for another. Metadata only, no
          // effect on rates/calculations.
          update(it.id, { finishType: finId, brand:"", product:"", ...(hasConfiguredRate?{materialRate:f.defMat,labourRate:f.defLabour}:{}) });
        };

        return (
           <div key={it.id || `dw-${index}-${Date.now()}`} style={{...PCARD,padding:0,overflow:"hidden",border:`1px solid ${isOpen?C.navy:C.border}`}}>

            {/* Collapsed header — premium item card.
                NOTE (BUGFIX): was a native <button> wrapping an inner Remove
                <button>, which is invalid DOM nesting (validateDOMNesting
                warning) and breaks click bubbling for the inner control.
                Converted to a keyboard-accessible <div role="button"> with
                the same onClick/style; inner Remove button keeps its
                e.stopPropagation() so it still doesn't toggle the header. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveItemId(isOpen?null:it.id)}
              onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setActiveItemId(isOpen?null:it.id); } }}
              style={{
                width:"100%",padding:"18px 20px",border:"none",background:"transparent",cursor:"pointer",
                display:"flex",alignItems:"center",gap:16,textAlign:"left",boxSizing:"border-box",
              }}>
              <div style={{width:40,height:40,borderRadius:12,background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,overflow:"hidden"}}><ItemPreviewImage itemType={it.itemType} size={40} radius={12} fallback={catIcon}/></div>
              <div style={{flex:"1 1 auto",minWidth:0}}>
                <div style={{fontSize:14,fontWeight:800,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.customType || it.itemType || "Item"}</div>
                <div style={{fontSize:10.5,color:C.gray,marginTop:2,fontWeight:600}}>{it.itemType} · {c.area.toFixed(1)} sf{!rateConfigured?" · Rate not set":""}</div>
              </div>
              <div style={{display:"flex",gap:20,flexShrink:0,alignItems:"center"}}>
                <span style={{fontSize:9,fontWeight:700,padding:"3px 10px",borderRadius:20,
                  background:rateConfigured?"#EEF2F6":"#FFF7ED",color:rateConfigured?C.gray:"#c2610a"}}>
                  {rateConfigured?(isOpen?"Editing":"Complete"):"Not Started"}
                </span>
                <div style={{fontSize:13.5,fontWeight:800,color:C.orange}}>₹{c.total.toFixed(0)}</div>
                <span style={{fontSize:12,color:C.gray,transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.15s"}}>▾</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(it.id); }} style={{border:"none",background:C.redL,color:C.red,borderRadius:12,padding:"9px 14px",minHeight:36,cursor:"pointer",fontSize:11,fontWeight:700}}>Remove</button>
              </div>
            </div>

            {isOpen && <div style={{padding:"0 18px 20px",borderTop:`1px solid ${C.border}`}}>

              {/* ── SECTION 2 — Measurement Entry (RC-001 PASS 2.6 — proportion polish) ── */}
              <div style={{marginTop:14}}>

                <div style={{fontSize:10,fontWeight:800,color:C.orange,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3}}>Step 2</div>
                <div style={{fontSize:15,fontWeight:800,color:C.navy,marginBottom:2}}>Measurement Entry</div>
                <div style={{fontSize:11.5,color:C.gray,marginBottom:12}}>Enter the accurate measurements of your selected item.</div>

                {/* Item title — single clean line, no icon repeated here (the illustration
                    below is the only icon in this section). Renaming/re-categorizing kept. */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <input value={it.customType} placeholder={DW2_ITEM_PLACEHOLDERS[it.itemType] || "Item name"}
                    onChange={(e)=>update(it.id,{customType:e.target.value})}
                    style={{flex:1,minWidth:0,border:"none",background:"transparent",padding:0,fontSize:15,fontWeight:800,color:C.navy}}/>
                  <select value={it.itemType} onChange={(e)=>changeType(e.target.value)} title="Change category / type"
                    style={{height:30,padding:"0 8px",borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:10.5,fontWeight:700,background:C.white,color:C.gray,flexShrink:0}}>
                    {DW2_ITEM_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                    {DW2_LEGACY_ITEM_TYPES.includes(it.itemType) && (
                      <option key={it.itemType} value={it.itemType}>{it.itemType} (Legacy)</option>
                    )}
                  </select>
                </div>

                {floors && floors.length>0 && (
                  <div style={{marginBottom:12}}>
                    <span style={LBL}>Floor</span>
                    <select value={it.floorIndex||0} onChange={(e)=>update(it.id,{floorIndex:Number(e.target.value)})}
                      style={{width:"100%",height:40,boxSizing:"border-box",padding:"0 12px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:12.5,fontWeight:700,background:C.white,color:C.navy}}>
                      {floors.map((f,i)=>(<option key={i} value={i}>{f.name||`Floor ${i+1}`}</option>))}
                    </select>
                  </div>
                )}

                {/* ── Two-column measurement experience — tighter, illustration-led ── */}
                <div style={{display:"flex",gap:12,marginBottom:10,alignItems:"stretch"}}>

                  {/* LEFT — ONE clean illustration area. No nested boxes, no borders, no
                      shadow-in-a-box — just the panel background and one large icon.
                      Still the same generic schematic reused across every item type,
                      scaled to the item's own length/height. */}
                  <div style={{width:112,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 2px"}}>
                    <div style={{fontSize:10.5,fontWeight:700,color:C.gray,marginBottom:3,textAlign:"center"}}>↔ {zi(it.length)||"–"} ft</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <span style={{fontSize:10.5,fontWeight:700,color:C.gray,writingMode:"vertical-rl",transform:"rotate(180deg)",width:14,textAlign:"center",flexShrink:0}}>↕ {zi(it.height)||"–"} ft</span>
                      <ItemPreviewImage itemType={it.itemType} size={64} radius={12} fallback={catIcon}/>
                    </div>
                    <div style={{fontSize:9.5,fontWeight:700,color:C.gray,marginTop:5,textAlign:"center"}}>Qty × {it.qty||1}</div>
                  </div>

                  {/* RIGHT — Measurement Form (same fields/handlers, compact non-stretched inputs) */}
                  <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                      <div><span style={LBL}>Length</span>
                        <input type="number" value={zi(it.length)} onChange={(e) => update(it.id, { length: e.target.value })}
                          style={{width:"100%",height:48,boxSizing:"border-box",padding:"0 8px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:14,fontWeight:700}}/></div>
                      <div><span style={LBL}>Height</span>
                        <input type="number" value={zi(it.height)} onChange={(e) => update(it.id, { height: e.target.value })}
                          style={{width:"100%",height:48,boxSizing:"border-box",padding:"0 8px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:14,fontWeight:700}}/></div>
                      <div><span style={LBL}>Qty</span>
                        <input type="number" value={zi(it.qty)} onChange={(e) => update(it.id, { qty: e.target.value })}
                          style={{width:"100%",height:48,boxSizing:"border-box",padding:"0 8px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:14,fontWeight:700}}/></div>
                    </div>

                    <div>
                      <span style={LBL}>Notes</span>
                      <textarea placeholder="Notes" value={it.notes} onChange={(e) => update(it.id, { notes: e.target.value })}
                        style={{width:"100%",minHeight:40,boxSizing:"border-box",padding:"8px 10px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:12.5,fontFamily:"inherit",resize:"none"}}/>
                    </div>
                  </div>
                </div>

                {/* Total Area — full-width premium card, tighter height, stronger
                    typography contrast. Reuses c.area, no new calculation. */}
                <div style={{background:C.orangeL,borderRadius:14,padding:"9px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#c97a40",letterSpacing:"0.05em",textTransform:"uppercase"}}>Total Area</span>
                  <span style={{fontSize:22,fontWeight:900,color:C.orange}}>{c.area.toFixed(2)} sf</span>
                </div>

                {/* Action Area. Scrolls to Finish Details (its DOM next-sibling, since both
                    sections are direct children of the same isOpen wrapper) via plain DOM
                    traversal — no attributes added to Finish Details, no new state, no
                    step-gating. Finish Details remains fully visible/ungated as before. */}
                <button onClick={(e)=>{
                    e.currentTarget.parentElement?.nextElementSibling?.scrollIntoView({behavior:"smooth", block:"start"});
                  }} style={{
                    width:"100%",height:48,borderRadius:12,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${C.navy},${C.navyL})`,color:"#fff",fontSize:13,fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  }}>Next <span>→</span></button>
              </div>

              {/* ── SECTION 3 — Finish & Materials (RC-001 PASS 6.3 — compact layout) ── */}
              <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>

                <div style={{fontSize:10,fontWeight:800,color:C.orange,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3}}>Step 3</div>
                <div style={{fontSize:15,fontWeight:800,color:C.navy,marginBottom:2}}>Finishing &amp; Materials</div>
                <div style={{fontSize:11,color:C.gray,marginBottom:12}}>Choose the finish type and brand for your item.</div>

                {(()=>{
                  const finT = DW2_FINISH_TYPES.find(f=>f.id===it.finishType);
                  const preview = FINISH_PREVIEW_MAP[it.finishType] || FINISH_PREVIEW_MAP.custom;
                  const master = JOINERY_FINISH_MASTER[it.finishType];
                  const brands = master?.brands || [];
                  const currentBrand = brands.find(b=>b.name===it.brand);
                  const products = currentBrand?.products || [];
                  const noCatalog = brands.length===0;
                  const selStyle = {width:"100%",height:44,boxSizing:"border-box",padding:"0 14px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:14,fontWeight:700,background:C.white,color:C.navy};
                  const placeholderStyle = {width:"100%",height:44,boxSizing:"border-box",padding:"0 14px",borderRadius:12,border:`1.5px solid ${C.border}`,fontSize:13,fontWeight:600,background:"#FAFBFC",color:"#9AA5B1",display:"flex",alignItems:"center"};

                  return (<>
                    <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,alignItems:"stretch"}}>

                      {/* LEFT — Finish controls only. Consumption moved out (see
                          below, full-width). Same handlers/filtering/catalog,
                          tighter 8-10px rhythm per this pass. minWidth floor
                          + flexWrap on the parent row keeps this from being
                          squeezed below a usable width on narrow phones —
                          it wraps to its own row instead of clipping. Wide
                          screens have plenty of room, so desktop still shows
                          both columns side by side, unchanged. */}
                      <div style={{flex:"1.5 1 240px",minWidth:240,background:C.white,border:`1px solid ${C.border}`,borderRadius:16,padding:"12px 12px",display:"flex",flexDirection:"column",gap:6}}>

                        <div>
                          <div style={{fontSize:10,fontWeight:600,color:C.gray,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Finish Type</div>
                          <div style={{position:"relative"}}>
                            <select value={it.finishType} onChange={(e)=>changeFinish(e.target.value)}
                              style={{...selStyle,appearance:"none",WebkitAppearance:"none",MozAppearance:"none",paddingRight:38,boxShadow:"none"}}>
                              {DW2_FINISH_GROUPS.filter(grp=>joineryVisibleGroupsFor(it.itemType).includes(grp)).map((grp) => (
                                <optgroup key={grp} label={grp}>
                                  {DW2_FINISH_TYPES.filter((f) => (f.groups||[]).includes(grp)).map((f) => (
                                    <option key={grp+"_"+f.id} value={f.id}>{f.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                              {DW2_FINISH_TYPES.filter((f) => f.legacy && it.finishType === f.id).map((f) => (
                                <optgroup key="legacy" label="LEGACY"><option key={f.id} value={f.id}>{f.label} (Legacy)</option></optgroup>
                              ))}
                            </select>
                            <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.gray,pointerEvents:"none"}}>▾</span>
                          </div>
                        </div>

                        {it.finishType === "custom" && (
                          <div>
                            <span style={{...LBL,marginBottom:4}}>Custom Finish Name</span>
                            <input placeholder="Custom finish name" value={it.customFinish} onChange={(e) => update(it.id, { customFinish: e.target.value })} style={selStyle}/>
                          </div>
                        )}

                        <div>
                          <div style={{fontSize:10,fontWeight:600,color:C.gray,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Brand</div>
                          {noCatalog ? (
                            <div style={placeholderStyle}>No catalog for this finish yet</div>
                          ) : (
                            <div style={{position:"relative"}}>
                              <select value={it.brand||""} onChange={(e)=>update(it.id,{brand:e.target.value, product:""})}
                                style={{...selStyle,appearance:"none",WebkitAppearance:"none",MozAppearance:"none",paddingRight:38,boxShadow:"none"}}>
                                <option value="">Select brand</option>
                                {brands.map(b=><option key={b.name} value={b.name}>{b.name}</option>)}
                              </select>
                              <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.gray,pointerEvents:"none"}}>▾</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <div style={{fontSize:10,fontWeight:600,color:C.gray,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>Product</div>
                          {products.length===0 ? (
                            <div style={placeholderStyle}>Select a brand first</div>
                          ) : (
                            <div style={{position:"relative"}}>
                              <select value={it.product||""} onChange={(e)=>update(it.id,{product:e.target.value})}
                                style={{...selStyle,appearance:"none",WebkitAppearance:"none",MozAppearance:"none",paddingRight:38,boxShadow:"none"}}>
                                <option value="">Select product</option>
                                {products.map(p=><option key={p} value={p}>{p}</option>)}
                              </select>
                              <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.gray,pointerEvents:"none"}}>▾</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <div style={{fontSize:10,fontWeight:600,color:C.gray,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>No. of Coats</div>
                          <div style={{position:"relative"}}>
                            <select value={it.coats||""} onChange={(e)=>update(it.id,{coats:e.target.value})}
                              style={{...selStyle,appearance:"none",WebkitAppearance:"none",MozAppearance:"none",paddingRight:38,boxShadow:"none"}}>
                              <option value="">Select coats</option>
                              {JOINERY_COAT_OPTIONS.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                            <span style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.gray,pointerEvents:"none"}}>▾</span>
                          </div>
                        </div>

                        {!rateConfigured && (
                          <div style={{background:"#FFF7ED",border:"1px solid #FDBA74",borderRadius:12,padding:"8px 12px",fontSize:10.5,color:"#c2610a",fontWeight:600}}>
                            ⚠ Rate not configured
                          </div>
                        )}
                      </div>

                      {/* RIGHT — Finish Preview. 96px hero icon, matching the
                          approved Paint Finish UI's larger preview proportion.
                          Product name remains the secondary visual focus.
                          Equal height with left column via alignItems:stretch. */}
                      <div style={{flex:"1 1 160px",minWidth:160,background:C.white,border:`1px solid ${C.border}`,borderRadius:16,padding:"10px 12px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",boxShadow:"0 1px 2px rgba(15,30,60,0.05), 0 6px 16px rgba(15,30,60,0.06)"}}>
                        <div style={{fontSize:9,fontWeight:700,color:preview.previewBorder,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6,alignSelf:"flex-start"}}>Finish Preview</div>

                        <div className="finish-preview" style={{width:120,height:120,borderRadius:16,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",border:"1px solid #E2E8F0"}}><FinishPreviewImage finishId={it.finishType} size={120} radius={16} fallback={preview.previewIcon}/></div>

                        <div style={{fontSize:13,fontWeight:700,color:C.navy,lineHeight:1.25,textAlign:"center",marginBottom:4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{it.product || finT?.label || "—"}</div>
                        <div style={{fontSize:11,fontWeight:500,color:C.gray,textAlign:"center",marginBottom:6}}>{it.brand || "—"}</div>

                        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:4,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
                          <div>
                            <div style={{fontSize:9,color:C.gray,fontWeight:700,letterSpacing:"0.03em",textTransform:"uppercase",marginBottom:2}}>Coverage</div>
                            <div style={{fontSize:11,color:C.gray,fontWeight:600}}>Not Available</div>
                          </div>
                          <div>
                            <div style={{fontSize:9,color:C.gray,fontWeight:700,letterSpacing:"0.03em",textTransform:"uppercase",marginBottom:2}}>Recommended Usage</div>
                            <div style={{fontSize:11,color:C.gray,fontWeight:600}}>Not Available</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Material Consumption — moved OUT of left column, now a
                        separate full-width card below both columns per this pass.
                        DoorWindowConsumptionSection reused exactly as-is; its own
                        internal toggle already labels itself ("▸ Material
                        Consumption"), so no separate outer heading is added —
                        that was a duplicate label, removed here. */}
                    <div style={{background:"#F8FAFC",border:`1px solid ${C.border}`,borderRadius:14,padding:"8px 10px"}}>
                      <DoorWindowConsumptionSection item={it} onUpdate={(patch) => update(it.id, patch)} />
                    </div>

                    {/* Metal Primer stage (Stage 1) — metal categories only. Same
                        measured area (it.length/height/qty) reused, never entered
                        twice. it.primer is optional/absent by default so existing
                        Wood items and pre-existing metal items (no primer.on)
                        are unaffected — calcDoorWindowItem() already treats a
                        missing/off primer as zero cost. */}
                    {JOINERY_METAL_CATEGORIES.includes(it.itemType) && (()=>{
                      const pFin = DW2_FINISH_TYPES.find(f=>f.id==="metal_primer_enamel");
                      const pDefaults = DW2_CONSUMPTION_DEFAULTS.metal_primer_enamel;
                      const p = it.primer || {};
                      const primerOn = !!p.on;
                      const updatePrimer = (patch) => update(it.id, { primer: {
                        on:false, finishType:"metal_primer_enamel",
                        materialRate: pFin?.defMat||0, labourRate: pFin?.defLabour||0,
                        brand:"", product:"", consumption:{...pDefaults},
                        ...p, ...patch,
                      }});
                      const primerArea = (Number(it.length)||0)*(Number(it.height)||0)*(Number(it.qty)||0);
                      const primerCost = primerOn ? primerArea*((Number(p.materialRate)||pFin?.defMat||0)+(Number(p.labourRate)||pFin?.defLabour||0)) : 0;
                      return (
                        <div style={{background:"#FEF3F2",border:"1px solid #FCA5A5",borderRadius:14,padding:"10px 12px",marginTop:8}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:primerOn?8:0}}>
                            <span style={{fontSize:11.5,fontWeight:800,color:"#B91C1C"}}>🔩 Metal Primer Coat (Stage 1)</span>
                            <button onClick={()=>updatePrimer({on:!primerOn})}
                              style={{padding:"5px 12px",minHeight:30,borderRadius:16,fontSize:10.5,fontWeight:700,cursor:"pointer",
                                border:`1.5px solid ${primerOn?"#B91C1C":C.border}`,background:primerOn?"#B91C1C":C.white,color:primerOn?"#fff":C.gray}}>
                              {primerOn?"On":"Off"}
                            </button>
                          </div>
                          {primerOn && <>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                              <input value={p.brand||""} onChange={e=>updatePrimer({brand:e.target.value})} placeholder="Primer Brand"
                                style={{fontSize:11,padding:"7px 9px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,boxSizing:"border-box"}}/>
                              <input value={p.product||""} onChange={e=>updatePrimer({product:e.target.value})} placeholder="Primer Product"
                                style={{fontSize:11,padding:"7px 9px",borderRadius:8,border:`1px solid ${C.border}`,background:C.white,boxSizing:"border-box"}}/>
                            </div>
                            <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"4px 8px"}}>
                              <DoorWindowConsumptionSection
                                item={{ length:it.length, height:it.height, qty:it.qty, finishType:"metal_primer_enamel", consumption:p.consumption }}
                                onUpdate={(updatedItem)=>updatePrimer({consumption:updatedItem.consumption})}/>
                            </div>
                            <div style={{marginTop:6,fontSize:10.5,color:"#B91C1C",fontWeight:700,textAlign:"right"}}>
                              Primer Cost: ₹{primerCost.toFixed(0)}
                            </div>
                          </>}
                        </div>
                      );
                    })()}
                  </>);
                })()}
              </div>

              {/* ── Per-item cost row ── */}
              <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:11.5,color:C.gray,fontWeight:600}}>
                <span>{c.area.toFixed(1)} sf</span>
                <span>Mat ₹{c.material.toFixed(0)}</span>
                <span>Lab ₹{c.labour.toFixed(0)}</span>
                <span style={{fontWeight:800,color:C.navy}}>Total ₹{c.total.toFixed(0)}</span>
              </div>
            </div>}
          </div>
        );
      })}

      {/* ── SECTION 4 — Summary ── */}
      <div style={{...PCARD,marginBottom:0,background:C.navy,border:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontWeight:700,letterSpacing:"0.05em"}}>SECTION TOTAL</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2}}>{totals.area.toFixed(1)} sf</div>
          </div>
          <div style={{fontSize:22,fontWeight:900,color:C.orange}}>₹{totals.total.toFixed(0)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── WALLPAPER MEASUREMENT MODULE (new: project.wallpaperItems / calcWallpaper) ──
function newWallpaperItem() {
  return {
    id: uid(),
    label: "",
    width: 0,
    height: 0,
    qty: 1,
    brand: "",
    collection: "",
    rollWidth: 1.75,
    rollLength: 32.8,
    rollPrice: 0,
    labourRate: 25,
    wastage: 10,
    notes: "",
  };
}

function calcWallpaperItem(it) {
  const area = Math.max(0, (Number(it.width) || 0) * (Number(it.height) || 0) * (Number(it.qty) || 0));
  const areaWithWastage = area * (1 + (Number(it.wastage) || 0) / 100);
  const requiredRolls = area > 0 ? Math.ceil(area / 50) : 0;
  const materialCost = requiredRolls * (Number(it.rollPrice) || 0);
  const labourCost = area * (Number(it.labourRate) || 0);
  const total = materialCost + labourCost;
  return { area, rollArea: 50, areaWithWastage, requiredRolls, materialCost, labourCost, total };
}

function calcWallpaper(items = []) {
  return items.reduce(
    (s, it) => {
      const c = calcWallpaperItem(it);
      return { area: s.area + c.area, materialCost: s.materialCost + c.materialCost, labourCost: s.labourCost + c.labourCost, total: s.total + c.total };
    },
    { area: 0, materialCost: 0, labourCost: 0, total: 0 }
  );
}

function WallpaperMeasurementTab({ items, onChange }) {
  const list = items || [];
  const update = (id, patch) => onChange(list.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const remove = id => onChange(list.filter(it => it.id !== id));
  const add = () => onChange([...list, newWallpaperItem()]);
  const totals = calcWallpaper(list);

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 12 }}>🖼 Wallpaper Measurement</div>

      {list.map(it => {
        const c = calcWallpaperItem(it);
        return (
          <div key={it.id} style={{ background: "#FAFAFA", border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                placeholder="Wall / Area Label"
                value={it.label}
                onChange={e => update(it.id, { label: e.target.value })}
                style={{ flex: 1, minWidth: 0, padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}
              />
              <button onClick={() => remove(it.id)} style={{ border: "none", background: C.redL, color: C.red, borderRadius: 8, padding: "8px 12px", minHeight: 40, minWidth: 40, cursor: "pointer", flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Width (ft)</label>
                <input type="number" value={zi(it.width)} onChange={e => update(it.id, { width: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Height (ft)</label>
                <input type="number" value={zi(it.height)} onChange={e => update(it.id, { height: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Qty</label>
                <input type="number" value={zi(it.qty)} onChange={e => update(it.id, { qty: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Wallpaper Brand</label>
                <input value={it.brand} onChange={e => update(it.id, { brand: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Collection / Design Name</label>
                <input value={it.collection} onChange={e => update(it.id, { collection: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Roll Width (ft)</label>
                <input type="number" value={zi(it.rollWidth)} onChange={e => update(it.id, { rollWidth: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Roll Length (ft)</label>
                <input type="number" value={zi(it.rollLength)} onChange={e => update(it.id, { rollLength: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Roll Price (₹)</label>
                <input type="number" value={zi(it.rollPrice)} onChange={e => update(it.id, { rollPrice: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Labour Rate (₹/sqft)</label>
                <input type="number" value={zi(it.labourRate)} onChange={e => update(it.id, { labourRate: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Wastage %</label>
                <input type="number" value={zi(it.wastage)} onChange={e => update(it.id, { wastage: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <textarea
              placeholder="Notes"
              value={it.notes}
              onChange={e => update(it.id, { notes: e.target.value })}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8, minHeight: 40, boxSizing: "border-box" }}
            />

            <div style={{ background: "#F5F3FF", borderRadius: 10, padding: "10px 14px", border: "1px solid #DDD6FE" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[["Area", `${c.area.toFixed(1)} sf`], ["Roll Area", `${c.rollArea.toFixed(1)} sf`], ["Required Rolls", `${c.requiredRolls}`], ["Material Cost", `₹${c.materialCost.toFixed(0)}`], ["Labour Cost", `₹${c.labourCost.toFixed(0)}`], ["Total", `₹${c.total.toFixed(0)}`]].map(([l, v]) => (
                  <div key={l} style={{ background: "rgba(124,58,237,0.08)", borderRadius: 7, padding: "5px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#7C3AED", fontWeight: 700 }}>{l}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#7C3AED" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={add}
        style={{ width: "100%", padding: 12, border: `1px dashed ${C.border}`, background: "#fff", borderRadius: 10, color: "#555", fontWeight: 700, cursor: "pointer", marginBottom: 14 }}
      >
        + Add Wallpaper Item
      </button>

      <div style={{ background: C.navy, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>SECTION TOTAL</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{totals.area.toFixed(1)} sf</div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.gold }}>₹{totals.total.toFixed(0)}</div>
      </div>
    </div>
  );
}

// ─── TEXTURE MEASUREMENT MODULE (new: project.textureItems / calcTexture) ──
const TEXTURE_TYPES = ["Roller Texture","Metallic Texture","Stucco","Travertino","Concrete Finish","Sand Texture","Custom Texture"];

function TX2_newTextureItem() {
  return {
    id: uid(),
    label: "",
    width: 0,
    height: 0,
    qty: 1,
    textureType: "Roller Texture",
    customType: "",
    brand: "",
    productName: "",
    materialRate: 35,
    labourRate: 25,
    coats: 1,
    coverage: 30,
    wastage: 15,
    notes: "",
  };
}

function TX2_calcTextureItem(it) {
  const area = Math.max(0, (Number(it.width) || 0) * (Number(it.height) || 0) * (Number(it.qty) || 0));
  const materialCost = area * (Number(it.materialRate) || 0) * (Number(it.coats) || 0);
  const labourCost = area * (Number(it.labourRate) || 0);
  const total = materialCost + labourCost;
  const litres = (Number(it.coverage) || 0) > 0 ? (area * (Number(it.coats) || 0)) / Number(it.coverage) : 0;
  const litresWithWaste = litres * (1 + (Number(it.wastage) || 0) / 100);
  return { area, materialCost, labourCost, total, litres, litresWithWaste };
}

function calcTexture(items = []) {
  return items.reduce(
    (s, it) => {
      const c = TX2_calcTextureItem(it);
      return { area: s.area + c.area, materialCost: s.materialCost + c.materialCost, labourCost: s.labourCost + c.labourCost, total: s.total + c.total, litres: s.litres + c.litres, litresWithWaste: s.litresWithWaste + c.litresWithWaste };
    },
    { area: 0, materialCost: 0, labourCost: 0, total: 0, litres: 0, litresWithWaste: 0 }
  );
}

// ─── MATERIAL CONSUMPTION SUMMARY — pure aggregation only ──────────────
// Reuses the consumption figures each module already computes for itself
// (calcConsumption, per-item calc*Item functions, calcTexture) and builds
// one flat list of raw material rows (category, material, brand, product,
// area, coverage, qty, unit). Nothing here recalculates area, coverage,
// coats, or cost from scratch — every number is either read directly off
// existing item/finishing state or produced by calling an existing calc
// function with that state, exactly as each module already does internally.
function buildMaterialConsumptionSummary(project) {
  const raw = [];
  // Merged (static + Master-Rates custom tiers) so labels stay accurate for
  // any custom finish, not just the built-in ones.
  const finMeta = getFinMeta();
  const extFinMeta = getExtFinMeta();

  // Helper: resolve brand/product/unit/coverage for an Interior finishing key.
  // Prefers MATERIAL_BRAND_PRODUCTS lookup (no hardcoded "asian / Apcolite Premium"
  // fallbacks); falls back to room's own brand/product if explicitly set.
  const resolveInteriorMaterial = (key, f, r) => {
    const matMeta = key === "putty" ? MATERIAL_BRAND_PRODUCTS.putty
      : key === "primer" ? MATERIAL_BRAND_PRODUCTS.primer
      : key === "paint" ? (f.type === "premium_emulsion" || f.type === "luxury_emulsion" || f.type === "designer_finish"
                          ? MATERIAL_BRAND_PRODUCTS.interior_premium_emulsion
                          : MATERIAL_BRAND_PRODUCTS.economy_emulsion)
      : key === "oilPaint" ? (f.type === "water_based" || f.type === "water_based_paint"
                          ? MATERIAL_BRAND_PRODUCTS.water_based_paint
                          : MATERIAL_BRAND_PRODUCTS.synthetic_enamel)
      : key === "topcoat" ? null
      : key === "polish" ? (f.type === "french_polish" || f.type === "french"
                          ? MATERIAL_BRAND_PRODUCTS.french_polish
                          : null)
      : null;
    let brand = "", product = "", unit = "L", coverage = 80;
    if (matMeta) { brand = matMeta.brand; product = matMeta.product; unit = matMeta.unit; coverage = matMeta.coverage; }
    // Override with per-item explicit brand/product if set
    if (r.brand) {
      const brandName = r.brand === "other" ? (r.customBrand || "") : (BRAND_PRODUCTS[r.brand]?.name || r.brand);
      if (brandName) brand = brandName;
    }
    if (f.customName) product = f.customName;
    return { brand, product, unit, coverage };
  };

  // Interior — every room's r.finishing[key] (putty/primer/paint/topcoat/
  // oilPaint/polish/texture), same shape & same calcConsumption() the
  // per-room Material Consumption panel already uses. Brand/Product now
  // resolved through MATERIAL_BRAND_PRODUCTS lookup, not hardcoded.
  (project.floors||[]).forEach(fl=>{
    (fl.rooms||[]).forEach(r=>{
      const net = calcNet(r);
      const fin = r.finishing || defFinishing(r.package);
      Object.entries(fin).forEach(([key,f])=>{
        if (!f || !f.on || !f.consumption) return;
        const area = f.useRoom ? net : (f.area||0);
        const c = f.consumption;
        const auto = calcConsumption(area, f.coats||1, c.coverage, c.wastage, c.packSize, c.ratePerL);
        const meta = finMeta[key];
        const typeLabel = meta?.types?.find(t=>t.id===f.type)?.label;
        const resolved = resolveInteriorMaterial(key, f, r);
        raw.push({
          category:"Interior", material: typeLabel || (meta?meta.label:key),
          brand: resolved.brand, product: resolved.product,
          area, coverage:c.coverage,
          qty: c.overrideLitres ? (c.manualLitres||0) : auto.litresWithWaste, unit: resolved.unit,
        });
      });
    });
  });

  // Helper: resolve brand/product/unit/coverage for an Exterior finishing key.
  const resolveExteriorMaterial = (key, f, cfg) => {
    const matMeta = key === "putty" ? MATERIAL_BRAND_PRODUCTS.exterior_putty
      : key === "primer" ? MATERIAL_BRAND_PRODUCTS.exterior_primer
      : key === "paint" ? MATERIAL_BRAND_PRODUCTS.premium_exterior_emulsion
      : null;
    let brand = "", product = "", unit = "L", coverage = 80;
    if (matMeta) { brand = matMeta.brand; product = matMeta.product; unit = matMeta.unit; coverage = matMeta.coverage; }
    if (cfg.brand) {
      const brandName = cfg.brand === "other" ? (cfg.customBrand || "") : (BRAND_PRODUCTS[cfg.brand]?.name || cfg.brand);
      if (brandName) brand = brandName;
    }
    if (f.customName) product = f.customName;
    return { brand, product, unit, coverage };
  };

  // Exterior — global exteriorConfig.finishing (or per-elevation override,
  // resolved the same way the Exterior Paint editor/PDF already resolve
  // it), applied per elevation via calcExteriorElevationNet.
  const globalExtConfig = project.exteriorConfig || defExteriorConfig();
  (project.exterior||[]).forEach(el=>{
    const cfg = resolveExteriorConfig(el, globalExtConfig);
    const fin = cfg.finishing || {};
    const net = calcExteriorElevationNet(el);
    Object.entries(fin).forEach(([key,f])=>{
      if (!f || !f.on || !f.consumption) return;
      const area = f.useRoom ? net : (f.area||0);
      const c = f.consumption;
      const auto = calcConsumption(area, f.coats||1, c.coverage, c.wastage, c.packSize, c.ratePerL);
      const meta = extFinMeta[key];
      const typeLabel = meta?.types?.find(t=>t.id===f.type)?.label;
      const resolved = resolveExteriorMaterial(key, f, cfg);
      raw.push({
        category:"Exterior", material: typeLabel || (meta?meta.label:key),
        brand: resolved.brand, product: resolved.product,
        area, coverage:c.coverage,
        qty: c.overrideLitres ? (c.manualLitres||0) : auto.litresWithWaste, unit: resolved.unit,
      });
    });
  });

  // Helper: resolve brand/product for Joinery items via lookup or item-level brand/product.
  const resolveJoineryMaterial = (it) => {
    const ft = it.finishType;
    let matMeta = null;
    if (ft === "french_polish" || ft === "french") matMeta = MATERIAL_BRAND_PRODUCTS.french_polish;
    else if (ft === "water_based" || ft === "water_based_paint") matMeta = MATERIAL_BRAND_PRODUCTS.water_based_paint;
    else if (ft === "synthetic_enamel" || ft === "oil_paint" || ft === "high_gloss_enamel" || ft === "pu_paint" || ft === "duco_paint" || ft === "metal_primer_enamel") matMeta = MATERIAL_BRAND_PRODUCTS.synthetic_enamel;
    let brand = matMeta ? matMeta.brand : "";
    let product = matMeta ? matMeta.product : "";
    const unit = matMeta ? matMeta.unit : "L";
    const coverage = matMeta ? matMeta.coverage : 80;
    if (it.brand) brand = it.brand;
    if (it.product) product = it.product;
    return { brand, product, unit, coverage };
  };

  // Joinery — Door/Window items (calcDoorWindowItem for net area, same
  // item.consumption/DW2_CONSUMPTION_DEFAULTS the item's own Material
  // Consumption panel reads) and Polish/Finishing items (calcPolishItem +
  // POLISH_CONSUMPTION_DEFAULTS). Brand/Product resolved via
  // MATERIAL_BRAND_PRODUCTS lookup; item-level brand/product override.
  (project.doorWindowItems||[]).forEach(it=>{
    const net = calcDoorWindowItem(it).area;
    const cons = it.consumption || DW2_CONSUMPTION_DEFAULTS[it.finishType] || DW2_CONSUMPTION_DEFAULTS.oil_paint;
    const auto = calcConsumption(net, cons.coats||1, cons.coverage, cons.wastage, cons.packSize, cons.ratePerL);
    const finT = DW2_FINISH_TYPES.find(f=>f.id===it.finishType);
    const resolved = resolveJoineryMaterial(it);
    raw.push({
      category:"Joinery", material: finT?finT.label:(it.finishType||"custom"),
      brand: resolved.brand, product: resolved.product,
      area: net, coverage:cons.coverage,
      qty: cons.overrideLitres ? (cons.manualLitres||0) : auto.litresWithWaste, unit: resolved.unit,
    });
    // Metal Primer stage (Stage 1) — separate purchase row from the Enamel
    // Top Coat row above, same measured area reused, same calcConsumption().
    if (it.primer && it.primer.on) {
      const pcons = it.primer.consumption || DW2_CONSUMPTION_DEFAULTS.metal_primer_enamel;
      const pauto = calcConsumption(net, pcons.coats||1, pcons.coverage, pcons.wastage, pcons.packSize, pcons.ratePerL);
      const pfinT = DW2_FINISH_TYPES.find(f=>f.id===(it.primer.finishType||"metal_primer_enamel"));
      const pResolved = resolveJoineryMaterial({ ...it, finishType: it.primer.finishType || "metal_primer_enamel", brand: it.primer.brand, product: it.primer.product });
      raw.push({
        category:"Joinery", material: pfinT?pfinT.label:"Metal Primer",
        brand: pResolved.brand, product: pResolved.product,
        area: net, coverage:pcons.coverage,
        qty: pcons.overrideLitres ? (pcons.manualLitres||0) : pauto.litresWithWaste, unit: pResolved.unit,
      });
    }
  });
  (project.polishItems||[]).forEach(item=>{
    const net = calcPolishItem(item).net;
    const cons = item.consumption || POLISH_CONSUMPTION_DEFAULTS[item.finishId] || POLISH_CONSUMPTION_DEFAULTS.enamel;
    const auto = calcConsumption(net, cons.coats||1, cons.coverage, cons.wastage, cons.packSize, cons.ratePerL);
    const finT = POLISH_FINISH_TYPES.find(f=>f.id===item.finishId);
    const resolved = resolveJoineryMaterial({ ...item, finishType: item.finishId, brand: item.brand, product: item.product });
    raw.push({
      category:"Joinery", material: finT?finT.label:(item.finishId||"custom"),
      brand: resolved.brand, product: resolved.product,
      area: net, coverage:cons.coverage,
      qty: cons.overrideLitres ? (cons.manualLitres||0) : auto.litresWithWaste, unit: resolved.unit,
    });
  });

  // Texture — per item via the existing TX2_calcTextureItem (same function
  // calcTexture() itself calls internally), so each item's own textureType/
  // brand/productName is preserved instead of collapsing into one generic
  // line. Quantity/coverage math unchanged — identical to what calcTexture
  // already produces, just not summed before brand/product are read.
  (project.TX2_textureItems||[]).forEach(it=>{
    const c = TX2_calcTextureItem(it);
    if (c.area<=0) return;
    raw.push({
      category:"Texture",
      material: (it.textureType==="Custom"?(it.customType||"Custom Texture"):it.textureType) || "Texture Material",
      brand: it.brand||"", product: it.productName||"",
      area:c.area, coverage: it.coverage||null, qty:c.litresWithWaste, unit:"L",
    });
  });

  // Wallpaper — calcWallpaperItem already returns requiredRolls per item;
  // summed here (not recalculated), shown in its own unit (rolls) since
  // wallpaper isn't litre-based. Brand/Product read off the item if set.
  (project.wallpaperItems||[]).forEach(it=>{
    const c = calcWallpaperItem(it);
    if (c.area<=0) return;
    raw.push({ category:"Wallpaper", material:"Wallpaper", brand:it.brand||"", product:it.product||"", area:c.area, coverage:null, qty:c.requiredRolls, unit:"rolls" });
  });

  // ── Merge duplicates: only when material + brand + product + unit all
  // match (per spec — category is carried along, not part of the merge
  // key, so a match spanning categories combines into one row and lists
  // every category it came from). Area and quantity are summed; coverage
  // keeps the first value seen for that key (it's the same catalog
  // coverage rate every merged row already shares, not recomputed).
  const merged = {};
  const order = [];
  raw.forEach(row=>{
    const key = `${row.material}|${row.brand}|${row.product}|${row.unit}`;
    if (!merged[key]) {
      merged[key] = { ...row, categories:new Set([row.category]) };
      order.push(key);
    } else {
      merged[key].area += row.area;
      merged[key].qty += row.qty;
      merged[key].categories.add(row.category);
    }
  });
  const rows = order.map(key=>{
    const m = merged[key];
    const CATEGORY_ORDER = ["Interior","Exterior","Joinery","Texture","Wallpaper"];
    const sortedCats = [...m.categories].sort((a,b)=>CATEGORY_ORDER.indexOf(a)-CATEGORY_ORDER.indexOf(b));
    return {
      ...m,
      category: sortedCats.join(" + "),
      brand: m.brand || "-",
      product: m.product || "-",
      _sortRank: CATEGORY_ORDER.indexOf(sortedCats[0]),
    };
  });

  // ── Sort final table by category: Interior, Exterior, Joinery, Texture,
  // Wallpaper. A merged row (e.g. "Interior + Exterior") sorts by whichever
  // of its categories comes first in that order.
  rows.sort((a,b)=>a._sortRank-b._sortRank);
  rows.forEach(r=>delete r._sortRank);

  return { rows, rawCount: raw.length };
}

function computeHardwareConsumables(project) {
  const totals = getProjectServiceTotals(project);
  const interiorArea = totals.interior?.netArea || 0;
  const exteriorArea = totals.exterior?.area || 0;
  
  let joineryArea = 0;
  (project.doorWindowItems || []).forEach(it => {
    const c = calcDoorWindowItem(it);
    joineryArea += c.area || 0;
  });
  (project.polishItems || []).forEach(item => {
    const c = calcPolishItem(item);
    joineryArea += c.net || 0;
  });
  
  const totalWallArea = interiorArea + exteriorArea;
  const totalArea = interiorArea + exteriorArea + joineryArea;
  
  const groundFloorArea = (project.floors || [])
    .filter(f => f.name === "Ground Floor")
    .reduce((sum, f) => sum + (f.rooms || []).reduce((s, r) => {
      const net = calcNet(r);
      return s + (r.ceiling?.on ? net + (r.ceiling.l * r.ceiling.w || 0) : net);
    }, 0), 0);
  
  let enamelPolishLitres = 0;
  (project.doorWindowItems || []).forEach(it => {
    const cons = it.consumption || DW2_CONSUMPTION_DEFAULTS[it.finishType] || DW2_CONSUMPTION_DEFAULTS.oil_paint;
    const auto = calcConsumption(calcDoorWindowItem(it).area, cons.coats || 1, cons.coverage, cons.wastage, cons.packSize, cons.ratePerL);
    enamelPolishLitres += cons.overrideLitres ? (cons.manualLitres || 0) : auto.litresWithWaste;
    if (it.primer && it.primer.on) {
      const pcons = it.primer.consumption || DW2_CONSUMPTION_DEFAULTS.metal_primer_enamel;
      const pauto = calcConsumption(calcDoorWindowItem(it).area, pcons.coats || 1, pcons.coverage, pcons.wastage, pcons.packSize, pcons.ratePerL);
      enamelPolishLitres += pcons.overrideLitres ? (pcons.manualLitres || 0) : pauto.litresWithWaste;
    }
  });
  (project.polishItems || []).forEach(item => {
    const cons = item.consumption || POLISH_CONSUMPTION_DEFAULTS[item.finishId] || POLISH_CONSUMPTION_DEFAULTS.enamel;
    const auto = calcConsumption(calcPolishItem(item).net, cons.coats || 1, cons.coverage, cons.wastage, cons.packSize, cons.ratePerL);
    enamelPolishLitres += cons.overrideLitres ? (cons.manualLitres || 0) : auto.litresWithWaste;
  });
  
  const consumables = [];
  const ov = project.hardwareItemOverrides || {};
  
  const sandingSheets = Math.ceil(totalWallArea / 100);
  if (sandingSheets > 0) consumables.push({
    material: "Sanding Paper (120/180 Grit)",
    brand: "-", product: "Sheets", unit: "sheets",
    qty: sandingSheets, area: totalWallArea,
    checked: ov["Sanding Paper (120/180 Grit)"]?.checked !== false,
    overrideQty: ov["Sanding Paper (120/180 Grit)"]?.qty
  });
  
  const maskingTapeRolls = Math.ceil(totalWallArea / 250);
  if (maskingTapeRolls > 0) consumables.push({
    material: "Masking Tape (1.5\")",
    brand: "-", product: "Rolls", unit: "rolls",
    qty: maskingTapeRolls, area: totalWallArea,
    checked: ov['Masking Tape (1.5")']?.checked !== false,
    overrideQty: ov['Masking Tape (1.5")']?.qty
  });
  
  const paintRollers = Math.max(1, Math.ceil(totalWallArea / 500));
  consumables.push({
    material: "Paint Rollers (9\")",
    brand: "-", product: "Units", unit: "pcs",
    qty: paintRollers, area: totalWallArea,
    checked: ov['Paint Rollers (9")']?.checked !== false,
    overrideQty: ov['Paint Rollers (9")']?.qty
  });
  
  consumables.push({
    material: "Paint Brushes (2\" & 3\")",
    brand: "-", product: "1 Pair", unit: "pair",
    qty: 1, area: totalArea,
    checked: ov['Paint Brushes (2" & 3")']?.checked !== false,
    overrideQty: ov['Paint Brushes (2" & 3")']?.qty
  });
  
  const floorProtection = Math.max(100, groundFloorArea);
  consumables.push({
    material: "Floor Protection Sheet",
    brand: "-", product: "Sq Ft", unit: "sqft",
    qty: floorProtection, area: groundFloorArea,
    checked: ov["Floor Protection Sheet"]?.checked !== false,
    overrideQty: ov["Floor Protection Sheet"]?.qty
  });
  
  if (enamelPolishLitres > 0) {
    const mtoThinner = Math.ceil(enamelPolishLitres / 2);
    consumables.push({
      material: "MTO Thinner",
      brand: "-", product: "Litres", unit: "L",
      qty: mtoThinner, area: 0,
      checked: ov["MTO Thinner"]?.checked !== false,
      overrideQty: ov["MTO Thinner"]?.qty
    });
  }
  
  return consumables;
}

function MaterialConsumptionSummary({ project, onUpdate }) {
  const { rows } = buildMaterialConsumptionSummary(project);
  if (rows.length === 0) return null;

  const isAuto = project.isAutoToolsMode !== false;
  const overrides = project.hardwareItemOverrides || {};
  const customItems = project.customHardwareItems || [];

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBrand, setCustomBrand] = useState("-");
  const [customProduct, setCustomProduct] = useState("");
  const [customUnit, setCustomUnit] = useState("pcs");
  const [customQty, setCustomQty] = useState("1");

  const autoHardwareItems = (() => {
    try { return computeHardwareConsumables(project); } catch { return []; }
  })();

  const updateOverride = (materialName, field, value) => {
    if (!onUpdate) return;
    onUpdate({
      hardwareItemOverrides: {
        ...(project.hardwareItemOverrides || {}),
        [materialName]: {
          ...(project.hardwareItemOverrides?.[materialName] || { checked: true }),
          [field]: value
        }
      }
    });
  };

  const addCustomItem = () => {
    const qty = parseFloat(customQty) || 0;
    if (!customName.trim() || qty <= 0 || !onUpdate) return;
    const newItem = {
      id: uid(),
      material: customName.trim(),
      brand: customBrand.trim() || "-",
      product: customProduct.trim() || "-",
      unit: customUnit,
      qty: qty
    };
    onUpdate({
      customHardwareItems: [...(project.customHardwareItems || []), newItem]
    });
    setCustomName("");
    setCustomBrand("-");
    setCustomProduct("");
    setCustomUnit("pcs");
    setCustomQty("1");
    setShowCustomForm(false);
  };

  const removeCustomItem = (id) => {
    if (!onUpdate) return;
    onUpdate({
      customHardwareItems: (project.customHardwareItems || []).filter(item => item.id !== id)
    });
  };

  const toggleAutoMode = () => {
    if (!onUpdate) return;
    onUpdate({ isAutoToolsMode: !project.isAutoToolsMode });
  };

  const getSelectedForPdf = () => {
    let selected = [];
    if (isAuto) {
      selected = autoHardwareItems.filter(item => item.checked !== false).map(item => ({
        ...item,
        qty: overrides[item.material]?.qty ?? item.qty
      }));
    } else {
      selected = MASTER_HARDWARE_CHECKLIST.filter(item => overrides[item.material]?.checked === true).map(item => ({
        ...item,
        qty: overrides[item.material]?.qty || item.defaultQty || 0
      }));
    }
    return selected.concat(customItems);
  };

  const groupedManualItems = MASTER_HARDWARE_CHECKLIST.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const CATEGORY_ICONS = {
    "Interior": "🏠", "Exterior": "🏗", "Wood & Metal": "🔩", "Texture": "🎨", "Wallpaper": "📜"
  };

  const renderRow = (item, idx, showOverride = true) => {
    const isChecked = item.checked !== false;
    const isCustom = !!item.id && !MASTER_HARDWARE_CHECKLIST.some(m => m.material === item.material);
    const displayQty = item.overrideQty ?? item.qty ?? item.defaultQty ?? 0;
    return (
      <div key={item.material} style={{ display: "grid", gridTemplateColumns: "0.45fr 1.3fr 1.5fr 0.6fr 0.8fr 0.5fr", minWidth: 520, padding: "7px 8px", fontSize: 10.5, borderTop: `1px solid ${C.border}`, alignItems: "center", background: idx % 2 ? "#FAFBFC" : C.white }}>
        <input 
          type="checkbox" 
          checked={isChecked} 
          onChange={e => updateOverride(item.material, "checked", e.target.checked)}
          disabled={!showOverride}
          style={{ width: 14, height: 14, accentColor: C.orange, cursor: showOverride ? "pointer" : "default" }}
        />
        <span style={{ fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.material || "-"}</span>
        <span style={{ color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.brand || item.product ? `${item.brand || ""} ${item.product || ""}`.trim() : "-"}
        </span>
        <span style={{ color: "#555" }}>{item.unit || "pcs"}</span>
        <input 
          type="number" 
          value={displayQty} 
          onChange={e => updateOverride(item.material, "qty", parseFloat(e.target.value) || 0)}
          min="0"
          step="0.01"
          disabled={!isChecked || !showOverride}
          style={{ width: 60, padding: "2px 4px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 10.5, textAlign: "right", opacity: (isChecked && showOverride) ? 1 : 0.5 }}
        />
        {isCustom && onUpdate ? (
          <button onClick={() => removeCustomItem(item.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }} title="Remove">✕</button>
        ) : <span />}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 6 }}>
        🛒 Purchase List
      </div>
      <div style={{ border: `1.5px solid ${C.navy}22`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.2fr 1.1fr 0.8fr 0.8fr", minWidth: 420, background: C.navy, padding: "6px 8px", fontSize: 8.5, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            <span>MATERIAL</span>
            <span>BRAND & PRODUCT</span>
            <span>EXACT REQUIREMENT</span>
            <span style={{ textAlign: "right" }}>RECOMMENDED PACKING</span>
            <span style={{ textAlign: "right" }}>FINAL ORDER QTY</span>
          </div>
          {rows.map((r, i) => {
            let packingDisplay = "-";
            let finalQtyDisplay = "-";
            try {
              const packing = computeOptimalPacking(r.qty || 0, r.unit || "L");
              packingDisplay = Array.isArray(packing) && packing.length > 0
                ? packing.map(p => `${p.qty} x ${p.size}${r.unit || "L"}`).join(" + ")
                : "-";
              finalQtyDisplay = `${computeFinalOrderQty(r.qty || 0, r.unit || "L")} ${r.unit || "L"}`;
            } catch (err) {
              if (import.meta.env.DEV) console.warn("Material consumption calculation error:", err);
            }
            const brandProduct = (r.brand || r.product) ? `${r.brand || ""} ${r.product || ""}`.trim() : "-";
            return (
              <div key={r.material + "|" + r.brand + "|" + r.product + "|" + r.unit} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.2fr 1.1fr 0.8fr 0.8fr", minWidth: 420, padding: "7px 8px", fontSize: 10.5, borderTop: `1px solid ${C.border}`, alignItems: "center", background: i % 2 ? "#FAFBFC" : C.white }}>
                <span style={{ fontWeight: 700, color: C.navy }}>{r.material || "-"}</span>
                <span style={{ color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brandProduct}</span>
                <span style={{ textAlign: "right", color: "#555" }}>{r.qty.toFixed(r.unit === "rolls" ? 0 : 2)} {r.unit}</span>
                <span style={{ textAlign: "right", fontSize: 9.5, color: "#555" }}>{packingDisplay}</span>
                <span style={{ textAlign: "right", fontWeight: 700, color: C.orange }}>{finalQtyDisplay}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>🔧 Hardware & Consumables</span>
          <span style={{ fontSize: 10, color: C.gray, marginLeft: 8 }}>{isAuto ? "Auto-Suggest" : "Manual Selection"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: isAuto ? C.green : C.gray, fontWeight: 700 }}>{isAuto ? "ON" : "OFF"}</span>
          <button onClick={toggleAutoMode} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: isAuto ? C.green : C.border, position: "relative", transition: "background 0.2s" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: isAuto ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
          <span style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>Auto-Suggest</span>
        </div>
      </div>

      <div style={{ marginTop: 10, border: `1.5px solid ${C.navy}22`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "grid", gridTemplateColumns: "0.45fr 1.3fr 1.5fr 0.6fr 0.8fr 0.5fr", minWidth: 520, background: C.navy, padding: "6px 8px", fontSize: 8.5, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            <span></span>
            <span>MATERIAL</span>
            <span>BRAND & SPECIFICATION</span>
            <span>UNIT</span>
            <span style={{ textAlign: "right" }}>QTY</span>
            <span></span>
          </div>
          
          {isAuto ? (
            autoHardwareItems.length > 0 ? autoHardwareItems.map((item, index) => {
              const ovQty = overrides[item.material]?.qty;
              const displayQty = ovQty !== undefined ? ovQty : item.qty;
              const isChecked = item.checked !== false;
              return (
                <div key={item.material} style={{ display: "grid", gridTemplateColumns: "0.45fr 1.3fr 1.5fr 0.6fr 0.8fr 0.5fr", minWidth: 520, padding: "7px 8px", fontSize: 10.5, borderTop: `1px solid ${C.border}`, alignItems: "center", background: index % 2 ? "#FAFBFC" : C.white }}>
                  <input 
                    type="checkbox" 
                    checked={isChecked} 
                    onChange={e => updateOverride(item.material, "checked", e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: C.orange, cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.material || "-"}</span>
                  <span style={{ color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.brand || item.product ? `${item.brand || ""} ${item.product || ""}`.trim() : "-"}
                  </span>
                  <span style={{ color: "#555" }}>{item.unit || "pcs"}</span>
                  <input 
                    type="number" 
                    value={displayQty} 
                    onChange={e => updateOverride(item.material, "qty", parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    disabled={!isChecked}
                    style={{ width: 60, padding: "2px 4px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 10.5, textAlign: "right", opacity: isChecked ? 1 : 0.5 }}
                  />
                  <span />
                </div>
              );
            }) : (
              <div style={{ padding: 14, textAlign: "center", color: C.gray, fontSize: 11 }}>No hardware items calculated for current project scope.</div>
            )
          ) : (
            Object.keys(groupedManualItems).map(cat => (
              <div key={cat}>
                <div style={{ background: C.navyL, padding: "5px 8px", fontSize: 9.5, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.03em", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{CATEGORY_ICONS[cat] || "📦"}</span> {cat}
                </div>
                {groupedManualItems[cat].map((item, idx) => {
                  const ov = overrides[item.material] || { checked: false };
                  return renderRow({ ...item, checked: ov.checked, overrideQty: ov.qty }, idx, true);
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {customItems.length > 0 && (
        <div style={{ marginTop: 10, border: `1.5px solid ${C.orange}44`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ display: "grid", gridTemplateColumns: "0.45fr 1.3fr 1.5fr 0.6fr 0.8fr 0.5fr", minWidth: 520, background: C.orange, padding: "6px 8px", fontSize: 8.5, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              <span></span>
              <span>CUSTOM ITEM</span>
              <span>BRAND / SPEC</span>
              <span>UNIT</span>
              <span style={{ textAlign: "right" }}>QTY</span>
              <span></span>
            </div>
            {customItems.map((item, idx) => renderRow(item, idx, false))}
          </div>
        </div>
      )}

      {!showCustomForm ? (
        <button onClick={() => setShowCustomForm(true)} style={{ marginTop: 10, padding: "8px 12px", background: C.white, color: C.navy, border: `1.5px dashed ${C.navy}44`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
          + Add Custom Hardware / Tool
        </button>
      ) : (
        <div style={{ marginTop: 10, background: C.white, border: `1.5px solid ${C.navy}22`, borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.gray, textTransform: "uppercase", marginBottom: 3, display: "block" }}>Item Name</label>
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g. Safety Goggles" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
          </div>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.gray, textTransform: "uppercase", marginBottom: 3, display: "block" }}>Unit</label>
            <select value={customUnit} onChange={e => setCustomUnit(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }}>
              <option value="pcs">pcs</option>
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="sheets">sheets</option>
              <option value="rolls">rolls</option>
              <option value="pair">pair</option>
              <option value="set">set</option>
              <option value="sqft">sqft</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.gray, textTransform: "uppercase", marginBottom: 3, display: "block" }}>Quantity</label>
            <input type="number" value={customQty} onChange={e => setCustomQty(e.target.value)} min="0" step="0.01" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addCustomItem} style={{ padding: "6px 12px", background: C.navy, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>Add</button>
            <button onClick={() => setShowCustomForm(false)} style={{ padding: "6px 12px", background: C.white, color: C.gray, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>Cancel</button>
          </div>
        </div>
      )}

      <button 
        onClick={() => generatePurchaseListPDF(project, getSelectedForPdf())} 
        style={{ marginTop: 10, padding: "8px 12px", background: C.navy, color: "#fff", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700 }}
      >
        📄 Download Purchase List PDF
      </button>
    </div>
  );
}

// ─── SHARED TOTALS ARCHITECTURE ─────────────────────────────────────
// Single source of truth for Summary screen, Quote Summary popup, and PDF.
// Uses only existing calc functions — no new formulas, just one place to
// combine them so all four surfaces (bottom bar excluded — it shows the
// current tab only) can never drift apart again.
function getProjectServiceTotals(project) {
  const withMat = project.quoteMode === "with_material";
  const pType = project.projectType || "fresh";

  // Interior — charges applied to Interior's own base only
  const pt = projectTotals(project);
  const intMat = withMat ? pt.mat : 0, intLab = withMat ? pt.lab : pt.labEx, intNet = pt.net;
  const intChargeCalc = calcSectionTotal(intMat, intLab, project.interiorCharges || defSectionCharges());

  // Exterior — charges applied to Exterior's own base only
  const extConfigured = calcExteriorConfiguredTotals(
    project.exterior || [],
    project.exteriorConfig || defExteriorConfig(),
    project.quoteMode,
    pType
  );
  const extNet = extConfigured.area;
  const extMat = extConfigured.material;
  const extLab = extConfigured.labour;
  const extChargeCalc = calcSectionTotal(extMat, extLab, project.exteriorCharges || defSectionCharges());

  // Polish / Enamel
  const polishCalc = calcPolish(project.polishItems || []);

  // Door & Window
  const dwCalc = calcDoorWindow(project.doorWindowItems || []);

  // Wallpaper
  const wpCalc = calcWallpaper(project.wallpaperItems || []);

  // Texture
  const txCalc = calcTexture(project.TX2_textureItems || []);

  const interior   = { area: Number(intNet)||0,         total: Number(intChargeCalc.total)||0 };
  const exterior   = { area: Number(extNet)||0, material: Number(extMat)||0, labour: Number(extLab)||0, total: Number(extChargeCalc.total)||0 };
  const polish     = { area: Number(polishCalc.net)||0,  total: Number(polishCalc.total)||0 };
  const doorwindow = { area: Number(dwCalc.area)||0,     total: Number(dwCalc.total)||0 };
  const wallpaper  = { area: Number(wpCalc.area)||0,     total: Number(wpCalc.total)||0 };
  const texture    = { area: Number(txCalc.area)||0,     total: Number(txCalc.total)||0 };

  // Grand Total Area = Interior + Exterior + All Specialty Line Items
  const grandArea  = interior.area + exterior.area + polish.area + doorwindow.area + wallpaper.area + texture.area;
  const grandTotal = interior.total + exterior.total + polish.total + doorwindow.total + wallpaper.total + texture.total;

  // Aggregate charge breakdown fields (restored for existing callers, e.g. PDF Charges
  // Summary). Each section's own charge amounts are already computed correctly and
  // separately above via intChargeCalc/extChargeCalc — these are just their sums, not
  // a second global discount/GST application.
  const combinedSubtotal = (Number(intChargeCalc.sub)||0) + (Number(extChargeCalc.sub)||0) + polish.total + doorwindow.total + wallpaper.total + texture.total;
  const additionalCharges = (Number((project.interiorCharges||{}).additionalCharges)||0) + (Number((project.exteriorCharges||{}).additionalCharges)||0);
  const discountAmount = (Number(intChargeCalc.discountAmt)||0) + (Number(extChargeCalc.discountAmt)||0);
  const taxableAmount = (Number(intChargeCalc.afterDiscount)||0) + (Number(extChargeCalc.afterDiscount)||0) + polish.total + doorwindow.total + wallpaper.total + texture.total;
  const gstAmount = (Number(intChargeCalc.gstAmt)||0) + (Number(extChargeCalc.gstAmt)||0);
  const intGstPct = Number((project.interiorCharges||{}).gst)||0;
  const extGstPct = Number((project.exteriorCharges||{}).gst)||0;
  const gstPct = intGstPct>0?intGstPct:(extGstPct>0?extGstPct:0);
  const intDiscPct = Number((project.interiorCharges||{}).discount)||0;
  const extDiscPct = Number((project.exteriorCharges||{}).discount)||0;
  const discountPct = intDiscPct>0?intDiscPct:(extDiscPct>0?extDiscPct:0);
  const finalTotal = grandTotal;

  return {
    interior, exterior, polish, doorwindow, wallpaper, texture, grandArea, grandTotal,
    intChargeCalc, extChargeCalc,
    combinedSubtotal, additionalCharges, discountPct, discountAmount, taxableAmount, gstAmount, gstPct, finalTotal,
    exteriorBreakdown: extConfigured.elevations
  };
}

// ─── Legacy Step 5 "Extras" detector (ARCH-002) ────────────────────
// Read-only. Never modifies project data. Used to warn in Quote Summary
// and block customer-facing PDF/finalization output while legacy Extras
// data exists, since it is excluded from grandTotal and could double-count
// against the current Joinery/Wallpaper/Texture modules.
function hasLegacyExtras(project) {
  const legacyDoorCount = (project.dwItems || []).length;
  const legacyWallpaperCount = (project.wpItems || []).length;
  const legacyTextureCount = (project.textureItems || []).length;
  return {
    // Treat legacy extras as valid line items instead of blocking errors
    hasLegacy: false, 
    actualLegacyDetected: legacyDoorCount > 0 || legacyWallpaperCount > 0 || legacyTextureCount > 0,
    legacyDoorCount,
    legacyWallpaperCount,
    legacyTextureCount,
  };
}

function TextureMeasurementTab({ items, onChange }) {
  const list = items || [];
  const update = (id, patch) => onChange(list.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const remove = id => onChange(list.filter(it => it.id !== id));
  const add = () => onChange([...list, TX2_newTextureItem()]);
  const totals = calcTexture(list);

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 12 }}>🧱 Texture Measurement</div>

      {list.map(it => {
        const c = TX2_calcTextureItem(it);
        return (
          <div key={it.id} style={{ background: "#FAFAFA", border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                placeholder="Wall / Area Label"
                value={it.label}
                onChange={e => update(it.id, { label: e.target.value })}
                style={{ flex: 1, minWidth: 0, padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}
              />
              <button onClick={() => remove(it.id)} style={{ border: "none", background: C.redL, color: C.red, borderRadius: 8, padding: "8px 12px", minHeight: 40, minWidth: 40, cursor: "pointer", flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Width (ft)</label>
                <input type="number" value={zi(it.width)} onChange={e => update(it.id, { width: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Height (ft)</label>
                <input type="number" value={zi(it.height)} onChange={e => update(it.id, { height: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Qty</label>
                <input type="number" value={zi(it.qty)} onChange={e => update(it.id, { qty: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: "#888" }}>Texture Type</label>
              <select
                value={it.textureType}
                onChange={e => update(it.id, { textureType: e.target.value })}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}
              >
                {TEXTURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {it.textureType === "Custom Texture" && (
              <input
                placeholder="Custom texture name"
                value={it.customType}
                onChange={e => update(it.id, { customType: e.target.value })}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8, boxSizing: "border-box" }}
              />
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Texture Brand</label>
                <input value={it.brand} onChange={e => update(it.id, { brand: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Product / Finish Name</label>
                <input value={it.productName} onChange={e => update(it.id, { productName: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Material Rate (₹/sqft)</label>
                <input type="number" value={zi(it.materialRate)} onChange={e => update(it.id, { materialRate: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Labour Rate (₹/sqft)</label>
                <input type="number" value={zi(it.labourRate)} onChange={e => update(it.id, { labourRate: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: "#888" }}>Coats</label>
                <input type="number" value={zi(it.coats)} onChange={e => update(it.id, { coats: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Coverage (sqft/L)</label>
                <input type="number" value={zi(it.coverage)} onChange={e => update(it.id, { coverage: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
              <div><label style={{ fontSize: 10, color: "#888" }}>Wastage %</label>
                <input type="number" value={zi(it.wastage)} onChange={e => update(it.id, { wastage: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, boxSizing: "border-box" }}/></div>
            </div>

            <textarea
              placeholder="Notes"
              value={it.notes}
              onChange={e => update(it.id, { notes: e.target.value })}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8, minHeight: 40, boxSizing: "border-box" }}
            />

            <div style={{ background: "#F5F3FF", borderRadius: 10, padding: "10px 14px", border: "1px solid #DDD6FE" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[["Area", `${c.area.toFixed(1)} sf`], ["Material Cost", `₹${c.materialCost.toFixed(0)}`], ["Labour Cost", `₹${c.labourCost.toFixed(0)}`], ["Total", `₹${c.total.toFixed(0)}`], ["Total Litres", `${c.litres.toFixed(2)} L`], ["Litres w/ Wastage", `${c.litresWithWaste.toFixed(2)} L`]].map(([l, v]) => (
                  <div key={l} style={{ background: "rgba(124,58,237,0.08)", borderRadius: 7, padding: "5px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#7C3AED", fontWeight: 700 }}>{l}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#7C3AED" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={add}
        style={{ width: "100%", padding: 12, border: `1px dashed ${C.border}`, background: "#fff", borderRadius: 10, color: "#555", fontWeight: 700, cursor: "pointer", marginBottom: 14 }}
      >
        + Add Texture Item
      </button>

      <div style={{ background: C.navy, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>SECTION TOTAL</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{totals.area.toFixed(1)} sf</div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.gold }}>₹{totals.total.toFixed(0)}</div>
      </div>
    </div>
  );
}

function PolishModule({ items, onChange, floors }) {
  // Accordion: only one Finishing Details item expanded at a time, UI-only (not saved).
  const [activeItemId, setActiveItemId] = useState(null);
  const prevLen = useRef(items.length);
  useEffect(() => {
    if (items.length > prevLen.current && items.length>0) {
      setActiveItemId(items[items.length-1].id); // newly added item (manual or preset) auto-opens
    }
    prevLen.current = items.length;
  }, [items]);

  const addItem = cat => onChange([...items, newPolishItem(cat)]);
  const upItem  = (id,patch) => onChange(items.map(x=>x.id===id?{...x,...patch}:x));
  const remItem = id => {
    const idx = items.findIndex(x=>x.id===id);
    const remaining = items.filter(x=>x.id!==id);
    if (remaining.length===0) {
      setActiveItemId(null);
    } else if (activeItemId===id) {
      // open the next remaining item, else the previous one
      const next = remaining[idx] || remaining[idx-1] || remaining[0];
      setActiveItemId(next.id);
    }
    onChange(remaining);
  };
  const totals  = calcPolish(items);
  const purpleL = "#F5F3FF";

  return <div>
    {items.length>0&&<div style={{background:C.navy,borderRadius:16,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700,letterSpacing:"0.06em"}}>POLISH / ENAMEL TOTAL</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:2}}>{totals.net.toFixed(1)} sf net</div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:22,fontWeight:900,color:"#A78BFA"}}>₹{totals.total.toFixed(0)}</div>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>Mat ₹{totals.mat.toFixed(0)} · Lab ₹{totals.lab.toFixed(0)}</div>
      </div>
    </div>}

    {/* Add Item section intentionally not rendered — Finishing Details only
        edits finishing for items added via Items & Measurement. addItem()
        and POLISH_ITEM_CATEGORIES are untouched — UI hidden only. */}

    {POLISH_ITEM_CATEGORIES.map(cat=>{
      const catItems = items.filter(i=>i.category===cat);
      if(!catItems.length) return null;
      const ct = calcPolish(catItems);
      return <div key={cat} style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:800,color:C.navy}}>{cat}</span>
          <span style={{fontSize:11,fontWeight:700,color:"#7C3AED",background:purpleL,borderRadius:20,padding:"3px 10px"}}>
            {ct.net.toFixed(1)} sf · ₹{ct.total.toFixed(0)}
          </span>
        </div>
        {catItems.map(item=>(
          <PolishItemCard key={item.id} item={item}
            onUpdate={patch=>upItem(item.id,patch)}
            onRemove={()=>remItem(item.id)}
            isExpanded={activeItemId===item.id}
            onOpen={()=>setActiveItemId(item.id)}
            floors={floors}/>
        ))}
      </div>;
    })}

    {items.length===0&&<div style={{textAlign:"center",padding:"32px 16px",color:C.gray}}>
      <div style={{fontSize:28,marginBottom:8}}>🪟</div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>No items added yet</div>
      <div style={{fontSize:11}}>Tap a category above to start measuring.</div>
    </div>}
  </div>;
}

// ─── WOOD, METAL & JOINERY — unified UI shell (JOINERY-001A) ──────
// Phase 1: visual shell only. Internally still uses the separate
// Door & Window (items) and Polish/Enamel (finishing) data + calc engines
// unchanged. No data migration, no calculation changes.
function JoineryModule({ doorWindowItems, onDoorWindowChange, polishItems, onPolishChange, doorWindowTotal, polishTotal, floors }) {
  const [mode, setMode] = useState("items"); // "items" | "finishing" — preserved data either way, just switches which panel renders
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presetConfirm, setPresetConfirm] = useState("");
  const topRef = useRef(null); // UI-only scroll target for Selected Items Summary's "Edit" action (PASS 5)
  const combinedTotal = (doorWindowTotal||0) + (polishTotal||0);
  const MODES = [
    { id:"items",     icon:"📐", label:"Items & Measurement" },
    { id:"finishing", icon:"🎨", label:"Finishing Details" },
  ];
  const flashConfirm = msg => {
    setPresetConfirm(msg);
    setTimeout(()=>setPresetConfirm(m=>m===msg?"":m), 2000);
  };
  const applyItemPreset = preset => {
    onDoorWindowChange([...(doorWindowItems||[]), createDoorWindowFromPreset(preset)]);
    flashConfirm(`${preset.label} added`);
  };
  const applyFinishPreset = preset => {
    onPolishChange([...(polishItems||[]), createPolishFromPreset(preset)]);
    flashConfirm(`${preset.label} added`);
  };
  return <div>
    <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:2}}>🚪 Wood, Metal & Joinery</div>
    <div style={{fontSize:11,color:C.gray,marginBottom:12}}>Doors, windows, furniture, grills, gates and surface finishes</div>

    {/* Mode toggle removed — Finishing Details had no independent workflow
        left (no add-item path, no measurement fields of its own); Wood,
        Metal & Joinery now shows Items & Measurement only. mode/setMode,
        PolishModule, and all polishItems data/handlers are untouched —
        mode simply stays "items" since nothing sets it to "finishing"
        anymore. */}

    {/* Quick Item Presets — optional faster entry, does not replace manual Add
        buttons. Items-mode only: duplicated the Measurement workflow when
        shown under Finishing Details, so it's hidden there (UI only —
        JOINERY_ITEM_PRESETS/JOINERY_FINISH_PRESETS and applyItemPreset/
        applyFinishPreset are untouched). */}
    {mode==="items"&&<div style={{border:`1.5px solid ${C.border}`,borderRadius:12,marginBottom:16,overflow:"hidden"}}>
      <button onClick={()=>setPresetsOpen(v=>!v)}
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
          padding:"10px 12px",cursor:"pointer",border:"none",background:C.white,textAlign:"left"}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,fontWeight:800,color:C.navy}}>⚡ Quick Item Presets</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:1}}>Add a common item with editable defaults</div>
        </div>
        <span style={{fontSize:11,color:"#aaa",flexShrink:0}}>{presetsOpen?"▲":"▼"}</span>
      </button>
      {presetsOpen&&<div style={{padding:"0 12px 12px"}}>
        {JOINERY_ITEM_PRESETS.map(g=>(
          <div key={g.group} style={{marginTop:10}}>
            <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:"0.05em",marginBottom:6}}>{g.group}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {g.presets.map(p=>(
                <button key={p.id} onClick={()=>applyItemPreset(p)}
                  style={{padding:"9px 14px",minHeight:36,borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${C.navy}33`,background:"#F8FAFC",color:C.navy}}>
                  + {p.buttonLabel}
                </button>
              ))}
            </div>
          </div>
        ))}
        {presetConfirm&&<div style={{marginTop:10,background:C.greenL,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,color:C.green}}>
          ✓ {presetConfirm}
        </div>}
      </div>}
    </div>}

    <div ref={topRef}/>
    {mode==="items"&&<DoorWindowMeasurementTab items={doorWindowItems||[]} onChange={onDoorWindowChange} floors={floors||[]}/>}
    {mode==="finishing"&&<PolishModule items={polishItems||[]} onChange={onPolishChange} floors={floors||[]}/>}

    {/* ── Selected Items Summary (RC-001 PASS 5.5 — visual polish) ──
        Items-mode only: duplicated this same summary when also shown under
        Finishing Details. Untouched for the Items & Measurement tab. */}
    {mode==="items" && ((doorWindowItems||[]).length>0 || (polishItems||[]).length>0) && (()=>{
      const dwRows = (doorWindowItems||[]).map(it=>{
        const c = calcDoorWindowItem(it);
        const finT = DW2_FINISH_TYPES.find(f=>f.id===it.finishType);
        return {
          id: it.id, source:"dw", name: it.customType || it.itemType || "Item",
          type: it.itemType, measurement: `${it.length||0} × ${it.height||0} ft`,
          area: c.area, finish: finT?.label || it.finishType || "—", qty: it.qty||1,
          brand: it.brand||"", product: it.product||"", floorIndex: it.floorIndex||0,
          material: c.material, total: c.total,
        };
      });
      const polRows = (polishItems||[]).map(it=>{
        const c = calcPolishItem(it);
        const finT = POLISH_FINISH_TYPES.find(f=>f.id===it.finishId);
        return {
          id: it.id, source:"pol", name: it.customType || it.category || "Item",
          type: it.category, measurement: `${it.l||0} × ${it.h||0} ft`,
          area: c.net, finish: finT?.label || it.finishId || "—", qty: it.qty||1,
          brand: "", product: "", floorIndex: it.floorIndex||0,
          material: c.mat, total: c.total,
        };
      });
      const rows = [...dwRows, ...polRows];
      const totalItems = rows.length;
      const totalArea = rows.reduce((s,r)=>s+(r.area||0),0);
      const totalMaterial = rows.reduce((s,r)=>s+(r.material||0),0);

      const deleteRow = (source, id) => {
        if (source==="dw") onDoorWindowChange((doorWindowItems||[]).filter(x=>x.id!==id));
        else onPolishChange((polishItems||[]).filter(x=>x.id!==id));
      };
      const scrollToList = () => topRef.current?.scrollIntoView({behavior:"smooth", block:"start"});

      return <div style={{marginTop:20,background:C.white,borderRadius:18,border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,30,60,0.05), 0 6px 16px rgba(15,30,60,0.06)",padding:"18px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:3}}>Selected Items Summary</div>
            <div style={{fontSize:11,color:C.gray}}>Review all measured items before finishing.</div>
          </div>
          <div style={{fontSize:12,fontWeight:600,color:C.green,background:"#EAF7EF",padding:"5px 12px",borderRadius:20,flexShrink:0,whiteSpace:"nowrap",width:"auto"}}>{totalItems} Item{totalItems!==1?"s":""} Added</div>
        </div>

        <div style={{height:1,background:"#EEF1F4",margin:"16px 0"}}/>

        <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:16}}>
          {(()=>{
            // Grouping uses only the existing r.type value (itemType/category
            // already on each item) and r.floorIndex (minimal descriptive
            // field, PASS 6.2-style — never read by any calculation).
            // "Cabinets" isn't a real itemType/category value so it's not
            // fabricated as an empty bucket; those items fall under Other
            // alongside Furniture/Wardrobe/etc.
            const BUCKETS = [
              { label:"Doors",    match:t=>t==="Door" },
              { label:"Windows",  match:t=>t==="Window" },
              { label:"Grills",   match:t=>t==="Window Grill"||t==="Safety Grill" },
              { label:"Railings", match:t=>t==="Railing" },
              { label:"Gates",    match:t=>t==="Gate" },
              { label:"Other",    match:()=>true },
            ];
            const renderTypeGroups = (rowSubset, keyPrefix) => {
              const finalGroups = BUCKETS.map(b=>({label:b.label, items:[]}));
              rowSubset.forEach(r=>{
                const bucketIdx = BUCKETS.findIndex(b=>b.match(r.type));
                finalGroups[bucketIdx===-1?BUCKETS.length-1:bucketIdx].items.push(r);
              });
              return finalGroups.filter(g=>g.items.length>0).map(group=>(
                <details key={keyPrefix+group.label} open={group.items.length===1} style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                  <summary style={{cursor:"pointer",listStyle:"none",padding:"10px 14px",background:"#F8FAFC",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,fontWeight:800,color:C.navy}}>
                    <span>{group.label} ({group.items.length})</span>
                  </summary>
                  <div style={{display:"flex",flexDirection:"column",gap:10,padding:"10px 10px"}}>
                     {group.items.map((r, index)=>(
           <div key={r.id ? r.source+r.id : `${r.source}-${index}-${Date.now()}`} style={{display:"flex",alignItems:"center",gap:16,padding:"13px 14px",background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 2px rgba(15,30,60,0.04), 0 2px 6px rgba(15,30,60,0.04)",minHeight:74}}>
              <div style={{width:44,height:44,borderRadius:10,background:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,overflow:"hidden"}}><ItemPreviewImage itemType={r.type} size={44} radius={9} fallback={r.source==="dw"?(DW2_ITEM_ICONS[r.type]||"🔧"):"🎨"}/></div>

              <div style={{flex:"1 1 26%",minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</div>
                <div style={{fontSize:10,color:C.gray,marginTop:2}}>{r.type}</div>
              </div>

              <div style={{flex:"1 1 30%",minWidth:0}}>
                <div style={{fontSize:10.5,color:C.navy,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.finish}</div>
                <div style={{fontSize:9.5,color:C.gray,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.brand||"—"}</div>
                <div style={{fontSize:9.5,color:C.gray,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.product||"—"}</div>
              </div>

              <div style={{fontSize:13,fontWeight:700,color:C.navy,flexShrink:0,width:28,textAlign:"center"}}>{r.qty}</div>

              <div style={{textAlign:"center",flexShrink:0,width:56}}>
                <div style={{fontSize:14,fontWeight:800,color:C.orange}}>{r.area.toFixed(2)}</div>
                <div style={{fontSize:9,color:C.gray,fontWeight:600,marginTop:1}}>sq ft</div>
              </div>

              <div style={{textAlign:"center",flexShrink:0,width:64}}>
                <div style={{fontSize:14,fontWeight:800,color:C.navy}}>₹{r.total.toFixed(0)}</div>
                <div style={{fontSize:9,color:C.gray,fontWeight:600,marginTop:1}}>Total</div>
              </div>

              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={scrollToList} title="Go to item list" style={{width:34,height:34,border:`1px solid ${C.border}`,background:C.white,color:C.gray,borderRadius:9,cursor:"pointer",fontSize:13,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background=C.white}>✎</button>
                <button onClick={()=>deleteRow(r.source,r.id)} title="Delete" style={{width:34,height:34,border:`1px solid ${C.border}`,background:C.white,color:C.gray,borderRadius:9,cursor:"pointer",fontSize:13,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#FEF2F2"} onMouseLeave={e=>e.currentTarget.style.background=C.white}>✕</button>
              </div>
            </div>
          ))}
                  </div>
                </details>
              ));
            };

            if (floors && floors.length>0) {
              return floors.map((f,fi)=>{
                const floorRows = rows.filter(r=>(r.floorIndex||0)===fi);
                if (floorRows.length===0) return null;
                return <div key={fi} style={{marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:8,paddingBottom:6,borderBottom:`2px solid ${C.orange}`}}>{f.name||`Floor ${fi+1}`}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {renderTypeGroups(floorRows, `f${fi}-`)}
                  </div>
                </div>;
              });
            }
            return renderTypeGroups(rows, "");
          })()}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 6px",textAlign:"center",boxShadow:"0 1px 2px rgba(15,30,60,0.04), 0 3px 8px rgba(15,30,60,0.05)"}}>
            <div style={{fontSize:8.5,color:C.gray,fontWeight:700,letterSpacing:"0.03em",textTransform:"uppercase",marginBottom:5}}>Total Items</div>
            <div style={{fontSize:19,fontWeight:800,color:C.navy}}>{totalItems}</div>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 6px",textAlign:"center",boxShadow:"0 1px 2px rgba(15,30,60,0.04), 0 3px 8px rgba(15,30,60,0.05)"}}>
            <div style={{fontSize:8.5,color:C.gray,fontWeight:700,letterSpacing:"0.03em",textTransform:"uppercase",marginBottom:5}}>Total Area</div>
            <div style={{fontSize:19,fontWeight:800,color:C.navy}}>{totalArea.toFixed(1)}<span style={{fontSize:10,fontWeight:600}}> sf</span></div>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 6px",textAlign:"center",boxShadow:"0 1px 2px rgba(15,30,60,0.04), 0 3px 8px rgba(15,30,60,0.05)"}}>
            <div style={{fontSize:8.5,color:C.gray,fontWeight:700,letterSpacing:"0.03em",textTransform:"uppercase",marginBottom:5}}>Est. Material</div>
            <div style={{fontSize:19,fontWeight:800,color:C.navy}}>₹{totalMaterial.toFixed(0)}</div>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 6px",textAlign:"center",boxShadow:"0 1px 2px rgba(15,30,60,0.04), 0 3px 8px rgba(15,30,60,0.05)"}}>
            <div style={{fontSize:8.5,color:C.gray,fontWeight:700,letterSpacing:"0.03em",textTransform:"uppercase",marginBottom:5}}>Total Value</div>
            <div style={{fontSize:20,fontWeight:900,color:C.orange}}>₹{combinedTotal.toFixed(0)}</div>
          </div>
        </div>
      </div>;
    })()}

    {/* Combined read-only summary — uses existing calc results from both modules, no new formulas */}
    <div style={{background:C.navy,borderRadius:16,padding:"14px 18px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.6)",padding:"3px 0"}}>
        <span>Items & Measurement Total</span><span style={{fontWeight:700,color:"#fff"}}>{inr(doorWindowTotal||0)}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.6)",padding:"3px 0"}}>
        <span>Finishing Details Total</span><span style={{fontWeight:700,color:"#fff"}}>{inr(polishTotal||0)}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"7px 0 0",marginTop:4,borderTop:"1px solid rgba(255,255,255,0.15)"}}>
        <span style={{fontWeight:700,color:"rgba(255,255,255,0.8)"}}>Combined Joinery Total</span>
        <span style={{fontWeight:900,color:C.orange}}>{inr(combinedTotal)}</span>
      </div>
    </div>
  </div>;
}

// Accordion measurement flow: Walls → Ceiling → Openings → Extra → Condition → Labour
// All calculation logic unchanged. Only navigation UX replaced.
function RoomEditor({ room, onUpdate, quoteMode, category }) {
  // openSec: which accordion section is expanded. Start on "walls".
  const [openSec,setOpenSec]=useState("walls");
  const [aw,setAw]=useState(0);

  // Migrate room on first render if needed
  const migratedRoom = migrateRoom(room);
  // If migration changed anything, propagate upward once
  useEffect(()=>{
    if(migratedRoom !== room) onUpdate(migratedRoom);
  // eslint-disable-next-line
  },[]);
  const r = migratedRoom || { walls:[], ceiling:{ on:false, l:0, w:0 }, openings:[], extraWalls:[], condition:"", roomHeight:10, useRoomHeight:true, type:"", customType:"", items:[] };

  // ── Defensive guard: if migration produced nothing (undefined room prop), bail safely ──
  if(!migratedRoom) return null;

  // ── All original calculations, unchanged ──
  const net=calcNet(r);
  const rc=calcRoom(r);
  const withMat=quoteMode==="with_material";

  // New-format wall handlers
  const upWall=(idx,patch)=>onUpdate({...r,walls:(r.walls||[]).map((w,i)=>i===idx?{...w,...patch}:w)});
  const addWall=()=>{ onUpdate({...r,walls:[...r.walls,newWall(`Wall ${r.walls.length+1}`)]}); setAw(r.walls.length); };
  const remWall=(idx)=>{
    if(r.walls.length<=1) return;
    const next=Math.min(aw,r.walls.length-2);
    onUpdate({...r,walls:r.walls.filter((_,i)=>i!==idx)});
    setAw(next);
  };

  // Legacy handlers (ceiling/openings/extraWalls unchanged)
  const upC=(f,v)=>onUpdate({...r,ceiling:{...r.ceiling,[f]:v}});
  const addEW=mode=>onUpdate({...r,extraWalls:[...(r.extraWalls||[]),newExtraWall(mode)]});
  const remEW=id=>onUpdate({...r,extraWalls:r.extraWalls.filter(x=>x.id!==id)});
  const upEW=(id,f,v)=>onUpdate({...r,extraWalls:r.extraWalls.map(x=>x.id===id?{...x,[f]:v}:x)});
  const addOp=(kind,mode="deduct")=>onUpdate({...r,openings:[...(r.openings||[]),newOpening(kind,mode)]});
  const remOp=id=>onUpdate({...r,openings:r.openings.filter(x=>x.id!==id)});
  const upOp=(id,f,v)=>onUpdate({...r,openings:r.openings.map(x=>x.id===id?{...x,[f]:v}:x)});

  const wallAdd = (r?.extraWalls || []).filter(e => e?.mode === "add").reduce((s, e) => s + (e?.length || e?.w || e?.width || 0) * (e?.height || e?.h || e?.height || 0), 0);
  const wallSub = (r?.extraWalls || []).filter(e => e?.mode === "subtract").reduce((s, e) => s + (e?.length || e?.w || e?.width || 0) * (e?.height || e?.h || e?.height || 0), 0);
  const openTotal = (r?.openings || []).reduce((s, o) => {
    const a = (o?.length || o?.w || o?.width || 0) * (o?.height || o?.h || o?.height || 0) * (o?.count || o?.qty || 1);
    return s + ((o?.mode || "deduct") === "add" ? -a : a);
  }, 0);

  // ── Accordion section definitions ──
  const rh = r?.roomHeight ?? 10;
  const wallsArea = (r?.walls || []).reduce((s, w) => s + calcWallArea(w, rh), 0);
  const ceilArea = (r?.ceiling?.l || r?.ceiling?.length || 0) * (r?.ceiling?.w || r?.ceiling?.width || 0);
  const SECTIONS = [
    { id: "walls", icon: "🏠", label: "Walls", badge: `${(r?.walls || []).length} wall${(r?.walls || []).length !== 1 ? "s" : ""} · ${wallsArea.toFixed(1)}sf`, badgeColor: wallsArea > 0 ? C.orange : C.gray },
    { id: "ceil", icon: "⬆", label: "Ceiling", badge: r?.ceiling?.on ? `${ceilArea.toFixed(1)} sf` : "Off", badgeColor: r?.ceiling?.on ? C.blue : C.gray },
    { id: "openings", icon: "🚪", label: "Openings", badge: `${(r?.openings || []).length} item${(r?.openings || []).length !== 1 ? "s" : ""}`, badgeColor: (r?.openings || []).length > 0 ? C.red : C.gray },
    { id: "extra", icon: "±", label: "Area Adjustments", badge: `${(r?.extraWalls || []).length} item${(r?.extraWalls || []).length !== 1 ? "s" : ""}`, badgeColor: (r?.extraWalls || []).length > 0 ? C.blue : C.gray },
    { id: "cond", icon: "🔍", label: "Condition", badge: r?.condition || "Good", badgeColor: r?.condition === "Good" ? C.green : C.orange },
  ];
  const secOrder=SECTIONS.map(s=>s.id);
  const curIdx=secOrder.indexOf(openSec);
  const goNext=()=>{ if(curIdx<secOrder.length-1) setOpenSec(secOrder[curIdx+1]); };

  // ── Compact 4-step nav: data-based completion (not open/active state) ──
  const wallsStepDone = (r?.walls || []).some(w => (w?.segments || []).some(s => (s?.w || s?.width || 0) > 0) && calcWallArea(w, rh) > 0);
  const ceilStepDone = !r?.ceiling?.on || ceilArea > 0;
  const openingsStepDone = (r?.openings || []).length > 0;
  const condStepDone = !!r?.condition;
  const NAV_STEPS = [
    { id: "walls", icon: "🏠", label: "Walls", done: wallsStepDone },
    { id: "ceil", icon: "⬆", label: "Ceiling", done: ceilStepDone },
    { id: "openings", icon: "🚪", label: "Openings", done: openingsStepDone },
    { id: "cond", icon: "🔍", label: "Condition", done: condStepDone },
  ];

  return <div>

    {/* ── Room type only — brand/package/finishing moved to Finish step ── */}
    <div style={{ marginBottom: 8 }}>
      <DropSel label="Room Type" value={r?.type || ""} onChange={v => onUpdate({ ...r, type: v, customType: v === "Custom" ? (r?.customType || "") : "" })} options={roomTypesForCategory(category).map(t => ({ value: t, label: t }))} />
      {r?.type === "Custom" && <div style={{ marginTop: 8 }}>
        <span style={LBL}>Custom Room Name</span>
        <input value={r?.customType || ""} onChange={e => onUpdate({ ...r, customType: e.target.value })}
          placeholder="e.g. Home Theatre, Server Room..."
          style={{ ...INP, fontSize: 13, padding: "8px 10px" }} />
      </div>}
    </div>

    {/* ── Net area summary strip ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,marginBottom:8}}>
      {[["Walls",wallsArea,"#555"],["+ Add",wallAdd,C.green],["− Sub",wallSub,C.red],["Open",Math.abs(openTotal),C.red],["Net",net,C.orange]].map(([l,v,col])=>(
        <div key={l} style={{background:l==="Net"?C.orangeL:"#F8FAFC",borderRadius:9,padding:"6px 4px",textAlign:"center",border:`1px solid ${l==="Net"?C.orange+"44":C.border}`}}>
          <div style={{fontSize:9,color:"#aaa",fontWeight:700}}>{l}</div>
          <div style={{fontSize:13,fontWeight:800,color:col}}>{v.toFixed(1)}</div>
        </div>
      ))}
    </div>

    {/* ── Compact step nav: Walls / Ceiling / Openings / Condition ── */}
    <div style={{display:"flex",gap:6,marginBottom:8}}>
      {NAV_STEPS.map(s=>{
        const active=openSec===s.id;
        const done=s.done;
        return <button key={s.id} onClick={()=>setOpenSec(s.id)}
          style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            padding:"7px 4px",borderRadius:10,cursor:"pointer",
            border:`2px solid ${active?C.navy:done?C.orange:C.border}`,
            background:active?C.navy:done?C.orangeL:C.white,
            transition:"all 0.15s"}}>
          <span style={{fontSize:14,lineHeight:1,
            color:active?"#fff":done?C.orange:C.gray}}>
            {done&&!active?"✓":s.icon}
          </span>
          <span style={{fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.04em",
            color:active?"#fff":done?C.orange:C.gray}}>
            {s.label}
          </span>
        </button>;
      })}
    </div>

    {/* ── Accordion sections ── */}
    <div style={{borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:8}}>

      {/* WALLS */}
      {(()=>{
        const isOpen=openSec==="walls";
        const activeWall = (r?.walls && r.walls.length > 0) ? (r.walls[aw] || r.walls[0]) : {};
        return <div style={{borderBottom:`1px solid ${C.border}`}}>
          <SecHead sec={SECTIONS[0]} isOpen={isOpen} onToggle={setOpenSec}/>
          {isOpen&&<div style={{padding:"12px 14px 14px",background:C.white}}>

            {/* ── Room height control ── */}
            <div style={{background:"#F8FAFC",borderRadius:10,padding:"8px 12px",marginBottom:10,
              border:`1px solid ${C.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:1}}>Default Wall Height</div>
                  <div style={{fontSize:10,color:C.gray}}>Used automatically for all walls. Change only if the whole room height is different.</div>
                </div>
                <div style={{width:90}}>
                  <NumInp value={r.roomHeight??10} onChange={v=>onUpdate({...r,roomHeight:v})}/>
                </div>
              </div>
              <button onClick={()=>onUpdate({...r,useRoomHeight:!(r.useRoomHeight!==false)})}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"8px 12px",borderRadius:8,border:"none",cursor:"pointer",
                  background:(r.useRoomHeight!==false)?C.green:"#E5E7EB"}}>
                <span style={{fontSize:11,fontWeight:700,color:(r.useRoomHeight!==false)?"#fff":C.gray}}>
                  Apply default height to all walls
                </span>
                <span style={{fontSize:11,fontWeight:800,color:(r.useRoomHeight!==false)?"#fff":C.gray,
                  background:"rgba(255,255,255,0.25)",borderRadius:20,padding:"2px 10px"}}>
                  {(r.useRoomHeight!==false)?"ON":"OFF"}
                </span>
              </button>
            </div>

            {/* ── Wall selector tabs ── */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Walls</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                {(r?.walls || []).map((w, wi) => {
                  const wa = calcWallArea(w, r?.roomHeight ?? 10);
                  const sel = wi === aw;
                  return <button key={w?.id || wi} onClick={() => setAw(wi)}
                    style={{
                      flexShrink: 0, padding: "10px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", textAlign: "left",
                      border: `2px solid ${sel ? C.orange : C.border}`,
                      background: sel ? C.orangeL : "#F8FAFC",
                      color: sel ? C.orange : C.gray, transition: "all 0.15s"
                    }}>
                    <div>{w?.label || `Wall ${wi + 1}`}</div>
                    <div style={{ fontSize: 9, color: sel ? C.orange : "#bbb", marginTop: 1 }}>
                      {(w?.segments || []).length} seg · {wa.toFixed(1)}sf
                    </div>
                  </button>;
                })}
                <button onClick={addWall}
                  style={{
                    flexShrink: 0, padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", border: `2px dashed ${C.green}`,
                    background: C.greenL, color: C.green, transition: "all 0.15s"
                  }}>
                  + Wall
                </button>
              </div>
            </div>

            {/* ── Active wall editor ── */}
            {activeWall && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>{activeWall?.label || `Wall ${aw + 1}`}</span>
                {(r?.walls || []).length > 1 && <button onClick={() => remWall(aw)}
                  style={{
                    background: C.redL, border: "none", borderRadius: 8, padding: "5px 12px",
                    color: C.red, cursor: "pointer", fontSize: 11, fontWeight: 700
                  }}>Remove Wall</button>}
              </div>
              <WallEditor
                wall={activeWall}
                roomHeight={r?.roomHeight ?? 10}
                useRoomHeight={r?.useRoomHeight !== false}
                onUpdate={patch => upWall(aw, patch)}
              />
            </div>}

          </div>}
        </div>;
      })()}

      {/* CEILING */}
      {(()=>{
        const isOpen=openSec==="ceil";
        return <div style={{borderBottom:`1px solid ${C.border}`}}>
          {isOpen&&<div style={{padding:"12px 14px 14px",background:C.white}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.navy}}>Include Ceiling</div>
                <div style={{fontSize:11,color:C.gray,marginTop:2}}>Toggle if ceiling is to be painted</div>
              </div>
              <button onClick={()=>upC("on",!r.ceiling.on)}
                style={{background:r.ceiling.on?C.green:"#E5E7EB",color:r.ceiling.on?"#fff":C.gray,
                  border:"none",borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer",
                  minWidth:72,transition:"all 0.2s"}}>
                {r.ceiling.on?"ON":"OFF"}
              </button>
            </div>
            {r?.ceiling?.on && <>
              <DimRow wVal={r?.ceiling?.l || r?.ceiling?.length || 0} hVal={r?.ceiling?.w || r?.ceiling?.width || 0} onW={v => upC("l", v)} onH={v => upC("w", v)} wLabel="LENGTH (ft)" hLabel="WIDTH (ft)" />
              <div style={{ background: C.blueL, borderRadius: 10, padding: "8px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>Ceiling Area</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.blue }}>{ceilArea.toFixed(2)} sf</span>
              </div>
            </>}
          </div>}
        </div>;
      })()}

      {/* OPENINGS */}
      {(() => {
        const isOpen = openSec === "openings";
        // ── These totals feed the existing net area calculation — unchanged ──
        const ded = (r?.openings || []).filter(o => o?.mode !== "add").reduce((s, o) => s + (o?.w || o?.width || 0) * (o?.h || o?.height || 0) * (o?.count || o?.qty || 1), 0);
        const add = (r?.openings || []).filter(o => o?.mode === "add").reduce((s, o) => s + (o?.w || o?.width || 0) * (o?.h || o?.height || 0) * (o?.count || o?.qty || 1), 0);
        const dedItems = (r?.openings || []).filter(o => o?.mode !== "add");
        const addItems = (r?.openings || []).filter(o => o?.mode === "add");

        const OpCard_upOp = upOp; const OpCard_remOp = remOp; // props for hoisted OpCard

        return <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <SecHead sec={SECTIONS[2]} isOpen={isOpen} onToggle={setOpenSec} />
          {isOpen && <div style={{ padding: "12px 14px 14px", background: C.white }}>

            {/* ── A. DEDUCTIONS ── */}
            <div style={{background:C.redL,borderRadius:12,padding:"12px 14px",marginBottom:16,
              border:`1.5px solid ${C.red}33`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:16}}>🔴</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.red}}>Deductions</div>
                  <div style={{fontSize:11,color:C.red,opacity:.75}}>These reduce the paintable area</div>
                </div>
                {ded>0&&<span style={{fontSize:12,fontWeight:800,color:C.red,background:"#fff",
                  borderRadius:20,padding:"3px 10px",border:`1px solid ${C.red}44`}}>
                  −{ded.toFixed(1)} sf
                </span>}
              </div>
              {/* Add buttons */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:dedItems.length>0?12:0}}>
                {[["Window","🪟"],["Door","🚪"]].map(([kind,icon])=>(
                  <button key={kind} onClick={()=>addOp(kind,"deduct")}
                    style={{padding:"12px 8px",borderRadius:10,border:`2px solid ${C.red}`,
                      background:"#fff",color:C.red,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
                    {icon} {kind} −
                    <div style={{fontSize:9,fontWeight:400,opacity:.7,marginTop:2}}>tap to add</div>
                  </button>
                ))}
              </div>
              {/* Deduction cards */}
              {dedItems.length===0&&<div style={{textAlign:"center",color:C.red,opacity:.5,padding:"8px 0",fontSize:12}}>
                No deductions added
              </div>}
              {dedItems.map(op=><OpCard key={op.id} op={op} upOp={OpCard_upOp} remOp={OpCard_remOp}/>)}
            </div>

            {/* ── B. ADDITIONS ── */}
            <div style={{background:C.greenL,borderRadius:12,padding:"12px 14px",marginBottom:16,
              border:`1.5px solid ${C.green}33`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:16}}>🟢</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.green}}>Additions</div>
                  <div style={{fontSize:11,color:C.green,opacity:.75}}>These increase the paintable area</div>
                </div>
                {add>0&&<span style={{fontSize:12,fontWeight:800,color:C.green,background:"#fff",
                  borderRadius:20,padding:"3px 10px",border:`1px solid ${C.green}44`}}>
                  +{add.toFixed(1)} sf
                </span>}
              </div>
              {/* Add buttons */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:addItems.length>0?12:0}}>
                {[["Window","🪟"],["Door","🚪"],["Grill","🔲"],["Frame","🖼"],["Custom","✏️"]].map(([kind,icon])=>(
                  <button key={kind} onClick={()=>addOp(kind,"add")}
                    style={{padding:"10px 4px",borderRadius:10,border:`2px solid ${C.green}`,
                      background:"#fff",color:C.green,fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
                    {icon}<div style={{fontSize:8,marginTop:2,fontWeight:600}}>{kind}</div>
                  </button>
                ))}
              </div>
              {/* Addition cards */}
              {addItems.length===0&&<div style={{textAlign:"center",color:C.green,opacity:.5,padding:"8px 0",fontSize:12}}>
                No additions added
              </div>}
              {addItems.map(op=><OpCard key={op.id} op={op} upOp={OpCard_upOp} remOp={OpCard_remOp}/>)}
            </div>

            {/* ── Net summary ── */}
            {(r.openings||[]).length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {ded>0&&<div style={{background:C.redL,borderRadius:10,padding:"10px 12px",
                display:"flex",justifyContent:"space-between",alignItems:"center",
                border:`1px solid ${C.red}33`}}>
                <span style={{fontSize:12,fontWeight:700,color:C.red}}>Total Deducted</span>
                <span style={{fontSize:15,fontWeight:800,color:C.red}}>−{ded.toFixed(2)} sf</span>
              </div>}
              {add>0&&<div style={{background:C.greenL,borderRadius:10,padding:"10px 12px",
                display:"flex",justifyContent:"space-between",alignItems:"center",
                border:`1px solid ${C.green}33`}}>
                <span style={{fontSize:12,fontWeight:700,color:C.green}}>Total Added</span>
                <span style={{fontSize:15,fontWeight:800,color:C.green}}>+{add.toFixed(2)} sf</span>
              </div>}
            </div>}
          </div>}
        </div>;
      })()}

      {/* EXTRA WALLS */}
      {(()=>{
        const isOpen=openSec==="extra";
        return <div style={{borderBottom:`1px solid ${C.border}`}}>
          {isOpen&&<div style={{padding:"12px 14px 14px",background:C.white}}>
            <div style={{background:C.blueL,borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12,color:C.blue,fontWeight:600}}>
              Add extra surfaces or deduct double-counted areas (e.g. columns, pilasters).
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <button onClick={()=>addEW("add")} style={{padding:"14px 8px",borderRadius:12,border:`2px solid ${C.green}`,background:C.greenL,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
                ➕ Add Surface<div style={{fontSize:10,fontWeight:400,opacity:.8,marginTop:2}}>adds to total</div>
              </button>
              <button onClick={()=>addEW("subtract")} style={{padding:"14px 8px",borderRadius:12,border:`2px solid ${C.red}`,background:C.redL,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
                ➖ Remove Area<div style={{fontSize:10,fontWeight:400,opacity:.8,marginTop:2}}>deducts from total</div>
              </button>
            </div>
            {(r?.extraWalls || []).length === 0 && <div style={{ textAlign: "center", color: "#bbb", padding: "12px 0", fontSize: 13 }}>No extra walls added</div>}
            {(r?.extraWalls || []).map(ew => (
              <div key={ew?.id || Math.random()} style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: `2px solid ${ew?.mode === "add" ? C.green + "44" : C.red + "44"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: ew?.mode === "add" ? C.greenL : C.redL, color: ew?.mode === "add" ? C.green : C.red, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>{ew?.mode === "add" ? "+ ADD" : "− DEDUCT"}</span>
                    <input value={ew?.label || ""} onChange={e => upEW(ew?.id, "label", e.target.value)}
                      style={{
                        fontSize: 12, fontWeight: 700, color: C.navy, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: "6px 10px", background: C.white, outline: "none", width: 100
                      }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: ew?.mode === "add" ? C.green : C.red, fontWeight: 700 }}>{ew?.mode === "add" ? "+" : "-"}{fmt((ew?.w || ew?.width || 0) * (ew?.h || ew?.height || 0))} sf</span>
                    <button onClick={() => remEW(ew?.id)} style={{ background: C.redL, border: "none", borderRadius: 8, padding: "6px 10px", color: C.red, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 1fr", alignItems: "end", gap: 8 }}>
                  <div><div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, marginBottom: 4 }}>W (ft)</div><NumInp small value={ew?.w || ew?.width || 0} onChange={v => upEW(ew?.id, "w", v)} /></div>
                  <div style={{ textAlign: "center", fontSize: 16, color: "#ccc", fontWeight: 700, paddingBottom: 8 }}>×</div>
                  <div><div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, marginBottom: 4 }}>H (ft)</div><NumInp small value={ew?.h || ew?.height || 0} onChange={v => upEW(ew?.id, "h", v)} /></div>
                </div>
              </div>
            ))}
          </div>}
        </div>;
      })()}

      {/* CONDITION */}
      {(() => {
        const isOpen = openSec === "cond";
        return <div style={{ borderBottom: `1px solid ${C.border}` }}>
          <SecHead sec={SECTIONS[4]} isOpen={isOpen} onToggle={setOpenSec} />
          {isOpen && <div style={{ padding: "12px 14px 14px", background: C.white }}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Record wall condition for accurate surface preparation estimates.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {WALL_CONDS.map(cnd => {
                const sel = r?.condition === cnd;
                const isGood = cnd === "Good";
                return <button key={cnd} onClick={() => onUpdate({ ...r, condition: cnd })}
                  style={{
                    padding: "12px 10px", fontSize: 12, fontWeight: 700, borderRadius: 12, textAlign: "left",
                    border: `2px solid ${sel ? (isGood ? C.green : C.orange) : C.border}`,
                    background: sel ? (isGood ? C.greenL : C.orangeL) : C.white,
                    color: sel ? (isGood ? C.green : C.orange) : C.gray, cursor: "pointer"
                  }}>
                  {COND_ICONS[cnd]} {cnd}
                </button>;
              })}
            </div>
            {r?.condition !== "Good" && <>
              <Inp label="Condition Notes" value={r?.conditionNotes || ""} onChange={v => onUpdate({ ...r, conditionNotes: v })} placeholder="Describe the condition..." rows={3} />
              <div style={{ background: C.orangeL, borderRadius: 10, padding: "10px 12px", marginTop: 10, fontSize: 12, color: "#c97a40", fontWeight: 600 }}>⚠ Additional surface prep may increase cost.</div>
            </>}
            <div style={{ fontSize: 10, fontWeight: 700, color: C.gray, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 4 }}>Condition Photos</div>
            <CondPhotoManager photos={r?.conditionPhotos || []} onChange={v => onUpdate({ ...r, conditionPhotos: v })} placeholder="e.g. North Wall Crack, Ceiling Dampness" />
          </div>}
        </div>;
      })()}

    </div>{/* end accordion */}

  </div>;
}

// ─── EXTERIOR MATERIAL PANEL ──────────────────────────────────────
// PAINT-EXT-002C — presentation-only rebuild (premium Interior design
// language). No state, handlers, calculations, callbacks, schema or
// persistence changed. Every control below is the exact same control
// that existed before (same props, same onChange calls) — only the
// JSX/markup/styling wrapping them is new. No fields invented; the
// "Default for New Rooms (Exterior)" section named in the ticket does
// not exist inside this component (it lives elsewhere, gated off
// project.defaultPkg/defaultBrand under the Interior tab) so there is
// nothing to remove here. Likewise "Exterior Base Surface / Substrate",
// "Package Type" tiles, "Paint System (Coats)" and "Dry Film Thickness"
// have no backing state/schema anywhere in this file — they are not
// added, per the no-new-fields constraint.
const PCARD = {
  background:C.white,
  borderRadius:16,
  padding:"20px 22px",
  marginBottom:16,
  border:`1px solid ${C.border}`,
  boxShadow:"0 1px 2px rgba(15,30,60,0.05), 0 6px 16px rgba(15,30,60,0.06)",
};
const PSECTION_TITLE = {
  fontSize:13,
  fontWeight:800,
  color:C.navy,
  marginBottom:14,
  display:"flex",
  alignItems:"center",
  gap:9,
  letterSpacing:"0.01em",
};
const PICON = { fontSize:16, lineHeight:1, display:"inline-flex", alignItems:"center", justifyContent:"center", width:18, flexShrink:0 };
const PSUBHEAD = { fontSize:11.5, fontWeight:800, color:C.navy, marginBottom:14, display:"flex", alignItems:"center", gap:9, letterSpacing:"0.01em" };

function ExteriorMaterialPanel({ config, onChange, quoteMode, extNet, paintingType = "fresh" }) {
  const [showBrand,setShowBrand]=useState(false);
  const [showFinishing,setShowFinishing]=useState(false);
  const withMat=quoteMode==="with_material";
  const pkg=PACKAGES[config.package]||PACKAGES.premium;
  const productName=getProductName(config.brand,config.package,"exterior");
  const brandName=config.brand==="other"?(config.customBrand||"Other"):BRAND_PRODUCTS[config.brand]?.name||"—";
  const finishing=config.finishing||defExteriorFinishing(config.package, paintingType);
  const matCost=withMat?calcExteriorMaterialCost(finishing,extNet||0, paintingType):0;
  const applyPkg=v=>{const pObj=PACKAGES[v]||PACKAGES.premium;return onChange({...config,package:v,finishing:defExteriorFinishing(v, paintingType),labourRate:pObj?.labour??0,labourRateExcl:pObj?.labourExcl??0});};
  const labCost=withMat?calcExteriorLabourCost(config,extNet||0):calcExteriorLabourCostExcl(config,extNet||0);
  if(!withMat) return null;

  return <div style={{marginBottom:16}}>

    {/* ── Premium Package (package selector + brand) ── */}
    <div style={PCARD}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div style={PSECTION_TITLE}><span style={PICON}>{pkg.icon}</span><span>{pkg.label} Package</span></div>
      </div>

      <span style={LBL}>Package Type</span>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:8,marginBottom:18}}>
        {Object.values(PACKAGES).map(p=>{
          const sel=config.package===p.id;
          return <button key={p.id} onClick={()=>applyPkg(p.id)} style={{
              height:56,borderRadius:12,cursor:"pointer",display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:3,
              border:`1.5px solid ${sel?C.navy:C.border}`,
              background:sel?C.navy:C.white,
              transition:"all 0.15s",
            }}>
            <span style={{fontSize:15}}>{p.icon}</span>
            <span style={{fontSize:11,fontWeight:700,color:sel?"#fff":C.gray}}>{p.label}</span>
          </button>;
        })}
      </div>

      <span style={LBL}>Paint Brand</span>
      <button onClick={()=>setShowBrand(true)} style={{width:"100%",height:44,boxSizing:"border-box",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"0 14px",fontSize:13,fontWeight:700,cursor:"pointer",background:"#FAFBFC",color:"#111",display:"flex",alignItems:"center",gap:10,transition:"border-color 0.15s",marginBottom:18}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
        <div style={{borderRadius:7,overflow:"hidden",flexShrink:0}}><BrandLogo id={config.brand} size={24}/></div>
        <div style={{flex:1,textAlign:"left",minWidth:0}}>
          <div style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{brandName}</div>
          {productName&&<div style={{fontSize:9,color:C.orange,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{productName}</div>}
        </div>
        <span style={{fontSize:10,color:"#aaa",flexShrink:0}}>▾</span>
      </button>

      <div style={{background:pkg.colorL,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:12,fontWeight:700,color:pkg.color}}>{pkg.icon} {pkg.label}{productName?` · ${productName}`:""}</span>
        <span style={{fontSize:12,color:pkg.color,fontWeight:800}}>₹{matCost.toFixed(0)} mat</span>
      </div>
    </div>

    {/* ── Finishing Details (Products only — Labour extracted to ExteriorLabourPanel) ── */}
    <div style={PCARD}>
      <button onClick={()=>setShowFinishing(p=>!p)} style={{width:"100%",padding:0,border:"none",background:"transparent",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{...PSECTION_TITLE,marginBottom:0}}><span style={PICON}>🖌</span><span>Finishing Details</span></span>
          <span style={{fontSize:9,fontWeight:700,padding:"3px 10px",borderRadius:20,background:C.orangeL,color:C.orange}}>₹{matCost.toFixed(0)}</span>
        </div>
        <span style={{fontSize:12,color:C.gray,transform:showFinishing?"rotate(180deg)":"none",transition:"transform 0.15s"}}>▾</span>
      </button>

      {showFinishing&&<div style={{marginTop:22}}>
        <ExteriorFinishingModule finishing={finishing} onChange={fin=>onChange({...config,finishing:fin})} net={extNet||0} paintingType={paintingType}/>
      </div>}
    </div>

    {/* ── Totals ── */}
    <div style={{...PCARD,marginBottom:0,background:C.orangeL,border:`1px solid ${C.orange}33`}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
        <div><div style={{fontSize:10,color:"#c97a40",fontWeight:700,marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>Net Area</div><div style={{fontSize:15,fontWeight:800,color:C.orange}}>{(extNet||0).toFixed(1)} sf</div></div>
        <div><div style={{fontSize:10,color:"#c97a40",fontWeight:700,marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>Material</div><div style={{fontSize:15,fontWeight:800,color:C.orange}}>₹{matCost.toFixed(0)}</div></div>
        <div><div style={{fontSize:10,color:"#c97a40",fontWeight:700,marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>Labour</div><div style={{fontSize:15,fontWeight:800,color:C.orange}}>₹{labCost.toFixed(0)}</div></div>
      </div>
    </div>

    {showBrand&&<BrandPopup current={config.brand} customBrand={config.customBrand} onSelect={v=>onChange({...config,brand:v})} onCustom={v=>onChange({...config,customBrand:v})} onClose={()=>setShowBrand(false)}/>}
  </div>;
}

// ─── EXTERIOR LABOUR PANEL ─────────────────────────────────────────
// PAINT-EXT-LABOUR-EXTRACT — Labour presentation extracted out of
// ExteriorMaterialPanel's Finishing Details card into its own standalone
// premium section. Every field, handler, and onChange call below is
// IDENTICAL to what previously lived inside Finishing Details — only
// relocated, nothing recreated. Same PCARD/PSECTION_TITLE/PICON tokens
// as every other premium card for visual consistency.
function ExteriorLabourPanel({ config, onChange }) {
  return <div style={PCARD}>
    <div style={PSECTION_TITLE}><span style={PICON}>💰</span><span>Labour</span></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
      {[["sqft","📐","Rate/sf"],["daily","👷","Daily"]].map(([v,icon,label])=>(
        <button key={v} onClick={()=>onChange({...config,labourMethod:v})} style={{height:42,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${config.labourMethod===v?C.orange:C.border}`,background:config.labourMethod===v?C.orangeL:C.white,color:config.labourMethod===v?C.orange:C.gray,transition:"all 0.15s"}}>
          {icon} {label}
        </button>
      ))}
    </div>
    {(config.labourMethod||"sqft")==="sqft"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div><span style={LBL}>With Mat (₹/sf)</span><NumInp small prefix="₹" value={config.labourRate||0} onChange={v=>onChange({...config,labourRate:v})}/></div>
      <div><span style={LBL}>Only (₹/sf)</span><NumInp small prefix="₹" value={config.labourRateExcl||0} onChange={v=>onChange({...config,labourRateExcl:v})}/></div>
    </div>}
    {config.labourMethod==="daily"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
      <div><span style={LBL}>Rate (₹)</span><NumInp small prefix="₹" value={config.dailyRate||0} onChange={v=>onChange({...config,dailyRate:v})}/></div>
      <div><span style={LBL}>Workers</span>
        <div style={{display:"flex",alignItems:"center",gap:6,height:44}}>
          <button onClick={()=>onChange({...config,workers:Math.max(1,(config.workers||1)-1)})} style={{width:30,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.red}}>−</button>
          <span style={{fontSize:14,fontWeight:800,minWidth:20,textAlign:"center",color:C.navy}}>{config.workers||1}</span>
          <button onClick={()=>onChange({...config,workers:(config.workers||1)+1})} style={{width:30,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.green}}>+</button>
        </div>
      </div>
      <div><span style={LBL}>Days</span>
        <div style={{display:"flex",alignItems:"center",gap:6,height:44}}>
          <button onClick={()=>onChange({...config,days:Math.max(1,(config.days||1)-1)})} style={{width:30,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.red}}>−</button>
          <span style={{fontSize:14,fontWeight:800,minWidth:20,textAlign:"center",color:C.navy}}>{config.days||1}</span>
          <button onClick={()=>onChange({...config,days:(config.days||1)+1})} style={{width:30,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.green}}>+</button>
        </div>
      </div>
    </div>}
  </div>;
}
// Shared adjustment row renderer (Additions/Deductions) — hoisted to module scope.
// EXT-UI-INPUT-FIX: this was previously declared INSIDE ExteriorModule's render body,
// which gave it a new function identity on every ExteriorModule re-render. React treats
// a changed component-type reference as a different component and remounts it, which
// wiped the NumInp children's local typing-buffer state after every single keystroke —
// that was the actual cause of "each digit committed and normalized separately". Hoisting
// it here (it only ever used its own props — items/elId/color/onRemove/onUpdate — never
// any ExteriorModule closure) keeps its identity stable across renders.
function AdjRows({ items, elId, color, onRemove, onUpdate }) {
  return items.map(d=>{
    const area=(d.w||0)*(d.h||0)*(d.qty||1);
    return <div key={d.id} style={{background:C.white,borderRadius:10,padding:"10px 12px",marginBottom:7,border:`1px solid ${color}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
          <span style={{fontSize:11,fontWeight:700,color,flexShrink:0}}>{d.kind}</span>
          <input value={d.label||""} onChange={e=>onUpdate(elId,d.id,"label",e.target.value)}
            placeholder="Label (optional)"
            style={{fontSize:11,color:C.navy,border:`1px solid ${C.border}`,borderRadius:6,
              padding:"4px 8px",background:"#FAFAFA",outline:"none",minWidth:0,flex:1}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8}}>
          <span style={{fontSize:11,color,fontWeight:700}}>{color===C.red?"−":"+"}{area.toFixed(1)} sf</span>
          <button onClick={()=>onRemove(elId,d.id)} style={{background:C.redL,border:"none",borderRadius:6,padding:"3px 8px",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:8,alignItems:"end"}}>
        <div><span style={LBL}>Length (ft)</span><NumInp small value={d.w} onChange={v=>onUpdate(elId,d.id,"w",v)}/></div>
        <div><span style={LBL}>Height (ft)</span><NumInp small value={d.h} onChange={v=>onUpdate(elId,d.id,"h",v)}/></div>
        <div>
          <span style={LBL}>QTY</span>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <button onClick={()=>onUpdate(elId,d.id,"qty",Math.max(1,(d.qty||1)-1))} style={{width:22,height:34,flexShrink:0,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.red}}>−</button>
            <div style={{width:34}}><NumInp small value={d.qty||1} onChange={v=>onUpdate(elId,d.id,"qty",Math.max(1,Math.round(v||1)))}/></div>
            <button onClick={()=>onUpdate(elId,d.id,"qty",(d.qty||1)+1)} style={{width:22,height:34,flexShrink:0,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.green}}>+</button>
          </div>
        </div>
      </div>
    </div>;
  });
}
function ExteriorModule({ elevations, onChange, config, onConfigChange, quoteMode, paintingType = "fresh" }) {
  const [openDed,setOpenDed]=useState({});
  const [openAdd,setOpenAdd]=useState({});
  const [openAdj,setOpenAdj]=useState({});
  const [openCond,setOpenCond]=useState({});
  const [activeElId,setActiveElId]=useState(()=>(elevations.find(e=>e.name==="Front")||elevations[0]||{}).id);
  const EL_ICONS={ Front:"⬆",Rear:"⬇",Left:"⬅",Right:"➡" };

  // ── Elevation-level helpers ──
  const upEl=(id,patch)=>onChange((elevations||[]).map(e=>e.id===id?{...e,...patch}:e));

  // Sections
  const addSec=(elId)=>onChange(elevations.map(e=>e.id===elId?{...e,sections:[...(e.sections||[]),newExtSection()]}:e));
  const remSec=(elId,secId)=>onChange(elevations.map(e=>e.id===elId?{...e,sections:(e.sections||[]).filter(s=>s.id!==secId)}:e));
  const upSec=(elId,secId,f,v)=>onChange(elevations.map(e=>e.id===elId?{...e,sections:(e.sections||[]).map(s=>s.id===secId?{...s,[f]:v}:s)}:e));
  const upSecLabel=(elId,secId,v)=>upSec(elId,secId,"label",v);

  // Deductions
  const addDed=(elId,kind)=>onChange(elevations.map(e=>e.id===elId?{...e,deductions:[...(e.deductions||[]),newExtDeduction(kind)]}:e));
  const remDed=(elId,dId)=>onChange(elevations.map(e=>e.id===elId?{...e,deductions:(e.deductions||[]).filter(d=>d.id!==dId)}:e));
  const upDed=(elId,dId,f,v)=>onChange(elevations.map(e=>e.id===elId?{...e,deductions:(e.deductions||[]).map(d=>d.id===dId?{...d,[f]:v}:d)}:e));

  // Additions
  const addAdd=(elId,kind)=>onChange(elevations.map(e=>e.id===elId?{...e,additions:[...(e.additions||[]),newExtAddition(kind)]}:e));
  const remAdd=(elId,aId)=>onChange(elevations.map(e=>e.id===elId?{...e,additions:(e.additions||[]).filter(a=>a.id!==aId)}:e));
  const upAdd=(elId,aId,f,v)=>onChange(elevations.map(e=>e.id===elId?{...e,additions:(e.additions||[]).map(a=>a.id===aId?{...a,[f]:v}:a)}:e));

  // ── Calc helpers (mirror calcExteriorTotals logic per-elevation) ──
  const elGross=el=>(el.sections||[]).reduce((t,s)=>t+(s.w||0)*(s.h||0),0);
  const elDedTot=el=>(el.deductions||[]).reduce((s,d)=>s+(d.w||0)*(d.h||0)*(d.qty||1),0);
  const elAddTot=el=>(el.additions||[]).reduce((s,a)=>s+(a.w||0)*(a.h||0)*(a.qty||1),0);
  const elNet=el=>Math.max(0,elGross(el)+elAddTot(el)-elDedTot(el));
  const totalNet=elevations.reduce((s,e)=>s+elNet(e),0);


  const currentElId=elevations.some(e=>e.id===activeElId)?activeElId:(elevations[0]||{}).id;

  // Compact bordered-card collapsible header, shared visual system for Advanced Adjustments & Exterior Condition
  function SectionHeader({ icon, title, subtitle, badge, open, onClick }) {
    return <button onClick={onClick}
      style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
        padding:"10px 12px",borderRadius:12,cursor:"pointer",textAlign:"left",
        border:`1.5px solid ${C.border}`,background:"#FAFAFA"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <span style={{fontSize:15,flexShrink:0}}>{icon}</span>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,fontWeight:800,color:C.navy}}>{title}</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:1}}>{subtitle}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <span style={{fontSize:10,fontWeight:700,color:C.gray,background:"#F1F5F9",borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{badge}</span>
        <span style={{fontSize:11,color:"#aaa"}}>{open?"▲":"▼"}</span>
      </div>
    </button>;
  }

  return <div>
    <div style={{background:C.blueL,borderRadius:10,padding:"7px 10px",marginBottom:10,fontSize:12,color:C.blue,fontWeight:600}}>
      Measure each elevation. Add wall sections, then deduct openings or add projections.
    </div>

    {/* Elevation tab selector */}
    <div style={{display:"grid",gridTemplateColumns:`repeat(${elevations.length},1fr)`,gap:6,marginBottom:10}}>
      {elevations.map(e=>{
        const active=e.id===currentElId;
        const eNet=elNet(e);
        return <button key={e.id} onClick={()=>setActiveElId(e.id)}
          style={{padding:"8px 6px",minHeight:44,borderRadius:10,cursor:"pointer",textAlign:"center",
            border:`1.5px solid ${active?C.orange:C.border}`,background:active?C.orangeL:C.white}}>
          <div style={{fontSize:12,fontWeight:800,color:active?C.orange:C.navy}}>{EL_ICONS[e.name]||"🧱"} {e.name}</div>
          <div style={{fontSize:10,fontWeight:700,color:active?C.orange:"#aaa",marginTop:2}}>{eNet.toFixed(1)} sf</div>
        </button>;
      })}
    </div>

    {elevations.filter(el=>el.id===currentElId).map(el=>{
      const gross=elGross(el), ded=elDedTot(el), add=elAddTot(el), net=elNet(el);
      const secs=el.sections||[];
      return <div key={el.id} style={{background:"#FAFAFA",borderRadius:14,padding:"12px",marginBottom:10,border:`1.5px solid ${C.border}`}}>

        {/* Elevation header */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:18}}>{EL_ICONS[el.name]||"🧱"}</span>
          <span style={{fontSize:14,fontWeight:800,color:C.navy}}>{el.name} Elevation</span>
        </div>

        {/* Wall Sections */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Wall Sections</div>
          {secs.map((sec,si)=>{
            const secArea=(sec.w||0)*(sec.h||0);
            return <div key={sec.id} style={{background:C.white,borderRadius:10,padding:"9px 11px",marginBottom:6,border:`1px solid ${C.orange}33`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.orange,flexShrink:0}}>Section {si+1}</span>
                  <input value={sec.label||""} onChange={e=>upSecLabel(el.id,sec.id,e.target.value)}
                    placeholder="Label (optional)"
                    style={{fontSize:11,color:C.navy,border:`1px solid ${C.border}`,borderRadius:6,
                      padding:"4px 8px",background:"#FAFAFA",outline:"none",minWidth:0,flex:1}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.orange}}>{secArea.toFixed(1)} sf</span>
                  {secs.length>1&&<button onClick={()=>remSec(el.id,sec.id)}
                    style={{background:C.redL,border:"none",borderRadius:6,padding:"5px 10px",minHeight:30,color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 18px 1fr",alignItems:"end",gap:9,marginBottom:6}}>
                <div><span style={LBL}>Length (ft)</span><NumInp small value={sec.w} onChange={v=>upSec(el.id,sec.id,"w",v)}/></div>
                <div style={{textAlign:"center",fontSize:16,color:"#ccc",fontWeight:700,paddingBottom:8}}>×</div>
                <div><span style={LBL}>Height (ft)</span><NumInp small value={sec.h} onChange={v=>upSec(el.id,sec.id,"h",v)}/></div>
              </div>
              {(!sec.w&&!sec.h)?null:
                <div style={{display:"flex",justifyContent:"space-between",background:C.orangeL,borderRadius:7,padding:"5px 10px"}}>
                  <span style={{fontSize:10,color:"#c97a40"}}>{sec.w||0} ft × {sec.h||0} ft</span>
                  <span style={{fontSize:12,fontWeight:800,color:C.orange}}>{secArea.toFixed(2)} sqft</span>
                </div>}
            </div>;
          })}
          <button onClick={()=>addSec(el.id)}
            style={{width:"100%",padding:"10px 0",minHeight:44,borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
              border:`1.5px dashed ${C.orange}`,background:C.orangeL,color:C.orange}}>
            + Add Wall Section
          </button>
        </div>

        {/* Advanced Adjustments (Additions + Deductions merged, collapsed by default) */}
        <div style={{paddingTop:8}}>
          <SectionHeader icon="⚙" title="Advanced Adjustments" subtitle="Additions and deductions"
            badge={`${(el.additions||[]).length} additions · ${(el.deductions||[]).length} deductions`}
            open={!!openAdj[el.id]} onClick={()=>setOpenAdj(p=>({...p,[el.id]:!p[el.id]}))}/>

          {openAdj[el.id]&&<div style={{marginTop:10}}>

          {/* Additions */}
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,color:C.green}}>+ Additions {add>0?`(+${add.toFixed(1)} sf)`:""}</span>
              <button onClick={()=>setOpenAdd(p=>({...p,[el.id]:!p[el.id]}))}
                style={{fontSize:10,fontWeight:700,color:C.green,background:C.greenL,border:`1px solid ${C.green}33`,borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>
                {openAdd[el.id]?"▲ Hide":"▼ Add"}
              </button>
            </div>
            {openAdd[el.id]&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {EXT_ADDITION_TYPES.map(kind=>(
                <button key={kind} onClick={()=>addAdd(el.id,kind)}
                  style={{padding:"8px 12px",borderRadius:20,border:`1.5px solid ${C.green}`,background:C.greenL,color:C.green,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  + {kind}
                </button>
              ))}
            </div>}
            <AdjRows items={el.additions||[]} elId={el.id} color={C.green} onRemove={remAdd} onUpdate={upAdd}/>
            {add>0&&<div style={{background:C.greenL,borderRadius:8,padding:"6px 10px",display:"flex",justifyContent:"space-between",fontSize:11,marginTop:4,border:`1px solid ${C.green}22`}}>
              <span style={{color:C.green,fontWeight:700}}>Total Added</span>
              <span style={{color:C.green,fontWeight:800}}>+{add.toFixed(1)} sf</span>
            </div>}
          </div>

          {/* Deductions */}
          <div style={{borderTop:`1px dashed ${C.border}`,paddingTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,color:C.red}}>− Deductions {ded>0?`(−${ded.toFixed(1)} sf)`:""}</span>
              <button onClick={()=>setOpenDed(p=>({...p,[el.id]:!p[el.id]}))}
                style={{fontSize:10,fontWeight:700,color:C.red,background:C.redL,border:`1px solid ${C.red}33`,borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>
                {openDed[el.id]?"▲ Hide":"▼ Add"}
              </button>
            </div>
            {openDed[el.id]&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {EXT_DEDUCTION_TYPES.map(kind=>(
                <button key={kind} onClick={()=>addDed(el.id,kind)}
                  style={{padding:"8px 12px",borderRadius:20,border:`1.5px solid ${C.red}`,background:C.redL,color:C.red,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  − {kind}
                </button>
              ))}
            </div>}
            <AdjRows items={el.deductions||[]} elId={el.id} color={C.red} onRemove={remDed} onUpdate={upDed}/>
            {ded>0&&<div style={{background:C.redL,borderRadius:8,padding:"6px 10px",display:"flex",justifyContent:"space-between",fontSize:11,marginTop:4,border:`1px solid ${C.red}22`}}>
              <span style={{color:C.red,fontWeight:700}}>Total Deducted</span>
              <span style={{color:C.red,fontWeight:800}}>−{ded.toFixed(1)} sf</span>
            </div>}
          </div>

          </div>}
        </div>

        {/* Exterior Condition — Good/Fair/Poor + issue chips + notes + photos, collapsed by default */}
        <div style={{paddingTop:8,marginTop:8}}>
          {(()=>{
            const issueCount=(el.conditionIssues||[]).length;
            const photoCount=(el.conditionPhotos||[]).length;
            const badgeParts=[el.condition||"Good"];
            if(issueCount>0) badgeParts.push(`${issueCount} issues`);
            if(photoCount>0) badgeParts.push(`${photoCount} photos`);
            return <SectionHeader icon="🔍" title="Exterior Condition" subtitle="Surface condition and photos"
              badge={badgeParts.join(" · ")}
              open={!!openCond[el.id]} onClick={()=>setOpenCond(p=>({...p,[el.id]:!p[el.id]}))}/>;
          })()}

          {openCond[el.id]&&<div style={{marginTop:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
              {EXT_COND_LEVELS.map(lvl=>{
                const sel=(el.condition||"Good")===lvl;
                const col=lvl==="Good"?C.green:lvl==="Fair"?C.orange:C.red;
                const colL=lvl==="Good"?C.greenL:lvl==="Fair"?C.orangeL:C.redL;
                return <button key={lvl} onClick={()=>upEl(el.id,{condition:lvl})}
                  style={{padding:"9px 6px",minHeight:44,fontSize:12,fontWeight:700,borderRadius:10,textAlign:"center",
                    border:`2px solid ${sel?col:C.border}`,background:sel?colL:C.white,color:sel?col:C.gray,cursor:"pointer"}}>
                  {EXT_COND_LEVEL_ICONS[lvl]} {lvl}
                </button>;
              })}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {EXT_ISSUE_TAGS.map(tag=>{
                const issues=el.conditionIssues||[];
                const sel=issues.includes(tag);
                const toggle=()=>upEl(el.id,{conditionIssues: sel?issues.filter(t=>t!==tag):[...issues,tag]});
                return <button key={tag} onClick={toggle}
                  style={{padding:"7px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${sel?C.orange:C.border}`,background:sel?C.orangeL:C.white,color:sel?C.orange:C.gray}}>
                  {tag}
                </button>;
              })}
            </div>
            <Inp label="Notes" value={el.conditionNotes||""} onChange={v=>upEl(el.id,{conditionNotes:v})} placeholder="Describe location and severity" rows={3}/>
            <div style={{fontSize:10,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:14,marginBottom:4}}>Condition Photos</div>
            <CondPhotoManager photos={el.conditionPhotos||[]} onChange={v=>upEl(el.id,{conditionPhotos:v})} placeholder="e.g. North wall crack near window"/>
          </div>}
        </div>

        {/* Net total row */}
        <div style={{background:C.orangeL,borderRadius:10,padding:"9px 14px",marginTop:10,
          display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.orange}33`}}>
          <span style={{fontSize:12,color:"#c97a40",fontWeight:700}}>
            {el.name} Net
            {(add>0||ded>0)&&<span style={{fontSize:10,fontWeight:400}}> = {gross.toFixed(1)}{add>0?` +${add.toFixed(1)}`:""}{ded>0?` −${ded.toFixed(1)}`:""}</span>}
          </span>
          <span style={{fontSize:16,fontWeight:800,color:C.orange}}>{net.toFixed(2)} sqft</span>
        </div>

      </div>;
    })}

    {/* Total net strip */}
    <div style={{background:C.navy,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
      <div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700,letterSpacing:"0.06em"}}>NET EXTERIOR AREA</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:2}}>
          {(elevations||[]).filter(e=>elNet(e)>0).map(e=>`${e.name}: ${elNet(e).toFixed(1)}`).join(" · ")}
        </div>
      </div>
      <div style={{fontSize:22,fontWeight:900,color:C.orange}}>{totalNet.toFixed(1)} sf</div>
    </div>
  </div>;
}

// ─── SECTION SUMMARY CARD ─────────────────────────────────────────
function SectionSummaryCard({ title, icon, net, mat, lab, charges, onChargesChange, color, colorL }) {
  const { additionalCharges=0, discount=0, gst=0 } = charges||{};
  const calc=calcSectionTotal(mat,lab,charges);
  return <div style={{borderRadius:14,border:`1.5px solid ${color}33`,overflow:"hidden",marginBottom:10}}>
    <div style={{background:color,padding:"7px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>{icon} {title}</span>
      <span style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:600}}>{net.toFixed(1)} sf</span>
    </div>
    <div style={{background:colorL,padding:"8px 12px"}}>
      {[["Net Area",`${net.toFixed(1)} sf`],["Material Cost",`₹${mat.toFixed(0)}`],["Labour Cost",`₹${lab.toFixed(0)}`]].map(([l,v])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#555"}}><span style={{fontWeight:600}}>{l}</span><span style={{fontWeight:700}}>{v}</span></div>
      ))}
      <div style={{borderTop:`1px dashed ${color}44`,margin:"6px 0"}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
        <div><span style={{...LBL,fontSize:9}}>ADD. CHARGES</span><NumInp small prefix="₹" value={additionalCharges} onChange={v=>onChargesChange({...charges,additionalCharges:v})}/></div>
        <div><span style={{...LBL,fontSize:9}}>DISCOUNT (%)</span><NumInp small value={discount} onChange={v=>onChargesChange({...charges,discount:v})}/></div>
        <div><span style={{...LBL,fontSize:9}}>GST (%)</span><NumInp small value={gst} onChange={v=>onChargesChange({...charges,gst:v})}/></div>
      </div>
      <div style={{background:C.white,borderRadius:10,padding:"7px 10px"}}>
        {[["Subtotal",`₹${calc.sub.toFixed(0)}`],[`Discount (${discount}%)`,`−₹${calc.discountAmt.toFixed(0)}`],["Taxable Amount",`₹${calc.afterDiscount.toFixed(0)}`],[`GST (${gst}%)`,`₹${calc.gstAmt.toFixed(0)}`]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10.5,padding:"1.5px 0",color:"#777"}}><span>{l}</span><span style={{fontWeight:600}}>{v}</span></div>
        ))}
        <div style={{borderTop:`1px solid ${color}33`,marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:12,fontWeight:800,color}}>Section Total</span>
          <span style={{fontSize:14,fontWeight:900,color}}>₹{calc.total.toFixed(0)}</span>
        </div>
      </div>
    </div>
  </div>;
}

// ─── DOOR & WINDOW CARD ───────────────────────────────────────────
function DoorWindowCard({ items, onChange }) {
  const [open,setOpen]=useState(false);
  const upItem=(id,f,v)=>onChange(items.map(x=>x.id===id?{...x,[f]:v}:x));
  const upFinish=(id,fid)=>{ const ft=DW_FINISH_TYPES.find(f=>f.id===fid)||DW_FINISH_TYPES[0]; onChange(items.map(x=>x.id===id?{...x,finish:fid,rate:ft.r}:x)); };
  const upKind=(id,kind)=>onChange(items.map(x=>x.id===id?{...x,kind,label:kind}:x));
  const totals=calcDWTotals(items);
  return <div style={{...CARD,marginBottom:10,padding:0,overflow:"hidden"}}>
    <button onClick={()=>setOpen(p=>!p)} style={{width:"100%",background:open?C.orangeL:C.white,border:"none",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",borderBottom:open?`1px solid ${C.border}`:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>🚪</span>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,fontWeight:800,color:C.navy}}>Door & Window Measurement</div>
          <div style={{fontSize:10,color:C.gray}}>{items.length>0?`${items.length} item(s) · ₹${totals.total.toFixed(0)}`:"Doors, windows, polish, grills, gates, frames"}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {items.length>0&&<span style={{fontSize:12,fontWeight:800,color:C.orange}}>₹{totals.total.toFixed(0)}</span>}
        <span style={{fontSize:11,color:C.gray,transform:open?"rotate(180deg)":"",transition:"transform .2s"}}>▾</span>
      </div>
    </button>
    {open&&<div style={{padding:"14px 16px",background:C.white}}>
      <button onClick={()=>onChange([...items,newDWItem()])} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${C.orange}`,background:C.orangeL,color:C.orange,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>+ Add Item</button>
      {items.length===0&&<div style={{textAlign:"center",color:"#bbb",padding:"12px 0",fontSize:13}}>No items added yet</div>}
      {items.map(it=>{
        const c=calcDWItem(it);
        return <div key={it.id} style={{background:"#FAFAFA",borderRadius:12,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:15}}>🚪</span>
              <input value={it.label} onChange={e=>upItem(it.id,"label",e.target.value)} style={{fontSize:13,fontWeight:700,color:C.navy,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",background:C.white,outline:"none",width:120}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:800,color:C.orange}}>₹{c.total.toFixed(0)}</span>
              <button onClick={()=>onChange(items.filter(x=>x.id!==it.id))} style={{background:C.redL,border:"none",borderRadius:8,padding:"4px 8px",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
            </div>
          </div>
          <DropSel label="Item Type" value={it.kind} onChange={v=>upKind(it.id,v)} options={DW_ITEM_TYPES.map(t=>({value:t,label:t}))} style={{marginBottom:8}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 14px 1fr 74px",alignItems:"center",gap:8,marginBottom:10}}>
            <div><span style={LBL}>W (ft)</span><NumInp small value={it.w} onChange={v=>upItem(it.id,"w",v)}/></div>
            <div style={{textAlign:"center",fontSize:13,color:"#ccc",fontWeight:700,marginTop:18}}>×</div>
            <div><span style={LBL}>H (ft)</span><NumInp small value={it.h} onChange={v=>upItem(it.id,"h",v)}/></div>
            <div>
              <span style={LBL}>QTY</span>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <button onClick={()=>upItem(it.id,"qty",Math.max(1,(it.qty||1)-1))} style={{width:26,height:34,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.red}}>−</button>
                <span style={{fontSize:14,fontWeight:800,minWidth:18,textAlign:"center",color:C.navy}}>{it.qty||1}</span>
                <button onClick={()=>upItem(it.id,"qty",(it.qty||1)+1)} style={{width:26,height:34,borderRadius:6,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:14,fontWeight:700,color:C.green}}>+</button>
              </div>
            </div>
          </div>
          <DropSel label="Surface Finish" value={it.finish} onChange={v=>upFinish(it.id,v)} options={DW_FINISH_TYPES.map(f=>({value:f.id,label:f.label}))} style={{marginBottom:8}}/>
          {it.finish==="custom"&&<div style={{marginBottom:8}}><Inp label="Custom Finish Name" value={it.customFinish||""} onChange={v=>upItem(it.id,"customFinish",v)} placeholder="e.g. French Polish"/></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
            <div><span style={LBL}>RATE (₹/sf)</span><NumInp small prefix="₹" value={it.rate||0} onChange={v=>upItem(it.id,"rate",v)}/></div>
            <div><span style={LBL}>COATS</span><CoatStepper value={it.coats||1} onChange={v=>upItem(it.id,"coats",v)}/></div>
            <div><span style={LBL}>LABOUR (₹/sf)</span><NumInp small prefix="₹" value={it.labourRate||0} onChange={v=>upItem(it.id,"labourRate",v)}/></div>
          </div>
          <div style={{background:C.orangeL,borderRadius:8,padding:"7px 12px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div><div style={{fontSize:9,color:"#c97a40",fontWeight:700}}>AREA</div><div style={{fontSize:12,fontWeight:800,color:C.orange}}>{c.area.toFixed(1)} sf</div></div>
            <div><div style={{fontSize:9,color:"#c97a40",fontWeight:700}}>MATERIAL</div><div style={{fontSize:12,fontWeight:800,color:C.orange}}>₹{c.mat.toFixed(0)}</div></div>
            <div><div style={{fontSize:9,color:"#c97a40",fontWeight:700}}>TOTAL</div><div style={{fontSize:12,fontWeight:800,color:C.orange}}>₹{c.total.toFixed(0)}</div></div>
          </div>
        </div>;
      })}
      {items.length>0&&<div style={{background:C.navy,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700}}>DOOR & WINDOW TOTAL</div><div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>Mat ₹{totals.mat.toFixed(0)} + Lab ₹{totals.lab.toFixed(0)}</div></div>
        <div style={{fontSize:20,fontWeight:900,color:C.orange}}>₹{totals.total.toFixed(0)}</div>
      </div>}
    </div>}
  </div>;
}

// ─── FIX 4: WALLPAPER MEASUREMENT MODULE ─────────────────────────
function WallpaperCard({ items, onChange }) {
  const [open,setOpen]=useState(false);

  // upItem: update a single field on an item
  const upItem=(id,f,v)=>onChange(items.map(x=>x.id===id?{...x,[f]:v}:x));

  // applyPreset: update roll dimensions when a preset is chosen
  const applyPreset=(id,pid)=>{
    const p=WP_ROLL_PRESETS.find(x=>x.id===pid)||WP_ROLL_PRESETS[0];
    onChange(items.map(x=>x.id===id?{...x,rollPreset:pid,rollW:p.w,rollL:p.l}:x));
  };

  // setWallDim: update w or h, and if areaMode==="auto" recompute area immediately
  const setWallDim=(id,field,val)=>{
    onChange(items.map(x=>{
      if(x.id!==id) return x;
      const updated={...x,[field]:val};
      if(updated.areaMode==="auto"){
        updated.area=parseFloat(((updated.wallW||0)*(updated.wallH||0)).toFixed(2));
      }
      return updated;
    }));
  };

  // switchAreaMode: toggle between "auto" (W×H) and "manual" (free-type)
  const switchAreaMode=(id,mode)=>{
    onChange(items.map(x=>{
      if(x.id!==id) return x;
      const updated={...x,areaMode:mode};
      if(mode==="auto"){
        updated.area=parseFloat(((updated.wallW||0)*(updated.wallH||0)).toFixed(2));
      }
      return updated;
    }));
  };

  const totals=calcWPTotals(items);

  return <div style={{...CARD,marginBottom:10,padding:0,overflow:"hidden"}}>
    <button onClick={()=>setOpen(p=>!p)} style={{width:"100%",background:open?"#F5F3FF":C.white,border:"none",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",borderBottom:open?`1px solid ${C.border}`:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>🖼</span>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,fontWeight:800,color:C.navy}}>Wallpaper Measurement</div>
          <div style={{fontSize:10,color:C.gray}}>{items.length>0?`${items.length} item(s) · ₹${totals.total.toFixed(0)}`:"Roll-based wallpaper area & cost calculator"}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {items.length>0&&<span style={{fontSize:12,fontWeight:800,color:C.purple}}>₹{totals.total.toFixed(0)}</span>}
        <span style={{fontSize:11,color:C.gray,transform:open?"rotate(180deg)":"",transition:"transform .2s"}}>▾</span>
      </div>
    </button>

    {open&&<div style={{padding:"14px 16px",background:C.white}}>
      <button onClick={()=>onChange([...items,newWPItem()])} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${C.purple}`,background:C.purpleL,color:C.purple,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>+ Add Wallpaper Area</button>
      {items.length===0&&<div style={{textAlign:"center",color:"#bbb",padding:"12px 0",fontSize:13}}>No wallpaper items added</div>}

      {items.map(it=>{
        const c=calcWPItem(it);
        const isAuto=(it.areaMode||"manual")==="auto";
        const autoArea=parseFloat(((it.wallW||0)*(it.wallH||0)).toFixed(2));

        return <div key={it.id} style={{background:"#FAFAFA",borderRadius:12,padding:"12px 14px",marginBottom:10,border:`1.5px solid ${C.purple}22`}}>

          {/* ── Row 1: label + cost + delete ── */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:15}}>🖼</span>
              <input value={it.label} onChange={e=>upItem(it.id,"label",e.target.value)} style={{fontSize:13,fontWeight:700,color:C.navy,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",background:C.white,outline:"none",width:130}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:800,color:C.purple}}>₹{c.total.toFixed(0)}</span>
              <button onClick={()=>onChange(items.filter(x=>x.id!==it.id))} style={{background:C.redL,border:"none",borderRadius:8,padding:"4px 8px",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
            </div>
          </div>

          {/* ── Row 2: design + brand ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <Inp label="Design / Pattern" value={it.design||""} onChange={v=>upItem(it.id,"design",v)} placeholder="e.g. Floral"/>
            <Inp label="Brand" value={it.brand||""} onChange={v=>upItem(it.id,"brand",v)} placeholder="e.g. Asian Paints"/>
          </div>

          {/* ── Area mode toggle ── */}
          <div style={{marginBottom:10}}>
            <span style={LBL}>AREA METHOD</span>
            <div style={{display:"flex",gap:8}}>
              {[["manual","✏️ Manual Entry"],["auto","📐 W × H Auto"]].map(([mode,label])=>(
                <button key={mode} onClick={()=>switchAreaMode(it.id,mode)}
                  style={{flex:1,padding:"7px 8px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${(it.areaMode||"manual")===mode?C.purple:C.border}`,
                    background:(it.areaMode||"manual")===mode?C.purpleL:C.white,
                    color:(it.areaMode||"manual")===mode?C.purple:C.gray}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Auto mode: W × H inputs ── */}
          {isAuto&&<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 20px 1fr",alignItems:"center",gap:6,marginBottom:8}}>
              <div>
                <span style={LBL}>WALL WIDTH (ft)</span>
                <NumInp small value={it.wallW||0} onChange={v=>setWallDim(it.id,"wallW",v)}/>
              </div>
              <div style={{textAlign:"center",fontSize:14,color:"#ccc",fontWeight:700,marginTop:18}}>×</div>
              <div>
                <span style={LBL}>WALL HEIGHT (ft)</span>
                <NumInp small value={it.wallH||0} onChange={v=>setWallDim(it.id,"wallH",v)}/>
              </div>
            </div>
            <button onClick={()=>setWallDim(it.id,"wallW",it.wallW||0)}
              style={{width:"100%",padding:"9px 14px",borderRadius:10,border:`1.5px solid ${C.purple}`,
                background:C.purple,color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",
                marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:14}}>📐</span> Calculate Area
            </button>
            <div style={{background:C.purpleL,borderRadius:8,padding:"8px 12px",marginBottom:10,
              border:`1.5px solid ${C.purple}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.purple,fontWeight:700}}>
                {it.wallW||0} ft × {it.wallH||0} ft =
              </span>
              <span style={{fontSize:16,fontWeight:900,color:C.purple}}>{autoArea.toFixed(2)} sf</span>
            </div>
          </>}

          {/* ── Manual mode: direct area entry ── */}
          {!isAuto&&<div style={{marginBottom:10}}>
            <span style={LBL}>AREA TO COVER (sf)</span>
            <NumInp small value={it.area||0} onChange={v=>upItem(it.id,"area",v)}/>
          </div>}

          {/* ── Roll size selector ── */}
          <DropSel label="Roll Size" value={it.rollPreset||"std"} onChange={v=>applyPreset(it.id,v)} options={WP_ROLL_PRESETS.map(p=>({value:p.id,label:p.label}))} style={{marginBottom:8}}/>
          {it.rollPreset==="custom"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><span style={LBL}>ROLL WIDTH (m)</span><NumInp small value={it.rollW||0} onChange={v=>upItem(it.id,"rollW",v)}/></div>
            <div><span style={LBL}>ROLL LENGTH (m)</span><NumInp small value={it.rollL||0} onChange={v=>upItem(it.id,"rollL",v)}/></div>
          </div>}
          <div style={{background:C.purpleL,borderRadius:8,padding:"5px 10px",marginBottom:8,fontSize:11,color:C.purple,fontWeight:600}}>
            Roll area = {it.rollW||0.53}m × {it.rollL||10}m = <b>{c.rollArea} m²</b>
          </div>

          {/* ── Rate fields ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><span style={LBL}>RATE (₹/roll)</span><NumInp small prefix="₹" value={it.rate||0} onChange={v=>upItem(it.id,"rate",v)}/></div>
            <div><span style={LBL}>INSTALL RATE (₹/sf)</span><NumInp small prefix="₹" value={it.installRate||0} onChange={v=>upItem(it.id,"installRate",v)}/></div>
          </div>

          {/* ── Results strip ── */}
          <div style={{background:C.purpleL,borderRadius:8,padding:"8px 12px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div>
              <div style={{fontSize:9,color:C.purple,fontWeight:700,opacity:.7}}>AREA (sf)</div>
              <div style={{fontSize:13,fontWeight:800,color:C.purple}}>{(it.area||0).toFixed(1)}</div>
            </div>
            <div>
              <div style={{fontSize:9,color:C.purple,fontWeight:700,opacity:.7}}>ROLLS NEEDED</div>
              <div style={{fontSize:13,fontWeight:800,color:C.purple}}>{c.rolls}</div>
            </div>
            <div>
              <div style={{fontSize:9,color:C.purple,fontWeight:700,opacity:.7}}>TOTAL</div>
              <div style={{fontSize:14,fontWeight:800,color:C.purple}}>₹{c.total.toFixed(0)}</div>
            </div>
          </div>

        </div>;
      })}

      {items.length>0&&<div style={{background:C.navy,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700}}>WALLPAPER TOTAL</div><div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>Mat ₹{totals.mat.toFixed(0)} + Install ₹{totals.lab.toFixed(0)}</div></div>
        <div style={{fontSize:20,fontWeight:900,color:C.purple}}>₹{totals.total.toFixed(0)}</div>
      </div>}
    </div>}
  </div>;
}

// ─── FIX 5: TEXTURE MEASUREMENT MODULE ───────────────────────────
function TextureCard({ items, onChange }) {
  const [open,setOpen]=useState(false);
  // Live merge: standard texture types + any custom tiers added via Master
  // Rates + the "type your own name" custom option (see mergeCustomFinishTypes).
  const textureTypes=getFinMeta().texture?.types||TEXTURE_T;
  const upItem=(id,f,v)=>onChange(items.map(x=>x.id===id?{...x,[f]:v}:x));
  const applyType=(id,tid)=>{
    const t=textureTypes.find(x=>x.id===tid)||textureTypes[0];
    onChange(items.map(x=>x.id===id?{...x,type:tid,rate:t.r,label:t.label}:x));
  };
  const totals=calcTextureTotals(items);
  return <div style={{...CARD,marginBottom:10,padding:0,overflow:"hidden"}}>
    <button onClick={()=>setOpen(p=>!p)} style={{width:"100%",background:open?"#F0FDFA":C.white,border:"none",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",borderBottom:open?`1px solid ${C.border}`:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>🏔</span>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,fontWeight:800,color:C.navy}}>Texture & Decorative Finish</div>
          <div style={{fontSize:10,color:C.gray}}>{items.length>0?`${items.length} item(s) · ₹${totals.total.toFixed(0)}`:"Venetian plaster, metallic, stucco, rollers"}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {items.length>0&&<span style={{fontSize:12,fontWeight:800,color:C.teal}}>₹{totals.total.toFixed(0)}</span>}
        <span style={{fontSize:11,color:C.gray,transform:open?"rotate(180deg)":"",transition:"transform .2s"}}>▾</span>
      </div>
    </button>
    {open&&<div style={{padding:"14px 16px",background:C.white}}>
      <button onClick={()=>onChange([...items,newTextureItem()])} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${C.teal}`,background:C.tealL,color:C.teal,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>+ Add Texture Area</button>
      {items.length===0&&<div style={{textAlign:"center",color:"#bbb",padding:"12px 0",fontSize:13}}>No texture items added</div>}
      {items.map(it=>{
        const c=calcTextureItem(it);
        return <div key={it.id} style={{background:"#FAFAFA",borderRadius:12,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.teal}22`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:15}}>🏔</span>
              <input value={it.label} onChange={e=>upItem(it.id,"label",e.target.value)} style={{fontSize:13,fontWeight:700,color:C.navy,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",background:C.white,outline:"none",width:130}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:800,color:C.teal}}>₹{c.total.toFixed(0)}</span>
              <button onClick={()=>onChange(items.filter(x=>x.id!==it.id))} style={{background:C.redL,border:"none",borderRadius:8,padding:"4px 8px",color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
            </div>
          </div>
          <DropSel label="Texture Type" value={it.type||"roller"} onChange={v=>applyType(it.id,v)} options={textureTypes.map(t=>({value:t.id,label:t.label}))} style={{marginBottom:8}}/>
          {it.type==="custom"&&<div style={{marginBottom:8}}><Inp label="Custom Type Name" value={it.customType||""} onChange={v=>upItem(it.id,"customType",v)} placeholder="e.g. Novacolor Marmorino"/></div>}
          <DropSel label="Application Mode" value={it.applyMode||"Full Wall"} onChange={v=>upItem(it.id,"applyMode",v)} options={TEXTURE_APPLY_MODES.map(a=>({value:a,label:a}))} style={{marginBottom:8}}/>
          {/* ── Area Mode Toggle ── */}
          <div style={{marginBottom:10}}>
            <span style={LBL}>AREA METHOD</span>
            <div style={{display:"flex",gap:8}}>
              {[["manual","✏️ Manual Entry"],["auto","📐 W × H Auto"]].map(([mode,lbl])=>(
                <button key={mode} onClick={()=>{
                  const m=mode;
                  onChange(items.map(x=>{
                    if(x.id!==it.id) return x;
                    const u={...x,areaMode:m};
                    if(m==="auto") u.area=parseFloat(((u.wallW||0)*(u.wallH||0)).toFixed(2));
                    return u;
                  }));
                }}
                  style={{flex:1,padding:"7px 8px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${(it.areaMode||"manual")===mode?C.teal:C.border}`,
                    background:(it.areaMode||"manual")===mode?C.tealL:C.white,
                    color:(it.areaMode||"manual")===mode?C.teal:C.gray}}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* ── Auto: W × H inputs + Calculate button ── */}
          {(it.areaMode||"manual")==="auto"&&<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 20px 1fr",alignItems:"center",gap:6,marginBottom:8}}>
              <div>
                <span style={LBL}>WALL WIDTH (ft)</span>
                <NumInp small value={it.wallW||0} onChange={v=>{
                  onChange(items.map(x=>{
                    if(x.id!==it.id) return x;
                    const u={...x,wallW:v};
                    if((u.areaMode||"manual")==="auto") u.area=parseFloat(((v)*(u.wallH||0)).toFixed(2));
                    return u;
                  }));
                }}/>
              </div>
              <div style={{textAlign:"center",fontSize:14,color:"#ccc",fontWeight:700,marginTop:18}}>×</div>
              <div>
                <span style={LBL}>WALL HEIGHT (ft)</span>
                <NumInp small value={it.wallH||0} onChange={v=>{
                  onChange(items.map(x=>{
                    if(x.id!==it.id) return x;
                    const u={...x,wallH:v};
                    if((u.areaMode||"manual")==="auto") u.area=parseFloat(((u.wallW||0)*(v)).toFixed(2));
                    return u;
                  }));
                }}/>
              </div>
            </div>
            <button onClick={()=>{
                onChange(items.map(x=>{
                  if(x.id!==it.id) return x;
                  return {...x,area:parseFloat(((x.wallW||0)*(x.wallH||0)).toFixed(2))};
                }));
              }}
              style={{width:"100%",padding:"9px 14px",borderRadius:10,border:`1.5px solid ${C.teal}`,
                background:C.teal,color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",
                marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:14}}>📐</span> Calculate Area
            </button>
            <div style={{background:C.tealL,borderRadius:8,padding:"8px 12px",marginBottom:10,
              border:`1.5px solid ${C.teal}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.teal,fontWeight:700}}>
                {it.wallW||0} ft × {it.wallH||0} ft =
              </span>
              <span style={{fontSize:16,fontWeight:900,color:C.teal}}>{(it.area||0).toFixed(2)} sf</span>
            </div>
          </>}

          {/* ── Manual: direct area entry ── */}
          {(it.areaMode||"manual")==="manual"&&<div style={{marginBottom:10}}>
            <span style={LBL}>AREA (sf)</span>
            <NumInp small value={it.area||0} onChange={v=>upItem(it.id,"area",v)}/>
          </div>}

          {/* ── Rate + Coats + Labour ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><span style={LBL}>MATERIAL RATE (₹/sf)</span><NumInp small prefix="₹" value={it.rate||0} onChange={v=>upItem(it.id,"rate",v)}/></div>
            <div><span style={LBL}>COATS</span><CoatStepper value={it.coats||1} onChange={v=>upItem(it.id,"coats",v)}/></div>
          </div>
          <div style={{marginBottom:10}}>
            <span style={LBL}>LABOUR RATE (₹/sf)</span>
            <NumInp small prefix="₹" value={it.labourRate||0} onChange={v=>upItem(it.id,"labourRate",v)}/>
          </div>

          {/* ── Cost breakdown ── */}
          <div style={{background:"#F0F9FF",borderRadius:8,padding:"8px 10px",marginBottom:8,border:`1px solid ${C.blue}22`}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#555"}}>
              <span>Material: {(it.area||0).toFixed(1)} sf × ₹{it.rate||0} × {it.coats||1} coat(s)</span>
              <span style={{fontWeight:700}}>₹{parseFloat(((it.area||0)*(it.rate||0)*(it.coats||1)).toFixed(2)).toFixed(0)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#555"}}>
              <span>Labour: {(it.area||0).toFixed(1)} sf × ₹{it.labourRate||0}</span>
              <span style={{fontWeight:700}}>₹{parseFloat(((it.area||0)*(it.labourRate||0)).toFixed(2)).toFixed(0)}</span>
            </div>
          </div>

          <div style={{background:C.tealL,borderRadius:8,padding:"8px 12px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div><div style={{fontSize:9,color:C.teal,fontWeight:700,opacity:.7}}>AREA</div><div style={{fontSize:12,fontWeight:800,color:C.teal}}>{c.area.toFixed(1)} sf</div></div>
            <div><div style={{fontSize:9,color:C.teal,fontWeight:700,opacity:.7}}>MATERIAL</div><div style={{fontSize:12,fontWeight:800,color:C.teal}}>₹{c.mat.toFixed(0)}</div></div>
            <div><div style={{fontSize:9,color:C.teal,fontWeight:700,opacity:.7}}>TOTAL</div><div style={{fontSize:12,fontWeight:800,color:C.teal}}>₹{c.total.toFixed(0)}</div></div>
          </div>
        </div>;
      })}
      {items.length>0&&<div style={{background:C.navy,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700}}>TEXTURE TOTAL</div><div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>Mat ₹{totals.mat.toFixed(0)} + Lab ₹{totals.lab.toFixed(0)}</div></div>
        <div style={{fontSize:20,fontWeight:900,color:C.teal}}>₹{totals.total.toFixed(0)}</div>
      </div>}
    </div>}
  </div>;
}

// ─── ADMIN PROJECT DETAIL MODAL ─────────────────────────────────
function AdminProjectDetail({ p, onClose }) {
  const wm = p.quoteMode==="with_material";
  const pt = projectTotals(p);
  const scope = p.scope||"interior";
  const showInt = scope==="interior"||scope==="both";
  const showExt = scope==="exterior"||scope==="both";
  const extNet = calcExteriorTotals(p.exterior||[]);
  const ec = p.exteriorConfig||defExteriorConfig();
  const extFin = ec.finishing||defExteriorFinishing(ec.package);
  const extMat = wm?calcExteriorMaterialCost(extFin,extNet):0;
  const extLab = wm?calcExteriorLabourCost(ec,extNet):calcExteriorLabourCostExcl(ec,extNet);
  const extCalc = calcSectionTotal(extMat,extLab,p.exteriorCharges||defSectionCharges());
  const intMat = pt.mat; const intLab = wm?pt.lab:pt.labEx;
  const intCalc = calcSectionTotal(intMat,intLab,p.interiorCharges||defSectionCharges());
  const dwT = calcDWTotals(p.dwItems||[]);
  const wpT = calcWPTotals(p.wpItems||[]);
  const txT = calcTextureTotals(p.textureItems||[]);
  const polishTotals=calcPolish(project.polishItems||[]);
  const grand = (showInt?intCalc.total:0)+(showExt?extCalc.total:0)+dwT.total+wpT.total+txT.total+polishTotals.total;
  const catLabel = PROJECT_CATEGORIES.find(c=>c.id===p.projectCategory)?.label||"—";
  const FIN_ICONS = {putty:"🪣",primer:"🧴",paint:"🎨",topcoat:"✨",oilPaint:"🛢",polish:"💅",texture:"🏔",wallpaper:"🖼"};
  const ROW = ({label,value,bold=false,color="#333"})=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
      <span style={{color:"#777"}}>{label}</span>
      <span style={{fontWeight:bold?800:600,color}}>{value}</span>
    </div>
  );

  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:600,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:"20px 20px 0 0",padding:"20px 16px 36px",width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:C.navy}}>{p.clientName||p.customer?.name||"New Estimate"}</div>
          <div style={{fontSize:11,color:"#aaa"}}>{p.location||p.customer?.location||"—"} · {p.supervisorName}</div>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:"#bbb",cursor:"pointer"}}>✕</button>
      </div>

      {/* Badges */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {[
          [catLabel,"#F0F4F8","#555"],
          [p.projectType==="fresh"?"🎨 Fresh":"🔄 Repaint",p.projectType==="fresh"?C.greenL:C.orangeL,p.projectType==="fresh"?C.green:C.orange],
          [wm?"💎 With Material":"📐 Measure Only",wm?C.navyL:"#F8FAFC",wm?"#fff":C.gray],
          [scope==="both"?"🔄 Int + Ext":scope==="exterior"?"🏗 Exterior":"🏠 Interior",C.blueL,C.blue],
        ].map(([t,bg,col],i)=><span key={i} style={{background:bg,color:col,fontSize:10,fontWeight:700,borderRadius:20,padding:"3px 10px"}}>{t}</span>)}
      </div>

      {/* Client details */}
      <div style={{background:"#F8FAFC",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:C.navy,marginBottom:6}}>📋 Client Information</div>
        {[["Mobile",p.clientMobile||p.customer?.mobile||"—"],["Email",p.customer?.email||"—"],["PIN",p.customer?.pincode||"—"],["Address",p.customer?.address||"—"],["Created",p.createdAt?new Date(p.createdAt).toLocaleDateString("en-IN"):"—"],["Supervisor",p.supervisorName||"—"]].map(([l,v])=><ROW key={l} label={l} value={v}/>)}
      </div>

      {/* Interior rooms */}
      {showInt&&p.floors?.map((fl,fi)=>(
        <div key={fl.id || fi} style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:800,color:C.navy,background:C.bg,borderRadius:8,padding:"5px 10px",marginBottom:6}}>{fl.name}</div>
          {(fl.rooms || []).map((r,ri)=>{ const rc=calcRoom(r); const pkg=PACKAGES[r.package]||PACKAGES.premium; const pName=wm?getProductName(r.brand,r.package,"interior"):"";
            return <div key={r.id || ri} style={{background:"#FAFAFA",borderRadius:10,padding:"10px 12px",marginBottom:6,border:`1px solid ${pkg.color}22`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <span style={{fontSize:13,fontWeight:800,color:pkg.color}}>{r.type==="Custom"?(r.customType||"Custom"):r.type}</span>
                  {wm&&<span style={{marginLeft:8,fontSize:10,background:pkg.colorL,color:pkg.color,borderRadius:20,padding:"1px 8px",fontWeight:700}}>{pkg.icon} {pkg.label}</span>}
                </div>
                <span style={{fontSize:12,fontWeight:700,color:C.orange}}>₹{(wm?rc.total:rc.labEx).toFixed(0)}</span>
              </div>
              {wm&&pName&&<div style={{fontSize:10,color:C.orange,marginBottom:4}}>🎨 {pName} · {getBrandName(r)}</div>}
              {r.condition!=="Good"&&<div style={{fontSize:10,color:C.red,marginBottom:4}}>⚠ {r.condition}{r.conditionNotes?` — ${r.conditionNotes}`:""}</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:6}}>
                {[["Net Area",`${rc.net.toFixed(1)} sf`,C.orange],["Material",`₹${rc.mat.toFixed(0)}`,C.blue],["Labour",`₹${(wm?rc.lab:rc.labEx).toFixed(0)}`,C.green]].map(([l,v,col])=>(
                  <div key={l} style={{background:C.white,borderRadius:6,padding:"4px 6px",textAlign:"center",border:`1px solid ${col}22`}}>
                    <div style={{fontSize:8,color:"#aaa",fontWeight:700}}>{l}</div>
                    <div style={{fontSize:11,fontWeight:800,color:col}}>{v}</div>
                  </div>
                ))}
              </div>
              {wm&&<div style={{borderTop:`1px dashed ${C.border}`,paddingTop:4}}>
                {Object.entries(r.finishing||{}).filter(([,f])=>f.on).map(([k,f])=>{
                  const a=f.useRoom?rc.net:(f.area||0); const cost=(f.rate||0)*(f.coats||1)*a+(k==="wallpaper"?(f.installRate||0)*a:0);
                  return <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"1px 0",color:"#888"}}>
                    <span>{FIN_ICONS[k]||""} {f.type||k} ({f.coats||1}×) · {a.toFixed(0)} sf @ ₹{f.rate||0}</span>
                    <span style={{fontWeight:600}}>₹{cost.toFixed(0)}</span>
                  </div>;
                })}
              </div>}
            </div>; })}
        </div>
      ))}

      {/* Exterior */}
      {showExt&&<div style={{background:"#FAFAFA",borderRadius:10,padding:"10px 12px",marginBottom:12,border:`1px solid ${C.teal}22`}}>
        <div style={{fontSize:12,fontWeight:800,color:C.teal,marginBottom:6}}>🏗 Exterior — {extNet.toFixed(1)} sf net</div>
        {wm&&<div style={{fontSize:10,color:C.orange,marginBottom:6}}>
          {PACKAGES[ec.package]?.icon} {PACKAGES[ec.package]?.label} · {ec.brand==="other"?(ec.customBrand||"Other"):BRAND_PRODUCTS[ec.brand]?.name||"—"}
          {getProductName(ec.brand,ec.package,"exterior")?" · "+getProductName(ec.brand,ec.package,"exterior"):""}
        </div>}
        {(p.exterior||[]).filter(el=>(el.w||0)*(el.h||0)>0).map(el=>{
          const net=Math.max(0,(el.w||0)*(el.h||0)+(el.additions||[]).reduce((s,a)=>s+(a.w||0)*(a.h||0)*(a.qty||1),0)-(el.deductions||[]).reduce((s,d)=>s+(d.w||0)*(d.h||0)*(d.qty||1),0));
          return <div key={el.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:"#555"}}>{el.name} Elevation — {el.w}×{el.h} ft</span>
            <span style={{fontWeight:700,color:C.teal}}>{net.toFixed(1)} sf</span>
          </div>;
        })}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8}}>
          {[["Material",`₹${extMat.toFixed(0)}`,C.blue],["Labour",`₹${extLab.toFixed(0)}`,C.green]].map(([l,v,col])=>(
            <div key={l} style={{background:C.white,borderRadius:6,padding:"5px 8px",textAlign:"center"}}>
              <div style={{fontSize:8,color:"#aaa",fontWeight:700}}>{l}</div>
              <div style={{fontSize:12,fontWeight:800,color:col}}>{v}</div>
            </div>
          ))}
        </div>
      </div>}

      {/* D&W */}
        {(p.dwItems || []).length>0&&<div style={{background:"#FAFAFA",borderRadius:10,padding:"10px 12px",marginBottom:12,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:6}}>🚪 Door & Window</div>
          {(p.dwItems || []).map(it=>{ const c=calcDWItem(it); const fl=DW_FINISH_TYPES.find(f=>f.id===it.finish)?.label||(it.customFinish||it.finish);
          return <div key={it.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:"#555"}}>{it.label} · {it.qty||1}× {it.w}×{it.h}ft · {fl}</span>
            <span style={{fontWeight:700,color:C.orange}}>₹{c.total.toFixed(0)}</span>
          </div>;
        })}
        <ROW label="D&W Total" value={`₹${dwT.total.toFixed(0)}`} bold color={C.orange}/>
      </div>}

      {/* Wallpaper */}
        {(p.wpItems || []).length>0&&<div style={{background:"#FAFAFA",borderRadius:10,padding:"10px 12px",marginBottom:12,border:`1px solid ${C.purple}22`}}>
          <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:6}}>🖼 Wallpaper</div>
          {(p.wpItems || []).map(it=>{ const c=calcWPItem(it);
          return <div key={it.id} style={{padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
              <span style={{color:"#555",fontWeight:600}}>{it.label}{it.design?` — ${it.design}`:""}</span>
              <span style={{fontWeight:700,color:C.purple}}>₹{c.total.toFixed(0)}</span>
            </div>
            <div style={{fontSize:10,color:"#aaa"}}>{it.area||0} sf · {c.rolls} rolls · ₹{it.rate||0}/roll · install ₹{it.installRate||0}/sf</div>
          </div>;
        })}
        <ROW label="Wallpaper Total" value={`₹${wpT.total.toFixed(0)}`} bold color={C.purple}/>
      </div>}

      {/* Texture */}
        {(p.textureItems || []).length>0&&<div style={{background:"#FAFAFA",borderRadius:10,padding:"10px 12px",marginBottom:12,border:`1px solid ${C.teal}22`}}>
          <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:6}}>🏔 Texture</div>
          {(p.textureItems || []).map(it=>{ const c=calcTextureItem(it); const tl=(getFinMeta().texture?.types||TEXTURE_T).find(t=>t.id===it.type)?.label||(it.customType||it.type);
          return <div key={it.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:"#555"}}>{it.label} · {tl} · {(it.area||0).toFixed(1)} sf · {it.coats||1}×</span>
            <span style={{fontWeight:700,color:C.teal}}>₹{c.total.toFixed(0)}</span>
          </div>;
        })}
        <ROW label="Texture Total" value={`₹${txT.total.toFixed(0)}`} bold color={C.teal}/>
      </div>}

      {/* Section totals */}
      {showInt&&<div style={{background:C.blueL,borderRadius:10,padding:"8px 12px",marginBottom:8}}>
        <ROW label="Interior Subtotal" value={`₹${(intMat+intLab).toFixed(0)}`}/>
        {(p.interiorCharges?.additionalCharges||0)>0&&<ROW label="Additional Charges" value={`₹${p.interiorCharges.additionalCharges}`}/>}
        {(p.interiorCharges?.discount||0)>0&&<ROW label="Discount" value={`−₹${p.interiorCharges.discount}`} color={C.red}/>}
        {(p.interiorCharges?.gst||0)>0&&<ROW label={`GST ${p.interiorCharges.gst}%`} value={`₹${intCalc.gstAmt.toFixed(0)}`}/>}
        <ROW label="Interior Total" value={`₹${intCalc.total.toFixed(0)}`} bold color={C.blue}/>
      </div>}
      {showExt&&<div style={{background:C.tealL,borderRadius:10,padding:"8px 12px",marginBottom:8}}>
        {(p.exteriorCharges?.discount||0)>0&&<ROW label="Discount" value={`−₹${p.exteriorCharges.discount}`} color={C.red}/>}
        {(p.exteriorCharges?.gst||0)>0&&<ROW label={`GST ${p.exteriorCharges.gst}%`} value={`₹${extCalc.gstAmt.toFixed(0)}`}/>}
        <ROW label="Exterior Total" value={`₹${extCalc.total.toFixed(0)}`} bold color={C.teal}/>
      </div>}

      {/* Grand total */}
      <div style={{background:C.navy,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700}}>🏆 GRAND TOTAL</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:2}}>{pt.net.toFixed(1)} sf</div>
        </div>
        <div style={{fontSize:24,fontWeight:900,color:C.gold}}>₹{grand.toFixed(0)}</div>
      </div>

      {/* PDF button */}
      <button onClick={()=>generatePDF(p)} style={{width:"100%",padding:14,background:C.green,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>
        📄 Download Full PDF
      </button>
    </div>
  </div>;
}

// ─── FIX 9: ADMIN DASHBOARD ──────────────────────────────────────
function AdminScreen({ projects, onLogout }) {
  const [search,setSearch]=useState("");
  const [detailProject,setDetailProject]=useState(null);
  const filtered=projects.filter(p=>{
    const q=search.toLowerCase();
    return !q||(p.customer?.name||"").toLowerCase().includes(q)||(p.customer?.location||"").toLowerCase().includes(q)||(p.supervisorName||"").toLowerCase().includes(q);
  });
  const totalRev=filtered.reduce((s,p)=>{ const t=projectTotals(p); return s+(p.quoteMode==="with_material"?t.totalIncl:t.totalExcl); },0);
  const totalArea=filtered.reduce((s,p)=>s+projectTotals(p).net,0);
  return <div style={{maxWidth:560,margin:"0 auto",background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyL})`,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.3)"}}>
      <div>
        <div style={{fontSize:16,fontWeight:900,color:"#fff",letterSpacing:1}}>Paint<span style={{color:C.gold}}>Ship</span> <span style={{fontSize:11,background:"rgba(232,160,32,0.2)",color:C.gold,borderRadius:4,padding:"2px 7px"}}>ADMIN</span></div>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginTop:2}}>All Projects Overview — tap any project for full detail</div>
      </div>
      <button onClick={onLogout} style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.6)",border:"none",borderRadius:9,padding:"7px 12px",fontSize:12,cursor:"pointer"}}>⎋ Logout</button>
    </div>
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
        {[["📋","Projects",filtered.length.toString(),C.blue],["📐","Total Area",`${totalArea.toFixed(0)} sf`,C.teal],["₹","Revenue",`₹${(totalRev/1000).toFixed(0)}k`,C.orange]].map(([icon,label,val,col])=>(
          <div key={label} style={{background:C.white,borderRadius:12,padding:"10px 8px",border:`1px solid ${C.border}`,textAlign:"center"}}>
            <div style={{fontSize:18}}>{icon}</div>
            <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginTop:2}}>{label}</div>
            <div style={{fontSize:14,fontWeight:800,color:col,marginTop:2}}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{position:"relative",marginBottom:14}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#aaa"}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client, location, supervisor..." style={{...INP,paddingLeft:36,fontSize:13}}/>
      </div>
      {filtered.length===0
        ?<div style={{textAlign:"center",color:"#bbb",padding:"40px 0"}}><div style={{fontSize:40,marginBottom:8}}>📋</div><div>{search?"No matches":"No projects yet"}</div></div>
        :filtered.map(p=>{
          const pt=projectTotals(p); const wm=p.quoteMode==="with_material"; const rooms=p.floors?.reduce((s,f)=>s+f.rooms.length,0)||0;
          return <div key={p.id} onClick={()=>setDetailProject(p)}
            style={{...CARD,marginBottom:10,cursor:"pointer",border:`1.5px solid ${C.border}`}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:800,color:C.navy}}>{p.clientName||p.customer?.name||"New Estimate"}</div>
                <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{p.location||p.customer?.location||"—"} · <span style={{color:C.blue}}>{p.supervisorName}</span></div>
                <div style={{fontSize:10,color:"#aaa",marginTop:1}}>{p.floors?.length}F · {rooms}R · {p.projectCategory}</div>
                <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
                  <span style={{background:p.projectType==="fresh"?C.greenL:C.orangeL,color:p.projectType==="fresh"?C.green:C.orange,fontSize:9,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{p.projectType==="fresh"?"🎨 Fresh":"🔄 Repaint"}</span>
                  <span style={{background:wm?C.navyL:"#F8FAFC",color:wm?"#fff":C.gray,fontSize:9,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{wm?"💎 With Mat":"📐 Measure"}</span>
                </div>
              </div>
              <div style={{textAlign:"right",marginLeft:10}}>
                <div style={{fontSize:14,fontWeight:800,color:C.orange}}>₹{(wm?pt.totalIncl:pt.totalExcl).toFixed(0)}</div>
                <div style={{fontSize:10,color:C.gray,marginTop:2}}>{pt.net.toFixed(0)} sf</div>
                <div style={{fontSize:9,color:"#ccc",marginTop:3}}>{p.updatedAt?new Date(p.updatedAt).toLocaleDateString("en-IN"):""}</div>
                <div style={{fontSize:9,color:C.orange,marginTop:3,fontWeight:700}}>Tap for details →</div>
              </div>
            </div>
          </div>;
        })}
    </div>
    {detailProject&&<AdminProjectDetail p={detailProject} onClose={()=>setDetailProject(null)}/>}
  </div>;
}


// ─── LOGIN ────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode,setMode]=useState("otp"); // "otp" | "pin" — OTP is the primary flow now, PIN is the working fallback
  const [otpStep,setOtpStep]=useState("mobile"); // "mobile" | "code"
  const [mobile,setMobile]=useState("");
  const [otpCode,setOtpCode]=useState("");
  const [otpLoading,setOtpLoading]=useState(false);
  const [otpErr,setOtpErr]=useState("");
  const [otpSentAt,setOtpSentAt]=useState(0);

  const [cardId,setCardId]=useState("");
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");
  const [show,setShow]=useState(false);
  const [remember,setRemember]=useState(false);
  const [attempts,setAttempts]=useState(0);
  const [locked,setLocked]=useState(false);
  const [lockSecs,setLockSecs]=useState(0);
  const timerRef=useRef(null);

  useEffect(()=>{ try{ const r=localStorage.getItem("ps_remember"); if(r){const d=JSON.parse(r);setCardId(d.cardId||"");setRemember(true);} }catch{} },[]);
  useEffect(()=>{
    if(locked&&lockSecs>0){ timerRef.current=setTimeout(()=>setLockSecs(s=>s-1),1000); }
    else if(locked&&lockSecs===0){ setLocked(false);setAttempts(0);setErr(""); }
    return ()=>clearTimeout(timerRef.current);
  },[locked,lockSecs]);

  const doLogin=()=>{
    if(locked) return;
    const u=USERS.find(u=>u.cardId===cardId.trim().toUpperCase()&&u.pin===pin);
    if(u){
      if(remember) localStorage.setItem("ps_remember",JSON.stringify({cardId:cardId.trim().toUpperCase()}));
      else localStorage.removeItem("ps_remember");
      setErr(""); onLogin(u);
    } else {
      const next=attempts+1; setAttempts(next);
      if(next>=5){ setLocked(true);setLockSecs(30);setErr("Too many attempts. Locked for 30 seconds."); }
      else setErr(`Invalid Employee ID or PIN. ${5-next} attempt${5-next===1?"":"s"} remaining.`);
    }
  };

  const sendOtp=async()=>{
    if(!/^\d{10}$/.test(mobile.trim())){ setOtpErr("Enter a valid 10-digit mobile number."); return; }
    setOtpLoading(true); setOtpErr("");
    const res=await OtpAuthAdapter.sendOtp(mobile);
    setOtpLoading(false);
    if(res.ok){ setOtpStep("code"); setOtpSentAt(Date.now()); }
    else setOtpErr(res.error);
  };
  const verifyOtp=async()=>{
    if(!/^\d{4,6}$/.test(otpCode.trim())){ setOtpErr("Enter the OTP sent to your mobile."); return; }
    setOtpLoading(true); setOtpErr("");
    const res=await OtpAuthAdapter.verifyOtp(mobile, otpCode);
    setOtpLoading(false);
    if(res.ok){ setOtpErr(""); onLogin(res.user); }
    else setOtpErr(res.error);
  };

  const inp={ width:"100%",background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"13px 16px",fontSize:16,fontWeight:600,color:"#fff",outline:"none",boxSizing:"border-box" };

  return <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${C.navy} 0%,#162444 60%,#1A2F5A 100%)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 16px",fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <div style={{width:"100%",maxWidth:400}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{display:"flex",justifyContent:"center"}}>
          <img src="/PSQ-Logo.png" alt="PSQ" style={{width:120,maxWidth:"120px",height:"auto",objectFit:"contain",display:"block"}}/>
        </div>
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"28px 24px",boxShadow:"0 24px 56px rgba(0,0,0,0.45)"}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.45)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:22,textAlign:"center"}}>Supervisor Login</div>

        {mode==="otp" ? <>
          {otpStep==="mobile" ? <>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:"0.1em",display:"block",marginBottom:6,textTransform:"uppercase"}}>Mobile Number</label>
              <input value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile number"
                inputMode="numeric" maxLength={10} onKeyDown={e=>e.key==="Enter"&&sendOtp()} style={inp}
                onFocus={e=>e.target.style.borderColor=C.gold} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}/>
            </div>
            {otpErr&&<div style={{background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)",color:"#FCA5A5",borderRadius:10,padding:"10px 14px",fontSize:12,fontWeight:600,marginBottom:14,textAlign:"center",lineHeight:1.5}}>{otpErr}</div>}
            <button onClick={sendOtp} disabled={otpLoading} style={{width:"100%",padding:"15px 0",background:otpLoading?"rgba(255,255,255,0.1)":`linear-gradient(135deg,${C.gold},#F5B942)`,color:otpLoading?"rgba(255,255,255,0.4)":C.navy,border:"none",borderRadius:14,fontSize:15,fontWeight:900,cursor:otpLoading?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase"}}>
              {otpLoading?"Sending OTP…":"Send OTP →"}
            </button>
          </> : <>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",textAlign:"center",marginBottom:14}}>OTP sent to +91 {mobile}</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:"0.1em",display:"block",marginBottom:6,textTransform:"uppercase"}}>Enter OTP</label>
              <input value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="••••••"
                inputMode="numeric" maxLength={6} onKeyDown={e=>e.key==="Enter"&&verifyOtp()} style={{...inp,letterSpacing:8,fontSize:20,textAlign:"center"}}
                onFocus={e=>e.target.style.borderColor=C.gold} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}/>
            </div>
            {otpErr&&<div style={{background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)",color:"#FCA5A5",borderRadius:10,padding:"10px 14px",fontSize:12,fontWeight:600,marginBottom:14,textAlign:"center",lineHeight:1.5}}>{otpErr}</div>}
            <button onClick={verifyOtp} disabled={otpLoading} style={{width:"100%",padding:"15px 0",background:otpLoading?"rgba(255,255,255,0.1)":`linear-gradient(135deg,${C.gold},#F5B942)`,color:otpLoading?"rgba(255,255,255,0.4)":C.navy,border:"none",borderRadius:14,fontSize:15,fontWeight:900,cursor:otpLoading?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>
              {otpLoading?"Verifying…":"Verify OTP →"}
            </button>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <button onClick={()=>{setOtpStep("mobile");setOtpCode("");setOtpErr("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",padding:0}}>← Change number</button>
              <button onClick={sendOtp} disabled={otpLoading} style={{background:"none",border:"none",color:C.gold,fontSize:12,cursor:"pointer",padding:0,fontWeight:700}}>Resend OTP</button>
            </div>
          </>}
          <div style={{textAlign:"center",marginTop:18}}>
            <button onClick={()=>{setMode("pin");setOtpErr("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Use Employee ID + PIN instead</button>
          </div>
        </> : <>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:"0.1em",display:"block",marginBottom:6,textTransform:"uppercase"}}>Employee ID</label>
            <input value={cardId} onChange={e=>setCardId(e.target.value)} placeholder="e.g. PS-ADM-01" disabled={locked} style={inp} onFocus={e=>e.target.style.borderColor=C.gold} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:"0.1em",display:"block",marginBottom:6,textTransform:"uppercase"}}>PIN</label>
            <div style={{position:"relative"}}>
              <input type={show?"text":"password"} value={pin} onChange={e=>setPin(e.target.value)} placeholder="••••" maxLength={6} disabled={locked} inputMode="numeric" onKeyDown={e=>e.key==="Enter"&&doLogin()} style={{...inp,paddingRight:48,letterSpacing:8,fontSize:20}} onFocus={e=>e.target.style.borderColor=C.gold} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}/>
              <button onClick={()=>setShow(p=>!p)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:17,color:"rgba(255,255,255,0.4)",padding:0}}>{show?"🙈":"👁"}</button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
            <button onClick={()=>setRemember(p=>!p)} style={{width:20,height:20,borderRadius:5,border:`2px solid ${remember?C.gold:"rgba(255,255,255,0.25)"}`,background:remember?C.gold:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
              {remember&&<span style={{fontSize:11,color:C.navy,fontWeight:900}}>✓</span>}
            </button>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.4)",cursor:"pointer"}} onClick={()=>setRemember(p=>!p)}>Remember my Employee ID</span>
          </div>
          {err&&<div style={{background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)",color:"#FCA5A5",borderRadius:10,padding:"10px 14px",fontSize:12,fontWeight:600,marginBottom:14,textAlign:"center"}}>{locked?`🔒 ${err} (${lockSecs}s)`:err}</div>}
          <button onClick={doLogin} disabled={locked} style={{width:"100%",padding:"15px 0",background:locked?"rgba(255,255,255,0.1)":`linear-gradient(135deg,${C.gold},#F5B942)`,color:locked?"rgba(255,255,255,0.3)":C.navy,border:"none",borderRadius:14,fontSize:15,fontWeight:900,cursor:locked?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase"}}>
            {locked?`🔒 Locked (${lockSecs}s)`:"Login →"}
          </button>
          <div style={{textAlign:"center",marginTop:18}}>
            <button onClick={()=>{setMode("otp");setErr("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Use Mobile OTP instead</button>
          </div>
        </>}

        <div style={{marginTop:16,padding:"10px 12px",background:"rgba(255,255,255,0.04)",borderRadius:10,fontSize:11,color:"rgba(255,255,255,0.25)",textAlign:"center",lineHeight:1.7}}>
          Velvarna Luxury Finishes
        </div>
        {/* Invisible reCAPTCHA required by Firebase Phone Auth on web —
            renders nothing visible (size:"invisible"), just needs a mounted
            DOM node for the widget to attach to. */}
        <div id="recaptcha-container"/>
      </div>
    </div>
  </div>;
}

// ─── PDF GENERATOR ────────────────────────────────────────────────
// ─── JSON EXPORT — conforms to Master JSON Schema (PS-JG2UJZ-shree-ram.json) ───────────
function slugify(s){ return (s||"").toString().trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function generateProjectJSON(project) {
  const { rows } = buildMaterialConsumptionSummary(project);
  const withMat = project.quoteMode === "with_material";

  // ── Helper: compute net wall sqft for a room (segmented walls or legacy flat) ──
  function roomNetSqft(r) {
    let walls = 0;
    if (r.walls && r.walls.length > 0 && r.walls[0] && r.walls[0].segments) {
      const rh = r.roomHeight ?? 10;
      const useRoom = r.useRoomHeight !== false;
      for (const wall of r.walls) {
        for (const seg of (wall.segments || [])) {
          const h = seg.h ?? (useRoom ? rh : (wall.height ?? rh));
          walls += (seg.w || 0) * h;
        }
      }
    } else if (r.walls) {
      walls = r.walls.reduce((s, w) => s + (w.w || 0) * (w.h || 0), 0);
    }
    const ceil = (r.ceiling && r.ceiling.on) ? (r.ceiling.l || 0) * (r.ceiling.w || 0) : 0;
    const extra = (r.extraWalls || []).reduce((s, e) => s + (e.mode === "add" ? 1 : -1) * (e.w || 0) * (e.h || 0), 0);
    const open = (r.openings || []).reduce((s, o) => {
      const a = (o.w || 0) * (o.h || 0) * (o.count || 1);
      return s + (o.mode === "add" ? -a : a);
    }, 0);
    if (walls === 0) walls = r.totalSqft || 100;
    return Math.max(0, walls + extra + ceil - open);
  }

  // ── Helper: resolve interior finishing steps for a room ──
  const FINISHING_STEP_MAP = {
    putty:    { service:"Putty",      product:"Wall Putty",         cat:"Interior" },
    primer:   { service:"Primer",      product:"Interior Primer",   cat:"Interior" },
    paint:    { service:"Paint",       product:"Emulsion",          cat:"Interior" },
    topcoat:  { service:"Topcoat",     product:"Clear Varnish",     cat:"Interior" },
    oilPaint: { service:"Oil Paint",   product:"Synthetic Enamel",  cat:"Interior" },
    polish:   { service:"Polish",      product:"Wood Polish",       cat:"Interior" },
    texture:  { service:"Texture",     product:"Texture Finish",    cat:"Interior" },
    wallpaper:{ service:"Wallpaper",   product:"Wallpaper",         cat:"Special"  },
  };

  // ── Helper: resolve interior product name for finishing key ──
  function interiorProductName(key, f) {
    if (key === "paint") {
      const t = f.type || "";
      if (t.includes("premium")) return "Premium Emulsion";
      if (t.includes("luxury"))  return "Luxury Emulsion";
      if (t.includes("designer")) return "Designer Finish";
      if (t.includes("distemper")) return "Distemper";
      return "Economy Emulsion";
    }
    if (key === "putty")    return "Wall Putty";
    if (key === "primer")   return "Interior Primer";
    if (key === "topcoat")  return "Clear Varnish";
    if (key === "oilPaint") return "Synthetic Enamel";
    if (key === "polish")   return "Wood Polish";
    if (key === "texture")  return "Texture Finish";
    if (key === "wallpaper") return "Wallpaper";
    if (f.customName) return f.customName;
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  // ── Build floor / room / finishing-step data (interior) ──
  // DEFENSIVE FILTER: Remove any stale exterior floors that may exist in
  // project state from previous buggy exports/saves. Only interior floors
  // (real floor names like "Ground Floor", "First Floor") are allowed.
  const interiorFloorsOnly = (project.floors || []).filter(f => {
    const name = (f.name || f.floorName || "").toLowerCase();
    const id = (f.id || f.floorId || "").toString().toLowerCase();
    // Reject anything that looks like an exterior floor
    if (id === "floor_ext" || id.startsWith("ext_")) return false;
    if (name === "exterior" || name.includes("exterior")) return false;
    // Reject rooms that are exterior elevation rooms
    const hasExtRooms = (f.rooms || []).some(r => {
      const rId = (r.id || r.roomId || "").toString().toLowerCase();
      const rType = (r.type || r.roomType || "").toLowerCase();
      return rId.startsWith("ext_") || rType.includes("elevation");
    });
    if (hasExtRooms && (f.rooms || []).length <= 4) return false;
    return true;
  });

  let totalInteriorSqft = 0;

  const floors = interiorFloorsOnly.map(floor => {
    // Also filter out any exterior rooms within interior floors
    const interiorRoomsOnly = (floor.rooms || []).filter(r => {
      const rId = (r.id || r.roomId || "").toString().toLowerCase();
      const rType = (r.type || r.roomType || "").toLowerCase();
      if (rId.startsWith("ext_")) return false;
      if (rType.includes("elevation") && rType.includes("exterior")) return false;
      // Allow rooms that happen to have "elevation" in custom name but are real rooms
      if (rType === "front elevation" || rType === "rear elevation" ||
          rType === "left elevation" || rType === "right elevation") return false;
      return true;
    });

    const rooms = interiorRoomsOnly.map(room => {
      const net = roomNetSqft(room);
      totalInteriorSqft += net;

      const finishing = room.finishing || defFinishing(room.package || project.defaultPkg || "premium", project.projectType || "fresh");

      // Map interior finishing keys in canonical order to produce ordered steps
      const interiorStepKeys = ["putty", "primer", "paint", "topcoat", "oilPaint", "polish", "texture", "wallpaper"];

      const finishingSteps = interiorStepKeys
        .filter(k => { const f = finishing[k]; return f && f.on; })
        .map((k, idx) => {
          const f = finishing[k];
          const m = FINISHING_STEP_MAP[k];
          return {
            stepOrder: idx + 1,
            service: m.service,
            product: interiorProductName(k, f),
            coats: f.coats || 1,
            enabled: true
          };
        });

      const ceilingSqft = (room.ceiling && room.ceiling.on) ? (room.ceiling.l || 0) * (room.ceiling.w || 0) : 0;
      const totalSqft = net + ceilingSqft;

      return {
        roomId: room.id || room.roomId,
        roomType: room.type || room.roomType || "Living Room",
        package: room.package || "premium",
        brand: room.brand || project.defaultBrand || "asian",
        roomHeightFt: room.roomHeight || 10,
        netWallSqft: net,
        ceilingSqft: ceilingSqft,
        totalSqft: totalSqft,
        finishingSteps
      };
    });

    return {
      floorId: floor.id || floor.floorId,
      floorName: floor.name || floor.floorName || "Floor",
      rooms
    };
  });

  // ── Build exterior work data ──
  const exteriorArea = project.exterior || [];
  const globalExtConfig = project.exteriorConfig || defExteriorConfig();

  const extPkg = globalExtConfig.package || "premium";
  const extBrand = globalExtConfig.brand || project.defaultBrand || "asian";
  const extScope = (project.scope === "exterior" || project.scope === "both") && exteriorArea.some(e => (e.sections || []).some(s => (s.w || 0) > 0));

  // Exterior finishing step type order. Service names use the canonical short
  // form; product names are resolved per-step from the selected finish type's
  // label (e.g. premium_ext -> "Premium Exterior Emulsion") so PaintShip OS
  // displays the exact chosen product rather than a generic default.
  const EXT_FIN_TYPES = [
    { key:"putty",      service:"Putty" },
    { key:"primer",     service:"Primer" },
    { key:"paint",      service:"Paint" },
    { key:"protection", service:"Protection" },
    { key:"texture",    service:"Texture" },
  ];

  // Resolve the human-readable product name for an exterior finishing layer,
  // preferring the layer's custom name, then the type-id label from the
  // exterior finish tables, then a canonical fallback.
  const EXT_TYPE_TABLES = {
    putty:      EXT_PUTTY_T,
    primer:     EXT_PRIMER_T,
    paint:      EXT_PAINT_T,
    protection: EXT_PROTECTION_T,
    texture:    EXT_TEXTURE_T,
  };
  const EXT_PRODUCT_FALLBACK = {
    putty: "Exterior Putty", primer: "Exterior Primer", paint: "Premium Exterior Emulsion",
    protection: "Waterproof Coating", texture: "Exterior Texture",
  };
  function extProductName(key, f) {
    if (f && f.customName) return f.customName;
    const table = EXT_TYPE_TABLES[key] || [];
    const found = table.find(t => t.id === (f && f.type));
    if (found && found.label) return found.label;
    return EXT_PRODUCT_FALLBACK[key] || "";
  }

  // Collect sides AND per-elevation treatments.
  // Each elevation is resolved independently (handles exteriorOverride), and
  // treatments are the UNION of all enabled layers across all elevations.
  const treatmentsMap = new Map();

  const sides = ELEVATIONS.map(name => {
    const elevation = exteriorArea.find(el => el.name === name) || {
      name, sections: [], deductions: [], additions: [],
      condition: "Good", conditionIssues: [], conditionNotes: "",
      exteriorOverride: defExteriorOverride()
    };
    const cfg = resolveExteriorConfig(elevation, globalExtConfig);
    const fin = cfg.finishing || {};

    let net = calcExteriorElevationNet(elevation) || 0;
    if (extScope && net === 0) net = 400;

    const condition = elevation.condition || "Good";
    const hasIssues = (elevation.conditionIssues && elevation.conditionIssues.length > 0) ||
      (elevation.condition && elevation.condition !== "Good") || false;

    // Collect enabled treatments from this elevation
    EXT_FIN_TYPES.forEach(t => {
      const f = fin[t.key];
      if (f && f.on) {
        if (!treatmentsMap.has(t.key)) {
          treatmentsMap.set(t.key, {
            type: t.key,
            name: t.service,
            coats: f.coats || 1,
            enabled: true
          });
        }
      }
    });

    // Per-side finishing steps derived from the selected treatments
    // (Putty, Primer, Paint, ...). Always populated per elevation so PaintShip
    // OS shows the exact step breakdown and sqft for each side, regardless of
    // whether measurements were entered yet.
    const sideFinishingSteps = EXT_FIN_TYPES
      .filter(t => { const f = fin[t.key]; return f && f.on; })
      .map((t, idx) => {
        const f = fin[t.key];
        return {
          stepOrder: idx + 1,
          service: t.service,
          product: extProductName(t.key, f),
          coats: f.coats || 1,
          enabled: true
        };
      });

    return {
      sideName: name + " Elevation",
      netSqft: net,
      condition: condition,
      hasIssues: hasIssues,
      isExterior: true,
      finishingSteps: sideFinishingSteps
    };
  });

  const totalExtSqft = sides.reduce((s, sd) => s + (sd.netSqft || 0), 0);

  // Convert treatments map to array in canonical order
  const treatments = EXT_FIN_TYPES
    .filter(t => treatmentsMap.has(t.key))
    .map(t => treatmentsMap.get(t.key));

  // ── materialBillOfQuantities (mapped to Master Schema) ──
  // Derive packSize from category + material name since rows don't carry finKey.
  function derivePackSize(cat, material, unit) {
    const m = (material || "").toLowerCase();
    if (unit === "Kg") {
      if (m.includes("putty")) return 20;
      if (m.includes("filler") || m.includes("wall filler")) return 20;
      return 20;
    }
    if (unit === "L") {
      if (m.includes("putty")) return 4;
      if (m.includes("primer")) return 4;
      if (m.includes("emulsion") || m.includes("paint") || m.includes("enamel")) return 4;
      if (m.includes("varnish") || m.includes("topcoat")) return 1;
      if (m.includes("polish")) return 1;
      if (m.includes("texture")) return 5;
      if (m.includes("adhesive")) return 4;
      return 4;
    }
    if (unit === "rolls") return null;
    return null;
  }

  const materialBillOfQuantities = rows.map((row, idx) => {
    let cat = row.category || "Interior";
    if (cat && cat.indexOf(" + ") > -1) cat = cat.split(" + ")[0]; // single primary category
    let unit = row.unit;
    if (!unit || unit === "kg") unit = "Kg";
    if (unit && !["L", "Kg", "rolls"].includes(unit)) {
      unit = (row.material && row.material.toLowerCase().includes("putty")) ? "Kg" : "L";
    }
    const packSize = derivePackSize(cat, row.material, unit);
    return {
      materialId: `m${idx + 1}`,
      category: cat,
      brand: (row.brand && row.brand.trim() !== "" && row.brand !== "-") ? row.brand : "Generic / Standard",
      productName: (row.product && row.product.trim() !== "" && row.product !== "-") ? row.product : "Generic / Standard",
      totalQuantity: Number(Number(row.qty || 0).toFixed(2)),
      unit: unit,
      packSize: packSize
    };
  });

  // ── woodAndMetalItems (joinery items) ──
  const FINISH_PROD_MAP = {
    oil_paint: "Synthetic Enamel", water_based: "Water Based Acrylic", water_paint: "Water Based Acrylic",
    pu_paint: "PU Paint", duco_paint: "Duco Paint", melamine: "Melamine Polish",
    pu_polish: "PU Polish", nc_polish: "NC Polish", wood_stain: "Wood Stain",
    texture: "Texture Finish", wallpaper: "Wallpaper Finish",
    synthetic_enamel: "Synthetic Enamel", high_gloss_enamel: "High Gloss Enamel",
    metal_primer_enamel: "Metal Primer & Enamel",
  };
  function finishProductName(ft) {
    return FINISH_PROD_MAP[ft] || (ft ? ft.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Custom Finish");
  }

  // Build a map of floor/room names for joinery location resolution
  const floorRoomMap = {};
  (project.floors || []).forEach(fl => {
    floorRoomMap[fl.id] = fl.name;
    (fl.rooms || []).forEach(r => { floorRoomMap[r.id] = r.type; });
  });

  function joineryLocation(it) {
    const floorName = it.floorId ? (floorRoomMap[it.floorId] || "Ground Floor") : "Ground Floor";
    let roomName = "Living Room";
    if (it.roomId) roomName = floorRoomMap[it.roomId] || roomName;
    else if (it.location) roomName = it.location;
    return { floorName, roomName };
  }

  const woodAndMetalItems = (project.doorWindowItems || []).map(item => {
    const loc = joineryLocation(item);
    const w = Number(item.length) || 0;
    const h = Number(item.height) || 0;
    const q = Number(item.qty) || 1;
    const area = w * h * q;
    return {
      itemId: item.id || `dw_${Date.now()}`,
      itemType: item.itemType || "Door",
      customLabel: item.customType || item.label || item.customLabel || "",
      location: loc,
      dimensions: {
        widthFt: w,
        heightFt: h,
        qty: q,
        totalSqft: area
      },
      finishType: item.finishType || "oil_paint",
      productName: item.productName || item.product || finishProductName(item.finishType || "oil_paint"),
      coats: item.coats || 2
    };
  });

  // Polish (wood/metal polish) items — also joinery category
  (project.polishItems || []).forEach(item => {
    const loc = joineryLocation(item);
    const w = Number(item.l) || 0;
    const h = Number(item.h) || 0;
    const q = Number(item.qty) || 1;
    const area = w * h * q;
    woodAndMetalItems.push({
      itemId: item.id || `pol_${Date.now()}`,
      itemType: item.category || "Wood Polish",
      customLabel: item.label || "",
      location: loc,
      dimensions: { widthFt: w, heightFt: h, qty: q, totalSqft: area },
      finishType: item.finishId || "polish",
      productName: item.productName || item.product || finishProductName(item.finishId),
      coats: item.coats || 2
    });
  });

  // ── specialFeatures: wallpapers ──
  const wallpapers = (project.wallpaperItems || []).map(wp => {
    // Active wallpaper items store dimensions as width/height/qty (see
    // newWallpaperItem + WallpaperMeasurementTab). Keep wallW/wallH/w/h as
    // legacy fallbacks so older persisted data still resolves to real values.
    const w = Number(wp.width) || Number(wp.wallW) || Number(wp.w) || 0;
    const h = Number(wp.height) || Number(wp.wallH) || Number(wp.h) || 0;
    const q = Number(wp.qty) || 1;
    const totalSqft = w * h * q;
    // Standard wallpaper roll coverage: 50 sq.ft per roll.
    const rollsRequired = totalSqft > 0 ? Math.ceil(totalSqft / 50) : 1;
    return {
      wallpaperId: wp.id || `wp_${Date.now()}`,
      location: wp.location || wp.label || "Interior Wall",
      wallDimensionsFt: { width: w, height: h, totalSqft: totalSqft },
      brand: wp.brand || "",
      collection: wp.design || wp.collection || "",
      rollsRequired: rollsRequired
    };
  });

  // ── specialFeatures: textures ──
  const TX2_TEXTURE = (project.TX2_textureItems || project.textureItems || []);
  const textures = TX2_TEXTURE.map(tx => {
    // Active TX2 texture items store dimensions as width/height/qty (see
    // TX2_newTextureItem + TextureMeasurementTab). Keep wallW/wallH/w/h as
    // legacy fallbacks for older persisted data.
    const w = Number(tx.width) || Number(tx.wallW) || Number(tx.w) || 0;
    const h = Number(tx.height) || Number(tx.wallH) || Number(tx.h) || 0;
    const q = Number(tx.qty) || 1;
    const totalSqft = w * h * q;
    return {
      textureId: tx.id || `tx_${Date.now()}`,
      location: tx.location || tx.label || "Interior Wall",
      wallDimensionsFt: { width: w, height: h, totalSqft: totalSqft },
      textureType: tx.textureType || tx.type || "Roller Texture",
      brand: tx.brand || "",
      coats: tx.coats || 1
    };
  });

  // ── summaryMetrics ──
  // totalDoorsWindowsQty = sum of qty across all joinery items
  function doorWindowCount(items) {
    return (items || []).reduce((s, it) => {
      const qty = parseInt(it.qty, 10);
      return s + (Number.isNaN(qty) ? 1 : qty);
    }, 0);
  }
  const totalDoorsWindowsQty = doorWindowCount(project.doorWindowItems || []);

  // Grand total from the same aggregator the PDF/Quote Summary uses, so the
  // exported total matches the quotation exactly (incl. charges/discount/GST).
  const grandTotalBudget = Number((getProjectServiceTotals(project).grandTotal || 0));

  const totalWorkloadArea = totalInteriorSqft + totalExtSqft;
  const DAILY_WORKER_COVERAGE = 350; // sq.ft/day per painter (realistic range 300–400)
  const estimatedWorkersPerDay = 2; // realistic crew size
  const summaryMetrics = {
    totalInteriorSqft: totalInteriorSqft,
    totalExteriorSqft: totalExtSqft,
    totalDoorsWindowsQty: totalDoorsWindowsQty,
    grandTotal: grandTotalBudget,
    estimatedTotalDays: totalWorkloadArea > 0 ? Math.ceil(totalWorkloadArea / (estimatedWorkersPerDay * DAILY_WORKER_COVERAGE)) : 0,
    estimatedWorkersPerDay: totalWorkloadArea > 0 ? estimatedWorkersPerDay : 0
  };

  // ── Assemble master payload ──
  const masterPayload = {
    projectInfo: {
      projectId: project.id && project.id.includes('-') ? project.id : uid(),
      projectName: (function () {
        // Prefer an explicit project name, then the customer name, then a
        // fallback. The persisted clientName denormalises to "Unnamed" when no
        // customer has been entered yet, so it is explicitly skipped to avoid
        // PaintShip OS showing "Unnamed".
        var cn = (project.clientName || "").trim();
        return project.name || project.projectName ||
          (project.customer && project.customer.name) ||
          (cn && cn.toLowerCase() !== "unnamed" ? project.clientName : "") ||
          "Paint Project";
      })(),
      projectCategory: project.projectCategory || "residential",
      projectType: project.projectType || "fresh",
      quoteMode: project.quoteMode === "labor_only" ? "labor_only" : "with_material",
      totalBudget: grandTotalBudget,
      createdAt: (function() {
        const d = project.createdAt ? new Date(project.createdAt) : new Date();
        return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      })(),
      notes: project.notes || ""
    },
    customer: {
      name: (project.customer && project.customer.name) || project.clientName || "",
      mobile: (project.customer && project.customer.mobile) || project.clientMobile || "",
      email: (project.customer && project.customer.email) || "",
      pincode: (project.customer && project.customer.pincode) || "",
      address: (project.customer && project.customer.address) || "",
      location: (project.customer && project.customer.location) || ""
    },
    assignedSupervisor: {
      id: project.supervisorId || "",
      name: project.supervisorName || "Not Assigned"
    },
    summaryMetrics,
    materialBillOfQuantities,
    exteriorWork: {
      totalAreaSqft: totalExtSqft,
      package: extPkg,
      brand: extBrand,
      sides,
      treatments
    },
    floors,
    woodAndMetalItems,
    specialFeatures: {
      wallpapers,
      textures
    }
  };

  let json;
  try {
    const validatedData = serializeAndValidatePaintProJSON(masterPayload);
    json = JSON.stringify(validatedData, null, 2);
  } catch (error) {
    console.error("JSON Export Error:", error);
    console.warn("Falling back to raw project payload due to validation failure. Missing attributes logged above.");
    json = JSON.stringify(masterPayload, null, 2);
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const ref = `PS-PROJ_${(project.id || "").toUpperCase()}`;
  const clientSlug = slugify((project.customer && project.customer.name) || project.clientName) || "project";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ref}${clientSlug ? "-" + clientSlug : ""}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 3000);
}

function generatePDF(project) {
  const qlc = hasLegacyExtras(project);
  const totals = getProjectServiceTotals(project);
  if (totals.grandTotal <= 0) {
    alert("PDF blocked: Grand Total is ₹0. Add some measurements or items before generating the final quotation.");
    return;
  }
  const withMat=project.quoteMode==="with_material";
  const scope=project.scope||"interior";
  const showInt=scope==="interior"||scope==="both";
  const showExt=scope==="exterior"||scope==="both";
  const {customer,projectType,floors,supervisorName,supervisorId,createdAt,projectCategory}=project;
  const date=new Date(createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
  const preparedByName=project.preparedBy||supervisorName||"-";
  const preparedByIdLabel=supervisorId||"-";
  const esc=s=>(s||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  // ── PDF-003: meaning-based section palette, title bars, and white card wrappers ──
  const SEC={
    interior:  {tint:"#F3F0EA", head:"#6D5B4B", pattern:"#8A7867", desc:"Room-wise preparation and finish specification", space:22},
    exterior:  {tint:"#E4EEE8", head:"#456957", pattern:"#456957", desc:"Elevation-wise weather protection and finish system", space:22},
    polish:    {tint:"#E8DDD2", head:"#6A4C38", pattern:"#876552", desc:"Wood and metal surface finishing specification", space:22},
    doorwindow:{tint:"#F2E7D3", head:"#775A31", pattern:"#775A31", desc:"Joinery measurement and coating schedule", space:22},
    wallpaper: {tint:"#EAF0F7", head:"#58708D", pattern:"#6C85A4", desc:"Decorative wall-covering requirement", space:22},
    texture:   {tint:"#ECEAE7", head:"#666A6E", pattern:"#7D8287", desc:"Feature-surface finish specification", space:22},
  };
  const hexToRgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;};
  // ── PDF-008: full-card motifs — low alpha baked into the SVG color itself (0.045) so the same
  //     background-image can sit on the header, the table, and the total row without any CSS
  //     opacity on those elements (which would otherwise fade the text/numbers too). ──
  const MOTIF={
    interior:{w:44,h:60,body:`<rect x="4" y="4" width="36" height="52" fill="none" stroke="%COL%" stroke-width="1.4"/><line x1="4" y1="30" x2="40" y2="30" stroke="%COL%" stroke-width="1.1"/>`},
    exterior:{w:44,h:60,body:`<line x1="15" y1="0" x2="15" y2="60" stroke="%COL%" stroke-width="1.3"/><line x1="0" y1="20" x2="30" y2="20" stroke="%COL%" stroke-width="1.2"/><line x1="0" y1="40" x2="30" y2="40" stroke="%COL%" stroke-width="1.2"/>`},
    polish:{w:80,h:60,body:`<path d="M0 20 Q40 12 80 20" stroke="%COL%" stroke-width="1.3" fill="none"/><path d="M0 42 Q40 48 80 42" stroke="%COL%" stroke-width="1.2" fill="none"/><ellipse cx="40" cy="30" rx="6" ry="3" fill="none" stroke="%COL%" stroke-width="1.2"/>`},
    doorwindow:{w:52,h:60,body:`<rect x="6" y="8" width="28" height="44" fill="none" stroke="%COL%" stroke-width="1.3"/><line x1="20" y1="8" x2="20" y2="52" stroke="%COL%" stroke-width="1.2"/>`},
    wallpaper:{w:30,h:30,body:`<path d="M15 0 L30 15 L15 30 L0 15 Z" fill="none" stroke="%COL%" stroke-width="1.2"/>`},
    texture:{w:60,h:60,body:`<path d="M10 20 Q20 8 32 18 Q42 28 30 38 Q18 46 8 34 Q2 26 10 20 Z" fill="none" stroke="%COL%" stroke-width="1.3"/>`},
  };
  const motifCSS=key=>{
    const m=MOTIF[key];
    const svgBody=m.body.replace(/%COL%/g,hexToRgba(SEC[key].pattern,0.05));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.w} ${m.h}">${svgBody}</svg>`;
    const uri=`data:image/svg+xml,${encodeURIComponent(svg)}`;
    return `background-image:url(&quot;${uri}&quot;);background-repeat:repeat;background-size:${m.w}px ${m.h}px`;
  };
  const secBar=(key,label)=>`<div style="position:relative;overflow:hidden;min-height:84px;display:flex;align-items:center;background:${SEC[key].tint};border-left:4px solid ${SEC[key].head};padding:12px 14px"><div style="position:absolute;inset:0;pointer-events:none;${motifCSS(key)}"></div><div style="position:relative;z-index:1;width:56%"><div style="font-size:12px;font-weight:800;color:${SEC[key].head};text-transform:uppercase;letter-spacing:.06em">${label}</div><div style="font-size:10px;color:#667085;margin-top:10px">${SEC[key].desc}</div></div></div>`;
  const secTable=key=>`width:100%;border-collapse:collapse;background:#fff`;
  const secTotalBG=key=>`background:${SEC[key].tint}`;
  // ── PDF-009-A: fixed column widths so Area/Rate/Amount line up identically across every table ──
  const COLW={
    interior:[43,12,14,15,16],
    exterior:[43,12,14,15,16],
    doorwindow:[13,20,22,14,15,16],
    wallpaper:[13,16,14,13,13,15,16],
    texture:[12,16,14,13,14,15,16],
    polish:[18,37,14,15,16],
  };
  const colgroup=key=>`<colgroup>${(COLW[key]||[]).map(w=>`<col style="width:${w}%">`).join("")}</colgroup>`;
  const secCard=(key,inner)=>`<div style="background:#fff;border:1px solid #E2E5E9;border-radius:8px;overflow:hidden;page-break-inside:avoid;break-inside:avoid;margin-bottom:22px">${inner}</div>`;
  const zebra=(i,tint)=>i%2===0?"#fff":tint;
  const catLabel=PROJECT_CATEGORIES.find(c=>c.id===projectCategory)?.label||"—";
  const FIN_ICONS={putty:"",primer:"",paint:"",topcoat:"",oilPaint:"",polish:"",texture:"",wallpaper:""};
  const EXT_FIN_ICONS_PDF={putty:"",primer:"",paint:"",protection:"",texture:""};
  const intT=projectTotals(project);
  const intMat=intT.mat,intLab=withMat?intT.lab:intT.labEx,intNet=intT.net;
  const intC=calcSectionTotal(intMat,intLab,project.interiorCharges||defSectionCharges());
  const polishPDF=calcPolish(project.polishItems||[]);
  const mtPDF=project.measureType||"interior";
  const isDoorWindowPDF=mtPDF==="doorwindow";
  const isWallpaperPDF=mtPDF==="wallpaper";
  const isTexturePDF=mtPDF==="texture";
  const doorWindowItemsPDF=project.doorWindowItems||[];
  const doorWindowCalcPDF=calcDoorWindow(doorWindowItemsPDF);
  const wallpaperItemsPDF=project.wallpaperItems||[];
  const wallpaperCalcPDF=calcWallpaper(wallpaperItemsPDF);
  const tx2ItemsPDF=project.TX2_textureItems||[];
  const tx2CalcPDF=calcTexture(tx2ItemsPDF);
  const totalsPDF=getProjectServiceTotals(project);
  const exteriorPDF=totalsPDF.exterior;
  const exteriorBreakdownPDF=totalsPDF.exteriorBreakdown||[];
  const grandTotal=totalsPDF.grandTotal;
  const modulesWithDataCount=[showInt&&totalsPDF.interior.total>0,showExt&&totalsPDF.exterior.total>0,polishPDF.total>0,doorWindowCalcPDF.total>0,wallpaperCalcPDF.total>0,tx2CalcPDF.total>0].filter(Boolean).length;
  const isCombinedPDF=modulesWithDataCount>1;

  const finMetaPDF=getFinMeta();
  const finLabelPDF=(k,f)=>{
    if(f.customName) return esc(f.customName);
    const list=finMetaPDF[k]?.types;
    const found=list&&list.find(t=>t.id===f.type);
    if(found) return esc(found.label);
    const CAT_LABEL_PDF={putty:"Putty",primer:"Primer",paint:"Paint",topcoat:"Topcoat",oilPaint:"Oil Paint",polish:"Polish",texture:"Texture",wallpaper:"Wallpaper"};
    return esc(f.type?f.type.replace(/_/g," ").replace(/\b\w/g,ch=>ch.toUpperCase()):(CAT_LABEL_PDF[k]||k));
  };
  const intRows=(showInt&&!((isDoorWindowPDF||isWallpaperPDF||isTexturePDF)&&intNet<=0))?floors.map(fl=>{
    const floorHeader=`<tr style="background:#F1F0EF"><td colspan="5" style="padding:8px 8px;font-size:11px;font-weight:800;color:#1E293B;text-transform:uppercase;letter-spacing:.05em">${esc(fl.name)}</td></tr>`;
    return floorHeader+fl.rooms.map(r=>{
    const c=calcRoom(r);const fin=r.finishing||{};
    const roomLabel=esc(r.type==="Custom"?(r.customType||"Custom"):r.type);
    const roomTotal=withMat?c.total:c.labEx;
    const headingRow=`<tr style="background:${SEC.interior.tint}"><td colspan="2" style="padding:7px 8px;font-size:12px;font-weight:700;color:${SEC.interior.head}">${roomLabel}</td><td style="padding:7px 8px;font-size:12px;font-weight:700;text-align:right;color:${SEC.interior.head}">${c.net.toFixed(1)} sf</td><td></td><td style="padding:7px 8px;font-size:12px;font-weight:800;text-align:right;color:#B8893B">${inr(roomTotal)}</td></tr>`;
    if(!withMat){ return headingRow+`<tr><td style="padding:6px 8px;font-size:12px;color:#666">&nbsp;&nbsp;Labour Only</td><td colspan="3" style="padding:6px 8px"></td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(c.labEx)}</td></tr>`; }
    const items=Object.entries(fin).filter(([,f])=>f.on);
    if(items.length===0){ return headingRow+`<tr><td colspan="4" style="padding:6px 8px;font-size:12px;color:#999;font-style:italic">&nbsp;&nbsp;No finishes selected</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(0)}</td></tr>`; }
    const finishRows=items.map(([k,f])=>{
      const a=f.useRoom?c.net:(f.area||0);
      const rate=f.rate||0,coats=f.coats||1;
      const cost=rate*coats*a+(k==="wallpaper"?(f.installRate||0)*a:0);
      const effRate=a>0?cost/a:0;
      return `<tr><td style="padding:6px 8px;font-size:12px;color:#444">&nbsp;&nbsp;${finLabelPDF(k,f)}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${coats}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${a.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(effRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right" colspan="1">${inr(cost)}</td></tr>`;
    }).join("");
    return headingRow+finishRows;
    }).join("");
  }).join("")+`<tr><td colspan="2" style="padding:8px 10px;font-size:12px;color:#1E293B;background:#fff">Interior Total Area: <b>${intNet.toFixed(1)} sq.ft</b></td><td colspan="3" style="padding:8px 10px;font-size:12px;color:#1E293B;text-align:right;background:#fff">Interior Total Amount: <b>${inr(totalsPDF.interior.total)}</b></td></tr>`+`<tr style="${secTotalBG("interior")};border-top:2px solid #fff"><td colspan="4" style="padding:8px;font-size:13px;font-weight:800;color:${SEC.interior.head}">Interior Total</td><td style="padding:8px;font-size:15px;font-weight:900;text-align:right;color:#B8893B">${inr(totalsPDF.interior.total)}</td></tr>`:"";

  const intCharges=project.interiorCharges||defSectionCharges();
  const intSummary=(showInt&&!((isDoorWindowPDF||isWallpaperPDF||isTexturePDF)&&intNet<=0))?secCard("interior",`
    ${secBar("interior","Interior Room-wise Breakdown")}
    <table style="${secTable("interior")}">${colgroup("interior")}<thead><tr><th style="background:${SEC.interior.tint};color:${SEC.interior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:left;font-size:11px">Finish Item</th><th style="background:${SEC.interior.tint};color:${SEC.interior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Coats</th><th style="background:${SEC.interior.tint};color:${SEC.interior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Area</th><th style="background:${SEC.interior.tint};color:${SEC.interior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Rate</th><th style="background:${SEC.interior.tint};color:${SEC.interior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Amount</th></tr></thead>
    <tbody>${intRows}</tbody></table>`):"";

  const extFinMetaPDF=getExtFinMeta();
  const extFinLabelPDF=(k,f)=>{
    if(f.customName) return esc(f.customName);
    const types=(extFinMetaPDF[k]&&extFinMetaPDF[k].types)||[];
    const found=types.find(t=>t.id===f.type);
    if(found) return esc(found.label);
    const EXT_CAT_LABEL_PDF={putty:"Exterior Putty",primer:"Exterior Primer",paint:"Exterior Paint",protection:"Protection Coating",texture:"Exterior Texture"};
    return esc(f.type?f.type.replace(/_/g," ").replace(/\b\w/g,ch=>ch.toUpperCase()):(EXT_CAT_LABEL_PDF[k]||k));
  };
  const EXT_LAYER_ORDER_PDF=["putty","primer","paint","protection","texture"];
  const firstDefaultElevationPDF=exteriorBreakdownPDF.find(e=>e.useGlobal!==false)||null;
  const extElevRows=exteriorBreakdownPDF.filter(entry=>(entry.area||0)>0).map(entry=>{
    const cfg=entry.config||defExteriorConfig();
    const usingDefault=entry.useGlobal!==false;
    const statusLabel=usingDefault?"Default Paint":"Customized";
    const headingRow=`<tr style="background:${SEC.exterior.tint}"><td colspan="2" style="padding:7px 8px;font-size:12px;font-weight:700;color:${SEC.exterior.head}">${esc(entry.name)} Elevation <span style="font-weight:600;font-size:10px;color:#8A93A3">(${statusLabel})</span></td><td style="padding:7px 8px;font-size:12px;font-weight:700;text-align:right;color:${SEC.exterior.head}">${(entry.area||0).toFixed(1)} sf</td><td></td><td style="padding:7px 8px;font-size:12px;font-weight:800;text-align:right;color:#B8893B">${inr(entry.total||0)}</td></tr>`;
    if(!withMat){ return headingRow+`<tr><td style="padding:6px 8px;font-size:12px;color:#666">&nbsp;&nbsp;Labour Only</td><td colspan="2" style="padding:6px 8px"></td><td style="padding:6px 8px;font-size:12px;text-align:right"></td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(entry.labour||0)}</td></tr>`; }
    // Global manual-area (useRoom:false) layers are charged once by calcExteriorConfiguredTotals,
    // allocated to the first default elevation — mirror that here so no layer is printed twice.
    const showManualLayers=!usingDefault||(firstDefaultElevationPDF&&entry.id===firstDefaultElevationPDF.id);
    const finishing=cfg.finishing||{};
    const items=EXT_LAYER_ORDER_PDF
      .map(k=>[k,finishing[k]])
      .filter(([,f])=>f&&f.on===true)
      .filter(([,f])=>!(f.useRoom===false&&!showManualLayers));
    if(items.length===0){ return headingRow+`<tr><td colspan="3" style="padding:6px 8px;font-size:12px;color:#999;font-style:italic">&nbsp;&nbsp;No finishes selected</td><td style="padding:6px 8px"></td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(0)}</td></tr>`; }
    const finishRows=items.map(([k,f])=>{
      const a=f.useRoom!==false?(entry.area||0):(f.area||0);
      const rate=f.rate||0,coats=f.coats||1;
      const effRate=rate*coats;
      const cost=a*effRate;
      return `<tr><td style="padding:6px 8px;font-size:12px;color:#444">&nbsp;&nbsp;${extFinLabelPDF(k,f)}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${coats}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${a.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(effRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(cost)}</td></tr>`;
    }).join("");
    return headingRow+finishRows;
  }).join("");

  const extSummary=exteriorPDF.area>0?secCard("exterior",`
    ${secBar("exterior","Exterior Elevation Breakdown")}
    <table style="${secTable("exterior")}">${colgroup("exterior")}<thead><tr><th style="background:${SEC.exterior.tint};color:${SEC.exterior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:left;font-size:11px">Finish Item</th><th style="background:${SEC.exterior.tint};color:${SEC.exterior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Coats</th><th style="background:${SEC.exterior.tint};color:${SEC.exterior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Area</th><th style="background:${SEC.exterior.tint};color:${SEC.exterior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Rate</th><th style="background:${SEC.exterior.tint};color:${SEC.exterior.head};border-bottom:1px solid #E2E5E9;padding:8px 10px;text-align:right;font-size:11px">Amount</th></tr></thead>
    <tbody>${extElevRows}<tr><td colspan="2" style="padding:8px 10px;font-size:12px;color:#1E293B;background:#fff">Exterior Total Area: <b>${exteriorPDF.area.toFixed(1)} sq.ft</b></td><td colspan="3" style="padding:8px 10px;font-size:12px;color:#1E293B;text-align:right;background:#fff">Exterior Total Amount: <b>${inr(exteriorPDF.total)}</b></td></tr><tr style="${secTotalBG("exterior")};border-top:2px solid #fff"><td colspan="4" style="padding:8px;font-size:13px;font-weight:800;color:${SEC.exterior.head}">Exterior Total</td><td style="padding:8px;font-size:15px;font-weight:900;text-align:right;color:#B8893B">${inr(exteriorPDF.total)}</td></tr></tbody></table>`):"";

  const polishRows=(project.polishItems||[]).map((item,i)=>{ const c=calcPolishItem(item); const fin=POLISH_FINISH_TYPES.find(f=>f.id===item.finishId)||POLISH_FINISH_TYPES[0]; const effRate=c.net>0?c.total/c.net:0; return `<tr style="background:${zebra(i,SEC.polish.tint)}"><td style="padding:6px 8px;font-size:12px">${esc(item.category)}${item.label?` — ${esc(item.label)}`:""}</td><td style="padding:6px 8px;font-size:12px">${fin.label}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${c.net.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(effRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(c.total)}</td></tr>`; }).join("");
  const doorWindowRowsPDF=doorWindowItemsPDF.map((it,i)=>{ const c=calcDoorWindowItem(it); const fin=DW2_FINISH_TYPES.find(f=>f.id===it.finishType)||DW2_FINISH_TYPES[0]; const itemLabel=it.itemType==="Custom"?(it.customType||"Custom"):it.itemType; const effRate=c.area>0?c.enamelTotal/c.area:0;
    const enamelRow = `<tr style="background:${zebra(i,SEC.doorwindow.tint)}"><td style="padding:6px 8px;font-size:12px">${esc(itemLabel)}</td><td style="padding:6px 8px;font-size:12px">${esc(fin.label)} (Top Coat)</td><td style="padding:6px 8px;font-size:12px;text-align:right">${it.length||0}×${it.height||0}×${it.qty||1}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${c.area.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(effRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(c.enamelTotal)}</td></tr>`;
    if (!c.primerOn) return enamelRow;
    const pFin=DW2_FINISH_TYPES.find(f=>f.id===(it.primer?.finishType||"metal_primer_enamel"));
    const pEffRate=c.area>0?c.primerTotal/c.area:0;
    const primerRow = `<tr style="background:${zebra(i,SEC.doorwindow.tint)}"><td style="padding:6px 8px;font-size:12px">${esc(itemLabel)}</td><td style="padding:6px 8px;font-size:12px">${esc(pFin?pFin.label:"Metal Primer")} (Primer)</td><td style="padding:6px 8px;font-size:12px;text-align:right">${it.length||0}×${it.height||0}×${it.qty||1}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${c.area.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(pEffRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(c.primerTotal)}</td></tr>`;
    return primerRow + enamelRow;
  }).join("");

  // ─── Unified Wood, Metal & Joinery PDF card (PDF-010B) ───────────
  // One outer card, presentation-only. Internal calc engines
  // (calcDoorWindowItem/Totals, calcPolishItem/calcPolish) stay separate.
  const joineryHasData = doorWindowCalcPDF.total>0 || polishPDF.total>0;
  const joineryOuterHeader = `<div style="position:relative;overflow:hidden;min-height:84px;display:flex;align-items:center;background:${SEC.doorwindow.tint};border-left:4px solid ${SEC.doorwindow.head};padding:12px 14px"><div style="position:absolute;inset:0;pointer-events:none;${motifCSS("doorwindow")}"></div><div style="position:relative;z-index:1;width:70%"><div style="font-size:12px;font-weight:800;color:${SEC.doorwindow.head};text-transform:uppercase;letter-spacing:.06em">Wood, Metal &amp; Joinery</div><div style="font-size:10px;color:#667085;margin-top:10px">Doors, windows, furniture, grills, gates and surface finishes</div></div></div>`;
  const joinerySubHeader = (title,subtitle,first)=>`<div style="padding:10px 14px 6px;${first?"":"border-top:1px solid #E2E5E9;"}margin-top:12px"><div style="font-size:10px;font-weight:800;color:${SEC.doorwindow.head};text-transform:uppercase;letter-spacing:.05em">${title}</div><div style="font-size:9px;color:#98A2B3;margin-top:2px">${subtitle}</div></div>`;
  const itemsMeasurementSub = doorWindowCalcPDF.total>0 ? `${joinerySubHeader("Items &amp; Measurement","Dimensions, quantities, finish selection and item pricing",true)}<table style="${secTable("doorwindow")}">${colgroup("doorwindow")}<thead><tr><th style="background:${SEC.doorwindow.tint};color:${SEC.doorwindow.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:left;font-size:11px">Item</th><th style="background:${SEC.doorwindow.tint};color:${SEC.doorwindow.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;font-size:11px">Finish</th><th style="background:${SEC.doorwindow.tint};color:${SEC.doorwindow.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">L×H×Qty</th><th style="background:${SEC.doorwindow.tint};color:${SEC.doorwindow.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Area</th><th style="background:${SEC.doorwindow.tint};color:${SEC.doorwindow.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Effective Rate</th><th style="background:${SEC.doorwindow.tint};color:${SEC.doorwindow.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Amount</th></tr></thead><tbody>${doorWindowRowsPDF}<tr style="${secTotalBG("doorwindow")};border-top:2px solid #fff"><td colspan="3" style="padding:7px 8px;font-weight:700;font-size:12px;color:${SEC.doorwindow.head}">Items &amp; Measurement Total</td><td style="padding:7px 8px;font-weight:700;text-align:right">${doorWindowCalcPDF.area.toFixed(1)} sf</td><td style="padding:7px 8px"></td><td style="padding:7px 8px;font-weight:800;text-align:right;color:#B8893B">${inr(doorWindowCalcPDF.total)}</td></tr></tbody></table>` : "";
  const finishingDetailsSub = polishPDF.total>0 ? `${joinerySubHeader("Finishing Details","Paint, enamel, polish and clear-finish specifications",doorWindowCalcPDF.total<=0)}<table style="${secTable("polish")}">${colgroup("polish")}<thead><tr><th style="background:${SEC.polish.tint};color:${SEC.polish.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:left;font-size:11px">Item</th><th style="background:${SEC.polish.tint};color:${SEC.polish.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;font-size:11px">Finish</th><th style="background:${SEC.polish.tint};color:${SEC.polish.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Area</th><th style="background:${SEC.polish.tint};color:${SEC.polish.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Effective Rate</th><th style="background:${SEC.polish.tint};color:${SEC.polish.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Amount</th></tr></thead><tbody>${polishRows}<tr style="${secTotalBG("polish")};border-top:2px solid #fff"><td colspan="2" style="padding:7px 8px;font-weight:700;font-size:12px;color:${SEC.polish.head}">Finishing Details Total</td><td style="padding:7px 8px;font-weight:700;text-align:right">${polishPDF.net.toFixed(1)} sf</td><td style="padding:7px 8px"></td><td style="padding:7px 8px;font-weight:800;text-align:right;color:#B8893B">${inr(polishPDF.total)}</td></tr></tbody></table>` : "";
  const joineryTotalBand = joineryHasData ? `<div style="background:${SEC.doorwindow.tint};padding:12px 14px;margin-top:4px;border-top:2px solid #fff;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:11px;font-weight:800;color:${SEC.doorwindow.head};text-transform:uppercase;letter-spacing:.05em">Wood, Metal &amp; Joinery Total</div><div style="font-size:10px;color:#667085;margin-top:2px">${(doorWindowCalcPDF.area+polishPDF.net).toFixed(1)} sf</div></div><div style="font-size:16px;font-weight:900;color:#B8893B">${inr(doorWindowCalcPDF.total+polishPDF.total)}</div></div>` : "";
  const joinerySectionPDF = joineryHasData ? secCard("doorwindow", `${joineryOuterHeader}${itemsMeasurementSub}${finishingDetailsSub}${joineryTotalBand}`) : "";
  const wallpaperRowsPDF=wallpaperItemsPDF.map((it,i)=>{ const c=calcWallpaperItem(it); const w=Number(it.width)||0,h=Number(it.height)||0,q=Number(it.qty)||1,rw=Number(it.rollWidth)||0,rl=Number(it.rollLength)||0; const effRate=c.area>0?c.total/c.area:0; return `<tr style="background:${zebra(i,SEC.wallpaper.tint)}"><td style="padding:6px 8px;font-size:12px">${esc(it.label||"Wallpaper")}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${w}×${h}×${q}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${c.area.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${rw}×${rl} ft</td><td style="padding:6px 8px;font-size:12px;text-align:right">${c.requiredRolls}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(effRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(c.total)}</td></tr>`; }).join("");
  const wallpaperSectionPDF=wallpaperCalcPDF.total>0?secCard("wallpaper",`${secBar("wallpaper","Wallpaper")}<table style="${secTable("wallpaper")}">${colgroup("wallpaper")}<thead><tr><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:left;font-size:11px">Wall / Area</th><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">W×H×Qty</th><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Area</th><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Roll Size</th><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Required Rolls</th><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Effective Rate</th><th style="background:${SEC.wallpaper.tint};color:${SEC.wallpaper.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Amount</th></tr></thead><tbody>${wallpaperRowsPDF}<tr style="${secTotalBG("wallpaper")};border-top:2px solid #fff"><td colspan="2" style="padding:7px 8px;font-weight:700;font-size:12px;color:${SEC.wallpaper.head}">Wallpaper Total</td><td style="padding:7px 8px;font-weight:700;text-align:right">${wallpaperCalcPDF.area.toFixed(1)} sf</td><td colspan="2" style="padding:7px 8px"></td><td style="padding:7px 8px"></td><td style="padding:7px 8px;font-weight:800;text-align:right;color:#B8893B">${inr(wallpaperCalcPDF.total)}</td></tr></tbody></table>`):"";
  const tx2RowsPDF=tx2ItemsPDF.map((it,i)=>{ const c=TX2_calcTextureItem(it); const tType=it.textureType==="Custom Texture"?(it.customType||"Custom Texture"):it.textureType; const effRate=c.area>0?c.total/c.area:0; return `<tr style="background:${zebra(i,SEC.texture.tint)}"><td style="padding:6px 8px;font-size:12px">${esc(it.label||"Texture")}</td><td style="padding:6px 8px;font-size:12px">${esc(tType)}</td><td style="padding:6px 8px;font-size:12px">${it.productName?esc(it.productName):"—"}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${it.width||0}×${it.height||0}×${it.qty||1}</td><td style="padding:6px 8px;font-size:12px;text-align:right">${c.area.toFixed(1)} sf</td><td style="padding:6px 8px;font-size:12px;text-align:right">${inr(effRate)}/sf</td><td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:right">${inr(c.total)}</td></tr>`; }).join("");
  const tx2SectionPDF=tx2CalcPDF.total>0?secCard("texture",`${secBar("texture","Texture")}<table style="${secTable("texture")}">${colgroup("texture")}<thead><tr><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:left;font-size:11px">Label</th><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:left;font-size:11px">Texture Type</th><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:left;font-size:11px">Product / Finish</th><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">W×H×Qty</th><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Area</th><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Effective Rate</th><th style="background:${SEC.texture.tint};color:${SEC.texture.head};border-bottom:1px solid #E2E5E9;padding:7px 8px;text-align:right;font-size:11px">Amount</th></tr></thead><tbody>${tx2RowsPDF}<tr style="${secTotalBG("texture")};border-top:2px solid #fff"><td colspan="4" style="padding:7px 8px;font-weight:700;font-size:12px;color:${SEC.texture.head}">Texture Total</td><td style="padding:7px 8px;font-weight:700;text-align:right">${tx2CalcPDF.area.toFixed(1)} sf</td><td style="padding:7px 8px"></td><td style="padding:7px 8px;font-weight:800;text-align:right;color:#B8893B">${inr(tx2CalcPDF.total)}</td></tr></tbody></table>`):"";
  const subtotalPDF=totalsPDF.combinedSubtotal;
  const additionalChargesPDF=totalsPDF.additionalCharges;
  const serviceSubtotalPDF=Math.max(0,subtotalPDF-additionalChargesPDF);
  const discountPDF=totalsPDF.discountAmount;
  const taxableAmountPDF=totalsPDF.taxableAmount;
  const gstAmountPDF=totalsPDF.gstAmount;
  const intDiscountPctPDF=Number((project.interiorCharges||{}).discount)||0;
  const extDiscountPctPDF=Number((project.exteriorCharges||{}).discount)||0;
  const intDiscountAmtPDF=Number(totalsPDF.intChargeCalc?.discountAmt)||0;
  const extDiscountAmtPDF=Number(totalsPDF.extChargeCalc?.discountAmt)||0;
  const intGstPctPDF=Number((project.interiorCharges||{}).gst)||0;
  const extGstPctPDF=Number((project.exteriorCharges||{}).gst)||0;
  const intGstAmtPDF=Number(totalsPDF.intChargeCalc?.gstAmt)||0;
  const extGstAmtPDF=Number(totalsPDF.extChargeCalc?.gstAmt)||0;
  const finalGrandTotalPDF=totalsPDF.finalTotal;

  const savedLogoSrc = (typeof localStorage !== "undefined" && localStorage.getItem("custom_pdf_logo")) || "/Paintship%20W-W-Logo%20(5).png";
  const grandBlock=`<div style="margin-top:28px;background:#17233C;border-radius:12px;padding:18px 20px">${joineryHasData?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><div style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:.06em">WOOD, METAL &amp; JOINERY</div><div style="font-size:14px;font-weight:800;color:#B8893B">${inr(doorWindowCalcPDF.total+polishPDF.total)}</div></div>`:""}${(totalsPDF.exterior.total>0&&!showInt)?`<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><div style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:.06em">EXTERIOR</div><div style="font-size:14px;font-weight:800;color:#B8893B">${inr(totalsPDF.exterior.total)}</div></div>`:""}${showInt&&exteriorPDF.area>0?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px"><div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:.06em">INTERIOR</div><div style="font-size:16px;font-weight:900;color:#B8893B;margin-top:3px">${inr(totalsPDF.interior.total)}</div></div><div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:.06em">EXTERIOR</div><div style="font-size:16px;font-weight:900;color:#B8893B;margin-top:3px">${inr(totalsPDF.exterior.total)}</div></div></div>`:""}<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px 14px;margin:10px 0 14px;border:1px solid rgba(255,255,255,0.08)"><div style="font-size:9px;color:rgba(255,255,255,0.45);font-weight:700;letter-spacing:.07em;margin-bottom:8px">CHARGES SUMMARY</div><table style="width:100%;border-collapse:collapse;color:rgba(255,255,255,0.85)"><tbody>
    <tr><td style="padding:3px 0;font-size:11px">Service Subtotal</td><td style="padding:3px 0;font-size:11px;text-align:right">${inr(serviceSubtotalPDF)}</td></tr>
    ${additionalChargesPDF>0?`<tr><td style="padding:3px 0;font-size:11px">Additional Charges</td><td style="padding:3px 0;font-size:11px;text-align:right">${inr(additionalChargesPDF)}</td></tr><tr><td style="padding:3px 0;font-size:11px;font-weight:700">Subtotal After Charges</td><td style="padding:3px 0;font-size:11px;font-weight:700;text-align:right">${inr(subtotalPDF)}</td></tr>`:""}
    ${intDiscountAmtPDF>0?`<tr><td style="padding:3px 0;font-size:11px;color:#F3A6A6">Interior Discount (${intDiscountPctPDF}%)</td><td style="padding:3px 0;font-size:11px;text-align:right;color:#F3A6A6">−${inr(intDiscountAmtPDF)}</td></tr>`:""}
    ${extDiscountAmtPDF>0?`<tr><td style="padding:3px 0;font-size:11px;color:#F3A6A6">Exterior Discount (${extDiscountPctPDF}%)</td><td style="padding:3px 0;font-size:11px;text-align:right;color:#F3A6A6">−${inr(extDiscountAmtPDF)}</td></tr>`:""}
    ${discountPDF>0?`<tr style="border-top:1px solid rgba(255,255,255,0.10)"><td style="padding:4px 0;font-size:11px;font-weight:700;color:#F3A6A6">Total Discount</td><td style="padding:4px 0;font-size:11px;font-weight:700;text-align:right;color:#F3A6A6">−${inr(discountPDF)}</td></tr>`:""}
    <tr style="border-top:1px solid rgba(255,255,255,0.15)"><td style="padding:5px 0 3px;font-size:11px;font-weight:700">Taxable Amount</td><td style="padding:5px 0 3px;font-size:11px;font-weight:700;text-align:right">${inr(taxableAmountPDF)}</td></tr>
    ${intGstAmtPDF>0?`<tr><td style="padding:3px 0;font-size:11px">Interior GST (${intGstPctPDF}%)</td><td style="padding:3px 0;font-size:11px;text-align:right">${inr(intGstAmtPDF)}</td></tr>`:""}
    ${extGstAmtPDF>0?`<tr><td style="padding:3px 0;font-size:11px">Exterior GST (${extGstPctPDF}%)</td><td style="padding:3px 0;font-size:11px;text-align:right">${inr(extGstAmtPDF)}</td></tr>`:""}
    ${gstAmountPDF>0?`<tr style="border-top:1px solid rgba(255,255,255,0.10)"><td style="padding:4px 0;font-size:11px;font-weight:700">Total GST</td><td style="padding:4px 0;font-size:11px;font-weight:700;text-align:right">${inr(gstAmountPDF)}</td></tr>`:""}
  </tbody></table></div><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:700;letter-spacing:.07em">FINAL GRAND TOTAL</div><div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:2px">${totalsPDF.grandArea.toFixed(1)} sf total</div></div><div style="font-size:30px;font-weight:900;color:#B8893B">${inr(finalGrandTotalPDF)}</div></div></div>`;

  const logoSrc = (typeof localStorage !== "undefined" && localStorage.getItem("custom_pdf_logo")) || "/Paintship%20W-W-Logo%20(5).png";
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Quotation — ${esc(customer.name||"Client")}</title>
<style>*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;margin:0;color:#1E293B;background:#F7F6F2}.page{max-width:800px;margin:0 auto;padding:24px}.hdr{background:#17233C;color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}.logo{font-size:24px;font-weight:900}.logo span{color:#B8893B}.badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;margin-top:6px;margin-right:4px}.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.box{background:#fff;border:1px solid #E2E5E9;border-radius:8px;padding:10px 12px}.box-l{font-size:9px;color:#667085;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px}.box-v{font-size:13px;font-weight:600}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}thead{display:table-header-group}td{word-break:break-word;overflow-wrap:anywhere}.footer{margin-top:20px;text-align:center;font-size:10px;color:#667085;padding-top:12px;border-top:1px solid #E2E5E9}@media print{.np{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="page">
<div class="hdr"><div><img src="${logoSrc}" alt="PaintShip Logo" style="height:84px; width:auto; object-fit:contain;" /><div style="font-size:11px;opacity:.5;margin-top:2px">Professional Painting Quotation</div><div class="badge" style="background:#B8893B;color:#17233C">${projectType==="fresh"?"FRESH PAINTING":"RE-PAINTING"}</div><div class="badge" style="background:rgba(255,255,255,0.15);color:#fff">${withMat?"WITH MATERIAL":"MEASURE ONLY"}</div><div class="badge" style="background:rgba(255,255,255,0.1);color:#fff">${isCombinedPDF?"COMBINED ESTIMATE":isDoorWindowPDF?"DOOR &amp; WINDOW":isWallpaperPDF?"WALLPAPER":isTexturePDF?"TEXTURE":scope==="both"?"INTERIOR + EXTERIOR":scope==="exterior"?"EXTERIOR":"INTERIOR"}</div></div><div style="text-align:right;font-size:11px;opacity:.65"><div><b>Date:</b> ${date}</div><div style="margin-top:3px"><b>Ref:</b>PS-${project.id.slice(0,6).toUpperCase()}</div><div style="margin-top:3px"><b>Prepared By:</b> ${esc(preparedByName)}</div><div style="margin-top:3px"><b>Supervisor ID:</b> ${esc(preparedByIdLabel)}</div></div></div>
<h2 style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#17233C;border-left:3px solid #B8893B;padding-left:8px;margin:0 0 8px">Client Information</h2>
<div class="g2"><div class="box"><span class="box-l">Name</span><div class="box-v">${esc(customer.name)||"—"}</div></div><div class="box"><span class="box-l">Mobile</span><div class="box-v">${esc(customer.mobile)||"—"}</div></div><div class="box"><span class="box-l">Email</span><div class="box-v">${esc(customer.email)||"—"}</div></div><div class="box"><span class="box-l">PIN</span><div class="box-v">${esc(customer.pincode)||"—"}</div></div><div class="box"><span class="box-l">Location</span><div class="box-v">${esc(customer.location)||"—"}</div></div></div>
<div class="g2" style="margin-bottom:14px"><div class="box" style="grid-column:span 2"><span class="box-l">Address</span><div class="box-v">${esc(customer.address)||"—"}</div></div></div>
<div class="g2" style="margin-bottom:14px"><div class="box"><span class="box-l">Project Category</span><div class="box-v">${esc(catLabel)}</div></div><div class="box"><span class="box-l">Measurement Type</span><div class="box-v">${isCombinedPDF?"Combined Estimate":isDoorWindowPDF?"Door & Window":isWallpaperPDF?"Wallpaper":isTexturePDF?"Texture":scope==="both"?"Interior + Exterior":scope==="exterior"?"Exterior Only":"Interior Only"}</div></div></div>
${intSummary}${extSummary}${joinerySectionPDF}${wallpaperSectionPDF}${tx2SectionPDF}${grandBlock}
${project.notes?`<h2 style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#17233C;border-left:3px solid #B8893B;padding-left:8px;margin:20px 0 8px">Notes</h2><div class="box"><div class="box-v">${esc(project.notes)}</div></div>`:""}
<div class="footer">PaintShip Professional · ${new Date().toLocaleString()}</div>
<div class="np" style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#B8893B;color:#17233C;border:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>
</div></body></html>`;
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.target="_blank";a.rel="noopener noreferrer";
  document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},3000);
}

// ─── VENDOR PDF EXPORTS — Material Consumption + Purchase List ─────────
// Same open-a-print-ready-HTML-in-a-new-tab mechanism generatePDF() already
// uses (Blob → object URL → click a hidden <a target="_blank">, browser's
// own "Print / Save as PDF" does the rest — works identically on mobile and
// desktop). Data comes straight from the already-computed
// buildMaterialConsumptionSummary(project) — the exact same function that
// feeds the Material Consumption Summary / Purchase List cards on the
// Summary screen — nothing here recalculates anything.
function esc2(s){ return (s||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function openVendorPdf(title, bodyHtml) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${title}</title>
<style>
@page{margin:24px}
body{font-family:Arial,Helvetica,sans-serif;color:#17233C;margin:0;padding:24px}
h1{font-size:18px;margin:0 0 2px}
.sub{font-size:11px;color:#777;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-bottom:6px;page-break-inside:auto}
th{background:#17233C;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:7px 8px}
td{font-size:11.5px;padding:6px 8px;border-bottom:1px solid #E5E7EB;word-break:break-word;overflow-wrap:anywhere}
tr{page-break-inside:avoid}
thead{display:table-header-group}
.foot{margin-top:18px;font-size:10px;color:#999}
.np{margin-top:16px;text-align:center}
@media print{.np{display:none}}
</style></head><body>
${bodyHtml}
<div class="foot">PaintShip Professional · ${new Date().toLocaleString()}</div>
<div class="np"><button onclick="window.print()" style="background:#B8893B;color:#17233C;border:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>
</body></html>`;
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.target="_blank";a.rel="noopener noreferrer";
  document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},3000);
}
function generateMaterialConsumptionPDF(project) {
  const { rows } = buildMaterialConsumptionSummary(project);
  if (!rows.length) { alert("No material consumption data to export yet."); return; }
  const date = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
  const rowsHtml = rows.map(r=>`<tr><td>${esc2(r.category)}</td><td>${esc2(r.material)}</td><td>${esc2(r.brand||"-")}</td><td>${esc2(r.product||"-")}</td><td style="text-align:right">${r.area.toFixed(1)} sf</td><td style="text-align:right">${r.coverage?`${r.coverage} sf/L`:"-"}</td><td style="text-align:right;font-weight:700">${r.qty.toFixed(r.unit==="rolls"?0:2)} ${r.unit}</td></tr>`).join("");
  const bodyHtml = `<h1>Material Consumption Summary</h1>
<div class="sub">${esc2(project.customer?.name||"Client")} · ${date}</div>
<table><thead><tr><th>Category</th><th>Material</th><th>Brand</th><th>Product/Variant</th><th style="text-align:right">Area</th><th style="text-align:right">Coverage</th><th style="text-align:right">Est. Quantity</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>`;
  openVendorPdf(`Material Consumption — ${esc2(project.customer?.name||"Client")}`, bodyHtml);
}
function generatePurchaseListPDF(project, selectedHardwareItems) {
  const { rows } = buildMaterialConsumptionSummary(project);
  if (!rows.length) { alert("No purchase list data to export yet."); return; }
  const date = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
  
  // Build main purchase list rows (5 columns matching screen)
  const rowsHtml = rows.map(r=>{
    let packingDisplay = "-";
    let finalQtyDisplay = "-";
    try {
      const packing = computeOptimalPacking(r.qty || 0, r.unit || "L");
      packingDisplay = Array.isArray(packing) && packing.length > 0
        ? packing.map(p=>`${p.qty} x ${p.size}${r.unit || "L"}`).join(" + ")
        : "-";
      finalQtyDisplay = `${computeFinalOrderQty(r.qty || 0, r.unit || "L")} ${r.unit || "L"}`;
    } catch (err) {
      if (import.meta.env.DEV) console.warn("Material consumption calculation error:", err);
    }
    const brandProduct = (r.brand || r.product) ? `${r.brand || ""} ${r.product || ""}`.trim() : "-";
    return `<tr>
      <td>${esc2(r.material || "-")}</td>
      <td>${esc2(brandProduct)}</td>
      <td style="text-align:right">${r.qty ? Number(r.qty).toFixed(r.unit==="rolls"?0:2) : "0"} ${r.unit || "L"}</td>
      <td style="text-align:right;font-size:9.5px">${esc2(packingDisplay)}</td>
      <td style="text-align:right;font-weight:700">${esc2(finalQtyDisplay)}</td>
    </tr>`;
  }).join("");
  
  // Build Hardware & Consumables section — use selected items if provided, otherwise fallback to auto-compute
  let hardwareHtml = "";
  try {
    const hardwareItems = selectedHardwareItems && selectedHardwareItems.length > 0
      ? selectedHardwareItems
      : computeHardwareConsumables(project);
    if (hardwareItems && hardwareItems.length > 0) {
      const hardwareRows = hardwareItems.map(item=>{
        let packingDisplay = "-";
        let finalQtyDisplay = "-";
        try {
          const unit = item.unit || "pcs";
          const packing = computeOptimalPacking(item.qty || 0, unit);
          packingDisplay = Array.isArray(packing) && packing.length > 0
            ? packing.map(p=>`${p.qty} x ${p.size}${unit}`).join(" + ")
            : "-";
          finalQtyDisplay = `${computeFinalOrderQty(item.qty || 0, unit)} ${unit}`;
        } catch (err) {
          if (import.meta.env.DEV) console.warn("Hardware calculation error:", err);
        }
        const brandSpec = (item.brand || item.product) ? `${item.brand || ""} ${item.product || ""}`.trim() : "-";
        return `<tr>
          <td>${esc2(item.material || "-")}</td>
          <td>${esc2(brandSpec)}</td>
          <td style="text-align:right">${item.qty ? Number(item.qty).toFixed(2) : "0"} ${item.unit || ""}</td>
          <td style="text-align:right;font-size:9.5px">${esc2(packingDisplay)}</td>
          <td style="text-align:right;font-weight:700">${esc2(finalQtyDisplay)}</td>
        </tr>`;
      }).join("");
      
      hardwareHtml = `
        <h2 style="margin-top:30px;font-size:14px;color:#17233C">🔧 HARDWARE & CONSUMABLES PROCUREMENT</h2>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Brand & Specification</th>
              <th style="text-align:right">Exact Requirement</th>
              <th style="text-align:right">Recommended Packing</th>
              <th style="text-align:right">Final Order Qty</th>
            </tr>
          </thead>
          <tbody>${hardwareRows}</tbody>
        </table>`;
    }
} catch (err) {
     if (import.meta.env.DEV) console.error("Error generating hardware consumables PDF:", err);
   }
  
  const bodyHtml = `<h1>Purchase List</h1>
<div class="sub">${esc2(project.customer?.name||"Client")} · ${date} · Vendor-ready procurement list</div>
<table>
  <thead>
    <tr>
      <th>Material</th>
      <th>Brand & Product</th>
      <th style="text-align:right">Exact Requirement</th>
      <th style="text-align:right">Recommended Packing Units</th>
      <th style="text-align:right">Final Order Quantity</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
${hardwareHtml}`;
  openVendorPdf(`Purchase List — ${esc2(project.customer?.name||"Client")}`, bodyHtml);
}

// ─── MAIN APP ─────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [project, setProject] = useState(() => {
    try {
      const saved = localStorage.getItem("paintship_project_state");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse saved project state:", e);
      return null;
    }
  });
  const [projects,setProjects]=useState([]);
  const [nav,setNav]=useState("calc");
  const [af,setAf]=useState(0);
  const [ar,setAr]=useState(0);
  // Paint & Finish workspace state (PAINT-UI-001) — intentionally independent of
  // Measurement's af/ar so switching floors/rooms here never touches Measurement.
  const [paintTab,setPaintTab]=useState("interior");
  // PAINT-EXT-002C-UX-FIX — which single elevation's inline editor is expanded on the
  // simplified Exterior screen. UI-only, never persisted to project data. Declared
  // unconditionally here (not inside the paintTab==="exterior" IIFE) so hook order stays
  // identical across renders regardless of which tab is active.
  const [expandedExteriorElevationId,setExpandedExteriorElevationId]=useState(null);
  const [paintFloorIdx,setPaintFloorIdx]=useState(0);
  const [paintExpandedRoomId,setPaintExpandedRoomId]=useState(null);
  // PAINT-UX-003D-1B — Interior Brand grid search filter. UI-only, never persisted.
  const [paintBrandSearch,setPaintBrandSearch]=useState("");
  // PAINT-UX-003D-2 — which single Brand group (indian/intl/other) is expanded, and
  // whether the "More Finishes" disclosure is open. Both UI-only, never persisted.
  const [paintBrandGroupOpen,setPaintBrandGroupOpen]=useState("indian");
  const [paintMoreFinishesOpen,setPaintMoreFinishesOpen]=useState(false);
  // PAINT-UX-003D-4 (rebuild) — Package/Brand/Recommended Product/Finish/Labour are now
  // rows inside ONE "Selected Room Details" list (matching the mockup) instead of five
  // separate cards. Single shared state = which row's detail is open; opening one closes
  // any other, same as a normal accordion. Replaces the five separate booleans used
  // through 3A/4B. UI-only, never persisted, reset to null on room switch below.
  const [paintDetailsOpen,setPaintDetailsOpen]=useState(null); // "package"|"brand"|"product"|"finish"|"labour"|null
  const [isFinishesLocked,setIsFinishesLocked]=useState(true); // default: locked
  const [showPinModal,setShowPinModal]=useState(false);
  const [showMasterRates,setShowMasterRates]=useState(false);
  const [masterRatesVersion,setMasterRatesVersion]=useState(0); // bump to force rate refresh
  const [customPdfLogo, setCustomPdfLogo] = useState(() => localStorage.getItem("custom_pdf_logo") || null);
  // RUNTIME-FIX: project is null until login (useState(null) above, set only after
  // LoginScreen's onLogin fires). This derivation used to read project.floors directly,
  // which ran on every render — including the pre-login render — and crashed before the
  // `if(!user) return <LoginScreen/>` guard below ever had a chance to short-circuit.
  // Every step is now null-safe: no property is read off project/floor without a guard.
  const paintFloors=project?.floors||[];
  const safePaintFloorIdx=paintFloors.length? Math.min(paintFloorIdx,paintFloors.length-1) : 0;
  const paintFloor=paintFloors[safePaintFloorIdx]||null;
  const paintRooms=paintFloor?.rooms||[];
  const paintFloorRoomCount=paintRooms.length;
  const prevPaintRoomCount=useRef(paintFloorRoomCount);
  useEffect(()=>{
    if(!project) return; // nothing to derive from before login
    if(paintFloorRoomCount>prevPaintRoomCount.current && paintFloorRoomCount>0){
      setPaintExpandedRoomId(paintRooms[paintRooms.length-1].id); // new room auto-expands, first time only
    }
    prevPaintRoomCount.current=paintFloorRoomCount;
  },[paintFloorRoomCount,safePaintFloorIdx,project]);
  const [showQuote,setShowQuote]=useState(false);
  const [showInvoice,setShowInvoice]=useState(false);
  const [cloudSt,setCloudSt]=useState("idle");
  const [projSearch,setProjSearch]=useState("");
  const [wizStep,setWizStep]=useState(0);
  const [refreshKey,setRefreshKey]=useState(0);
  const forceRecalc = () => setRefreshKey(k => k + 1);
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result;
      if (base64) {
        localStorage.setItem("custom_pdf_logo", base64);
        setCustomPdfLogo(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(()=>{ if(user) {
    // CRITICAL: Purge any projects with NULL or broken schemas from localStorage if needed
    // In this implementation, we just ensure the loaded data is safe.
loadAllProjects().then(projects => {
      // Deep rehydrate each project: parse JSON Backup, map serialized fields
      // to internal format, synthesize walls from netWallSqft, and ensure all
      // nested arrays (floors, rooms, walls, exterior, BOQ, etc.) are fully present.
      const migrated = (projects || []).map(p => rehydrateProject(p, user)).filter(Boolean);
      setProjects(migrated.map(recalculateProjectTotals));
    }); } },[user]);
  useEffect(() => {
    if (project) {
      if (!project.id) {
        setProject(prev => ({ ...prev, id: `PROJ-${Date.now()}` }));
        return;
      }
      localStorage.setItem("paintship_project_state", JSON.stringify(project));
    }
  }, [project]);

  if(!user) return <LoginScreen onLogin={u=>{ setUser(u); if(!u.isAdmin) setProject(createNewProject(u)); }}/>;
  if(user.isAdmin) return <AdminScreen projects={projects} onLogout={()=>setUser(null)}/>;

  const floor=project.floors?.[af] || { rooms: [] };
  const room=floor.rooms?.[ar] || {};
  const scope=project.scope||"interior";
  const showInterior=scope==="interior"||scope==="both";
  const showExterior=scope==="exterior"||scope==="both";

  // ── PAINT-UX-003A Task 1 — single canonical wizard step list ──
  // Previously this was computed twice independently (once for the step-pills header,
  // once for the fixed bottom nav bar as STEPS2/vis2/isFirst2/isLast2), and the two copies
  // had diverged: the bottom bar's copy never excluded step id 5 ("Extras", intentionally
  // hidden per ARCH-002), so it allowed wizStep to advance one step further than the header
  // could address, and the content area silently fell back to step 0. Computed once here,
  // both the header and the bottom bar reference these same values — they cannot diverge again.
  const WIZ_STEPS = [
    { id:0, label:"Client",      icon:"👤", title:"Client Details",             subtitle:"Who are we quoting for?"                        },
    { id:1, label:"Job Details", icon:"🏷",  title:"Job Details",                subtitle:"Category, scope & quotation type"               },
    { id:3, label:"Measure",     icon:"📐", title:"Measurements",               subtitle:"Walls, ceiling, openings — room by room"         },
    { id:4, label:"Paint Finishes", icon:"🎨", title:"Paint Finishes",             subtitle:"Brand, package & finish per room"               },
    { id:5, label:"Extras",      icon:"🖼",  title:"Doors, Wallpaper & Texture", subtitle:"Optional surface items"                         },
    { id:6, label:"Summary",     icon:"✅", title:"Estimate Summary",            subtitle:"Review totals and add site notes"               },
  ];
  // Step 5 "Extras" (legacy dwItems/wpItems/textureItems) is hidden from normal navigation
  // per ARCH-002 — its code, fields, and calculations are untouched, it is simply
  // unreachable via the step pills so no new legacy data can be created.
  const wizVisibleSteps = WIZ_STEPS.filter(s => {
    if (s.id === 5) return false;
    if (s.id === 3) return showInterior;
    return true;
  });
  const wizIsFirst = wizStep === 0;
  const wizIsLast  = wizStep === wizVisibleSteps.length - 1;

  const t=projectTotals(project || {});
  const withMat=(project?.quoteMode||"with_material")==="with_material";
  const intMat=t.mat || 0, intLab=withMat ? (t.lab || 0) : (t.labEx || 0), intNet=t.net || 0;
  const intCalc=calcSectionTotal(intMat,intLab,project?.interiorCharges||defSectionCharges());
  const extNet=calcExteriorTotals(project?.exterior||[]);
  const ec=project?.exteriorConfig||defExteriorConfig();
  const extFin=ec.finishing||defExteriorFinishing(ec.package);
  const extMat=withMat?calcExteriorMaterialCost(extFin,extNet):0;
  const extLab=withMat?calcExteriorLabourCost(ec,extNet):calcExteriorLabourCostExcl(ec,extNet);
  const extCalc=calcSectionTotal(extMat,extLab,project?.exteriorCharges||defSectionCharges());
  const dwGrandTotal=calcDWTotals(project?.dwItems||[]).total || 0;
  const doorWindowCalc=calcDoorWindow(project?.doorWindowItems||[]) || { total: 0 };
  const wallpaperCalc=calcWallpaper(project?.wallpaperItems||[]) || { total: 0 };
  const textureCalc=calcTexture(project?.TX2_textureItems||[]);
  const wpGrandTotal=calcWPTotals(project?.wpItems||[]).total;
  const txGrandTotal=calcTextureTotals(project?.textureItems||[]).total;
  const polishCalc = calcPolish(project.polishItems||[]);
  const totals=getProjectServiceTotals(project);
  const grandTotal=totals.grandTotal;
  const grandArea=totals.grandArea;

  const up=fn=>setProject(p=>({...fn(p),updatedAt:new Date().toISOString()}));
  const upCust=(f,v)=>up(p=>({...p,customer:{...p.customer,[f]:v}}));
  const upRoom=r=>up(p=>({...p,floors:(p.floors||[]).map((fl,fi)=>fi===af?{...fl,rooms:fl.rooms.map((ro,ri)=>ri===ar?r:ro)}:fl)}));
  const addFloor=()=>{ const n=project.floors.length; if(n>=5)return; const idx=n; up(p=>({...p,floors:[...p.floors,newFloor(FLOOR_NAMES[n],p.defaultPkg,p.defaultBrand)]})); setTimeout(()=>{setAf(idx);setAr(0);},0); };
  const remFloor=fi=>{ if(project.floors.length===1)return; up(p=>({...p,floors:p.floors.filter((_,i)=>i!==fi)})); setAf(Math.max(0,fi-1)); setAr(0); };
  const addRoom=()=>{ const n=floor.rooms.length; up(p=>({...p,floors:(p.floors||[]).map((fl,fi)=>fi===af?{...fl,rooms:[...fl.rooms,newRoom("Bedroom",p.defaultPkg,p.defaultBrand)]}:fl)})); setAr(n); };
  const remRoom=ri=>{ if(floor.rooms.length===1)return; up(p=>({...p,floors:(p.floors||[]).map((fl,fi)=>fi===af?{...fl,rooms:fl.rooms.filter((_,i)=>i!==ri)}:fl)})); setAr(Math.max(0,ri-1)); };

  const handleNewProject = () => {
    const newId = uid();
    setProject({ ...createNewProject(user), id: newId });
    setAf(0);
    setAr(0);
    setNav("calc");
  };

  const doSave = async () => {
    // CRITICAL: Prevent execution if project data is missing
    if (!project || !project.id) {
      console.warn("Save aborted: No active project data.");
      return;
    }

    const customerName = ((project.customer && project.customer.name) || "").trim();
    const projectName = ((project.projectName || project.name || project.clientName || customerName || "").trim());

    if (!customerName || !projectName) {
      alert("Please enter both Customer Name and Project Name before saving.");
      setCloudSt("idle");
      return;
    }

    setCloudSt("saving");

    const freezeGuard = setTimeout(() => setCloudSt(cur => (cur === "saving") ? "idle" : cur), 12000);

    try {
      // 1. Calculations compute karke project object me attach karo.
      //    Guard every numeric field: totals can be undefined if
      //    getProjectServiceTotals() ever throws/returns partial data on a
      //    malformed project, and grandTotal/grandArea can individually be
      //    undefined/NaN. Number(...) + fallback keeps these always numeric
      //    so downstream PDF/UI code never chokes on undefined math.
      const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      const computedTotal = safeNum(totals?.grandTotal ?? project?.totalAmount);
      const computedArea  = safeNum(totals?.grandArea);

      const activeId = project?.id && project.id.includes('-') ? project.id : uid();

      // Build exterior sides from live project state so the persistence layer
      // receives the computed elevation array (not just the raw exterior data).
      const extConfig = project?.exteriorConfig || defExteriorConfig();
      const extSides = ELEVATIONS.map(name => {
        const elevation = (project?.exterior || []).find(el => el.name === name) || {
          name, sections: [], deductions: [], additions: [],
          condition: "Good", conditionIssues: [], conditionNotes: "",
          exteriorOverride: defExteriorOverride()
        };
        const cfg = resolveExteriorConfig(elevation, extConfig);
        const fin = cfg.finishing || {};
        let net = calcExteriorElevationNet(elevation) || 0;
        const extScopeActive = (project?.scope === "exterior" || project?.scope === "both") &&
          (project?.exterior || []).some(e => (e.sections || []).some(s => (s.w || 0) > 0));
        if (extScopeActive && net === 0) net = 400;
        return {
          sideName: name + " Elevation",
          netSqft: net,
          condition: elevation.condition || "Good",
          hasIssues: (elevation.conditionIssues && elevation.conditionIssues.length > 0) ||
            (elevation.condition && elevation.condition !== "Good") || false,
          isExterior: true,
          sections: elevation.sections || [],
          deductions: elevation.deductions || [],
          additions: elevation.additions || [],
          exteriorOverride: elevation.exteriorOverride || defExteriorOverride(),
          finishingSteps: [
            { key: "putty", service: "Putty" },
            { key: "primer", service: "Primer" },
            { key: "paint", service: "Paint" },
            { key: "protection", service: "Protection" },
            { key: "texture", service: "Texture" },
          ].filter(t => { const f = fin[t.key]; return f && f.on; })
            .map((t, idx) => {
              const f = fin[t.key];
              return { stepOrder: idx + 1, service: t.service, product: f?.customName || t.service, coats: f?.coats || 1, enabled: true };
            })
        };
      });

      // Build woodAndMetalItems from live doorWindowItems + polishItems so the
      // persistence layer receives the unified joinery array.
      const floorRoomMap = {};
      (project?.floors || []).forEach(fl => {
        floorRoomMap[fl.id] = fl.name;
        (fl.rooms || []).forEach(r => { floorRoomMap[r.id] = r.type; });
      });
      function joineryLocation(it) {
        const floorName = it.floorId ? (floorRoomMap[it.floorId] || "Ground Floor") : "Ground Floor";
        let roomName = "Living Room";
        if (it.roomId) {
          roomName = floorRoomMap[it.roomId] || roomName;
        } else if (it.location) {
          roomName = typeof it.location === 'object' ? (it.location.name || it.location.roomName || "Living Room") : it.location;
        }
        return { 
          floorName: String(floorName), 
          roomName: String(roomName) 
        };
      }
      const woodAndMetalItems = (project?.doorWindowItems || []).map(item => {
        const loc = joineryLocation(item);
        const w = Number(item.length) || 0;
        const h = Number(item.height) || 0;
        const q = Number(item.qty) || 1;
        return {
          itemId: item.id || `dw_${Date.now()}`,
          itemType: item.itemType || "Door",
          customLabel: item.customType || item.label || item.customLabel || "",
          location: loc,
          dimensions: { widthFt: w, heightFt: h, qty: q, totalSqft: w * h * q },
          finishType: item.finishType || "oil_paint",
          productName: item.productName || item.product || "Synthetic Enamel",
          coats: item.coats || 2
        };
      });
      (project?.polishItems || []).forEach(item => {
        const loc = joineryLocation(item);
        const w = Number(item.l) || 0;
        const h = Number(item.h) || 0;
        const q = Number(item.qty) || 1;
        woodAndMetalItems.push({
          itemId: item.id || `pol_${Date.now()}`,
          itemType: item.category || "Wood Polish",
          customLabel: item.label || "",
          location: loc,
          dimensions: { widthFt: w, heightFt: h, qty: q, totalSqft: w * h * q },
          finishType: item.finishId || "polish",
          productName: item.productName || item.product || "Polish",
          coats: item.coats || 2
        });
      });

      const payload = {
        ...project,
        id: activeId,
        clientName: project?.customer?.name || project?.clientName || "",
        clientMobile: project?.customer?.mobile || project?.clientMobile || "",
        location: project?.customer?.location || project?.location || "",
        category: project?.projectCategory || project?.category || "",
        projectType: project?.projectType || "",
        scope: project?.scope || "",
        floors: project?.floors || [],
        exterior: project?.exterior || [],
        exteriorSides: extSides,
        woodAndMetalItems: woodAndMetalItems,
        wallpaperItems: project?.wallpaperItems || [],
        textureItems: project?.TX2_textureItems || project?.textureItems || [],
        TX2_textureItems: project?.TX2_textureItems || [],
        specialFeatures: {
          wallpapers: project?.wallpaperItems || [],
          textures: project?.TX2_textureItems || project?.textureItems || []
        },
        warranties: project?.warranties || [],
        warranty: project?.warranty || { startDate:"", endDate:"", status:"" },
        grandTotal: computedTotal || project?.grandTotal || project?.totalAmount || 0,
        totalAmount: computedTotal || project?.totalAmount || 0,
        totalArea: computedArea || project?.totalArea || 0,
        updatedAt: new Date().toISOString()
      };

      // 2. Firebase + LocalStorage Persistence call
      const res = await saveProject(payload);
      if (import.meta.env.DEV) console.log("--> SAVE RESULT:", res);

      setProjects(prev => { const idx = prev.findIndex(p => String(p.id) === String(payload.id)); if (idx >= 0) { const copy = [...prev]; copy[idx] = payload; return copy; } return [payload, ...prev]; });

      if (res?.ok) {
        const updatedProject = recalculateProjectTotals(payload);
        setProject(updatedProject);
        const list = await loadAllProjects();
        setProjects(list);
      }

      setCloudSt(res?.ok ? "saved" : "error");
    } catch (err) {
      // Never let a thrown/rejected save leave the button stuck on ⏳.
      if (import.meta.env.DEV) console.error("doSave failed:", err);
      setCloudSt("error");
    } finally {
      clearTimeout(freezeGuard);
      setTimeout(() => setCloudSt("idle"), 2500);
    }
  };

  const dupProject = async (p, e) => {
    try {
      e?.stopPropagation?.();
      if (!p) return;
      const d = { 
        ...JSON.parse(JSON.stringify(p)), 
        id: `PROJ-${Date.now()}`, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString(), 
        customer: { ...(p.customer || {}), name: (p.customer?.name || "Customer") + " (Copy)" } 
      };
      const res = await saveProject(d);
      const saved = res?.project || d;
      setProjects(all => [saved, ...(all || [])]);
    } catch (err) {
      console.error("Duplicate project failed:", err);
    }
  };

  const delProject = async (id, e) => {
    try {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!id) return;
      if (!window.confirm("Delete this estimate permanently?")) return;
      setProjects(all => (all || []).filter(p => String(p.id) !== String(id)));
      await deleteProject(id);
    } catch (err) {
      console.error("Delete project failed:", err);
    }
  };

  const statusColor={ idle:C.navy, saving:C.gold, saved:C.green, error:C.red };
  const statusText={ idle:"☁ Save", saving:"⏳…", saved:"✓ Saved", error:"✗ Fail" };
  const FIN_ICONS={putty:"🪣",primer:"🧴",paint:"🎨",topcoat:"✨",oilPaint:"🛢",polish:"💅",texture:"🏔",wallpaper:"🖼"};

  return <div style={{maxWidth:560,margin:"0 auto",background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column"}}>
    {/* Header */}
    <Header onNewProject={handleNewProject} onLogout={()=>setUser(null)} onMasterRates={()=>setShowMasterRates(true)} />

    {/* Main scrollable content */}
    <div style={{flex:1,overflowY:"auto",paddingBottom:"calc(210px + env(safe-area-inset-bottom, 0px))"}}>
      {nav==="calc"&&(()=>{
        // ── WIZARD STEPS ─────────────────────────────────────────
        // Step 0: Customer Details
        // Step 1: Project Setup (category + type + scope)
        // Step 3: Measurements (walls, ceiling, openings)
        // Step 4: Specialty (D&W, Wallpaper, Texture)
        // Step 5: Brand & Finishing (quote mode + materials)
        // Step 6: Review & Notes

        // STEPS/visibleSteps/isFirst/isLast now come from the canonical
        // WIZ_STEPS/wizVisibleSteps/wizIsFirst/wizIsLast computed once at component scope
        // (PAINT-UX-003A Task 1) — the bottom nav bar below uses the exact same values.
        const visibleSteps = wizVisibleSteps;
        const isFirst = wizIsFirst;
        const isLast  = wizIsLast;
        const currentStepDef = visibleSteps[wizStep] || visibleSteps[0];
        const pct     = Math.round(((wizStep) / (visibleSteps.length - 1)) * 100);

        return <>
        {/* ── WIZARD HEADER ─────────────────────────────────── */}
        <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"14px 16px 0"}}>

          {/* Progress bar */}
          <div style={{height:3,background:C.border,borderRadius:2,marginBottom:14,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.orange},#F5B942)`,borderRadius:2,transition:"width 0.35s ease"}}/>
          </div>

          {/* Step pills — evenly distributed across full width, single continuous
              connector track (gray) with an orange progress overlay, both inset
              by half a circle-width so they run exactly between circle centers.
              First/last circle sit flush with the row's own edges (= content
              margins, since the row lives inside the header's 16px padding). */}
          <div style={{display:"flex",position:"relative",width:"100%",paddingBottom:0}}>
            <div style={{position:"absolute",top:14,left:14,right:14,height:2,background:C.border,zIndex:0}}/>
            <div style={{position:"absolute",top:14,left:14,height:2,zIndex:0,
              width:`calc((100% - 28px) * ${visibleSteps.length>1 ? wizStep/(visibleSteps.length-1) : 0})`,
              background:`linear-gradient(90deg,${C.orange},#F5B942)`,transition:"width 0.35s ease"}}/>
            {visibleSteps.map((s,idx)=>{
              const done    = idx < wizStep;
              const active  = idx === wizStep;
              const isFirstStep = idx===0;
              const isLastStep  = idx===visibleSteps.length-1;
              return (
                <button key={s.id} onClick={()=>setWizStep(idx)}
                  style={{flex:"1 1 0",minWidth:0,display:"flex",flexDirection:"column",
                    alignItems: isFirstStep?"flex-start":isLastStep?"flex-end":"center",
                    gap:3,padding:"0 4px 12px",background:"none",border:"none",cursor:"pointer",position:"relative",zIndex:1}}>
                  {/* Circle */}
                  <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",
                    justifyContent:"center",zIndex:1,fontSize:12,fontWeight:800,flexShrink:0,
                    background: done ? C.orange : active ? C.navy : C.white,
                    border: `2px solid ${done || active ? (done ? C.orange : C.navy) : C.border}`,
                    color: done || active ? "#fff" : C.gray,
                    transition:"all 0.2s"}}>
                    {done ? "✓" : s.icon}
                  </div>
                  {/* Label */}
                  <span style={{fontSize:9,fontWeight:active?800:600,
                    color: active ? C.navy : done ? C.orange : C.gray,
                    whiteSpace:"nowrap",letterSpacing:"0.04em",textTransform:"uppercase",
                    maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── STEP BODY ─────────────────────────────────────── */}
        <div style={{flex:1,padding:"0 0 20px"}}>

          {/* Step heading */}
          <div style={{padding:"20px 16px 14px",background:`linear-gradient(180deg,#F8FAFC 0%,transparent 100%)`}}>
            <div style={{fontSize:22,fontWeight:900,color:C.navy,lineHeight:1.2}}>{currentStepDef.title}</div>
            <div style={{fontSize:12.5,color:C.gray,marginTop:5,lineHeight:1.4}}>{currentStepDef.subtitle}</div>
          </div>

          <div style={{padding:"0 16px"}}>

          {/* ── STEP 0: CUSTOMER DETAILS ── */}
          {currentStepDef.id===0&&<>
            <div style={{...CARD,marginTop:0}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div style={{gridColumn:"span 2"}}><Inp label="Full Name" value={project?.customer?.name||""} onChange={v=>upCust("name",v)} placeholder="Client full name"/></div>
                <Inp label="Mobile" value={project?.customer?.mobile||""} onChange={v=>upCust("mobile", v.replace(/\D/g, '').slice(0, 10))} placeholder="+91..." type="tel" maxLength={10}/>
                <Inp label="Email ID" value={project?.customer?.email||""} onChange={v=>upCust("email",v)} placeholder="client@email.com" type="email"/>
              </div>
              <div style={{marginBottom:10}}><Inp label="PIN Code" value={project?.customer?.pincode||""} onChange={v=>upCust("pincode",v.replace(/[^0-9]/g,"").slice(0,6))} placeholder="560001" type="text" maxLength={6}/></div>
              <div style={{marginBottom:10}}><Inp label="Address" value={project?.customer?.address||""} onChange={v=>upCust("address",v)} placeholder="Site address" rows={2}/></div>
              <Inp label="Location / Landmark" value={project?.customer?.location||""} onChange={v=>upCust("location",v)} placeholder="City / area"/>
            </div>
          </>}

          {/* ── STEP 1: JOB DETAILS ── */}
          {currentStepDef.id===1&&<>
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>Project Category</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {PROJECT_CATEGORIES.map(cat=>{ const sel=project.projectCategory===cat.id; return (
                  <button key={cat.id} onClick={()=>up(p=>({...p,projectCategory:cat.id}))}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"11px 16px",minHeight:40,borderRadius:20,
                      fontSize:12,fontWeight:700,cursor:"pointer",
                      border:`1.5px solid ${sel?C.orange:C.border}`,
                      background:sel?C.orangeL:C.white,color:sel?C.orange:C.gray,
                      transition:"all 0.15s"}}>
                    <span style={{fontSize:15}}>{cat.icon}</span>{cat.label}
                  </button>
                ); })}
              </div>
            </div>
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>Project Type</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[["fresh","🎨","Fresh Painting","New / first coat"],["repaint","🔄","Re-Painting","Existing surface"]].map(([v,icon,label,desc])=>(
                  <button key={v} onClick={()=>up(p=>({...p,projectType:v}))}
                    style={{padding:"14px 12px",borderRadius:12,textAlign:"left",cursor:"pointer",
                      border:`2px solid ${project.projectType===v?C.orange:C.border}`,
                      background:project.projectType===v?C.orangeL:C.white,
                      display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}>
                    <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:800,color:project.projectType===v?C.orange:C.navy}}>{label}</div>
                      <div style={{fontSize:10,color:C.gray,marginTop:2}}>{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>Supervisor</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><span style={LBL}>Supervisor Name</span>
                  <input value={project.supervisorName||""} onChange={e=>up(p=>({...p,supervisorName:e.target.value}))}
                    placeholder="Supervisor name" style={INP}/></div>
                <div><span style={LBL}>Supervisor ID</span>
                  <input value={project.supervisorId||""} onChange={e=>up(p=>({...p,supervisorId:e.target.value}))}
                    placeholder="Supervisor ID" style={INP}/></div>
              </div>
            </div>
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>Work Scope</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {SCOPE_OPTIONS.map(s=>{ const sel=project.scope===s.id; return (
                  <button key={s.id} onClick={()=>up(p=>({...p,scope:s.id}))}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                      padding:"14px 8px",borderRadius:12,cursor:"pointer",
                      border:`2px solid ${sel?C.orange:C.border}`,
                      background:sel?C.orangeL:C.white,transition:"all 0.15s"}}>
                    <span style={{fontSize:26}}>{s.icon}</span>
                    <span style={{fontSize:12,fontWeight:800,color:sel?C.orange:C.gray}}>{s.label}</span>
                  </button>
                ); })}
              </div>
            </div>
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>Quotation Type</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["with_material","💎","With Material","Brands + full costs"],["measurement_only","📐","Measure Only","Labour & area only"]].map(([v,icon,label,desc])=>(
                  <button key={v} onClick={()=>up(p=>({...p,quoteMode:v}))}
                    style={{padding:"12px 10px",borderRadius:10,textAlign:"left",cursor:"pointer",
                      border:`2px solid ${project.quoteMode===v?C.navy:C.border}`,
                      background:project.quoteMode===v?C.navy:C.white,
                      display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}}>
                    <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:800,color:project.quoteMode===v?"#fff":C.navy}}>{label}</div>
                      <div style={{fontSize:10,color:project.quoteMode===v?"rgba(255,255,255,0.5)":C.gray,marginTop:1}}>{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>}

          {/* ── STEP 3: MEASUREMENTS ── */}
          {currentStepDef.id===3&&<>
            <MeasurementView
              project={project} up={up}
              floor={floor} room={room} af={af} ar={ar} setAf={setAf} setAr={setAr} upRoom={upRoom}
              withMat={withMat} inr={inr} calcRoom={calcRoom} calcNet={calcNet} addRoom={addRoom} addFloor={addFloor}
              showInterior={showInterior}
              doorWindowCalc={doorWindowCalc} polishCalc={polishCalc}
              MeasurementHeader={MeasurementHeader} RoomEditor={RoomEditor}
              ExteriorModule={ExteriorModule} JoineryModule={JoineryModule}
              WallpaperMeasurementTab={WallpaperMeasurementTab} TextureMeasurementTab={TextureMeasurementTab}
              defExterior={defExterior} defExteriorConfig={defExteriorConfig}
            />
          </>}

          {/* ── STEP 4: FINISH SELECTION ── */}
          {currentStepDef.id===4&&<>

            {/* Paint & Finish is its own workspace — independent of Measurement's active floor/room (af/ar).
                Switching tabs/floors/rooms here never clears data, recalculates totals, or touches Measurement. */}
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              {[{id:"interior",label:"Interior",icon:"🏠"},{id:"exterior",label:"Exterior",icon:"🏗"},{id:"joinery",label:"Wood, Metal & Joinery",icon:"🚪"}].map(t=>{
                const sel=paintTab===t.id;
                return <button key={t.id} onClick={()=>setPaintTab(t.id)}
                  style={{flex:"1 1 auto",padding:"12px 10px",borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",
                    border:`2px solid ${sel?C.navy:C.border}`,background:sel?C.navy:"#F8FAFC",color:sel?"#fff":C.gray,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:6,lineHeight:1.2}}>
                  <span style={{fontSize:14,flexShrink:0}}>{t.icon}</span>{t.label}
                </button>;
              })}
            </div>

            {paintTab==="interior"&&showInterior&&(()=>{
              // Reuse the null-safe derivations computed at the top of App() (RUNTIME-FIX)
              // instead of re-reading project.floors here. project is guaranteed non-null
              // this deep in the render (both `if(!user)` and `if(user.isAdmin)` already
              // returned above), but keep explicit empty states per spec anyway.
              if(!project) return <div style={{...CARD,textAlign:"center",color:C.gray}}>No project loaded.</div>;
              const pFloors=paintFloors;
              if(pFloors.length===0) return <div style={{...CARD,textAlign:"center",color:C.gray}}>No floors yet — add one from Measurement.</div>;
              const pFloor=paintFloor;
              const pRooms=paintRooms;
              const upPaintRoom=r=>up(p=>({...p,floors:(p.floors||[]).map((fl,fi)=>fi===safePaintFloorIdx?{...fl,rooms:(fl.rooms||[]).map(ro=>ro.id===r.id?r:ro)}:fl)}));

              return <>
                {/* Floor tabs — dynamic from project.floors, unlimited, independent of Measurement */}
                {pFloors.length>1&&<div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:12}}>
                  {pFloors.map((fl,fi)=>(
                    <button key={fl.id || fi} onClick={()=>setPaintFloorIdx(fi)}
                      style={{flexShrink:0,padding:"11px 16px",minHeight:40,borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
                        border:`2px solid ${fi===safePaintFloorIdx?C.navy:C.border}`,
                        background:fi===safePaintFloorIdx?C.navy:C.white,
                        color:fi===safePaintFloorIdx?"#fff":C.gray}}>
                      {fl.name}
                    </button>
                  ))}
                </div>}

                {/* PAINT-UX-003D-4B — Current Floor header, exact spec: 16px top / 18px
                    bottom spacing, 22px/700 navy heading, 2px rounded navy divider at
                    full content width (no pill, no fill). Still only reads pFloor.name;
                    no new floor-selection logic. Typography/spacing polish only. */}
                <div style={{paddingTop:18,paddingBottom:22}}>
                  <div style={{fontSize:9.5,fontWeight:800,color:C.orange,letterSpacing:"0.11em",textTransform:"uppercase",marginBottom:6}}>📍 Current Floor</div>
                  <div style={{fontSize:24,fontWeight:800,color:C.navy,letterSpacing:"0.01em",textTransform:"uppercase",lineHeight:1.15}}>{pFloor.name}</div>
                  <div style={{height:3,width:56,background:`linear-gradient(90deg,${C.navy},${C.orange})`,marginTop:12,borderRadius:3}}/>
                </div>

                {/* Rooms on this floor — header + Add Room, reusing the existing addRoom()
                    handler (same one Measurement uses). No new room-creation logic. */}
                <div style={{background:C.white,borderRadius:16,padding:"16px 16px 8px",marginBottom:18,
                  boxShadow:"0 1px 2px rgba(15,30,60,0.06), 0 4px 12px rgba(15,30,60,0.06)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                    <span style={{fontSize:13,fontWeight:800,color:C.navy}}>Rooms on this floor</span>
                    <button onClick={addRoom}
                      style={{display:"flex",alignItems:"center",gap:5,background:C.white,color:C.navy,
                        border:`1.5px solid ${C.navy}`,borderRadius:20,padding:"7px 14px",
                        fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      <span style={{fontSize:13,fontWeight:900,lineHeight:1}}>+</span> Add Room
                    </button>
                  </div>

                {pRooms.length===0&&<div style={{textAlign:"center",color:C.gray,padding:"20px 0"}}>No rooms on {pFloor.name} yet — add one from Measurement.</div>}

                {/* Compact room cards — single-open accordion, dynamic from pFloor.rooms.
                    Progress badge requires measurable area (rNet>0) AND a non-zero total
                    (rTotal>0) in addition to package/brand/finish, since those three are
                    always pre-filled by defaults at room creation and can't alone signal
                    "started". UI-only duplicate-type numbering (Bedroom 1/Bedroom 2) is
                    computed fresh every render from pRooms and never writes to
                    r.type/r.customType or stored room names. */}
                {(()=>{
                  const rTypeCounts={};
                  pRooms.forEach(rm=>{
                    const t=rm.type==="Custom"?(rm.customType||"Custom"):rm.type;
                    rTypeCounts[t]=(rTypeCounts[t]||0)+1;
                  });
                  const rTypeSeen={};
                  return pRooms.map((r,rIdx)=>{
                  const isOpen=paintExpandedRoomId===r.id;
                  const rNet=calcNet(r);
                  const rc0=calcRoom(r);
                  const rTotal=withMat?rc0.mat+rc0.lab:rc0.labEx;
                  const rFin=r.finishing||defFinishing(r.package);
                  const rHasArea=rNet>0;
                  const rHasPkg=!!r.package;
                  const rHasBrand=r.brand==="other"?!!(r.customBrand&&r.customBrand.trim()):!!r.brand;
                  const rHasFinish=!!(rFin.putty?.on&&rFin.primer?.on&&rFin.paint?.on);
                  const rHasTotal=rTotal>0;
                  const isComplete=rHasArea&&rHasPkg&&rHasBrand&&rHasFinish&&rHasTotal;
                  const isInProgress=!isComplete&&rHasArea;
                  const status=isComplete?{label:"Complete",icon:"✓",fg:"#fff",bg:C.green,border:"none"}
                    :isInProgress?{label:"In Progress",icon:"○",fg:C.orange,bg:C.white,border:`1.5px solid ${C.orange}`}
                    :{label:"Not Started",icon:"○",fg:C.gray,bg:C.white,border:`1.5px solid ${C.gray}`};
                  const rTypeName=r.type==="Custom"?(r.customType||"Custom"):r.type;
                  rTypeSeen[rTypeName]=(rTypeSeen[rTypeName]||0)+1;
                  const rDisplayName=rTypeCounts[rTypeName]>1?`${rTypeName} ${rTypeSeen[rTypeName]}`:rTypeName;
                  return <div key={r.id || rIdx} style={{background:C.white,
                      border:isOpen?`1.5px solid ${C.navy}`:`1px solid ${C.border}CC`,
                      borderLeft:`6px solid ${isOpen?C.navy:"transparent"}`,
                      borderRadius:16,marginBottom:16,overflow:"hidden",
                      boxShadow:isOpen?"0 8px 22px rgba(15,30,60,0.10)":"0 1px 3px rgba(15,30,60,0.04)",
                      opacity:isOpen?1:0.96,
                      transition:"all 0.15s"}}>
                    <button onClick={()=>{
                        const next=isOpen?null:r.id;
                        setPaintExpandedRoomId(next);
                        // Switching rooms resets UI-only Brand Selector state only (search
                        // text, which group is expanded) and closes whichever Selected Room
                        // Details row was open. room.brand/room.package/project are never
                        // touched here.
                        setPaintBrandSearch("");
                        setPaintBrandGroupOpen("indian");
                        setPaintDetailsOpen(null);
                      }}
                      style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
                        padding:"16px 18px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}}>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",lineHeight:1}}>
                          <span style={{fontSize:isOpen?15:13,fontWeight:isOpen?900:600,color:isOpen?C.navy:"#5B6B85",lineHeight:1}}>{rIdx+1}. {rDisplayName}</span>
                          {isOpen&&<span style={{fontSize:9.5,fontWeight:900,color:"#fff",background:C.orange,borderRadius:20,padding:"3px 9px",letterSpacing:"0.02em",whiteSpace:"nowrap",lineHeight:1.4,display:"inline-flex",alignItems:"center"}}>Editing</span>}
                          <span style={{fontSize:9.5,fontWeight:800,color:status.fg,background:status.bg,
                            border:status.border,borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap",lineHeight:1.4,display:"inline-flex",alignItems:"center"}}>{status.icon} {status.label}</span>
                        </div>
                        <div style={{fontSize:10.5,color:C.gray,marginTop:7,lineHeight:1}}>
                          Area: {rNet.toFixed(1)} sf • Est: ₹{rTotal.toFixed(0)}
                        </div>
                      </div>
                      <span style={{fontSize:13,color:"#aaa",flexShrink:0,display:"flex",alignItems:"center",height:"100%"}}>{isOpen?"▲":"▼"}</span>
                    </button>
                  </div>;
                });
                })()}
                </div>

                {/* PAINT-UX-003D-4J — Selected Room Details + Room Summary, moved OUT of
                    the per-room map. Previously this whole block lived inside each room's
                    isOpen-gated accordion, so it rendered nested between room cards in the
                    list rather than below the entire list, as the mockup shows. Same content,
                    same handlers/calculations, just relocated to a sibling position keyed off
                    paintExpandedRoomId instead of the per-room isOpen flag. */}
                    {(()=>{
                      // Shadow floor/room/upRoom so every existing internal control below is byte-for-byte
                      // unchanged, just bound to this independently-selected Paint & Finish room.
                      const floor=pFloor;
                      // PAINT-UX-003D-4J — Selected Room Details is now rendered ONCE,
                      // as a sibling section below the entire room list, instead of nested
                      // inside whichever room card happens to be expanded (that was the bug:
                      // it appeared between rooms in the list instead of below all of them).
                      // Which room it describes is still driven by the exact same state
                      // (paintExpandedRoomId) that controls which room card shows 'Editing'.
                      const room=pRooms.find(rm=>rm.id===paintExpandedRoomId);
                      if(!room) return null;
                      // PAINT-UX-003D-4A — Interior-Paint-only card style: soft shadow
                      // instead of a border, 16px radius, pure white. NOT applied to the
                      // shared CARD constant (used by Measurement/Exterior/Wallpaper/
                      // Texture) — those stay untouched per every prior ticket's scope fence.
                      const PCARD={background:C.white,borderRadius:16,padding:"16px 18px",marginBottom:18,border:"none",boxShadow:"0 1px 2px rgba(15,30,60,0.06), 0 4px 12px rgba(15,30,60,0.06)"};
                      const upRoom=upPaintRoom;
                      return <>

              {/* PAINT-UX-003D-4 (rebuild) — Package, Brand, Recommended Product, Finish
                  Sections, and Labour are now rows inside ONE "Selected Room Details" list
                  card, matching the mockup, instead of five separate cards (3A/4B). Only
                  one row's detail is open at a time via the shared paintDetailsOpen state.
                  Every picker's internal logic (pkgRow/choosePkg, brand search/groupSection/
                  brandCard, FinishingModule wiring, labour inputs/onChange) is unchanged —
                  only the outer row/header markup changed. */}
              {/* PAINT-UX-003D-4A — Interior-Paint-only card style: soft shadow instead of
                  a border, 16px radius, pure white. Deliberately NOT applied to the shared
                  CARD constant (used by Measurement/Exterior/Wallpaper/Texture) — those
                  stay untouched per every prior ticket's scope fence. */}
              {withMat&&<div style={PCARD}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:C.green,display:"inline-block"}}/>
                    <span style={{fontSize:13,fontWeight:800,color:C.navy}}>Selected Room Details</span>
                  </div>
                  <span style={{fontSize:10.5,fontWeight:700,color:C.green}}>You are editing this room</span>
                </div>

                {/* Row: Package */}
                {(()=>{
                  const pkgList=Object.values(PACKAGES);
                  const selectedPkg=pkgList.find(pkg=>room.package===pkg.id)||pkgList[0];
                  const choosePkg=pkg=>{
                    upRoom({...room,package:pkg.id,finishing:defFinishing(pkg.id),labourRate:pkg.labour,labourRateExcl:pkg.labourExcl});
                    // PAINT-UX-003D-3A Step 3 — auto-collapse back to compact mode after picking.
                    setPaintDetailsOpen(null);
                  };
                  const pkgRow=(pkg,sel)=>(
                    <button key={pkg.id} onClick={()=>choosePkg(pkg)}
                      style={{width:"100%",padding:"9px 12px",borderRadius:10,
                        border:sel?`2px solid ${pkg.color}`:`1.5px solid ${C.border}`,
                        background:sel?pkg.colorL:C.white,cursor:"pointer",
                        display:"flex",alignItems:"center",gap:10,textAlign:"left",
                        boxShadow:sel?`0 0 0 1px ${pkg.color}`:"none",transition:"all 0.15s"}}>
                      <span style={{fontSize:18}}>{pkg.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12.5,fontWeight:800,color:sel?pkg.color:C.navy}}>{pkg.label}</div>
                        <div style={{fontSize:9.5,color:C.gray,marginTop:1}}>
                          Paint ₹{pkg.paint}/sf · Putty ₹{pkg.putty}/sf · Primer ₹{pkg.primer}/sf
                        </div>
                      </div>
                      {sel&&<span style={{fontSize:15,fontWeight:900,color:pkg.color}}>✓</span>}
                    </button>
                  );
                  const isOpen=paintDetailsOpen==="package";
                  return <div style={{borderBottom:`1px solid ${C.border}CC`}}>
                    <button onClick={()=>setPaintDetailsOpen(isOpen?null:"package")}
                      style={{width:"100%",minHeight:52,display:"flex",alignItems:"center",justifyContent:"space-between",
                        gap:10,padding:"13px 4px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                      <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:700,color:C.navy}}>📦 Package</span>
                      <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.gray}}>{selectedPkg.label}</span>
                        <span style={{fontSize:12,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s",display:"inline-block"}}>▾</span>
                      </span>
                    </button>
                    {isOpen&&<div style={{paddingBottom:12}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,marginBottom:6}}>{pkgRow(selectedPkg,true)}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
                        {pkgList.filter(pkg=>pkg.id!==selectedPkg.id).map(pkg=>pkgRow(pkg,false))}
                      </div>
                    </div>}
                  </div>;
                })()}

                {/* Row: Brand */}
                {(()=>{
                  const INDIAN_BRAND_IDS=["asian","berger","nerolac","indigo","dulux","jsw","shalimar","birla","nippon","della"];
                  const INTL_BRAND_IDS=["jotun","benjamin","sherwin","farrow","akzo"];
                  const q=paintBrandSearch.trim().toLowerCase();
                  const matches=id=>!q||(BRAND_PRODUCTS[id]?.name||id).toLowerCase().includes(q);
                  const indianBrands=INDIAN_BRAND_IDS.filter(id=>BRAND_PRODUCTS[id]&&matches(id)).map(id=>({id,name:BRAND_PRODUCTS[id].name}));
                  const intlBrands=INTL_BRAND_IDS.filter(id=>BRAND_PRODUCTS[id]&&matches(id)).map(id=>({id,name:BRAND_PRODUCTS[id].name}));
                  const otherMatches=matches("other");
                  const selectedBrandName=room.brand?(room.brand==="other"?(room.customBrand||"Other"):(BRAND_PRODUCTS[room.brand]?.name||room.brand)):"No brand";

                  const brandCard=b=>{
                    const sel=room.brand===b.id;
                    return <button key={b.id} onClick={()=>{upRoom({...room,brand:b.id});setPaintDetailsOpen(null);}}
                      style={{padding:"8px 4px",borderRadius:10,border:`2px solid ${sel?C.navy:C.border}`,
                        background:sel?C.navy:C.white,cursor:"pointer",
                        display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                        minHeight:64,justifyContent:"center"}}>
                      <BrandLogo id={b.id} size={32}/>
                      <span style={{fontSize:8,fontWeight:700,color:sel?"#fff":"#555",textAlign:"center",lineHeight:1.2}}>{b.name}</span>
                      {sel&&<span style={{fontSize:9,color:C.gold,fontWeight:800}}>✓</span>}
                    </button>;
                  };

                  // Single-open accordion: clicking a heading opens that group and closes
                  // any other. Clicking the already-open group's heading collapses it.
                  const groupSection=(key,icon,label,count,cards,isLastGroup)=>{
                    if(count===0) return null;
                    const gOpen=paintBrandGroupOpen===key;
                    return <div key={key} style={{borderBottom:isLastGroup?"none":`1px solid ${C.border}`}}>
                      <button onClick={()=>setPaintBrandGroupOpen(gOpen?null:key)}
                        style={{width:"100%",minHeight:48,display:"flex",alignItems:"center",justifyContent:"space-between",
                          gap:10,padding:"14px 4px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                        <span style={{display:"flex",alignItems:"baseline",gap:8,minWidth:0}}>
                          <span style={{fontSize:14}}>{icon}</span>
                          <span style={{fontSize:14,fontWeight:800,color:C.navy}}>{label}</span>
                          <span style={{fontSize:11,fontWeight:500,color:C.gray}}>{count} {count===1?"Brand":"Brands"}</span>
                        </span>
                        <span style={{fontSize:19,color:C.navy,flexShrink:0,lineHeight:1,
                          display:"inline-block",transform:gOpen?"rotate(180deg)":"rotate(0deg)",
                          transition:"transform 0.25s ease"}}>▾</span>
                      </button>
                      {gOpen&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,paddingBottom:14}}>{cards}</div>}
                    </div>;
                  };

                  const isOpen=paintDetailsOpen==="brand";
                  const selectedGroupLabel2=!room.brand?null
                    :room.brand==="other"?"Other"
                    :INDIAN_BRAND_IDS.includes(room.brand)?"Indian Brands"
                    :INTL_BRAND_IDS.includes(room.brand)?"International Brands"
                    :null;
                  return <div style={{borderBottom:`1px solid ${C.border}CC`}}>
                    <button onClick={()=>setPaintDetailsOpen(isOpen?null:"brand")}
                      style={{width:"100%",minHeight:52,display:"flex",alignItems:"center",justifyContent:"space-between",
                        gap:10,padding:"13px 4px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                      <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:700,color:C.navy}}>🏷 Paint Brand</span>
                      <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <span style={{textAlign:"right"}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.gray}}>{selectedBrandName}</div>
                          {/* PAINT-UX-003D-4 (final) — item 4: consolidated the separate
                              "Brand Group" row (4F) into this one, since both were driven by
                              the same single room.brand field. Group now shown as a subtitle
                              instead of a second, redundant row. */}
                          {selectedGroupLabel2&&<div style={{fontSize:9,color:"#aaa",marginTop:1}}>{selectedGroupLabel2}</div>}
                        </span>
                        <span style={{fontSize:12,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s",display:"inline-block"}}>▾</span>
                      </span>
                    </button>
                    {isOpen&&<div style={{paddingBottom:12}}>
                      <div style={{position:"relative",marginBottom:8}}>
                        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#aaa",pointerEvents:"none"}}>🔍</span>
                        <input value={paintBrandSearch} onChange={e=>setPaintBrandSearch(e.target.value)}
                          placeholder="Search brands…"
                          style={{width:"100%",boxSizing:"border-box",fontSize:13,color:C.navy,border:`1.5px solid ${C.border}`,
                            borderRadius:10,padding:"10px 34px 10px 34px",background:"#FAFAFA",outline:"none",lineHeight:1.4}}/>
                        {paintBrandSearch&&<button onClick={()=>setPaintBrandSearch("")}
                          aria-label="Clear search"
                          style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                            width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
                            borderRadius:"50%",border:"none",background:"#E5E9F0",color:C.gray,
                            fontSize:13,fontWeight:700,cursor:"pointer",padding:0}}>×</button>}
                      </div>
                      {groupSection("indian","🇮🇳","Indian Brands",indianBrands.length,indianBrands.map(brandCard),false)}
                      {groupSection("intl","🌍","International Brands",intlBrands.length,intlBrands.map(brandCard),false)}
                      {groupSection("other","📦","Other",otherMatches?1:0,otherMatches?[brandCard({id:"other",name:"Other"})]:[],true)}
                      {indianBrands.length===0&&intlBrands.length===0&&!otherMatches&&
                        <div style={{fontSize:11,color:"#aaa",textAlign:"center",padding:"12px 0"}}>No brands match "{paintBrandSearch}"</div>}
                    </div>}
                  </div>;
                })()}

                {/* Row: Recommended Product */}
                {room.brand&&(()=>{
                  const pkgDef=PACKAGES[room.package]||PACKAGES.premium;
                  const brandName=room.brand==="other"?"Other":(BRAND_PRODUCTS[room.brand]?.name||room.brand);
                  const productName=getProductName(room.brand,room.package);
                  const isOpen=paintDetailsOpen==="product";
                  return <div style={{borderBottom:`1px solid ${C.border}CC`}}>
                    <button onClick={()=>setPaintDetailsOpen(isOpen?null:"product")}
                      style={{width:"100%",minHeight:52,display:"flex",alignItems:"center",justifyContent:"space-between",
                        gap:10,padding:"13px 4px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                      <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:700,color:C.navy}}>✨ Recommended Product</span>
                      <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,minWidth:0}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.gray,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{productName||"—"}</span>
                        <span style={{fontSize:12,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s",display:"inline-block"}}>▾</span>
                      </span>
                    </button>
                    {isOpen&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingBottom:12}}>
                      <div><span style={LBL}>BRAND</span><div style={{fontSize:12,fontWeight:700,color:C.navy}}>{brandName}</div></div>
                      <div><span style={LBL}>PACKAGE</span><div style={{fontSize:12,fontWeight:700,color:C.navy}}>{pkgDef.icon} {pkgDef.label}</div></div>
                    </div>}
                  </div>;
                })()}

                {/* Row: Finish Sections */}
                {(()=>{
                  const fin=room.finishing||defFinishing(room.package);
                  const selectedCount=Object.values(fin).filter(f=>f&&f.on).length;
                  const isOpen=paintDetailsOpen==="finish";
                  return <div style={{borderBottom:`1px solid ${C.border}CC`}}>
                    <button onClick={()=>setPaintDetailsOpen(isOpen?null:"finish")}
                      style={{width:"100%",minHeight:52,display:"flex",alignItems:"center",justifyContent:"space-between",
                        gap:10,padding:"13px 4px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                      <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:700,color:C.navy}}>🎨 Finish Sections</span>
                      <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.gray}}>{selectedCount} Sections</span>
                        <span style={{fontSize:12,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s",display:"inline-block"}}>▾</span>
                      </span>
                    </button>
                    {isOpen&&<div style={{paddingBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{fontSize:10.5,color:C.gray}}>Net area: <b style={{color:C.orange}}>{calcNet(room).toFixed(2)} sf</b></div>
                        <button onClick={()=>{ if(isFinishesLocked) setShowPinModal(true); else setIsFinishesLocked(true); setShowMasterRates(true); }}
                          style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:20,
                            fontSize:11,fontWeight:700,cursor:"pointer",
                            border:`1.5px solid ${isFinishesLocked?C.orange:C.border}`,
                            background:isFinishesLocked?C.orangeL:C.white,
                            color:isFinishesLocked?C.orange:C.gray,transition:"all 0.15s"}}>
                          <span style={{fontSize:13}}>{isFinishesLocked?"🔒":"🔓"}</span>
                          {isFinishesLocked?"Locked":"Unlocked"}
                        </button>
                      </div>
                      <FinishingModule
                        finishing={fin}
                        onChange={f2=>upRoom({...room,finishing:f2})}
                        net={calcNet(room)}
                        visibleKeys={["putty","primer","paint"]}
                        showNetLabel={false}
                        hideRates={true}
                      />
                      <button onClick={()=>setPaintMoreFinishesOpen(v=>!v)}
                        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                          padding:"9px 2px",background:"none",border:"none",cursor:"pointer",marginTop:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:C.gray}}>More Finishes (Topcoat, Enamel/Trim, Polish, Texture, Wallpaper)</span>
                        <span style={{fontSize:11,color:"#bbb",transform:paintMoreFinishesOpen?"rotate(180deg)":"",transition:"transform .2s"}}>▾</span>
                      </button>
                      {paintMoreFinishesOpen&&<FinishingModule
                        finishing={fin}
                        onChange={f2=>upRoom({...room,finishing:f2})}
                        net={calcNet(room)}
                        visibleKeys={["topcoat","oilPaint","polish","texture","wallpaper"]}
                        showNetLabel={false}
                        locked={isFinishesLocked}
                        hideRates={true}
                      />}
                    </div>}
                  </div>;
                })()}

                {/* Row: Labour */}
                {(()=>{
                  const isOpen=paintDetailsOpen==="labour";
                  return <div>
                    <button onClick={()=>setPaintDetailsOpen(isOpen?null:"labour")}
                      style={{width:"100%",minHeight:52,display:"flex",alignItems:"center",justifyContent:"space-between",
                        gap:10,padding:"13px 4px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
                      <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:700,color:C.navy}}>💰 Labour</span>
                      <span style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.gray}}>{withMat?"With Material":"Without Material"}</span>
                        <span style={{fontSize:12,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s",display:"inline-block"}}>▾</span>
                      </span>
                    </button>
                    {isOpen&&<div style={{paddingBottom:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                        {[["sqft","📐","Rate/sf"],["daily","👷","Daily Rate"]].map(([v,icon,label])=>(
                          <button key={v} disabled={isFinishesLocked} onClick={()=>{if(!isFinishesLocked)upRoom({...room,labourMethod:v})}}
                            style={{padding:"10px 8px",borderRadius:10,fontSize:12,fontWeight:700,cursor:isFinishesLocked?"not-allowed":"pointer",opacity:isFinishesLocked?0.6:1,
                              border:`2px solid ${room.labourMethod===v?C.orange:C.border}`,
                              background:room.labourMethod===v?C.orangeL:C.white,
                              color:room.labourMethod===v?C.orange:C.gray,
                              display:"flex",alignItems:"center",gap:6}}>
                            <span>{icon}</span>{label}
                          </button>
                        ))}
                      </div>
                      {room.labourMethod==="sqft"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                        <div><span style={LBL}>WITH MATERIALS (₹/sf)</span><NumInp small prefix="₹" value={room.labourRate||0} onChange={v=>upRoom({...room,labourRate:v})} disabled={isFinishesLocked}/></div>
                        <div><span style={LBL}>LABOUR ONLY (₹/sf)</span><NumInp small prefix="₹" value={room.labourRateExcl||0} onChange={v=>upRoom({...room,labourRateExcl:v})} disabled={isFinishesLocked}/></div>
                      </div>}
                      {room.labourMethod==="daily"&&<>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                          <div><span style={LBL}>DAILY RATE (₹)</span><NumInp small prefix="₹" value={room.dailyRate||0} onChange={v=>upRoom({...room,dailyRate:v})} disabled={isFinishesLocked}/></div>
                          <div><span style={LBL}>WORKERS</span>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                              <button disabled={isFinishesLocked} onClick={()=>{if(!isFinishesLocked)upRoom({...room,workers:Math.max(1,(room.workers||1)-1)})}} style={{width:34,height:38,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:isFinishesLocked?"not-allowed":"pointer",opacity:isFinishesLocked?0.6:1,fontSize:18,fontWeight:700,color:C.red}}>−</button>
                              <span style={{fontSize:16,fontWeight:800,minWidth:24,textAlign:"center",color:C.navy}}>{room.workers||1}</span>
                              <button disabled={isFinishesLocked} onClick={()=>{if(!isFinishesLocked)upRoom({...room,workers:(room.workers||1)+1})}} style={{width:34,height:38,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:isFinishesLocked?"not-allowed":"pointer",opacity:isFinishesLocked?0.6:1,fontSize:18,fontWeight:700,color:C.green}}>+</button>
                            </div>
                          </div>
                          <div><span style={LBL}>DAYS</span>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                              <button disabled={isFinishesLocked} onClick={()=>{if(!isFinishesLocked)upRoom({...room,days:Math.max(1,(room.days||1)-1)})}} style={{width:34,height:38,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:isFinishesLocked?"not-allowed":"pointer",opacity:isFinishesLocked?0.6:1,fontSize:18,fontWeight:700,color:C.red}}>−</button>
                              <span style={{fontSize:16,fontWeight:800,minWidth:24,textAlign:"center",color:C.navy}}>{room.days||1}</span>
                              <button disabled={isFinishesLocked} onClick={()=>{if(!isFinishesLocked)upRoom({...room,days:(room.days||1)+1})}} style={{width:34,height:38,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,cursor:isFinishesLocked?"not-allowed":"pointer",opacity:isFinishesLocked?0.6:1,fontSize:18,fontWeight:700,color:C.green}}>+</button>
                            </div>
                          </div>
                        </div>
                        <div style={{background:C.blueL,borderRadius:10,padding:"8px 12px",fontSize:12,color:C.blue,fontWeight:600}}>
                          ₹{room.dailyRate||0} × {room.workers||1} worker(s) × {room.days||1} day(s) = <b>₹{((room.dailyRate||0)*(room.workers||1)*(room.days||1)).toFixed(0)}</b>
                        </div>
                      </>}
                    </div>}
                  </div>;
                })()}
              </div>}

              {/* ── Room cost summary — PAINT-UX-003D-4 (rebuild): restyled to 3 equal
                   columns (Room Area / Room Estimate / Finish Sections) matching the
                   mockup. Same already-computed totals as the room-list row (rc.mat+rc.lab
                   or rc.labEx depending on withMat) and the Finish row's selectedCount —
                   no new calculation. */}
              {(()=>{
                const rc=calcRoom(room);
                const net=calcNet(room);
                const estTotal=withMat?rc.mat+rc.lab:rc.labEx;
                const fin2=room.finishing||defFinishing(room.package);
                const finCount=Object.values(fin2).filter(f=>f&&f.on).length;
                return <div style={{background:C.white,borderRadius:16,padding:"18px 20px",marginBottom:18,border:"none",boxShadow:"0 1px 2px rgba(15,30,60,0.06), 0 4px 12px rgba(15,30,60,0.06)"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[["ROOM AREA",`${net.toFixed(1)} sf`,C.orange],
                      ["ROOM ESTIMATE",`₹${estTotal.toFixed(0)}`,C.navy],
                      ["FINISH SECTIONS",`${finCount}`,C.navy]].map(([l,v,col],i)=>(
                      <div key={l} style={{textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                        borderLeft:i>0?`1px solid ${C.border}CC`:"none"}}>
                        <div style={{fontSize:8.5,color:C.gray,fontWeight:700,letterSpacing:"0.05em"}}>{l}</div>
                        <div style={{fontSize:17,fontWeight:800,color:col,marginTop:5}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>;
              })()}
                      </>;
                    })()}

                {/* Default brand/package for new rooms — hidden (UI only).
                    project.defaultPkg/defaultBrand and addRoom()'s use of them
                    are untouched; only this settings card no longer renders. */}
              </>;
            })()}

            {/* ── Exterior tab — PAINT-EXT-001 workspace ── */}
            {paintTab==="exterior"&&(()=>{
              // All values below are read from existing project.exteriorConfig / project.exterior
              // via the existing calcExteriorMaterialCost / calcExteriorLabourCost(Excl) /
              // calcExteriorTotals functions — no new calculation logic is introduced here.
              const ec=project.exteriorConfig||defExteriorConfig();
              const extElevations=project.exterior||defExterior();
              const extNet=calcExteriorTotals(extElevations);
              const finishing=ec.finishing||defExteriorFinishing(ec.package);
              const pkg=PACKAGES[ec.package]||PACKAGES.premium;
              const brandName=ec.brand==="other"?(ec.customBrand||"Other"):BRAND_PRODUCTS[ec.brand]?.name||"—";
              const productName=getProductName(ec.brand,ec.package,"exterior");
              const matCost=withMat?calcExteriorMaterialCost(finishing,extNet):0;
              const labCost=withMat?calcExteriorLabourCost(ec,extNet):calcExteriorLabourCostExcl(ec,extNet);
              const labRateLabel=(ec.labourMethod||"sqft")==="daily"
                ? `₹${ec.dailyRate||0}/day × ${ec.workers||1} worker(s) × ${ec.days||1} day(s)`
                : `₹${(withMat?ec.labourRate:ec.labourRateExcl)||0}/sf`;

              // PAINT-EXT-002C-UX-FIX — sub-tabs, Use Global toggle, Active Configuration
              // card, separate cost-preview card, Copy Global button and Reset Override
              // button are all removed from the UI per this ticket. (extSubTab/setExtSubTab,
              // the state that drove the removed sub-tabs, was itself removed in PAINT-EXT-003F
              // once confirmed to have zero remaining reads/writes.)
              const configuredTotals = calcExteriorConfiguredTotals(extElevations, ec, project.quoteMode, project.projectType || "fresh");

              return <>
                {!showExterior&&<div style={{...CARD,textAlign:"center",color:C.gray,padding:"32px 16px"}}>
                  <div style={{fontSize:24,marginBottom:8}}>🏗</div>
                  <div style={{fontSize:13,fontWeight:700}}>Exterior scope not enabled</div>
                  <div style={{fontSize:11,marginTop:4}}>Go to Job Details and set scope to Exterior or Both.</div>
                </div>}

                {showExterior&&!withMat&&<div style={{...CARD,textAlign:"center",color:C.gray,padding:"32px 16px"}}>
                  <div style={{fontSize:13,fontWeight:700}}>Material configuration hidden</div>
                  <div style={{fontSize:11,marginTop:4}}>Current quote mode is Labour Only — material selection isn't applicable.</div>
                </div>}

                {showExterior&&withMat&&<>
                  {/* Part 2 — Default Exterior Paint wrapper removed (PAINT-EXT-FINAL-POLISH).
                      ExteriorMaterialPanel already opens with its own "Premium Package" card,
                      so no header/label/spacing is needed here — same component, same props,
                      no gap left behind. */}
                  <ExteriorMaterialPanel
                    config={ec}
                    onChange={v=>up(p=>({...p,exteriorConfig:v}))}
                    quoteMode={project.quoteMode}
                    extNet={extNet}
                    paintingType={project.projectType || "fresh"}
                  />

                  {/* Part 3 — Elevation cards, built dynamically from project.exterior */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,marginTop:8}}>
                    <span style={{fontSize:13,fontWeight:800,color:C.navy,letterSpacing:"0.01em"}}>Exterior Areas</span>
                  </div>
                  {extElevations.map(el=>{
                    // Legacy safety — old elevations may have no exteriorOverride at all.
                    const ov=el.exteriorOverride||defExteriorOverride();
                    const usingDefault=ov.useGlobal!==false;
                    const isExpanded=expandedExteriorElevationId===el.id;
                    const resolvedEl=resolveExteriorConfig(el,ec); // existing helper, not recreated
                    const elPkg=PACKAGES[resolvedEl.package]||PACKAGES.premium;
                    const elBrandName=resolvedEl.brand==="other"?(resolvedEl.customBrand||"Other"):BRAND_PRODUCTS[resolvedEl.brand]?.name||"—";
                    const elProductName=getProductName(resolvedEl.brand,resolvedEl.package,"exterior");
                    const elBreakdown=configuredTotals.elevations.find(e=>e.id===el.id)||{area:0,material:0,labour:0,total:0};
                    const elIcon=/boundary|compound|gate/i.test(el.name)?"🧱":/side/i.test(el.name)?"🏘":/rear|back/i.test(el.name)?"🏚":"🏠";

                    // Part 4 — Customize: turn override on, seed config:{} only if it was null, expand editor.
                    const doCustomize=()=>{
                      up(p=>({...p,exterior:(p.exterior||[]).map(x=>{
                        if(x.id!==el.id) return x;
                        const existingOv=x.exteriorOverride||defExteriorOverride();
                        return {...x,exteriorOverride:{...existingOv,useGlobal:false,config:existingOv.config||{}}};
                      })}));
                      setExpandedExteriorElevationId(el.id);
                    };
                    // Part 4 — Use Default: immediate, no confirm, clears stored override values.
                    const doUseDefault=()=>{
                      up(p=>({...p,exterior:(p.exterior||[]).map(x=>x.id===el.id?{...x,exteriorOverride:{useGlobal:true,config:null}}:x)}));
                      if(isExpanded) setExpandedExteriorElevationId(null);
                    };
                    const toggleEdit=()=>setExpandedExteriorElevationId(isExpanded?null:el.id);
                    // Part 5 — editor always hands back a full resolved config; diff against
                    // global via the existing buildExteriorOverridePatch and store only the
                    // sparse patch, touching only this elevation.
                    const handleEdit=(editedResolvedConfig)=>{
                      const patch=buildExteriorOverridePatch(editedResolvedConfig,ec);
                      up(p=>({...p,exterior:(p.exterior||[]).map(x=>{
                        if(x.id!==el.id) return x;
                        const existingOv=x.exteriorOverride||defExteriorOverride();
                        return {...x,exteriorOverride:{...existingOv,useGlobal:false,config:patch}};
                      })}));
                    };

                    return <div key={el.id} style={{
                        background:C.white,borderRadius:16,marginBottom:16,overflow:"hidden",
                        border:`1px solid ${isExpanded?C.navy:C.border}`,
                        boxShadow:"0 1px 2px rgba(15,30,60,0.05), 0 6px 16px rgba(15,30,60,0.06)",
                      }}>

                      {/* Collapsed header row — always visible summary */}
                      <button onClick={toggleEdit} style={{
                          width:"100%",padding:"18px 20px",border:"none",background:"transparent",cursor:"pointer",
                          display:"flex",alignItems:"center",gap:16,textAlign:"left",
                        }}>
                        <div style={{width:40,height:40,borderRadius:12,background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{elIcon}</div>
                        <div style={{flex:"1 1 auto",minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:800,color:C.navy,letterSpacing:"0.01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{el.name}</div>
                          <div style={{fontSize:10.5,color:C.gray,marginTop:3,fontWeight:600}}>Rough Area {calcExteriorElevationNet(el).toFixed(1)} sf</div>
                        </div>
                        <div style={{display:"flex",gap:28,flexShrink:0}}>
                          <div style={{textAlign:"right",minWidth:56}}><div style={{fontSize:9,color:C.gray,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:3}}>Paint Cost</div><div style={{fontSize:12.5,fontWeight:700,color:C.navy}}>₹{(elBreakdown.material||0).toFixed(0)}</div></div>
                          <div style={{textAlign:"right",minWidth:56}}><div style={{fontSize:9,color:C.gray,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:3}}>Total</div><div style={{fontSize:13.5,fontWeight:800,color:C.orange}}>₹{(elBreakdown.total||0).toFixed(0)}</div></div>
                        </div>
                        <div style={{width:20,display:"flex",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:12,color:C.gray,transform:isExpanded?"rotate(180deg)":"none",transition:"transform 0.15s"}}>▾</span>
                        </div>
                      </button>


                      {/* Expanded body — package/brand info, status badge, actions, inline editor */}
                      {isExpanded&&<div style={{padding:"0 18px 18px",borderTop:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"flex-end",marginTop:14,marginBottom:14}}>
                          <span style={{fontSize:9,fontWeight:700,padding:"3px 10px",borderRadius:20,
                            background:usingDefault?"#EEF2F6":C.orangeL,
                            color:usingDefault?C.gray:C.orange}}>
                            {usingDefault?"Using Default Paint":"Customized"}
                          </span>
                        </div>

                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                          <div><span style={LBL}>Package</span><div style={{fontSize:12.5,fontWeight:700,color:C.navy}}>{elPkg.icon} {elPkg.label}</div></div>
                          <div><span style={LBL}>Brand / Product</span><div style={{fontSize:12.5,fontWeight:700,color:C.navy}}>{elBrandName}{elProductName?` · ${elProductName}`:""}</div></div>
                          <div><span style={LBL}>Area</span><div style={{fontSize:12.5,fontWeight:700,color:C.navy}}>{(elBreakdown.area||0).toFixed(1)} sf</div></div>
                          <div><span style={LBL}>Labour</span><div style={{fontSize:12.5,fontWeight:700,color:C.navy}}>₹{(elBreakdown.labour||0).toFixed(0)}</div></div>
                        </div>

                        <div style={{display:"flex",gap:10}}>
                          {usingDefault
                            ? <button onClick={doCustomize} style={{flex:1,padding:"12px 12px",minHeight:44,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${C.border}`,background:C.white,color:C.navy}}>Customize</button>
                            : <>
                                <button onClick={toggleEdit} style={{flex:1,padding:"12px 12px",minHeight:44,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${C.navy}`,background:C.navy,color:"#fff"}}>Close</button>
                                <button onClick={doUseDefault} style={{flex:1,padding:"12px 12px",minHeight:44,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${C.border}`,background:C.white,color:C.gray}}>Use Default</button>
                              </>
                          }
                        </div>

                        {/* Part 5 — inline editor, only one elevation's editor open at a time */}
                        {!usingDefault&&<div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
                          <ExteriorMaterialPanel
                            config={resolvedEl}
                            onChange={handleEdit}
                            quoteMode={project.quoteMode}
                            extNet={elBreakdown.area}
                            paintingType={project.projectType || "fresh"}
                          />
                          {/* Per-elevation Labour — same config/onChange (resolvedEl/handleEdit)
                              as this elevation's own material panel above. Kept adjacent to
                              this elevation's editor rather than moved to the page-level
                              position, since "after the global Total" has no coherent meaning
                              for a per-elevation override control. */}
                          <ExteriorLabourPanel config={resolvedEl} onChange={handleEdit}/>
                        </div>}
                      </div>}
                    </div>;
                  })}

                  {/* Part 7 — Exterior & Finishing Total (existing values, no new formulas) */}
                  {(()=>{
                    const textureTypes=getExtFinMeta().texture?.types||[];
                    const finishTypeLabel=textureTypes.find(t=>t.id===finishing.texture?.type)?.label||"—";
                    const paintCoats=finishing.paint?.coats||1;
                    return <div style={{background:C.white,borderRadius:16,padding:"28px 26px",border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,30,60,0.05), 0 6px 16px rgba(15,30,60,0.06)"}}>
                      <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:28,letterSpacing:"0.02em"}}>Exterior &amp; Finishing Total</div>

                      <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",gap:36}}>
                        {/* LEFT — Exterior Configuration */}
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:C.gray,marginBottom:18,textTransform:"uppercase",letterSpacing:"0.07em"}}>Exterior Configuration</div>
                          <div style={{display:"flex",flexDirection:"column",gap:18}}>
                            <div><span style={LBL}>Paint Coats</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>{paintCoats} Coat{paintCoats>1?"s":""}</div></div>
                            <div><span style={LBL}>Finish Type</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>{finishTypeLabel}</div></div>
                            <div><span style={LBL}>Package</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>{pkg.icon} {pkg.label}</div></div>
                            <div><span style={LBL}>Brand</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>{brandName}</div></div>
                          </div>
                        </div>

                        <div style={{background:C.border}}/>

                        {/* RIGHT — Commercial Summary */}
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:C.gray,marginBottom:18,textTransform:"uppercase",letterSpacing:"0.07em"}}>Commercial Summary</div>
                          <div style={{display:"flex",flexDirection:"column",gap:18,marginBottom:24}}>
                            <div><span style={LBL}>Recommended Product</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>{productName||"—"}</div></div>
                            <div><span style={LBL}>Estimated Material Cost</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>₹{configuredTotals.material.toFixed(0)}</div></div>
                            <div><span style={LBL}>Estimated Labour Cost</span><div style={{fontSize:13.5,fontWeight:700,color:C.navy}}>₹{configuredTotals.labour.toFixed(0)}</div></div>
                          </div>
                          <div style={{paddingTop:20,borderTop:`1px solid ${C.border}`}}>
                            <span style={LBL}>Grand Exterior Estimate</span>
                            <div style={{fontSize:32,fontWeight:900,color:C.orange,marginTop:6,letterSpacing:"-0.01em"}}>₹{configuredTotals.total.toFixed(0)}</div>
                          </div>
                        </div>
                      </div>
                    </div>;
                  })()}

                  {/* Global Labour — standalone section, placed after Exterior & Finishing
                      Total and before the footer, per PAINT-EXT-LABOUR-EXTRACT. Same config/
                      onChange as the global default panel above — same handler, same state. */}
                  <ExteriorLabourPanel config={ec} onChange={v=>up(p=>({...p,exteriorConfig:v}))}/>
                </>}
              </>;
            })()}

            {/* ── Wood, Metal & Joinery tab — real summary, reusing existing Joinery data ── */}
            {paintTab==="joinery"&&<div style={CARD}>
              {(()=>{
                const dwItems = project.doorWindowItems||[];
                const polItems = project.polishItems||[];
                const rows = [
                  ...dwItems.map(it=>{
                    const c = calcDoorWindowItem(it);
                    const finT = DW2_FINISH_TYPES.find(f=>f.id===it.finishType);
                    return { id:it.id, source:"dw", name:it.customType||it.itemType||"Item", type:it.itemType,
                      finish:finT?.label||it.finishType||"—", qty:it.qty||1, area:c.area, total:c.total, floorIndex:it.floorIndex||0 };
                  }),
                  ...polItems.map(it=>{
                    const c = calcPolishItem(it);
                    const finT = POLISH_FINISH_TYPES.find(f=>f.id===it.finishId);
                    return { id:it.id, source:"pol", name:it.customType||it.category||"Item", type:it.category,
                      finish:finT?.label||it.finishId||"—", qty:it.qty||1, area:c.net, total:c.total, floorIndex:it.floorIndex||0 };
                  }),
                ];
                if (rows.length===0) return <div style={{textAlign:"center",padding:"30px 20px",color:C.gray,fontSize:12.5}}>No Wood, Metal &amp; Joinery items added yet.</div>;

                const BUCKETS = [
                  { label:"Doors",    match:t=>t==="Door" },
                  { label:"Windows",  match:t=>t==="Window" },
                  { label:"Grills",   match:t=>t==="Window Grill"||t==="Safety Grill" },
                  { label:"Railings", match:t=>t==="Railing" },
                  { label:"Gates",    match:t=>t==="Gate" },
                  { label:"Other",    match:()=>true },
                ];
                const renderTypeGroups = (rowSubset, keyPrefix) => {
                  const groups = BUCKETS.map(b=>({label:b.label, items:[]}));
                  rowSubset.forEach(r=>{
                    const idx = BUCKETS.findIndex(b=>b.match(r.type));
                    groups[idx===-1?BUCKETS.length-1:idx].items.push(r);
                  });
                  return groups.filter(g=>g.items.length>0).map(group=>(
                    <details key={keyPrefix+group.label} open={group.items.length===1} style={{border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:8}}>
                      <summary style={{cursor:"pointer",listStyle:"none",padding:"9px 12px",background:"#F8FAFC",display:"flex",justifyContent:"space-between",fontSize:11.5,fontWeight:800,color:C.navy}}>
                        <span>{group.label} ({group.items.length})</span>
                      </summary>
                      <div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px"}}>
                        {group.items.map(r=>(
                          <div key={r.source+r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:C.white,border:`1px solid ${C.border}`,borderRadius:10}}>
                            <span style={{fontSize:14,flexShrink:0}}>{r.source==="dw"?(DW2_ITEM_ICONS[r.type]||"🔧"):"🎨"}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:11.5,fontWeight:700,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</div>
                              <div style={{fontSize:9,color:C.gray}}>{r.finish} · Qty {r.qty} · {r.area.toFixed(1)} sf</div>
                            </div>
                            <div style={{fontSize:12,fontWeight:800,color:C.orange,flexShrink:0}}>₹{r.total.toFixed(0)}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ));
                };

                const floors = project.floors||[];
                if (floors.length>0) {
                  return floors.map((f,fi)=>{
                    const floorRows = rows.filter(r=>(r.floorIndex||0)===fi);
                    if (floorRows.length===0) return null;
                    return <div key={fi} style={{marginBottom:12}}>
                      <div style={{fontSize:12.5,fontWeight:800,color:C.navy,marginBottom:8,paddingBottom:5,borderBottom:`2px solid ${C.orange}`}}>{f.name||`Floor ${fi+1}`}</div>
                      {renderTypeGroups(floorRows, `f${fi}-`)}
                    </div>;
                  });
                }
                return renderTypeGroups(rows, "");
              })()}
            </div>}
          </>}

          {/* ── STEP 5: SPECIALTY SURFACES ── */}
          {currentStepDef.id===5&&<>
            <div style={{background:C.blueL,borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:12,color:C.blue,fontWeight:600}}>
              Add doors, windows, wallpaper, or texture finishes. All optional — skip if not applicable.
            </div>
            <DoorWindowCard items={project.dwItems||[]} onChange={v=>up(p=>({...p,dwItems:v}))}/>
            <WallpaperCard  items={project.wpItems||[]} onChange={v=>up(p=>({...p,wpItems:v}))}/>
            <TextureCard    items={project.textureItems||[]} onChange={v=>up(p=>({...p,textureItems:v}))}/>
          </>}

          {/* ── STEP 6: REVIEW & NOTES ── */}
          {currentStepDef.id===6&&<>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[
                ["📋","Client",   project?.customer?.name||"Not set",     C.navy],
                ["🏠","Category", PROJECT_CATEGORIES.find(c=>c.id===project.projectCategory)?.label||"—", C.blue],
                ["🎨","Type",     project.projectType==="fresh"?"Fresh Painting":"Re-Painting", C.orange],
                ["🔄","Scope",    SCOPE_OPTIONS.find(s=>s.id===project.scope)?.label||"—", C.teal],
                ["📐","Int. Area",`${intNet.toFixed(1)} sf`, C.purple],
                ["🏗","Ext. Area",`${extNet.toFixed(1)} sf`, C.teal],
              ].map(([icon,label,val,col])=>(
                <div key={label} style={{background:C.white,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:11,color:"#aaa",fontWeight:700,marginBottom:4}}>{icon} {label}</div>
                  <div style={{fontSize:13,fontWeight:800,color:col,lineHeight:1.2}}>{val}</div>
                </div>
              ))}
            </div>

{/* PDF Logo — dynamic uploader with localStorage persistence */}
            <div style={{...CARD,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:8}}>PDF Logo</div>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{width:140,height:84,borderRadius:6,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",overflow:"hidden"}}>
                  {customPdfLogo ? (
                    <img src={customPdfLogo} alt="Custom Logo" style={{height:"84px",width:"auto",objectFit:"contain"}} />
                  ) : (
                    <img src="/Paintship W-W-Logo (5).png" alt="PaintShip" style={{height:"84px",width:"auto",objectFit:"contain"}} />
                  )}
                </div>
                <div>
                  <input type="file" accept="image/*" id="logo-upload-input" style={{display:'none'}} onChange={handleLogoUpload} />
                  <button onClick={() => document.getElementById('logo-upload-input')?.click()} style={{background:C.blueL,color:C.blue,borderRadius:20,padding:"6px 12px",fontSize:11,fontWeight:700,border:`1px solid ${C.blue}33`,cursor:"pointer"}}>
                    📷 Upload / Change Logo
                  </button>
                </div>
                <div style={{fontSize:11,color:"#888",marginTop:4}}>
                  {customPdfLogo ? "Custom logo active" : "Official PaintShip logo — used on every quotation."}
                </div>
              </div>
            </div>

            {(dwGrandTotal+wpGrandTotal+txGrandTotal+polishCalc.total+doorWindowCalc.total+wallpaperCalc.total+textureCalc.total)>0&&<div style={{...CARD,background:C.orangeL,border:`1px solid ${C.orange}33`}}>
              <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:8}}>Specialty Items</div>
              {dwGrandTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🚪 Door & Window</span><span style={{fontWeight:700,color:C.orange}}>₹{dwGrandTotal.toFixed(0)}</span></div>}
              {doorWindowCalc.total>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🚪 Door & Window</span><span style={{fontWeight:700,color:C.orange}}>₹{doorWindowCalc.total.toFixed(0)}</span></div>}
              {wpGrandTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🖼 Wallpaper</span><span style={{fontWeight:700,color:C.purple}}>₹{wpGrandTotal.toFixed(0)}</span></div>}
              {wallpaperCalc.total>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🖼 Wallpaper</span><span style={{fontWeight:700,color:C.purple}}>₹{wallpaperCalc.total.toFixed(0)}</span></div>}
              {txGrandTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🏔 Texture</span><span style={{fontWeight:700,color:C.teal}}>₹{txGrandTotal.toFixed(0)}</span></div>}
              {textureCalc.total>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🏔 Texture</span><span style={{fontWeight:700,color:C.teal}}>₹{textureCalc.total.toFixed(0)}</span></div>}
              {polishCalc.total>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#555"}}>🪟 Polish / Enamel</span><span style={{fontWeight:700,color:C.purple}}>₹{polishCalc.total.toFixed(0)}</span></div>}
            </div>}

            {/* Combined project grand total (all modules with data) */}
            <div style={{...CARD,background:C.navy,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>🏆 Project Grand Total</span>
              <span style={{fontSize:20,fontWeight:900,color:C.gold}}>₹{grandTotal.toFixed(0)}</span>
            </div>

            {/* Material Consumption — aggregated from existing per-module
                consumption calculations only (see buildMaterialConsumptionSummary). */}
            <MaterialConsumptionSummary project={project} onUpdate={(patch) => up(p => ({ ...p, ...patch }))}/>


            {/* Notes */}
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>Site Notes</div>
              <Inp value={project.notes||""} onChange={v=>up(p=>({...p,notes:v}))} placeholder="Special instructions, site conditions, client remarks..." rows={4}/>
            </div>
          </>}

          </div>{/* end padding wrapper */}
        </div>{/* end step body */}

        {/* ── WIZARD NAVIGATION rendered inside bottom bar below ── */}
        </>;
      })()}

      {/* Projects list */}
      {nav==="projects"&&(()=>{ const filteredProjects=projects.filter(p=>{ const q=(projSearch||"").toLowerCase(); const name=(p.clientName||p.customer?.name||"").toLowerCase(); const loc=(p.location||p.customer?.location||"").toLowerCase(); return !q||name.includes(q)||loc.includes(q); }); return <div style={{padding:18}}>
        <div style={{fontSize:20,fontWeight:800,color:C.navy,marginBottom:4}}>Saved Estimates</div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{background:C.greenL,color:C.green,borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:700}}>☁ Cloud</span>
          <span style={{fontSize:11,color:"#aaa"}}>{projects.length} estimate(s)</span>
        </div>
        <div style={{position:"relative",marginBottom:14}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#aaa"}}>🔍</span>
          <input value={projSearch} onChange={e=>setProjSearch(e.target.value)} placeholder="Search client name or location..." style={{...INP,paddingLeft:36,fontSize:13}}/>
        </div>
        {filteredProjects.length===0
          ?<div style={{textAlign:"center",color:"#bbb",padding:"50px 0"}}><div style={{fontSize:44,marginBottom:12}}>📋</div><div>No saved estimates yet.</div></div>
          :filteredProjects.map(p=>{
            const pt=getProjectServiceTotals(p);const rooms=p.floors?.reduce((s,f)=>s+f.rooms.length,0)||0;const wm=p.quoteMode==="with_material";
            return <div key={p.id} onClick={()=>{ const migrated=recalculateProjectTotals(rehydrateProject(p,user));setProject(prev=>({...prev,floors:migrated.floors,doorWindowItems:migrated.doorWindowItems,exteriorSides:migrated.exteriorSides,...migrated}));setAf(0);setAr(0);setNav("calc");setPaintFloorIdx(0);setPaintExpandedRoomId(null);forceRecalc();}} style={{...CARD,cursor:"pointer",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:800,color:C.navy}}>{p.clientName||p.customer?.name||"New Estimate"}</div>
                  <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{p.location||p.customer?.location||""} · {p.floors?.length}F · {rooms}R</div>
                  <div style={{display:"flex",gap:5,marginTop:7,flexWrap:"wrap"}}>
                    <span style={{background:p.projectType==="fresh"?C.greenL:C.orangeL,color:p.projectType==="fresh"?C.green:C.orange,fontSize:9,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{p.projectType==="fresh"?"🎨 Fresh":"🔄 Repaint"}</span>
                    <span style={{background:wm?C.navyL:"#F8FAFC",color:wm?"#fff":C.gray,fontSize:9,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{wm?"💎 With Mat":"📐 Measure"}</span>
                  </div>
                  <div style={{fontSize:10,color:"#ccc",marginTop:5}}>{p.updatedAt?new Date(p.updatedAt).toLocaleString():""}</div>
                </div>
                <div style={{textAlign:"right",display:"flex",flexDirection:"column",gap:5,marginLeft:10}}>
                  <div style={{fontSize:15,fontWeight:800,color:C.orange}}>₹{(p.grandTotal||p.totalAmount||(wm?pt.grandTotal:pt.finalTotal)).toFixed(0)}</div>
                  <div style={{fontSize:11,color:C.gray}}>{pt.grandArea.toFixed(0)} sf</div>
                  <div style={{display:"flex",gap:5,justifyContent:"flex-end"}}>
                    <button onClick={e=>dupProject(p,e)} style={{background:C.blueL,border:"none",borderRadius:8,padding:"4px 8px",fontSize:10,color:C.blue,cursor:"pointer",fontWeight:700}}>Copy</button>
                    <button onClick={e=>delProject(p.id,e)} style={{background:C.redL,border:"none",borderRadius:8,padding:"4px 8px",fontSize:10,color:C.red,cursor:"pointer",fontWeight:700}}>Del</button>
                  </div>
                </div>
              </div>
            </div>;
          })}
      </div>; })()}
    </div>

    {/* Bottom bar */}
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:560,background:"#0F172A",borderTop:`1px solid rgba(255,255,255,0.08)`,zIndex:100,boxShadow:"0 -4px 20px rgba(0,0,0,0.35)",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {nav==="calc"&&(()=>{
        // isFirst/isLast now come from the canonical wizIsFirst/wizIsLast computed once at
        // component scope (PAINT-UX-003A Task 1) — same values the header above uses, so
        // this bar and the header can no longer disagree about which step is last.
        const isPolish=(project.measureType||"interior")==="polish";
        const isDoorWindow=(project.measureType||"interior")==="doorwindow";
        const isJoinery = isPolish || isDoorWindow || (project.measureType||"interior")==="joinery";
        const isWallpaperMT=(project.measureType||"interior")==="wallpaper";
        const isTextureMT=(project.measureType||"interior")==="texture";
        const isInteriorMT=(project.measureType||"interior")==="interior";
        const isExteriorMT=(project.measureType||"interior")==="exterior";
        const joineryTotal = (doorWindowCalc.total||0) + (polishCalc.total||0);
        const joineryArea = (doorWindowCalc.area||0) + (polishCalc.net||0);
        const btmTotal=isJoinery?joineryTotal:isWallpaperMT?totals.wallpaper.total:isTextureMT?totals.texture.total:isExteriorMT?totals.exterior.total:totals.interior.total;
        const btmArea=grandArea;
        return <>
        {/* Totals strip — sits at the top boundary of the dark navy bar, no gap below */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"8px 8px 0"}}>
          <div style={{background:`linear-gradient(135deg,#1E293B,#334155)`,borderRadius:10,padding:"10px 12px",border:`1px solid rgba(232,160,32,0.35)`,display:"flex",flexDirection:"column",justifyContent:"center",gap:2}}>
            <div style={{fontSize:8,color:"rgba(255,255,255,0.75)",fontWeight:700,letterSpacing:"0.06em"}}>🏆 {isJoinery||isWallpaperMT||isTextureMT?"SECTION TOTAL":"GRAND TOTAL"}</div>
            <div style={{fontSize:16,fontWeight:900,color:C.orange}}>₹{btmTotal.toFixed(0)}</div>
            <div style={{fontSize:8,color:"rgba(255,255,255,0.5)"}}>{isJoinery?"Wood, Metal & Joinery":isWallpaperMT?"Wallpaper":isTextureMT?"Texture":isExteriorMT?"Exterior":"Interior"}</div>
          </div>
          <div style={{background:"#1E293B",borderRadius:10,padding:"10px 12px",border:`1px solid rgba(255,255,255,0.08)`,display:"flex",flexDirection:"column",justifyContent:"center",gap:2}}>
            <div style={{fontSize:8,color:"rgba(255,255,255,0.6)",fontWeight:700,letterSpacing:"0.06em"}}>📐 TOTAL AREA</div>
            <div style={{fontSize:16,fontWeight:900,color:"#fff"}}>{btmArea.toFixed(1)} sf</div>
            <div style={{fontSize:8,color:"rgba(255,255,255,0.45)"}}>{isJoinery?`Items: ${doorWindowCalc.area.toFixed(0)}sf`:isWallpaperMT?`Wallpaper: ${totals.wallpaper.area.toFixed(0)}sf`:isTextureMT?`Texture: ${totals.texture.area.toFixed(0)}sf`:isExteriorMT?`Ext: ${totals.exterior.area.toFixed(0)}sf`:`Int: ${totals.interior.area.toFixed(0)}sf`}</div>
          </div>
        </div>
        </>;
      })()}
      {/* Single dark-navy footer row: action buttons centered, MEASURE/ESTIMATES nav at edges */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",width:"100%",gap:12,padding:"6px 8px 6px",background:"#0F172A",borderTop:`1px solid rgba(255,255,255,0.06)`,height:56}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"6px 14px",minWidth:78,border:"none",background:"none",fontSize:10,fontWeight:700,color:nav==="calc"?C.gold:"rgba(255,255,255,0.55)",cursor:"pointer",textTransform:"uppercase",position:"relative",flexShrink:0,marginLeft:8}}>
          <span style={{fontSize:18,lineHeight:1}}>📐</span>
          <span style={{marginTop:2}}>MEASURE</span>
          {nav==="calc"&&<div style={{position:"absolute",left:14,right:14,bottom:2,height:2,background:C.gold,borderRadius:1}}/>}
        </div>
        <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"center",gap:8,padding:"6px 0",zIndex:1}}>
          {nav==="calc" && (
            <>
              <button
                onClick={()=>setWizStep(s=>Math.max(0,s-1))}
                disabled={wizIsFirst}
                style={{width:36,height:36,borderRadius:"50%",border:`1.5px solid ${wizIsFirst?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.55)"}`,fontSize:16,fontWeight:700,cursor:wizIsFirst?"not-allowed":"pointer",background:"transparent",color:wizIsFirst?"rgba(255,255,255,0.3)":"#fff",opacity:wizIsFirst?0.45:1,transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>←</button>
              <button
                onClick={async () => {
                  try {
                    await doSave();
                   } catch (e) {
                     if (import.meta.env.DEV) console.error("Save button handler failed:", e);
                   }
                }}
                style={{padding:"0 16px",height:36,border:"none",borderRadius:18,fontSize:11,fontWeight:700,cursor:"pointer",background:statusColor[cloudSt]||C.navy,color:"#fff",transition:"background 0.3s",flexShrink:0}}>{statusText[cloudSt]||"☁ Save"}</button>
              <button
                onClick={()=>{ if(wizIsLast){setShowQuote(true);}else{setWizStep(s=>Math.min(wizVisibleSteps.length-1,s+1));} }}
                style={{width:36,height:36,borderRadius:"50%",border:"none",fontSize:16,fontWeight:800,cursor:"pointer",background:wizIsLast?`linear-gradient(135deg,${C.gold},#F5B942)`:`linear-gradient(135deg,${C.navy},${C.navyL})`,color:wizIsLast?C.navy:"#fff",transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>→</button>
            </>
          )}
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"stretch",gap:0,flexShrink:0}}>
          {[{id:"projects",icon:"📁",label:"ESTIMATES"}].map(n=>(
            <button key={n.id} onClick={()=>setNav(n.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"6px 14px",minWidth:78,border:"none",background:"none",fontSize:10,fontWeight:700,color:nav===n.id?C.gold:"rgba(255,255,255,0.55)",cursor:"pointer",textTransform:"uppercase",position:"relative"}}>
              <span style={{fontSize:18,lineHeight:1}}>{n.icon}</span>
              <span style={{marginTop:2}}>{n.label}</span>
              {nav===n.id&&<div style={{position:"absolute",left:14,right:14,bottom:2,height:2,background:C.gold,borderRadius:1}}/>}
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* Quote Modal */}
{showQuote && (() => {
  // Quote Summary section visibility: driven by whether each section actually has data
  const qShowInterior = (intNet || 0) > 0;
  const qShowExterior = (extNet || 0) > 0;
  const qShowPolish = ((polishCalc && polishCalc.net) || 0) > 0;
  const qShowDoorWindow = (project?.doorWindowItems || []).length > 0;
  const qShowWallpaper = (project?.wallpaperItems || []).length > 0;
  const qShowTX2Texture = typeof calcTexture === "function" ? (calcTexture(project?.TX2_textureItems || []).total || 0) > 0 : false;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setShowQuote(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: "20px", padding: "22px 18px 36px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>Quote Summary</div>
            <div style={{ fontSize: 12, color: "#aaa" }}>{project?.customer?.name || "—"} · {project?.customer?.location || ""}</div>
          </div>
          <button onClick={() => setShowQuote(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>✕</button>
        </div>

        {/* Project Type Badges */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ background: project?.projectType === "fresh" ? C.greenL : C.orangeL, color: project?.projectType === "fresh" ? C.green : C.orange, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px" }}>
            {project?.projectType === "fresh" ? "🎨 Fresh" : "🔄 Repaint"}
          </span>
          <span style={{ background: withMat ? C.navy : "#F8FAFC", color: withMat ? "#fff" : C.gray, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px" }}>
            {withMat ? "💎 With Material" : "📐 Measurement Only"}
          </span>
        </div>

        {/* Legacy Extras Alert (Top Banner) */}
        {(() => {
          const lcTop = typeof hasLegacyExtras === "function" ? hasLegacyExtras(project) : { hasLegacy: false };
          if (!lcTop.hasLegacy) return null;
          return (
            <div style={{ background: "#FFF7ED", border: "2px solid #F59E0B", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#B45309", marginBottom: 4 }}>⚠ Legacy Extras detected</div>
              <div style={{ fontSize: 11, color: "#92400E", marginBottom: 10, lineHeight: 1.4 }}>
                These items are not included in the Grand Total. Review or migrate them before issuing this quotation.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FDE68A", borderRadius: 20, padding: "3px 10px" }}>Doors/Windows: {lcTop.legacyDoorCount || 0}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FDE68A", borderRadius: 20, padding: "3px 10px" }}>Wallpaper: {lcTop.legacyWallpaperCount || 0}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FDE68A", borderRadius: 20, padding: "3px 10px" }}>Texture: {lcTop.legacyTextureCount || 0}</span>
              </div>
            </div>
          );
        })()}

        {/* Quote Health & Validation */}
        {(() => {
          const qt = typeof getProjectServiceTotals === "function" ? getProjectServiceTotals(project) : (totals || {});
          const qlc = typeof hasLegacyExtras === "function" ? hasLegacyExtras(project) : { hasLegacy: false };
          const modules = [
            { label: "Interior", active: ((qt.interior && qt.interior.net) || 0) > 0 },
            { label: "Exterior", active: ((qt.exterior && qt.exterior.net) || 0) > 0 },
            { label: "Joinery", active: (((qt.doorwindow && qt.doorwindow.total) || 0) + ((qt.polish && qt.polish.total) || 0)) > 0 },
            { label: "Wallpaper", active: ((qt.wallpaper && qt.wallpaper.total) || 0) > 0 },
            { label: "Texture", active: ((qt.texture && qt.texture.total) || 0) > 0 },
          ].filter(m => m.active);

          const checks = [
            { label: "Client name", pass: !!(project?.customer && project?.customer?.name) },
            { label: "Total area", pass: ((qt.grandArea || grandArea) || 0) > 0 },
            { label: "Grand total", pass: ((qt.grandTotal || grandTotal) || 0) > 0 },
            { label: "No legacy extras", pass: !qlc.hasLegacy },
          ];
          const ready = ((qt.grandTotal || grandTotal) || 0) > 0;

          return (
            <div style={{ marginBottom: 14 }}>
              {/* Health */}
              <div style={{ background: "#F8FAFC", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 8 }}>QUOTE HEALTH</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {modules.length === 0 && <span style={{ fontSize: 11, color: C.gray }}>No modules contain data yet</span>}
                  {modules.map(m => (
                    <span key={m.label} style={{ fontSize: 11, fontWeight: 700, color: C.green, background: C.greenL, borderRadius: 20, padding: "3px 10px" }}>✓ {m.label}</span>
                  ))}
                </div>
              </div>

              {/* Validation */}
              <div style={{ background: "#F8FAFC", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 8 }}>VALIDATION</div>
                {checks.map(c => (
                  <div key={c.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0" }}>
                    <span style={{ color: c.pass ? C.gray : C.red, fontWeight: 600 }}>{c.label}</span>
                    <span style={{ fontWeight: 800, color: c.pass ? C.green : C.red }}>{c.pass ? "✓ Pass" : "✗ Fail"}</span>
                  </div>
                ))}
              </div>

              {/* PDF Readiness */}
              <div style={{ background: ready ? C.greenL : "#FFF7ED", border: `2px solid ${ready ? C.green : "#F59E0B"}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: ready ? C.green : "#B45309" }}>{ready ? "✓ READY FOR PDF" : "⚠ NOT READY FOR PDF"}</div>
                {!ready && (
                  <div style={{ marginTop: 6 }}>
                    {checks.filter(c => !c.pass).map(c => (
                      <div key={c.label} style={{ fontSize: 11, color: "#92400E" }}>• {c.label}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Interior Rooms List */}
        {qShowInterior && (project?.floors || []).map((fl, fi) => (
          <div key={fl.id || fi} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, background: C.bg, borderRadius: 8, padding: "6px 12px", marginBottom: 8 }}>{fl.name}</div>
            {(fl.rooms || []).map((r, ri) => {
              const rc2 = typeof calcRoom === "function" ? calcRoom(r) : { net: 0, total: 0, labEx: 0 };
              const rpkg = PACKAGES[r.package] || PACKAGES.premium;
              const fin = r.finishing || {};
              const pName = withMat && typeof getProductName === "function" ? getProductName(r.brand, r.package, "interior") : "";
              return (
                <div key={r.id || ri} style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: withMat ? rpkg.color : C.navy }}>{r.type === "Custom" ? (r.customType || "Custom") : r.type}</div>
                      {withMat && (
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ background: rpkg.colorL, color: rpkg.color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 9px" }}>{rpkg.icon} {rpkg.label}</span>
                          {project.includeBrand && (
                            <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#F0F0F0", borderRadius: 20, padding: "2px 7px" }}>
                              <div style={{ borderRadius: 3, overflow: "hidden" }}><BrandLogo id={r.brand} size={13} /></div>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#555" }}>{typeof getBrandName === "function" ? getBrandName(r) : r.brand}</span>
                            </div>
                          )}
                          {pName && <span style={{ fontSize: 9, color: C.orange, fontWeight: 600 }}>{pName}</span>}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{(rc2.net || 0).toFixed(1)} sf</span>
                  </div>
                  {r.condition !== "Good" && <div style={{ background: C.redL, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 6 }}>⚠ {r.condition}</div>}
                  {withMat && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 6 }}>
                      {Object.entries(fin).filter(([, f]) => f.on).map(([k, f]) => {
                        const a = f.useRoom ? rc2.net : (f.area || 0);
                        const cost = (f.rate || 0) * (f.coats || 1) * a + (k === "wallpaper" ? (f.installRate || 0) * a : 0);
                        return (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: "#888" }}>
                            <span>{FIN_ICONS[k]} {f.type || k} ({f.coats || 1}×)</span>
                            <span style={{ fontWeight: 600 }}>₹{cost.toFixed(0)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ color: C.gray }}>{withMat ? "Mat + Labour" : "Labour"}</span>
                    <span style={{ fontWeight: 800, color: C.orange }}>₹{(withMat ? rc2.total : rc2.labEx).toFixed(0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Exterior Breakdown */}
        {qShowExterior && (() => {
          const exteriorSummary = totals.exterior || { area: 0, material: 0, labour: 0, total: 0 };
          const exteriorBreakdown = totals.exteriorBreakdown || [];
          const firstDefaultElevation = exteriorBreakdown.find(e => e.useGlobal !== false) || null;
          const LAYER_ORDER = ["putty", "primer", "paint", "protection", "texture"];

          return (
            <div style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 10, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.teal }}>🏗 Exterior</div>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>{(exteriorSummary.area || 0).toFixed(1)} sf</span>
              </div>

              {exteriorBreakdown.length === 0 && <div style={{ fontSize: 11, color: "#aaa" }}>No exterior elevations available.</div>}

              {exteriorBreakdown.map(entry => {
                const cfg = entry.config || (typeof defExteriorConfig === "function" ? defExteriorConfig() : {});
                const usingDefault = entry.useGlobal !== false;
                const eBrandQ = cfg.brand === "other" ? (cfg.customBrand || "Other") : BRAND_PRODUCTS[cfg.brand]?.name || "—";
                const eProductQ = typeof getProductName === "function" ? getProductName(cfg.brand, cfg.package, "exterior") : "";
                const epkg = PACKAGES[cfg.package] || PACKAGES.premium;
                const showManualLayers = !usingDefault || (firstDefaultElevation && entry.id === firstDefaultElevation.id);

                const finRows = LAYER_ORDER.map(key => {
                  const layer = (cfg.finishing || {})[key];
                  if (!layer || layer.on !== true) return null;
                  if (layer.useRoom === false && !showManualLayers) return null;
                  const meta = typeof getExtFinMeta === "function" ? getExtFinMeta()[key] : null;
                  const selT = (meta?.types || []).find(t => t.id === layer.type);
                  const label = (layer.type === "custom" && layer.customName) ? layer.customName : (selT?.label || meta?.label || key);
                  const area = layer.useRoom !== false ? (entry.area || 0) : (layer.area || 0);
                  const effRate = (layer.rate || 0) * (layer.coats || 1);
                  return { key, label, icon: meta?.icon || "", coats: layer.coats || 1, area, rate: layer.rate || 0, amount: area * effRate };
                }).filter(Boolean);

                return (
                  <div key={entry.id} style={{ background: C.white, borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>{entry.name}</div>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, marginTop: 2, display: "inline-block", background: usingDefault ? "#EEF2F6" : C.orangeL, color: usingDefault ? C.gray : C.orange }}>
                          {usingDefault ? "Default Paint" : "Customized"}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.orange }}>₹{(entry.total || 0).toFixed(0)}</span>
                    </div>
                    {withMat && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                        <span style={{ background: epkg.colorL, color: epkg.color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 9px" }}>{epkg.icon} {epkg.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#F0F0F0", borderRadius: 20, padding: "2px 8px" }}>
                          <div style={{ borderRadius: 3, overflow: "hidden" }}><BrandLogo id={cfg.brand} size={13} /></div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#555" }}>{eBrandQ}</span>
                        </div>
                        {eProductQ && <span style={{ fontSize: 9, color: C.orange, fontWeight: 600 }}>{eProductQ}</span>}
                      </div>
                    )}
                    {withMat && finRows.length > 0 && (
                      <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: 6, marginBottom: 6 }}>
                        {finRows.map(fr => (
                          <div key={fr.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "1px 0", color: "#888" }}>
                            <span>{fr.icon} {fr.label} ({fr.coats}×) · {fr.area.toFixed(0)} sf @ ₹{fr.rate}</span>
                            <span style={{ fontWeight: 600 }}>₹{fr.amount.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                      <span style={{ color: C.gray }}>{(entry.area || 0).toFixed(1)} sf</span>
                      <span style={{ color: C.gray }}>{withMat ? `Mat ₹${(entry.material || 0).toFixed(0)} + Lab ₹${(entry.labour || 0).toFixed(0)}` : `Labour ₹${(entry.labour || 0).toFixed(0)}`}</span>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, paddingTop: 8, marginTop: 2, borderTop: `2px solid ${C.teal}33` }}>
                <span style={{ color: C.gray, fontWeight: 700 }}>Exterior Total</span>
                <span style={{ fontWeight: 800, color: C.teal }}>₹{(exteriorSummary.total || 0).toFixed(0)}</span>
              </div>
            </div>
          );
        })()}

        {/* Polish Summary */}
        {qShowPolish && (() => {
          const polishItemsQ = project.polishItems || [];
          return (
            <div style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.purple}22` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 8 }}>🪟 Polish / Enamel</div>
              {polishItemsQ.map(it => {
                const c = typeof calcPolishItem === "function" ? calcPolishItem(it) : { total: 0, net: 0, mat: 0, lab: 0 };
                const fin = POLISH_FINISH_TYPES.find(f => f.id === it.finishId) || POLISH_FINISH_TYPES[0];
                return (
                  <div key={it.id} style={{ padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#555", fontWeight: 600 }}>{it.category}{it.label ? ` — ${it.label}` : ""} <span style={{ color: "#aaa", fontWeight: 400 }}>({fin?.label || ""})</span></span>
                      <span style={{ fontWeight: 700, color: C.navy }}>₹{c.total.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>
                      {c.net.toFixed(1)} sf · Mat ₹{c.mat.toFixed(0)} · Lab ₹{c.lab.toFixed(0)}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>Polish Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.purple }}>₹{(polishCalc?.total || 0).toFixed(0)}</span>
              </div>
            </div>
          );
        })()}

        {/* Legacy Extras Details */}
        {(() => {
          const lc = typeof hasLegacyExtras === "function" ? hasLegacyExtras(project) : { hasLegacy: false };
          if (!lc.hasLegacy) return null;
          return (
            <div style={{ background: "#FFF7ED", border: "2px solid #F59E0B", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#B45309", marginBottom: 10 }}>⚠ LEGACY EXTRAS — NOT INCLUDED IN GRAND TOTAL</div>

              {lc.legacyDoorCount > 0 && (() => {
                const dwT = typeof calcDWTotals === "function" ? calcDWTotals(project.dwItems) : { total: 0 };
                const finLabel = it => DW_FINISH_TYPES.find(f => f.id === it.finish)?.label || (it.customFinish || it.finish);
                return (
                  <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #FDE68A" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 6 }}>🚪 Legacy Door & Window</div>
                    {(project.dwItems || []).map(it => {
                      const c = typeof calcDWItem === "function" ? calcDWItem(it) : { total: 0 };
                      return (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid #FDE68A" }}>
                          <span style={{ color: "#92400E", fontWeight: 600 }}>{it.label} <span style={{ color: "#B45309", fontWeight: 400 }}>({it.qty || 1}× {it.w}×{it.h}ft · {finLabel(it)})</span></span>
                          <span style={{ fontWeight: 700, color: "#92400E" }}>₹{c.total.toFixed(0)}</span>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>Legacy D&W Total (not counted)</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#B45309" }}>₹{dwT.total.toFixed(0)}</span>
                    </div>
                  </div>
                );
              })()}

              {lc.legacyWallpaperCount > 0 && (() => {
                const wpT = typeof calcWPTotals === "function" ? calcWPTotals(project.wpItems || []) : { total: 0 };
                return (
                  <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #FDE68A" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 6 }}>🖼 Legacy Wallpaper</div>
                    {(project.wpItems || []).map(it => {
                      const c = typeof calcWPItem === "function" ? calcWPItem(it) : { total: 0, rolls: 0 };
                      return (
                        <div key={it.id} style={{ padding: "5px 0", borderBottom: "1px solid #FDE68A" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                            <span style={{ color: "#92400E", fontWeight: 600 }}>{it.label}{it.design ? ` — ${it.design}` : ""}</span>
                            <span style={{ fontWeight: 700, color: "#92400E" }}>₹{c.total.toFixed(0)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "#B45309", marginTop: 1 }}>
                            {it.area || 0} sf · {c.rolls} roll{c.rolls !== 1 ? "s" : ""} · ₹{it.rate || 0}/roll · Install ₹{it.installRate || 0}/sf
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>Legacy Wallpaper Total (not counted)</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#B45309" }}>₹{wpT.total.toFixed(0)}</span>
                    </div>
                  </div>
                );
              })()}

              {lc.legacyTextureCount > 0 && (() => {
                const txT = typeof calcTextureTotals === "function" ? calcTextureTotals(project.textureItems || []) : { total: 0 };
                return (
                  <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #FDE68A" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 6 }}>🏔 Legacy Texture & Decorative Finish</div>
                    {(project.textureItems || []).map(it => {
                      const c = typeof calcTextureItem === "function" ? calcTextureItem(it) : { total: 0 };
                      return (
                        <div key={it.id} style={{ padding: "5px 0", borderBottom: "1px solid #FDE68A" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                            <span style={{ color: "#92400E", fontWeight: 600 }}>{it.label}</span>
                            <span style={{ fontWeight: 700, color: "#92400E" }}>₹{c.total.toFixed(0)}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "#B45309", marginTop: 1 }}>
                            {(it.area || 0).toFixed(1)} sf · {it.coats || 1} coat(s) · ₹{it.rate || 0}/sf mat · ₹{it.labourRate || 0}/sf lab
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>Legacy Texture Total (not counted)</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#B45309" }}>₹{txT.total.toFixed(0)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Door & Window Items */}
        {qShowDoorWindow && (() => {
          const dwItemsQ = project.doorWindowItems || [];
          const dwCalcQ = typeof calcDoorWindow === "function" ? calcDoorWindow(dwItemsQ) : { total: 0 };
          return (
            <div style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 8 }}>🚪 Door & Window</div>
              {dwItemsQ.map(it => {
                const c = typeof calcDoorWindowItem === "function" ? calcDoorWindowItem(it) : { total: 0, area: 0, material: 0, labour: 0 };
                const fin = DW2_FINISH_TYPES.find(f => f.id === it.finishType) || DW2_FINISH_TYPES[0];
                return (
                  <div key={it.id} style={{ padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#555", fontWeight: 600 }}>{it.itemType === "Custom" ? (it.customType || "Custom") : it.itemType} <span style={{ color: "#aaa", fontWeight: 400 }}>({fin?.label || ""})</span></span>
                      <span style={{ fontWeight: 700, color: C.navy }}>₹{c.total.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>
                      {it.length || 0}×{it.height || 0}×{it.qty || 1} · {c.area.toFixed(1)} sf · Mat ₹{c.material.toFixed(0)} · Lab ₹{c.labour.toFixed(0)}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>Door & Window Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.orange }}>₹{dwCalcQ.total.toFixed(0)}</span>
              </div>
            </div>
          );
        })()}

        {/* Wallpaper Items */}
        {qShowWallpaper && (() => {
          const wpItemsQ = project.wallpaperItems || [];
          const wpCalcQ = typeof calcWallpaper === "function" ? calcWallpaper(wpItemsQ) : { total: 0 };
          return (
            <div style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.purple}22` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 8 }}>🖼 Wallpaper</div>
              {wpItemsQ.map(it => {
                const c = typeof calcWallpaperItem === "function" ? calcWallpaperItem(it) : { total: 0, area: 0, requiredRolls: 0, materialCost: 0, labourCost: 0 };
                return (
                  <div key={it.id} style={{ padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#555", fontWeight: 600 }}>{it.label || "Wallpaper"}</span>
                      <span style={{ fontWeight: 700, color: C.navy }}>₹{c.total.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>
                      {it.width || 0}×{it.height || 0}×{it.qty || 1} · {c.area.toFixed(1)} sf · Roll {it.rollWidth || 0}×{it.rollLength || 0}ft · {c.requiredRolls} rolls @ ₹{it.rollPrice || 0} · Mat ₹{c.materialCost.toFixed(0)} · Lab ₹{c.labourCost.toFixed(0)}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>Wallpaper Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.purple }}>₹{wpCalcQ.total.toFixed(0)}</span>
              </div>
            </div>
          );
        })()}

        {/* Texture Items */}
        {qShowTX2Texture && (() => {
          const txItemsQ = project.TX2_textureItems || [];
          const txCalcQ = typeof calcTexture === "function" ? calcTexture(txItemsQ) : { total: 0 };
          return (
            <div style={{ background: "#FAFAFA", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: `1px solid ${C.purple}22` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 8 }}>🧱 Texture</div>
              {txItemsQ.map(it => {
                const c = typeof TX2_calcTextureItem === "function" ? TX2_calcTextureItem(it) : { total: 0, area: 0, materialCost: 0, labourCost: 0 };
                return (
                  <div key={it.id} style={{ padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#555", fontWeight: 600 }}>{it.label || "Texture"} <span style={{ color: "#aaa", fontWeight: 400 }}>({it.textureType === "Custom Texture" ? (it.customType || "Custom Texture") : it.textureType}{it.productName ? ` — ${it.productName}` : ""})</span></span>
                      <span style={{ fontWeight: 700, color: C.navy }}>₹{c.total.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>
                      {it.width || 0}×{it.height || 0}×{it.qty || 1} · {c.area.toFixed(1)} sf · Mat ₹{c.materialCost.toFixed(0)} · Lab ₹{c.labourCost.toFixed(0)}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>Texture Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.purple }}>₹{txCalcQ.total.toFixed(0)}</span>
              </div>
            </div>
          );
        })()}

        {/* Section Cards */}
        {qShowInterior && <SectionSummaryCard title="Interior" icon="🏠" net={intNet} mat={intMat} lab={intLab} charges={project.interiorCharges || defSectionCharges()} onChargesChange={v => up(p => ({ ...p, interiorCharges: v }))} color={C.blue} colorL={C.blueL} />}
        {qShowExterior && <SectionSummaryCard title="Exterior" icon="🏗" net={extNet} mat={totals.exterior.material} lab={totals.exterior.labour} charges={project.exteriorCharges || defSectionCharges()} onChargesChange={v => up(p => ({ ...p, exteriorCharges: v }))} color={C.teal} colorL={C.tealL} />}

        {/* Grand Total Summary Box */}
        <div style={{ background: C.navy, borderRadius: 14, padding: "16px 14px", marginTop: 4 }}>
          {qShowInterior && qShowExterior && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>INTERIOR</div><div style={{ fontSize: 16, fontWeight: 800, color: C.blue }}>₹{totals.interior.total.toFixed(0)}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>EXTERIOR</div><div style={{ fontSize: 16, fontWeight: 800, color: C.teal }}>₹{totals.exterior.total.toFixed(0)}</div></div>
            </div>
          )}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>CHARGES SUMMARY</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.75)", padding: "2px 0" }}><span>Subtotal</span><span>₹{totals.combinedSubtotal.toFixed(0)}</span></div>
            {totals.additionalCharges > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.75)", padding: "2px 0" }}><span>Additional Charges</span><span>₹{totals.additionalCharges.toFixed(0)}</span></div>}
            {totals.discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#F3A6A6", padding: "2px 0" }}><span>Discount ({totals.discountPct}%)</span><span>−₹{totals.discountAmount.toFixed(0)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "#fff", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.15)", marginTop: 2 }}><span>Taxable Amount</span><span>₹{totals.taxableAmount.toFixed(0)}</span></div>
            {totals.gstAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.75)", padding: "2px 0" }}><span>GST ({totals.gstPct}%)</span><span>₹{totals.gstAmount.toFixed(0)}</span></div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: "0.06em" }}>🏆 GRAND TOTAL</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{grandArea.toFixed(1)} sf</div></div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.orange }}>₹{grandTotal.toFixed(0)}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <button onClick={() => setShowInvoice(true)} style={{ marginTop: 14, width: "100%", padding: 14, background: C.navy, color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🧾 Generate Invoice</button>
        <button onClick={() => generatePDF(project)} style={{ marginTop: 8, width: "100%", padding: 14, background: C.green, color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📄 Download PDF</button>
        <button onClick={() => generateProjectJSON(project)} style={{ marginTop: 8, width: "100%", padding: 14, background: C.navy, color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🗂 Download JSON</button>
        <button onClick={() => setShowQuote(false)} style={{ marginTop: 8, width: "100%", padding: 14, background: C.orange, color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
})()}

{/* Modals Container */}
{showInvoice && <InvoiceModal project={project} totals={totals} onClose={() => setShowInvoice(false)} />}
{showPinModal && <PinEntryModal onSuccess={() => { setIsFinishesLocked(false); setShowPinModal(false); }} onClose={() => setShowPinModal(false)} />}
{showMasterRates && <MasterRatesModal onClose={() => setShowMasterRates(false)} onSaved={() => setMasterRatesVersion(v => v + 1)} />}

</div>
 ;
}
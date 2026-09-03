import React, { useState } from "react";

export const C = {
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

export const LBL = { fontSize:10, color:C.gray, fontWeight:700, letterSpacing:"0.06em", marginBottom:4, textTransform:"uppercase", display:"block" };
export const INP = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:16, outline:"none", background:"#FAFAFA", color:"#111", boxSizing:"border-box" };

const PUTTY_T   = [{id:"white_cement",label:"White Cement Putty",r:8},{id:"wall_putty",label:"Wall Putty",r:10},{id:"acrylic_putty",label:"Acrylic Putty",r:14},{id:"polymer",label:"Polymer Putty",r:15},{id:"waterproof",label:"Waterproof Putty",r:20},{id:"custom",label:"Custom Putty",r:0}];
const PRIMER_T  = [{id:"interior",label:"Interior Primer",base:"water",r:7},{id:"acrylic_p",label:"Acrylic Primer",base:"water",r:8},{id:"wood",label:"Wood Primer",base:"oil",r:11},{id:"metal",label:"Metal Primer",base:"oil",r:12},{id:"custom",label:"Custom Primer",base:"water",r:0}];
const PAINT_T   = [{id:"distemper",label:"Distemper",base:"water",r:10},{id:"economy_emulsion",label:"Economy Emulsion",base:"water",r:18},{id:"premium_emulsion",label:"Premium Emulsion",base:"water",r:32},{id:"luxury_emulsion",label:"Luxury Emulsion",base:"water",r:45},{id:"designer_finish",label:"Designer Finish",base:"water",r:60},{id:"anti_fungal",label:"Anti-Fungal Paint",base:"water",r:28},{id:"washable",label:"Washable Paint",base:"water",r:25},{id:"synthetic_enamel",label:"Synthetic Enamel",base:"oil",r:25},{id:"high_gloss",label:"High Gloss Enamel",base:"oil",r:30},{id:"custom",label:"Custom Paint",base:"water",r:0}];
const TOPCOAT_T = [{id:"clear_varnish",label:"Clear Varnish",r:12},{id:"polyurethane",label:"Polyurethane",r:18},{id:"custom",label:"Custom",r:0}];
const OIL_T     = [{id:"synthetic_enamel",label:"Synthetic Enamel",r:25},{id:"high_gloss",label:"High Gloss",r:30},{id:"oil_paint",label:"Oil Paint",r:28},{id:"duco_finish",label:"Duco Finish",r:55},{id:"custom",label:"Custom",r:0}];
const POLISH_T  = [{id:"melamine",label:"Melamine Polish",r:35},{id:"pu",label:"PU Polish",r:45},{id:"nc",label:"NC Polish",r:28},{id:"french",label:"French Polish",r:50},{id:"wood_stain",label:"Wood Stain",r:20},{id:"custom",label:"Custom",r:0}];
const TEXTURE_T = [{id:"roller",label:"Roller Texture",r:22},{id:"metallic",label:"Metallic Finish",r:50},{id:"venetian",label:"Venetian Finish",r:70},{id:"stucco",label:"Stucco Finish",r:35},{id:"custom",label:"Custom",r:0}];

export const FIN_META = {
  putty:    { label:"Wall Putty",  icon:"🪣", types:PUTTY_T   },
  primer:   { label:"Primer",      icon:"🧴", types:PRIMER_T  },
  paint:    { label:"Wall Paint",  icon:"🎨", types:PAINT_T   },
  topcoat:  { label:"Topcoat",     icon:"✨", types:TOPCOAT_T },
  oilPaint: { label:"Enamel / Trim",  icon:"🛢", types:OIL_T     },
  polish:   { label:"Polish",      icon:"💅", types:POLISH_T  },
  texture:  { label:"Texture",     icon:"🏔", types:TEXTURE_T },
  wallpaper:{ label:"Wallpaper",   icon:"🖼", types:[]        },
};

const EXT_PUTTY_T      = [{id:"white_cement_ext",label:"White Cement",r:8},{id:"exterior_putty",label:"Exterior Putty",r:12},{id:"custom",label:"Custom Putty",r:0}];
const EXT_PRIMER_T     = [{id:"exterior_primer",label:"Exterior Primer",base:"water",r:9},{id:"alkali_primer",label:"Alkali Resistant Primer",base:"water",r:11},{id:"custom",label:"Custom Primer",base:"water",r:0}];
const EXT_PAINT_T      = [{id:"economy_ext",label:"Economy Exterior Emulsion",base:"water",r:20},{id:"premium_ext",label:"Premium Exterior Emulsion",base:"water",r:32},{id:"luxury_ext",label:"Luxury Exterior Emulsion",base:"water",r:50},{id:"ultra_luxury_ext",label:"Ultra Luxury Exterior Emulsion",base:"water",r:75},{id:"custom",label:"Custom Exterior Paint",base:"water",r:0}];
const EXT_PROTECTION_T = [{id:"waterproof",label:"Waterproof Coating",r:18},{id:"elastomeric",label:"Elastomeric Coating",r:25},{id:"anti_fungal_ext",label:"Anti-Fungal Coating",r:20},{id:"custom",label:"Custom Coating",r:0}];
const EXT_TEXTURE_T    = [{id:"exterior_texture",label:"Exterior Texture",r:35},{id:"stone_finish",label:"Stone Finish",r:55},{id:"sand_texture",label:"Sand Texture",r:28},{id:"custom",label:"Custom Texture",r:0}];

export const EXT_FIN_META = {
  putty:      { label:"Surface Prep / Putty", icon:"🪣", types:EXT_PUTTY_T      },
  primer:     { label:"Primer",               icon:"🧴", types:EXT_PRIMER_T     },
  paint:      { label:"Exterior Paint",       icon:"🎨", types:EXT_PAINT_T      },
  protection: { label:"Protection Coating",   icon:"🛡", types:EXT_PROTECTION_T },
  texture:    { label:"Decorative Finish",    icon:"🏔", types:EXT_TEXTURE_T    },
};

export const CONSUMPTION_ENABLED = ["paint","oilPaint","topcoat","polish","texture","putty","primer"];

export const fmt = n => parseFloat((n || 0).toFixed(2));

export function calcConsumption(area, coats, coverage, wastage, packSize, ratePerL) {
  if (!area || !coverage) return { litres:0, litresWithWaste:0, packs:0, cost:0 };
  const litres = (area * coats) / coverage;
  const litresWithWaste = litres * (1 + (wastage||0)/100);
  const packs = Math.ceil(litresWithWaste / (packSize||1));
  const cost = litresWithWaste * (ratePerL||0);
  return { litres:fmt(litres), litresWithWaste:fmt(litresWithWaste), packs, cost:fmt(cost) };
}

export function Inp({ label, value, onChange, type="text", placeholder="", rows, maxLength, disabled=false }) {
  const disStyle = disabled ? {opacity:0.55,cursor:"not-allowed",background:"#EDEDED"} : {};
  return <div>{label && <span style={LBL}>{label}</span>}
    {rows ? <textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} style={{...INP,resize:"none",...disStyle}} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          : <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled} style={{...INP,...disStyle}} onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>}
  </div>;
}

export function DropSel({ label, value, onChange, options, style={}, disabled=false }) {
  const disStyle = disabled ? {opacity:0.55,cursor:"not-allowed",background:"#EDEDED"} : {};
  return <div style={style}>{label && <span style={LBL}>{label}</span>}
    <div style={{position:"relative"}}>
      <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} style={{...INP,appearance:"none",WebkitAppearance:"none",paddingRight:28,cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontSize:13,...disStyle}}
        onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"#aaa",pointerEvents:"none"}}>▾</span>
    </div>
  </div>;
}

export function CoatStepper({ value, onChange, disabled=false }) {
  const disBtn = disabled ? {cursor:"not-allowed",opacity:0.5} : {cursor:"pointer"};
  return <div style={{display:"flex",alignItems:"center",gap:8,height:36,opacity:disabled?0.6:1}}>
    <button onClick={()=>{if(!disabled)onChange(Math.max(1,(value||1)-1))}} disabled={disabled} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:16,fontWeight:700,color:C.orange,...disBtn}}>−</button>
    <span style={{fontSize:17,fontWeight:800,minWidth:22,textAlign:"center",color:C.navy}}>{value||1}</span>
    <button onClick={()=>{if(!disabled)onChange((value||1)+1)}} disabled={disabled} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,fontSize:16,fontWeight:700,color:C.orange,...disBtn}}>+</button>
  </div>;
}

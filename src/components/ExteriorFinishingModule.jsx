import React, { useState } from "react";
import NumInp from "./NumInp.jsx";
import { C, LBL, EXT_FIN_META } from "./shared.jsx";
import { Inp, DropSel, CoatStepper } from "./shared.jsx";

export default function ExteriorFinishingModule({ finishing, onChange, net, rateLocked=false, isAdmin=false }) {
  const rateDisabled = rateLocked && !isAdmin;
  const [openMap,setOpenMap]=useState({});
  const tog=k=>setOpenMap(p=>({...p,[k]:!p[k]}));
  const upF=(k,f,v)=>onChange({...finishing,[k]:{...finishing[k],[f]:v}});
  const changeType=(k,typeId)=>{ const types=EXT_FIN_META[k]?.types||[]; const t=types.find(x=>x.id===typeId)||types[0]; onChange({...finishing,[k]:{...finishing[k],type:typeId,rate:t?.r||0}}); };
  const entries=Object.entries(EXT_FIN_META);
  return <div>
    <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:14}}>Net exterior area: <b style={{color:C.orange}}>{net.toFixed(2)} sq ft</b></div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:10,marginBottom:10}}>
      {entries.map(([key,cfg])=>{
        const f=finishing[key]||{};
        const types=cfg.types;
        const selT=types.find(t=>t.id===f.type)||types[0];
        const area=f.useRoom?net:(f.area||0);
        const cost=(f.rate||0)*(f.coats||1)*area;
        return <button key={key} onClick={()=>{if(!f.on)upF(key,"on",true);tog(key);}} style={{
            textAlign:"left",cursor:"pointer",position:"relative",
            borderRadius:12,padding:"14px 14px 12px",
            border:`1.5px solid ${f.on?C.teal:C.border}`,
            background:f.on?"#F0FDFA":C.white,
            boxShadow:f.on?"0 2px 8px rgba(13,148,136,0.10)":"none",
            transition:"all 0.15s",
          }}>
          <span onClick={e=>{e.stopPropagation();upF(key,"on",!f.on);}} style={{
              position:"absolute",top:10,right:10,width:18,height:18,borderRadius:"50%",cursor:"pointer",
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
        {types.length>0&&<DropSel label="Type / Variant" value={f.type||types[0]?.id} onChange={v=>changeType(key,v)} options={types.map(t=>({value:t.id,label:t.label+(t.base?` (${t.base==="water"?"Water":"Oil"}-based)`:"")})) } style={{marginBottom:12}}/>}
        {f.type==="custom"&&<div style={{marginBottom:12}}><Inp label="Material Name" value={f.customName||""} onChange={v=>upF(key,"customName",v)} placeholder="Enter name..."/></div>}
        {selT?.base&&<div style={{background:selT.base==="water"?C.blueL:"#FFF7ED",borderRadius:10,padding:"7px 12px",marginBottom:12,fontSize:11,color:selT.base==="water"?C.blue:C.gold,fontWeight:600}}>{selT.base==="water"?"💧 Water-Based":"🛢 Oil-Based"}</div>}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:11,color:C.gray,fontWeight:700}}>Area:</span>
          {["Elevation Net","Custom"].map((lbl,i)=><button key={lbl} onClick={()=>upF(key,"useRoom",i===0)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${(i===0?f.useRoom:!f.useRoom)?C.navy:C.border}`,background:(i===0?f.useRoom:!f.useRoom)?C.navy:C.white,color:(i===0?f.useRoom:!f.useRoom)?"#fff":C.gray,cursor:"pointer"}}>{lbl}</button>)}
        </div>
        {!f.useRoom&&<div style={{marginBottom:12}}><span style={LBL}>Custom Area (sf)</span><NumInp small value={f.area||0} onChange={v=>upF(key,"area",v)}/></div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><span style={LBL}>Rate (₹/sf){rateDisabled&&" 🔒"}</span><NumInp small prefix="₹" value={f.rate||0} onChange={v=>upF(key,"rate",v)} disabled={rateDisabled}/></div>
          <div><span style={LBL}>Coats</span><CoatStepper value={f.coats||1} onChange={v=>upF(key,"coats",v)}/></div>
        </div>
        <div style={{background:"#F0FDFA",borderRadius:10,padding:"10px 14px",marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#0D9488",fontWeight:600}}>{area.toFixed(1)} sf × ₹{f.rate||0} × {f.coats||1}</span>
          <span style={{fontSize:16,fontWeight:800,color:C.teal}}>₹{cost.toFixed(0)}</span>
        </div>
      </div>;
    })}
  </div>;
}

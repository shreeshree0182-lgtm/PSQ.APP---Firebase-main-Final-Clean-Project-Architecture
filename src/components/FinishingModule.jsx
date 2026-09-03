import React, { useState } from "react";
import NumInp from "./NumInp.jsx";
import ConsumptionPanel from "./ConsumptionPanel.jsx";
import { C, LBL, INP, FIN_META, CONSUMPTION_ENABLED } from "./shared.jsx";
import { Inp, DropSel, CoatStepper } from "./shared.jsx";

export default function FinishingModule({ finishing, onChange, net, visibleKeys=null, showNetLabel=true, rateLocked=false, isAdmin=false }) {
  const rateDisabled = rateLocked && !isAdmin;
  const [openMap,setOpenMap]=useState({});
  const tog=k=>setOpenMap(p=>({...p,[k]:!p[k]}));
  const upF=(k,f,v)=>onChange({...finishing,[k]:{...finishing[k],[f]:v}});
  const changeType=(k,typeId)=>{ const types=FIN_META[k]?.types||[]; const t=types.find(x=>x.id===typeId)||types[0]; onChange({...finishing,[k]:{...finishing[k],type:typeId,rate:t?.r||0}}); };
  const finMetaEntries=Object.entries(FIN_META).filter(([key])=>!visibleKeys||visibleKeys.includes(key));
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
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:f.on?C.orangeL:C.white,cursor:"pointer"}} onClick={()=>{if(!f.on)upF(key,"on",true);tog(key);}}>
          <input type="checkbox" checked={!!f.on} onChange={e=>{e.stopPropagation();upF(key,"on",e.target.checked);}} style={{width:16,height:16,accentColor:C.orange,cursor:"pointer",flexShrink:0}}/>
          <span style={{fontSize:17}}>{cfg.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:f.on?C.navy:"#aaa"}}>{cfg.label}</div>
            {f.on&&<div style={{fontSize:10,color:"#888",marginTop:1}}>{selT?.label||""} · {f.coats||1} coat(s) · ₹{cost.toFixed(0)}</div>}
          </div>
          <span style={{fontSize:11,color:"#bbb",transform:isOpen?"rotate(180deg)":"",transition:"transform .2s"}}>▾</span>
        </div>
        {f.on&&isOpen&&<div style={{padding:"12px 14px",background:C.white,borderTop:`1px solid ${C.border}`}}>
          {key==="wallpaper"
            ?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Inp label="Type / Design" value={f.type||""} onChange={v=>upF(key,"type",v)} placeholder="e.g. Floral"/>
              <Inp label="Roll Size" value={f.rollSize||""} onChange={v=>upF(key,"rollSize",v)} placeholder="e.g. 10m×0.53m"/>
            </div>
            :types.length>0&&<DropSel label="Type / Variant" value={f.type||types[0]?.id} onChange={v=>changeType(key,v)} options={types.map(t=>({value:t.id,label:t.label+(t.base?` (${t.base==="water"?"Water":"Oil"}-based)`:"")})) } style={{marginBottom:10}}/>}
          {(f.type==="custom"||key==="wallpaper")&&<div style={{marginBottom:10}}><Inp label="Material Name" value={f.customName||""} onChange={v=>upF(key,"customName",v)} placeholder="Enter name..."/></div>}
          {selT?.base&&<div style={{background:selT.base==="water"?C.blueL:"#FFF7ED",borderRadius:8,padding:"5px 10px",marginBottom:10,fontSize:11,color:selT.base==="water"?C.blue:C.gold,fontWeight:600}}>{selT.base==="water"?"💧 Water-Based":"🛢 Oil-Based"}</div>}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:11,color:"#555",fontWeight:600}}>Area:</span>
            {["Room Net","Custom"].map((lbl,i)=><button key={lbl} onClick={()=>upF(key,"useRoom",i===0)} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${(i===0?f.useRoom:!f.useRoom)?C.navy:C.border}`,background:(i===0?f.useRoom:!f.useRoom)?C.navy:C.white,color:(i===0?f.useRoom:!f.useRoom)?"#fff":"#888",cursor:"pointer"}}>{lbl}</button>)}
          </div>
          {!f.useRoom&&<div style={{marginBottom:10}}><span style={LBL}>CUSTOM AREA (sf)</span><NumInp small value={f.area||0} onChange={v=>upF(key,"area",v)}/></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><span style={LBL}>RATE (₹/sf){rateDisabled&&" 🔒"}</span><NumInp small prefix="₹" value={f.rate||0} onChange={v=>upF(key,"rate",v)} disabled={rateDisabled}/></div>
            <div><span style={LBL}>{key==="wallpaper"?"INSTALL (₹/sf)":"COATS"}</span>
              {key==="wallpaper"?<NumInp small prefix="₹" value={f.installRate||0} onChange={v=>upF(key,"installRate",v)}/>:<CoatStepper value={f.coats||1} onChange={v=>upF(key,"coats",v)}/>}
            </div>
          </div>
          <div style={{background:C.orangeL,borderRadius:8,padding:"8px 12px",marginTop:10,display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:"#c97a40",fontWeight:600}}>{area.toFixed(1)} sf × ₹{f.rate||0} × {f.coats||1}</span>
            <span style={{fontSize:15,fontWeight:800,color:C.orange}}>₹{cost.toFixed(0)}</span>
          </div>
          {CONSUMPTION_ENABLED.includes(key)&&<ConsumptionPanel f={f} net={net} onChange={upd=>onChange({...finishing,[key]:upd})}/>}
        </div>}
      </div>;
    })}
  </div>;
}

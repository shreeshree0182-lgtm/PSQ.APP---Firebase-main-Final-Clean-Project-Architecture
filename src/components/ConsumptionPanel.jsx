import React from "react";
import NumInp from "./NumInp.jsx";
import { C, LBL, fmt, calcConsumption, CONSUMPTION_ENABLED } from "./shared.jsx";

export default function ConsumptionPanel({ f, net, onChange }) {
  const c=f.consumption; if(!c) return null;
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
        <div><span style={LBL}>COVERAGE (sf/L)</span><NumInp small value={c.coverage} onChange={v=>upC("coverage",v)}/></div>
        <div><span style={LBL}>WASTAGE (%)</span><NumInp small value={c.wastage} onChange={v=>upC("wastage",v)}/></div>
        <div><span style={LBL}>PACK SIZE (L)</span><NumInp small value={c.packSize} onChange={v=>upC("packSize",v)}/></div>
        <div><span style={LBL}>RATE (₹/L)</span><NumInp small prefix="₹" value={c.ratePerL} onChange={v=>upC("ratePerL",v)}/></div>
      </div>
      <div style={{background:C.white,borderRadius:8,padding:"8px 10px",marginBottom:8,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,color:"#aaa",fontWeight:700,marginBottom:4}}>AUTO CALCULATION</div>
        <div style={{fontSize:11,color:"#555"}}>({area.toFixed(1)} sf × {f.coats||1}) ÷ {c.coverage} = <b>{auto.litres} L</b> + {c.wastage}% = <b style={{color:C.blue}}>{auto.litresWithWaste} L</b></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:"#555"}}>Override:</span>
        {["Auto","Manual"].map((lbl,i)=><button key={lbl} onClick={()=>upC("overrideLitres",i===1)} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${(i===1?c.overrideLitres:!c.overrideLitres)?C.navy:C.border}`,background:(i===1?c.overrideLitres:!c.overrideLitres)?C.navy:C.white,color:(i===1?c.overrideLitres:!c.overrideLitres)?"#fff":"#888",cursor:"pointer"}}>{lbl}</button>)}
      </div>
      {c.overrideLitres&&<div style={{marginBottom:8}}><span style={LBL}>MANUAL LITRES</span><NumInp small value={c.manualLitres||0} onChange={v=>upC("manualLitres",v)}/></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:6}}>
        {[["Total Litres",`${fmt(displayL)} L`,C.blue],["Packs Req.",`${displayPacks} packs`,C.purple],["Mat. Cost",`₹${fmt(displayCost)}`,C.orange]].map(([label,val,col])=>(
          <div key={label} style={{background:C.white,borderRadius:8,padding:"8px 6px",textAlign:"center",border:`1px solid ${col}22`}}>
            <div style={{fontSize:9,color:"#aaa",fontWeight:700}}>{label}</div>
            <div style={{fontSize:13,fontWeight:800,color:col,marginTop:2}}>{val}</div>
          </div>
        ))}
      </div>
    </>}
  </div>;
}

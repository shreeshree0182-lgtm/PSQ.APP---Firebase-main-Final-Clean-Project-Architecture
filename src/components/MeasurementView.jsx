import React from "react";
import { C } from "./shared.jsx";

const CARD = { background:C.white, borderRadius:14, padding:"16px 18px", marginBottom:10, border:`1px solid ${C.border}` };

export default function MeasurementView({
  project, up,
  floor, room, af, ar, setAf, setAr, upRoom,
  withMat, inr, calcRoom, calcNet, addRoom, addFloor,
  showInterior,
  doorWindowCalc, polishCalc,
  MeasurementHeader, RoomEditor, ExteriorModule, JoineryModule,
  WallpaperMeasurementTab, TextureMeasurementTab,
  defExterior, defExteriorConfig,
}) {
  return <>
    {/* ── Measurement Type selector ── */}
    {(()=>{
      const rawMT = project.measureType || "interior";
      const mt = (rawMT==="polish"||rawMT==="doorwindow") ? "joinery" : rawMT;
      const setMT = v => up(p=>({...p, measureType:v}));
      const TYPES = [
        {id:"interior", icon:"🏠", label:"Interior"},
        {id:"exterior", icon:"🏗", label:"Exterior"},
        {id:"joinery",  icon:"🚪", label:"Wood, Metal & Joinery"},
        {id:"wallpaper", icon:"🖼", label:"Wallpaper"},
        {id:"texture", icon:"🧱", label:"Texture"},
      ];
      return <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {TYPES.map(tp=>{
          const sel = mt===tp.id;
          return <button key={tp.id} onClick={()=>setMT(tp.id)}
            style={{flex:"1 1 auto",padding:"11px 8px",borderRadius:12,fontSize:12,fontWeight:700,
              cursor:"pointer",border:`2px solid ${sel?C.navy:C.border}`,
              background:sel?C.navy:"#F8FAFC",color:sel?"#fff":C.gray,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
              transition:"all 0.15s"}}>
            <span style={{fontSize:16}}>{tp.icon}</span>{tp.label}
          </button>;
        })}
      </div>;
    })()}

    {/* ── Interior ── */}
    {(project.measureType||"interior")==="interior"&&<>
      {showInterior&&floor&&room&&<div style={{...CARD,padding:"12px 14px"}}>
        <MeasurementHeader
          project={project} floor={floor} room={room}
          af={af} ar={ar} setAf={setAf} setAr={setAr}
          upRoom={upRoom} withMat={withMat} inr={inr}
          calcRoom={calcRoom} calcNet={calcNet} addRoom={addRoom} addFloor={addFloor}
          up={up}
        />
        <RoomEditor room={room} onUpdate={upRoom} quoteMode={project.quoteMode} category={project.category} projectType={project.projectType || "fresh"}/>
      </div>}
      {!showInterior&&<div style={{...CARD,textAlign:"center",color:C.gray,padding:"32px 16px"}}>
        <div style={{fontSize:24,marginBottom:8}}>🏠</div>
        <div style={{fontSize:13,fontWeight:700}}>Interior scope not enabled</div>
        <div style={{fontSize:11,marginTop:4}}>Go to Job Details and set scope to Interior or Both.</div>
      </div>}
    </>}

    {/* ── Exterior ── */}
    {(project.measureType||"interior")==="exterior"&&<div style={{...CARD,padding:"12px 14px"}}>
        <div style={{fontSize:13,fontWeight:800,color:C.navy,marginBottom:10}}>🏗 Exterior Elevations</div>
        <ExteriorModule elevations={project.exterior||defExterior()} onChange={v=>up(p=>({...p,exterior:v}))} config={project.exteriorConfig||defExteriorConfig()} onConfigChange={v=>up(p=>({...p,exteriorConfig:v}))} quoteMode={project.quoteMode} paintingType={project.projectType || "fresh"}/>
      </div>}

    {/* ── Wood, Metal & Joinery (unified shell over Door & Window + Polish/Enamel) ── */}
    {(()=>{
      const rawMT = project.measureType || "interior";
      const isJoinery = rawMT==="joinery" || rawMT==="polish" || rawMT==="doorwindow";
      if (!isJoinery) return null;
      return <div style={CARD}>
        <JoineryModule
          doorWindowItems={project.doorWindowItems||[]} onDoorWindowChange={v=>up(p=>({...p,doorWindowItems:v}))}
          polishItems={project.polishItems||[]} onPolishChange={v=>up(p=>({...p,polishItems:v}))}
          doorWindowTotal={doorWindowCalc.total} polishTotal={polishCalc.total}
          floors={project.floors||[]}
        />
      </div>;
    })()}

    {/* ── Wallpaper ── */}
    {(project.measureType||"interior")==="wallpaper"&&<div style={{...CARD,padding:"12px 14px"}}>
      <WallpaperMeasurementTab items={project.wallpaperItems||[]} onChange={v=>up(p=>({...p,wallpaperItems:v}))}/>
    </div>}

    {/* ── Texture ── */}
    {(project.measureType||"interior")==="texture"&&<div style={{...CARD,padding:"12px 14px"}}>
      <TextureMeasurementTab items={project.TX2_textureItems||[]} onChange={v=>up(p=>({...p,TX2_textureItems:v}))}/>
    </div>}
  </>;
}

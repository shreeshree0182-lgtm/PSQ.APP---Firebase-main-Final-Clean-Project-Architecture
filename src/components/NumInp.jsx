import React, { useState, useRef } from "react";
import { C, INP } from "./shared.jsx";

export default function NumInp({ value, onChange, small, prefix, placeholder="0", disabled=false }) {
  const [raw, setRaw] = useState(value==null||value===0?"":String(value));
  const focused = useRef(false);

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
        if (disabled) return;
        const str = e.target.value;
        if(str===""||/^\d*\.?\d*$/.test(str)){
          setRaw(str);
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
        setRaw(v=>v.endsWith(".")?v.slice(0,-1):v);
      }}
      style={{...INP,padding:small?`8px 8px 8px ${prefix?"26px":"8px"}`:"11px 10px",fontSize:small?14:20,fontWeight:600,textAlign:prefix?"left":"center",...(disabled?{opacity:0.55,cursor:"not-allowed",background:"#EDEDED"}:{})}}
    />
  </div>;
}

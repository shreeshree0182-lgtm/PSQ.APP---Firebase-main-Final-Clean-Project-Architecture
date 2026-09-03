import React from "react";
import { C } from "./shared.jsx";

export default function Header({ onNewProject, onLogout, onMasterRates }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
        padding: "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: "56px",
        borderBottom: `1px solid rgba(232,160,32,0.2)`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img
          src="/Paintship W-W-Logo (5).png"
          alt="PaintShip"
          className="h-11 w-auto object-contain block"
          style={{ height: "84px", width: "auto" }}
        />
      </div>
      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
        {onMasterRates && (
          <button
            onClick={onMasterRates}
            style={{
              background: "rgba(232,160,32,0.18)",
              color: C.orange,
              border: `1px solid ${C.orange}44`,
              borderRadius: 9,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "none",
              alignItems: "center",
              gap: 5,
            }}
          >
            🔒 Master Rates
          </button>
        )}
        <button
          onClick={onNewProject}
          style={{
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + New
        </button>
        <button
          onClick={onLogout}
          style={{
            background: "rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.35)",
            border: "none",
            borderRadius: 9,
            padding: "7px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          ⎋
        </button>
      </div>
    </div>
  );
}

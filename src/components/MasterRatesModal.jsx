import React, { useState, useEffect, useRef } from "react";
import { C } from "./shared.jsx";
import {
  getStoredMasterRates,
  saveMasterRates,
  resetMasterRates,
  addCustomTier,
  removeCustomTier,
} from "../data/finishMasterRates.ts";
import {
  getSupervisorPin,
  setSupervisorPin,
  verifySupervisorPin,
} from "../data/supervisorPin.ts";

const pinInputStyle = {
  width: "100%",
  border: `1.5px solid ${C.border}`,
  borderRadius: 10,
  padding: "12px",
  fontSize: 24,
  letterSpacing: "0.5em",
  fontWeight: 800,
  textAlign: "center",
  outline: "none",
  background: "#FAFAFA",
  color: C.navy,
  boxSizing: "border-box",
};

export default function MasterRatesModal({ onClose, onSaved }) {
  const [authed, setAuthed] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [ratesState, setRatesState] = useState(() => getStoredMasterRates());
  const [paintingMode, setPaintingMode] = useState("fresh"); // "fresh" | "repaint"
  const [activeTab, setActiveTab] = useState(0);
  const [saved, setSaved] = useState(false);
  const [customFormKey, setCustomFormKey] = useState(null); // sub.key of open custom finish form
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const pinRef = useRef(null);

  useEffect(() => {
    if (!authed && !showChangePin) pinRef.current?.focus();
  }, [authed, showChangePin]);

  const tryAuth = () => {
    if (verifySupervisorPin(pin)) {
      setAuthed(true);
      setErr("");
    } else {
      setErr("Incorrect PIN. Try again.");
      setPin("");
      pinRef.current?.focus();
    }
  };

  const currentRates = ratesState[paintingMode] || ratesState.fresh;

  const updateRate = (catIdx, subIdx, tierIdx, newRate) => {
    setRatesState((prev) => {
      const modeRates = prev[paintingMode] || prev.fresh;
      const nextModeRates = modeRates.map((cat, ci) => {
        if (ci !== catIdx) return cat;
        return {
          ...cat,
          subCategories: cat.subCategories.map((sub, si) => {
            if (si !== subIdx) return sub;
            return {
              ...sub,
              tiers: sub.tiers.map((tier, ti) => {
                if (ti !== tierIdx) return tier;
                return { ...tier, r: newRate };
              }),
            };
          }),
        };
      });
      return { ...prev, [paintingMode]: nextModeRates };
    });
    setSaved(false);
  };

  const openCustomForm = (subKey) => {
    setCustomFormKey(subKey);
    setCustomName("");
    setCustomRate("");
  };

  const cancelCustomForm = () => {
    setCustomFormKey(null);
    setCustomName("");
    setCustomRate("");
  };

  const submitCustomFinish = (catKey, subKey) => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const rateNum = parseFloat(customRate);
    setRatesState((prev) => {
      const modeRates = prev[paintingMode] || prev.fresh;
      const updated = addCustomTier(modeRates, catKey, subKey, trimmed, isNaN(rateNum) ? 0 : rateNum);
      return { ...prev, [paintingMode]: updated };
    });
    setSaved(false);
    cancelCustomForm();
  };

  const deleteCustomFinish = (catKey, subKey, tierId) => {
    setRatesState((prev) => {
      const modeRates = prev[paintingMode] || prev.fresh;
      const updated = removeCustomTier(modeRates, catKey, subKey, tierId);
      return { ...prev, [paintingMode]: updated };
    });
    setSaved(false);
  };

  const doSave = () => {
    saveMasterRates(ratesState);
    setSaved(true);
    if (onSaved) onSaved(ratesState);
    setTimeout(() => setSaved(false), 2000);
  };

  const doReset = () => {
    const defaults = resetMasterRates();
    setRatesState(defaults);
    setSaved(false);
  };

  // ── Change PIN screen ─────────────────────────────────────────────
  if (showChangePin) {
    return (
      <ChangePinScreen
        onBack={() => { setShowChangePin(false); setErr(""); }}
        onClose={onClose}
      />
    );
  }

  // ── PIN gate ──────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: C.white,
            borderRadius: 16,
            padding: "28px 24px",
            width: "100%",
            maxWidth: 340,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>
              Master Rates Settings
            </div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
              Enter PIN to manage all finish rates
            </div>
          </div>
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setErr("");
              setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") tryAuth();
            }}
            placeholder="••••"
            maxLength={4}
            style={pinInputStyle}
            onFocus={(e) => (e.target.style.borderColor = C.orange)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
          {err && (
            <div
              style={{
                fontSize: 11,
                color: C.red,
                fontWeight: 700,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "12px",
                background: "#F0F4F8",
                color: C.navy,
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={tryAuth}
              style={{
                flex: 1,
                padding: "12px",
                background: C.navy,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Unlock
            </button>
          </div>
          {/* Change PIN link */}
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={() => { setShowChangePin(true); setPin(""); setErr(""); }}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                fontWeight: 700,
                color: C.orange,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Change Supervisor PIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated: tabbed rate editor ─────────────────────────────
  const cat = currentRates[activeTab] || currentRates[0];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 600,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>
              Master Rates Manager
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              color: "#bbb",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Painting Mode Segmented Toggle */}
        <div
          style={{
            padding: "12px 20px 8px",
            background: "#FAFAFA",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              background: "#E2E8F0",
              padding: 3,
              borderRadius: 12,
              gap: 4,
            }}
          >
            <button
              onClick={() => setPaintingMode("fresh")}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
                background: paintingMode === "fresh" ? C.white : "transparent",
                color: paintingMode === "fresh" ? C.navy : C.gray,
                boxShadow: paintingMode === "fresh" ? "0 2px 6px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>🖌️</span> Fresh Painting
            </button>
            <button
              onClick={() => setPaintingMode("repaint")}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
                background: paintingMode === "repaint" ? C.white : "transparent",
                color: paintingMode === "repaint" ? C.orange : C.gray,
                boxShadow: paintingMode === "repaint" ? "0 2px 6px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>🔄</span> Repainting
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 16px",
            overflowX: "auto",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          {currentRates.map((c, i) => (
            <button
              key={c.key}
              onClick={() => setActiveTab(i)}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                border: `1.5px solid ${i === activeTab ? C.navy : C.border}`,
                background: i === activeTab ? C.navy : C.white,
                color: i === activeTab ? "#fff" : C.gray,
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span style={{ fontSize: 14 }}>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* Rate editor body */}
        <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>
          {cat && cat.subCategories.map((sub, si) => (
            <div key={sub.key} style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 16 }}>{sub.icon}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: C.navy,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {sub.label}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {sub.tiers.map((tier, ti) => (
                  <div
                    key={tier.id}
                    style={{
                      background: tier.isCustom ? "#FFF8E7" : "#F8FAFC",
                      borderRadius: 10,
                      padding: "10px 12px",
                      border: `1px solid ${tier.isCustom ? C.orange + "55" : C.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.navy,
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        {tier.base === "water" && "💧 "}
                        {tier.base === "oil" && "🛢 "}
                        {tier.isCustom && "⭐ "}
                        {tier.label}
                      </span>
                      {tier.isCustom && (
                        <button
                          onClick={() => deleteCustomFinish(cat.key, sub.key, tier.id)}
                          title="Remove custom finish"
                          style={{
                            background: "none",
                            border: "none",
                            color: C.red,
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: "pointer",
                            padding: "0 2px",
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: C.gray,
                          fontWeight: 700,
                        }}
                      >
                        ₹
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(tier.r || 0)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) {
                            const n = parseFloat(v);
                            updateRate(activeTab, si, ti, isNaN(n) ? 0 : n);
                          }
                        }}
                        style={{
                          width: "100%",
                          border: `1.5px solid ${C.border}`,
                          borderRadius: 8,
                          padding: "7px 10px",
                          fontSize: 15,
                          fontWeight: 700,
                          color: C.navy,
                          outline: "none",
                          background: C.white,
                          boxSizing: "border-box",
                        }}
                        onFocus={(e) => (e.target.style.borderColor = C.orange)}
                        onBlur={(e) => (e.target.style.borderColor = C.border)}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: C.gray,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        /sq.ft
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* + Add Custom Finish */}
              {customFormKey === sub.key ? (
                <div
                  style={{
                    marginTop: 8,
                    background: "#FFF8E7",
                    border: `1.5px solid ${C.orange}55`,
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      autoFocus
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Italian Marble Finish"
                      style={{
                        border: `1.5px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.navy,
                        outline: "none",
                        background: C.white,
                        boxSizing: "border-box",
                      }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customRate}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d*$/.test(v)) setCustomRate(v);
                      }}
                      placeholder="₹/sf"
                      style={{
                        border: `1.5px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.navy,
                        outline: "none",
                        background: C.white,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={cancelCustomForm}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: C.white,
                        color: C.gray,
                        border: `1.5px solid ${C.border}`,
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => submitCustomFinish(cat.key, sub.key)}
                      disabled={!customName.trim()}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: customName.trim() ? C.orange : "#F0E5C8",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: customName.trim() ? "pointer" : "not-allowed",
                      }}
                    >
                      ✓ Add Finish
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => openCustomForm(sub.key)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "9px",
                    background: "none",
                    border: `1.5px dashed ${C.orange}88`,
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.orange,
                    cursor: "pointer",
                  }}
                >
                  + Add Custom Finish
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "14px 20px",
            borderTop: `1px solid ${C.border}`,
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <button
            onClick={() => setShowChangePin(true)}
            style={{
              padding: "12px 16px",
              background: "#FFF8E7",
              color: C.orange,
              border: `1.5px solid ${C.orange}33`,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            🔑 Change PIN
          </button>
          <button
            onClick={doReset}
            style={{
              padding: "12px 16px",
              background: "#FEF2F2",
              color: C.red,
              border: `1.5px solid ${C.red}33`,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ↺ Reset Defaults
          </button>
          <div style={{ flex: 1 }} />
          {saved && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.green,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ✓ Saved
            </span>
          )}
          <button
            onClick={doSave}
            style={{
              padding: "12px 20px",
              background: C.navy,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🔒 Save &amp; Lock Rates
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change PIN Screen ─────────────────────────────────────────────
function ChangePinScreen({ onBack, onClose }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const currentRef = useRef(null);

  useEffect(() => { currentRef.current?.focus(); }, []);

  const handleSubmit = () => {
    setErr("");

    if (!verifySupervisorPin(currentPin)) {
      setErr("Current PIN is incorrect.");
      setCurrentPin("");
      currentRef.current?.focus();
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setErr("New PIN must be exactly 4 digits.");
      setNewPin("");
      setConfirmPin("");
      return;
    }
    if (newPin !== confirmPin) {
      setErr("New PIN and Confirm PIN do not match.");
      setConfirmPin("");
      return;
    }

    setSupervisorPin(newPin);
    setSuccess(true);
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setTimeout(() => {
      setSuccess(false);
      onBack();
    }, 1800);
  };

  const fieldStyle = {
    width: "100%",
    border: `1.5px solid ${C.border}`,
    borderRadius: 10,
    padding: "12px",
    fontSize: 20,
    letterSpacing: "0.4em",
    fontWeight: 800,
    textAlign: "center",
    outline: "none",
    background: "#FAFAFA",
    color: C.navy,
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 10,
    color: C.gray,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 5,
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: 16,
          padding: "28px 24px",
          width: "100%",
          maxWidth: 360,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.green }}>
              PIN Changed Successfully
            </div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
              Returning to PIN entry...
            </div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 30, marginBottom: 6 }}>🔑</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.navy }}>
                Change Supervisor PIN
              </div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>
                Set a new 4-digit PIN for rate-lock access
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>Current PIN</span>
              <input
                ref={currentRef}
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={(e) => {
                  setErr("");
                  setCurrentPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4));
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="••••"
                maxLength={4}
                style={fieldStyle}
                onFocus={(e) => (e.target.style.borderColor = C.orange)}
                onBlur={(e) => (e.target.style.borderColor = C.border)}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>New PIN (4 digits)</span>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => {
                  setErr("");
                  setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4));
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="••••"
                maxLength={4}
                style={fieldStyle}
                onFocus={(e) => (e.target.style.borderColor = C.orange)}
                onBlur={(e) => (e.target.style.borderColor = C.border)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={labelStyle}>Confirm New PIN</span>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => {
                  setErr("");
                  setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4));
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="••••"
                maxLength={4}
                style={fieldStyle}
                onFocus={(e) => (e.target.style.borderColor = C.orange)}
                onBlur={(e) => (e.target.style.borderColor = C.border)}
              />
            </div>

            {err && (
              <div
                style={{
                  fontSize: 11,
                  color: C.red,
                  fontWeight: 700,
                  textAlign: "center",
                  marginBottom: 10,
                }}
              >
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onBack}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#F0F4F8",
                  color: C.navy,
                  border: "none",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: C.navy,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Update PIN
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useMemo, useState, useCallback } from "react";
import { C } from "./shared.jsx";

const GST_RATE = 18;
const fmt = n => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmt2 = n => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function numberToWords(n) {
  const below20 = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
    "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function recurse(num) {
    if (num < 20) return below20[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10?" "+below20[num%10]:"");
    if (num < 1000) return below20[Math.floor(num/100)]+" Hundred" + (num%100?" "+recurse(num%100):"");
    if (num < 100000) return recurse(Math.floor(num/1000))+" Thousand" + (num%1000?" "+recurse(num%1000):"");
    if (num < 10000000) return recurse(Math.floor(num/100000))+" Lakh" + (num%100000?" "+recurse(num%100000):"");
    return recurse(Math.floor(num/10000000))+" Crore" + (num%10000000?" "+recurse(num%10000000):"");
  }
  const num = Math.floor(n);
  if (num === 0) return "Zero";
  return recurse(num) + " Rupees Only";
}

// Tata-style Corporate 3-Stage Invoice System
const DEFAULT_STAGES = [
  { id: "stage1", pct: 20, label: "Stage 1: Advance / Booking Invoice (20%)", shortLabel: "Stage 1: Advance", desc: "Booking & Material", invoiceTitle: "STAGE 1: ADVANCE INVOICE", type: "advance" },
  { id: "stage2", pct: 50, label: "Stage 2: Running / Mid-Project Invoice (50%)", shortLabel: "Stage 2: Running", desc: "Surface Prep & Primer Complete", invoiceTitle: "STAGE 2: PROGRESS INVOICE", type: "running" },
  { id: "stage3", pct: 30, label: "Stage 3: Final Completion & Handover Invoice (Balance Outstanding)", shortLabel: "Stage 3: Final", desc: "Project Handover", invoiceTitle: "FINAL COMPLETION & HANDOVER INVOICE", type: "final" },
];

const PAYMENT_STATUS_OPTIONS = ["UNPAID", "PARTIALLY PAID", "PAID"];

export default function InvoiceModal({ project, totals, onClose }) {
  // Stage & Payment state
  const [selectedStageIdx, setSelectedStageIdx] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [previouslyReceived, setPreviouslyReceived] = useState(0);
  const [isCustomStage, setIsCustomStage] = useState(false);
  const [customPercentage, setCustomPercentage] = useState(0);
  const [customAmount, setCustomAmount] = useState(0);

  // New Team Controls
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0];
  });
  const [placeOfSupply, setPlaceOfSupply] = useState(project?.customer?.location || project?.customer?.pincode || "Maharashtra");
  const [customerBillingAddress, setCustomerBillingAddress] = useState("");
  const [customerShippingAddress, setCustomerShippingAddress] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyGSTIN, setCompanyGSTIN] = useState("27AAACA1234A1Z5");
  const [companyPAN, setCompanyPAN] = useState("AAACA1234A");
  const [bankName, setBankName] = useState("HDFC Bank Ltd");
  const [bankAccount, setBankAccount] = useState("50200084920192");
  const [bankIFSC, setBankIFSC] = useState("HDFC0001234");
  const [bankBranch, setBankBranch] = useState("Mumbai - Fort");
  const [upiId, setUpiId] = useState("paintship@upi");
  const [companyName, setCompanyName] = useState("PaintShip Services");
  const [authorizedSignatory, setAuthorizedSignatory] = useState("");
  const [digitalStamp, setDigitalStamp] = useState(false);

  const data = useMemo(() => {
    const grandTotal = Number(totals?.grandTotal) || 0;
    const grandArea = Number(totals?.grandArea) || 0;
    const subtotal = Number(totals?.combinedSubtotal) || 0;
    const additionalCharges = Number(totals?.additionalCharges) || 0;
    const discountAmount = Number(totals?.discountAmount) || 0;
    const taxableAmount = Number(totals?.taxableAmount) || 0;
    const gstAmount = Number(totals?.gstAmount) || 0;
    const gstPct = Number(totals?.gstPct) || GST_RATE;
    const hasGst = gstAmount > 0;

    const companyState = "Maharashtra";
    const isIGST = placeOfSupply && placeOfSupply.trim().toLowerCase() !== companyState.toLowerCase();
    const effectiveGst = isIGST ? "IGST" : "GST";

    const matTotal = (totals?.interior ? 0 : 0) + (Number(totals?.exterior?.material) || 0);
    const labTotal = Number(totals?.exterior?.labour) || 0;

    const baseInvoiceNo = invoiceNumber || `INV-${String(project?.id || "").slice(-6).toUpperCase()}`;
    const stageSuffix = isCustomStage ? `-CUSTOM` : `-S${selectedStageIdx + 1}`;
    const finalInvoiceNo = baseInvoiceNo.endsWith(stageSuffix) ? baseInvoiceNo : `${baseInvoiceNo}${stageSuffix}`;

    const invoiceDateObj = new Date(invoiceDate);
    const formattedDate = invoiceDateObj.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    const dueDateObj = new Date(dueDate);
    const formattedDueDate = dueDateObj.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });

    let stages = DEFAULT_STAGES.map((s) => ({ ...s, amount: (grandTotal * s.pct) / 100 }));

    if (isCustomStage) {
      const customPct = customPercentage > 0 ? customPercentage : 0;
      const customAmt = customAmount > 0 ? customAmount : 0;
      const actualAmount = customAmt > 0 ? customAmt : (grandTotal * customPct) / 100;
      stages.push({
        id: "custom", pct: customPct,
        label: customAmt > 0 ? `Custom Amount: ₹${fmt(customAmt)}` : `Custom Percentage: ${customPct}%`,
        shortLabel: customAmt > 0 ? "Custom Amount" : "Custom Percentage",
        desc: "Custom stage as specified", invoiceTitle: "CUSTOM STAGE INVOICE", type: "custom", amount: actualAmount,
      });
    }

    const stagesBeforeCurrent = isCustomStage ? [] : stages.slice(0, selectedStageIdx).map(s => s.amount);
    const cumulativePaidFromStages = stagesBeforeCurrent.reduce((a, b) => a + b, 0);
    const totalPreviouslyReceived = (Number(previouslyReceived) || 0) + cumulativePaidFromStages;
    const currentStageAmount = isCustomStage ? stages[stages.length - 1].amount : (stages[selectedStageIdx]?.amount || 0);
    const remainingBalance = grandTotal - totalPreviouslyReceived - currentStageAmount;

    const sections = [
      { label: "Interior", area: totals?.interior?.area || 0, total: totals?.interior?.total || 0, material: 0, labour: 0 },
      { label: "Exterior", area: totals?.exterior?.area || 0, total: totals?.exterior?.total || 0, material: totals?.exterior?.material || 0, labour: totals?.exterior?.labour || 0 },
      { label: "Polish / Enamel", area: totals?.polish?.area || 0, total: totals?.polish?.total || 0, material: 0, labour: 0 },
      { label: "Door & Window", area: totals?.doorwindow?.area || 0, total: totals?.doorwindow?.total || 0, material: 0, labour: 0 },
      { label: "Wallpaper", area: totals?.wallpaper?.area || 0, total: totals?.wallpaper?.total || 0, material: 0, labour: 0 },
      { label: "Texture", area: totals?.texture?.area || 0, total: totals?.texture?.total || 0, material: 0, labour: 0 },
    ].filter(s => s.total > 0 || s.area > 0);

    const itemRows = [];
    let srCounter = 0;
    sections.forEach((section, secIdx) => {
      const sectionTotal = section.total || 0;
      const sectionArea = section.area || 0;
      if (section.material && section.labour) {
        srCounter++;
        itemRows.push({ sr: srCounter, item: `${section.label} - Material`, area: sectionArea, rate: sectionArea > 0 ? (section.material / sectionArea) : 0, taxableValue: section.material, taxAmount: (section.material * (gstPct / 100)) / 2, totalAmount: section.material, section: section.label });
        srCounter++;
        itemRows.push({ sr: srCounter, item: `${section.label} - Labour`, area: sectionArea, rate: sectionArea > 0 ? (section.labour / sectionArea) : 0, taxableValue: section.labour, taxAmount: (section.labour * (gstPct / 100)) / 2, totalAmount: section.labour, section: section.label });
      } else {
        srCounter++;
        itemRows.push({ sr: srCounter, item: section.label, area: sectionArea, rate: sectionTotal > 0 && sectionArea > 0 ? (sectionTotal / sectionArea) : 0, taxableValue: sectionTotal, taxAmount: (sectionTotal * (gstPct / 100)), totalAmount: sectionTotal, section: section.label });
      }
    });

    const totalTaxableValue = itemRows.reduce((s, r) => s + (Number(r.taxableValue) || 0), 0);
    const totalTaxAmount = itemRows.reduce((s, r) => s + (Number(r.taxAmount) || 0), 0);
    const totalItemAmount = itemRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);

    return {
      grandTotal, grandArea, subtotal, additionalCharges, discountAmount,
      taxableAmount, gstAmount, gstPct, hasGst, isIGST, effectiveGst,
      matTotal, labTotal,
      invoiceNo: finalInvoiceNo, date: formattedDate, dueDate: formattedDueDate,
      placeOfSupply, stages, sections, itemRows, totalPreviouslyReceived, currentStageAmount,
      remainingBalance, cumulativePaidFromStages, totalTaxableValue, totalTaxAmount, totalItemAmount,
    };
  }, [project, totals, selectedStageIdx, isCustomStage, customPercentage, customAmount, invoiceNumber, invoiceDate, dueDate, placeOfSupply, previouslyReceived]);

  const currentStage = data.stages.find((_, idx) =>
    isCustomStage ? idx === data.stages.length - 1 : idx === selectedStageIdx
  ) || data.stages[0];

  const invoiceTitle = currentStage?.invoiceTitle || data.stages[0]?.invoiceTitle;
  const amountDue = data.currentStageAmount;
  const balanceRemaining = data.remainingBalance;
  const amountInWords = numberToWords(amountDue);

  const cust = project?.customer || {};
  const scope = project?.scope || "—";
  const projectType = project?.projectType === "fresh" ? "Fresh Painting" : project?.projectType === "repaint" ? "Re-Painting" : "—";
  const category = project?.projectCategory || project?.category || "—";

  const handleStageChange = useCallback((val) => {
    if (val === "custom") { setIsCustomStage(true); setSelectedStageIdx(0); }
    else { setIsCustomStage(false); setSelectedStageIdx(Number(val)); }
  }, []);

  const handleCustomPercentage = useCallback((val) => {
    const v = parseFloat(val) || 0;
    setCustomPercentage(v > 100 ? 100 : v);
    if (v > 0) setCustomAmount(0);
  }, []);

  const handleCustomAmount = useCallback((val) => {
    const v = parseFloat(val) || 0;
    setCustomAmount(v);
    if (v > 0) setCustomPercentage(0);
  }, []);

  const handlePreviouslyReceived = useCallback((val) => {
    const v = parseFloat(val) || 0;
    setPreviouslyReceived(v);
  }, []);

  const handlePaymentStatusSet = useCallback(() => {
    const v = Number(previouslyReceived) || 0;
    if (v >= data.grandTotal) setPaymentStatus("PAID");
    else if (v > 0) setPaymentStatus("PARTIALLY PAID");
    else setPaymentStatus("UNPAID");
  }, [previouslyReceived, data.grandTotal]);

  const companyLogo = "/Paintship B-Logo.png";
  const companyAddr = companyAddress || "123 Corporate Plaza, MG Road, Mumbai - 400001, Maharashtra";

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", overflowY:"auto", padding:"16px 12px" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.white, borderRadius:14, maxWidth:960, width:"100%", margin:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Modal header bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", borderBottom:`1px solid ${C.border}` }} className="no-print">
          <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>Invoice & Payment Schedule</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:"#bbb", cursor:"pointer" }}>✕</button>
        </div>

        {/* ============ CORPORATE INVOICE BODY ============ */}
        <div id="invoice-print-area" style={{
          width: "210mm",
          minHeight: "297mm",
          maxHeight: "297mm",
          boxSizing: "border-box",
          padding: "40px 48px",
          background: "#fff",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
          margin: "0 auto",
          color: "#0F172A",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: "12px",
          lineHeight: 1.5,
        }}>

          {/* === A. TOP HEADER GRID: Logo+Address (Left) | Invoice Metadata (Right) === */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "32px", paddingBottom: "24px", marginBottom: "24px", borderBottom: "1px solid #E2E8F0" }}>
            {/* Left: Company Logo + Address */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <img src={companyLogo} alt="PaintShip" crossOrigin="anonymous" style={{ height: 42, width: "auto", objectFit: "contain", flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#0F1E3C", lineHeight: 1.2 }}>{companyName}</div>
                  <div style={{ fontSize: 10, color: "#64748B", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1.4, textTransform: "uppercase" }}>Head Office / Operations</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                <div>{companyAddr}</div>
                <div style={{ marginTop: "4px", fontSize: 10, color: "#64748B" }}>GSTIN: {companyGSTIN} | PAN: {companyPAN}</div>
              </div>
            </div>

            {/* Right: Invoice Metadata Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-end" }}>
              {/* Stage Pill Badge */}
              <div style={{ background: "#EFF6FF", color: "#1E40AF", padding: "4px 12px", borderRadius: "16px", fontSize: 11, fontWeight: 600, display: "inline-block" }}>{currentStage.shortLabel}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "280px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice No</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{data.invoiceNo}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice Date</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{data.date}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Due Date</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{data.dueDate}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Place</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{data.placeOfSupply || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: "#64748B", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Tax</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{data.effectiveGst} @{data.gstPct}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* === B. BILLING METADATA BLOCK === */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "32px" }}>
            <div style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FAFBFC" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0F1E3C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Billed To / Billing Address</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{cust.name || "Valued Client"}</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: "4px" }}>{(customerBillingAddress || cust.address || "Site Address As Per Job Details")}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: "4px" }}>{(cust.location || cust.pincode) ? `${cust.location || ""} ${cust.pincode ? `— ${cust.pincode}` : ""}` : ""}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: "4px" }}>{cust.mobile ? `Mob: ${cust.mobile}` : ""}</div>
            </div>
            <div style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FAFBFC" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0F1E3C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Shipping / Site Address</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Project Site</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: "4px" }}>{(customerShippingAddress || cust.address || "Site Address As Per Job Details")}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: "4px" }}>{(cust.location || cust.pincode) ? `${cust.location || ""} ${cust.pincode ? `— ${cust.pincode}` : ""}` : ""}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: "4px" }}>{cust.mobile ? `Mob: ${cust.mobile}` : ""}</div>
            </div>
          </div>

          {/* Project Details Strip */}
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "32px", fontSize: "12px", color: "#475569" }}>
            <span><b style={{ color: "#0F1E3C" }}>Category:</b> {category}</span>
            <span><b style={{ color: "#0F1E3C" }}>Type:</b> {projectType}</span>
            <span><b style={{ color: "#0F1E3C" }}>Scope:</b> {scope}</span>
            <span><b style={{ color: "#0F1E3C" }}>Total Area:</b> {fmt2(data.grandArea)} sq ft</span>
            <span><b style={{ color: "#0F1E3C" }}>Stage:</b> {currentStage.shortLabel}</span>
          </div>

          {/* === C. ITEMIZED COST TABLE === */}
          <div style={{ marginBottom: "32px", overflowX: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", padding: "8px 12px", background: "#0F1E3C" }}>Itemized Cost Breakdown</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", border: "1px solid #0F1E3C" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["#", "Item / Scope", "Area (sq ft)", "Rate (₹)", "Taxable Value (₹)", "Tax Amount (₹)", "Total Amount (₹)"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Item / Scope" ? "left" : "right", fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1px solid #0F1E3C", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.itemRows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#64748B", border: "1px solid #0F1E3C" }}>No scope data available.</td></tr>
                )}
                {data.itemRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 ? "#FAFBFC" : "#fff" }}>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#64748B", border: "1px solid #F1F5F9" }}>{r.sr}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 500, color: "#0F172A", whiteSpace: "nowrap", border: "1px solid #F1F5F9" }}>{r.item}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#334155", border: "1px solid #F1F5F9" }}>{fmt2(r.area)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#334155", border: "1px solid #F1F5F9" }}>{fmt(r.rate)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#334155", border: "1px solid #F1F5F9" }}>{fmt(r.taxableValue)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#334155", border: "1px solid #F1F5F9" }}>{fmt(r.taxAmount)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#0F172A", border: "1px solid #F1F5F9" }}>{fmt(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* === D. FINANCIAL SUMMARY === */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "32px" }}>
            <div style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FAFBFC" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0F1E3C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "12px" }}>Financial Summary</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>Subtotal</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>₹{fmt(data.subtotal)}</span>
                </div>
                {data.additionalCharges > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>Additional Charges</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>+ ₹{fmt(data.additionalCharges)}</span>
                  </div>
                )}
                {data.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#DC2626" }}>Discount</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#DC2626" }}>− ₹{fmt(data.discountAmount)}</span>
                  </div>
                )}
                <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "6px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>Taxable Amount</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>₹{fmt(data.taxableAmount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{data.effectiveGst} (@{data.gstPct}%)</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>₹{fmt(data.gstAmount)}</span>
                </div>
                {data.isIGST && (
                  <div style={{ fontSize: 11, color: "#64748B", fontStyle: "italic" }}>Integrated GST (Inter-State)</div>
                )}
              </div>
              <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "12px", marginTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Total Project Value</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#0F1E3C" }}>₹{fmt(data.grandTotal)}</span>
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid #0F1E3C", borderRadius: "8px", padding: "16px", background: "#FAFBFC" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 10px", background: "#0F1E3C", display: "inline-block", marginBottom: "12px" }}>Multi-Stage Payment Ledger</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>Total Project Quotation</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>₹{fmt(data.grandTotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>Amount Previously Received</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>₹{fmt(data.totalPreviouslyReceived)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>Current Stage Invoice Due</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F1E3C" }}>₹{fmt(amountDue)}</span>
                </div>
                <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "10px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#DC2626" }}>Remaining Balance</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#DC2626" }}>₹{fmt(Math.max(0, balanceRemaining))}</span>
                </div>
              </div>

              {/* 3-Stage Payment Breakdown Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {data.stages.map((s, i) => {
                  const isActive = !isCustomStage && i === selectedStageIdx;
                  const isCustom = isCustomStage && i === data.stages.length - 1;
                  return (
                    <div key={s.id} style={{ 
                      padding: "10px 8px", 
                      border: `1.5px solid ${isActive || isCustom ? "#0F1E3C" : "#E2E8F0"}`, 
                      borderRadius: "6px",
                      background: isActive || isCustom ? "#F0F9FF" : "#fff",
                      textAlign: "center",
                      cursor: !isCustom ? "pointer" : "default"
                    }} onClick={() => { if (!isCustom) setSelectedStageIdx(i); }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: "#0F1E3C", textTransform: "uppercase", letterSpacing: "0.03em" }}>{s.shortLabel}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>₹{fmt(s.amount)}</div>
                      <div style={{ fontSize: 9, color: "#64748B" }}>{s.pct}%</div>
                      {(isActive || isCustom) && <div style={{ fontSize: 8, fontWeight: 700, color: "#1E40AF", marginTop: "4px", background: "#EFF6FF", display: "inline-block", padding: "2px 6px", borderRadius: "8px" }}>ACTIVE</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div style={{ marginBottom: "24px", padding: "12px 16px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Total Amount in Words (INR)</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{amountInWords}</div>
          </div>

{/* === E. FOOTER: Bank Details | UPI QR | Signatory === */}
          <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "20px", display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "24px", alignItems: "flex-end" }}>
            {/* Bank Details (Left) */}
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0F1E3C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>Bank Details</div>
              <div><span style={{ color: "#64748B", marginRight: "6px" }}>Bank</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{bankName}</span></div>
              <div><span style={{ color: "#64748B", marginRight: "6px" }}>A/C</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{bankAccount}</span></div>
              <div><span style={{ color: "#64748B", marginRight: "6px" }}>IFSC</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{bankIFSC}</span></div>
              <div><span style={{ color: "#64748B", marginRight: "6px" }}>Branch</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{bankBranch}</span></div>
            </div>

            {/* UPI QR Code (Center) */}
            <div style={{ textAlign: "center", padding: "12px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px" }}>
              <div style={{ width: 64, height: 64, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", borderRadius: "4px" }}>
                <svg width="64" height="64" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
                  <rect width="50" height="50" fill="#fff"/>
                  <rect x="2" y="2" width="10" height="10" fill="#0F1E3C"/><rect x="3" y="3" width="8" height="8" fill="#fff"/><rect x="4" y="4" width="6" height="6" fill="#0F1E3C"/><rect x="5" y="5" width="4" height="4" fill="#fff"/><rect x="6" y="6" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="38" y="2" width="10" height="10" fill="#0F1E3C"/><rect x="39" y="3" width="8" height="8" fill="#fff"/><rect x="40" y="4" width="6" height="6" fill="#0F1E3C"/><rect x="41" y="5" width="4" height="4" fill="#fff"/><rect x="42" y="6" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="2" y="38" width="10" height="10" fill="#0F1E3C"/><rect x="3" y="39" width="8" height="8" fill="#fff"/><rect x="4" y="40" width="6" height="6" fill="#0F1E3C"/><rect x="5" y="41" width="4" height="4" fill="#fff"/><rect x="6" y="42" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="6" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="6" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="6" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="6" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="6" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="10" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="10" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="10" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="10" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="10" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="14" width="2" height="2" fill="#fff"/><rect x="22" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="14" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="18" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="22" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="26" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="30" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="30" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="30" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="30" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="30" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="6" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="6" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="6" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="6" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="6" y="30" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="10" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="10" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="10" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="10" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="10" y="30" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="38" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="38" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="38" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="38" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="38" y="30" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="42" y="14" width="2" height="2" fill="#0F1E3C"/><rect x="42" y="18" width="2" height="2" fill="#0F1E3C"/><rect x="42" y="22" width="2" height="2" fill="#0F1E3C"/><rect x="42" y="26" width="2" height="2" fill="#0F1E3C"/><rect x="42" y="30" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="34" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="34" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="34" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="34" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="34" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="38" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="38" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="38" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="38" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="38" width="2" height="2" fill="#0F1E3C"/>
                  <rect x="14" y="42" width="2" height="2" fill="#0F1E3C"/><rect x="18" y="42" width="2" height="2" fill="#0F1E3C"/><rect x="22" y="42" width="2" height="2" fill="#0F1E3C"/><rect x="26" y="42" width="2" height="2" fill="#0F1E3C"/><rect x="30" y="42" width="2" height="2" fill="#0F1E3C"/>
                </svg>
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "0.04em", textTransform: "uppercase" }}>SCAN TO PAY VIA UPI</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#0F1E3C", marginTop: "2px" }}>{upiId}</div>
            </div>

            {/* Authorized Signatory / Digital Stamp (Right) */}
            <div style={{ textAlign: "right" }}>
              {digitalStamp && (
                <div style={{ display: "inline-block", padding: "4px 10px", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: "12px", fontSize: 9, fontWeight: 700, color: "#15803D", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>✓ Digital Stamp</div>
              )}
              <div style={{ borderTop: "1px solid #0F172A", paddingTop: "8px", marginTop: digitalStamp ? "0" : "24px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0F1E3C" }}>Authorized Signatory</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: "2px" }}>{authorizedSignatory || "Authorized Signatory"}</div>
                <div style={{ fontSize: 10, color: "#64748B", marginTop: "2px" }}>{companyName}</div>
                <div style={{ fontSize: 9, color: "#94A3B8", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Project Director</div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "16px", marginTop: "20px", fontSize: 10, color: "#64748B", lineHeight: 1.6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#0F1E3C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Terms & Conditions</div>
            <div>Payment due as per the staged schedule above. Work commences upon receipt of advance payment. Any additional scope will be billed separately. This is a computer-generated invoice and does not require a signature.</div>
          </div>
        </div>

        {/* ============ INVOICE CONFIG PANEL (Team Controls) ============ */}
        <div className="no-print" style={{ borderTop:`1px solid ${C.border}`, padding:"18px 24px", background:"#FAFBFC" }}>
          <div style={{ fontSize:12, fontWeight:800, color:C.navy, marginBottom:"14px", letterSpacing:"0.02em" }}>⚙ Invoice Config Panel — Team Controls</div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:"12px", marginBottom:"14px" }}>
            {/* Stage Selection */}
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Payment Stage</label>
              <select value={isCustomStage ? "custom" : String(selectedStageIdx)} onChange={e => handleStageChange(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, outline:"none", background:"#FAFAFA", color:"#1E293B", fontWeight:600, boxSizing:"border-box" }}>
                {DEFAULT_STAGES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                <option value="custom">Custom Stage</option>
              </select>
            </div>

            {/* Invoice Number Input */}
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Invoice Number <span style={{ color:"#64748B", fontWeight:400, fontSize:8 }}>(auto-generated, editable)</span></label>
              <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder={data.invoiceNo} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, outline:"none", background:"#FAFAFA", color:"#1E293B", fontWeight:600, boxSizing:"border-box" }} />
            </div>

            {/* Invoice Date */}
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, outline:"none", background:"#FAFAFA", color:"#1E293B", boxSizing:"border-box" }} />
            </div>

            {/* Payment Due Date */}
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Payment Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, outline:"none", background:"#FAFAFA", color:"#1E293B", boxSizing:"border-box" }} />
            </div>

            {/* Place of Supply */}
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Place of Supply</label>
              <input type="text" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, outline:"none", background:"#FAFAFA", color:"#1E293B", fontWeight:600, boxSizing:"border-box" }} />
            </div>

            {/* Payment Status */}
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Payment Status</label>
              <div style={{ display:"flex", gap:"4px" }}>
                {PAYMENT_STATUS_OPTIONS.map(status => (
                  <button key={status} onClick={() => setPaymentStatus(status)} style={{ flex:1, padding:"6px 4px", border:`1.5px solid ${paymentStatus === status ? C.navy : C.border}`, borderRadius:6, fontSize:9, fontWeight:700, cursor:"pointer", background: paymentStatus === status ? C.navy : "#FAFAFA", color: paymentStatus === status ? "#fff" : "#1E293B", transition:"all 0.15s" }}>{status}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Stage Inputs */}
          {isCustomStage && (
            <div style={{ background:"#F8FAFC", border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 16px", marginBottom:"12px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.navy, marginBottom:"8px" }}>Custom Stage Configuration</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                <div>
                  <label style={{ fontSize:9, color:"#64748B", marginBottom:"3px", display:"block" }}>Percentage (%)</label>
                  <input type="number" min="0" max="100" value={customPercentage} onChange={e => handleCustomPercentage(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:6, padding:"6px 8px", fontSize:13, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize:9, color:"#64748B", marginBottom:"3px", display:"block" }}>Amount (₹)</label>
                  <input type="number" min="0" value={customAmount} onChange={e => handleCustomAmount(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:6, padding:"6px 8px", fontSize:13, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
                </div>
              </div>
            </div>
          )}

          {/* Previously Received Amount & Status */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:"#64748B", letterSpacing:"0.05em", textTransform:"uppercase", display:"block", marginBottom:"4px" }}>Amount Previously Received</label>
              <input type="number" min="0" value={previouslyReceived} onChange={e => handlePreviouslyReceived(e.target.value)} style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13, outline:"none", background:"#FAFAFA", color:"#1E293B", fontWeight:600, boxSizing:"border-box" }} />
            </div>
            <div style={{ display:"flex", alignItems:"flex-end" }}>
              <button onClick={handlePaymentStatusSet} style={{ width:"100%", padding:"8px 16px", background:C.navy, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>Update Payment Status</button>
            </div>
          </div>

          {/* Company & Bank Details Config */}
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:"12px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.navy, marginBottom:"8px", letterSpacing:"0.03em" }}>Company & Bank Configuration</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:"10px" }}>
            {/* Company Name Control */}
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>Company Name</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="PaintShip Services" style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>Company Address</label>
                <input type="text" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder={companyAddr} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>GSTIN</label>
                <input type="text" value={companyGSTIN} onChange={e => setCompanyGSTIN(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>PAN</label>
                <input type="text" value={companyPAN} onChange={e => setCompanyPAN(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>Bank Name</label>
                <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>A/C Number</label>
                <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>IFSC Code</label>
                <input type="text" value={bankIFSC} onChange={e => setBankIFSC(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>UPI ID</label>
                <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:8, color:"#64748B", marginBottom:"2px", display:"block" }}>Authorized Signatory</label>
                <input type="text" value={authorizedSignatory} onChange={e => setAuthorizedSignatory(e.target.value)} placeholder="Name" style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", fontSize:11, outline:"none", background:"#FAFAFA", boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"flex", alignItems:"flex-end" }}>
                <label style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:11, color:"#1E293B", cursor:"pointer" }}>
                  <input type="checkbox" checked={digitalStamp} onChange={e => setDigitalStamp(e.target.checked)} /> Digital Stamp Applied
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="no-print" style={{ borderTop:`1px solid ${C.border}`, padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            <span style={{ fontSize:10, color:"#64748B" }}>Status: <b style={{ color: paymentStatus==="PAID" ? C.green : paymentStatus==="PARTIALLY PAID" ? C.orange : C.red }}>{paymentStatus}</b></span>
            <span style={{ fontSize:10, color:"#64748B" }}>Stage: <b style={{ color:C.navy }}>{currentStage.shortLabel}</b></span>
          </div>
          <div style={{ display:"flex", gap:"8px" }}>
            <button onClick={onClose} style={{ padding:"10px 18px", background:"#F0F4F8", color:C.navy, border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>Close</button>
            <button onClick={() => window.print()} style={{ padding:"10px 20px", background:C.navy, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>🖨 Print / Download PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, color, bold, border }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:border?"5px 0":"2px 0", borderTop:border?`1px solid ${C.border}`:"none" }}>
      <span style={{ fontSize:11, color:color||"#1E293B", fontWeight:bold?"700":"500" }}>{label}</span>
      <span style={{ fontSize:11, color:color||C.navy, fontWeight:bold?"800":"600" }}>{value}</span>
    </div>
  );
}

function LedgerRow({ label, value, bold, color }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px dashed ${C.border}` }}>
      <span style={{ fontSize:11, color:color||"#1E293B", fontWeight:bold?"800":"600" }}>{label}</span>
      <span style={{ fontSize:12, color:color||C.navy, fontWeight:bold?"900":"700" }}>{value}</span>
    </div>
  );
}
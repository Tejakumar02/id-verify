import { useState, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCEPTED_TYPES = ["image/jpeg","image/png","image/webp","image/bmp","image/tiff"];
const ACCEPTED_EXT   = [".jpg",".jpeg",".png",".webp",".bmp",".tiff"];

const RISK_CONFIG = {
  GENUINE:     { label:"Genuine",     color:"#00e676", bg:"rgba(0,230,118,0.10)",    border:"#00e676", icon:"✓" },
  LOW_RISK:    { label:"Low Risk",    color:"#69f0ae", bg:"rgba(105,240,174,0.10)",  border:"#69f0ae", icon:"◎" },
  MEDIUM_RISK: { label:"Medium Risk", color:"#ffd740", bg:"rgba(255,215,64,0.10)",   border:"#ffd740", icon:"⚠" },
  HIGH_RISK:   { label:"High Risk",   color:"#ff6d00", bg:"rgba(255,109,0,0.10)",    border:"#ff6d00", icon:"⛔" },
  CRITICAL:    { label:"Critical",    color:"#ff1744", bg:"rgba(255,23,68,0.10)",    border:"#ff1744", icon:"☠" },
  INFO:        { label:"Not an ID",   color:"#82b1ff", bg:"rgba(130,177,255,0.10)",  border:"#82b1ff", icon:"ℹ" },
};

const STATUS_CONFIG = {
  PASS: { color:"#00e676", icon:"✓", label:"Pass" },
  WARN: { color:"#ffd740", icon:"⚠", label:"Warn" },
  FAIL: { color:"#ff1744", icon:"✗", label:"Fail" },
  INFO: { color:"#82b1ff", icon:"ℹ", label:"Info" },
};

const STEPS = [
  "Validating image type & integrity…",
  "Extracting visual features…",
  "Running forgery detection checks…",
  "Analyzing security features…",
  "Generating fraud risk report…",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clientValidate(file) {
  const mime = ACCEPTED_TYPES.includes(file.type);
  const ext  = ACCEPTED_EXT.includes(file.name.toLowerCase().slice(file.name.lastIndexOf(".")));
  if (!mime && !ext)
    return { valid:false, reason:`Unsupported file type. Please upload JPEG, PNG, WEBP, BMP or TIFF.` };
  if (file.size > 10 * 1024 * 1024)
    return { valid:false, reason:"File exceeds 10 MB limit." };
  return { valid:true };
}

async function callAPI(file) {
  const form = new FormData();
  form.append("document", file);
  const res  = await fetch("/api/analyze", { method:"POST", body:form });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Analysis failed");
  return data.report;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function RiskBadge({ risk, score }) {
  const c = RISK_CONFIG[risk] || RISK_CONFIG.INFO;
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:10,
      background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:8, padding:"10px 20px" }}>
      <span style={{ fontSize:22, color:c.color }}>{c.icon}</span>
      <div>
        <div style={{ color:c.color, fontFamily:"'Courier Prime',monospace",
          fontSize:18, fontWeight:700, letterSpacing:2 }}>{c.label.toUpperCase()}</div>
        <div style={{ color:"#666", fontSize:11, fontFamily:"monospace" }}>CONFIDENCE: {score}%</div>
      </div>
    </div>
  );
}

function ConfidenceBar({ score, risk }) {
  const c = RISK_CONFIG[risk] || RISK_CONFIG.INFO;
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ color:"#444", fontSize:10, fontFamily:"monospace", letterSpacing:1 }}>CONFIDENCE SCORE</span>
        <span style={{ color:c.color, fontSize:10, fontFamily:"monospace" }}>{score}/100</span>
      </div>
      <div style={{ height:4, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${score}%`,
          background:`linear-gradient(90deg,${c.color}88,${c.color})`,
          borderRadius:2, transition:"width 1s ease" }} />
      </div>
    </div>
  );
}

function CheckRow({ check, idx }) {
  const s = STATUS_CONFIG[check.status] || STATUS_CONFIG.INFO;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"28px 1fr auto", gap:12,
      padding:"12px 0", borderBottom:"1px solid rgba(255,255,255,0.04)",
      animation:`fadeIn 0.3s ease ${idx*0.04}s both` }}>
      <div style={{ width:28, height:28, borderRadius:6, background:`${s.color}15`,
        border:`1px solid ${s.color}40`, display:"flex", alignItems:"center",
        justifyContent:"center", color:s.color, fontSize:12, flexShrink:0 }}>{s.icon}</div>
      <div>
        <div style={{ color:"#ccc", fontSize:12, fontFamily:"monospace", fontWeight:600, marginBottom:2 }}>
          {check.name}
          <span style={{ color:"#444", marginLeft:8, fontSize:10 }}>{check.category}</span>
        </div>
        <div style={{ color:"#666", fontSize:11, lineHeight:1.5 }}>{check.detail}</div>
      </div>
      <div style={{ color:s.color, fontSize:10, fontFamily:"monospace", fontWeight:700,
        letterSpacing:1, whiteSpace:"nowrap", alignSelf:"flex-start", paddingTop:6 }}>{s.label}</div>
    </div>
  );
}

function ListSection({ title, items, color, icon }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ color:"#444", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:10 }}>
        {icon} {title}
      </div>
      {items.map((item,i) => (
        <div key={i} style={{ display:"flex", gap:8, color:"#999", fontSize:12,
          lineHeight:1.5, marginBottom:6, alignItems:"flex-start" }}>
          <span style={{ color, flexShrink:0 }}>▸</span><span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function MetaTag({ label, value }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <div style={{ color:"#333", fontSize:9, fontFamily:"monospace", letterSpacing:1 }}>{label}</div>
      <div style={{ color:"#666", fontSize:11, fontFamily:"monospace" }}>{value}</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stage,         setStage]         = useState("upload");
  const [dragOver,      setDragOver]      = useState(false);
  const [previewURL,    setPreviewURL]    = useState(null);
  const [report,        setReport]        = useState(null);
  const [errorMsg,      setErrorMsg]      = useState("");
  const [analysisStep,  setAnalysisStep]  = useState(0);
  const fileInputRef = useRef();

  // ── File processing ──────────────────────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    // Client-side validation first
    setStage("validating");
    await new Promise(r => setTimeout(r, 500));

    const check = clientValidate(file);
    if (!check.valid) { setErrorMsg(check.reason); setStage("error"); return; }

    // Show preview + start animation
    setPreviewURL(URL.createObjectURL(file));
    setStage("analyzing");

    // Animate steps (real work happens in parallel)
    const stepTimer = (async () => {
      for (let i = 0; i < STEPS.length; i++) {
        setAnalysisStep(i);
        await new Promise(r => setTimeout(r, 700 + Math.random()*400));
      }
    })();

    try {
      const [result] = await Promise.all([callAPI(file), stepTimer]);
      setReport(result);
      setStage("result");
    } catch (e) {
      setErrorMsg(e.message);
      setStage("error");
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const reset = () => {
    setStage("upload"); setReport(null); setPreviewURL(null);
    setErrorMsg(""); setAnalysisStep(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── CSS ───────────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    body { background:#080808; }
    @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
    @keyframes scanline{ 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
    @keyframes spin    { to{transform:rotate(360deg)} }
    @keyframes blink   { 0%,49%{opacity:1} 50%,100%{opacity:0} }
    @keyframes glow    { 0%,100%{box-shadow:0 0 12px rgba(255,109,0,0.3)} 50%{box-shadow:0 0 24px rgba(255,109,0,0.6)} }
    .scan { animation:scanline 2.4s linear infinite; }
    .spin { animation:spin 1s linear infinite; display:inline-block; }
    .blink{ animation:blink 1s step-end infinite; }
    ::-webkit-scrollbar{ width:4px }
    ::-webkit-scrollbar-track{ background:#0f0f0f }
    ::-webkit-scrollbar-thumb{ background:#222; border-radius:2px }
    button:hover { filter:brightness(1.15); }
  `;

  const shell = { minHeight:"100vh", background:"#080808",
    fontFamily:"'DM Sans',sans-serif", color:"#ddd" };
  const wrap  = { maxWidth:780, margin:"0 auto", padding:"32px 20px 80px" };
  const card  = { background:"#101010", border:"1px solid #1a1a1a",
    borderRadius:12, padding:28, marginBottom:16 };

  // ── Header ────────────────────────────────────────────────────────────────────
  const Header = () => (
    <div style={{ marginBottom:36, animation:"fadeIn 0.4s ease" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
        <div style={{ width:40, height:40, borderRadius:10,
          background:"linear-gradient(135deg,#ff6d00,#ff1744)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, animation:"glow 3s ease infinite" }}>🔍</div>
        <div>
          <div style={{ fontFamily:"'Courier Prime',monospace", fontSize:20,
            fontWeight:700, color:"#fff", letterSpacing:3 }}>ID·VERIFY</div>
          <div style={{ fontSize:9, color:"#333", fontFamily:"monospace", letterSpacing:2 }}>
            DOCUMENT AUTHENTICITY ENGINE v1.0
          </div>
        </div>
        <div style={{ marginLeft:"auto", background:"rgba(0,230,118,0.08)",
          border:"1px solid rgba(0,230,118,0.2)", borderRadius:20,
          padding:"4px 12px", fontSize:9, fontFamily:"monospace",
          color:"#00e676", letterSpacing:1 }}>● ONLINE</div>
      </div>
      <div style={{ height:1, background:"linear-gradient(90deg,#ff6d0044,transparent)", marginTop:16 }} />
    </div>
  );

  // ── Upload ────────────────────────────────────────────────────────────────────
  const UploadView = () => (
    <div style={{ animation:"fadeIn 0.4s ease" }}>
      <div style={card}>
        <div style={{ color:"#333", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:20 }}>
          STEP 01 — UPLOAD DOCUMENT
        </div>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true)}}
             onDragLeave={()=>setDragOver(false)}
             onDrop={handleDrop}
             onClick={()=>fileInputRef.current?.click()}
             style={{ border:`2px dashed ${dragOver?"#ff6d00":"#1e1e1e"}`,
               borderRadius:10, padding:"52px 24px", textAlign:"center",
               cursor:"pointer", background:dragOver?"rgba(255,109,0,0.04)":"transparent",
               transition:"all 0.2s" }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🪪</div>
          <div style={{ color:"#ccc", fontSize:15, fontWeight:500, marginBottom:6 }}>
            Drop your ID document here
          </div>
          <div style={{ color:"#333", fontSize:12, marginBottom:22 }}>or click to browse</div>
          <div style={{ display:"inline-block", background:"rgba(255,109,0,0.1)",
            border:"1px solid rgba(255,109,0,0.35)", borderRadius:6,
            padding:"9px 24px", color:"#ff6d00", fontSize:12,
            fontFamily:"monospace", fontWeight:700, letterSpacing:1 }}>SELECT FILE</div>
          <div style={{ marginTop:16, color:"#222", fontSize:10, fontFamily:"monospace" }}>
            JPEG · PNG · WEBP · BMP · TIFF &nbsp;·&nbsp; MAX 10 MB
          </div>
        </div>
        <input ref={fileInputRef} type="file"
          accept={ACCEPTED_TYPES.join(",")}
          style={{ display:"none" }} onChange={e=>{ const f=e.target.files[0]; if(f) processFile(f); }} />
      </div>

      {/* Feature grid */}
      <div style={{ ...card, background:"#0c0c0c" }}>
        <div style={{ color:"#282828", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:16 }}>
          FORENSIC CHECKS PERFORMED
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[["🔤","Font & Text Integrity"],["🌈","Color Consistency"],
            ["📸","Photo Authentication"],["🔒","Security Features"],
            ["📐","Layout Validation"],["🔬","Digital Artifact Detection"],
            ["📏","Edge & Border Check"],["🧮","ID Number Patterns"]
          ].map(([icon,label])=>(
            <div key={label} style={{ display:"flex", alignItems:"center",
              gap:8, color:"#333", fontSize:11 }}>
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Validating ────────────────────────────────────────────────────────────────
  const ValidatingView = () => (
    <div style={{ ...card, textAlign:"center", padding:52, animation:"fadeIn 0.3s ease" }}>
      <div style={{ fontSize:34, marginBottom:16 }}>🔎</div>
      <div style={{ fontFamily:"'Courier Prime',monospace", color:"#ffd740",
        fontSize:14, letterSpacing:2 }}>VALIDATING FILE<span className="blink">_</span></div>
      <div style={{ color:"#333", fontSize:11, fontFamily:"monospace", marginTop:8 }}>
        Checking image type, extension & file size…
      </div>
    </div>
  );

  // ── Analyzing ─────────────────────────────────────────────────────────────────
  const AnalyzingView = () => (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      {previewURL && (
        <div style={{ ...card, padding:0, overflow:"hidden", marginBottom:16 }}>
          <div style={{ position:"relative" }}>
            <img src={previewURL} alt="document"
              style={{ width:"100%", maxHeight:260, objectFit:"contain",
                display:"block", background:"#000", opacity:0.5 }} />
            <div className="scan" style={{ position:"absolute", top:0, left:0, right:0,
              height:3, background:"linear-gradient(180deg,transparent,#00e5ffaa,transparent)",
              pointerEvents:"none" }} />
            <div style={{ position:"absolute", inset:0,
              background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,229,255,0.012) 3px,rgba(0,229,255,0.012) 4px)",
              pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:12, left:12,
              background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)",
              borderRadius:4, padding:"4px 10px", fontFamily:"monospace",
              fontSize:10, color:"#00e5ff", letterSpacing:1 }}>
              SCANNING<span className="blink">_</span>
            </div>
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ color:"#333", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:20 }}>
          STEP 02 — AI FORENSIC ANALYSIS
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {STEPS.map((step,i)=>{
            const done   = i < analysisStep;
            const active = i === analysisStep;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
                  background: done?"rgba(0,230,118,0.12)":active?"rgba(0,229,255,0.08)":"rgba(255,255,255,0.02)",
                  border:`1.5px solid ${done?"#00e676":active?"#00e5ff":"#1e1e1e"}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:done?"#00e676":active?"#00e5ff":"#333", fontSize:11 }}>
                  {done?"✓":active?<span className="spin" style={{ fontSize:10 }}>◌</span>:"○"}
                </div>
                <div style={{ color:done?"#444":active?"#ddd":"#222",
                  fontSize:12, fontFamily:"monospace", transition:"color 0.3s" }}>{step}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Error ─────────────────────────────────────────────────────────────────────
  const ErrorView = () => (
    <div style={{ ...card, textAlign:"center", padding:44, animation:"fadeIn 0.3s ease" }}>
      <div style={{ fontSize:34, marginBottom:12 }}>⚠️</div>
      <div style={{ fontFamily:"'Courier Prime',monospace", color:"#ff1744", fontSize:14, marginBottom:12 }}>
        ERROR
      </div>
      <div style={{ color:"#666", fontSize:13, maxWidth:400, margin:"0 auto 28px", lineHeight:1.6 }}>
        {errorMsg}
      </div>
      <button onClick={reset} style={{ background:"rgba(255,23,68,0.1)",
        border:"1px solid rgba(255,23,68,0.3)", borderRadius:6,
        padding:"10px 28px", color:"#ff1744", fontSize:12,
        fontFamily:"monospace", fontWeight:700, letterSpacing:1, cursor:"pointer" }}>
        ↩ TRY AGAIN
      </button>
    </div>
  );

  // ── Result ────────────────────────────────────────────────────────────────────
  const ResultView = () => {
    if (!report) return null;
    const risk = report.overallRisk || "INFO";
    const cfg  = RISK_CONFIG[risk] || RISK_CONFIG.INFO;
    const meta = report._meta || {};

    const passCnt = (report.checks||[]).filter(c=>c.status==="PASS").length;
    const warnCnt = (report.checks||[]).filter(c=>c.status==="WARN").length;
    const failCnt = (report.checks||[]).filter(c=>c.status==="FAIL").length;

    return (
      <div style={{ animation:"fadeIn 0.4s ease" }}>

        {/* ── Risk header ── */}
        <div style={{ ...card, borderColor:`${cfg.border}33` }}>
          <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap",
            gap:12, marginBottom:16 }}>
            <div>
              <div style={{ color:"#2a2a2a", fontSize:10, fontFamily:"monospace",
                letterSpacing:2, marginBottom:8 }}>FRAUD DETECTION REPORT</div>
              <RiskBadge risk={risk} score={report.confidenceScore||0} />
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:"#2a2a2a", fontSize:9, fontFamily:"monospace", marginBottom:4 }}>DOCUMENT TYPE</div>
              <div style={{ color:"#888", fontSize:12, fontFamily:"monospace" }}>{report.documentType||"Unknown"}</div>
            </div>
          </div>

          <ConfidenceBar score={report.confidenceScore||0} risk={risk} />

          <div style={{ marginTop:16, padding:14,
            background:`${cfg.color}06`, border:`1px solid ${cfg.color}20`,
            borderRadius:8, color:"#999", fontSize:13, lineHeight:1.7 }}>
            {report.summary}
          </div>

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:16 }}>
            {[["PASSED",passCnt,"#00e676"],["WARNINGS",warnCnt,"#ffd740"],["FAILED",failCnt,"#ff1744"]].map(
              ([lbl,val,col])=>(
                <div key={lbl} style={{ background:`${col}08`, border:`1px solid ${col}20`,
                  borderRadius:8, padding:"10px 14px", textAlign:"center" }}>
                  <div style={{ color:col, fontSize:24, fontFamily:"monospace", fontWeight:700 }}>{val}</div>
                  <div style={{ color:"#333", fontSize:9, fontFamily:"monospace", letterSpacing:1 }}>{lbl}</div>
                </div>
              )
            )}
          </div>
        </div>

        {/* ── Checks ── */}
        <div style={card}>
          <div style={{ color:"#333", fontSize:10, fontFamily:"monospace",
            letterSpacing:2, marginBottom:16 }}>
            DETAILED CHECKS — {(report.checks||[]).length} ITEMS
          </div>
          {(report.checks||[]).map((c,i)=><CheckRow key={i} check={c} idx={i} />)}
        </div>

        {/* ── Findings ── */}
        {((report.redFlags?.length>0)||(report.positiveSignals?.length>0)) && (
          <div style={card}>
            <div style={{ color:"#333", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:16 }}>
              FINDINGS SUMMARY
            </div>
            <ListSection title="RED FLAGS"          items={report.redFlags}       color="#ff1744" icon="🚩" />
            <ListSection title="AUTHENTIC INDICATORS" items={report.positiveSignals} color="#00e676" icon="✅" />
          </div>
        )}

        {/* ── Recommendations ── */}
        {report.recommendations?.length>0 && (
          <div style={card}>
            <div style={{ color:"#333", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:16 }}>
              RECOMMENDED ACTIONS
            </div>
            <ListSection title="" items={report.recommendations} color="#ffd740" icon="📋" />
          </div>
        )}

        {/* ── Meta ── */}
        <div style={{ ...card, background:"#0c0c0c" }}>
          <div style={{ color:"#222", fontSize:10, fontFamily:"monospace", letterSpacing:2, marginBottom:14 }}>
            ANALYSIS METADATA
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:16, marginBottom:14 }}>
            <MetaTag label="FILENAME"   value={meta.filename||"—"} />
            <MetaTag label="FILE SIZE"  value={meta.fileSizeKB ? `${meta.fileSizeKB} KB` : "—"} />
            <MetaTag label="DIMENSIONS" value={meta.dimensions||"—"} />
            <MetaTag label="AI PROVIDER" value={(meta.aiProvider||"—").toUpperCase()} />
            <MetaTag label="DURATION"   value={meta.durationMs ? `${meta.durationMs}ms` : "—"} />
            <MetaTag label="ANALYZED"   value={meta.analyzedAt ? new Date(meta.analyzedAt).toLocaleTimeString() : "—"} />
          </div>
          {report.metaAnalysis && (
            <>
              <div style={{ color:"#222", fontSize:9, fontFamily:"monospace", letterSpacing:1, marginBottom:4 }}>
                IMAGE QUALITY
              </div>
              <div style={{ color:"#555", fontSize:11, marginBottom:10 }}>
                {report.metaAnalysis.imageQuality} — {report.metaAnalysis.imageQualityNote}
              </div>
              <div style={{ color:"#222", fontSize:9, fontFamily:"monospace", letterSpacing:1, marginBottom:4 }}>
                ANALYSIS LIMITATIONS
              </div>
              <div style={{ color:"#444", fontSize:11, lineHeight:1.6 }}>
                {report.metaAnalysis.analysisLimitations}
              </div>
            </>
          )}
        </div>

        {/* ── Preview + reset ── */}
        <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
          {previewURL && (
            <img src={previewURL} alt="document"
              style={{ height:72, borderRadius:6, border:"1px solid #1a1a1a",
                objectFit:"cover", opacity:0.5 }} />
          )}
          <button onClick={reset} style={{ background:"rgba(255,255,255,0.03)",
            border:"1px solid #1a1a1a", borderRadius:6, padding:"10px 22px",
            color:"#555", fontSize:11, fontFamily:"monospace",
            fontWeight:700, letterSpacing:1, cursor:"pointer" }}>
            ↩ ANALYZE ANOTHER
          </button>
        </div>

        <div style={{ marginTop:24, padding:12, background:"rgba(255,255,255,0.015)",
          borderRadius:8, color:"#222", fontSize:10, fontFamily:"monospace", lineHeight:1.7 }}>
          ⚠ DISCLAIMER: This tool provides AI-assisted analysis for preliminary screening only.
          Results are not legally binding and must not replace professional verification by trained personnel.
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={shell}>
      <style>{css}</style>
      <div style={wrap}>
        <Header />
        {stage==="upload"     && <UploadView />}
        {stage==="validating" && <ValidatingView />}
        {stage==="analyzing"  && <AnalyzingView />}
        {stage==="error"      && <ErrorView />}
        {stage==="result"     && <ResultView />}
      </div>
    </div>
  );
}

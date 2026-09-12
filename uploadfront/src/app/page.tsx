"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────
interface UploadedFile {
  file: File;
  id: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface ExtractionResult {
  normal?: Record<string, unknown> | Record<string, unknown>[];
  csv_file?: unknown;
}

// ─── Sidebar nav structure (mirrors VYOM+ console) ─────────────────────────
const NAV_ITEMS = [
  { href: "#", icon: "ti-user-circle", label: "My Profile", tooltip: "My Profile", section: "Account" },
  { href: "#", icon: "ti-layout-dashboard", label: "Overview", tooltip: "Overview", section: "Console" },
  { href: "#", icon: "ti-receipt-2", label: "Vouchers", tooltip: "Vouchers" },
  { href: "#", icon: "ti-building-bank", label: "Bank Statements", tooltip: "Bank Statements" },
  { href: "#", icon: "ti-package", label: "Inventory", tooltip: "Inventory" },
  { href: "#", icon: "ti-file-invoice", label: "Billing & Invoicing", tooltip: "Billing & Invoicing" },
  { href: "#", icon: "ti-arrows-exchange", label: "Reconciliations", tooltip: "Reconciliations" },
  { href: "#", icon: "ti-chart-bar", label: "Reports", tooltip: "Reports" },
  { href: "#", icon: "ti-cloud-upload", label: "Upload Invoice", tooltip: "Upload Invoice", section: "Tools", active: true },
  { href: "#", icon: "ti-settings", label: "Settings", tooltip: "Settings" },
];

// ─── Background Canvas ──────────────────────────────────────────────────────
function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    let angle = 0;
    let mouseX = w / 2;
    let mouseY = h / 2;
    let animId: number;

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    const onMouse = (e: MouseEvent) => {
      mouseX += (e.clientX - mouseX) * 0.05;
      mouseY += (e.clientY - mouseY) * 0.05;
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouse);

    function drawMandala(cx: number, cy: number, radius: number, petLength: number, petals: number, complexity: number) {
      ctx!.beginPath();
      for (let i = 0; i < petals * complexity; i++) {
        const theta = (i * Math.PI * 2) / (petals * complexity) + angle;
        let r = radius + Math.sin(theta * petals) * petLength;
        r += Math.cos(theta * 3 + (mouseX / w) * 10) * 15;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.closePath();
      ctx!.stroke();
    }

    function animate() {
      ctx!.clearRect(0, 0, w, h);
      const style = getComputedStyle(document.documentElement);
      const bg1 = style.getPropertyValue("--color-canvas-bg-1").trim() || "#0c152b";
      const bg2 = style.getPropertyValue("--color-canvas-bg-2").trim() || "#060913";
      const gradient = ctx!.createRadialGradient(mouseX, mouseY, 50, w / 2, h / 2, Math.max(w, h));
      gradient.addColorStop(0, bg1);
      gradient.addColorStop(1, bg2);
      ctx!.fillStyle = gradient;
      ctx!.fillRect(0, 0, w, h);

      angle += 0.001;
      const cx = w / 2, cy = h / 2;

      ctx!.strokeStyle = "rgba(37, 99, 235, 0.08)";
      ctx!.lineWidth = 1.5;
      drawMandala(cx, cy, 250, 45, 12, 4);
      ctx!.strokeStyle = "rgba(16, 185, 129, 0.06)";
      ctx!.lineWidth = 1.0;
      drawMandala(cx, cy, 180, 30, 8, 3);
      ctx!.strokeStyle = "rgba(245, 158, 11, 0.04)";
      ctx!.lineWidth = 1.0;
      drawMandala(cx, cy, 100, 15, 6, 2);

      ctx!.fillStyle = "rgba(255, 255, 255, 0.02)";
      for (let i = 0; i < 40; i++) {
        const pX = Math.sin(angle * (i + 1) * 0.1) * (w / 3) + cx;
        const pY = Math.cos(angle * (i + 1) * 0.1) * (h / 3) + cy;
        ctx!.beginPath();
        ctx!.arc(pX, pY, 2 + (i % 3), 0, Math.PI * 2);
        ctx!.fill();
      }
      animId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return <canvas ref={canvasRef} id="bg-canvas" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: -1, pointerEvents: "none", opacity: 0.85 }} />;
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <>
      <nav className={`sidebar${collapsed ? " collapsed" : ""}`} id="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #2563EB, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>V+</div>
          </div>
          <div className="sidebar-brand-text">
            <h2>VYOM+</h2>
            <p>Financial Analytics Suite</p>
          </div>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map((item, idx) => {
            const prevSection = idx > 0 ? NAV_ITEMS[idx - 1].section : null;
            return (
              <div key={idx}>
                {item.section && item.section !== prevSection && (
                  <div className="nav-section-label" style={idx > 0 ? { marginTop: 8 } : undefined}>
                    {item.section}
                  </div>
                )}
                <a
                  href={item.href}
                  className={`nav-item${item.active ? " active" : ""}`}
                  data-tooltip={item.tooltip}
                >
                  <i className={`ti ${item.icon} nav-icon`}></i>
                  <span className="nav-label">{item.label}</span>
                </a>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <a href="#" className="sidebar-user">
            <div className="sidebar-avatar">JD</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">Jane Doe</div>
              <div className="sidebar-user-role">CFO · Apex Retailers</div>
            </div>
          </a>
        </div>
      </nav>

      <button
        className="sidebar-toggle"
        id="sidebar-toggle"
        onClick={onToggle}
        style={{ left: collapsed ? "calc(68px - 16px)" : "calc(260px - 16px)" }}
      >
        <i className={`ti ${collapsed ? "ti-chevron-right" : "ti-chevron-left"}`}></i>
      </button>
    </>
  );
}

// ─── File Row ───────────────────────────────────────────────────────────────
function FileRow({ uf, onRemove }: { uf: UploadedFile; onRemove: (id: string) => void }) {
  const ext = uf.file.name.split(".").pop()?.toUpperCase() || "FILE";
  const size = uf.file.size < 1024 * 1024
    ? `${(uf.file.size / 1024).toFixed(1)} KB`
    : `${(uf.file.size / 1024 / 1024).toFixed(2)} MB`;

  const statusColor = { pending: "#94a3b8", uploading: "#2563EB", done: "#10B981", error: "#EF4444" }[uf.status];
  const statusIcon  = { pending: "ti-clock", uploading: "ti-loader-2", done: "ti-circle-check-filled", error: "ti-circle-x" }[uf.status];
  const statusText  = { pending: "Pending", uploading: `Uploading… ${uf.progress}%`, done: "Uploaded", error: uf.error || "Error" }[uf.status];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 18px",
      background: "var(--color-bg-card)",
      border: "1px solid var(--color-border)",
      borderRadius: 12,
      transition: "border-color 0.2s",
      animation: "fadeInUp 0.25s ease both",
    }}>
      {/* File type badge */}
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: "rgba(37,99,235,0.12)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        <i className="ti ti-file" style={{ fontSize: 18, color: "#2563EB" }}></i>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#2563EB", letterSpacing: "0.04em" }}>{ext}</span>
      </div>

      {/* Name + size */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uf.file.name}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{size}</div>
        {uf.status === "uploading" && (
          <div style={{ marginTop: 6, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${uf.progress}%`, background: "linear-gradient(90deg,#2563EB,#3b82f6)", borderRadius: 99, transition: "width 0.3s ease" }} />
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <i className={`ti ${statusIcon}`} style={{ fontSize: 15, color: statusColor, animation: uf.status === "uploading" ? "spin 1s linear infinite" : undefined }}></i>
        <span style={{ fontSize: 12, color: statusColor, fontWeight: 500 }}>{statusText}</span>
      </div>

      {/* Remove */}
      {uf.status !== "uploading" && (
        <button
          onClick={() => onRemove(uf.id)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: "4px 6px", borderRadius: 6, transition: "color 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          <i className="ti ti-x" style={{ fontSize: 15 }}></i>
        </button>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function Home() {
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [activeTab, setActiveTab] = useState<"normal" | "csv">("normal");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const BACKEND_URL = "http://localhost:8000";

  // Theme init from localStorage
  useEffect(() => {
    const t = localStorage.getItem("gst_theme") || "dark";
    setIsDark(t !== "light");
    const saved = localStorage.getItem("sidebar_collapsed") === "true";
    setCollapsed(saved);
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light-mode");
      document.body.classList.remove("sidebar-collapsed");
    } else {
      document.documentElement.classList.add("light-mode");
    }
    localStorage.setItem("gst_theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
    if (next) document.body.classList.add("sidebar-collapsed");
    else document.body.classList.remove("sidebar-collapsed");
  };

  // Add files helper
  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: UploadedFile[] = Array.from(fileList).map(f => ({
      file: f,
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      status: "pending",
      progress: 0,
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setResult(null);
  }, []);

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Drag handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  // Upload & Extract
  const handleUpload = async () => {
    const pending = uploadedFiles.filter(f => f.status === "pending");
    if (!pending.length) { alert("No pending files to upload."); return; }

    setLoading(true);
    setResult(null);
    const fileKeys: string[] = [];
    const fileTypes: string[] = [];

    for (const uf of pending) {
      setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: "uploading", progress: 10 } : f));
      try {
        const uploadRes = await fetch(`${BACKEND_URL}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_name: uf.file.name, content_type: uf.file.type || "application/pdf" }),
        });
        if (!uploadRes.ok) throw new Error(`Failed to get presigned URL for ${uf.file.name}`);

        const uploadData = await uploadRes.json();

        setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, progress: 40 } : f));

        const contentType = uf.file.type || "application/pdf";
        const s3Upload = await fetch(uploadData.upload_url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: uf.file,
        });
        if (!s3Upload.ok) throw new Error(`S3 upload failed for ${uf.file.name}`);

        setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, progress: 80 } : f));
        fileKeys.push(uploadData.file_key);
        fileTypes.push(uf.file.name.split(".").pop()?.toLowerCase() || "pdf");

        setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: "done", progress: 100 } : f));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: "error", error: msg } : f));
      }
    }

    if (fileKeys.length > 0) {
      try {
        const extractRes = await fetch(`${BACKEND_URL}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_keys: fileKeys, file_type: fileTypes }),
        });
        if (!extractRes.ok) throw new Error("Extraction failed");
        const extractData = await extractRes.json();
        setResult(extractData);
      } catch (err) {
        console.error(err);
        alert("Extraction failed. Check console for details.");
      }
    }
    setLoading(false);
  };

  const pendingCount = uploadedFiles.filter(f => f.status === "pending").length;
  const doneCount    = uploadedFiles.filter(f => f.status === "done").length;
  const errorCount   = uploadedFiles.filter(f => f.status === "error").length;

  return (
    <>
      <BackgroundCanvas />
      <div className="console-shell">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

        <div className="console-main">
          {/* Top Bar */}
          <div className="console-topbar">
            <div className="topbar-left">
              <div className="topbar-page-title">Upload Invoices</div>
              <div className="topbar-breadcrumb">
                <span>Tools</span>
                <i className="ti ti-chevron-right" style={{ fontSize: 11 }}></i>
                <span>Upload Invoice</span>
              </div>
            </div>
            <div className="topbar-right">
              <button
                className="theme-toggle-btn"
                onClick={() => setIsDark(d => !d)}
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                <i className={`ti ${isDark ? "ti-sun" : "ti-moon"}`}></i>
              </button>
            </div>
          </div>

          {/* Page Content */}
          <div className="console-content">
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              {[
                { label: "Queued", value: pendingCount, icon: "ti-files", color: "#2563EB", bg: "rgba(37,99,235,0.12)" },
                { label: "Uploaded", value: doneCount, icon: "ti-circle-check-filled", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
                { label: "Errors", value: errorCount, icon: "ti-circle-x", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
              ].map(s => (
                <div key={s.label} className="glass-card" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize: 22, color: s.color }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Main Upload Card */}
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
                <i className="ti ti-cloud-upload" style={{ color: "#2563EB", fontSize: 20 }}></i>
                Upload &amp; Extract Documents
              </h3>

              {/* Drop zone */}
              <div
                ref={dropRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? "#2563EB" : "var(--color-border)"}`,
                  borderRadius: 16,
                  padding: "44px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragging ? "rgba(37,99,235,0.06)" : "rgba(255,255,255,0.02)",
                  transition: "all 0.2s ease",
                  marginBottom: 20,
                }}
                onMouseEnter={e => { if (!dragging) { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(37,99,235,0.45)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(37,99,235,0.04)"; }}}
                onMouseLeave={e => { if (!dragging) { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}}
              >
                <div style={{ fontSize: 44, marginBottom: 12, animation: "float 3s ease-in-out infinite", display: "inline-block" }}>
                  <i className="ti ti-cloud-upload" style={{ color: "#2563EB", opacity: 0.75 }}></i>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>
                  Drop files here or <span style={{ color: "#2563EB" }}>browse</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  Supports PDF, JPEG, PNG, XLSX, CSV · Multiple files allowed
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ""; }}}
                />
              </div>

              {/* File list */}
              {uploadedFiles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
                  {uploadedFiles.map(uf => (
                    <FileRow key={uf.id} uf={uf} onRemove={removeFile} />
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  onClick={handleUpload}
                  disabled={loading || pendingCount === 0}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "11px 24px",
                    background: "var(--color-primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 14, fontWeight: 700,
                    cursor: loading || pendingCount === 0 ? "not-allowed" : "pointer",
                    opacity: loading || pendingCount === 0 ? 0.55 : 1,
                    transition: "all 0.2s ease",
                    boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
                  }}
                  onMouseEnter={e => { if (!loading && pendingCount > 0) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(37,99,235,0.4)"; }}}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(37,99,235,0.25)"; }}
                >
                  {loading ? (
                    <><i className="ti ti-loader-2" style={{ animation: "spin 1s linear infinite" }}></i> Processing…</>
                  ) : (
                    <><i className="ti ti-upload"></i> Upload &amp; Extract {pendingCount > 0 ? `(${pendingCount})` : ""}</>
                  )}
                </button>

                {uploadedFiles.length > 0 && !loading && (
                  <button
                    onClick={async () => {
                      setUploadedFiles([]);
                      setResult(null);
                      try {
                        await fetch(`${BACKEND_URL}/clear-extractions`, { method: "POST" });
                      } catch (err) {
                        console.error("Failed to clear backend extractions:", err);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "11px 18px",
                      background: "transparent",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-secondary)",
                      borderRadius: 12, fontSize: 13.5, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.2s ease",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#EF4444"; (e.currentTarget as HTMLButtonElement).style.color = "#EF4444"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)"; }}
                  >
                    <i className="ti ti-trash"></i> Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Extraction Results */}
            {result && (
              <div className="glass-card" style={{ padding: 0, animation: "fadeInUp 0.35s ease" }}>
                {/* Tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 24px" }}>
                  {(["normal", "csv"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: "14px 20px",
                        background: "none", border: "none",
                        borderBottom: activeTab === tab ? "2px solid #2563EB" : "2px solid transparent",
                        color: activeTab === tab ? "#2563EB" : "var(--color-text-muted)",
                        fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                        transition: "color 0.2s, border-color 0.2s",
                        marginBottom: -1,
                        display: "flex", alignItems: "center", gap: 7,
                      }}
                    >
                      <i className={tab === "normal" ? "ti ti-file-description" : "ti ti-table"}></i>
                      {tab === "normal" ? (
                        <>
                          Extracted Data
                          {Array.isArray(result.normal) && result.normal.length > 0 && (
                            <span style={{
                              background: "#2563EB", color: "#fff",
                              borderRadius: 99, fontSize: 10.5, fontWeight: 700,
                              padding: "1px 7px", lineHeight: "1.6",
                            }}>
                              {result.normal.length}
                            </span>
                          )}
                        </>
                      ) : "CSV Output"}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ padding: 24 }}>
                  {activeTab === "normal" ? (
                    // ── Extracted JSON – one card per file ──────────────────
                    (() => {
                      const records = Array.isArray(result.normal)
                        ? result.normal
                        : result.normal
                        ? [result.normal]
                        : [];
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 520, overflowY: "auto", paddingRight: 4, scrollbarWidth: "thin" }}>
                          {records.length === 0 && (
                            <div style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                              No extraction data yet.
                            </div>
                          )}
                          {records.map((rec, i) => (
                            <div key={i} style={{
                              background: "rgba(0,0,0,0.25)",
                              border: "1px solid var(--color-border)",
                              borderRadius: 12,
                              overflow: "hidden",
                            }}>
                              {/* Card header */}
                              <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "10px 16px",
                                borderBottom: "1px solid var(--color-border)",
                                background: "rgba(37,99,235,0.06)",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <i className="ti ti-file-description" style={{ color: "#2563EB", fontSize: 15 }}></i>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-primary)" }}>
                                    File {i + 1}
                                    {typeof rec.invoice_number === "string" && rec.invoice_number && rec.invoice_number !== "NA"
                                      ? ` — ${rec.invoice_number}`
                                      : ""}
                                  </span>
                                </div>
                                <button
                                  onClick={() => navigator.clipboard.writeText(JSON.stringify(rec, null, 2))}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5,
                                    padding: "4px 10px",
                                    background: "rgba(37,99,235,0.08)",
                                    border: "1px solid rgba(37,99,235,0.2)",
                                    color: "#2563EB", borderRadius: 6,
                                    fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                                  }}
                                >
                                  <i className="ti ti-copy"></i> Copy
                                </button>
                              </div>
                              {/* Card body */}
                              <pre style={{
                                margin: 0,
                                padding: "14px 16px",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontFamily: "'Geist Mono', 'Fira Code', monospace",
                                fontSize: 12, lineHeight: 1.75,
                                color: "var(--color-text-secondary)",
                              }}>
                                {JSON.stringify(rec, null, 2)}
                              </pre>
                            </div>
                          ))}

                          {/* Copy-all footer */}
                          {records.length > 0 && (
                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                              <button
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(records, null, 2))}
                                style={{
                                  display: "flex", alignItems: "center", gap: 7,
                                  padding: "8px 16px",
                                  background: "rgba(37,99,235,0.08)",
                                  border: "1px solid rgba(37,99,235,0.2)",
                                  color: "#2563EB", borderRadius: 8,
                                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                <i className="ti ti-copy"></i> Copy All ({records.length})
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    // ── CSV tab ──────────────────────────────────────────────
                    <div style={{
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12, padding: 20,
                      maxHeight: 420, overflowY: "auto",
                      fontFamily: "'Geist Mono', 'Fira Code', monospace",
                      fontSize: 12.5, lineHeight: 1.7,
                      color: "var(--color-text-secondary)",
                      scrollbarWidth: "thin",
                    }}>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {JSON.stringify(result.csv_file, null, 2)}
                      </pre>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                        <button
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(result.csv_file, null, 2))}
                          style={{
                            display: "flex", alignItems: "center", gap: 7,
                            padding: "8px 16px",
                            background: "rgba(37,99,235,0.08)",
                            border: "1px solid rgba(37,99,235,0.2)",
                            color: "#2563EB", borderRadius: 8,
                            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          <i className="ti ti-copy"></i> Copy to Clipboard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { detectCows, fetchHealth } from "./api";
import type { Marker } from "./types";
import "./ImageCounter.css";

type StatusType = "" | "info" | "success" | "error";

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Counts {
  total: number;
  ai: number;
  manual: number;
}

interface Photo {
  id: string;
  file: File;
  previewUrl: string;
  image: HTMLImageElement;
  markers: Marker[];
  detected: boolean;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

const MARKER_COLORS = {
  ai: { fill: "rgba(217,140,0,0.16)", stroke: "rgba(217,140,0,0.95)" },
  manual: { fill: "rgba(15,155,142,0.16)", stroke: "rgba(15,155,142,0.95)" },
};

function loadImage(
  file: File,
): Promise<{ previewUrl: string; image: HTMLImageElement }> {
  return new Promise((resolve) => {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ previewUrl, image: img });
    img.src = previewUrl;
  });
}

export default function ImageCounter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageFileRef = useRef<File | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const showNumsRef = useRef(true);
  const transformRef = useRef<Transform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const lastSyncedIdRef = useRef<string | null>(null);
  const photosRef = useRef<Photo[]>([]);

  const isPanningRef = useRef(false);
  const didPanRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const lastTouchDistRef = useRef<number | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({ total: 0, ai: 0, manual: 0 });
  const [status, setStatus] = useState<{ msg: string; type: StatusType }>({
    msg: "",
    type: "",
  });
  const [detecting, setDetecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomValue, setZoomValue] = useState(1);
  const [zoomLabel, setZoomLabel] = useState("1.0x");
  const [backendConfigured, setBackendConfigured] = useState<boolean | null>(
    null,
  );

  const hasImage = photos.length > 0;
  const activeIndex = photos.findIndex((p) => p.id === activeId);
  const pendingCount = photos.filter((p) => !p.detected).length;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // revoke blob URLs when the app closes
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [],
  );

  const syncCounts = useCallback(() => {
    const markers = markersRef.current;
    setCounts({
      total: markers.length,
      ai: markers.filter((m) => m.source === "ai").length,
      manual: markers.filter((m) => m.source === "manual").length,
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    canvas.width = vw;
    canvas.height = vh;
    ctx.clearRect(0, 0, vw, vh);

    const image = imageRef.current;
    if (!image) return;

    const { scale, offsetX, offsetY } = transformRef.current;
    ctx.drawImage(
      image,
      offsetX,
      offsetY,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );

    markersRef.current.forEach((m, i) => {
      const sx = m.ix * scale + offsetX;
      const sy = m.iy * scale + offsetY;
      const r = Math.max(9, 13 * Math.min(scale / 0.25, 1.8));
      const colors =
        m.source === "ai" ? MARKER_COLORS.ai : MARKER_COLORS.manual;

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      if (showNumsRef.current) {
        const fs = Math.max(9, Math.round(r * 0.85));
        ctx.font = `700 ${fs}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, fs * 0.22);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeText(String(i + 1), sx, sy);
        ctx.fillStyle = "#fff";
        ctx.fillText(String(i + 1), sx, sy);
      }

      if (m.source === "ai" && m.confidence && scale > 0.4) {
        const confFs = Math.max(8, Math.round(r * 0.6));
        ctx.font = `500 ${confFs}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.strokeText(`${Math.round(m.confidence * 100)}%`, sx, sy - r - 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(`${Math.round(m.confidence * 100)}%`, sx, sy - r - 2);
      }
    });
  }, []);

  const updateSlider = useCallback(() => {
    const { scale } = transformRef.current;
    setZoomValue(Math.min(Math.max(scale, 0.5), 12));
    setZoomLabel(`${scale.toFixed(1)}x`);
  }, []);

  const applyZoom = useCallback(
    (newScale: number, pivotX: number, pivotY: number) => {
      const clamped = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
      const t = transformRef.current;
      const factor = clamped / t.scale;
      transformRef.current = {
        scale: clamped,
        offsetX: pivotX - (pivotX - t.offsetX) * factor,
        offsetY: pivotY - (pivotY - t.offsetY) * factor,
      };
      updateSlider();
      draw();
    },
    [draw, updateSlider],
  );

  const fitImage = useCallback(() => {
    const image = imageRef.current;
    const viewport = viewportRef.current;
    if (!image || !viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const scale = Math.min(vw / image.naturalWidth, vh / image.naturalHeight);
    transformRef.current = {
      scale,
      offsetX: (vw - image.naturalWidth * scale) / 2,
      offsetY: (vh - image.naturalHeight * scale) / 2,
    };
    updateSlider();
  }, [updateSlider]);

  const resetView = useCallback(() => {
    fitImage();
    draw();
  }, [fitImage, draw]);

  const commitActiveMarkers = useCallback(() => {
    if (!activeId) return;
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === activeId ? { ...p, markers: markersRef.current } : p,
      ),
    );
  }, [activeId]);

  const handleClick = useCallback(
    (cx: number, cy: number) => {
      const image = imageRef.current;
      if (!image) return;
      const { scale, offsetX, offsetY } = transformRef.current;
      const ix = (cx - offsetX) / scale;
      const iy = (cy - offsetY) / scale;
      const hitR = 15 / scale;

      const markers = markersRef.current;
      const hitIdx = markers.findIndex(
        (m) => Math.hypot(m.ix - ix, m.iy - iy) < hitR,
      );

      if (hitIdx >= 0) {
        markersRef.current = markers.filter((_, idx) => idx !== hitIdx);
      } else {
        if (
          ix < 0 ||
          ix > image.naturalWidth ||
          iy < 0 ||
          iy > image.naturalHeight
        )
          return;
        markersRef.current = [...markers, { ix, iy, source: "manual" }];
      }
      syncCounts();
      draw();
      commitActiveMarkers();
    },
    [syncCounts, draw, commitActiveMarkers],
  );

  // ── AI detection ─────────────────────────────────────────────
  const runDetection = useCallback(
    async (id: string, image: HTMLImageElement, file: File) => {
      setDetecting(true);
      setStatus({ msg: "Enviando imagen a Roboflow…", type: "info" });

      try {
        const data = await detectCows(file);

        const rfW = data.image_width || image.naturalWidth;
        const rfH = data.image_height || image.naturalHeight;

        const aiMarkers: Marker[] = data.detections.map((d) => ({
          ix: (d.x / rfW) * image.naturalWidth,
          iy: (d.y / rfH) * image.naturalHeight,
          source: "ai",
          confidence: d.confidence,
        }));

        const manualOnly = markersRef.current.filter(
          (m) => m.source === "manual",
        );
        const merged = [...manualOnly, ...aiMarkers];

        markersRef.current = merged;
        syncCounts();
        draw();
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, markers: merged, detected: true } : p,
          ),
        );
        setStatus({
          msg: `${data.count} animales detectados por IA.`,
          type: "success",
        });
      } catch (err) {
        setStatus({ msg: `Error: ${(err as Error).message}`, type: "error" });
      } finally {
        setDetecting(false);
      }
    },
    [syncCounts, draw],
  );

  const onManualRedetect = useCallback(() => {
    if (!activeId || !imageRef.current || !imageFileRef.current) return;
    runDetection(activeId, imageRef.current, imageFileRef.current);
  }, [activeId, runDetection]);

  // ── switching between loaded photos ───────────────────────────
  const switchTo = useCallback(
    (id: string) => {
      if (detecting || id === activeId) return;
      setActiveId(id);
    },
    [detecting, activeId],
  );

  const goPrev = useCallback(() => {
    if (activeIndex > 0) switchTo(photos[activeIndex - 1].id);
  }, [activeIndex, photos, switchTo]);

  const goNext = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < photos.length - 1)
      switchTo(photos[activeIndex + 1].id);
  }, [activeIndex, photos, switchTo]);

  // keep canvas refs / viewport in sync with whichever photo is active
  useEffect(() => {
    if (!activeId) return;
    const photo = photos.find((p) => p.id === activeId);
    if (!photo) return;
    if (lastSyncedIdRef.current === activeId) return;

    lastSyncedIdRef.current = activeId;
    imageRef.current = photo.image;
    imageFileRef.current = photo.file;
    markersRef.current = photo.markers;
    syncCounts();
    setStatus({ msg: "", type: "" });
    fitImage();
    draw();

    if (!photo.detected) {
      runDetection(photo.id, photo.image, photo.file);
    }
  }, [activeId, photos, syncCounts, fitImage, draw, runDetection]);

  // ── file load ────────────────────────────────────────────────
  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!files.length) return;

    const newPhotos: Photo[] = await Promise.all(
      files.map(async (file) => {
        const { previewUrl, image } = await loadImage(file);
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl,
          image,
          markers: [],
          detected: false,
        };
      }),
    );

    setPhotos((prev) => [...prev, ...newPhotos]);
    setActiveId((prev) => prev ?? newPhotos[0]?.id ?? null);
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length) addFiles(files);
    },
    [addFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  // ── actions ──────────────────────────────────────────────────
  const undoLast = useCallback(() => {
    if (!markersRef.current.length) return;
    markersRef.current = markersRef.current.slice(0, -1);
    syncCounts();
    draw();
    commitActiveMarkers();
  }, [syncCounts, draw, commitActiveMarkers]);

  const clearAll = useCallback(() => {
    if (!markersRef.current.length) return;
    if (!confirm("¿Borrar todos los marcadores?")) return;
    markersRef.current = [];
    syncCounts();
    draw();
    commitActiveMarkers();
  }, [syncCounts, draw, commitActiveMarkers]);

  const toggleNumbers = useCallback(() => {
    showNumsRef.current = !showNumsRef.current;
    draw();
  }, [draw]);

  const exportImg = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    const exp = document.createElement("canvas");
    exp.width = image.naturalWidth;
    exp.height = image.naturalHeight;
    const ec = exp.getContext("2d");
    if (!ec) return;
    ec.drawImage(image, 0, 0);

    markersRef.current.forEach((m, i) => {
      const r = Math.max(10, image.naturalWidth * 0.007);
      const colors =
        m.source === "ai" ? MARKER_COLORS.ai : MARKER_COLORS.manual;

      ec.beginPath();
      ec.arc(m.ix, m.iy, r, 0, Math.PI * 2);
      ec.fillStyle = colors.fill;
      ec.fill();
      ec.strokeStyle = colors.stroke;
      ec.lineWidth = r * 0.18;
      ec.stroke();

      if (showNumsRef.current) {
        const fs = Math.round(r);
        ec.font = `700 ${fs}px Inter, sans-serif`;
        ec.textAlign = "center";
        ec.textBaseline = "middle";
        ec.lineWidth = fs * 0.22;
        ec.strokeStyle = "rgba(0,0,0,0.55)";
        ec.strokeText(String(i + 1), m.ix, m.iy);
        ec.fillStyle = "#fff";
        ec.fillText(String(i + 1), m.ix, m.iy);
      }
    });

    const link = document.createElement("a");
    link.download = "conteo_ganado.png";
    link.href = exp.toDataURL("image/png");
    link.click();
  }, []);

  // ── mouse / touch / wheel listeners (attached once) ───────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const onMouseDown = (e: MouseEvent) => {
      isPanningRef.current = true;
      didPanRef.current = false;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = {
        x: transformRef.current.offsetX,
        y: transformRef.current.offsetY,
      };
      viewport.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPanRef.current = true;
      transformRef.current = {
        ...transformRef.current,
        offsetX: panOriginRef.current.x + dx,
        offsetY: panOriginRef.current.y + dy,
      };
      draw();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      viewport.style.cursor = "grab";

      if (!didPanRef.current) {
        const rect = canvas.getBoundingClientRect();
        handleClick(e.clientX - rect.left, e.clientY - rect.top);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      applyZoom(transformRef.current.scale * factor, mx, my);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isPanningRef.current = true;
        didPanRef.current = false;
        panStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        panOriginRef.current = {
          x: transformRef.current.offsetX,
          y: transformRef.current.offsetY,
        };
      }
      if (e.touches.length === 2) {
        lastTouchDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isPanningRef.current) {
        const dx = e.touches[0].clientX - panStartRef.current.x;
        const dy = e.touches[0].clientY - panStartRef.current.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) didPanRef.current = true;
        transformRef.current = {
          ...transformRef.current,
          offsetX: panOriginRef.current.x + dx,
          offsetY: panOriginRef.current.y + dy,
        };
        draw();
      }
      if (e.touches.length === 2 && lastTouchDistRef.current) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const rect = canvas.getBoundingClientRect();
        const pivotX =
          (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const pivotY =
          (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        applyZoom(
          transformRef.current.scale * (dist / lastTouchDistRef.current),
          pivotX,
          pivotY,
        );
        lastTouchDistRef.current = dist;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      isPanningRef.current = false;
      lastTouchDistRef.current = null;
      if (!didPanRef.current && e.changedTouches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        handleClick(
          e.changedTouches[0].clientX - rect.left,
          e.changedTouches[0].clientY - rect.top,
        );
      }
    };

    const onResize = () => draw();

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);
    };
  }, [draw, applyZoom, handleClick, hasImage]);

  // ── backend health check ──────────────────────────────────────
  useEffect(() => {
    fetchHealth()
      .then((d) => setBackendConfigured(d.configured))
      .catch(() => setBackendConfigured(null));
  }, []);

  const onSliderZoom = (val: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    applyZoom(val, viewport.clientWidth / 2, viewport.clientHeight / 2);
  };

  return (
    <div className="ic-root">
      <header className="ic-header">
        <div className="ic-brand">
          <div>
            <h1>Contador de Ganado</h1>
          </div>
        </div>
        {hasImage && (
          <div className="ic-header-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFileChange}
              hidden
            />
            <button
              className="ic-btn-outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Agregar fotos
            </button>
            <button
              className="ic-btn-primary"
              disabled={detecting}
              onClick={onManualRedetect}
            >
              {detecting ? "Detectando…" : "Re-detectar"}
            </button>
          </div>
        )}
      </header>

      {backendConfigured === false && (
        <div className="ic-status error">
          Backend no configurado: revisá el .env del backend (ROBOFLOW_API_KEY y
          ROBOFLOW_MODEL)
        </div>
      )}

      {!hasImage ? (
        <div
          className={`ic-hero ${isDragging ? "is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFileChange}
            hidden
          />
          <div className="ic-hero-icon">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
              <path
                d="M12 16V4m0 0 4 4m-4-4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2>Subí fotos para comenzar</h2>
          <p>Arrastrá una o varias imágenes acá, o elegilas desde tu equipo.</p>
          <button
            className="ic-btn-primary ic-btn-lg"
            onClick={() => fileInputRef.current?.click()}
          >
            Elegir fotos
          </button>
          <span className="ic-hero-hint">JPG · PNG · WEBP</span>
        </div>
      ) : (
        <>
          {status.msg && (
            <div className={`ic-status ${status.type}`}>{status.msg}</div>
          )}

          <div className="ic-toolbar">
            <div className="ic-counter-box">
              <span className="ic-counter-label">Total</span>
              <span className="ic-counter">{counts.total}</span>
            </div>
            <div className="ic-counter-box ic-counter-box-sm">
              <span className="ic-counter-label">IA</span>
              <span className="ic-counter-sm">{counts.ai}</span>
            </div>
            <div className="ic-counter-box ic-counter-box-sm">
              <span className="ic-counter-label">Manual</span>
              <span className="ic-counter-sm">{counts.manual}</span>
            </div>
            <div className="ic-toolbar-spacer" />
            <button className="ic-btn-outline" onClick={undoLast}>
              ↩ Deshacer
            </button>
            <button className="ic-btn-outline" onClick={clearAll}>
              ✕ Limpiar
            </button>
            <button className="ic-btn-outline" onClick={toggleNumbers}>
              # Números
            </button>
            <button className="ic-btn-outline" onClick={resetView}>
              ⊙ Reset zoom
            </button>
            <button className="ic-btn-outline" onClick={exportImg}>
              ↓ Exportar
            </button>
          </div>

          <div className="ic-thumb-header">
            <span
              className={`ic-pending-badge ${pendingCount > 0 ? "has-pending" : "all-done"}`}
            >
              {pendingCount > 0
                ? `Fotos pendientes ${pendingCount} de ${photos.length}`
                : "Todas las fotos fueron procesadas"}
            </span>
          </div>

          <div className="ic-thumb-strip">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                className={`ic-thumb ${p.id === activeId ? "is-active" : ""}`}
                onClick={() => switchTo(p.id)}
                disabled={detecting && p.id !== activeId}
                title={p.file.name}
              >
                <img src={p.previewUrl} alt="" />
                <span
                  className={`ic-thumb-badge ${p.detected ? "is-done" : "is-pending"}`}
                >
                  {p.detected ? "✓" : idx + 1}
                </span>
              </button>
            ))}
          </div>

          <div className="ic-viewport" ref={viewportRef}>
            <canvas ref={canvasRef} />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  className="ic-nav-arrow ic-nav-prev"
                  onClick={goPrev}
                  disabled={detecting || activeIndex <= 0}
                  aria-label="Foto anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="ic-nav-arrow ic-nav-next"
                  onClick={goNext}
                  disabled={detecting || activeIndex >= photos.length - 1}
                  aria-label="Foto siguiente"
                >
                  ›
                </button>
              </>
            )}
          </div>

          <div className="ic-zoomrow">
            <label>Zoom</label>
            <input
              type="range"
              min={0.5}
              max={12}
              step={0.1}
              value={zoomValue}
              onChange={(e) => onSliderZoom(parseFloat(e.target.value))}
            />
            <span className="ic-zoom-label">{zoomLabel}</span>
            <span className="ic-hint">Scroll = zoom · Arrastrá = mover</span>
          </div>

          <div className="ic-legend">
            <span>
              <span className="ic-dot ic-dot-ai" />
              Detectado por IA
            </span>
            <span>
              <span className="ic-dot ic-dot-manual" />
              Agregado manualmente
            </span>
          </div>

          <p className="ic-tip">
            Click sobre una burbuja = borrala · Click en área vacía = agregá un
            animal
          </p>
        </>
      )}
    </div>
  );
}

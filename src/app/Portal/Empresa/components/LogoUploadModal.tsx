"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetchRaw } from "@/lib/api";
import { useToasts } from "./useToasts";
import { resolveLogoUrl } from "./logoUrl";

const LOGO_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/svg+xml",
  "image/heic",
  "image/heif",
];

const LOGO_MAX_INPUT_MB = 12;
const CANVAS_SIZE = 600; // always square preview canvas
const OUTPUT_SIZE = 900; // final upload resolution

function getFileMime(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".avif")) return "image/avif";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".bmp")) return "image/bmp";
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return "image/tiff";
  if (n.endsWith(".svg")) return "image/svg+xml";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".heif")) return "image/heif";
  return "";
}

type Props = {
  token: string;
  open: boolean;
  currentLogo?: string;
  onClose: () => void;
  onUploaded: (newLogoPath: string) => void;
};

export default function LogoUploadModal({ token, open, currentLogo, onClose, onUploaded }: Props) {
  const { pushToast } = useToasts();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const draggingRef = useRef(false);

  const [draftImage, setDraftImage] = useState<HTMLImageElement | null>(null);
  const [cropMode, setCropMode] = useState<"fit" | "square">("fit");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  /* ---- canvas draw ---- */
  const draw = useCallback(
    (img: HTMLImageElement | null, ox: number, oy: number, z: number, mode: "fit" | "square") => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      if (!img) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "15px sans-serif";
        ctx.fillText("Sem imagem selecionada", CANVAS_SIZE / 2, CANVAS_SIZE / 2);
        return;
      }

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const baseScale =
        mode === "square"
          ? Math.max(CANVAS_SIZE / iw, CANVAS_SIZE / ih)
          : Math.min(CANVAS_SIZE / iw, CANVAS_SIZE / ih);

      const dw = iw * baseScale * z;
      const dh = ih * baseScale * z;
      const dx = (CANVAS_SIZE - dw) / 2 + ox;
      const dy = (CANVAS_SIZE - dh) / 2 + oy;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, dw, dh);
    },
    []
  );

  // Redraw when any visual parameter changes
  useEffect(() => {
    draw(draftImage, offsetX, offsetY, zoom, cropMode);
  }, [draftImage, offsetX, offsetY, zoom, cropMode, draw]);

  // Show current logo when modal first opens and no draft is selected
  useEffect(() => {
    if (!open || draftImage || !currentLogo) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      draw(img, 0, 0, 1, "fit");
    };
    img.src = resolveLogoUrl(currentLogo);
  }, [open, currentLogo, draftImage, draw]);

  /* ---- file pick ---- */
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const mime = getFileMime(file);
    if (!LOGO_ACCEPT.includes(mime)) {
      setMsg("Formato inválido. Use PNG, JPG, WEBP, AVIF, GIF, BMP, TIFF, SVG ou HEIC/HEIF.");
      return;
    }
    if (file.size > LOGO_MAX_INPUT_MB * 1024 * 1024) {
      setMsg(`Ficheiro muito grande. Limite de ${LOGO_MAX_INPUT_MB}MB.`);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setDraftImage(img);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setMsg("");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMsg("Não foi possível ler esta imagem. Tente PNG ou JPG.");
    };
    img.src = url;
  };

  /* ---- drag helpers ---- */
  const getCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
  };

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draftImage) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    draggingRef.current = true;
    dragRef.current = { startX: x, startY: y, ox: offsetX, oy: offsetY };
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingRef.current || !dragRef.current) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    const nx = dragRef.current.ox + (x - dragRef.current.startX);
    const ny = dragRef.current.oy + (y - dragRef.current.startY);
    setOffsetX(nx);
    setOffsetY(ny);
  };

  const onPointerUp = () => {
    draggingRef.current = false;
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.max(0.3, Math.min(6, parseFloat((z + delta).toFixed(2)))));
  };

  /* ---- upload ---- */
  const handleUpload = async () => {
    if (!draftImage) {
      setMsg("Selecione uma imagem para continuar.");
      return;
    }

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = OUTPUT_SIZE;
    finalCanvas.height = OUTPUT_SIZE;
    const ctx = finalCanvas.getContext("2d");
    if (!ctx) {
      setMsg("Não foi possível processar a imagem.");
      return;
    }

    const scale = OUTPUT_SIZE / CANVAS_SIZE;
    const iw = draftImage.naturalWidth;
    const ih = draftImage.naturalHeight;
    const baseScale =
      cropMode === "square"
        ? Math.max(CANVAS_SIZE / iw, CANVAS_SIZE / ih)
        : Math.min(CANVAS_SIZE / iw, CANVAS_SIZE / ih);
    const dw = iw * baseScale * zoom * scale;
    const dh = ih * baseScale * zoom * scale;
    const dx = (OUTPUT_SIZE - iw * baseScale * zoom * scale) / 2 + offsetX * scale;
    const dy = (OUTPUT_SIZE - ih * baseScale * zoom * scale) / 2 + offsetY * scale;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(draftImage, dx, dy, dw, dh);

    const blob = await new Promise<Blob | null>((resolve) =>
      finalCanvas.toBlob(resolve, "image/webp", 0.86)
    );
    if (!blob) {
      setMsg("Falha ao comprimir imagem.");
      return;
    }
    if (blob.size > 4 * 1024 * 1024) {
      setMsg("Imagem final acima de 4MB. Reduza o zoom ou escolha uma imagem menor.");
      return;
    }

    const form = new FormData();
    form.append("logo", new File([blob], "company-logo.webp", { type: "image/webp" }));

    setUploading(true);
    setMsg("");
    try {
      const res = await authFetchRaw("/companies/profile/logo", token, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onUploaded(data.company?.logo || data.logoUrl || "");
      pushToast("success", "Logo da empresa actualizada.");
      handleClose();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Erro ao carregar logo.";
      setMsg(m);
      pushToast("error", m);
    } finally {
      setUploading(false);
    }
  };

  /* ---- close ---- */
  const handleClose = () => {
    setDraftImage(null);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setMsg("");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Upload e gestão de logo</h3>
            <p className="mt-1 text-sm text-slate-600">
              Escolha a imagem, ajuste o enquadramento e finalize o upload.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr,1fr]">
          {/* Canvas preview */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div
              className={`mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white ${
                draftImage ? "cursor-grab" : "cursor-default"
              }`}
              style={{ touchAction: "none" }}
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
              onWheel={onWheel}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="block h-auto w-full"
              />
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              {draftImage
                ? "Arraste para reposicionar · roda do rato para zoom"
                : "Pré-visualização em tempo real"}
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
              Selecionar ficheiro
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,.tiff,.tif,.svg,.heic,.heif,image/*"
                className="hidden"
                onChange={handleFilePick}
                disabled={uploading}
              />
            </label>

            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modo de corte</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={cropMode === "fit"}
                  onClick={() => setCropMode("fit")}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    cropMode === "fit"
                      ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-semibold">Manter proporção</span>
                </button>
                <button
                  type="button"
                  aria-pressed={cropMode === "square"}
                  onClick={() => setCropMode("square")}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    cropMode === "square"
                      ? "border-red-200 bg-red-50 text-red-800 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-semibold">Quadrado</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Zoom ({zoom.toFixed(2)}x)
              </label>
              <input
                type="range"
                min={0.3}
                max={6}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <p className="mt-2 text-xs text-slate-500">Use a roda do rato na pré-visualização para zoom rápido.</p>
            </div>

            {draftImage && (
              <button
                type="button"
                className="text-left text-xs text-slate-500 underline-offset-2 hover:underline"
                onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); }}
              >
                Repor posição e zoom
              </button>
            )}

            {msg && (
              <p
                className={
                  msg.includes("sucesso")
                    ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                    : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                }
              >
                {msg}
              </p>
            )}

            <div className="mt-auto flex justify-end gap-2">
              <button
                type="button"
                className="app-btn-secondary px-4 py-2 text-sm"
                onClick={handleClose}
                disabled={uploading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !draftImage}
                className="app-btn-primary min-w-[170px] px-5 py-2.5 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? "A carregar logo..." : "Guardar logo"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

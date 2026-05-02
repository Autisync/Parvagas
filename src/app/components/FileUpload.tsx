"use client";

import { useState, useRef, useId } from "react";
import Image from "next/image";
import { XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";
import FormFieldError from "@/app/components/errors/FormFieldError";

type FileUploadProps = {
  accept?: string;
  maxSize?: number;
  onFileSelected: (file: File | null) => void;
  preview?: string | null;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  helpText?: string;
  error?: string;
};

export default function FileUpload({
  accept = "image/*",
  maxSize = 5 * 1024 * 1024,
  onFileSelected,
  preview,
  loading = false,
  disabled = false,
  label = "Upload File",
  helpText,
  error,
}: FileUploadProps) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [localError, setLocalError] = useState("");
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLocalError("");

    if (file.size > maxSize) {
      setLocalError(`Arquivo muito grande. Máximo ${Math.round(maxSize / 1024 / 1024)}MB.`);
      return;
    }

    setFileName(file.name);
    onFileSelected(file);

    // Create preview for image files
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setLocalPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClear = () => {
    setLocalPreview(null);
    setFileName("");
    setLocalError("");
    onFileSelected(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const displayPreview = localPreview || preview;
  const effectiveError = error || localError;

  return (
    <div>
      {label && <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>}

      <div
        className={`relative rounded-xl border-2 border-dashed transition ${
          effectiveError ? "border-red-300 bg-red-50" : "border-slate-300 bg-slate-50"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {displayPreview ? (
          <div className="relative h-40 overflow-hidden rounded-lg bg-white">
            <Image src={displayPreview} alt="Preview" fill className="object-cover" unoptimized />
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
              >
                <XMarkIcon className="h-5 w-5 text-slate-600" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-8">
            <PhotoIcon className="h-10 w-10 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">{loading ? "Enviando..." : "Arraste ou clique"}</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          disabled={loading || disabled}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>

      {fileName && <p className="mt-1 text-xs text-slate-500">{fileName}</p>}
      {helpText && !effectiveError && <p className="mt-1 text-xs text-slate-500">{helpText}</p>}
      <FormFieldError id={errorId} message={effectiveError} />
    </div>
  );
}

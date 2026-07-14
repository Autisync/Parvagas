"use client";

import type { RefObject } from "react";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import FeedbackAlert from "@/app/components/errors/FeedbackAlert";
import { SuccessCheck } from "@/app/components/motion";
import type { PageFeedback } from "./types";

type UploadCardProps = {
  inputRef: RefObject<HTMLInputElement>;
  uploading: boolean;
  uploadDone: boolean;
  feedback: PageFeedback | null;
  onDismissFeedback: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function UploadCard({ inputRef, uploading, uploadDone, feedback, onDismissFeedback, onUpload }: UploadCardProps) {
  return (
    <div>
      <div
        className="cursor-pointer rounded-2xl border-2 border-dashed border-red-200 p-10 text-center transition-colors hover:bg-red-50"
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.tiff,.bmp" className="hidden" onChange={onUpload} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            <p className="font-medium text-red-600">A processar CV...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <DocumentArrowUpIcon className="h-9 w-9 text-red-400" aria-hidden="true" />
            <p className="font-semibold text-gray-700">Clique para carregar o CV</p>
            <p className="text-sm text-gray-500">PDF, DOC ou DOCX até 5 MB</p>
          </div>
        )}
      </div>

      {feedback ? (
        <div className="mt-4 flex items-start gap-3">
          {feedback.variant === "success" && uploadDone ? <SuccessCheck size={28} tone="success" /> : null}
          <FeedbackAlert
            variant={feedback.variant}
            title={feedback.title}
            message={feedback.message}
            actionLabel={feedback.actionLabel}
            onAction={feedback.onAction}
            onDismiss={onDismissFeedback}
            className="flex-1"
          />
        </div>
      ) : null}
    </div>
  );
}

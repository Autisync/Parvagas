"use client";

import AddItemModal from "@/app/components/profile/AddItemModal";
import type { CandidateDocument } from "./types";

type DocumentsListProps = {
  documents: CandidateDocument[];
  selectedDocIds: Set<string>;
  onToggleDoc: (id: string) => void;
  onToggleSelectAll: () => void;
  onRequestDelete: (ids: string[]) => void;

  confirmDeleteIds: string[] | null;
  confirmDocNames: string[];
  deletingBatch: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

export default function DocumentsList({
  documents,
  selectedDocIds,
  onToggleDoc,
  onToggleSelectAll,
  onRequestDelete,
  confirmDeleteIds,
  confirmDocNames,
  deletingBatch,
  onCancelDelete,
  onConfirmDelete,
}: DocumentsListProps) {
  const allDocsSelected = documents.length > 0 && documents.every((doc) => selectedDocIds.has(doc._id));

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Documentos</h2>
        {documents.length > 0 ? (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                checked={allDocsSelected}
                onChange={onToggleSelectAll}
              />
              Selecionar todos
            </label>
            <button
              type="button"
              disabled={selectedDocIds.size === 0}
              onClick={() => onRequestDelete(Array.from(selectedDocIds))}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Eliminar selecionados{selectedDocIds.size > 0 ? ` (${selectedDocIds.size})` : ""}
            </button>
          </div>
        ) : null}
      </div>
      {documents.length === 0 ? <p className="text-sm text-gray-500">Ainda não carregou nenhum documento.</p> : null}
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc._id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                aria-label={`Selecionar ${doc.fileName || "documento"}`}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-red-600 focus:ring-red-500"
                checked={selectedDocIds.has(doc._id)}
                onChange={() => onToggleDoc(doc._id)}
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.fileName || "Documento"}</p>
                <p className="text-xs text-gray-500">{doc.type || "file"} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-AO") : ""}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">Abrir</a> : null}
              <button
                type="button"
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                onClick={() => onRequestDelete([doc._id])}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      <AddItemModal
        open={confirmDeleteIds !== null}
        title={confirmDocNames.length > 1 ? "Eliminar documentos" : "Eliminar documento"}
        onClose={() => { if (!deletingBatch) onCancelDelete(); }}
      >
        <p className="text-sm text-slate-700">
          {confirmDocNames.length > 1
            ? `Tem a certeza que pretende eliminar ${confirmDocNames.length} documentos? Esta ação é permanente e não pode ser anulada.`
            : "Tem a certeza que pretende eliminar este documento? Esta ação é permanente e não pode ser anulada."}
        </p>
        {confirmDocNames.length > 0 ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {confirmDocNames.map((name, i) => (
              <li key={`${name}-${i}`} className="truncate">• {name}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={deletingBatch}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={onCancelDelete}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={deletingBatch}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            onClick={onConfirmDelete}
          >
            {deletingBatch ? "A remover..." : "Eliminar"}
          </button>
        </div>
      </AddItemModal>
    </section>
  );
}

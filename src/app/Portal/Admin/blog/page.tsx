"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  createAdminCareerPost,
  deleteAdminCareerPost,
  fetchAdminCareerPosts,
  updateAdminCareerPost,
  type CareerPostRecord,
} from "../adminClient";
import {
  AdminSpinner,
  AdminModal,
  AdminPageHeader,
  AdminEmptyState,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import FormFieldError from "@/app/components/errors/FormFieldError";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { getErrorMessage } from "@/lib/api";

const emptyForm = {
  title: "",
  slug: "",
  category: "",
  excerpt: "",
  readTime: "",
  author: "Equipa Parvagas",
  coverImage: "",
  body: "",
  takeaways: "",
  featuredOnHome: false,
  published: true,
};

type BlogForm = typeof emptyForm;
type BlogErrors = Partial<Record<keyof BlogForm, string>>;

const CATEGORIES = ["CV", "Entrevista", "Carreira", "Remoto"];

function recordToForm(post: CareerPostRecord): BlogForm {
  return {
    title: post.title ?? "",
    slug: post.slug ?? "",
    category: post.category ?? "",
    excerpt: post.excerpt ?? "",
    readTime: post.readTime ?? "",
    author: post.author ?? "Equipa Parvagas",
    coverImage: post.coverImage ?? "",
    body: (post.body ?? []).join("\n\n"),
    takeaways: (post.takeaways ?? []).join("\n"),
    featuredOnHome: Boolean(post.featuredOnHome),
    published: Boolean(post.published),
  };
}

function formToPayload(form: BlogForm): Partial<CareerPostRecord> {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    category: form.category.trim() || null,
    excerpt: form.excerpt.trim() || null,
    readTime: form.readTime.trim() || null,
    author: form.author.trim() || null,
    coverImage: form.coverImage.trim() || null,
    body: form.body.split("\n\n").map((p) => p.trim()).filter(Boolean),
    takeaways: form.takeaways.split("\n").map((p) => p.trim()).filter(Boolean),
    featuredOnHome: form.featuredOnHome,
    published: form.published,
  };
}

function validate(form: BlogForm): BlogErrors {
  const errors: BlogErrors = {};
  if (!form.title.trim()) errors.title = "Indique o título do artigo.";
  if (!form.excerpt.trim()) errors.excerpt = "Escreva um resumo curto.";
  if (!form.body.trim()) errors.body = "O corpo do artigo não pode ficar vazio.";
  return errors;
}

/** Mirror of the public article's **bold** handling (Dicas-de-Carreira/[slug]). */
function PreviewParagraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <p className="mt-4 leading-relaxed text-gray-700">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

type PreviewData = {
  title: string;
  category?: string | null;
  author?: string | null;
  readTime?: string | null;
  coverImage?: string | null;
  excerpt?: string | null;
  body: string[];
  takeaways: string[];
};

/** Faithful miniature of the public article page so the admin sees the
 * post exactly as readers will, without leaving the console. */
function ArticlePreview({ data }: { data: PreviewData }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {data.category ? (
        <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{data.category}</span>
      ) : null}
      <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-950">{data.title || "Sem título"}</h1>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
        {data.author ? <span>Por {data.author}</span> : null}
        {data.readTime ? <span>⏱ {data.readTime}</span> : null}
      </div>
      {data.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.coverImage} alt={data.title} className="mt-4 max-h-56 w-full rounded-2xl object-cover" />
      ) : null}
      {data.excerpt ? (
        <p className="mt-4 border-l-4 border-red-200 pl-4 text-base italic text-gray-600">{data.excerpt}</p>
      ) : null}
      <article className="mt-2">
        {data.body.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">O corpo do artigo aparece aqui…</p>
        ) : (
          data.body.map((paragraph, i) => <PreviewParagraph key={i} text={paragraph} />)
        )}
      </article>
      {data.takeaways.length > 0 ? (
        <aside className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4">
          <h2 className="text-base font-bold text-red-700">Pontos-chave</h2>
          <ul className="mt-2 space-y-1.5">
            {data.takeaways.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 text-red-500">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

export default function AdminBlogPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();
  const [posts, setPosts] = useState<CareerPostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<BlogErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [modalTab, setModalTab] = useState<"edit" | "preview">("edit");
  const [previewPost, setPreviewPost] = useState<CareerPostRecord | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminCareerPosts(token);
      setPosts(res.posts ?? []);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível carregar os artigos."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormErrors({});
    setModalTab("edit");
    setModalOpen(true);
  };

  const openEdit = (post: CareerPostRecord) => {
    setEditingId(post._id);
    setForm(recordToForm(post));
    setFormErrors({});
    setModalTab("edit");
    setModalOpen(true);
  };

  const formPreviewData = (): PreviewData => ({
    title: form.title.trim(),
    category: form.category.trim() || null,
    author: form.author.trim() || null,
    readTime: form.readTime.trim() || null,
    coverImage: form.coverImage.trim() || null,
    excerpt: form.excerpt.trim() || null,
    body: form.body.split("\n\n").map((p) => p.trim()).filter(Boolean),
    takeaways: form.takeaways.split("\n").map((p) => p.trim()).filter(Boolean),
  });

  const handleSave = async () => {
    if (!token) return;
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await updateAdminCareerPost(token, editingId, payload);
        notify("Artigo atualizado.", "success");
      } else {
        await createAdminCareerPost(token, payload);
        notify("Artigo publicado.", "success");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      notify(getErrorMessage(err, "Não foi possível guardar o artigo."), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setDeleting(true);
    try {
      await deleteAdminCareerPost(token, id);
      notify("Artigo eliminado.", "success");
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      notify(getErrorMessage(err, "Não foi possível eliminar o artigo."), "error");
    } finally {
      setDeleting(false);
    }
  };

  const publishedCount = useMemo(() => posts.filter((p) => p.published).length, [posts]);
  const featuredCount = useMemo(() => posts.filter((p) => p.featuredOnHome).length, [posts]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Conteúdo"
        title="Dicas de Carreira / Blog"
        description="Crie, edite e publique artigos editoriais. Os artigos publicados aparecem em /Dicas-de-Carreira; os destacados surgem na homepage."
        action={
          <button type="button" onClick={openCreate} className={adminButtonClass}>
            + Novo artigo
          </button>
        }
      />

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Artigos", value: posts.length },
          { label: "Publicados", value: publishedCount },
          { label: "Em destaque (home)", value: featuredCount },
        ].map((s) => (
          <div key={s.label} className="app-card p-4">
            <p className="text-2xl font-bold text-[var(--text-strong)]">{s.value}</p>
            <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
          </div>
        ))}
      </section>

      {error && (
        <div className="mt-6">
          <InlineErrorState onAction={load} />
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <AdminSpinner /> A carregar artigos…
        </div>
      ) : posts.length === 0 && !error ? (
        <div className="mt-6">
          <AdminEmptyState title="Sem artigos" description="Crie o primeiro artigo do blog de carreira." />
        </div>
      ) : (
        <section className="app-card mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Destaque</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post._id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--text-strong)]">{post.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">/{post.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{post.category || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          post.published ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {post.published ? "Publicado" : "Rascunho"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{post.featuredOnHome ? "✓" : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setPreviewPost(post)} className={adminSecondaryButtonClass}>
                          Pré-ver
                        </button>
                        <button type="button" onClick={() => openEdit(post)} className={adminSecondaryButtonClass}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(post._id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AdminModal
        open={modalOpen}
        title={editingId ? "Editar artigo" : "Novo artigo"}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className={adminSecondaryButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className={adminButtonClass}>
              {saving ? "A guardar…" : editingId ? "Guardar alterações" : "Publicar artigo"}
            </button>
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {([["edit", "Editar"], ["preview", "Pré-visualizar"]] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setModalTab(tab)}
              className={[
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                modalTab === tab ? "bg-white text-red-700 shadow-sm ring-1 ring-red-100" : "text-slate-600 hover:text-slate-950",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {modalTab === "preview" ? (
          <ArticlePreview data={formPreviewData()} />
        ) : (
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Como escrever um bom CV"
              className={adminFieldClass}
            />
            <FormFieldError id="blog-title-error" message={formErrors.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Slug (URL)</label>
              <input
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                placeholder="auto a partir do título"
                className={adminFieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className={adminFieldClass}
              >
                <option value="">— Sem categoria —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Autor</label>
              <input
                value={form.author}
                onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))}
                className={adminFieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tempo de leitura</label>
              <input
                value={form.readTime}
                onChange={(e) => setForm((p) => ({ ...p, readTime: e.target.value }))}
                placeholder="5 min"
                className={adminFieldClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Resumo *</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))}
              rows={2}
              placeholder="Uma ou duas frases que resumem o artigo."
              className={adminFieldClass}
            />
            <FormFieldError id="blog-excerpt-error" message={formErrors.excerpt} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Corpo do artigo * <span className="font-normal text-slate-400">(um parágrafo por linha em branco; use **negrito**)</span>
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              rows={8}
              placeholder={"Primeiro parágrafo…\n\nSegundo parágrafo com **destaque**…"}
              className={adminFieldClass}
            />
            <FormFieldError id="blog-body-error" message={formErrors.body} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Pontos-chave <span className="font-normal text-slate-400">(um por linha)</span>
            </label>
            <textarea
              value={form.takeaways}
              onChange={(e) => setForm((p) => ({ ...p, takeaways: e.target.value }))}
              rows={4}
              placeholder={"Primeiro ponto-chave\nSegundo ponto-chave"}
              className={adminFieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Imagem de capa (URL)</label>
            <input
              value={form.coverImage}
              onChange={(e) => setForm((p) => ({ ...p, coverImage: e.target.value }))}
              placeholder="https://…"
              className={adminFieldClass}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((p) => ({ ...p, published: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Publicado
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.featuredOnHome}
                onChange={(e) => setForm((p) => ({ ...p, featuredOnHome: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Destacar na homepage
            </label>
          </div>
        </div>
        )}
      </AdminModal>

      <AdminModal
        open={Boolean(previewPost)}
        title={previewPost ? `Pré-visualização — ${previewPost.title}` : "Pré-visualização"}
        onClose={() => setPreviewPost(null)}
      >
        {previewPost ? (
          <ArticlePreview
            data={{
              title: previewPost.title ?? "",
              category: previewPost.category,
              author: previewPost.author,
              readTime: previewPost.readTime,
              coverImage: previewPost.coverImage,
              excerpt: previewPost.excerpt,
              body: previewPost.body ?? [],
              takeaways: previewPost.takeaways ?? [],
            }}
          />
        ) : null}
      </AdminModal>

      <AdminModal
        open={Boolean(confirmDeleteId)}
        title="Eliminar artigo"
        onClose={() => setConfirmDeleteId(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={deleting} className={adminSecondaryButtonClass}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              disabled={deleting}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "A eliminar..." : "Eliminar definitivamente"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Tem a certeza de que quer eliminar este artigo? Esta ação não pode ser anulada.
        </p>
      </AdminModal>
    </div>
  );
}

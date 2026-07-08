/**
 * Description templates: a shared HTML "skeleton" with {{slot}} tokens and
 * <!--repeat:key-->…<!--/repeat--> regions, plus a field schema describing the
 * per-product slots. Rendering substitutes escaped product values into the
 * skeleton deterministically, so every product shares the exact same format.
 */

export type SubField = { key: string; label: string; type: "text" | "textarea"; placeholder?: string };
export type TemplateField =
  | { key: string; label: string; type: "text"; bind?: "name"; placeholder?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string }
  | { key: string; label: string; type: "list"; item: SubField[]; addLabel?: string }
  | { key: string; label: string; type: "pairs"; labelPlaceholder?: string; valuePlaceholder?: string; addLabel?: string };

// Per-product slot values. Scalars are strings; list = array of {sub:val};
// pairs = array of { label, value }.
export type TemplateData = Record<string, string | Array<Record<string, string>>>;

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Escape and turn newlines into <br /> so multi-line slots keep their breaks. */
function ml(s: unknown): string {
  return esc(s).replace(/\r?\n/g, "<br />");
}

/** Renders a template skeleton + data to final HTML. Pure and deterministic. */
export function renderTemplate(skeleton: string, data: TemplateData): string {
  // 1) Expand repeat regions first (they contain {{item.x}} tokens).
  let html = skeleton.replace(/<!--repeat:(\w+)-->([\s\S]*?)<!--\/repeat-->/g, (_m, key: string, inner: string) => {
    const arr = Array.isArray(data[key]) ? (data[key] as Array<Record<string, string>>) : [];
    return arr
      .filter((item) => item && Object.values(item).some((v) => String(v ?? "").trim() !== ""))
      .map((item) => inner.replace(/\{\{\s*item\.(\w+)\s*\}\}/g, (_2, sub: string) => ml(item?.[sub])))
      .join("");
  });
  // 2) Scalar tokens.
  html = html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => ml(data[key]));
  return html;
}

/** Blank data object matching a field schema (one empty row for list/pairs). */
export function emptyData(fields: TemplateField[]): TemplateData {
  const out: TemplateData = {};
  for (const f of fields) {
    if (f.type === "list") out[f.key] = [Object.fromEntries(f.item.map((s) => [s.key, ""]))];
    else if (f.type === "pairs") out[f.key] = [{ label: "", value: "" }];
    else out[f.key] = "";
  }
  return out;
}

/** Sample data (from placeholders/labels) so a template preview looks realistic. */
export function sampleData(fields: TemplateField[]): TemplateData {
  const out: TemplateData = {};
  for (const f of fields) {
    if (f.type === "list") {
      const row = Object.fromEntries(f.item.map((s) => [s.key, s.placeholder || s.label]));
      out[f.key] = [row, row];
    } else if (f.type === "pairs") {
      out[f.key] = [
        { label: f.labelPlaceholder || "Dato", value: f.valuePlaceholder || "Valor" },
        { label: f.labelPlaceholder || "Dato", value: f.valuePlaceholder || "Valor" },
      ];
    } else {
      out[f.key] = f.placeholder || f.label;
    }
  }
  return out;
}

/** Safe-parse a template's stored `fields` JSON into a typed array. */
export function parseFields(fields: string): TemplateField[] {
  try { const a = JSON.parse(fields); return Array.isArray(a) ? a : []; } catch { return []; }
}

/* ── Seed template: parametrized from the real "Resident Evil 5 [PS4]" design ── */

export const SEED_FIELDS: TemplateField[] = [
  { key: "title", label: "Título", type: "text", bind: "name", placeholder: "Resident Evil 5 [PS4]" },
  { key: "genres", label: "Géneros", type: "text", placeholder: "Acción, Terror, Shooter en tercera persona" },
  { key: "synopsis", label: "Sinopsis", type: "textarea", placeholder: "Pitch narrativo del juego…" },
  { key: "features", label: "Características", type: "list", addLabel: "Agregar característica",
    item: [
      { key: "title", label: "Título", type: "text", placeholder: "🔥 Cooperativo legendario" },
      { key: "body", label: "Descripción", type: "textarea", placeholder: "Detalle de la característica…" },
    ] },
  { key: "spec", label: "Ficha técnica", type: "pairs", labelPlaceholder: "Audio", valuePlaceholder: "Inglés", addLabel: "Agregar dato" },
];

export const SEED_SKELETON = `<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 12px; background: #ffffff;">
<div style="text-align: right; margin-bottom: 10px;"><span style="background: #e1f5fe; color: #0070d1; padding: 5px 15px; border-radius: 50px; font-weight: bold; font-size: 0.7em; letter-spacing: 1px;">⚡ ENTREGA INMEDIATA</span></div>
<div style="text-align: center; margin-bottom: 15px;">
<h2 style="color: #0070d1; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; font-weight: 800;">{{title}}</h2>
<p style="font-size: 0.85em; color: #888; text-transform: uppercase;">{{genres}}</p>
<hr style="border: 0; height: 3px; background: linear-gradient(to right, transparent, #0070d1, transparent); width: 60%; margin: 15px auto;" /></div>
<!-- Confianza Milester -->
<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 25px; padding: 15px; background: #f9f9f9; border-radius: 10px; border: 1px dashed #0070d1;">
<div style="font-size: 0.85em; font-weight: 600;">🎮 ¡Licencia permanente!</div>
<div style="font-size: 0.85em; font-weight: 600;">🕒 Acceso 24/7</div>
<div style="font-size: 0.85em; font-weight: 600;">🛡️ Garantía Milester</div>
</div>
<div style="margin-bottom: 30px; background-color: #f4f7f9; padding: 20px; border-radius: 12px; border-left: 5px solid #0070d1;">
<p style="margin: 0; font-style: italic; font-size: 1.1em; color: #222; text-align: center;">"{{synopsis}}"</p>
</div>
<div style="margin-bottom: 35px;">
<h3 style="color: #0070d1; font-size: 1.25em; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; text-align: center;">🚀 Prepárate para la acción</h3>
<!--repeat:features--><div style="margin-bottom: 20px;"><strong style="color: #0070d1; display: block; font-size: 1.1em; margin-bottom: 5px;">{{item.title}}</strong> <span style="font-size: 1em; color: #444;">{{item.body}}</span></div><!--/repeat-->
</div>
<div style="background-color: #1a1a1a; color: #eee; padding: 25px; border-radius: 15px;">
<h3 style="margin-top: 0; color: #00d4ff; font-size: 1.1em; text-align: center; text-transform: uppercase;">⚙️ Ficha Técnica</h3>
<table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
<tbody>
<!--repeat:spec--><tr style="border-bottom: 1px solid #333;"><td style="padding: 12px; color: #888;">{{item.label}}:</td><td style="padding: 12px; text-align: right; font-weight: 600;">{{item.value}}</td></tr><!--/repeat-->
</tbody>
</table>
</div>
<p style="text-align: center; font-size: 0.85em; color: #999; margin-top: 25px;">🛡️ Contamos con un área especializada para resolver cualquier duda antes y después de tu compra. ¡Tu tranquilidad es nuestra prioridad!</p>
</div>`;

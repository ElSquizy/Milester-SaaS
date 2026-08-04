/**
 * Matching de una lista pegada (de proveedor) contra el catálogo, para armar
 * campañas rápido. Filosofía: RECALL, no precisión — traemos los candidatos
 * más parecidos y el usuario elige. Mejor mostrar de más que esconder.
 *
 * Formato típico de línea (ver muestras reales):
 *   ● Mortal Kombat 11 Ultimate [PS5,PS4] —  $5.99
 * El "—" también aparece DENTRO de nombres ("Baldur's Gate 3 — Digital Deluxe"),
 * así que parseamos desde la derecha: primero el precio, después [plataformas].
 */

export type ParsedLine = { raw: string; title: string; platforms: string[]; usd: number | null };

export type MatchCandidate = {
  id: number;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  price: number;
  score: number;
  confidence: "alta" | "media" | "baja";
  platform: string;   // "PS5" | "PS4" | "PS4+PS5" | "?"
  acct: string;       // "primaria" | "secundaria" | "—"
};

export type MatchResult = { line: ParsedLine; candidates: MatchCandidate[] };

export type MatchProduct = { id: number; name: string; sku: string | null; imageUrl: string | null; price: number };

/** Parsea una línea cruda. Devuelve null si queda vacía. */
export function parseLine(raw: string): ParsedLine | null {
  let s = raw.replace(/^[\s●•*▪◦·\-–—]+/, "").trim();
  if (!s) return null;

  // Precio al final: $5.99 / $ 1.234,56
  const usdM = s.match(/\$\s*([\d.,]+)\s*$/);
  const usd = usdM ? parseFloat(usdM[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : null;
  if (usdM) s = s.slice(0, usdM.index).replace(/[—–-]\s*$/, "").trim();

  // [plataformas] al final: [PS5] / [PS5,PS4]
  const platM = s.match(/\[([^\]]*)\]\s*$/);
  let platforms: string[] = [];
  if (platM) {
    platforms = platM[1].split(/[,/]/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    s = s.slice(0, platM.index).trim();
  }
  return { raw, title: s, platforms, usd };
}

export function parseList(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map(parseLine).filter((l): l is ParsedLine => l != null && l.title.length > 0);
}

// Palabras de edición / relleno que NO deben pesar en el match (mejora el recall:
// "Battlefield 1 Revolution" matchea "Battlefield 1"). Números y romanos se
// CONSERVAN (distinguen secuelas: VII vs VIII, 2 vs 3).
const NOISE = new Set([
  "edition", "standard", "complete", "definitive", "remastered", "ultimate", "gold",
  "deluxe", "digital", "enhanced", "goty", "game", "of", "the", "year", "collection",
  "edicion", "version", "remaster", "premium", "and", "de", "la", "el", "los",
]);

function stripDecorations(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/＆/g, "&")
    .replace(/\[[^\]]*\]/g, " ")     // [PS5], [SECUNDARIA]…
    .replace(/\([^)]*\)/g, " ")      // (…)
    .replace(/\|.*$/, " ")            // "| 2x1"
    .replace(/[‒-―]/g, " ") // en/em dashes
    .toLowerCase();
}

/** Tokens significativos de un título (sin ruido de edición, con números/romanos). */
export function tokens(name: string): string[] {
  return stripDecorations(name)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t));
}

export function platformsOf(name: string): string[] {
  const u = name.toUpperCase();
  const out: string[] = [];
  if (/PS5/.test(u)) out.push("PS5");
  if (/PS4/.test(u)) out.push("PS4");
  return out;
}

export function acctOf(name: string, sku: string | null): string {
  const u = (name + " " + (sku ?? "")).toUpperCase();
  if (/SECUNDARIA|\bSEC[-\s]/.test(u)) return "secundaria";
  if (/PRIMARIA|\bPRIM[-\s]/.test(u)) return "primaria";
  return "—";
}

/** Índice pre-tokenizado del catálogo (calcularlo una vez por request). */
export type IndexedProduct = MatchProduct & { toks: string[]; plats: string[] };
export function indexProducts(products: MatchProduct[]): IndexedProduct[] {
  return products.map((p) => ({ ...p, toks: tokens(p.name), plats: platformsOf(p.name) }));
}

function scoreTokens(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of new Set(a)) if (setB.has(t)) shared++;
  if (shared === 0) return 0;
  const coverage = shared / new Set(a).size;                 // cuánto de la LÍNEA aparece
  const union = new Set([...a, ...b]).size;
  const jaccard = shared / union;
  return 0.6 * coverage + 0.4 * jaccard;                     // recall-first, pero penaliza tokens de más
}

const conf = (s: number): MatchCandidate["confidence"] => (s >= 0.75 ? "alta" : s >= 0.45 ? "media" : "baja");

/** Matchea una lista parseada contra el índice del catálogo. */
export function matchLines(lines: ParsedLine[], index: IndexedProduct[], perLine = 6): MatchResult[] {
  return lines.map((line) => {
    const lt = tokens(line.title);
    const scored = index
      .map((p) => {
        let s = scoreTokens(lt, p.toks);
        if (s <= 0) return null;
        // Pequeño empujón si la plataforma de la línea coincide con la del producto.
        if (line.platforms.length && p.plats.some((pl) => line.platforms.includes(pl))) s = Math.min(1, s + 0.05);
        return { p, s };
      })
      .filter((x): x is { p: IndexedProduct; s: number } => x != null)
      .sort((a, b) => b.s - a.s)
      .slice(0, perLine);

    const candidates: MatchCandidate[] = scored.map(({ p, s }) => ({
      id: p.id, name: p.name, sku: p.sku, imageUrl: p.imageUrl, price: p.price,
      score: Math.round(s * 100) / 100,
      confidence: conf(s),
      platform: p.plats.join("+") || "?",
      acct: acctOf(p.name, p.sku),
    }));
    return { line, candidates };
  });
}

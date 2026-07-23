// Backup de los datos PROPIOS de la aplicación — los que NO se pueden
// reconstruir desde Tienda Nube. El espejo comercial (productos, órdenes web,
// clientes de TN) no se exporta: se reconstruye con el pull (ver
// docs/arquitectura.md → Reconstrucción).
//
// Uso:  node scripts/backup.mjs
// Sale: backups/backup-<fecha>.json   (la carpeta está en .gitignore — el
//       archivo incluye credenciales de Settings; NUNCA lo subas al repo)
//
// Incluye mapas id→tiendaNubeId de productos, categorías y clientes: tras una
// reconstrucción los ids autoincrementales cambian, y el restore usa esos mapas
// para re-traducir las claves foráneas (CampaignItem.productId, etc.).
import { createClient } from "@libsql/client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }),
);
const url = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN;
if (!url) { console.error("Falta TURSO_DATABASE_URL (.env o entorno)"); process.exit(1); }
const db = createClient({ url, authToken });

const rows = async (sql) => (await db.execute(sql)).rows.map((r) => ({ ...r }));

const backup = {
  version: 2,
  createdAt: new Date().toISOString(),
  // ── Datos propios (irreconstruibles) ─────────────────────────────
  settings: await rows(`SELECT * FROM Settings`),
  campaigns: await rows(`SELECT * FROM Campaign`),
  campaignItems: await rows(`SELECT * FROM CampaignItem`),
  descriptionTemplates: await rows(`SELECT * FROM DescriptionTemplate`),
  imageTemplates: await rows(`SELECT * FROM ImageTemplate`),
  productTemplates: await rows(`SELECT * FROM ProductTemplate`),
  aiProviders: await rows(`SELECT * FROM AiProvider`),
  aiTemplates: await rows(`SELECT * FROM AiTemplate`),
  changelog: await rows(`SELECT * FROM Changelog`),
  transformationJobs: await rows(`SELECT * FROM TransformationJob`),
  transformationItems: await rows(`SELECT * FROM TransformationItem`),
  // Tickets manuales y sus ítems (source = local; TN no los conoce)
  localOrders: await rows(`SELECT * FROM "Order" WHERE source = 'local'`),
  localOrderItems: await rows(`SELECT oi.* FROM OrderItem oi JOIN "Order" o ON o.id = oi.orderId WHERE o.source = 'local'`),
  // Clientes creados a mano + decisiones de fusión
  localCustomers: await rows(`SELECT * FROM Customer WHERE tiendaNubeId IS NULL`),
  customerMerges: await rows(`SELECT id, tiendaNubeId, mergedIntoId FROM Customer WHERE mergedIntoId IS NOT NULL`),
  // Columnas propias que viven DENTRO de la tabla espejo Product
  productOwnColumns: await rows(`
    SELECT tiendaNubeId, costUsd, costUsdPromo, descriptionTemplateId, descriptionData,
           imageTemplateId, productImageUrl
    FROM Product
    WHERE tiendaNubeId IS NOT NULL
      AND (costUsd IS NOT NULL OR costUsdPromo IS NOT NULL OR descriptionTemplateId IS NOT NULL
           OR descriptionData IS NOT NULL OR imageTemplateId IS NOT NULL
           OR productImageUrl IS NOT NULL)`),
  // Snapshots de costo en ítems de órdenes web (los locales ya van completos)
  orderItemCosts: await rows(`
    SELECT oi.id, o.tiendaNubeId AS orderTnId, oi.productTnId, oi.costUsd
    FROM OrderItem oi JOIN "Order" o ON o.id = oi.orderId
    WHERE o.source != 'local' AND oi.costUsd IS NOT NULL`),
  // ── Mapas de traducción de ids (para el restore tras reconstrucción) ──
  productIdMap: await rows(`SELECT id, tiendaNubeId FROM Product WHERE tiendaNubeId IS NOT NULL`),
  categoryIdMap: await rows(`SELECT id, tiendaNubeId FROM Category`),
  customerIdMap: await rows(`SELECT id, tiendaNubeId FROM Customer WHERE tiendaNubeId IS NOT NULL`),
};

mkdirSync(join(root, "backups"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = join(root, "backups", `backup-${stamp}.json`);
writeFileSync(file, JSON.stringify(backup, (_, v) => (typeof v === "bigint" ? Number(v) : v)));

console.log("Backup escrito:", file);
for (const [k, v] of Object.entries(backup)) {
  if (Array.isArray(v)) console.log(`  ${k.padEnd(22)} ${v.length}`);
}

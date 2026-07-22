// Restaura un backup de scripts/backup.mjs sobre una base RECONSTRUIDA
// (migraciones aplicadas + pull completo desde Tienda Nube ya corrido, así los
// productos/categorías/clientes de TN existen con sus ids nuevos).
//
// Uso:  node scripts/restore.mjs --file backups/backup-....json          (dry-run)
//       node scripts/restore.mjs --file backups/backup-....json --apply  (escribe)
//
// Las tablas propias solo se restauran si están VACÍAS (evita duplicar si se
// corre dos veces). Las claves foráneas hacia productos/categorías/clientes se
// re-traducen vía tiendaNubeId con los mapas incluidos en el backup; lo que no
// se puede traducir se reporta y se salta — nunca se inserta un FK colgante.
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const fileArg = args[args.indexOf("--file") + 1];
const apply = args.includes("--apply");
if (!fileArg || args.indexOf("--file") === -1) { console.error("Uso: node scripts/restore.mjs --file <backup.json> [--apply]"); process.exit(1); }

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }),
);
const db = createClient({ url: process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN });
const B = JSON.parse(readFileSync(fileArg, "utf8"));
console.log(`Backup ${fileArg} · versión ${B.version} · creado ${B.createdAt}`);
console.log(apply ? "MODO APPLY — se escribe en la base\n" : "MODO DRY-RUN — no se escribe nada (agregá --apply)\n");

const count = async (t) => Number((await db.execute(`SELECT COUNT(*) c FROM "${t}"`)).rows[0].c);
const skipped = [];

// Mapas actuales (base reconstruida) para traducir ids del backup → ids nuevos.
const nowMap = async (sql) => new Map((await db.execute(sql)).rows.map((r) => [String(r.tiendaNubeId), Number(r.id)]));
const prodNow = await nowMap(`SELECT id, tiendaNubeId FROM Product WHERE tiendaNubeId IS NOT NULL`);
const catNow = await nowMap(`SELECT id, tiendaNubeId FROM Category`);
const custNow = await nowMap(`SELECT id, tiendaNubeId FROM Customer WHERE tiendaNubeId IS NOT NULL`);
const oldProdTn = new Map((B.productIdMap ?? []).map((r) => [Number(r.id), String(r.tiendaNubeId)]));
const oldCatTn = new Map((B.categoryIdMap ?? []).map((r) => [Number(r.id), String(r.tiendaNubeId)]));
const oldCustTn = new Map((B.customerIdMap ?? []).map((r) => [Number(r.id), String(r.tiendaNubeId)]));
const mapProd = (oldId) => (oldId == null ? null : prodNow.get(oldProdTn.get(Number(oldId))) ?? null);
const mapCat = (oldId) => (oldId == null ? null : catNow.get(oldCatTn.get(Number(oldId))) ?? null);
const mapCust = (oldId) => (oldId == null ? null : custNow.get(oldCustTn.get(Number(oldId))) ?? null);

const insert = async (table, row) => {
  const cols = Object.keys(row);
  if (!apply) return;
  await db.execute({
    sql: `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    args: cols.map((c) => (row[c] === undefined ? null : row[c])),
  });
};

async function restoreTable(table, rows, transform) {
  if (!rows?.length) { console.log(`${table}: nada en el backup`); return; }
  const existing = await count(table);
  if (existing > 0) { console.log(`${table}: la tabla ya tiene ${existing} filas — NO se restaura (guardia anti-duplicados)`); return; }
  let ok = 0;
  for (const raw of rows) {
    const row = transform ? transform({ ...raw }) : { ...raw };
    if (row === null) { skipped.push(`${table}#${raw.id}`); continue; }
    await insert(table, row);
    ok++;
  }
  console.log(`${table}: ${apply ? "restauradas" : "se restaurarían"} ${ok}/${rows.length}${rows.length - ok ? ` (${rows.length - ok} saltadas por FK intraducible)` : ""}`);
}

// ── Independientes ────────────────────────────────────────────────
await restoreTable("Settings", B.settings);
await restoreTable("DescriptionTemplate", B.descriptionTemplates);
await restoreTable("ImageTemplate", B.imageTemplates);
await restoreTable("ProductTemplate", B.productTemplates);
await restoreTable("AiProvider", B.aiProviders);
await restoreTable("AiTemplate", B.aiTemplates);

// ── Con FKs a la tabla espejo (traducidas por tiendaNubeId) ───────
await restoreTable("Campaign", B.campaigns, (r) => {
  if (r.addCategoryId != null) {
    const m = mapCat(r.addCategoryId);
    if (m == null) r.addCategoryId = null; // la categoría ya no existe: se degrada, no se pierde la campaña
    else r.addCategoryId = m;
  }
  return r;
});
await restoreTable("CampaignItem", B.campaignItems, (r) => {
  const m = mapProd(r.productId);
  if (m == null) return null; // el producto ya no está en TN — el snapshot no tiene a quién aplicar
  r.productId = m;
  return r;
});
await restoreTable("Changelog", B.changelog, (r) => {
  const m = mapProd(r.productId);
  if (m == null) return null;
  r.productId = m;
  return r;
});

// ── Clientes locales + tickets manuales ───────────────────────────
const localCustomerCount = Number((await db.execute(`SELECT COUNT(*) c FROM Customer WHERE tiendaNubeId IS NULL`)).rows[0].c);
const oldLocalToNew = new Map(); // id viejo de cliente local → id nuevo
if (B.localCustomers?.length && localCustomerCount === 0) {
  let ok = 0;
  for (const raw of B.localCustomers) {
    const row = { ...raw };
    const oldId = row.id; delete row.id; // id nuevo autoincremental
    if (row.mergedIntoId != null) row.mergedIntoId = mapCust(row.mergedIntoId); // hacia clientes TN
    if (apply) {
      const res = await db.execute({
        sql: `INSERT INTO Customer (${Object.keys(row).map((c) => `"${c}"`).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")}) RETURNING id`,
        args: Object.values(row).map((v) => (v === undefined ? null : v)),
      });
      oldLocalToNew.set(Number(oldId), Number(res.rows[0].id));
    }
    ok++;
  }
  console.log(`Customer (locales): ${apply ? "restaurados" : "se restaurarían"} ${ok}/${B.localCustomers.length}`);
} else if (B.localCustomers?.length) {
  console.log(`Customer (locales): ya hay ${localCustomerCount} — NO se restaura`);
}

const localOrderCount = Number((await db.execute(`SELECT COUNT(*) c FROM "Order" WHERE source = 'local'`)).rows[0].c);
if (B.localOrders?.length && localOrderCount === 0) {
  const oldOrderToNew = new Map();
  for (const raw of B.localOrders) {
    const row = { ...raw };
    const oldId = row.id; delete row.id;
    // customerId puede apuntar a un cliente TN (mapa) o a uno local (recién insertado)
    if (row.customerId != null) row.customerId = mapCust(row.customerId) ?? oldLocalToNew.get(Number(raw.customerId)) ?? null;
    if (apply) {
      const res = await db.execute({
        sql: `INSERT INTO "Order" (${Object.keys(row).map((c) => `"${c}"`).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")}) RETURNING id`,
        args: Object.values(row).map((v) => (v === undefined ? null : v)),
      });
      oldOrderToNew.set(Number(oldId), Number(res.rows[0].id));
    }
  }
  let items = 0;
  for (const raw of B.localOrderItems ?? []) {
    const row = { ...raw };
    delete row.id;
    row.orderId = oldOrderToNew.get(Number(raw.orderId));
    if (apply && row.orderId == null) { skipped.push(`OrderItem local #${raw.id}`); continue; }
    row.productId = mapProd(raw.productId); // puede quedar null: ítem libre o producto ya inexistente
    if (apply) await insert("OrderItem", row);
    items++;
  }
  console.log(`Order (tickets locales): ${apply ? "restaurados" : "se restaurarían"} ${B.localOrders.length} + ${items} ítems`);
} else if (B.localOrders?.length) {
  console.log(`Order (tickets locales): ya hay ${localOrderCount} — NO se restaura`);
}

// ── Re-aplicar columnas propias sobre el espejo (idempotente) ─────
let ownApplied = 0, ownMissing = 0;
for (const r of B.productOwnColumns ?? []) {
  const newId = prodNow.get(String(r.tiendaNubeId));
  if (newId == null) { ownMissing++; continue; }
  if (apply) {
    // Los ids de plantillas también se restauran arriba con sus ids ORIGINALES
    // (las tablas estaban vacías y el INSERT conserva el id del backup), así que
    // las referencias template↔producto siguen siendo válidas tal cual.
    await db.execute({
      sql: `UPDATE Product SET costUsd = ?, descriptionTemplateId = ?, descriptionData = ?, imageTemplateId = ?, productImageUrl = ? WHERE id = ?`,
      args: [r.costUsd ?? null, r.descriptionTemplateId ?? null, r.descriptionData ?? null, r.imageTemplateId ?? null, r.productImageUrl ?? null, newId],
    });
  }
  ownApplied++;
}
if (B.productOwnColumns?.length) console.log(`Product (columnas propias): ${apply ? "re-aplicadas" : "se re-aplicarían"} ${ownApplied}${ownMissing ? ` (${ownMissing} productos ya no existen en TN)` : ""}`);

// costUsd snapshoteado en ítems de órdenes web, re-unido por (orden TN, producto TN)
let costApplied = 0;
for (const r of B.orderItemCosts ?? []) {
  if (!apply) { costApplied++; continue; }
  const res = await db.execute({
    sql: `UPDATE OrderItem SET costUsd = ? WHERE productTnId = ? AND orderId = (SELECT id FROM "Order" WHERE tiendaNubeId = ?)`,
    args: [r.costUsd, r.productTnId, r.orderTnId],
  });
  if (res.rowsAffected > 0) costApplied++;
}
if (B.orderItemCosts?.length) console.log(`OrderItem.costUsd (órdenes web): ${apply ? "re-aplicados" : "se re-aplicarían"} ${costApplied}/${B.orderItemCosts.length}`);

// Fusiones de clientes TN (mergedIntoId), traducidas en ambos extremos
let merges = 0;
for (const r of B.customerMerges ?? []) {
  if (r.tiendaNubeId == null) continue; // fusiones de clientes locales van con localCustomers
  const self = custNow.get(String(r.tiendaNubeId));
  const target = mapCust(r.mergedIntoId);
  if (self == null || target == null) { skipped.push(`merge cliente ${r.tiendaNubeId}`); continue; }
  if (apply) await db.execute({ sql: `UPDATE Customer SET mergedIntoId = ? WHERE id = ?`, args: [target, self] });
  merges++;
}
if (B.customerMerges?.length) console.log(`Customer.mergedIntoId: ${apply ? "re-aplicadas" : "se re-aplicarían"} ${merges}/${B.customerMerges.length}`);

if (skipped.length) console.log(`\nSaltadas por referencia intraducible (${skipped.length}):`, skipped.slice(0, 20).join(", "), skipped.length > 20 ? "…" : "");
console.log(apply ? "\nRestore terminado." : "\nDry-run terminado. Nada se escribió.");

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
const adapter = new PrismaLibSql({ url: "file:./prisma/dev.db" });
const p = new PrismaClient({ adapter });
const s = await p.settings.findFirst();
const headers = { Authentication: `bearer ${s.accessToken}`, "User-Agent": "Milester SaaS (gaizka.qwerty@gmail.com)" };
const tnPrice = async (tnId) => (await (await fetch(`https://api.tiendanube.com/v1/${s.storeId}/products/${tnId}`, { headers })).json()).variants?.[0]?.price;

const camp = await p.campaign.findFirst({ where: { name: "TEST Scheduler" }, include: { items: true } });
const item = camp.items[0];
const prod = await p.product.findUnique({ where: { id: item.productId }, select: { tiendaNubeId: true, name: true } });
console.log("Producto:", prod.name);

// 1. Re-push with the variant fix
await fetch(`http://localhost:3000/api/products/${item.productId}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ sync: true }) });
await new Promise(r=>setTimeout(r,800));
console.log("Tras re-sync → TN precio:", await tnPrice(prod.tiendaNubeId), "(esperado 85950)");

// 2. Force end: set endDate in the past, tick
await p.campaign.update({ where: { id: camp.id }, data: { endDate: new Date(Date.now()-86400000) } });
const tick = await (await fetch("http://localhost:3000/api/campaigns/tick", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ force: true }) })).json();
console.log("Tick cierre:", JSON.stringify(tick));
await new Promise(r=>setTimeout(r,800));

const after = await p.campaign.findUnique({ where: { id: camp.id }, include: { items: true } });
const prodAfter = await p.product.findUnique({ where: { id: item.productId }, select: { price: true, tags: true, syncStatus: true } });
console.log("Campaña:", after.status, "| items conservados:", after.items.length);
console.log("Local precio:", prodAfter.price, "(esperado 95500) | tags:", prodAfter.tags, "| sync:", prodAfter.syncStatus);
console.log("TN precio restaurado:", await tnPrice(prod.tiendaNubeId), "(esperado 95500)");

// 3. Cleanup
await p.campaignItem.deleteMany({ where: { campaignId: camp.id } });
await p.campaign.delete({ where: { id: camp.id } });
console.log("Campaña de prueba eliminada.");
await p.$disconnect();

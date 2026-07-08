import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
const adapter = new PrismaLibSql({ url: "file:./prisma/dev.db" });
const p = new PrismaClient({ adapter });
// Seed a couple of incoming changes directly so we can view the UI without touching TN.
await p.incomingChange.deleteMany({});
await p.incomingChange.createMany({ data: [
  { tiendaNubeId: "350723858", productId: 1702, productName: "LEGO Batman 3 Beyond Gotham [PS4]", field: "price", localValue: "37000", remoteValue: "29900", conflict: false },
  { tiendaNubeId: "350723858", productId: 1702, productName: "LEGO Batman 3 Beyond Gotham [PS4]", field: "published", localValue: "Publicado", remoteValue: "Oculto", conflict: false },
  { tiendaNubeId: "999999", productId: 1, productName: "Marvel Cosmic Invasion [PS5]", field: "name", localValue: "Marvel Cosmic Invasion [PS5]", remoteValue: "Marvel Cosmic Invasion [PS5] - PREVENTA", conflict: true },
]});
console.log("seeded");
await p.$disconnect();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `sharp` es un módulo NATIVO (composición de imágenes). Si Next lo bundlea
  // dentro de la función serverless, en Vercel/Lambda (linux) no encuentra su
  // binario (@img/sharp-linux-x64) y tira 500 al cargar el módulo — aunque local
  // (Windows/Mac) ande. Declarándolo externo, se carga desde node_modules en
  // runtime con su binario de plataforma. Las rutas /api/sync y /api/sync/pull lo
  // importan por transitividad (campaignScheduler → sync → productImage → sharp).
  serverExternalPackages: ["sharp"],
};

export default nextConfig;

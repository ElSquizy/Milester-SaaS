import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `sharp` es un módulo NATIVO. Dos cosas hay que asegurar en Vercel/Lambda:
  //  1) No bundlearlo (se carga desde node_modules en runtime con su binario de
  //     plataforma) → serverExternalPackages.
  //  2) Que su librería nativa hermana (@img/sharp-libvips-linux-x64, que provee
  //     libvips-cpp.so) viaje DENTRO del bundle de las funciones. Next traza el
  //     .node de sharp pero puede dejar afuera el .so → ERR_DLOPEN_FAILED
  //     "libvips-cpp.so: cannot open shared object file". Forzamos incluir @img/*.
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@img/**/*"],
  },
};

export default nextConfig;

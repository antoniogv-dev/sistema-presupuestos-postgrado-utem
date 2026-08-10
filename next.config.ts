import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  typedRoutes: false,
  // Requerido por OpenNext para que Prisma y el cliente generado se incluyan
  // correctamente en el bundle destinado al runtime workerd de Cloudflare.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

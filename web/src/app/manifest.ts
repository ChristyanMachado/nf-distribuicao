import type { MetadataRoute } from "next";

/**
 * Manifesto explícito para que a instalação pelo Chrome use a mesma marca
 * exibida no Web. Os nomes versionados dos arquivos evitam reutilizar o
 * JPG e o favicon antigos em instalações que já tinham visitado o sistema.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Graalyst | Distribuição & Notas",
    short_name: "Graalyst NF",
    description: "Distribuição de produtos e emissão de notas fiscais",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f2",
    theme_color: "#fbf8f2",
    icons: [
      {
        src: "/brand/graalyst-icon-192-v1.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/graalyst-icon-512-v1.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Senchy — Voyages à vélo",
    short_name: "Senchy",
    description:
      "Planifie tes voyages à vélo : itinéraires GPX, segments, nuits et cartes.",
    start_url: "/",
    display: "standalone",
    background_color: "#9AAB92", // = fond du logo → écran de démarrage raccord avec l'icône
    theme_color: "#9AAB92",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SP Plast OS — Factory Production & Material Intelligence",
    short_name: "SP Plast OS",
    description: "Production and material intelligence, wherever work happens.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F3F4EF",
    theme_color: "#173C35",
    lang: "en-IN",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Grinding entry", url: "/production/grinding" },
      { name: "Bag calculator", url: "/calculator" },
    ],
  };
}

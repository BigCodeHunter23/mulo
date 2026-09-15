import type { MetadataRoute } from "next";

/** Lets MULO be added to a phone's home screen and open like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MULO — For Music Lovers",
    short_name: "MULO",
    description:
      "Rate and review the music you listen to, and see what the people you follow are playing.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0e",
    theme_color: "#0b0b0e",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}

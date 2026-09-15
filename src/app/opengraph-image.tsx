import { brandCard, ogFonts } from "@/lib/og";

export const alt = "MULO — every record, rated by people you trust";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return brandCard(await ogFonts());
}

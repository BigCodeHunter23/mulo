import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { preconnect } from "react-dom";
import Header from "@/components/Header";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const description =
  "Rate and review the music you listen to, and see what the people you follow are playing.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "MULO — For Music Lovers", template: "%s · MULO" },
  description,
  applicationName: "MULO",
  openGraph: {
    type: "website",
    siteName: "MULO",
    title: "MULO — For Music Lovers",
    description,
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: {
    capable: true,
    title: "MULO",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Covers and avatars load from Supabase storage; open that connection early.
  preconnect(process.env.NEXT_PUBLIC_SUPABASE_URL!);

  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-text">
        <Header />
        {children}
      </body>
    </html>
  );
}

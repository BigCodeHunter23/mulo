import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MULO — For Music Lovers",
  description:
    "Rate and review the music you listen to, and see what the people you follow are playing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-text">
        <Header />
        {children}
      </body>
    </html>
  );
}

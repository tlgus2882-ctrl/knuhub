import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font for the KNU Hub wordmark in the header.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "KNU Hub",
  description: "강남대 과제 공유 & 리뷰 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

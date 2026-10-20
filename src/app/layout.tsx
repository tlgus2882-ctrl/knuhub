import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { Suspense } from "react";
import { RecentRecommendations } from "@/app/recommendations/recent-recommendations";
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
        {/* Beside the page only where the widest pages (max-w-5xl) still leave room; the home page lists it below that. */}
        <aside className="fixed top-24 right-4 hidden max-h-[calc(100vh-7rem)] w-56 overflow-y-auto 2xl:block">
          <Suspense>
            <RecentRecommendations />
          </Suspense>
        </aside>
      </body>
    </html>
  );
}

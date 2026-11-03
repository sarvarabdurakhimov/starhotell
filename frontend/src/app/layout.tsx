import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { PageTransitionProvider } from "@/components/PageTransitionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "StarHotel — Mehmonxona Boshqaruvi SaaS Tizimi",
  description: "O'zbekistondagi zamonaviy multi-tenant mehmonxona boshqaruv platformasi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-stone-100 antialiased selection:bg-amber-200 selection:text-stone-900 font-sans">
        <Providers>
          <PageTransitionProvider>
            {children}
          </PageTransitionProvider>
        </Providers>
      </body>
    </html>
  );
}

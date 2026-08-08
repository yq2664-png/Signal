import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthModal } from "@/components/auth/AuthModal";
import { AuthProvider } from "@/context/AuthContext";
import { BookmarksProvider } from "@/context/BookmarksContext";
import { FeedProvider } from "@/context/FeedContext";
import { LikesProvider } from "@/context/LikesContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIGNAL — AI Intelligence",
  description:
    "Transform scattered AI updates into ranked, actionable intelligence for product and design professionals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--bg)] text-[var(--text-primary)]">
        <AuthProvider>
          <FeedProvider>
            <LikesProvider>
              <BookmarksProvider>
                {children}
                <AuthModal />
              </BookmarksProvider>
            </LikesProvider>
          </FeedProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

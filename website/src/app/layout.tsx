import type { Metadata } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { config } from "@/lib/config";
import { auth } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdleLogout from "@/components/IdleLogout";
import { idleLogoutAction } from "@/app/session-actions";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: {
    default: `${config.siteName} — ${config.tagline}`,
    template: `%s | ${config.siteName}`,
  },
  description:
    "Premium multi-sport facility near Argyle, Texas. Cricket grounds, soccer fields, practice nets and training facility. Book by the hour.",
  openGraph: {
    title: `${config.siteName} — ${config.tagline}`,
    description:
      "Cricket • Soccer • Training • More. Premium sports destination near Argyle, Texas.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" className={`${inter.variable} ${barlow.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {session?.user && <IdleLogout action={idleLogoutAction} />}
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

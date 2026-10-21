import type { Metadata, Viewport } from "next";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import "./mobile.css";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  title: "SP Plast OS | Factory Production & Material Intelligence",
  description:
    "The factory, connected. Production, stock, color recipes and material traceability for SP Plast Industries.",
  applicationName: "SP Plast OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SP Plast OS",
    statusBarStyle: "default",
  },
  icons: { icon: "/icon.svg", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#173C35",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

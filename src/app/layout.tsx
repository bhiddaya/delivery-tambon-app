import type { Metadata, Viewport } from "next";
import "@fontsource/chonburi/400.css";
import "@fontsource/chonburi/thai-400.css";
import "@fontsource/kanit/400.css";
import "@fontsource/kanit/500.css";
import "@fontsource/kanit/600.css";
import "@fontsource/kanit/700.css";
import "@fontsource/kanit/thai-400.css";
import "@fontsource/kanit/thai-500.css";
import "@fontsource/kanit/thai-600.css";
import "@fontsource/kanit/thai-700.css";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/thai-400.css";
import "@fontsource/ibm-plex-sans-thai/thai-500.css";
import "@fontsource/ibm-plex-sans-thai/thai-600.css";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import LiffProvider from "@/components/LiffProvider";
// ฟอนต์ทั้งหมด self-host ผ่าน @fontsource (แพ็กเกจ npm) แทน next/font/google
// เพราะ Google Fonts CDN อาจถูกบล็อกในบางเครือข่าย/สภาพแวดล้อม build — self-host ทำงานได้แน่นอนกว่า

export const metadata: Metadata = {
  title: "บวรไทย ตำบลบุ่งไหม",
  description: "ระบบ Delivery ระดับตำบล — ส่งอาหาร ส่งของ เรียกรถ ในแอปเดียว",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "บวรไทย ตำบลบุ่งไหม",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#2e3e68",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="antialiased">
        <LiffProvider>{children}</LiffProvider>
        <PwaRegister />
      </body>
    </html>
  );
}

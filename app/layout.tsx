import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resoul 後台管理",
  description: "Resoul 內部管理系統",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

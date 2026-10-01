import type { Metadata } from "next";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-serif-kr/500.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "restory — 나의 감상 기록",
  description: "작품을 만난 시간과 그때의 감상을 기록하고 다시 꺼내봅니다.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

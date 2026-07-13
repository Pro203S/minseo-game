import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import FontReady from "@/components/FontReady";
import { Suspense } from "react";

const pretendard = localFont({
    src: "../../public/PretendardVariable.ttf",
    variable: "--font-pretendard",
    display: "block",
    preload: true,
});

export const metadata: Metadata = {
    title: "민서가 좋아하는 랜덤게임",
    description: "게임 추천 사이트",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" className={pretendard.variable}>
            <body className="fontLoading">
                <FontReady />
                <Suspense defer fallback={null}>
                    {children}
                </Suspense>
            </body>
        </html>
    );
}

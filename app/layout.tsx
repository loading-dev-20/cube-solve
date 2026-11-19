import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rubik's Cube Solver",
  description: "Enter your scrambled Rubik's cube and get a step-by-step solution.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

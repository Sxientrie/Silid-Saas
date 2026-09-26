import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
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
  title: "Silid Frontdesk",
  description: "Offline-first front desk for hotel operations",
  applicationName: "Silid Frontdesk",
  appleWebApp: {
    capable: true,
    title: "Silid Desk",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Registers the service worker built by src/app/serwist/[path]/route.ts.
            The shell's own boot does not wait on it: the desk renders from the
            server or from the worker's runtime cache, and the worker is what
            makes the next cold boot work without a network.

            `reloadOnOnline={false}` is the load-bearing prop. Left at its
            default, the provider attaches `location.reload()` to the window's
            `online` event (@serwist/turbopack/dist/index.react.mjs:96-112), so
            every time the branch's link came back the desk would reload and
            throw away the live state: the queued-write indicator, the
            connectivity verdict, whatever the cashier had on screen. That is
            the opposite of the reconnection contract, which is drain first and
            refresh the read caches second (spec/offline-sync.md §5), and it is
            the order the desk's own reconnect path performs. `cacheOnNavigation`
            stays on: re-caching the current path when the link returns is
            useful, and caching the HTML is not reloading the page. */}
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}

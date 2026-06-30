import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"

export const metadata: Metadata = { title: "Maintenance Tracker" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="bg-slate-900 text-white px-6 py-4 flex gap-6 sticky top-0 z-50">
          <Link href="/" className="hover:text-blue-400">Home</Link>
          <Link href="/upload" className="hover:text-blue-400">Upload</Link>
          <Link href="/dashboard" className="hover:text-blue-400">Dashboard</Link>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  )
}

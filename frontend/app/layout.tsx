import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"
import Navbar from "@/components/Navbar";

export const metadata: Metadata = { title: "Maintenance Tracker" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
         {/*<nav className="bg-slate-800 text-white justify-between items-center px-12 py-4 flex gap-6 sticky top-0 z-50"> 
          <h1 className="text-xl text-white font-bold">HWY-K Maintenance Tracker</h1>
          <div className="flex gap-6 paddingLeft-2">
            <Link href="/" className="hover:text-blue-400">Home</Link>
            <Link href="/upload" className="hover:text-blue-400">Upload</Link>
            <Link href="/dashboard" className="hover:text-blue-400">Dashboard</Link>
            <Link href="/login" className="hover:text-blue-400">Login</Link>
          </div>
        </nav>*/}

        <main>{children}</main>
      </body>
    </html>
  )
}

"use client"; // Required for useState and usePathname hooks

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname(); // Tracks current route to highlight active link

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Employees", href: "/dashboard" },
    { name: "Equipment", href: "/equipment" },
    { name: "Contact", href: "/contact" },
  ];

  return (
    <nav className="bg-slate-900 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo Section */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-xl font-bold tracking-wider">
              HWY-K Maintenance Tracker
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => console.log("clicked", link.href)}

                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive 
                        ? "bg-slate-800 text-teal-400" 
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

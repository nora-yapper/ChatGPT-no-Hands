"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const INTERFACES = [
  { href: "/lab", label: "INPUT LAB" },
  { href: "/chat", label: "ISNT" },
];

/** Tab strip to switch between the two interfaces. Both share the same camera + gesture pipeline. */
export function InterfaceSwitcher() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center rounded border border-lab-border font-mono text-[10px] tracking-[0.18em]">
      {INTERFACES.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`px-2 py-1 transition-colors ${active ? "bg-lab-accent/15 text-lab-accent" : "text-lab-dim hover:text-lab-fg"}`}
            aria-current={active ? "page" : undefined}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function TopNav() {
  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="group inline-flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500/70 via-violet-500/60 to-cyan-400/60 shadow-neonSm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">Apex Resume</div>
            <div className="text-xs text-white/60">AI PDF Engine</div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link href="/upload">
            <Button variant="outline" size="lg">
              Upload
            </Button>
          </Link>
          <Link href="/upload">
            <Button size="lg">Get Started</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

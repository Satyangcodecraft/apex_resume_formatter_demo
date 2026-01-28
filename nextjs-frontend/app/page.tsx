import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-aurora p-10 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_120px_rgba(0,0,0,0.55)]">
          <div className="absolute inset-0 bg-grid [background-size:24px_24px] opacity-30" />
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="absolute left-1/3 top-2/3 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/70 backdrop-blur">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              AI → Template → Client-Ready PDF
            </div>

            <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight">
              Turn a Word resume into a premium PDF in seconds.
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-base text-white/70">
              Upload a .docx file. Our AI extracts the content, structures it, and renders a
              clean PDF resume with professional spacing.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/upload">
                <Button size="xl">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/upload">
                <Button variant="outline" size="xl">
                  Try a Demo Upload
                </Button>
              </Link>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent" />
                <CardHeader className="relative text-sm font-semibold">Upload</CardHeader>
                <CardContent className="relative text-sm text-white/70">
                  Drag & drop your DOCX. Nothing is stored.
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent" />
                <CardHeader className="relative text-sm font-semibold">Understand</CardHeader>
                <CardContent className="relative text-sm text-white/70">
                  AI generates structured JSON fields (skills, experience, education).
                </CardContent>
              </Card>
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent" />
                <CardHeader className="relative text-sm font-semibold">Deliver</CardHeader>
                <CardContent className="relative text-sm text-white/70">
                  We render a polished template and return a downloadable PDF.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

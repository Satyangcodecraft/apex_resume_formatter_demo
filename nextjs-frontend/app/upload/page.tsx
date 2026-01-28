"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Download, FileText, UploadCloud } from "lucide-react";

import { NeonSpinner } from "@/components/neon-spinner";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Stage = "idle" | "uploading" | "processing" | "ready" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [jdText, setJdText] = useState<string>("");
  const [requirementsNumber, setRequirementsNumber] = useState<string>("");
  const [birthMMDD, setBirthMMDD] = useState<string>("");
  const [willingToRelocate, setWillingToRelocate] = useState<"Yes" | "No">(
    "Yes"
  );

  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:8000";

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reqDigits = requirementsNumber.replace(/\D+/g, "");
    const birthDigits = birthMMDD.replace(/\D+/g, "");
    if (!reqDigits) {
      setError("Please enter the Requirements number.");
      setStage("error");
      return;
    }
    if (!birthDigits) {
      setError("Please enter Birth MMDD (digits only, e.g. 0104).\n");
      setStage("error");
      return;
    }

    const lower = file.name.toLowerCase();
    if (!(lower.endsWith(".docx") || lower.endsWith(".doc"))) {
      setError(
        `Selected file "${file.name}" is not a .docx or .doc. Please upload a Word resume (.docx or .doc).`
      );
      setStage("error");
      return;
    }

    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl("");
    }

    setError("");
    setStage("uploading");
    setProgress(12);

    const form = new FormData();
    form.append("file", file);
    form.append("willing_to_relocate", willingToRelocate);
    form.append("jd_text", jdText);

    try {
      setStage("processing");
      setProgress(28);

      const res = await fetch(`${apiBase}/extract-file`, {
        method: "POST",
        body: form
      });

      setProgress(72);

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Processing failed");
      }

      const data = (await res.json()) as {
        diagnostics_id: string;
        structured: unknown;
      };

      sessionStorage.setItem(
        "apex_review_payload",
        JSON.stringify({
          diagnostics_id: data.diagnostics_id,
          structured: data.structured,
          apiBase,
          requirements_number: reqDigits,
          birth_mmdd: birthDigits,
        })
      );

      setProgress(100);
      setStage("ready");
      router.push("/review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setStage("error");
      setProgress(0);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"]
    }
  });

  const statusText = useMemo(() => {
    switch (stage) {
      case "uploading":
        return "Uploading…";
      case "processing":
        return "AI is extracting your resume into structured data…";
      case "ready":
        return "Redirecting to review…";
      case "error":
        return "We hit an issue.";
      default:
        return "Drop your .docx resume here.";
    }
  }, [stage]);

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-10">
        <div className="grid gap-6 md:grid-cols-[1.3fr_0.7fr]">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10" />
            <CardHeader className="relative">
              <div className="text-sm text-white/60">Upload</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">
                Resume Processor
              </div>
              <div className="mt-2 text-sm text-white/70">
                DOCX → AI JSON → Template → PDF
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="mb-6">
                <div className="text-sm font-semibold">Job Description (optional)</div>
                <div className="mt-1 text-xs text-white/60">
                  Paste the JD to compute the Relevant Skills table (skills + estimated years).
                </div>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste job description here…"
                  className="mt-3 min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80 placeholder:text-white/40 outline-none ring-0 backdrop-blur focus:border-cyan-400/40"
                />
              </div>

              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold">Requirements number</div>
                  <div className="mt-1 text-xs text-white/60">Digits only (example: 10508770).</div>
                  <input
                    value={requirementsNumber}
                    onChange={(e) => setRequirementsNumber(e.target.value)}
                    placeholder="10508770"
                    className="mt-3 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 placeholder:text-white/40 outline-none ring-0 backdrop-blur focus:border-cyan-400/40"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold">Birth MMDD</div>
                  <div className="mt-1 text-xs text-white/60">Digits only (example: 0104).</div>
                  <input
                    value={birthMMDD}
                    onChange={(e) => setBirthMMDD(e.target.value)}
                    placeholder="0104"
                    className="mt-3 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 placeholder:text-white/40 outline-none ring-0 backdrop-blur focus:border-cyan-400/40"
                  />
                </div>
              </div>

              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Willing to Relocate?</div>
                  <div className="mt-1 text-xs text-white/60">
                    This will be placed in the cover table.
                  </div>
                </div>

                <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 p-1 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setWillingToRelocate("Yes")}
                    className={[
                      "h-9 rounded-full px-4 text-sm transition-all",
                      willingToRelocate === "Yes"
                        ? "bg-gradient-to-r from-indigo-500/80 via-violet-500/80 to-cyan-400/80 text-black shadow-neonSm"
                        : "text-white/70 hover:text-white"
                    ].join(" ")}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWillingToRelocate("No")}
                    className={[
                      "h-9 rounded-full px-4 text-sm transition-all",
                      willingToRelocate === "No"
                        ? "bg-gradient-to-r from-indigo-500/80 via-violet-500/80 to-cyan-400/80 text-black shadow-neonSm"
                        : "text-white/70 hover:text-white"
                    ].join(" ")}
                  >
                    No
                  </button>
                </div>
              </div>

              <div
                {...getRootProps()}
                className={[
                  "group relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-8 text-center backdrop-blur transition-all",
                  isDragActive
                    ? "shadow-neon ring-1 ring-cyan-400/40"
                    : "hover:shadow-neon hover:ring-1 hover:ring-indigo-500/30"
                ].join(" ")}
              >
                <input {...getInputProps()} />

                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/0 via-violet-500/0 to-cyan-400/0 opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="relative flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-neonSm">
                    {stage === "processing" || stage === "uploading" ? (
                      <NeonSpinner />
                    ) : (
                      <UploadCloud className="h-6 w-6 text-cyan-300" />
                    )}
                  </div>

                  <div className="text-sm font-medium">{statusText}</div>
                  <div className="text-xs text-white/60">
                    Only .docx • No storage • Instant PDF
                  </div>

                  {(stage === "uploading" || stage === "processing" || stage === "ready") && (
                    <div className="mt-4 w-full max-w-md">
                      <Progress value={progress} />
                      <div className="mt-2 text-xs text-white/50">
                        {progress}%
                      </div>
                    </div>
                  )}

                  {stage === "error" && (
                    <div className="mt-4 w-full max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left text-xs text-red-200">
                      {error || "Unknown error"}
                    </div>
                  )}

                  {stage === "ready" && pdfUrl && (
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <a href={pdfUrl} download="resume.pdf">
                        <Button size="xl">
                          <Download className="h-4 w-4" /> Download PDF
                        </Button>
                      </a>
                      <Button
                        variant="outline"
                        size="xl"
                        onClick={() => {
                          URL.revokeObjectURL(pdfUrl);
                          setPdfUrl("");
                          setStage("idle");
                          setProgress(0);
                          setError("");
                        }}
                      >
                        Upload Another
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent" />
              <CardHeader className="relative text-sm font-semibold">
                Recommended input
              </CardHeader>
              <CardContent className="relative text-sm text-white/70">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg border border-white/10 bg-white/5 p-2">
                    <FileText className="h-4 w-4 text-white/80" />
                  </div>
                  <div>
                    Use a standard resume DOCX with clear section headings.
                    <div className="mt-2 text-xs text-white/50">
                      Tip: include email/phone in the header for best extraction.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent" />
              <CardHeader className="relative text-sm font-semibold">
                Demo constraints
              </CardHeader>
              <CardContent className="relative text-sm text-white/70">
                This demo stores nothing. Files are processed in-memory and returned as a
                PDF.
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

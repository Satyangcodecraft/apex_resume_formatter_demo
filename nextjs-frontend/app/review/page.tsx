"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ArrowLeft, Braces, SlidersHorizontal } from "lucide-react";

import { NeonSpinner } from "@/components/neon-spinner";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Mode = "form" | "json";

type ReviewPayload = {
  diagnostics_id: string;
  structured: any;
  apiBase: string;
  requirements_number?: string;
  birth_mmdd?: string;
  birth_yymm?: string;
};

type Stage = "idle" | "loading" | "ready" | "rendering" | "error";

function safeJsonStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "{}";
  }
}

function normalizeStringList(input: string) {
  const parts = input
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export default function ReviewPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string>("");

  const [mode, setMode] = useState<Mode>("form");

  const [apiBase, setApiBase] = useState<string>(
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000"
  );
  const [diagnosticsId, setDiagnosticsId] = useState<string>("");
  const [requirementsNumber, setRequirementsNumber] = useState<string>("");
  const [birthMMDD, setBirthMMDD] = useState<string>("");

  const [structured, setStructured] = useState<any>(null);
  const [jsonText, setJsonText] = useState<string>("{}");
  const [jsonError, setJsonError] = useState<string>("");

  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [diagError, setDiagError] = useState<string>("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("apex_review_payload");
      if (!raw) {
        setStage("error");
        setError("Missing review payload. Please upload a resume again.");
        return;
      }
      const parsed = JSON.parse(raw) as ReviewPayload;
      setApiBase(parsed.apiBase || apiBase);
      setDiagnosticsId(parsed.diagnostics_id || "");
      setRequirementsNumber(String(parsed.requirements_number || ""));
      setBirthMMDD(String(parsed.birth_mmdd || parsed.birth_yymm || ""));
      setStructured(parsed.structured || {});
      setJsonText(safeJsonStringify(parsed.structured || {}));
      setStage("ready");
    } catch {
      setStage("error");
      setError("Failed to load review payload. Please upload again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const did = (diagnosticsId || "").trim();
    if (!did) return;

    let cancelled = false;
    (async () => {
      try {
        setDiagError("");
        const res = await fetch(`${apiBase}/diagnostics/${did}`);
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Failed to load diagnostics");
        }
        const data = await res.json();
        if (!cancelled) setDiagnostics(data);
      } catch (e) {
        if (!cancelled) setDiagError(e instanceof Error ? e.message : "Failed to load diagnostics");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, diagnosticsId]);

  const headerText = useMemo(() => {
    if (stage === "loading") return "Loading review…";
    if (stage === "rendering") return "Generating PDF…";
    if (stage === "error") return "We hit an issue.";
    return "Review extracted data";
  }, [stage]);

  const applyJsonToState = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setStructured(parsed);
      setJsonError("");
      return true;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return false;
    }
  };

  const updateStructured = (patch: any) => {
    const next = { ...(structured || {}), ...patch };
    setStructured(next);
    setJsonText(safeJsonStringify(next));
  };

  const onGeneratePdf = async () => {
    setError("");
    setJsonError("");

    const ok = mode === "json" ? applyJsonToState() : true;
    if (!ok) return;

    setStage("rendering");
    try {
      const res = await fetch(`${apiBase}/render-resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          diagnostics_id: diagnosticsId,
          requirements_number: requirementsNumber.replace(/\D+/g, ""),
          birth_mmdd: birthMMDD.replace(/\D+/g, ""),
          structured: structured || {}
        })
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Render failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
      const filename = (m?.[1] || "resume.pdf").trim();

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
      setStage("ready");
    } catch (e) {
      setStage("error");
      setError(e instanceof Error ? e.message : "Unexpected error");
    }
  };

  const form = structured || {};

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-white/60">Review</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{headerText}</div>
            <div className="mt-2 text-sm text-white/70">
              Edit extracted fields for maximum accuracy, then generate the final PDF.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => router.push("/upload")}
              disabled={stage === "rendering"}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => setMode(mode === "form" ? "json" : "form")}
              disabled={stage === "rendering"}
            >
              {mode === "form" ? (
                <Braces className="h-4 w-4" />
              ) : (
                <SlidersHorizontal className="h-4 w-4" />
              )}
              {mode === "form" ? "JSON" : "Form"}
            </Button>

            <Button size="lg" onClick={onGeneratePdf} disabled={stage === "rendering"}>
              {stage === "rendering" ? <NeonSpinner /> : <Download className="h-4 w-4" />}
              Generate PDF
            </Button>
          </div>
        </div>

        {stage === "error" && error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10" />
            <CardHeader className="relative">
              <div className="text-sm font-semibold">Extracted data</div>
              <div className="mt-1 text-xs text-white/60">
                Switch between Form mode and JSON mode. PDF is generated from the current state.
              </div>
            </CardHeader>
            <CardContent className="relative">
              {mode === "json" ? (
                <div>
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="min-h-[520px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                  />
                  {jsonError && (
                    <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                      {jsonError}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-white/50">Tip: keep keys exactly as generated.</div>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => {
                        applyJsonToState();
                      }}
                      disabled={stage === "rendering"}
                    >
                      Validate JSON
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-white/60">Requirements number</div>
                      <input
                        value={requirementsNumber}
                        onChange={(e) => setRequirementsNumber(e.target.value)}
                        placeholder="10508770"
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Birth MMDD</div>
                      <input
                        value={birthMMDD}
                        onChange={(e) => setBirthMMDD(e.target.value)}
                        placeholder="0104"
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-white/60">Name</div>
                      <input
                        value={String(form.name || "")}
                        onChange={(e) => updateStructured({ name: e.target.value })}
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Title</div>
                      <input
                        value={String(form.title || "")}
                        onChange={(e) => updateStructured({ title: e.target.value })}
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Email</div>
                      <input
                        value={String(form.email || "")}
                        onChange={(e) => updateStructured({ email: e.target.value })}
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Phone</div>
                      <input
                        value={String(form.phone || "")}
                        onChange={(e) => updateStructured({ phone: e.target.value })}
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Location</div>
                      <input
                        value={String(form.location || "")}
                        onChange={(e) => updateStructured({ location: e.target.value })}
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Willing to relocate</div>
                      <input
                        value={String(form.willing_to_relocate || "")}
                        onChange={(e) => updateStructured({ willing_to_relocate: e.target.value })}
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-white/60">Summary</div>
                    <textarea
                      value={String(form.summary || "")}
                      onChange={(e) => updateStructured({ summary: e.target.value })}
                      className="mt-2 min-h-[110px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-white/60">Skills (comma or newline separated)</div>
                      <textarea
                        value={(Array.isArray(form.skills) ? form.skills : []).join(", ")}
                        onChange={(e) => updateStructured({ skills: normalizeStringList(e.target.value) })}
                        className="mt-2 min-h-[110px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Links (one per line)</div>
                      <textarea
                        value={(Array.isArray(form.links) ? form.links : []).join("\n")}
                        onChange={(e) => updateStructured({ links: normalizeStringList(e.target.value) })}
                        className="mt-2 min-h-[110px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-white/60">Experience (JSON array)</div>
                      <textarea
                        value={safeJsonStringify(Array.isArray(form.experience) ? form.experience : [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateStructured({ experience: parsed });
                            setJsonError("");
                          } catch (err) {
                            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
                          }
                        }}
                        className="mt-2 min-h-[170px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Projects (JSON array)</div>
                      <textarea
                        value={safeJsonStringify(Array.isArray(form.projects) ? form.projects : [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateStructured({ projects: parsed });
                            setJsonError("");
                          } catch (err) {
                            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
                          }
                        }}
                        className="mt-2 min-h-[170px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-white/60">Education (JSON array)</div>
                      <textarea
                        value={safeJsonStringify(Array.isArray(form.education) ? form.education : [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateStructured({ education: parsed });
                            setJsonError("");
                          } catch (err) {
                            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
                          }
                        }}
                        className="mt-2 min-h-[170px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                    <div>
                      <div className="text-xs text-white/60">Certifications (JSON array)</div>
                      <textarea
                        value={safeJsonStringify(Array.isArray(form.certifications) ? form.certifications : [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateStructured({ certifications: parsed });
                            setJsonError("");
                          } catch (err) {
                            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
                          }
                        }}
                        className="mt-2 min-h-[170px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
                      />
                    </div>
                  </div>

                  {jsonError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                      {jsonError}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent" />
              <CardHeader className="relative">
                <div className="text-sm font-semibold">Diagnostics</div>
                <div className="mt-1 text-xs text-white/60">
                  Quickly see where data may have disappeared.
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-xs text-white/60">Diagnostics ID</div>
                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-white/80">
                  {diagnosticsId || "—"}
                </div>

                {diagError && (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                    {diagError}
                  </div>
                )}

                {diagnostics && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="text-xs font-semibold">Validation</div>
                      <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-white/70">
                        {String(diagnostics?.llm?.validation_error || "OK")}
                      </div>
                    </div>

                    <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-white/80">
                        Extracted text
                      </summary>
                      <pre className="mt-3 max-h-[280px] overflow-auto whitespace-pre-wrap text-[11px] text-white/70">
                        {String(diagnostics?.extracted_text || "")}
                      </pre>
                    </details>

                    <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-white/80">
                        Model raw JSON
                      </summary>
                      <pre className="mt-3 max-h-[280px] overflow-auto whitespace-pre-wrap text-[11px] text-white/70">
                        {String(diagnostics?.llm?.raw_model_json || "")}
                      </pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent" />
              <CardHeader className="relative text-sm font-semibold">Output</CardHeader>
              <CardContent className="relative text-sm text-white/70">
                Use “Generate PDF” after edits.
                <div className="mt-2 text-xs text-white/50">
                  Tip: If a section is missing, check “Extracted text” to see if it was lost before the AI step.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

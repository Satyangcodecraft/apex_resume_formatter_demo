"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ArrowLeft, Braces, ExternalLink, RefreshCw } from "lucide-react";

import { NeonSpinner } from "@/components/neon-spinner";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Mode = "preview" | "json";

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

function ensureArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function setAtIndex<T>(arr: T[], idx: number, value: T): T[] {
  const next = [...arr];
  next[idx] = value;
  return next;
}

function removeAtIndex<T>(arr: T[], idx: number): T[] {
  return arr.filter((_, i) => i !== idx);
}

function addEmpty<T>(arr: T[], v: T): T[] {
  return [...arr, v];
}

function EditableLine({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        className ||
        "w-full border-none bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
      }
    />
  );
}

function EditableBlock({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        className ||
        "w-full resize-none border-none bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
      }
      rows={3}
    />
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string>("");

  const [mode, setMode] = useState<Mode>("preview");
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

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

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [pdfPreviewName, setPdfPreviewName] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

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

  const updateExperienceAt = (idx: number, patch: any) => {
    const current = ensureArray<any>(structured?.experience);
    const nextItem = { ...(current[idx] || {}), ...patch };
    updateStructured({ experience: setAtIndex(current, idx, nextItem) });
  };

  const updateEducationAt = (idx: number, patch: any) => {
    const current = ensureArray<any>(structured?.education);
    const nextItem = { ...(current[idx] || {}), ...patch };
    updateStructured({ education: setAtIndex(current, idx, nextItem) });
  };

  const updateProjectsAt = (idx: number, patch: any) => {
    const current = ensureArray<any>(structured?.projects);
    const nextItem = { ...(current[idx] || {}), ...patch };
    updateStructured({ projects: setAtIndex(current, idx, nextItem) });
  };

  const updateCertsAt = (idx: number, patch: any) => {
    const current = ensureArray<any>(structured?.certifications);
    const nextItem = { ...(current[idx] || {}), ...patch };
    updateStructured({ certifications: setAtIndex(current, idx, nextItem) });
  };

  const parseFilenameFromHeaders = (res: Response) => {
    const cd = res.headers.get("content-disposition") || "";
    const m = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
    return (m?.[1] || "resume.pdf").trim();
  };

  const fetchRenderedPdf = async () => {
    const res = await fetch(`${apiBase}/render-resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        diagnostics_id: diagnosticsId,
        requirements_number: requirementsNumber.replace(/\D+/g, ""),
        birth_mmdd: birthMMDD.replace(/\D+/g, ""),
        structured: structured || {},
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Render failed");
    }

    const filename = parseFilenameFromHeaders(res);
    const blob = await res.blob();
    return { blob, filename };
  };

  const refreshPreview = async () => {
    setError("");
    setJsonError("");

    const ok = mode === "json" ? applyJsonToState() : true;
    if (!ok) return;

    setPreviewLoading(true);
    try {
      const { blob, filename } = await fetchRenderedPdf();
      const url = URL.createObjectURL(blob);
      setPdfPreviewName(filename);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const onGeneratePdf = async () => {
    setError("");
    setJsonError("");

    const ok = mode === "json" ? applyJsonToState() : true;
    if (!ok) return;

    setStage("rendering");
    try {
      const { blob, filename } = await fetchRenderedPdf();
      const url = URL.createObjectURL(blob);

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
              onClick={() => {
                setAdvancedOpen((v) => !v);
                setMode("preview");
              }}
              disabled={stage === "rendering"}
            >
              <Braces className="h-4 w-4" />
              Advanced
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
              <div className="text-sm font-semibold">Preview & edit</div>
              <div className="mt-1 text-xs text-white/60">
                Edit directly on the resume preview. PDF is generated from what you see here.
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid gap-6">
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

                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                  <div className="p-6">
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-[#9DC3E6] px-4 py-3 text-center text-sm font-bold">
                        Candidate Submittal Cover Page
                      </div>

                      <div className="grid grid-cols-3">
                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold">
                          Candidate Name:
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <EditableLine value={String(form.name || "")} onChange={(v) => updateStructured({ name: v })} />
                        </div>

                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold">
                          Phone Number:
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <EditableLine value={String(form.phone || "")} onChange={(v) => updateStructured({ phone: v })} />
                        </div>

                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold">
                          Email Address:
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <EditableLine value={String(form.email || "")} onChange={(v) => updateStructured({ email: v })} />
                        </div>

                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold">
                          Current location:
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <EditableLine
                            value={String(form.location || "")}
                            onChange={(v) => updateStructured({ location: v })}
                          />
                        </div>

                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold">
                          Willing to Relocate?
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <select
                            value={String(form.willing_to_relocate || "Yes") || "Yes"}
                            onChange={(e) => updateStructured({ willing_to_relocate: e.target.value })}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-300"
                          >
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>

                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold whitespace-pre-line">
                          Former TCS employee /\ncontractor?\n(Please specify employment type and when)
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <EditableBlock
                            value={String(form.former_tcs_employee_or_contractor || "")}
                            onChange={(v) => updateStructured({ former_tcs_employee_or_contractor: v })}
                            placeholder=""
                            className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 bg-[#9DC3E6] px-4 py-3 text-center text-sm font-bold">
                        General Interview Availability
                      </div>
                      <div className="bg-[#9DC3E6] px-4 py-3 text-center text-xs font-bold">
                        (ex. “Candidate is available every day during their lunch 12pm-1pm EST” OR “Candidate is available after 5pm EST everyday”)
                        <span className="text-red-600"> INCLUDE TIMEZONE</span>
                      </div>
                      <div className="grid grid-cols-3">
                        <div className="col-span-1 border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold whitespace-pre-line">
                          Candidate’s General\nAvailability:
                        </div>
                        <div className="col-span-2 border-t border-slate-200 px-3 py-2">
                          <EditableBlock
                            value={String(form.interview_availability || "")}
                            onChange={(v) => updateStructured({ interview_availability: v })}
                            placeholder=""
                            className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 bg-[#9DC3E6] px-4 py-3 text-center text-sm font-bold">
                        Relevant Skills
                      </div>
                      <div className="grid grid-cols-3">
                        <div className="border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold text-center whitespace-pre-line">
                          Mandatory Skills\n(As listed in JD)
                        </div>
                        <div className="border-t border-r border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold text-center whitespace-pre-line">
                          # of Years\nExperience
                        </div>
                        <div className="border-t border-slate-200 bg-[#D9EAF7] px-3 py-3 text-xs font-semibold text-center whitespace-pre-line">
                          Candidate’s relevant hands-on\nexperience
                        </div>

                        {[0, 1, 2, 3].map((i) => {
                          const rs = ensureArray<any>(form.relevant_skills);
                          const item = rs[i] || {};
                          return (
                            <div key={i} className="contents">
                              <div className="border-t border-r border-slate-200 px-3 py-2">
                                <EditableLine
                                  value={String(item.skill || "")}
                                  onChange={(v) => {
                                    const next = [...rs];
                                    next[i] = { ...(next[i] || {}), skill: v };
                                    updateStructured({ relevant_skills: next });
                                  }}
                                />
                              </div>
                              <div className="border-t border-r border-slate-200 px-3 py-2">
                                <EditableLine
                                  value={String(item.years_required || "")}
                                  onChange={(v) => {
                                    const next = [...rs];
                                    next[i] = { ...(next[i] || {}), years_required: v };
                                    updateStructured({ relevant_skills: next });
                                  }}
                                />
                              </div>
                              <div className="border-t border-slate-200 px-3 py-2">
                                <EditableLine
                                  value={String(item.years_hands_on || "")}
                                  onChange={(v) => {
                                    const next = [...rs];
                                    next[i] = { ...(next[i] || {}), years_hands_on: v };
                                    updateStructured({ relevant_skills: next });
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-sm font-bold">SUMMARY</div>
                      <div className="mt-2">
                        <EditableBlock
                          value={String(form.summary || "")}
                          onChange={(v) => updateStructured({ summary: v })}
                          placeholder=""
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                        />
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-sm font-bold">SKILLS</div>
                      <div className="mt-2">
                        <EditableBlock
                          value={ensureArray<string>(form.skills).join(", ")}
                          onChange={(v) => updateStructured({ skills: normalizeStringList(v) })}
                          placeholder=""
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                        />
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold">EXPERIENCE</div>
                        <button
                          className="text-xs font-semibold text-slate-700 underline"
                          onClick={() => {
                            const current = ensureArray<any>(form.experience);
                            updateStructured({
                              experience: addEmpty(current, {
                                company: "",
                                title: "",
                                start: "",
                                end: "",
                                location: "",
                                highlights: [],
                              }),
                            });
                          }}
                          type="button"
                        >
                          + Add experience
                        </button>
                      </div>

                      <div className="mt-3 grid gap-4">
                        {ensureArray<any>(form.experience).map((it, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="w-full">
                                    <div className="font-semibold">
                                      <EditableLine
                                        value={String(it?.company || "")}
                                        onChange={(v) => updateExperienceAt(idx, { company: v })}
                                        placeholder="Company"
                                        className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                                      />
                                    </div>
                                    <div className="mt-1 text-sm">
                                      <EditableLine
                                        value={String(it?.location || "")}
                                        onChange={(v) => updateExperienceAt(idx, { location: v })}
                                        placeholder="Location"
                                      />
                                    </div>
                                  </div>
                                  <div className="min-w-[160px] text-right text-sm font-semibold">
                                    <EditableLine
                                      value={
                                        [String(it?.start || "").trim(), String(it?.end || "").trim()]
                                          .filter(Boolean)
                                          .join(" to ")
                                      }
                                      onChange={(v) => {
                                        const parts = String(v || "").split(" to ");
                                        updateExperienceAt(idx, {
                                          start: (parts[0] || "").trim(),
                                          end: (parts[1] || "").trim(),
                                        });
                                      }}
                                      placeholder="Start to End"
                                      className="w-full border-none bg-transparent p-0 text-right text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                                    />
                                  </div>
                                </div>

                                <div className="mt-2 font-semibold">
                                  <EditableLine
                                    value={String(it?.title || "")}
                                    onChange={(v) => updateExperienceAt(idx, { title: v })}
                                    placeholder="Title"
                                    className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                                  />
                                </div>

                                <div className="mt-3">
                                  <div className="text-xs font-semibold text-slate-500">Highlights (one per line)</div>
                                  <textarea
                                    value={ensureArray<string>(it?.highlights).join("\n")}
                                    onChange={(e) =>
                                      updateExperienceAt(idx, {
                                        highlights: normalizeStringList(e.target.value),
                                      })
                                    }
                                    className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                                    rows={4}
                                  />
                                </div>
                              </div>

                              <button
                                className="text-xs font-semibold text-red-600 underline"
                                onClick={() => {
                                  const current = ensureArray<any>(form.experience);
                                  updateStructured({ experience: removeAtIndex(current, idx) });
                                }}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold">EDUCATION</div>
                        <button
                          className="text-xs font-semibold text-slate-700 underline"
                          onClick={() => {
                            const current = ensureArray<any>(form.education);
                            updateStructured({
                              education: addEmpty(current, {
                                school: "",
                                degree: "",
                                start: "",
                                end: "",
                                location: "",
                              }),
                            });
                          }}
                          type="button"
                        >
                          + Add education
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3">
                        {ensureArray<any>(form.education).map((it, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 grid gap-2 md:grid-cols-2">
                                <EditableLine
                                  value={String(it?.degree || "")}
                                  onChange={(v) => updateEducationAt(idx, { degree: v })}
                                  placeholder="Degree"
                                  className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                                />
                                <EditableLine
                                  value={String(it?.school || "")}
                                  onChange={(v) => updateEducationAt(idx, { school: v })}
                                  placeholder="School"
                                />
                                <EditableLine
                                  value={String(it?.start || "")}
                                  onChange={(v) => updateEducationAt(idx, { start: v })}
                                  placeholder="Start"
                                />
                                <EditableLine
                                  value={String(it?.end || "")}
                                  onChange={(v) => updateEducationAt(idx, { end: v })}
                                  placeholder="End"
                                />
                                <EditableLine
                                  value={String(it?.location || "")}
                                  onChange={(v) => updateEducationAt(idx, { location: v })}
                                  placeholder="Location"
                                />
                              </div>
                              <button
                                className="text-xs font-semibold text-red-600 underline"
                                onClick={() => {
                                  const current = ensureArray<any>(form.education);
                                  updateStructured({ education: removeAtIndex(current, idx) });
                                }}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold">PROJECTS</div>
                        <button
                          className="text-xs font-semibold text-slate-700 underline"
                          onClick={() => {
                            const current = ensureArray<any>(form.projects);
                            updateStructured({
                              projects: addEmpty(current, {
                                name: "",
                                description: "",
                                highlights: [],
                              }),
                            });
                          }}
                          type="button"
                        >
                          + Add project
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3">
                        {ensureArray<any>(form.projects).map((it, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <EditableLine
                                  value={String(it?.name || "")}
                                  onChange={(v) => updateProjectsAt(idx, { name: v })}
                                  placeholder="Project name"
                                  className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                                />
                                <div className="mt-2">
                                  <EditableBlock
                                    value={String(it?.description || "")}
                                    onChange={(v) => updateProjectsAt(idx, { description: v })}
                                    placeholder=""
                                    className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                                  />
                                </div>
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-slate-500">Highlights (one per line)</div>
                                  <textarea
                                    value={ensureArray<string>(it?.highlights).join("\n")}
                                    onChange={(e) =>
                                      updateProjectsAt(idx, { highlights: normalizeStringList(e.target.value) })
                                    }
                                    className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                                    rows={3}
                                  />
                                </div>
                              </div>
                              <button
                                className="text-xs font-semibold text-red-600 underline"
                                onClick={() => {
                                  const current = ensureArray<any>(form.projects);
                                  updateStructured({ projects: removeAtIndex(current, idx) });
                                }}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold">CERTIFICATIONS</div>
                        <button
                          className="text-xs font-semibold text-slate-700 underline"
                          onClick={() => {
                            const current = ensureArray<any>(form.certifications);
                            updateStructured({
                              certifications: addEmpty(current, {
                                name: "",
                                issuer: "",
                                date: "",
                              }),
                            });
                          }}
                          type="button"
                        >
                          + Add certification
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3">
                        {ensureArray<any>(form.certifications).map((it, idx) => (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 grid gap-2 md:grid-cols-3">
                                <EditableLine
                                  value={String(it?.name || "")}
                                  onChange={(v) => updateCertsAt(idx, { name: v })}
                                  placeholder="Certification"
                                  className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                                />
                                <EditableLine
                                  value={String(it?.issuer || "")}
                                  onChange={(v) => updateCertsAt(idx, { issuer: v })}
                                  placeholder="Issuer"
                                />
                                <EditableLine
                                  value={String(it?.date || "")}
                                  onChange={(v) => updateCertsAt(idx, { date: v })}
                                  placeholder="Date"
                                />
                              </div>
                              <button
                                className="text-xs font-semibold text-red-600 underline"
                                onClick={() => {
                                  const current = ensureArray<any>(form.certifications);
                                  updateStructured({ certifications: removeAtIndex(current, idx) });
                                }}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {advancedOpen && (
              <div className="space-y-6">
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 p-[1px]">
                  <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur">
                    <div className="px-6 py-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-white/90">TCS PDF preview</div>
                          <div className="mt-1 text-xs text-white/60">
                            Optional. Use to double-check the exact PDF that will download.
                          </div>
                          {pdfPreviewName && (
                            <div className="mt-3 max-w-full truncate rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-white/70">
                              {pdfPreviewName}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={refreshPreview}
                            disabled={stage === "rendering" || previewLoading}
                          >
                            {previewLoading ? <NeonSpinner /> : <RefreshCw className="h-4 w-4" />}
                            Refresh
                          </Button>

                          <Button
                            variant="outline"
                            size="lg"
                            onClick={() => {
                              if (!pdfPreviewUrl) return;
                              window.open(pdfPreviewUrl, "_blank", "noopener,noreferrer");
                            }}
                            disabled={!pdfPreviewUrl || previewLoading}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 pb-6">
                      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_30px_90px_rgba(0,0,0,0.55)]">
                        {pdfPreviewUrl ? (
                          <iframe
                            src={pdfPreviewUrl}
                            className="h-[740px] w-full bg-black"
                            title="PDF Preview"
                          />
                        ) : (
                          <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
                            <div className="text-sm font-semibold text-white/80">Preview not generated yet</div>
                            <div className="text-sm text-white/60">Click Refresh to render the PDF preview.</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Card className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent" />
                  <CardHeader className="relative">
                    <div className="text-sm font-semibold">Advanced</div>
                    <div className="mt-1 text-xs text-white/60">
                      For technical users only. You can edit the raw JSON used to build the PDF.
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setMode(mode === "preview" ? "json" : "preview")}
                      disabled={stage === "rendering"}
                    >
                      <Braces className="h-4 w-4" />
                      {mode === "preview" ? "Open JSON" : "Back to preview"}
                    </Button>

                    {mode === "json" && (
                      <div className="mt-4">
                        <textarea
                          value={jsonText}
                          onChange={(e) => setJsonText(e.target.value)}
                          className="min-h-[420px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs text-white/80 outline-none backdrop-blur focus:border-cyan-400/40"
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
                    )}

                    <div className="mt-6">
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
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

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

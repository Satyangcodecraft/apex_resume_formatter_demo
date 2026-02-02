import os
import json
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import FastAPI, Body, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
# from mangum import Mangum

from pydantic import BaseModel
from docx.opc.exceptions import PackageNotFoundError

from app.schemas import ResumeStructured
from app.schemas import RelevantSkillItem
from app.services.llm import extract_jd_required_skills, structure_resume_text, structure_resume_text_with_diagnostics
from app.settings import settings
from app.utils.docx_extract import extract_docx_text
from app.utils.pdf_convert import convert_docx_to_pdf
from app.utils.template import render_resume_docx

_STATE_TZ: dict[str, str] = {
    "AL": "America/Chicago",
    "AK": "America/Anchorage",
    "AZ": "America/Phoenix",
    "AR": "America/Chicago",
    "CA": "America/Los_Angeles",
    "CO": "America/Denver",
    "CT": "America/New_York",
    "DC": "America/New_York",
    "DE": "America/New_York",
    "FL": "America/New_York",
    "GA": "America/New_York",
    "HI": "Pacific/Honolulu",
    "IA": "America/Chicago",
    "ID": "America/Denver",
    "IL": "America/Chicago",
    "IN": "America/Indiana/Indianapolis",
    "KS": "America/Chicago",
    "KY": "America/New_York",
    "LA": "America/Chicago",
    "MA": "America/New_York",
    "MD": "America/New_York",
    "ME": "America/New_York",
    "MI": "America/Detroit",
    "MN": "America/Chicago",
    "MO": "America/Chicago",
    "MS": "America/Chicago",
    "MT": "America/Denver",
    "NC": "America/New_York",
    "ND": "America/Chicago",
    "NE": "America/Chicago",
    "NH": "America/New_York",
    "NJ": "America/New_York",
    "NM": "America/Denver",
    "NV": "America/Los_Angeles",
    "NY": "America/New_York",
    "OH": "America/New_York",
    "OK": "America/Chicago",
    "OR": "America/Los_Angeles",
    "PA": "America/New_York",
    "RI": "America/New_York",
    "SC": "America/New_York",
    "SD": "America/Chicago",
    "TN": "America/Chicago",
    "TX": "America/Chicago",
    "UT": "America/Denver",
    "VA": "America/New_York",
    "VT": "America/New_York",
    "WA": "America/Los_Angeles",
    "WI": "America/Chicago",
    "WV": "America/New_York",
    "WY": "America/Denver",
}


def _timezone_from_location(location: str) -> tuple[str, ZoneInfo]:
    loc = (location or "").strip()
    m = re.search(r"\b([A-Z]{2})\b", loc)
    state = m.group(1) if m else ""
    tz_name = _STATE_TZ.get(state, "America/New_York")
    return tz_name, ZoneInfo(tz_name)


def _next_weekdays(start: datetime, count: int) -> list[datetime]:
    days: list[datetime] = []
    cur = start
    while len(days) < count:
        cur = cur + timedelta(days=1)
        if cur.weekday() < 5:
            days.append(cur)
    return days


def _format_availability(d1: datetime, d2: datetime, start_t: time, end_t: time) -> str:
    # Example style: "9 January to 10 January 10:00 AM to 12:00 PM"
    d1s = d1.strftime("%-d %B")
    d2s = d2.strftime("%-d %B")
    ts = datetime.combine(d1.date(), start_t).strftime("%-I:%M %p")
    te = datetime.combine(d1.date(), end_t).strftime("%-I:%M %p")
    return f"{d1s} to {d2s} {ts} to {te}"


_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def _parse_month_year(s: str) -> Optional[datetime]:
    t = (s or "").strip().lower()
    if not t:
        return None

    if re.search(r"\b(present|current|till date|till now|to date|now)\b", t):
        return datetime.now()

    # 09/2022 or 9/2022
    m = re.search(r"\b(\d{1,2})\s*/\s*(\d{4})\b", t)
    if m:
        mon = int(m.group(1))
        yr = int(m.group(2))
        if 1 <= mon <= 12:
            return datetime(yr, mon, 1)

    # 2022-09 or 2022/09
    m = re.search(r"\b(\d{4})\s*[-/]\s*(\d{1,2})\b", t)
    if m:
        yr = int(m.group(1))
        mon = int(m.group(2))
        if 1 <= mon <= 12:
            return datetime(yr, mon, 1)

    # Sep'22 / Sep’22
    m = re.search(r"\b([a-z]{3,9})\s*[’']\s*(\d{2})\b", t)
    if m:
        mon = _MONTHS.get(m.group(1))
        yr2 = int(m.group(2))
        if mon:
            yr = 2000 + yr2 if yr2 <= 79 else 1900 + yr2
            return datetime(yr, mon, 1)

    m = re.search(r"\b([a-z]{3,9})\b\s*(\d{4})", t)
    if m:
        mon = _MONTHS.get(m.group(1))
        yr = int(m.group(2))
        if mon:
            return datetime(yr, mon, 1)

    y = re.search(r"\b(\d{4})\b", t)
    if y:
        return datetime(int(y.group(1)), 1, 1)

    return None


def _months_between(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> int:
    if not start_dt or not end_dt:
        return 0
    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt
    return max(0, (end_dt.year - start_dt.year) * 12 + (end_dt.month - start_dt.month) + 1)


def _months_span(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> set[tuple[int, int]]:
    if not start_dt or not end_dt:
        return set()
    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt

    months: set[tuple[int, int]] = set()
    y = start_dt.year
    m = start_dt.month
    while (y < end_dt.year) or (y == end_dt.year and m <= end_dt.month):
        months.add((y, m))
        m += 1
        if m == 13:
            m = 1
            y += 1
    return months


def _norm_text(s: str) -> str:
    return re.sub(r"[^a-z0-9+/]+", " ", (s or "").lower()).strip()


def _skill_in_text(skill: str, text: str) -> bool:
    sk_raw = (skill or "").strip()
    sk = _norm_text(sk_raw)
    if not sk:
        return False
    tx = _norm_text(text)

    variants: list[str] = [sk]

    # If JD skill contains slash-separated terms, treat each side as a possible match
    if "/" in sk_raw:
        parts = [p.strip() for p in sk_raw.split("/") if p.strip()]
        variants += parts

    # Common synonym/alias expansions
    if "ci/cd" in sk or "cicd" in sk:
        variants += ["ci cd", "pipelines", "pipeline", "build release", "deployment pipeline"]
    if sk in {"aws", "amazon web services"}:
        variants += ["amazon web services"]
    if sk in {"azure", "microsoft azure"}:
        variants += ["microsoft azure", "azure devops"]
    if sk == "kubernetes":
        variants += ["k8s"]
    if sk in {"terraform"}:
        variants += ["iac", "infrastructure as code"]
    if sk in {"docker"}:
        variants += ["containers", "containerization"]

    # normalize variants
    variants = [v for v in {_norm_text(v) for v in variants} if v]

    for v in variants:
        if not v:
            continue
        # basic containment for multi-word skills
        if v in tx:
            return True
        parts = [p for p in v.split() if p]
        if len(parts) == 1 and re.search(rf"\b{re.escape(parts[0])}\b", tx) is not None:
            return True
    # basic containment for multi-word skills
    return False


def _compute_relevant_skills_from_jd(jd_text: str, structured: ResumeStructured) -> list[RelevantSkillItem]:
    jd_items = extract_jd_required_skills(jd_text)
    if not jd_items:
        return []

    out: list[RelevantSkillItem] = []
    for jd in jd_items:
        skill = (jd.get("skill") or "").strip()
        years_required = (jd.get("years_required") or "").strip()
        if not skill:
            continue

        covered_months: set[tuple[int, int]] = set()
        matched_any = 0
        matched_without_dates = 0
        for exp in structured.experience:
            exp_text = "\n".join(
                [
                    exp.company or "",
                    exp.title or "",
                    exp.location or "",
                    " ".join(exp.highlights or []),
                ]
            )
            if not _skill_in_text(skill, exp_text):
                continue
            matched_any += 1
            start_dt = _parse_month_year(exp.start)
            end_dt = _parse_month_year(exp.end)
            if start_dt and end_dt:
                covered_months |= _months_span(start_dt, end_dt)
            else:
                matched_without_dates += 1

        total_months = len(covered_months)
        years = round(total_months / 12.0, 1) if total_months else 0.0
        if years >= 1:
            years_hands_on = f"{years}+"
        elif total_months:
            years_hands_on = "<1"
        elif matched_any:
            years_hands_on = "multiple" if matched_any > 1 else "present"
        else:
            years_hands_on = ""
        out.append(
            RelevantSkillItem(
                skill=skill,
                years_required=years_required,
                years_hands_on=years_hands_on,
            )
        )

    # Keep table limited (template expects 4 rows)
    out.sort(key=lambda x: (0 if (x.years_hands_on or "").strip() else 1, len(x.skill)), reverse=False)
    return out[:4]


def _diagnostics_dir() -> Path:
    d = Path(__file__).resolve().parents[1] / "diagnostics"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _save_diagnostics(diagnostics_id: str, payload: dict) -> None:
    p = _diagnostics_dir() / f"{diagnostics_id}.json"
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _find_soffice() -> Optional[str]:
    found = shutil.which("soffice")
    if found:
        return found

    candidates = [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice.bin",
        "/opt/homebrew/bin/soffice",
        "/usr/local/bin/soffice",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return None


def _convert_doc_to_docx(doc_path: Path, out_dir: Path) -> Path:
    soffice = _find_soffice()
    if not soffice:
        raise HTTPException(
            status_code=500,
            detail=".doc upload requires LibreOffice (soffice) for conversion. Install LibreOffice and try again, or upload a .docx.",
        )

    try:
        subprocess.run(
            [
                soffice,
                "--headless",
                "--nologo",
                "--nolockcheck",
                "--nodefault",
                "--nofirststartwizard",
                "--convert-to",
                "docx",
                "--outdir",
                str(out_dir),
                str(doc_path),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert .doc to .docx: {e.stderr or e.stdout or str(e)}")

    produced = out_dir / f"{doc_path.stem}.docx"
    if not produced.exists() or produced.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="Failed to convert .doc to .docx (no output produced).")
    return produced


def _augment_structured(
    structured: ResumeStructured,
    willing_to_relocate: Optional[str],
    jd_text: Optional[str],
) -> ResumeStructured:
    companies = " ".join([(e.company or "") for e in structured.experience])
    companies_norm = re.sub(r"[^a-z0-9]+", " ", companies.lower()).strip()
    has_tcs = (
        "tata consultancy services" in companies_norm
        or re.search(r"\btcs\b", companies_norm) is not None
    )
    structured.former_tcs_employee_or_contractor = "Yes" if has_tcs else "No"

    try:
        tz_name, tz = _timezone_from_location(structured.location)
        now_local = datetime.now(tz)
        days = _next_weekdays(now_local, 4)
        d1 = days[0]
        d2 = days[-1]
        start_t = time(10, 0)
        end_t = time(12, 0)
        structured.interview_timezone = tz_name
        structured.interview_availability = _format_availability(d1, d2, start_t, end_t)
    except Exception:
        structured.interview_timezone = structured.interview_timezone or "America/New_York"
        structured.interview_availability = structured.interview_availability or ""

    if willing_to_relocate is not None:
        v = willing_to_relocate.strip()
        if v.lower() in {"yes", "y", "true", "1"}:
            structured.willing_to_relocate = "Yes"
        elif v.lower() in {"no", "n", "false", "0"}:
            structured.willing_to_relocate = "No"
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid willing_to_relocate value. Use Yes or No.",
            )

    if (jd_text or "").strip():
        try:
            structured.relevant_skills = _compute_relevant_skills_from_jd(jd_text, structured)
        except Exception:
            structured.relevant_skills = structured.relevant_skills

    return structured


app = FastAPI(title="Resume PDF SaaS Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Diagnostics-Id"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/diagnostics/{diagnostics_id}")
def get_diagnostics(diagnostics_id: str):
    did = (diagnostics_id or "").strip()
    if not did:
        raise HTTPException(status_code=400, detail="Missing diagnostics_id")
    p = _diagnostics_dir() / f"{did}.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Diagnostics not found")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read diagnostics")


class RenderRequest(BaseModel):
    structured: ResumeStructured
    diagnostics_id: Optional[str] = None
    requirements_number: Optional[str] = None
    birth_mmdd: Optional[str] = None
    birth_yymm: Optional[str] = None


def _candidate_token(name: str) -> str:
    t = re.sub(r"[^A-Za-z0-9]+", "", (name or "").strip())
    return t.upper()


def _digits_only(s: str) -> str:
    return re.sub(r"\D+", "", (s or "").strip())


def _build_output_filename(
    structured: ResumeStructured,
    requirements_number: Optional[str],
    birth_mmdd: Optional[str],
    birth_yymm: Optional[str] = None,
) -> str:
    req = _digits_only(requirements_number or "")
    birth = _digits_only(birth_mmdd or "") or _digits_only(birth_yymm or "")
    cand = _candidate_token(structured.name)
    if not cand:
        cand = "CANDIDATE"
    if req and birth:
        base = f"PTN_US_{req}_{cand}{birth}"
    elif req:
        base = f"PTN_US_{req}_{cand}"
    else:
        base = f"PTN_US_{cand}{birth}" if birth else f"PTN_US_{cand}"
    return f"{base}.pdf"


@app.post("/process-file")
async def process_file(
    file: UploadFile = File(...),
    willing_to_relocate: Optional[str] = Form(default=None),
    jd_text: Optional[str] = Form(default=None),
):
    filename = (file.filename or "").strip()
    lower = filename.lower()
    if not filename or not (lower.endswith(".docx") or lower.endswith(".doc")):
        raise HTTPException(status_code=400, detail="Please upload a .docx or .doc file")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        in_path = tmp / ("input.doc" if lower.endswith(".doc") else "input.docx")
        rendered_docx = tmp / "rendered_resume.docx"
        out_pdf = tmp / "resume.pdf"

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file was empty. Please upload a valid .docx or .doc.")
        in_path.write_bytes(content)

        if (not in_path.exists()) or in_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Failed to persist uploaded DOCX. Please retry.")

        if lower.endswith(".doc"):
            in_path = _convert_doc_to_docx(in_path, tmp)

        try:
            text = extract_docx_text(str(in_path))
        except PackageNotFoundError:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file could not be opened as a DOCX package. Ensure it is a real .docx (not .doc renamed).",
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read DOCX: {e}")

        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from DOCX")

        try:
            structured: ResumeStructured = structure_resume_text(text)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM processing failed: {e}")

        structured = _augment_structured(structured, willing_to_relocate, jd_text)

        try:
            render_resume_docx(structured, str(rendered_docx))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Template rendering failed: {e}")

        try:
            convert_docx_to_pdf(str(rendered_docx), str(out_pdf))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        try:
            pdf_bytes = out_pdf.read_bytes()
        except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="PDF was not produced by the converter. Please ensure LibreOffice is installed and try again.",
            )

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="resume.pdf"',
                "Cache-Control": "no-store",
            },
        )


@app.post("/extract-file")
async def extract_file(
    file: UploadFile = File(...),
    willing_to_relocate: Optional[str] = Form(default=None),
    jd_text: Optional[str] = Form(default=None),
):
    filename = (file.filename or "").strip()
    lower = filename.lower()
    if not filename or not (lower.endswith(".docx") or lower.endswith(".doc")):
        raise HTTPException(status_code=400, detail="Please upload a .docx or .doc file")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        in_path = tmp / ("input.doc" if lower.endswith(".doc") else "input.docx")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file was empty. Please upload a valid .docx or .doc.")
        in_path.write_bytes(content)

        if (not in_path.exists()) or in_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Failed to persist uploaded DOCX. Please retry.")

        if lower.endswith(".doc"):
            in_path = _convert_doc_to_docx(in_path, tmp)

        try:
            extracted_text = extract_docx_text(str(in_path))
        except PackageNotFoundError:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file could not be opened as a DOCX package. Ensure it is a real .docx (not .doc renamed).",
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read DOCX: {e}")
        if not extracted_text:
            raise HTTPException(status_code=400, detail="Could not extract text from DOCX")

        diagnostics_id = uuid.uuid4().hex
        try:
            structured, llm_diag = structure_resume_text_with_diagnostics(extracted_text)
        except Exception as e:
            _save_diagnostics(
                diagnostics_id,
                {
                    "diagnostics_id": diagnostics_id,
                    "extracted_text": extracted_text,
                    "error": str(e),
                },
            )
            raise HTTPException(status_code=502, detail=f"LLM processing failed: {e}")

        structured = _augment_structured(structured, willing_to_relocate, jd_text)
        final_json = structured.model_dump(mode="json")

        _save_diagnostics(
            diagnostics_id,
            {
                "diagnostics_id": diagnostics_id,
                "extracted_text": extracted_text,
                "llm": llm_diag,
                "final_structured": final_json,
            },
        )

        return {
            "diagnostics_id": diagnostics_id,
            "structured": final_json,
        }


@app.post("/render-resume")
async def render_resume(payload: RenderRequest = Body(...)):
    diagnostics_id = (payload.diagnostics_id or "").strip() or uuid.uuid4().hex
    structured = payload.structured
    out_name = _build_output_filename(
        structured,
        payload.requirements_number,
        payload.birth_mmdd,
        payload.birth_yymm,
    )

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        rendered_docx = tmp / "rendered_resume.docx"
        out_pdf = tmp / "resume.pdf"

        try:
            render_resume_docx(structured, str(rendered_docx))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Template rendering failed: {e}")

        try:
            convert_docx_to_pdf(str(rendered_docx), str(out_pdf))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        try:
            pdf_bytes = out_pdf.read_bytes()
        except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="PDF was not produced by the converter. Please ensure LibreOffice is installed and try again.",
            )

        try:
            _save_diagnostics(
                diagnostics_id,
                {
                    "diagnostics_id": diagnostics_id,
                    "final_structured_used_for_render": structured.model_dump(mode="json"),
                },
            )
        except Exception:
            pass

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{out_name}"',
                "Cache-Control": "no-store",
                "X-Diagnostics-Id": diagnostics_id,
            },
        )

import json
import re
import urllib.error
import urllib.request

from pydantic import ValidationError

from openai import OpenAI

from app.schemas import ResumeStructured
from app.settings import settings


def _llm_provider() -> str:
    return (getattr(settings, "llm_provider", "openai") or "openai").strip().lower()


def _assert_llm_configured() -> None:
    provider = _llm_provider()
    if provider == "mistral":
        if not (settings.mistral_api_key or "").strip():
            raise RuntimeError(
                "MISTRAL_API_KEY is not set. Add it to fastapi-backend/.env and restart the backend."
            )
        return

    # Default: OpenAI
    if not (settings.openai_api_key or "").strip():
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to fastapi-backend/.env and restart the backend."
        )


def _mistral_chat_completion(*, model: str, messages: list[dict], temperature: float) -> str:
    url = "https://api.mistral.ai/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.mistral_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        raise RuntimeError(f"Mistral API error {e.code}: {body or e.reason}")
    except Exception as e:
        raise RuntimeError(f"Mistral request failed: {e}")

    data = json.loads(raw or "{}")
    choices = data.get("choices")
    if not choices:
        return "{}"
    msg = (choices[0] or {}).get("message") or {}
    return (msg.get("content") or "{}")


def _openai_chat_completion(*, model: str, messages: list[dict], temperature: float) -> str:
    client = OpenAI(api_key=settings.openai_api_key)
    kwargs = {
        "model": model,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    m = (model or "").strip().lower()
    if m and not m.startswith("gpt-5"):
        kwargs["temperature"] = temperature
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or "{}"


def _chat_completion_json(*, model: str, messages: list[dict], temperature: float = 0.1) -> str:
    provider = _llm_provider()
    if provider == "mistral":
        # Mistral doesn't support OpenAI-style response_format in the same way.
        # We rely on strict prompting and post-parse validation/repair.
        return _mistral_chat_completion(model=model, messages=messages, temperature=temperature)
    return _openai_chat_completion(model=model, messages=messages, temperature=temperature)


def _active_model() -> str:
    provider = _llm_provider()
    if provider == "mistral":
        return settings.mistral_model
    return settings.openai_model


def _extract_first_json_object(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return "{}"
    # Strip common markdown fences
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE).strip()
    t = re.sub(r"\s*```$", "", t).strip()

    if t.startswith("{") and t.endswith("}"):
        return t

    # Find the first balanced {...} block
    start = t.find("{")
    if start < 0:
        return "{}"
    depth = 0
    for i in range(start, len(t)):
        ch = t[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return t[start : i + 1]
    return "{}"


def _loads_json_object_maybe(text: str) -> dict:
    candidate = _extract_first_json_object(text)
    try:
        data = json.loads(candidate)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def extract_jd_required_skills(jd_text: str) -> list[dict]:
    _assert_llm_configured()

    t = (jd_text or "").strip()
    if not t:
        return []

    system = (
        "You extract mandatory skills from a job description. "
        "Return ONLY valid JSON and no extra keys."
    )

    user = (
        "From this job description, extract up to 8 mandatory skills. "
        "For each skill, also extract the required years if explicitly stated (e.g. '5+', '3', '10+'). "
        "If years are not stated, use empty string.\n\n"
        "Return JSON with this schema exactly:\n"
        "{\n"
        '  "skills": [{"skill": string, "years_required": string}]\n'
        "}\n\n"
        "Job description:\n"
        f"{t}"
    )

    content = _chat_completion_json(
        model=_active_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.1,
    )
    data = _loads_json_object_maybe(content)

    skills = data.get("skills")
    if not isinstance(skills, list):
        return []

    out: list[dict] = []
    for s in skills:
        if not isinstance(s, dict):
            continue
        skill = str(s.get("skill") or "").strip()
        years_required = str(s.get("years_required") or "").strip()
        if skill:
            out.append({"skill": skill, "years_required": years_required})
    return out


def _extract_email(text: str) -> str:
    m = re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", text or "", flags=re.IGNORECASE)
    return (m.group(0) or "").strip() if m else ""


def _extract_links(text: str) -> list[str]:
    t = text or ""
    urls = re.findall(r"\bhttps?://[^\s)\]]+", t, flags=re.IGNORECASE)
    # Add common LinkedIn/GitHub without scheme
    extra = re.findall(r"\b(?:www\.)?linkedin\.com/[^\s)\]]+", t, flags=re.IGNORECASE)
    extra += re.findall(r"\b(?:www\.)?github\.com/[^\s)\]]+", t, flags=re.IGNORECASE)
    out: list[str] = []
    for u in urls + extra:
        u = (u or "").strip().rstrip(".,;)")
        if u and u not in out:
            out.append(u)
    return out


def _extract_phone(text: str) -> str:
    # Very forgiving; we only use it to prefill if the model misses it.
    t = text or ""
    candidates = re.findall(
        r"(?:(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4})(?:\s*(?:x|ext\.?|#)\s*\d+)?",
        t,
        flags=re.IGNORECASE,
    )
    if not candidates:
        return ""
    # Pick the longest (usually includes country code/extension)
    return max((c.strip() for c in candidates), key=len, default="")


def _extract_skills_fallback(text: str, max_items: int = 30) -> list[str]:
    t = (text or "").strip()
    if not t:
        return []

    # Try to capture content following a SKILLS / TECHNICAL SKILLS heading.
    m = re.search(
        r"(?:^|\n)\s*(?:technical\s+skills|skills)\s*[:\-]?\s*\n(?P<body>[\s\S]{0,1200})",
        t,
        flags=re.IGNORECASE,
    )
    body = (m.group("body") if m else "")
    if body:
        # Stop at the next common section heading.
        stop = re.search(
            r"\n\s*(?:experience|employment|work\s+experience|projects|education|certifications?)\b",
            body,
            flags=re.IGNORECASE,
        )
        if stop:
            body = body[: stop.start()]

    src = body or t

    # Split on commas / pipes / bullets / line breaks.
    raw = re.split(r"[\n\r•\u2022,|/]+", src)
    out: list[str] = []
    for s in raw:
        s = (s or "").strip(" \t:-").strip()
        if not s:
            continue
        if len(s) > 40:
            continue
        low = s.lower()
        if low in {"skills", "technical skills"}:
            continue
        if s not in out:
            out.append(s)
        if len(out) >= max_items:
            break
    return out


def _with_fallback_fields(structured: ResumeStructured, extracted: dict) -> ResumeStructured:
    if not (str(structured.email or "").strip()) and extracted.get("email"):
        structured.email = extracted["email"]
    if not (str(structured.phone or "").strip()) and extracted.get("phone"):
        structured.phone = extracted["phone"]
    if (not structured.links) and extracted.get("links"):
        structured.links = extracted["links"]
    if (not structured.skills) and extracted.get("skills"):
        structured.skills = extracted["skills"]
    return structured


def _parse_and_validate(content: str) -> ResumeStructured:
    data = _loads_json_object_maybe(content)
    return ResumeStructured.model_validate(data)


def _repair_json(
    model: str,
    bad_json: str,
    resume_text: str,
    extracted: dict,
) -> str:
    system = (
        "You fix JSON outputs. Return ONLY valid JSON for the given schema. "
        "Do not include markdown, comments, or extra keys. Use empty strings/arrays when missing."
    )

    user = (
        "Fix the JSON to match this schema exactly:\n"
        "{\n"
        '  "name": string,\n'
        '  "email": string,\n'
        '  "phone": string,\n'
        '  "location": string,\n'
        '  "title": string,\n'
        '  "summary": string,\n'
        '  "willing_to_relocate": string,\n'
        '  "former_tcs_employee_or_contractor": string,\n'
        '  "interview_availability": string,\n'
        '  "interview_timezone": string,\n'
        '  "links": string[],\n'
        '  "skills": string[],\n'
        '  "relevant_skills": [{"skill": string, "years_required": string, "years_hands_on": string}],\n'
        '  "experience": [{"company": string, "title": string, "start": string, "end": string, "location": string, "highlights": string[]}],\n'
        '  "education": [{"school": string, "degree": string, "start": string, "end": string, "location": string}],\n'
        '  "projects": [{"name": string, "description": string, "highlights": string[]}],\n'
        '  "certifications": [{"name": string, "issuer": string, "date": string}]\n'
        "}\n\n"
        "Extracted hints (must be used if applicable):\n"
        f"- email: {extracted.get('email','')}\n"
        f"- phone: {extracted.get('phone','')}\n"
        f"- links: {extracted.get('links',[])}\n"
        f"- skills (if present): {extracted.get('skills',[])}\n\n"
        "Original resume text (for missing fields only):\n"
        f"{resume_text}\n\n"
        "Bad JSON to fix:\n"
        f"{bad_json}"
    )

    return _chat_completion_json(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.1,
    )


def structure_resume_text(text: str) -> ResumeStructured:
    structured, _diag = structure_resume_text_with_diagnostics(text)
    return structured


def structure_resume_text_with_diagnostics(text: str) -> tuple[ResumeStructured, dict]:
    _assert_llm_configured()

    extracted = {
        "email": _extract_email(text),
        "phone": _extract_phone(text),
        "links": _extract_links(text),
        "skills": _extract_skills_fallback(text),
    }

    system = (
        "You are an expert resume parser. Convert raw resume text into a strict JSON object "
        "matching the provided schema. Use empty strings or empty arrays if missing. "
        "Never include keys outside the schema."
    )

    user = (
        "Return JSON with this schema:\n"
        "{\n"
        '  "name": string,\n'
        '  "email": string,\n'
        '  "phone": string,\n'
        '  "location": string,\n'
        '  "title": string,\n'
        '  "summary": string,\n'
        '  "willing_to_relocate": string,\n'
        '  "former_tcs_employee_or_contractor": string,\n'
        '  "interview_availability": string,\n'
        '  "interview_timezone": string,\n'
        '  "links": string[],\n'
        '  "skills": string[],\n'
        '  "relevant_skills": [{"skill": string, "years_required": string, "years_hands_on": string}],\n'
        '  "experience": [{"company": string, "title": string, "start": string, "end": string, "location": string, "highlights": string[]}],\n'
        '  "education": [{"school": string, "degree": string, "start": string, "end": string, "location": string}],\n'
        '  "projects": [{"name": string, "description": string, "highlights": string[]}],\n'
        '  "certifications": [{"name": string, "issuer": string, "date": string}]\n'
        "}\n\n"
        "Extracted hints (use if present):\n"
        f"- email: {extracted.get('email','')}\n"
        f"- phone: {extracted.get('phone','')}\n"
        f"- links: {extracted.get('links',[])}\n"
        f"- skills (if present): {extracted.get('skills',[])}\n\n"
        "Resume text:\n"
        f"{text}"
    )

    model_name = _active_model()
    raw_content = _chat_completion_json(
        model=model_name,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.1,
    )

    validation_error = ""
    repaired_content = ""
    try:
        structured = _parse_and_validate(raw_content)
    except (json.JSONDecodeError, ValidationError) as e:
        validation_error = str(e)
        repaired_content = _repair_json(
            model=model_name,
            bad_json=raw_content,
            resume_text=text,
            extracted=extracted,
        )
        try:
            structured = _parse_and_validate(repaired_content)
        except Exception as e2:
            raise RuntimeError(f"LLM returned invalid JSON even after repair: {e2}")

    structured = _with_fallback_fields(structured, extracted)

    provider = _llm_provider()

    diag = {
        "llm_provider": provider,
        "llm_model": model_name,
        "raw_model_json": raw_content,
        "repaired_json": repaired_content,
        "validation_error": validation_error,
        "deterministic_hints": extracted,
    }
    return structured, diag

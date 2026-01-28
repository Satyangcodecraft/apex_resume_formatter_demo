# Apex Resume Formatter Demo (AI DOCX → PDF)

A complete demo SaaS flow:

1. Upload a `.docx` resume in the Next.js UI
2. FastAPI extracts text
3. OpenAI structures it into JSON
4. Backend renders a DOCX resume template
5. Backend converts DOCX → PDF
6. UI offers a download button

## Project structure

- `nextjs-frontend/` — Next.js 14 + Tailwind (premium glass UI)
- `fastapi-backend/` — FastAPI + python-docx + docxtpl + OpenAI

## Backend setup (FastAPI)

```bash
python3 -m venv fastapi-backend/.venv
source fastapi-backend/.venv/bin/activate
pip install -r fastapi-backend/requirements.txt
cp fastapi-backend/.env.example fastapi-backend/.env
```

Edit `fastapi-backend/.env`:

- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4.1-mini` (default)
- `FRONTEND_ORIGIN=http://localhost:3000`

Run:

```bash
uvicorn app.main:app --reload --port 8000 --app-dir fastapi-backend
```

## PDF conversion prerequisite (important)

The backend converts DOCX → PDF via:

1. `soffice` (LibreOffice) **preferred**
2. `docx2pdf` fallback

For a smooth demo, install LibreOffice so `soffice` is available on PATH.

## Frontend setup (Next.js)

```bash
cd nextjs-frontend
npm install
cp .env.example .env
npm run dev
```

Ensure `nextjs-frontend/.env` has:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

Open:

- http://localhost:3000

## Quick validation

- Visit `/upload`
- Drag & drop any `.docx` resume
- Wait for processing
- Click **Download PDF**

## Notes

- Demo is stateless: no file storage.
- The DOCX resume template is generated automatically the first time you process a file at:
  `fastapi-backend/templates/resume_template.docx`

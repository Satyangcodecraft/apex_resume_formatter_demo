# FastAPI Backend (Resume PDF SaaS Demo)

## Setup

1. Create a virtualenv and install deps:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Create `.env`:

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY`.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Health:

- `GET http://localhost:8000/health`

Main endpoint:

- `POST http://localhost:8000/process-file` (multipart form-data `file`)

## Notes

- DOCX->PDF conversion tries `soffice` (LibreOffice) first, then `docx2pdf`.
- If PDF conversion fails, install LibreOffice and ensure `soffice` is on PATH.

import os
import subprocess
import shutil
from pathlib import Path
from typing import Optional


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


def convert_docx_to_pdf(docx_path: str, pdf_path: str) -> str:
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

    out_dir = str(Path(pdf_path).parent)

    soffice = _find_soffice()
    if soffice:
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
                    "pdf",
                    "--outdir",
                    out_dir,
                    docx_path,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            produced = str(Path(out_dir) / (Path(docx_path).stem + ".pdf"))
            if Path(produced).exists() and produced != pdf_path:
                Path(produced).replace(pdf_path)
            if Path(pdf_path).exists():
                return pdf_path
        except subprocess.CalledProcessError:
            pass

    try:
        from docx2pdf import convert

        convert(docx_path, pdf_path)
        if Path(pdf_path).exists():
            return pdf_path
    except Exception:
        pass

    raise RuntimeError(
        "PDF conversion failed. Install LibreOffice (soffice) and ensure it is available (PATH or /Applications/LibreOffice.app), "
        "or use docx2pdf with Microsoft Word installed."
    )

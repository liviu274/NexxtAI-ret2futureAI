# Document data collection

This script sends each page of a PDF or image to a vision-language model on
Featherless for OCR, then asks the model to extract important fields as JSON.
The OCR transcription and structured result are written as separate files.

## Setup (Windows PowerShell)

From this directory:

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:FEATHERLESS_API_KEY = "your-api-key"
```

By default the script uses `Qwen/Qwen3-VL-8B-Instruct` for both OCR and
extraction. Override the models or API URL with environment variables if needed:

```powershell
$env:FEATHERLESS_OCR_MODEL = "Qwen/Qwen3-VL-8B-Instruct"
$env:FEATHERLESS_EXTRACTION_MODEL = "Qwen/Qwen3-VL-8B-Instruct"
$env:FEATHERLESS_BASE_URL = "https://api.featherless.ai/v1"
```

## Run

```powershell
.\.venv\Scripts\python .\collect_document.py "C:\path\to\document.pdf"
```

PDFs are rendered at 180 DPI. PNG, JPEG, and WebP images are also accepted.
By default, output is saved under `output\` as `<document>.json` and
`<document>.ocr.txt`. Specify `--output`, `--text-output`, or `--dpi` to
customize those settings:

```powershell
.\.venv\Scripts\python .\collect_document.py "C:\path\to\document.pdf" `
  --output .\output\result.json --dpi 240
```

The JSON contains the source filename, page count, model names, and extracted
data grouped into document type, people, organizations, dates, amounts,
addresses, and key facts. Review all OCR and extracted values against the
original before using them; model output can be incomplete or incorrect.

**Privacy:** each page image and the resulting OCR text are sent to Featherless
for inference. Use only documents you are authorized to share with that
service. Do not process real customer or other sensitive documents unless your
organization has approved that data transfer.

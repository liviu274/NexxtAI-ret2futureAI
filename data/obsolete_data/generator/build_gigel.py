import json, os, shutil
from pypdf import PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4

OUT = "/mnt/user-data/outputs/data_gigel"
REF_DATE = "2026-10-28"
W, H = A4

pdfmetrics.registerFont(TTFont("DV", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("LSB", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"))

# ---------- fictional but format-valid identifiers ----------
def cnp(sex, yymmdd, county, nnn):
    base = f"{sex}{yymmdd}{county}{nnn}"
    key = "279146358279"
    s = sum(int(a) * int(b) for a, b in zip(base, key)) % 11
    return base + str(1 if s == 10 else s)

def cui(num):
    key = [7, 5, 3, 2, 1, 7, 5, 3, 2]
    digits = [int(d) for d in str(num)][::-1]
    s = sum(d * k for d, k in zip(digits, key)) * 10 % 11
    return f"{num}{0 if s == 10 else s}"

CLIENT = {
    "person_id": "p_1", "role": "applicant",
    "first_name": "GIGEL", "last_name": "POPESCU", "full_name": "Gigel Popescu",
    "cnp": cnp(1, "920312", "40", "017"),
    "birth_date": "12.03.1992",
    "address": "Str. Exemplului nr. 7, bl. D2, ap. 14, București",
}
EMPLOYER = {"name": "Construct Demo SRL", "cui": cui(9876543)}


def ro(n):
    return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


class Doc:
    """One-page PDF that logs the normalized bbox of every field it draws."""

    def __init__(self, path, title):
        self.path = path
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle(title)
        self.fields = {}
        self._watermark()

    def _watermark(self):
        c = self.c
        c.saveState()
        c.setFillColorRGB(0.88, 0.88, 0.88)
        c.setFont("DVB", 44)
        c.translate(W / 2, H / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, "SPECIMEN - DATE FICTIVE")
        c.restoreState()
        c.setFont("DV", 8)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawString(40, 24, "Document sintetic pentru demo. Nu este un act real. Toate datele sunt inventate.")

    def text(self, x, y, s, font="DV", size=11, right=False, key=None, value=None):
        c = self.c
        c.setFillColorRGB(0, 0, 0)
        c.setFont(font, size)
        w = pdfmetrics.stringWidth(s, font, size)
        x0 = x - w if right else x
        c.drawString(x0, y, s)
        if key:
            top, bot = y + size * 0.9, y - size * 0.25
            self.fields[key] = {
                "value": s if value is None else value, "raw_text": s, "page": 1,
                "bbox": [round(x0 / W, 4), round((H - top) / H, 4),
                         round((x0 + w) / W, 4), round((H - bot) / H, 4)],
            }

    def save(self):
        self.c.showPage()
        self.c.save()


def make_id(path):
    d = Doc(path, "Fisa de identitate fictiva")
    d.text(40, 780, "FIȘĂ DE IDENTITATE FICTIVĂ (demo)", "DVB", 16)
    d.text(40, 750, "Nu reproduce un act oficial.", "DV", 9)
    rows = [("Nume", CLIENT["last_name"], "last_name"), ("Prenume", CLIENT["first_name"], "first_name"),
            ("CNP", CLIENT["cnp"], "cnp"), ("Data nașterii", CLIENT["birth_date"], "birth_date"),
            ("Domiciliu", CLIENT["address"], "address"), ("Seria / Nr.", "ZZ 000000", "doc_number"),
            ("Valabil până la", "14.05.2031", "expiry_date")]
    y = 700
    for label, val, key in rows:
        d.text(40, y, label + ":", "DV", 10)
        d.text(170, y, val, "DVB", 11, key=key)
        y -= 30
    d.save()
    return d.fields


def make_utility(path):
    d = Doc(path, "Factura energie (specimen)")
    d.text(40, 780, "Energie Demo SA", "DVB", 16)
    d.text(40, 760, "Factură fiscală - specimen", "DV", 10)
    rows = [("Client", CLIENT["full_name"], "customer_name"), ("Adresă consum", CLIENT["address"], "address"),
            ("Data emiterii", "10.10.2026", "issue_date"), ("Perioadă", "01.09.2026 - 30.09.2026", "period"),
            ("Total de plată", "214,37 lei", "total_amount")]
    y = 710
    for label, val, key in rows:
        d.text(40, y, label + ":", "DV", 10)
        d.text(170, y, val, "DVB", 11, key=key)
        y -= 30
    d.save()
    return d.fields


GROSS = 8000.00
CAS, CASS = GROSS * 0.25, GROSS * 0.10
TAX = (GROSS - CAS - CASS) * 0.10
NET_OK = GROSS - CAS - CASS - TAX          # 4680.00
NET_FAKE = 7480.00


def make_payslip(path, tampered):
    d = Doc(path, "Fluturas de salariu (specimen)")
    d.text(40, 780, "FLUTURAȘ DE SALARIU - septembrie 2026", "DVB", 15)
    d.text(40, 760, "Document specimen", "DV", 9)
    head = [("Angajat", CLIENT["full_name"], "employee_name"), ("CNP", CLIENT["cnp"], "cnp"),
            ("Angajator", EMPLOYER["name"], "employer"), ("CUI angajator", "RO" + EMPLOYER["cui"], "employer_cui"),
            ("Data emiterii", "05.10.2026", "issue_date")]
    y = 720
    for label, val, key in head:
        d.text(40, y, label + ":", "DV", 10)
        d.text(170, y, val, "DVB", 11, key=key)
        y -= 26
    y -= 20
    lines = [("Salariu brut", GROSS, "gross_salary"), ("CAS 25%", -CAS, "cas"),
             ("CASS 10%", -CASS, "cass"), ("Impozit pe venit 10%", -TAX, "income_tax")]
    for label, val, key in lines:
        d.text(40, y, label, "DV", 11)
        d.text(520, y, ro(abs(val)) + " lei", "DV", 11, right=True, key=key, value={"amount": abs(val), "currency": "RON"})
        y -= 26
    y -= 10
    d.text(40, y, "Salariu net", "DVB", 12)
    net = NET_FAKE if tampered else NET_OK
    font = "LSB" if tampered else "DVB"     # the edited number uses a different font
    d.text(520, y, ro(net) + " lei", font, 12, right=True, key="net_salary", value={"amount": net, "currency": "RON"})
    d.save()
    return d.fields


def set_pdf_dates(path, producer, creator, created, modified):
    from pikepdf import Pdf, Name
    with Pdf.open(path, allow_overwriting_input=True) as pdf:
        info = pdf.docinfo
        info[Name.Producer] = producer
        info[Name.Creator] = creator
        info[Name.CreationDate] = created
        info[Name.ModDate] = modified
        pdf.save(path)


def incremental_edit(path, producer, creator, modified):
    """Append an incremental update, like a PDF saved again by an editing tool."""
    w = PdfWriter(path, incremental=True)
    w.add_metadata({"/Producer": producer, "/Creator": creator, "/ModDate": modified})
    w.write(path)


def build_case(case_dir, tampered):
    docs = os.path.join(case_dir, "docs")
    os.makedirs(docs, exist_ok=True)
    p_id, p_ut, p_pay = (os.path.join(docs, n) for n in ("doc_001_identitate.pdf", "doc_002_factura.pdf", "doc_003_fluturas.pdf"))
    f_id, f_ut, f_pay = make_id(p_id), make_utility(p_ut), make_payslip(p_pay, tampered)

    clean_prod, clean_creator = "Demo Payroll Engine 4.2", "Demo Payroll Engine"
    for p in (p_id, p_ut):
        set_pdf_dates(p, clean_prod, clean_creator, "D:20261010080000+03'00'", "D:20261010080000+03'00'")
    set_pdf_dates(p_pay, clean_prod, clean_creator, "D:20261005080000+03'00'", "D:20261005080000+03'00'")
    mutations = []
    if tampered:
        incremental_edit(p_pay, "Adobe Photoshop 25.1 (Windows)", "iLovePDF", "D:20261027224109+03'00'")
        mutations = ["net_salary_edited", "font_mix_net_line", "metadata_editor", "metadata_late_modification", "incremental_save"]

    docs_truth = [
        {"doc_id": "doc_001", "doc_type": "identity_document", "owner_person_id": "p_1", "file": "docs/doc_001_identitate.pdf", "fields": f_id, "mutations": []},
        {"doc_id": "doc_002", "doc_type": "utility_bill", "owner_person_id": "p_1", "file": "docs/doc_002_factura.pdf", "fields": f_ut, "mutations": []},
        {"doc_id": "doc_003", "doc_type": "payslip", "owner_person_id": "p_1", "file": "docs/doc_003_fluturas.pdf", "fields": f_pay, "mutations": mutations},
    ]
    truth = {"case_id": os.path.basename(case_dir), "reference_date": REF_DATE, "customer_type": "PF",
             "persons": [{k: CLIENT[k] for k in ("person_id", "role", "full_name")}], "documents": docs_truth}
    json.dump(truth, open(os.path.join(case_dir, "truth.json"), "w"), ensure_ascii=False, indent=2)

    expected = []
    if tampered:
        expected = [
            {"rule_id": "R-PF-014", "check": "totals_consistency", "severity": "high", "doc_id": "doc_003", "field": "net_salary"},
            {"rule_id": "R-PF-013", "check": "font_consistency", "severity": "high", "doc_id": "doc_003", "field": "net_salary"},
            {"rule_id": "R-PF-012", "check": "pdf_metadata", "severity": "critical", "doc_id": "doc_003"},
        ]
    json.dump(expected, open(os.path.join(case_dir, "expected_flags.json"), "w"), indent=2)


if __name__ == "__main__":
    shutil.rmtree(OUT, ignore_errors=True)
    build_case(f"{OUT}/cases/case_0001_pf_gigel_curat", tampered=False)
    build_case(f"{OUT}/cases/case_0006_pf_gigel_fluturas_talcioc", tampered=True)
    print("CNP:", CLIENT["cnp"], "CUI:", EMPLOYER["cui"], "net ok:", NET_OK)

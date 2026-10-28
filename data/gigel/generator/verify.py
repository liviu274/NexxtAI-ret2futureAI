import pdfplumber, json, re
from pypdf import PdfReader
base="/mnt/user-data/outputs/data_gigel/cases/"
def num(s): return float(s.replace(".","").replace(",",".").split()[0])
for case in ("case_0001_pf_gigel_curat","case_0006_pf_gigel_fluturas_talcioc"):
    p=base+case+"/docs/doc_003_fluturas.pdf"
    md=PdfReader(p).metadata
    raw=open(p,"rb").read()
    flags=[]
    prod=((md.get("/Producer") or "")+" "+(md.get("/Creator") or "")).lower()
    if any(a in prod for a in ("photoshop","ilovepdf","smallpdf","sejda","canva")): flags.append("pdf_metadata")
    if raw.count(b"%%EOF")>1: flags.append("incremental_save")
    with pdfplumber.open(p) as pdf:
        pg=pdf.pages[0]; words=pg.extract_words(extra_attrs=["fontname"])
        lines={}
        for w in words: lines.setdefault(round(w["top"]/4),[]).append(w)
        vals={}
        for t,ws in lines.items():
            txt=" ".join(w["text"] for w in ws)
            m=re.search(r"([\d.]+,\d{2}) lei$",txt)
            if m:
                amt=num(m.group(1))
                for k,lab in (("gross","Salariu brut"),("cass","CASS"),("cas","CAS"),("tax","Impozit"),("net","Salariu net")):
                    if txt.startswith(lab): vals[k]=amt; break
            fonts={w["fontname"].split("+")[-1] for w in ws}
            if "lei" in txt and len(fonts)>1: flags.append("font_consistency")
    if abs(vals["gross"]-vals["cas"]-vals["cass"]-vals["tax"]-vals["net"])>0.01: flags.append("totals_consistency")
    print(case, "|", md.get("/Producer"), "|", md.get("/ModDate"), "| EOF:", raw.count(b"%%EOF"), "|", vals, "=>", sorted(set(flags)) or "niciun flag")

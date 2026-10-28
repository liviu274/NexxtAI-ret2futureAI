"""Rehearse the live moment: build a playbook from the procedure and time it.

Usage:
    python rehearse.py                                   # PJ procedure, direct call
    python rehearse.py procedures/PF-ONB-01.pdf
    python rehearse.py --url http://localhost:8002       # through the running server, like the demo
    python rehearse.py --runs 5                          # stability: build 5 times, compare each

Passes when every run finishes under the time limit (default 120 s) and comes from the LLM.
"""
import argparse
import json
import time
from pathlib import Path

from compare import compare, print_comparison

HERE = Path(__file__).parent


def via_server(url, pdf):
    """POST the PDF as multipart/form-data, using only the standard library."""
    import urllib.request
    import uuid
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{Path(pdf).name}\"\r\n"
            f"Content-Type: application/pdf\r\n\r\n").encode() + Path(pdf).read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"{url.rstrip('/')}/playbooks/build", data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read())
    return data["playbook"], data["report"]


def direct(pdf):
    from builder import build
    from report import build_report
    playbook, meta = build(pdf)
    return playbook, build_report(playbook, meta)


def target_for(code):
    index = json.loads((HERE / "fallback" / "index.json").read_text(encoding="utf-8"))
    entry = index.get(code)
    return json.loads((HERE / "fallback" / entry["playbook"]).read_text(encoding="utf-8")) if entry else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="?", default=str(HERE / "procedures" / "PJ-ONB-01.pdf"))
    ap.add_argument("--url")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--limit", type=float, default=120)
    args = ap.parse_args()

    ok = True
    for run in range(1, args.runs + 1):
        t0 = time.monotonic()
        playbook, report = via_server(args.url, args.pdf) if args.url else direct(args.pdf)
        elapsed = time.monotonic() - t0
        gen, cov = report["generated_by"], report["coverage"]
        print(f"\nrun {run}: {elapsed:.1f}s  source={gen['source']}  attempts={gen['attempts']}  "
              f"rules={len(playbook['rules'])}  coverage={cov['pct']}% "
              f"(automated {cov['automated']}, covered {cov['covered']}, manual {cov['manual']}, "
              f"context {cov['context']}, unreviewed {cov['unreviewed']})")
        if gen["source"] == "fallback":
            print(f"  FALLBACK used: {gen['fallback_reason']}")
        target = target_for(report["procedure"]["code"])
        if target and gen["source"] != "fallback":
            print_comparison(compare(playbook, target))
        run_ok = elapsed < args.limit and gen["source"] in ("llm", "llm_repaired")
        ok &= run_ok
        if gen["source"].startswith("mock"):
            print("  NOT A REAL RUN: mock backend. Unset BUILDER_LLM and set ANTHROPIC_API_KEY to rehearse.")
        else:
            print(f"  {'PASS' if run_ok else 'FAIL'} (limit {args.limit:.0f}s, LLM output required)")
    print(f"\n{'READY for the live moment' if ok else 'NOT READY: see the runs above'}")


if __name__ == "__main__":
    main()

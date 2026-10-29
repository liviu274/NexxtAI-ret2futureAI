import { readFile } from "node:fs/promises";
import path from "node:path";

const base = (process.env.ORCH_URL ?? "http://localhost:8000").replace(/\/$/, "");
// This repo's root (the frontend lives in frontend/), or set NEXXT_REPO to another checkout.
const repo = process.env.NEXXT_REPO ?? path.resolve(import.meta.dirname, "../..");
const casesRoot = path.join(repo, "data/client data/KYC_PF_PJ/PJ/cases");
const ids = ["case_pj_07_procente_diferite", "case_pj_00_corect_control"];
async function request(route, body) {
  const response = await fetch(`${base}${route}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${route}: eroare ${response.status}: ${await response.text()}`);
  return response.json();
}
try {
  const existing = await request("/cases");
  for (const id of ids) {
    let result;
    if (existing.some((c) => c.case_id === id)) {
      console.log(`${id}: există deja; nu suprascriu dosarul sau deciziile analistului.`);
      result = await request(`/cases/${id}`);
    } else {
      const fixture = JSON.parse(await readFile(path.join(casesRoot, id, "case_file.extracted.json"), "utf8"));
      // Absolute paths, so the tamper checks can open the PDFs (otherwise they report "could not run").
      for (const doc of fixture.documents) doc.file = path.join(casesRoot, id, doc.file);
      // submit() accepts all extracted documents; no upload or ingestion step is needed.
      await request("/cases", fixture);
      result = await request(`/cases/${id}/process`, {});
    }
    console.log(`${id}: ${result.flags.length} probleme`);
    for (const flag of result.flags) console.log(`  ${flag.flag_id} · ${flag.rule_id} · ${flag.severity} · ${flag.status}`);
  }
} catch (error) { console.error(`Inițializarea a eșuat: ${error.message}`); process.exitCode = 1; }

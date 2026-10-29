import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cases } from "@/mocks/data";
import { portalDocumentPlan } from "@/lib/portal";
import type { Case, Flag } from "@/types";
import fixture from "./fixtures/orchestrator-pj.json";

const realId = "case_pj_07_procente_diferite";
const key = "dosarai-demo-cases-v1";
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let api: typeof import("@/api/client");
beforeEach(async () => { vi.resetModules(); localStorage.clear(); vi.useFakeTimers(); api = await import("@/api/client"); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function finish<T>(promise: Promise<T>): Promise<T> {
  // Attach rejection handling immediately while advancing simulated demo delays.
  let done = false;
  const result = promise.then((value) => { done = true; return { value }; }, (error: unknown) => { done = true; return { error }; });
  for (let i = 0; !done && i < 100; i++) {
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(2500);
  }
  expect(done).toBe(true);
  const settled = await result;
  if ("error" in settled) throw settled.error;
  return settled.value;
}
function save(c: Case) { localStorage.setItem(key, JSON.stringify([c])); }
function stored(): Case { return JSON.parse(localStorage.getItem(key) ?? "[]")[0] as Case; }
function sample(): Case {
  const c = structuredClone(cases.find((c) => c.customerType === "PF")!);
  c.id = "demo_requests"; c.status = "În analiză"; c.flags = [];
  c.portalDocuments = portalDocumentPlan("PF", ["identity_document", "utility_bill", "payslip"], c.persons);
  return c;
}
function flag(id: string, documentId: string, personId?: string): Flag {
  return { id, title: "Document de actualizat", ruleId: "document-request", ruleText: "Document valabil", severity: "medium", explanation: "Actualizare", clientFixMessage: "Încarcă documentul actualizat.", client_fixable: true, fix_message: `Document actualizat ${id}`, status: "sent_to_client", evidence: [{ documentId, page: 0 }], ...(personId ? { personId } : {}) };
}

describe("Stare comună și protecția dosarelor reale", () => {
  it.each(["approved", "rejected", "documents_requested"] as const)("proiectează decizia %s fără date interne", async (outcome) => {
    let raw: Omit<typeof fixture, "decision"> & { decision: { outcome: string } | null } = structuredClone(fixture);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") raw = { ...raw, status: outcome === "documents_requested" ? "waiting_client" : "decided", decision: { outcome } };
      return response(raw);
    }));
    await api.submitDecision(realId, outcome === "approved" ? "aprobat" : outcome === "rejected" ? "respins" : "documente", "Actualizează documentele.");
    const officer = await finish(api.getCase(realId));
    const status = await finish(api.getClientCaseStatus(realId));
    const portal = await finish(api.getClientPortalCase(realId));
    expect(officer?.status).toBe(outcome === "approved" ? "Aprobat" : outcome === "rejected" ? "Respins" : "Documente solicitate");
    expect(status?.decision).toBe(outcome === "documents_requested" ? null : outcome);
    expect(portal?.stage).toBe(outcome === "documents_requested" ? "documente_solicitate" : "finalizat");
    for (const forbidden of ["flags", "riskDraft", "evidence", "officerNote", "screening", "resolution_note"]) expect(JSON.stringify({ status, portal })).not.toContain(forbidden);
    expect(localStorage.length).toBe(0);
  });
  it("nu scrie mock după probe eșuate, refresh, cădere la POST sau operații neconectate; permite revenirea", async () => {
    save({ ...sample(), id: realId }); const before = localStorage.getItem(key);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline")); vi.stubGlobal("fetch", fetch);
    expect(await finish(api.getCase(realId))).toMatchObject({ serviceUnavailable: true, source: "backend" });
    vi.resetModules(); api = await import("@/api/client");
    for (const call of [() => api.submitDecision(realId, "respins", "Motiv"), () => api.dismissFlag(realId, "flag_001", "Motiv"), () => api.resolveScreeningMatch(realId, "flag_001", "confirmed"), () => api.checkPortalDocument(realId, 1, new File(["x"], "act.pdf")), () => api.submitPortalCase(realId)]) {
      await expect(call()).rejects.toThrow("nu răspunde"); expect(localStorage.getItem(key)).toBe(before);
    }
    fetch.mockImplementation(async (_url: string, init?: RequestInit) => { if (init?.method === "POST") throw new TypeError("stopped"); return response(fixture); });
    await expect(api.submitDecision(realId, "respins", "Motiv")).rejects.toThrow("modificările nu au fost salvate");
    expect(localStorage.getItem(key)).toBe(before);
    expect(write).not.toHaveBeenCalled();
    fetch.mockResolvedValue(response(fixture));
    expect(await api.orchestratorAvailable(true)).toBe(true);
    await expect(api.submitDecision(realId, "respins", "Motiv")).resolves.toEqual({ ok: true });
    // Uploads to real cases now go to the orchestrator; the server here returns no new document, so the client is
    // told the reading is not finished. The playbook loader's simulated delay needs the fake clock advanced.
    await expect(finish(api.checkPortalDocument(realId, 1, new File(["x"], "act.pdf")))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("nu este finalizată") });
    expect(localStorage.getItem(key)).toBe(before);
  });
  it("nu scrie mock când POST răspunde 503", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => response(fixture, init?.method === "POST" ? 503 : 200)); vi.stubGlobal("fetch", fetch);
    await expect(api.dismissFlag(realId, "flag_001", "Motiv")).rejects.toThrow("modificările nu au fost salvate");
    expect(localStorage.length).toBe(0);
  });
  it.each(["approved", "rejected"] as const)("recitește dosarul real %s înainte de orice mutație", async (outcome) => {
    const fetch = vi.fn().mockResolvedValue(response({ ...fixture, status: "decided", decision: { outcome } })); vi.stubGlobal("fetch", fetch);
    for (const call of [() => api.submitDecision(realId, "documente", "Motiv"), () => api.dismissFlag(realId, "flag_001", "Motiv"), () => api.resolveScreeningMatch(realId, "flag_001", "confirmed"), () => api.checkPortalDocument(realId, 1, new File(["x"], "act.pdf")), () => api.submitPortalCase(realId)]) await expect(call()).rejects.toThrow("închis");
    expect(fetch.mock.calls.every((args) => !(args[1] as RequestInit)?.method)).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});

describe("Închiderea și solicitările mock", () => {
  it.each(["Aprobat", "Respins"] as const)("blochează toate mutațiile în starea %s", async (status) => {
    const c = { ...sample(), status }; save(c); const before = localStorage.getItem(key);
    for (const call of [() => api.submitDecision(c.id, "respins", ""), () => api.submitDecision(c.id, "documente", "Cerere"), () => api.dismissFlag(c.id, "f", "Motiv"), () => api.resolveScreeningMatch(c.id, "f", "confirmed"), () => api.checkPortalDocument(c.id, 1, new File(["x"], "act.pdf")), () => api.submitPortalCase(c.id)]) await expect(call()).rejects.toThrow("închis");
    expect(localStorage.getItem(key)).toBe(before);
  });
  it("verifică din nou înaintea salvării unui upload sau unei decizii deja pornite", async () => {
    for (const action of ["upload", "decision"]) {
      const c = sample(); save(c);
      const promise = action === "upload" ? api.checkPortalDocument(c.id, 1, new File(["x"], "act.pdf")) : api.submitDecision(c.id, "respins", "");
      const observed = promise.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100);
      save({ ...c, status: "Aprobat" });
      await vi.runAllTimersAsync(); expect(await observed).toBeInstanceOf(Error); expect(stored().status).toBe("Aprobat");
    }
  });
  it("rezolvă doar documentul solicitat, păstrează screeningul și falsificarea fără legătură", async () => {
    const c = sample(); c.status = "Documente solicitate";
    const template = c.documents[0]!;
    c.documents = [{ ...template, id: "id-custom", type: "Act de identitate", fileName: "identity_document.pdf" }, { ...template, id: "bill-custom", type: "Factură", fileName: "utility_bill.pdf" }];
    c.flags = [flag("id-request", "id-custom"), flag("bill-request", "bill-custom"), { ...flag("screening", "bill-custom"), stage: "screening", client_fixable: false }, { ...flag("tamper", "bill-custom"), ruleId: "R-PF-012", client_fixable: false }]; save(c);
    expect((await finish(api.checkPortalDocument(c.id, 1, new File(["x"], "act_expirat.pdf")))).ok).toBe(false);
    expect(stored().flags.every((f) => f.status === "sent_to_client")).toBe(true);
    await finish(api.checkPortalDocument(c.id, 1, new File(["x"], "act.pdf")));
    expect(stored().status).toBe("Documente solicitate"); expect(stored().flags.map((f) => f.status)).toEqual(["resolved", "sent_to_client", "sent_to_client", "sent_to_client"]);
    expect(await finish(api.getClientCaseStatus(c.id))).toMatchObject({ client_messages: ["Document actualizat bill-request"], upload_step: 2 });
    await expect(api.submitPortalCase(c.id)).rejects.toThrow("solicitări");
    await finish(api.checkPortalDocument(c.id, 2, new File(["x"], "factura.pdf")));
    expect(stored().status).toBe("În analiză"); expect(stored().flags.slice(2).every((f) => f.status === "sent_to_client")).toBe(true);
  });
  it("distinge același tip de document pentru persoane diferite și nu ghicește cererile ambigue", async () => {
    const c = sample(); c.customerType = "PJ"; c.status = "Documente solicitate";
    c.persons = [{ id: "a", name: "Ana", role: "UBO" }, { id: "b", name: "Bogdan", role: "UBO" }];
    c.portalDocuments = portalDocumentPlan("PJ", ["id_card"], c.persons);
    const template = c.documents[0]!;
    c.documents = c.persons.map((p) => ({ ...template, id: `act-${p.id}`, ownerPersonId: p.id, type: "Act de identitate", fileName: `id_card_${p.id}.pdf` }));
    c.flags = [flag("a-req", "act-a", "a"), flag("b-req", "act-b", "b"), { ...flag("ambiguous", "absent"), fix_message: "Încarcă un act de identitate." }]; save(c);
    await finish(api.checkPortalDocument(c.id, 1, new File(["x"], "act.pdf")));
    expect(stored().flags.map((f) => f.status)).toEqual(["resolved", "sent_to_client", "sent_to_client"]);
    expect(await finish(api.getClientCaseStatus(c.id))).toMatchObject({ upload_step: 2 });
    await finish(api.checkPortalDocument(c.id, 2, new File(["x"], "act.pdf")));
    expect(stored().status).toBe("Documente solicitate"); expect(stored().flags[2]?.status).toBe("sent_to_client");
    expect(await finish(api.getClientCaseStatus(c.id))).toMatchObject({ upload_step: null, client_messages: ["Încarcă un act de identitate."] });
  });
  it("păstrează solicitarea veche cu requestedStep și oferă selecție explicită pentru cereri noi", async () => {
    const c = sample(); c.status = "Documente solicitate"; c.requestedStep = 2; c.officerNote = "O copie lizibilă."; save(c);
    await finish(api.checkPortalDocument(c.id, 1, new File(["x"], "act.pdf"))); expect(stored().status).toBe("Documente solicitate");
    await finish(api.checkPortalDocument(c.id, 2, new File(["x"], "factura.pdf"))); expect(stored().status).toBe("În analiză");
    await finish(api.submitDecision(c.id, "documente", "Copii noi.", ["doc-1", "doc-3"]));
    await finish(api.checkPortalDocument(c.id, 1, new File(["x"], "act.pdf"))); expect(stored().status).toBe("Documente solicitate");
    expect(await finish(api.getClientCaseStatus(c.id))).toMatchObject({ upload_step: 3 });
    await finish(api.submitDecision(c.id, "documente", "Și factura.", ["doc-2"]));
    await finish(api.checkPortalDocument(c.id, 2, new File(["x"], "factura.pdf")));
    expect(stored().status).toBe("Documente solicitate");
    expect(await finish(api.getClientCaseStatus(c.id))).toMatchObject({ upload_step: 3, client_messages: ["Copii noi."] });
  });
});

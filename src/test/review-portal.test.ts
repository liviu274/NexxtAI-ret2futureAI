import { beforeEach, describe, expect, it } from "vitest";
import { blockingFlags, passedChecks } from "@/lib/review";
import { canCopyClientMessage } from "@/lib/screening";
import { portalDocumentPlan, simulatePortalResult } from "@/lib/portal";
import { cases, playbooks, auditLog } from "@/mocks/data";
import { createPortalCase, checkPortalDocument, submitPortalCase, listCases, getCase, submitDecision, dismissFlag } from "@/api/client";
import type { Flag } from "@/types";
beforeEach(() => localStorage.clear());
describe("Approval and review rules", () => {
 const f = cases[0]?.flags[0];
 if (!f) throw new Error("Missing flag");
 it.each(["high", "critical"] as const)("blocks %s open and sent-to-client flags", (severity) => {
  expect(blockingFlags([{...f,severity,status:"open"},{...f,severity,status:"sent_to_client"}])).toHaveLength(2);
 });
 it.each(["resolved", "dismissed"] as const)("does not block %s flags", (status) => {expect(blockingFlags([{...f,status}])).toHaveLength(0);});
 it("does not block medium flags", () => {expect(blockingFlags([{...f,severity:"medium",status:"open"}])).toHaveLength(0);});
 it("forbids approval through the API while a PF or PJ case is blocked", async () => {
  for(const id of ["case_pf_12_modificari_combinate","case_pj_07_procente_diferite"]) await expect(submitDecision(id,"aprobat","")).rejects.toThrow("blocată");
 });
 it("requires a dismissal reason and reads back Elena Radu attribution", async () => {
  await expect(dismissFlag(cases[0]?.id??"",f.id," ")).rejects.toThrow();
  await dismissFlag(cases[0]?.id??"",f.id,"Verificat cu originalul");
  expect((await getCase(cases[0]?.id??""))?.flags[0]).toMatchObject({status:"dismissed",dismissedBy:"Elena Radu",dismissalNote:"Verificat cu originalul"});
 });
 it("requires both client_fixable and nonnull fix_message", () => {
  const ordinary: Flag={...f,ruleId:"R-PF-003",title:"Act expirat",client_fixable:true,fix_message:"Încarcă un act valabil."};
  expect(canCopyClientMessage(ordinary)).toBe(true);
  expect(canCopyClientMessage({...ordinary,client_fixable:false})).toBe(false);
  expect(canCopyClientMessage({...ordinary,fix_message:null})).toBe(false);
 });
 it("never allows tamper or screening client copy", () => {
  expect(cases.flatMap((c)=>c.flags).filter((f)=>f.stage==="screening"||["R-PF-012","R-PF-013","R-PF-014","R-PF-015"].includes(f.ruleId)).every((f)=>!canCopyClientMessage(f)&&f.client_fixable===false)).toBe(true);
 });
 it("counts executed playbook rules minus findings", () => {
  const c=cases[0];if(!c)throw new Error("Missing case");expect(passedChecks(c,playbooks[0])).toBe(5);
 });
 it("has the complete 23-event main PF pipeline with exact stage counts", () => {
  const rows=auditLog.filter((a)=>a.caseId==="case_pf_12_modificari_combinate" && a.id.includes("-pipeline-"));expect(rows).toHaveLength(23);
  expect(Object.fromEntries([...new Set(rows.map((a)=>a.stage))].map((stage)=>[stage,rows.filter((a)=>a.stage===stage).length]))).toEqual({"Încărcări client":3,"Clasificare":3,"Extracție":3,"Validare":3,"Verificare încrucișată":2,"Detectare falsificare":4,"Screening":3,"Propunere de risc":1,"Dosar pregătit":1});
  expect(rows.filter((r)=>["Validare","Verificare încrucișată","Screening"].includes(r.stage)).every((r)=>r.status==="ok")).toBe(true);
 });
});
describe("Portal demo rules", () => {
 it("has exactly three PF documents with address second", () => {const p=playbooks.find((p)=>p.customerType==="PF");expect(portalDocumentPlan("PF",p?.requiredDocuments??[],[]).map((d)=>d.type)).toEqual(["identity_document","utility_bill","payslip"]);});
 it("groups PJ documents by company and person", () => {const p=playbooks.find((p)=>p.customerType==="PJ");const docs=portalDocumentPlan("PJ",p?.requiredDocuments??[],[{id:"a",name:"Daria Model",role:"administrator"},{id:"b",name:"Tudor Exemplu",role:"UBO"}]);expect(docs.map((d)=>[d.type,d.personName??null])).toEqual([["certificat_constatator",null],["act_constitutiv",null],["ubo_declaration",null],["id_card","Daria Model"],["signature_specimen","Daria Model"],["id_card","Tudor Exemplu"]]);});
 it("rejects expired ID on 15.01.2025", () => {expect(simulatePortalResult("identity_document","act_expirat.pdf")).toEqual({ok:false,message:"Actul de identitate a expirat pe 15.01.2025. Încarcă un act valabil."});});
 it("rejects address mismatch on bill", () => {expect(simulatePortalResult("utility_bill","factura_adresa.pdf")).toEqual({ok:false,message:"Adresa de pe factură nu este aceeași cu cea din actul de identitate. Încarcă o factură pe adresa din act."});});
 it("rejects name mismatch", () => {expect(simulatePortalResult("payslip","nume.pdf")).toEqual({ok:false,message:"Numele de pe document nu este același cu cel din actul de identitate."});});
 it("shows edited payslip OK to client", () => {expect(simulatePortalResult("payslip","fluturas_editat_font.pdf")).toEqual({ok:true,message:"Documentul este în regulă."});});
 it("blocks incomplete submission", async () => {const c=await createPortalCase("PF",[{id:"pf",name:"Mara Exemplu",role:"titular"}]);await expect(submitPortalCase(c.id)).rejects.toThrow();});
 it("shares submission and officer requests, then returns a replacement to review", async () => {
  const c=await createPortalCase("PF",[{id:"pf",name:"Mara Exemplu",role:"titular"}]);
  for(const n of [1,2,3]) await checkPortalDocument(c.id,n,new File(["sample"],`document-${n}.pdf`));
  await submitPortalCase(c.id);expect((await listCases()).find((r)=>r.id===c.id)?.status).toBe("În analiză");
  await submitDecision(c.id,"documente","Încarcă o factură mai clară.");expect(await getCase(c.id)).toMatchObject({status:"Documente solicitate",officerNote:"Încarcă o factură mai clară.",requestedStep:2});
  await checkPortalDocument(c.id,2,new File(["sample"],"factura-corecta.pdf"));expect((await getCase(c.id))?.status).toBe("În analiză");
 },20000);
 it("gives the officer real documents, all 4 tamper findings and a critical risk for an edited payslip", async () => {
  const c=await createPortalCase("PF",[{id:"pf",name:"Mara Exemplu",role:"titular"}]);
  await checkPortalDocument(c.id,1,new File(["sample"],"buletin.png"));
  await checkPortalDocument(c.id,2,new File(["sample"],"factura.png"));
  await checkPortalDocument(c.id,3,new File(["sample"],"fluturas_modificat.png"));
  await submitPortalCase(c.id);
  const sent=await getCase(c.id);
  expect(sent?.documents.map((d)=>d.id)).toEqual(["doc_001","doc_002","doc_003"]);
  expect(sent?.documents.every((d)=>d.pageImages[0]?.startsWith("/mocks/"))).toBe(true);
  expect(sent?.flags.map((f)=>f.ruleId).sort()).toEqual(["R-PF-012","R-PF-013","R-PF-014","R-PF-015"]);
  expect(sent?.riskDraft.level).toBe("critical");
  await checkPortalDocument(c.id,3,new File(["sample"],"fluturas.png"));
  expect((await getCase(c.id))?.flags).toHaveLength(0);
 },30000);
});
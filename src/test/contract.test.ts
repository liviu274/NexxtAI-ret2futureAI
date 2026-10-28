import { describe, expect, it } from "vitest";
import {
  portalPlanFor,
  toScreeningMatch,
  toAuditEntry,
  toCase,
  toClientStatus,
  toEvidence,
  toFlag,
  toPlaybook,
  type ApiCaseFile,
  type ApiClientView,
  type ApiFlag,
  type ApiPlaybook,
} from "@/api/contract";

const playbook: ApiPlaybook = {
  playbook_id: "pb_cont_pf_v1",
  version: 1,
  process_name: "Cont curent PF",
  customer_type: "PF",
  source_procedure: { file: "procedures/PF-ONB-01.pdf", generated_at: "2026-10-28T10:00:00+02:00" },
  required_documents: [
    { doc_type: "id_card", applies_to: "applicant", alternatives: ["passport"] },
    { doc_type: "proof_of_address", applies_to: "applicant", alternatives: [] },
  ],
  rules: [
    {
      rule_id: "R-PF-002",
      stage: "validate",
      check: "not_expired",
      params: { doc_type: "id_card", field: "expiry_date" },
      applies_to: "applicant",
      severity: "high",
      description: "Actul de identitate trebuie să fie valabil.",
      client_fixable: true,
      fix_message: null,
      source_ref: { page: 1, quote: "Actul trebuie să fie valabil." },
    },
  ],
};

const flag: ApiFlag = {
  flag_id: "flag_001",
  case_id: "case_1",
  rule_id: "R-PF-002",
  person_id: null,
  stage: "validate",
  severity: "high",
  title: "id_card expired",
  explanation: "expired",
  evidence: [
    {
      doc_id: "doc_001",
      page: 1,
      bbox: [0.1, 0.2, 0.5, 0.3],
      field_id: "fld_1",
      quote: "15.01.2025",
    },
  ],
  client_fixable: true,
  fix_message: "Încarcă un act valabil.",
  status: "sent_to_client",
  created_by: "orchestrator",
  created_at: "2026-10-28T10:00:00+02:00",
  resolution_note: null,
};

const caseFile: ApiCaseFile = {
  case_id: "case_1",
  playbook_id: "pb_cont_pf_v1",
  customer_type: "PF",
  status: "waiting_client",
  created_at: "2026-10-28T10:00:00+02:00",
  updated_at: "2026-10-28T10:05:00+02:00",
  company: null,
  persons: [{ person_id: "p_pf", role: "applicant", full_name: "Mara Exemplu" }],
  documents: [
    {
      doc_id: "doc_001",
      file: "docs/doc_001.pdf",
      mime_type: "application/pdf",
      pages: 2,
      uploaded_at: "2026-10-28T10:01:00+02:00",
      doc_type: "id_card",
      classification_confidence: 0.98,
      owner_person_id: "p_pf",
      fields: {},
    },
  ],
  flags: [flag, { ...flag, flag_id: "flag_002", status: "resolved" }],
  risk_draft: {
    level: "high",
    reasons: [{ text: "id_card expired (R-PF-002)", flag_ids: ["flag_001"] }],
  },
  decision: null,
};

describe("orchestrator contract → screen types", () => {
  it("maps a case file, dropping resolved flags and pointing pages at the API", () => {
    const c = toCase(caseFile, [playbook], "http://api");
    expect(c).toMatchObject({
      id: "case_1",
      clientName: "Mara Exemplu",
      status: "Documente solicitate",
      createdAt: "28.10.2026",
      playbookId: "pb_cont_pf_v1",
    });
    expect(c.persons).toEqual([{ id: "p_pf", name: "Mara Exemplu", role: "titular" }]);
    expect(c.flags.map((f) => f.id)).toEqual(["flag_001"]);
    expect(c.flags[0]).toMatchObject({
      ruleText: "Actul de identitate trebuie să fie valabil.",
      fix_message: "Încarcă un act valabil.",
    });
    expect(c.documents[0]).toMatchObject({
      type: "Act de identitate",
      status: "cu-probleme",
      pageImages: [
        "http://api/cases/case_1/documents/doc_001/pages/1.png",
        "http://api/cases/case_1/documents/doc_001/pages/2.png",
      ],
    });
    expect(c.riskDraft.level).toBe("high");
  });

  it("turns 1-based pages and [x0,y0,x1,y1] boxes into the viewer's form, and a whole page into no highlight", () => {
    expect(toEvidence(flag.evidence[0]!)).toEqual({
      documentId: "doc_001",
      page: 0,
      bbox: { x: 0.1, y: 0.2, width: 0.4, height: expect.closeTo(0.1) as number },
      field: "fld_1",
    });
    expect(toEvidence({ doc_id: "doc_001", page: 2, bbox: [0, 0, 1, 1] })).toEqual({
      documentId: "doc_001",
      page: 1,
    });
  });

  it("splits the analyst out of a dismissal note and shows info as low", () => {
    const f = toFlag(
      {
        ...flag,
        severity: "info",
        status: "dismissed",
        resolution_note: "Maria: checked: original seen",
      },
      () => undefined,
    );
    expect(f).toMatchObject({
      severity: "low",
      dismissedBy: "Maria",
      dismissalNote: "checked: original seen",
      ruleText: "id_card expired",
    });
  });

  it.each([
    ["decided", "approved", "Aprobat"],
    ["decided", "rejected", "Respins"],
    ["review", null, "În analiză"],
    ["intake", null, "Se verifică"],
  ] as const)("status %s/%s → %s", (status, outcome, label) => {
    expect(
      toCase(
        {
          ...caseFile,
          status,
          decision: outcome
            ? { outcome, decided_by: "m", decided_at: "2026-10-28T11:00:00+02:00", note: null }
            : null,
        },
        [playbook],
        "",
      ).status,
    ).toBe(label);
  });

  it("maps playbooks and audit entries", () => {
    const p = toPlaybook(playbook);
    expect(p).toMatchObject({
      id: "pb_cont_pf_v1",
      requiredDocuments: ["id_card", "proof_of_address"],
      sourceName: "PF-ONB-01.pdf",
    });
    expect(p.rules[0]).toMatchObject({
      id: "R-PF-002",
      kind: "valabilitate",
      sourceSentence: "Actul trebuie să fie valabil.",
    });
    const human = toAuditEntry({
      seq: 3,
      ts: "2026-10-28T10:00:01.123+02:00",
      case_id: "case_1",
      actor: "human:Maria",
      tool: "decision",
      input: {},
      output: null,
      duration_ms: 0,
      error: null,
    });
    expect(human).toMatchObject({
      actor: "human",
      stage: "Revizuire",
      timestamp: "28.10.2026 10:00:01.123",
    });
    expect(
      toAuditEntry({
        seq: 4,
        ts: "x",
        case_id: "c",
        actor: "orchestrator",
        tool: "check:pdf_metadata",
        input: {},
        output: [{}],
        duration_ms: 2,
        error: null,
      }),
    ).toMatchObject({ stage: "Detectare falsificare", status: "avertisment" });
  });
});

describe("client portal (live)", () => {
  const view: ApiClientView = {
    case_id: "case_1",
    customer_type: "PF",
    playbook_id: "pb_cont_pf_v1",
    status: "waiting_client",
    created_at: "2026-10-28T10:00:00+02:00",
    updated_at: "2026-10-28T10:05:00+02:00",
    decision: null,
    decided_at: null,
    request_note: null,
    client_messages: ["Încarcă un act valabil."],
    requests: [{ message: "Încarcă un act valabil.", doc_ids: ["doc_001"] }],
    persons: [{ person_id: "p_pf", role: "applicant", full_name: "Mara Exemplu" }],
    documents: [
      {
        doc_id: "doc_001",
        doc_type: "id_card",
        owner_person_id: "p_pf",
        uploaded_at: "2026-10-28T10:01:00+02:00",
      },
      {
        doc_id: "doc_002",
        doc_type: "proof_of_address",
        owner_person_id: "p_pf",
        uploaded_at: "2026-10-28T10:02:00+02:00",
      },
    ],
  };
  const uploaded = {
    "doc-1": { docId: "doc_001", fileName: "ci.pdf" },
    "doc-2": { docId: "doc_002", fileName: "factura.pdf" },
  };

  it("a step is done when its document is there, of the right type, and nothing is asked about it", () => {
    const plan = portalPlanFor(view, toPlaybook(playbook), uploaded);
    expect(plan.map((d) => [d.type, d.ok, d.fileName])).toEqual([
      ["id_card", false, "ci.pdf"],
      ["proof_of_address", true, "factura.pdf"],
    ]);
    expect(toClientStatus(view, plan)).toMatchObject({
      step: 2,
      state: "action_needed",
      client_messages: ["Încarcă un act valabil."],
      upload_step: 1,
    });
  });

  it("never exposes more than the client view carries", () => {
    const status = toClientStatus(
      { ...view, status: "decided", decision: "approved", decided_at: "2026-10-29T09:00:00+02:00" },
      [],
    );
    expect(status).toEqual({
      step: 4,
      state: "done",
      dates: { 1: "28.10.2026", 2: "29.10.2026", 3: "29.10.2026", 4: "29.10.2026" },
      client_messages: [],
      decision: "approved",
      upload_step: null,
    });
  });
});

describe("screening (live)", () => {
  const screening: ApiFlag = {
    ...flag,
    flag_id: "flag_009",
    rule_id: "R-PF-015",
    stage: "screening",
    person_id: "p_pf",
    client_fixable: false,
    fix_message: null,
    status: "open",
  };

  it("opens the side-by-side panel and carries the analyst's confirmation", () => {
    expect(toFlag(screening, () => undefined)).toMatchObject({
      stage: "screening",
      screeningPersonId: "p_pf",
    });
    expect(
      toFlag({ ...screening, resolution_note: "confirmed by Maria: same person" }, () => undefined),
    ).toMatchObject({
      screeningResolution: "confirmed",
      screeningReason: "same person",
      status: "open",
    });
    expect(
      toFlag(
        { ...screening, status: "dismissed", resolution_note: "Elena: different birth year" },
        () => undefined,
      ),
    ).toMatchObject({ screeningResolution: "dismissed", dismissedBy: "Elena" });
    expect(toFlag(flag, () => undefined).stage).toBeUndefined();
  });

  it("maps list entries and the client's identity", () => {
    const person = toScreeningMatch({
      entry: {
        pk_match_key: "PEP-RO-101#X",
        id_sursa: "PEP-RO-101",
        nume_complet: "Nikola Dimitrov",
        anul_nasterii: "1958",
        cetatenie: "RO",
        categorie_risc: "PEP",
        motiv_includere: "Government member",
        act_identitate_cunoscut: null,
      },
      score: 97,
      client: {
        name: "Nikola Dimitrov",
        birth_year: 1958,
        citizenship: "RO",
        identity_document: null,
      },
    });
    expect(person).toMatchObject({
      score: 97,
      entry: {
        id_sursa: "PEP-RO-101",
        anul_nasterii: 1958,
        categorie_risc: "PEP",
        act_identitate_cunoscut: "—",
      },
      client: { name: "Nikola Dimitrov", birthYear: 1958, citizenship: "RO" },
    });
    const media = toScreeningMatch({
      entry: {
        key: "media_x",
        id_stire: "NEWS-DEMO-001",
        nume_subiect: "Sorin Cobalt Fictiv",
        titlu_stire: "t",
        sursa_stire: "s",
        an_publicare: 2026,
        tara_subiect: "ZZ",
        cuvinte_cheie_risc: ["fraudă"],
        nivel_risc: "high",
      },
      score: 100,
      client: {
        name: "Sorin Cobalt Fictiv",
        birth_year: null,
        citizenship: null,
        identity_document: null,
      },
    });
    expect(media.entry).toMatchObject({
      id_stire: "NEWS-DEMO-001",
      cuvinte_cheie_risc: ["fraudă"],
      nivel_risc: "high",
    });
    expect(media.client).toEqual({ name: "Sorin Cobalt Fictiv" });
  });
});

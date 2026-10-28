import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cases } from "@/mocks/data";
import { toClientPortalCase } from "@/lib/client-status";
import { getCase, getClientPortalCase, getScreeningMatch, submitDecision, orchestratorAvailable, SERVICE_UNAVAILABLE } from "@/api/client";
import { DecisionBar } from "@/components/dosar/DecisionBar";
import { DismissFlag } from "@/components/dosar/DismissFlag";
import { CaseAvailability } from "@/components/dosar/CaseAvailability";
import { PortalStep, PortalSummary } from "@/components/dosar/PortalFlow";
import { ScreeningPanel } from "@/components/dosar/ScreeningPanel";

vi.mock("@/api/client", async (original) => ({ ...await original<typeof import("@/api/client")>(), getCase: vi.fn(), getClientPortalCase: vi.fn(), getScreeningMatch: vi.fn(), submitDecision: vi.fn(), orchestratorAvailable: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({ ...await original<typeof import("@tanstack/react-router")>(), useNavigate: () => vi.fn(), Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/dosar/Header", () => ({ ClientHeader: () => <header>Portal client</header> }));
let roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { await act(async () => { for (const root of roots) root.unmount(); }); roots = []; document.body.innerHTML = ""; });
function render(child: React.ReactNode) {
 const container = document.createElement("div"); document.body.appendChild(container);
 const root = createRoot(container); roots.push(root); act(() => root.render(child)); return { container };
}
const screen = {
 getByRole: (_role: string, { name }: { name: string }) => {
  const button = [...document.querySelectorAll("button")].find((el) => el.textContent === name);
  if (!button) throw new Error(`Button missing: ${name}`); return button;
 },
 getByText: (text: string) => {
  const el = [...document.querySelectorAll("p,span")].find((el) => el.textContent === text);
  if (!el) throw new Error(`Text missing: ${text}`); return el;
 },
 queryByText: (text: string) => [...document.querySelectorAll("p,span")].find((el) => el.textContent === text) ?? null,
 findByText: async (text: string) => { await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument()); return screen.getByText(text); }
};
async function waitFor(check: () => void) {
 for (let i = 0; i < 100; i++) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  try { check(); return; } catch (e) { if (i === 99) throw e; }
 }
}
const fireEvent = { click: (button: HTMLButtonElement) => act(() => button.click()) };
beforeEach(() => { vi.clearAllMocks(); });
function wrapper(child: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{child}</QueryClientProvider>); return qc;
}
const sample = () => ({ ...structuredClone(cases[0]!), id: "demo_ui", flags: [], status: "În analiză" as const });

describe("Protecțiile vizibile în UI", () => {
  it.each(["Aprobat", "Respins"] as const)("dezactivează deciziile și ignorarea când dosarul este %s", async (status) => {
    vi.mocked(getCase).mockResolvedValue({ ...sample(), status });
    wrapper(<><DecisionBar caseId="demo_ui"/><DismissFlag caseId="demo_ui" flagId="f"/></>);
    await waitFor(() => expect(getCase).toHaveBeenCalled());
    for (const name of ["Solicită documente", "Respinge", "Aprobă", "Ignoră cu motiv"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });
  it("dezactivează confirmarea unui dialog deschis când sosește starea finală", async () => {
    vi.mocked(getCase).mockResolvedValue(sample());
    const qc = wrapper(<DecisionBar caseId="demo_ui"/>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Respinge" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Respinge" }));
    expect(screen.getByRole("button", { name: "Confirmă respingerea" })).toBeEnabled();
    act(() => { qc.setQueryData(["case", "demo_ui"], { ...sample(), status: "Aprobat" }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmă respingerea" })).toBeDisabled());
    expect(submitDecision).not.toHaveBeenCalled();
  });
  it("arată indisponibilitatea, blochează salvarea și oferă reîncercare", async () => {
    vi.mocked(getCase).mockResolvedValue({ ...sample(), source: "backend", serviceUnavailable: true });
    vi.mocked(orchestratorAvailable).mockResolvedValue(false);
    wrapper(<><CaseAvailability reason={SERVICE_UNAVAILABLE}/><DecisionBar caseId="demo_ui"/></>);
    expect(screen.getByText(SERVICE_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Respinge" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reîncearcă conexiunea" }));
    await waitFor(() => expect(orchestratorAvailable).toHaveBeenCalledWith(true));
  });
  it("păstrează screeningul vizibil, cu rezoluțiile dezactivate după închidere", async () => {
    vi.mocked(getCase).mockResolvedValue({ ...sample(), status: "Respins" });
    vi.mocked(getScreeningMatch).mockResolvedValue({ score: 90, client: { name: "Mara" }, entry: { key: "test", id_sursa: "test", nume_complet: "Mara", anul_nasterii: 1980, cetatenie: "RO", categorie_risc: "PEP", motiv_includere: "Persoană de verificat", act_identitate_cunoscut: "TEST" } });
    wrapper(<ScreeningPanel caseId="demo_ui" flag={{ ...cases[0]!.flags[0]!, stage: "screening" }}/>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmă potrivirea" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Nu este aceeași persoană" })).toBeDisabled();
  });
  it.each(["step", "summary"])("ruta directă %s rămâne vizibilă, fără upload sau retrimitere după finalizare", async (page) => {
    const c = { ...sample(), status: "Aprobat" as const };
    vi.mocked(getClientPortalCase).mockResolvedValue(toClientPortalCase(c, [{ key: "act", type: "identity_document", label: "Act de identitate", ok: true, fileName: "act.pdf" }]));
    const { container } = render(<QueryClientProvider client={new QueryClient()}>{page === "step" ? <PortalStep caseId={c.id} step={1}/> : <PortalSummary caseId={c.id}/>}</QueryClientProvider>);
    await screen.findByText("Dosarul este închis. Modificările nu mai sunt permise.");
    if (page === "step") {
      expect(container.querySelector('input[type="file"]')).toBeDisabled();
      expect(screen.getByRole("button", { name: "Schimbă documentul" })).toBeDisabled();
    } else {
      expect(screen.getByRole("button", { name: "Trimite dosarul" })).toBeDisabled();
      expect(screen.queryByText("Schimbă")).not.toBeInTheDocument();
    }
    expect(getCase).not.toHaveBeenCalled();
  });
});

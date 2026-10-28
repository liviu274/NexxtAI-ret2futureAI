import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PortalLayout } from "@/components/dosar/PortalFlow";
import { listMyPortalCases } from "@/api/client";

export const Route = createFileRoute("/portal/dosare")({
  component: DosarulMeu,
  head: () => ({
    meta: [
      { title: "Dosarul meu · Portal client DosarAI" },
      { name: "description", content: "Dosarele deschise din acest browser și starea lor." },
      { property: "og:title", content: "Dosarul meu · Portal client DosarAI" },
      { property: "og:description", content: "Vezi starea dosarelor tale de deschidere cont." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DosarulMeu() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-portal-cases"],
    queryFn: listMyPortalCases,
  });
  return (
    <PortalLayout>
      <h1 className="text-[22px] font-semibold">Dosarul meu</h1>
      {isLoading ? (
        <Loader2 className="mt-6 h-5 w-5 animate-spin" />
      ) : !data?.length ? (
        <p className="mt-6 text-sm text-ink-muted">
          Nu ai încă niciun dosar pornit din acest browser.{" "}
          <Link to="/portal" className="text-teal">
            Începe un dosar nou
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {data.map((c) => (
            <Link
              key={c.id}
              to="/portal/$caseId"
              params={{ caseId: c.id }}
              className="flex items-center justify-between gap-3 py-4 text-xs"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{c.clientName}</p>
                <p className="mt-1 text-ink-muted">
                  {c.customerType === "PF" ? "Persoană fizică" : "Firmă"} · {c.id}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-beige-dark px-3 py-1 text-ink">
                {c.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}

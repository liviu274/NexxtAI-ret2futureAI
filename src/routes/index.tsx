import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/cases" });
  },
  head: () => ({
    meta: [
      { title: "DosarAI · Onboarding KYC asistat de AI" },
      { name: "description", content: "DosarAI verifică documentele clienților față de playbook-ul băncii și semnalează problemele cu dovezi." },
      { property: "og:title", content: "DosarAI · Onboarding KYC asistat de AI" },
      { property: "og:description", content: "Verificare KYC/KYB asistată de AI, cu decizia finală la analist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

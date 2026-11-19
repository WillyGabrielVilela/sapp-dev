import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileSearch, ShieldCheck, Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SAPP — Sistema de Acompanhamento de Processos | IPEM-PE" },
      { name: "description", content: "Consulte onde está cada processo, quem encaminhou, quem recebeu e qual é a próxima providência." },
      { property: "og:title", content: "SAPP — Sistema de Acompanhamento de Processos" },
      { property: "og:description", content: "Rastreabilidade de processos entre CCA, CPMA e Jurídico do IPEM-PE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold tracking-tight">SAPP</span>
            <span className="text-sm opacity-70">IPEM-PE</span>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/painel">Entrar</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-3 inline-block rounded bg-warning px-2 py-1 text-xs font-medium text-warning-foreground">
          Protótipo V1 — somente dados fictícios
        </p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight">
          Onde está o processo, com quem, desde quando — e o que falta.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Ferramenta complementar ao SGI para acompanhar o fluxo CCA → CPMA → Jurídico com histórico imutável.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/painel">
            Acessar o painel <ArrowRight />
          </Link>
        </Button>
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            { icon: FileSearch, t: "Importação do JR5260", d: "O CCA envia o PDF do SGI, confere e confirma o cadastro." },
            { icon: RouteIcon, t: "Tramitação rastreada", d: "Cada envio e recebimento fica registrado com data, hora e responsável." },
            { icon: ShieldCheck, t: "Histórico imutável", d: "Eventos nunca são editados nem apagados; correções são auditadas." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-lg border bg-card p-5">
              <Icon className="mb-3 size-5 text-primary" />
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

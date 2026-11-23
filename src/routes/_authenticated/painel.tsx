import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { listarProcessosFn } from "@/lib/processos.functions";
import { useSessao } from "@/lib/auth";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { dataBR, SETOR, SITUACAO, type Processo } from "@/lib/rotulos";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — SAPP" },
      { name: "description", content: "Filas por setor e busca de processos." },
      { property: "og:title", content: "Painel — SAPP" },
      { property: "og:description", content: "Filas por setor e busca de processos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { data: sessao } = useSessao();
  const [busca, setBusca] = useState("");
  const { data: processos = [] } = useQuery({
    queryKey: ["processos"],
    queryFn: () => listarProcessosFn(),
  });
  if (!sessao) return null;
  if (!sessao.tem("cca", "cpma", "juridico", "gestao", "presidente", "homologador")) return <SemPermissao />;

  const termo = busca.trim();
  const resultados = termo ? processos.filter((p) => p.numero.includes(termo) || (p.numero_ai ?? "").includes(termo)) : [];

  const filas: { titulo: string; itens: Processo[] }[] = [];
  const add = (titulo: string, f: (p: Processo) => boolean) => filas.push({ titulo, itens: processos.filter(f) });
  if (sessao.tem("cca")) {
    add("CCA · Devolvidos a receber", (p) => p.setor_destino === "CCA");
    add("CCA · Em correção", (p) => p.setor_atual === "CCA" && !p.setor_destino && p.situacao === "em_correcao_cca");
    add("CCA · Enviados, aguardando o CPMA receber", (p) => p.setor_atual === "CCA" && p.setor_destino === "CPMA");
  }
  if (sessao.tem("cpma")) {
    add("CPMA · A receber", (p) => p.setor_destino === "CPMA");
    add("CPMA · Em conferência e digitalização", (p) => p.setor_atual === "CPMA" && !p.setor_destino);
    add("CPMA · Enviados, aguardando o Jurídico receber", (p) => p.setor_atual === "CPMA" && p.setor_destino === "JURIDICO");
  }
  if (sessao.tem("presidente") && !sessao.tem("juridico")) add("Presidência · A assinar", (p) => p.situacao === "julgado");
  if (sessao.tem("homologador") && !sessao.tem("juridico")) add("Homologação · A homologar", (p) => p.situacao === "assinado_presidente");
  if (sessao.tem("juridico")) {
    add("Jurídico · A receber", (p) => p.setor_destino === "JURIDICO");
    add("Jurídico · A protocolar", (p) => p.situacao === "recebido_juridico");
    add("Jurídico · A notificar (protocolados e não entregues)", (p) => p.situacao === "protocolado_juridico" || p.situacao === "notificacao_frustrada");
    add("Jurídico · Entregas a registrar", (p) => p.situacao === "notificacao_enviada");
    add("Jurídico · Prazo de defesa correndo", (p) => p.situacao === "aguardando_defesa");
    add("Jurídico · Aguardando julgamento", (p) => p.situacao === "com_defesa" || p.situacao === "sem_defesa" || p.situacao === "julgamento_devolvido");
    add("Jurídico · Julgados, aguardando o Presidente", (p) => p.situacao === "julgado");
    add("Jurídico · Assinados, aguardando homologação", (p) => p.situacao === "assinado_presidente");
    add("Jurídico · Homologados", (p) => p.situacao === "homologado");
  }

  const contagem = (Object.keys(SITUACAO) as (keyof typeof SITUACAO)[]).map((s) => ({
    s,
    n: processos.filter((p) => p.situacao === s).length,
  }));

  return (
    <>
      <Cabecalho titulo="Painel" sub="Busque pelo número do processo ou acompanhe as filas do seu setor." />
      <div className="relative mb-8 max-w-xl">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="num-processo h-11 pl-9"
          placeholder="Número do processo (ex.: 12345.000123/2026-01)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      {termo && (
        <section className="mb-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Resultado da busca ({resultados.length})
          </h2>
          <Tabela itens={resultados} vazio="Nenhum processo encontrado com esse número (ou nº de AI)." />
        </section>
      )}
      {sessao.tem("gestao") && (
        <section className="mb-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {contagem.map(({ s, n }) => (
            <div key={s} className="rounded-lg border bg-card p-4">
              <div className="text-2xl font-bold">{n}</div>
              <div className="text-xs text-muted-foreground">{SITUACAO[s]}</div>
            </div>
          ))}
        </section>
      )}
      <div className="space-y-8">
        {filas.map((f) => (
          <section key={f.titulo}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {f.titulo} ({f.itens.length})
            </h2>
            <Tabela itens={f.itens} vazio="Fila vazia." />
          </section>
        ))}
        {sessao.tem("gestao") && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Todos os processos ({processos.length})
            </h2>
            <Tabela itens={processos} vazio="Nenhum processo cadastrado." />
          </section>
        )}
      </div>
    </>
  );
}

function Tabela({ itens, vazio }: { itens: Processo[]; vazio: string }) {
  if (!itens.length) return <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Processo</th>
            <th className="px-3 py-2">Esp.</th>
            <th className="px-3 py-2">Abertura</th>
            <th className="px-3 py-2">Setor atual</th>
            <th className="px-3 py-2">Situação</th>
            <th className="px-3 py-2">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((p) => (
            <tr key={p.id} className="border-t hover:bg-muted/50">
              <td className="px-3 py-2">
                <Link to="/processos/$id" params={{ id: p.id }} className="num-processo font-medium text-primary hover:underline">
                  {p.numero}
                </Link>
              </td>
              <td className="px-3 py-2">{p.especie ?? "—"}</td>
              <td className="px-3 py-2">{dataBR(p.abertura)}</td>
              <td className="px-3 py-2">
                {SETOR[p.setor_atual]}
                {p.setor_destino && <span className="text-muted-foreground"> → {SETOR[p.setor_destino]}</span>}
              </td>
              <td className="px-3 py-2">
                <Badge variant="secondary">{SITUACAO[p.situacao]}</Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{dataBR(p.updated_at, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { BotaoCsv } from "@/components/BotaoCsv";
import { COLUNAS_PROCESSO } from "@/lib/csv-colunas";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Inbox, Send, UserRoundCheck } from "lucide-react";
import { listarProcessosFn } from "@/lib/processos.functions";
import { useSessao } from "@/lib/auth";
import { acoesCpma } from "@/lib/cpma";
import { dataBR, SITUACAO } from "@/lib/rotulos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/cpma")({
  head: () => ({ meta: [
    { title: "CPMA — Recebimento e fiscais | SAPP" },
    { name: "description", content: "Processos encaminhados à CPMA, recebimento e indicação do fiscal do Termo de Ocorrência." },
    { property: "og:title", content: "CPMA — Recebimento e fiscais | SAPP" },
    { property: "og:description", content: "Acompanhamento dos processos a receber e em conferência pela CPMA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Cpma,
});

function Cpma() {
  const { data: sessao } = useSessao();
  const [busca, setBusca] = useState("");
  const { data: processos = [], isLoading, error } = useQuery({
    queryKey: ["processos"],
    enabled: sessao?.tem("cpma") ?? false,
    queryFn: () => listarProcessosFn(),
  });
  if (!sessao) return null;
  if (!sessao.tem("cpma")) return <SemPermissao />;
  const filas = [
    { titulo: "A receber", itens: processos.filter((p) => acoesCpma(p, sessao.papeis).receber) },
    { titulo: "Recebidos · Conferência, fiscal e digitalização", itens: processos.filter((p) => { const a = acoesCpma(p, sessao.papeis); return a.informarFiscal && !a.encaminharJuridico; }) },
    { titulo: "Prontos para o Jurídico", itens: processos.filter((p) => acoesCpma(p, sessao.papeis).encaminharJuridico) },
  ];
  return <>
    <Cabecalho titulo="CPMA" sub="Recebimento de processos e fiscal do Termo de Ocorrência" />
    <Input className="mb-6 max-w-xl num-processo" aria-label="Buscar processo na CPMA" placeholder="Buscar pelo número do processo" value={busca} onChange={(e) => setBusca(e.target.value)} />
    {error ? <p role="alert" className="text-destructive">Não foi possível carregar os processos.</p> : isLoading ? <p className="text-muted-foreground">Carregando processos…</p> :
      <div className="space-y-8">{filas.map(({ titulo, itens }) => {
        const visiveis = itens.filter((p) => p.numero.includes(busca.trim()));
        return <section key={titulo}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{titulo} ({visiveis.length})</h2><BotaoCsv nome={titulo.split(" ·")[0]!.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")} colunas={COLUNAS_PROCESSO} linhas={visiveis} /></div>
          {!visiveis.length ? <p className="border-t py-4 text-sm text-muted-foreground">Nenhum processo nesta fila.</p> :
            <div className="tabela-rolavel rounded-md border"><table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground"><tr><th className="p-3">Processo</th><th className="p-3">Espécie</th><th className="p-3">Abertura</th><th className="p-3">Situação</th><th className="p-3">Providência</th></tr></thead>
              <tbody>{visiveis.map((p) => {
                const { receber, encaminharJuridico } = acoesCpma(p, sessao.papeis);
                return <tr key={p.id} className="border-t">
                  <td className="p-3"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "cpma" }} className="num-processo whitespace-nowrap text-primary hover:underline">{p.numero}</Link></td>
                  <td className="p-3">{p.especie ?? "—"}</td><td className="p-3 whitespace-nowrap">{dataBR(p.abertura)}</td>
                  <td className="p-3"><Badge variant="secondary">{SITUACAO[p.situacao]}</Badge></td>
                  <td className="p-3"><Button asChild variant={receber ? "default" : "outline"} size="sm"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "cpma" }}>{receber ? <Inbox /> : encaminharJuridico ? <Send /> : <UserRoundCheck />}{receber ? "Receber processo" : encaminharJuridico ? "Encaminhar ao Jurídico" : !p.fiscal_id ? "Informar fiscal" : "Registrar digitalização"}</Link></Button></td>
                </tr>;
              })}</tbody>
            </table></div>}
        </section>;
      })}</div>}
  </>;
}
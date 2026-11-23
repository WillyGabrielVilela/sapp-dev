import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { obterListaFn } from "@/lib/juridico.functions";
import { formatarDocumento } from "@/lib/documento";
import { CANAL, dataBR, RESULTADO, RESULTADO_SIGLA } from "@/lib/rotulos";
import type { ItemLista } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { ResultadoDialog } from "@/components/juridico/ResultadoDialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/listas-saida/$id")({
  head: () => ({ meta: [{ title: "Lista de saída — SAPP" }, { name: "description", content: "Lista de saída de notificações do Jurídico, com conferência das entregas." }] }),
  component: ListaSaidaPagina,
});

function ListaSaidaPagina() {
  const { id } = Route.useParams();
  const { data: sessao } = useSessao();
  const [item, setItem] = useState<ItemLista | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["lista", id], enabled: sessao?.tem("juridico", "gestao") ?? false, queryFn: () => obterListaFn({ data: { id } }) });
  if (!sessao) return null;
  if (!sessao.tem("juridico", "gestao")) return <SemPermissao />;
  if (isLoading) return null;
  if (!data) return <p className="text-sm text-muted-foreground">Lista não encontrada.</p>;
  const { lista, itens } = data;
  const titulo = `Lista de saída de notificações — ${dataBR(lista.data)} · nº ${lista.numero_dia}`;
  const pendentes = itens.filter((i) => i.resultado === "pendente").length;
  const editavel = sessao.tem("juridico");

  return (
    <>
      <Link to="/juridico" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" /> Voltar ao Jurídico
      </Link>
      <div className="print:hidden">
        <Cabecalho titulo={titulo} sub={`${CANAL[lista.canal]}${lista.titulo ? ` · ${lista.titulo}` : ""} · ${itens.length} item(ns), ${pendentes} sem desfecho`}>
          <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir</Button>
        </Cabecalho>
      </div>
      {/* Cabeçalho da folha impressa: título e data em toda página (relatório 002/RC, item 6) */}
      <div className="mb-2 hidden print:block">
        <div className="text-base font-bold">IPEM-PE · {titulo}</div>
        <div className="text-xs">{CANAL[lista.canal]}{lista.titulo ? ` · ${lista.titulo}` : ""} · Legenda: E = entregue · D = devolvido · R = recusado · M = mudou-se</div>
      </div>
      <div className="tabela-rolavel rounded-lg border bg-card print:border-0">
        <table className="w-full text-left text-sm print:text-xs">
          <thead className="bg-muted text-xs text-muted-foreground print:bg-transparent print:text-black">
            <tr>
              <th className="px-2 py-2">Nº</th><th className="px-2 py-2">Processo</th><th className="px-2 py-2">AI</th>
              <th className="px-2 py-2">Razão social (nome fantasia)</th><th className="px-2 py-2">CPF/CNPJ</th><th className="px-2 py-2">Bairro</th>
              <th className="px-2 py-2">Entregue em / a (assinatura)</th><th className="px-2 py-2 print:hidden">Desfecho</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i, n) => (
              <tr key={i.id} className="border-t align-top">
                <td className="px-2 py-2">{n + 1}</td>
                <td className="num-processo whitespace-nowrap px-2 py-2"><Link to="/processos/$id" params={{ id: i.processo_id }} search={{ area: "juridico" }} className="text-primary hover:underline print:text-black print:no-underline">{i.numero}</Link></td>
                <td className="px-2 py-2">{i.numero_ai ?? "—"}</td>
                <td className="px-2 py-2">{i.proprietario ?? "—"}{i.nome_fantasia ? ` (${i.nome_fantasia})` : ""}</td>
                <td className="whitespace-nowrap px-2 py-2">{formatarDocumento(i.documento_autuado)}</td>
                <td className="px-2 py-2">{i.bairro ?? "—"}</td>
                <td className="min-w-40 px-2 py-2">
                  {i.resultado === "pendente"
                    ? <span className="hidden print:inline">__/__/__ a ______________________</span>
                    : <span>{RESULTADO_SIGLA[i.resultado]} · {dataBR(i.data_resultado)}{i.recebedor ? ` · ${i.recebedor}` : ""}</span>}
                </td>
                <td className="px-2 py-2 print:hidden">
                  {i.resultado === "pendente"
                    ? editavel ? <Button size="sm" onClick={() => setItem(i)}>Registrar</Button> : "—"
                    : RESULTADO[i.resultado]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 hidden text-xs print:block">Total conferido: {itens.length} processo(s).</p>
      {item && <ResultadoDialog notificacaoId={item.id} canal={item.canal} titulo={item.numero} dataSaida={item.data_saida} fechar={() => setItem(null)} />}
    </>
  );
}

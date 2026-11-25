import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { listarClassificacaoGruFn } from "@/lib/classificacao.functions";
import { formatarDocumento } from "@/lib/documento";
import { dataBR } from "@/lib/rotulos";
import type { LinhaGru } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { brl } from "@/components/juridico/AcoesJulgamento";
import { PagamentoDialog } from "@/components/juridico/ClassificacaoDialogs";
import { hojeISO } from "@/components/juridico/ResultadoDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/divida-ativa")({
  head: () => ({ meta: [{ title: "Dívida ativa — listagem para recobrança | SAPP" }, { name: "description", content: "Processos com GRU não paga, em listagem de dívida ativa para recobrança." }] }),
  component: DividaAtiva,
});

const atraso = (v: string) => Math.floor((Date.parse(hojeISO()) - Date.parse(v)) / 86400000);
const csvCelula = (v: string) => `"${v.replace(/"/g, '""')}"`;

function exportarCsv(linhas: LinhaGru[]) {
  const cab = ["Processo", "AI", "Autuado", "CPF/CNPJ", "GRU", "Vencimento", "Valor (R$)", "Dias em atraso"];
  const corpo = linhas.map((l) => [l.numero, l.numero_ai ?? "", l.proprietario ?? "", formatarDocumento(l.documento_autuado).replace("—", ""), l.numero_gru, dataBR(l.vencimento), Number(l.valor).toFixed(2).replace(".", ","), String(atraso(l.vencimento))]);
  // ponto e vírgula + BOM: abre direto no Excel em português
  const csv = "\uFEFF" + [cab, ...corpo].map((r) => r.map(csvCelula).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `divida-ativa-${hojeISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DividaAtiva() {
  const { data: sessao } = useSessao();
  const habilitado = sessao?.tem("juridico", "gestao") ?? false;
  const { data: todas = [], isLoading } = useQuery({ queryKey: ["classificacao-gru"], enabled: habilitado, queryFn: () => listarClassificacaoGruFn() });
  const [busca, setBusca] = useState("");
  const [pagar, setPagar] = useState<LinhaGru | null>(null);
  if (!sessao) return null;
  if (!habilitado) return <SemPermissao />;
  const t = busca.trim().toLocaleLowerCase("pt-BR");
  const linhas = todas.filter((l) => l.situacao === "nao_pago").filter((l) => !t || l.numero.includes(t) || (l.numero_ai ?? "").includes(t) || l.numero_gru.toLowerCase().includes(t) || (l.proprietario ?? "").toLocaleLowerCase("pt-BR").includes(t));
  const total = linhas.reduce((s, l) => s + Number(l.valor), 0);
  return (
    <>
      <div className="print:hidden">
        <Cabecalho titulo="Dívida ativa — listagem para recobrança" sub={`${linhas.length} processo(s) · total ${brl(total)}`}>
          <Button variant="outline" onClick={() => exportarCsv(linhas)} disabled={!linhas.length}><Download /> Exportar CSV</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir</Button>
        </Cabecalho>
        <Input className="mb-4 max-w-xl" aria-label="Buscar" placeholder="Buscar por processo, AI, GRU ou autuado" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="mb-2 hidden print:block"><div className="text-base font-bold">IPEM-PE · Dívida ativa — listagem para recobrança · {dataBR(hojeISO())}</div></div>
      {isLoading ? <p className="text-muted-foreground">Carregando…</p> : !linhas.length ? <p className="border-t py-4 text-sm text-muted-foreground">Nenhum processo na listagem.</p> : (
        <div className="tabela-rolavel rounded-md border">
          <table className="w-full text-left text-sm print:text-xs">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-3">Processo</th><th className="p-3">AI</th><th className="p-3">Autuado</th><th className="p-3">CPF/CNPJ</th><th className="p-3">GRU</th><th className="p-3">Vencimento</th><th className="p-3">Atraso</th><th className="p-3">Valor</th><th className="p-3 print:hidden" /></tr></thead>
            <tbody>{linhas.map((l) => (
              <tr key={l.processo_id} className="border-t">
                <td className="p-3"><Link to="/processos/$id" params={{ id: l.processo_id }} search={{ area: "juridico" }} className="num-processo whitespace-nowrap text-primary hover:underline print:text-black print:no-underline">{l.numero}</Link></td>
                <td className="p-3">{l.numero_ai ?? "—"}</td><td className="p-3">{l.proprietario ?? "—"}</td>
                <td className="whitespace-nowrap p-3">{formatarDocumento(l.documento_autuado)}</td><td className="p-3">{l.numero_gru}</td>
                <td className="whitespace-nowrap p-3">{dataBR(l.vencimento)}</td><td className="whitespace-nowrap p-3">{atraso(l.vencimento)} d</td>
                <td className="whitespace-nowrap p-3">{brl(l.valor)}</td>
                <td className="p-3 print:hidden">{sessao.tem("juridico") && <Button size="sm" variant="outline" onClick={() => setPagar(l)}>Registrar pagamento</Button>}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {pagar && <PagamentoDialog alvo={{ processoId: pagar.processo_id, numero: pagar.numero, valor: pagar.valor, valorComDesconto: pagar.valor_com_desconto }} fechar={() => setPagar(null)} />}
    </>
  );
}

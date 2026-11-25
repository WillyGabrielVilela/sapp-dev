import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useSessao } from "@/lib/auth";
import { classificarNaoPagoLoteFn, listarClassificacaoGruFn } from "@/lib/classificacao.functions";
import { dataBR, erroMsg } from "@/lib/rotulos";
import type { LinhaGru, ResultadoLote } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { brl } from "@/components/juridico/AcoesJulgamento";
import { NaoPagoDialog, PagamentoDialog, RecursoDialog, type AlvoGru } from "@/components/juridico/ClassificacaoDialogs";
import { hojeISO } from "@/components/juridico/ResultadoDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/classificacao-gru")({
  head: () => ({ meta: [{ title: "Classificação das GRUs | SAPP" }, { name: "description", content: "Processos com GRU: pago, em recurso ou não pago (dívida ativa)." }] }),
  component: Classificacao,
});

type Acao = { tipo: "pagamento" | "recurso" | "naopago"; linha: LinhaGru; obrigatoria?: boolean };
const alvoDe = (l: LinhaGru): AlvoGru => ({ processoId: l.processo_id, numero: l.numero, valor: l.valor, valorComDesconto: l.valor_com_desconto });
export const diasAtraso = (venc: string) => Math.floor((Date.parse(hojeISO()) - Date.parse(venc)) / 86400000);

function Classificacao() {
  const { data: sessao } = useSessao();
  const habilitado = sessao?.tem("juridico", "gestao") ?? false;
  const { data: linhas = [], isLoading, error } = useQuery({ queryKey: ["classificacao-gru"], enabled: habilitado, queryFn: () => listarClassificacaoGruFn() });
  const [acao, setAcao] = useState<Acao | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState(false);
  if (!sessao) return null;
  if (!habilitado) return <SemPermissao />;
  const edita = sessao.tem("juridico");
  const por = (s: LinhaGru["situacao"]) => linhas.filter((l) => l.situacao === s);
  const aClassificar = por("gru_gerada");
  const vencidas = aClassificar.filter((l) => diasAtraso(l.vencimento) > 0);
  const marcados = aClassificar.filter((l) => sel.has(l.processo_id));
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <Cabecalho titulo="Classificação das GRUs" sub="Pago · Em recurso · Não pago (dívida ativa para recobrança)" />
      {error ? <p role="alert" className="text-destructive">Não foi possível carregar.</p> : isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Resumo titulo="A classificar" valor={aClassificar.length} sub={`${vencidas.length} vencida(s)`} />
            <Resumo titulo="Em recurso" valor={por("em_recurso").length} />
            <Resumo titulo="Pagos" valor={por("pago").length} />
            <Resumo titulo="Não pagos" valor={por("nao_pago").length} sub={<Link to="/divida-ativa" className="text-primary hover:underline">ver listagem</Link>} />
          </div>

          <section>
            <h2 className="mb-3 font-semibold">A classificar · GRU registrada ({aClassificar.length})</h2>
            {edita && marcados.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
                <span className="font-medium">{marcados.length} selecionado(s)</span>
                <Button onClick={() => setLote(true)}>Classificar como não pago</Button>
                <Button variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
              </div>
            )}
            <Tabela linhas={aClassificar} vazio="Nenhuma GRU aguardando classificação."
              selecao={edita ? { sel, alternar, todos: (m) => setSel(m ? new Set(aClassificar.map((l) => l.processo_id)) : new Set()) } : undefined}
              acoes={edita ? (l) => (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => setAcao({ tipo: "pagamento", linha: l })}>Pago</Button>
                  <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "recurso", linha: l })}>Recurso</Button>
                  <Button size="sm" variant="outline" disabled={diasAtraso(l.vencimento) <= 0} title={diasAtraso(l.vencimento) <= 0 ? `A GRU vence em ${dataBR(l.vencimento)}` : ""} onClick={() => setAcao({ tipo: "naopago", linha: l })}>Não pago</Button>
                </div>
              ) : undefined} />
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Em recurso · instância superior do Inmetro ({por("em_recurso").length})</h2>
            <Tabela linhas={por("em_recurso")} vazio="Nenhum processo em recurso." extra={(l) => `Recurso em ${dataBR(l.recurso_em)}`}
              acoes={edita ? (l) => (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" onClick={() => setAcao({ tipo: "pagamento", linha: l })}>Pago</Button>
                  <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "naopago", linha: l, obrigatoria: true })}>Não pago</Button>
                </div>
              ) : undefined} />
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Pagos ({por("pago").length})</h2>
            <Tabela linhas={por("pago")} vazio="Nenhum pagamento registrado." extra={(l) => `Pago em ${dataBR(l.pago_em)}: ${brl(l.valor_pago)}`} />
          </section>
        </div>
      )}
      {acao?.tipo === "pagamento" && <PagamentoDialog alvo={alvoDe(acao.linha)} fechar={() => setAcao(null)} />}
      {acao?.tipo === "recurso" && <RecursoDialog alvo={alvoDe(acao.linha)} fechar={() => setAcao(null)} />}
      {acao?.tipo === "naopago" && <NaoPagoDialog alvo={alvoDe(acao.linha)} obrigatoria={!!acao.obrigatoria} fechar={() => setAcao(null)} />}
      {lote && <LoteNaoPago linhas={marcados} fechar={() => { setLote(false); setSel(new Set()); }} />}
    </>
  );
}

function Resumo({ titulo, valor, sub }: { titulo: string; valor: number; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="text-2xl font-semibold">{valor}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Tabela({ linhas, vazio, acoes, extra, selecao }: {
  linhas: LinhaGru[]; vazio: string; acoes?: ((l: LinhaGru) => React.ReactNode) | undefined; extra?: ((l: LinhaGru) => string) | undefined;
  selecao?: { sel: Set<string>; alternar: (id: string) => void; todos: (marcar: boolean) => void } | undefined;
}) {
  if (!linhas.length) return <p className="border-t py-4 text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="tabela-rolavel rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            {selecao && <th className="w-10 p-3"><input type="checkbox" aria-label="Selecionar todos" checked={linhas.every((l) => selecao.sel.has(l.processo_id))} onChange={(e) => selecao.todos(e.target.checked)} /></th>}
            <th className="p-3">Processo</th><th className="p-3">Autuado</th><th className="p-3">GRU</th><th className="p-3">Vencimento</th><th className="p-3">Valor</th>{extra && <th className="p-3">Situação</th>}{acoes && <th className="p-3" />}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const atraso = diasAtraso(l.vencimento);
            return (
              <tr key={l.processo_id} className="border-t">
                {selecao && <td className="p-3"><input type="checkbox" aria-label={`Selecionar ${l.numero}`} checked={selecao.sel.has(l.processo_id)} onChange={() => selecao.alternar(l.processo_id)} /></td>}
                <td className="p-3"><Link to="/processos/$id" params={{ id: l.processo_id }} search={{ area: "juridico" }} className="num-processo whitespace-nowrap text-primary hover:underline">{l.numero}</Link></td>
                <td className="p-3">{l.proprietario ?? "—"}</td>
                <td className="p-3">{l.numero_gru}</td>
                <td className="whitespace-nowrap p-3">{dataBR(l.vencimento)} {l.situacao === "gru_gerada" && (atraso > 0 ? <Badge variant="destructive">vencida há {atraso} d</Badge> : <Badge variant="secondary">em dia</Badge>)}</td>
                <td className="whitespace-nowrap p-3">{brl(l.valor)}</td>
                {extra && <td className="p-3">{extra(l)}</td>}
                {acoes && <td className="p-3">{acoes(l)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LoteNaoPago({ linhas, fechar }: { linhas: LinhaGru[]; fechar: () => void }) {
  const qc = useQueryClient();
  const [obs, setObs] = useState("");
  const [res, setRes] = useState<ResultadoLote | null>(null);
  const executar = useMutation({
    mutationFn: () => classificarNaoPagoLoteFn({ data: { processoIds: linhas.map((l) => l.processo_id), obs } }),
    onSuccess: async (r) => { setRes(r); await qc.invalidateQueries(); if (!r.falhas.length) { toast.success(`${r.feitos} processo(s) classificado(s) como não pago`); fechar(); } },
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !executar.isPending && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Classificar {linhas.length} processo(s) como não pago</DialogTitle></DialogHeader>
        {res ? (
          <>
            <p className="text-sm">{res.feitos} classificado(s); {res.falhas.length} não pôde(ram) avançar:</p>
            <ul className="tabela-rolavel space-y-1 rounded border p-2 text-sm">{res.falhas.map((f) => <li key={f.numero}><span className="num-processo">{f.numero}</span> — {f.motivo}</li>)}</ul>
            <DialogFooter><Button onClick={fechar}>Fechar</Button></DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Só GRUs já vencidas e sem pagamento são classificadas; as demais são listadas no final. Os processos entram na listagem de dívida ativa para recobrança.</p>
            <ul className="tabela-rolavel max-h-48 space-y-0.5 rounded border p-2 text-sm">{linhas.map((l) => <li key={l.processo_id}><span className="num-processo">{l.numero}</span> · GRU {l.numero_gru} · {brl(l.valor)}</li>)}</ul>
            <Textarea rows={2} aria-label="Observação" placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" disabled={executar.isPending} onClick={fechar}>Cancelar</Button>
              <Button disabled={executar.isPending} onClick={() => executar.mutate()}>{executar.isPending ? "Processando…" : `Classificar ${linhas.length}`}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

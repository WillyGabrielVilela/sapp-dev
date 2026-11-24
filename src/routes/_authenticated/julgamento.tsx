import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Eye } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { listarProcessosFn } from "@/lib/processos.functions";
import { assinarLoteFn, homologarLoteFn, minhasEspeciesFn } from "@/lib/julgamento.functions";
import { dataBR, erroMsg, SITUACAO } from "@/lib/rotulos";
import type { Processo, ResultadoLote } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { DistribuicaoEspecies } from "@/components/juridico/DistribuicaoEspecies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/julgamento")({
  head: () => ({ meta: [{ title: "Julgamento, assinatura e homologação | SAPP" }, { name: "description", content: "Filas de julgamento por espécie, assinatura do Presidente e homologação." }] }),
  component: Julgamento,
});

function Julgamento() {
  const { data: sessao } = useSessao();
  const habilitado = sessao?.tem("advogado", "presidente", "homologador") ?? false;
  const { data: processos = [], isLoading, error } = useQuery({ queryKey: ["processos"], enabled: habilitado, queryFn: () => listarProcessosFn() });
  const { data: minhas = [] } = useQuery({ queryKey: ["minhas-especies"], enabled: sessao?.tem("advogado") ?? false, queryFn: () => minhasEspeciesFn() });
  if (!sessao) return null;
  if (!habilitado) return <SemPermissao />;
  const por = (...s: Processo["situacao"][]) => processos.filter((p) => s.includes(p.situacao));
  return (
    <>
      <Cabecalho titulo="Julgamento, assinatura e homologação" sub="Julgamento (advogado) → homologação → assinatura do Presidente → Ger. Jurídica (GRU)" />
      {error ? <p role="alert" className="text-destructive">Não foi possível carregar os processos.</p> : isLoading ? <p className="text-muted-foreground">Carregando processos…</p> : (
        <div className="space-y-8">
          {sessao.tem("advogado") && minhas.length > 0 && (() => {
            const fora = por("com_defesa", "sem_defesa", "julgamento_devolvido").filter((p) => !p.especie || !minhas.includes(p.especie));
            return fora.length > 0 ? (
              <p className="rounded border bg-warning px-3 py-2 text-sm text-warning-foreground">
                Você só está designado para as espécies {minhas.join(", ")}. Há {fora.length} processo(s) aguardando julgamento de outras espécies
                ({[...new Set(fora.map((p) => p.especie ?? "sem espécie"))].join(", ")}). Peça a um homologador para liberar.
              </p>
            ) : null;
          })()}
          {sessao.tem("advogado") && (
            <Tabela titulo={`A julgar · ${minhas.length ? `espécies ${minhas.join(", ")}` : "todas as espécies"}`} itens={por("com_defesa", "sem_defesa", "julgamento_devolvido").filter((p) => p.especie && (!minhas.length || minhas.includes(p.especie)))} botao="Julgar" />
          )}
          {sessao.tem("homologador") && <Tabela titulo="Aguardando homologação" itens={por("julgado")} botao="Homologar" lote={{ rotulo: "Homologar", acao: (processoIds, obs) => homologarLoteFn({ data: { processoIds, obs } }) }} />}
          {sessao.tem("presidente") && <Tabela titulo="Aguardando assinatura do Presidente" itens={por("homologado")} botao="Assinar" lote={{ rotulo: "Assinar", acao: (processoIds, obs) => assinarLoteFn({ data: { processoIds, obs } }) }} />}
          {sessao.tem("homologador") && <DistribuicaoEspecies />}
          <Tabela titulo="Assinados · com a Ger. Jurídica para gerar a GRU" itens={por("assinado_presidente")} botao="Abrir" />
        </div>
      )}
    </>
  );
}

type Lote = { rotulo: string; acao: (ids: string[], obs: string) => Promise<ResultadoLote> };

function Tabela({ titulo, itens, botao, lote }: { titulo: string; itens: Processo[]; botao: string; lote?: Lote }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState(false);
  const marcados = itens.filter((p) => sel.has(p.id));
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <section>
      <h2 className="mb-3 font-semibold">{titulo} ({itens.length})</h2>
      {lote && marcados.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
          <span className="font-medium">{marcados.length} selecionado(s)</span>
          <Button onClick={() => setAberto(true)}><CheckCheck /> {lote.rotulo} selecionados</Button>
          <Button variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
        </div>
      )}
      {!itens.length ? <p className="border-t py-4 text-sm text-muted-foreground">Nenhum processo nesta fila.</p> : (
        <div className="tabela-rolavel rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {lote && <th className="w-10 p-3"><input type="checkbox" aria-label="Selecionar todos" checked={marcados.length === itens.length} onChange={(e) => setSel(e.target.checked ? new Set(itens.map((p) => p.id)) : new Set())} /></th>}
                <th className="p-3">Processo</th><th className="p-3">Espécie</th><th className="p-3">Autuado</th><th className="p-3">Situação</th><th className="p-3">Atualizado</th><th className="p-3" />
              </tr>
            </thead>
            <tbody>{itens.map((p) => (
              <tr key={p.id} className="border-t">
                {lote && <td className="p-3"><input type="checkbox" aria-label={`Selecionar ${p.numero}`} checked={sel.has(p.id)} onChange={() => alternar(p.id)} /></td>}
                <td className="p-3"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }} className="num-processo whitespace-nowrap text-primary hover:underline">{p.numero}</Link></td>
                <td className="p-3">{p.especie ?? "—"}</td><td className="p-3">{p.proprietario ?? "—"}</td>
                <td className="p-3"><Badge variant="secondary">{SITUACAO[p.situacao]}</Badge></td>
                <td className="p-3">{dataBR(p.updated_at, true)}</td>
                <td className="p-3"><Button asChild size="sm" variant="outline"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }}><Eye />{botao}</Link></Button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {lote && aberto && <LoteDialog lote={lote} processos={marcados} fechar={() => { setAberto(false); setSel(new Set()); }} />}
    </section>
  );
}

function LoteDialog({ lote, processos, fechar }: { lote: Lote; processos: Processo[]; fechar: () => void }) {
  const qc = useQueryClient();
  const [obs, setObs] = useState("");
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const executar = useMutation({
    mutationFn: () => lote.acao(processos.map((p) => p.id), obs),
    onSuccess: async (r) => {
      setResultado(r);
      await qc.invalidateQueries();
      if (!r.falhas.length) { toast.success(`${r.feitos} processo(s) concluído(s)`); fechar(); }
    },
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !executar.isPending && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{lote.rotulo} {processos.length} processo(s)</DialogTitle></DialogHeader>
        {resultado ? (
          <>
            <p className="text-sm">{resultado.feitos} concluído(s); {resultado.falhas.length} não pôde(ram) avançar:</p>
            <ul className="tabela-rolavel space-y-1 rounded border p-2 text-sm">
              {resultado.falhas.map((f) => <li key={f.numero}><span className="num-processo">{f.numero}</span> — {f.motivo}</li>)}
            </ul>
            <DialogFooter><Button onClick={fechar}>Fechar</Button></DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Cada processo é conferido individualmente; os que não puderem avançar são listados no final.</p>
            <ul className="tabela-rolavel max-h-48 space-y-0.5 rounded border p-2 text-sm">
              {processos.map((p) => <li key={p.id}><span className="num-processo">{p.numero}</span> · {p.especie ?? "—"} · {p.proprietario ?? "—"}</li>)}
            </ul>
            <label htmlFor="obs-lote" className="text-sm font-medium">Observação (opcional, aplicada a todos)</label>
            <Textarea id="obs-lote" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" disabled={executar.isPending} onClick={fechar}>Cancelar</Button>
              <Button disabled={executar.isPending} onClick={() => executar.mutate()}>{executar.isPending ? "Processando…" : `${lote.rotulo} ${processos.length}`}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

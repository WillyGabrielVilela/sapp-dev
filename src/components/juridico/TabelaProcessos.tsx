import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Eye } from "lucide-react";
import { BotaoCsv } from "@/components/BotaoCsv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COLUNAS_PROCESSO } from "@/lib/csv-colunas";
import { dataBR, erroMsg, SITUACAO } from "@/lib/rotulos";
import type { Processo, ResultadoLote } from "@/lib/tipos";
import { hojeISO } from "./ResultadoDialog";

export type Lote = {
  rotulo: string;
  /** Se informado, o lote pede uma data (ex.: data em que o Presidente assinou). */
  comData?: { rotulo: string };
  acao: (ids: string[], obs: string, data?: string) => Promise<ResultadoLote>;
};

/** Fila de processos de uma etapa: busca de resultado já aplicada por quem chama, CSV, checkboxes e ação em lote. */
export function TabelaProcessos({ titulo, itens, botao, csv, lote, area = "juridico" }: {
  titulo: string; itens: Processo[]; botao: string; csv: string; lote?: Lote; area?: "cpma" | "juridico";
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState(false);
  const marcados = itens.filter((p) => sel.has(p.id));
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{titulo} ({itens.length})</h2>
        <BotaoCsv nome={csv} colunas={COLUNAS_PROCESSO} linhas={itens} />
      </div>
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
                <td className="p-3"><Link to="/processos/$id" params={{ id: p.id }} search={{ area }} className="num-processo whitespace-nowrap text-primary hover:underline">{p.numero}</Link></td>
                <td className="p-3">{p.especie ?? "—"}</td><td className="p-3">{p.proprietario ?? "—"}</td>
                <td className="p-3"><Badge variant="secondary">{SITUACAO[p.situacao]}</Badge></td>
                <td className="p-3">{dataBR(p.updated_at, true)}</td>
                <td className="p-3"><Button asChild size="sm" variant="outline"><Link to="/processos/$id" params={{ id: p.id }} search={{ area }}><Eye />{botao}</Link></Button></td>
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
  const [data, setData] = useState(hojeISO());
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const executar = useMutation({
    mutationFn: () => lote.acao(processos.map((p) => p.id), obs, lote.comData ? data : undefined),
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
            {lote.comData && (
              <>
                <label htmlFor="data-lote" className="text-sm font-medium">{lote.comData.rotulo}</label>
                <Input id="data-lote" type="date" max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
              </>
            )}
            <label htmlFor="obs-lote" className="text-sm font-medium">Observação (opcional, aplicada a todos)</label>
            <Textarea id="obs-lote" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" disabled={executar.isPending} onClick={fechar}>Cancelar</Button>
              <Button disabled={executar.isPending || (!!lote.comData && !data)} onClick={() => executar.mutate()}>{executar.isPending ? "Processando…" : `${lote.rotulo} ${processos.length}`}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

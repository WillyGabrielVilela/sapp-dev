import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { classificarNaoPagoFn, registrarPagamentoFn, registrarRecursoFn } from "@/lib/classificacao.functions";
import { registrarGruFn } from "@/lib/juridico.functions";
import type { Julgamento, Processo } from "@/lib/tipos";
import { erroMsg } from "@/lib/rotulos";
import { brl } from "./AcoesJulgamento";
import { hojeISO } from "./ResultadoDialog";

export type AlvoGru = { processoId: string; numero: string; valor: string | null; valorComDesconto: string | null };

function useFeito(fechar: () => void) {
  const qc = useQueryClient();
  return async (msg: string) => {
    toast.success(msg);
    fechar();
    await qc.invalidateQueries();
  };
}

export function PagamentoDialog({ alvo, fechar }: { alvo: AlvoGru; fechar: () => void }) {
  const feito = useFeito(fechar);
  const [data, setData] = useState(hojeISO());
  const [comDesc, setComDesc] = useState(false);
  const [valor, setValor] = useState(alvo.valor ? String(Number(alvo.valor)).replace(".", ",") : "");
  const [obs, setObs] = useState("");
  const num = Number(valor.replace(/\./g, "").replace(",", "."));
  const escolher = (desc: boolean) => {
    setComDesc(desc);
    const base = desc ? alvo.valorComDesconto : alvo.valor;
    if (base) setValor(String(Number(base)).replace(".", ","));
  };
  const salvar = useMutation({
    mutationFn: () => registrarPagamentoFn({ data: { processoId: alvo.processoId, data, valor: num, comDesconto: comDesc, obs } }),
    onSuccess: () => feito("Pagamento registrado"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar pagamento da GRU</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground"><span className="num-processo">{alvo.numero}</span> · multa {brl(alvo.valor)} · à vista {brl(alvo.valorComDesconto)}</p>
        <Label htmlFor="pg-data">Data do pagamento</Label>
        <Input id="pg-data" type="date" max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={comDesc} onChange={(e) => escolher(e.target.checked)} /> Pago à vista com desconto
        </label>
        <Label htmlFor="pg-valor">Valor pago (R$)</Label>
        <Input id="pg-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        <Label htmlFor="pg-obs">Observação (opcional)</Label>
        <Textarea id="pg-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !data || !(num > 0)} onClick={() => salvar.mutate()}>Registrar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecursoDialog({ alvo, fechar }: { alvo: AlvoGru; fechar: () => void }) {
  const feito = useFeito(fechar);
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const salvar = useMutation({
    mutationFn: () => registrarRecursoFn({ data: { processoId: alvo.processoId, data, obs } }),
    onSuccess: () => feito("Recurso registrado"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar recurso</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground"><span className="num-processo">{alvo.numero}</span> · julgado pela instância superior do Inmetro</p>
        <Label htmlFor="rc-data">Data do recurso</Label>
        <Input id="rc-data" type="date" max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
        <Label htmlFor="rc-obs">Observação (opcional)</Label>
        <Textarea id="rc-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !data} onClick={() => salvar.mutate()}>Registrar recurso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NaoPagoDialog({ alvo, obrigatoria, fechar }: { alvo: AlvoGru; obrigatoria: boolean; fechar: () => void }) {
  const feito = useFeito(fechar);
  const [obs, setObs] = useState("");
  const salvar = useMutation({
    mutationFn: () => classificarNaoPagoFn({ data: { processoId: alvo.processoId, obs } }),
    onSuccess: () => feito("Classificado como não pago — entrou na listagem de dívida ativa"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Classificar como não pago</DialogTitle></DialogHeader>
        <p className="text-sm">O processo <span className="num-processo">{alvo.numero}</span> entra na listagem de dívida ativa para recobrança.</p>
        <Label htmlFor="np-obs">{obrigatoria ? "Resultado do recurso (obrigatório)" : "Observação (opcional)"}</Label>
        <Textarea id="np-obs" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || (obrigatoria && obs.trim().length < 5)} onClick={() => salvar.mutate()}>Classificar como não pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GruDialog({ p, julgamento, fechar }: { p: Processo; julgamento: Julgamento | null; fechar: () => void }) {
  const feito = useFeito(fechar);
  const [numero, setNumero] = useState("");
  const [venc, setVenc] = useState("");
  const [obs, setObs] = useState("");
  const salvar = useMutation({
    mutationFn: () => registrarGruFn({ data: { processoId: p.id, numeroGru: numero, vencimento: venc, obs } }),
    onSuccess: () => feito("GRU registrada"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar GRU</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          <span className="num-processo">{p.numero}</span> · {p.proprietario ?? "—"} · multa de <strong>{brl(julgamento?.valor_multa ?? null)}</strong>
        </p>
        <p className="text-xs text-muted-foreground">Emita a guia oficial e registre aqui os dados dela. O valor com desconto à vista é calculado pelo sistema e consta no espelho da GRU.</p>
        <Label htmlFor="gru-num">Número da GRU</Label>
        <Input id="gru-num" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <Label htmlFor="gru-venc">Vencimento</Label>
        <Input id="gru-venc" type="date" min={hojeISO()} value={venc} onChange={(e) => setVenc(e.target.value)} />
        <Label htmlFor="gru-obs">Observação (opcional)</Label>
        <Textarea id="gru-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || numero.trim().length < 3 || !venc} onClick={() => salvar.mutate()}>Registrar GRU</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

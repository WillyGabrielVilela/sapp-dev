import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { anteciparPrazoFn, atualizarDadosFn, encerrarPrazoFn, modoTesteFn, protocolarFn, registrarDefesaFn } from "@/lib/juridico.functions";
import { documentoValido, normalizarDocumento } from "@/lib/documento";
import { dataBR, erroMsg } from "@/lib/rotulos";
import type { Notificacao, Processo } from "@/lib/tipos";
import { hojeISO, ResultadoDialog } from "./ResultadoDialog";

type Dialogo = null | "protocolar" | "dados" | "defesa" | "semdefesa" | "resultado";

/** Providências do Jurídico (fase 1) para o processo aberto: protocolo → notificação → ciência → defesa. */
export function AcoesJuridico({ p, notificacoes }: { p: Processo; notificacoes: Notificacao[] }) {
  const qc = useQueryClient();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const pendente = notificacoes.find((n) => n.resultado === "pendente");
  const fechar = () => setDialogo(null);
  const depoisDe = async (msg: string) => {
    toast.success(msg);
    fechar();
    await qc.invalidateQueries();
  };
  const { data: modoTeste } = useQuery({ queryKey: ["modo-teste"], queryFn: () => modoTesteFn() });
  const anteciparPrazo = useMutation({
    mutationFn: () => anteciparPrazoFn({ data: { processoId: p.id } }),
    onSuccess: () => depoisDe("Teste: datas recuadas em 15 dias"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  const podeEditarDados = ["protocolado_juridico", "notificacao_frustrada", "notificacao_enviada", "aguardando_defesa"].includes(p.situacao);

  return (
    <>
      {p.situacao === "recebido_juridico" && <Button onClick={() => setDialogo("protocolar")}>Protocolar</Button>}
      {(p.situacao === "protocolado_juridico" || p.situacao === "notificacao_frustrada") && (
        <Button asChild><Link to="/juridico">Incluir em lista de saída</Link></Button>
      )}
      {p.situacao === "notificacao_enviada" && pendente && <Button onClick={() => setDialogo("resultado")}>Registrar entrega</Button>}
      {p.situacao === "aguardando_defesa" && <Button variant="outline" onClick={() => setDialogo("semdefesa")}>Registrar sem defesa</Button>}
      {(p.situacao === "aguardando_defesa" || p.situacao === "sem_defesa") && (
        <Button variant={p.situacao === "sem_defesa" ? "outline" : "default"} onClick={() => setDialogo("defesa")}>
          {p.situacao === "sem_defesa" ? "Registrar defesa recebida" : "Registrar defesa"}
        </Button>
      )}
      {modoTeste && p.situacao === "aguardando_defesa" && (
        <Button variant="outline" className="border-dashed border-warning-foreground text-warning-foreground" disabled={anteciparPrazo.isPending} onClick={() => anteciparPrazo.mutate()}>
          🧪 Teste: vencer o prazo (−15 dias)
        </Button>
      )}
      {podeEditarDados && <Button variant="ghost" onClick={() => setDialogo("dados")}>Editar dados de notificação</Button>}

      {dialogo === "protocolar" && <DadosDialog titulo="Protocolar processo" p={p} protocolo fechar={fechar} depois={depoisDe} />}
      {dialogo === "dados" && <DadosDialog titulo="Dados de notificação" p={p} fechar={fechar} depois={depoisDe} />}
      {dialogo === "resultado" && pendente && (
        <ResultadoDialog notificacaoId={pendente.id} canal={pendente.canal} titulo={p.numero} dataSaida={pendente.data_saida} fechar={fechar} />
      )}
      {dialogo === "semdefesa" && <SemDefesaDialog p={p} fechar={fechar} depois={depoisDe} />}
      {dialogo === "defesa" && <DefesaDialog p={p} fechar={fechar} depois={depoisDe} />}
    </>
  );
}

function DadosDialog({ titulo, p, protocolo, fechar, depois }: { titulo: string; p: Processo; protocolo?: boolean; fechar: () => void; depois: (m: string) => Promise<void> }) {
  const [v, setV] = useState({
    numeroAi: p.numero_ai ?? "", documento: p.documento_autuado ?? "", nomeFantasia: p.nome_fantasia ?? "", bairro: p.bairro ?? "", obs: "",
  });
  const docOk = documentoValido(v.documento);
  const aiOk = v.numeroAi === "" || /^\d{7}$/.test(v.numeroAi.trim());
  const salvar = useMutation({
    mutationFn: async () => {
      const dados = { processoId: p.id, numeroAi: v.numeroAi.trim(), documento: normalizarDocumento(v.documento), nomeFantasia: v.nomeFantasia, bairro: v.bairro };
      if (protocolo) return protocolarFn({ data: { ...dados, obs: v.obs } });
      await atualizarDadosFn({ data: dados });
      return null;
    },
    onSuccess: (prot) => depois(prot ? `Protocolo ${prot}` : "Dados atualizados"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Processo <span className="num-processo">{p.numero}</span> · Autuado (razão social): <strong>{p.proprietario ?? "—"}</strong>
        </p>
        <Label htmlFor="ai">Nº do auto de infração (AI) — 7 dígitos</Label>
        <Input id="ai" inputMode="numeric" maxLength={7} value={v.numeroAi} onChange={(e) => setV({ ...v, numeroAi: e.target.value.replace(/\D/g, "") })} aria-invalid={!aiOk} />
        {v.numeroAi === "" && <p className="text-xs text-warning-foreground">Sem o AI, a lista de saída sai sem esse número (o relatório 002/RC pede os dois).</p>}
        <Label htmlFor="doc">CPF/CNPJ do autuado</Label>
        <Input id="doc" value={v.documento} onChange={(e) => setV({ ...v, documento: e.target.value })} aria-invalid={!docOk} />
        {!docOk && <p className="text-xs text-destructive">CPF/CNPJ inválido.</p>}
        <Label htmlFor="fantasia">Nome fantasia (nome da fachada)</Label>
        <Input id="fantasia" value={v.nomeFantasia} onChange={(e) => setV({ ...v, nomeFantasia: e.target.value })} />
        <Label htmlFor="bairro">Bairro</Label>
        <Input id="bairro" value={v.bairro} onChange={(e) => setV({ ...v, bairro: e.target.value })} />
        {protocolo && (
          <>
            <Label htmlFor="obs-prot">Observação (opcional)</Label>
            <Textarea id="obs-prot" rows={2} value={v.obs} onChange={(e) => setV({ ...v, obs: e.target.value })} />
          </>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !docOk || !aiOk} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : protocolo ? "Protocolar (gera nº de protocolo)" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefesaDialog({ p, fechar, depois }: { p: Processo; fechar: () => void; depois: (m: string) => Promise<void> }) {
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const salvar = useMutation({
    mutationFn: () => registrarDefesaFn({ data: { processoId: p.id, data, obs } }),
    onSuccess: () => depois("Defesa registrada"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  const fora = !!p.vencimento_defesa && data > p.vencimento_defesa;
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar defesa</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Ciência em {dataBR(p.ciencia_em)} · prazo até {dataBR(p.vencimento_defesa)}</p>
        <Label htmlFor="data-defesa">Data de protocolo da defesa</Label>
        <Input id="data-defesa" type="date" min={p.ciencia_em ?? undefined} max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
        {fora && <p className="rounded bg-warning px-2 py-1.5 text-xs text-warning-foreground">Esta data é posterior ao prazo. O registro ficará marcado como fora do prazo; a decisão é do julgamento.</p>}
        <Label htmlFor="obs-defesa">Observação (opcional)</Label>
        <Textarea id="obs-defesa" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !data} onClick={() => salvar.mutate()}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SemDefesaDialog({ p, fechar, depois }: { p: Processo; fechar: () => void; depois: (m: string) => Promise<void> }) {
  const [obs, setObs] = useState("");
  const antes = !!p.vencimento_defesa && hojeISO() <= p.vencimento_defesa;
  const salvar = useMutation({
    mutationFn: () => encerrarPrazoFn({ data: { processoId: p.id, obs } }),
    onSuccess: () => depois("Registrado sem defesa — segue para julgamento"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar sem defesa</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Ciência em {dataBR(p.ciencia_em)} · prazo até {dataBR(p.vencimento_defesa)}</p>
        {antes ? (
          <p className="rounded bg-warning px-2 py-1.5 text-xs text-warning-foreground">
            O prazo ainda não venceu. Registrar agora exige o motivo (por exemplo, renúncia expressa ao prazo) e fica no histórico.
          </p>
        ) : (
          <p className="text-sm">O prazo venceu sem defesa. Confirme para seguir ao julgamento.</p>
        )}
        <Label htmlFor="obs-sd">{antes ? "Motivo (obrigatório)" : "Observação (opcional)"}</Label>
        <Textarea id="obs-sd" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || (antes && obs.trim().length < 10)} onClick={() => salvar.mutate()}>Registrar sem defesa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

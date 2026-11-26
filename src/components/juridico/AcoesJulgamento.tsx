import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assinarFn, devolverJulgamentoFn, homologarFn, julgarFn, minhasEspeciesFn } from "@/lib/julgamento.functions";
import { anteciparGruFn, modoTesteFn } from "@/lib/juridico.functions";
import { dataBR, erroMsg } from "@/lib/rotulos";
import type { Gru, Julgamento, Papel, Processo } from "@/lib/tipos";
import { GruDialog, NaoPagoDialog, PagamentoDialog, RecursoDialog, type AlvoGru } from "./ClassificacaoDialogs";
import { hojeISO } from "./ResultadoDialog";

type Dialogo = null | "julgar" | "assinar" | "homologar" | "devolver" | "gru" | "pagamento" | "recurso" | "naopago";

export const brl = (v: string | number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Providências depois da defesa. Cada botão só aparece para quem pode:
 *  - advogado: julgar, registrar a GRU e classificar (pago / recurso / não pago);
 *  - homologador: homologar e registrar a assinatura do Presidente (que não usa o sistema).
 */
export function AcoesJulgamento({ p, julgamento, gru, papeis }: { p: Processo; julgamento: Julgamento | null; gru: Gru | null; papeis: Papel[] }) {
  const qc = useQueryClient();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const tem = (r: Papel) => papeis.includes(r);
  const { data: minhas = [] } = useQuery({ queryKey: ["minhas-especies"], enabled: tem("advogado"), queryFn: () => minhasEspeciesFn() });
  const { data: modoTeste } = useQuery({ queryKey: ["modo-teste"], enabled: tem("advogado"), queryFn: () => modoTesteFn() });
  const fechar = () => setDialogo(null);
  const feito = async (m: string) => {
    toast.success(m);
    fechar();
    await qc.invalidateQueries();
  };
  const anteciparGru = useMutation({
    mutationFn: () => anteciparGruFn({ data: { processoId: p.id } }),
    onSuccess: () => feito("Teste: vencimento da GRU recuado em 15 dias"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  const alvo: AlvoGru = { processoId: p.id, numero: p.numero, valor: gru?.valor ?? null, valorComDesconto: gru?.valor_com_desconto ?? null };

  const aJulgar = ["com_defesa", "sem_defesa", "julgamento_devolvido"].includes(p.situacao);
  const podeJulgar = tem("advogado") && aJulgar && !!p.especie && (minhas.length === 0 || minhas.includes(p.especie));
  const semDesignacao = tem("advogado") && aJulgar && !podeJulgar;
  const podeHomologar = tem("homologador") && p.situacao === "julgado";
  const podeAssinar = tem("homologador") && p.situacao === "homologado";
  const podeDevolver = podeHomologar || podeAssinar;
  const advogadoGru = tem("advogado") && !!gru;

  const mostra = podeJulgar || semDesignacao || podeDevolver || podeHomologar || podeAssinar
    || (tem("advogado") && ["assinado_presidente", "gru_gerada", "em_recurso", "nao_pago", "pago"].includes(p.situacao));
  if (!mostra) return null;
  return (
    <>
      {podeJulgar && <Button onClick={() => setDialogo("julgar")}>{p.situacao === "julgamento_devolvido" ? "Rejulgar" : "Julgar"}</Button>}
      {semDesignacao && (
        <span className="self-center text-sm text-muted-foreground">
          {p.especie
            ? `Você só julga as espécies ${minhas.join(", ")}; este processo é da espécie ${p.especie}. Um homologador pode liberar ("Quem julga cada espécie").`
            : "Processo sem espécie."}
        </span>
      )}
      {podeHomologar && <Button onClick={() => setDialogo("homologar")}>Homologar</Button>}
      {podeAssinar && <Button onClick={() => setDialogo("assinar")}>Registrar assinatura do Presidente</Button>}
      {podeDevolver && <Button variant="outline" onClick={() => setDialogo("devolver")}>Devolver ao julgamento</Button>}

      {tem("advogado") && p.situacao === "assinado_presidente" && <Button onClick={() => setDialogo("gru")}>Registrar GRU</Button>}
      {advogadoGru && ["gru_gerada", "em_recurso", "nao_pago", "pago"].includes(p.situacao) && (
        <Button asChild variant="outline"><Link to="/espelho-gru/$processoId" params={{ processoId: p.id }}>Ver espelho da GRU</Link></Button>
      )}
      {tem("advogado") && ["gru_gerada", "em_recurso", "nao_pago"].includes(p.situacao) && <Button onClick={() => setDialogo("pagamento")}>Registrar pagamento</Button>}
      {tem("advogado") && p.situacao === "gru_gerada" && <Button variant="outline" onClick={() => setDialogo("recurso")}>Registrar recurso</Button>}
      {tem("advogado") && (p.situacao === "gru_gerada" || p.situacao === "em_recurso") && <Button variant="outline" onClick={() => setDialogo("naopago")}>Classificar como não pago</Button>}
      {modoTeste && tem("advogado") && p.situacao === "gru_gerada" && (
        <Button variant="outline" className="border-dashed border-warning-foreground text-warning-foreground" disabled={anteciparGru.isPending} onClick={() => anteciparGru.mutate()}>
          🧪 Teste: vencer a GRU (−15 dias)
        </Button>
      )}

      {dialogo === "julgar" && <JulgarDialog p={p} julgamento={julgamento} fechar={fechar} depois={feito} />}
      {dialogo === "homologar" && (
        <ObsDialog titulo="Homologar" texto={`Confirma a homologação da decisão: ${resumo(julgamento)}?`} rotulo="Homologar" obrigatoria={false}
          acao={(obs) => homologarFn({ data: { processoId: p.id, obs } })} fechar={fechar} depois={() => feito("Processo homologado")} />
      )}
      {dialogo === "assinar" && <AssinarDialog p={p} julgamento={julgamento} fechar={fechar} depois={() => feito("Assinatura do Presidente registrada")} />}
      {dialogo === "devolver" && (
        <ObsDialog titulo="Devolver ao julgamento" texto="O processo volta ao advogado para novo julgamento. Informe o motivo." rotulo="Devolver" obrigatoria
          acao={(obs) => devolverJulgamentoFn({ data: { processoId: p.id, obs } })} fechar={fechar} depois={() => feito("Devolvido ao julgamento")} />
      )}
      {dialogo === "gru" && <GruDialog p={p} julgamento={julgamento} fechar={fechar} />}
      {dialogo === "pagamento" && <PagamentoDialog alvo={alvo} fechar={fechar} />}
      {dialogo === "recurso" && <RecursoDialog alvo={alvo} fechar={fechar} />}
      {dialogo === "naopago" && <NaoPagoDialog alvo={alvo} obrigatoria={p.situacao === "em_recurso"} fechar={fechar} />}
    </>
  );
}

function resumo(j: Julgamento | null) {
  if (!j) return "—";
  return j.decisao === "multa" ? `multa de ${brl(j.valor_multa)}` : "arquivamento";
}

function JulgarDialog({ p, julgamento, fechar, depois }: { p: Processo; julgamento: Julgamento | null; fechar: () => void; depois: (m: string) => Promise<void> }) {
  const [decisao, setDecisao] = useState<"multa" | "arquivamento">(julgamento?.decisao ?? "multa");
  const [valor, setValor] = useState(julgamento?.valor_multa ? String(Number(julgamento.valor_multa)).replace(".", ",") : "");
  const [fund, setFund] = useState(julgamento?.fundamentacao ?? "");
  const num = Number(valor.replace(/\./g, "").replace(",", "."));
  const valorOk = decisao === "arquivamento" || (Number.isFinite(num) && num > 0);
  const salvar = useMutation({
    mutationFn: () => julgarFn({ data: { processoId: p.id, decisao, valor: decisao === "multa" ? num : null, fundamentacao: fund } }),
    onSuccess: () => depois("Julgamento registrado — segue para a homologação"),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Julgar processo</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          <span className="num-processo">{p.numero}</span> · espécie {p.especie} · {p.proprietario ?? "—"} · {p.situacao === "com_defesa" ? "com defesa" : p.situacao === "sem_defesa" ? "sem defesa" : "devolvido ao julgamento"}
        </p>
        <Label htmlFor="decisao">Decisão</Label>
        <select id="decisao" className="h-9 rounded border bg-background px-2 text-sm" value={decisao} onChange={(e) => setDecisao(e.target.value as "multa" | "arquivamento")}>
          <option value="multa">Aplicar multa</option>
          <option value="arquivamento">Arquivamento</option>
        </select>
        {decisao === "multa" && (
          <>
            <Label htmlFor="valor">Valor da multa (R$)</Label>
            <Input id="valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={!valorOk} />
            {valorOk && num > 0 && <p className="text-xs text-muted-foreground">{brl(num)} · com 30% de desconto à vista: {brl(num * 0.7)} (o desconto vigente é o do parâmetro da GRU)</p>}
          </>
        )}
        <Label htmlFor="fund">Fundamentação</Label>
        <Textarea id="fund" rows={5} value={fund} onChange={(e) => setFund(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !valorOk || fund.trim().length < 10} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : "Registrar julgamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O Presidente não usa o sistema: o homologador registra que ele assinou, com a data da assinatura. */
function AssinarDialog({ p, julgamento, fechar, depois }: { p: Processo; julgamento: Julgamento | null; fechar: () => void; depois: () => Promise<void> }) {
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const minimo = julgamento?.homologado_em ? new Date(julgamento.homologado_em).toLocaleDateString("sv-SE", { timeZone: "America/Recife" }) : undefined;
  const salvar = useMutation({
    mutationFn: () => assinarFn({ data: { processoId: p.id, obs, data } }),
    onSuccess: depois,
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar assinatura do Presidente</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          <span className="num-processo">{p.numero}</span> · decisão: {resumo(julgamento)}
        </p>
        <p className="text-xs text-muted-foreground">O Presidente assina fora do sistema; você registra aqui que ele assinou.</p>
        <Label htmlFor="data-ass">Data em que o Presidente assinou</Label>
        <Input id="data-ass" type="date" {...(minimo ? { min: minimo } : {})} max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
        {minimo && <p className="text-xs text-muted-foreground">Homologado em {dataBR(minimo)}; a assinatura não pode ser anterior.</p>}
        <Label htmlFor="obs-ass">Observação (opcional)</Label>
        <Textarea id="obs-ass" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !data} onClick={() => salvar.mutate()}>Registrar assinatura</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObsDialog({ titulo, texto, rotulo, obrigatoria, acao, fechar, depois }: {
  titulo: string; texto: string; rotulo: string; obrigatoria: boolean;
  acao: (obs: string) => Promise<unknown>; fechar: () => void; depois: () => Promise<void>;
}) {
  const [obs, setObs] = useState("");
  const enviar = useMutation({ mutationFn: () => acao(obs), onSuccess: depois, onError: (e) => toast.error(erroMsg(e)) });
  return (
    <Dialog open onOpenChange={(o) => !o && !enviar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <p className="text-sm">{texto}</p>
        <Label htmlFor="obs-j">{obrigatoria ? "Motivo" : "Observação (opcional)"}</Label>
        <Textarea id="obs-j" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={enviar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={enviar.isPending || (obrigatoria && obs.trim().length < 5)} onClick={() => enviar.mutate()}>{rotulo}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

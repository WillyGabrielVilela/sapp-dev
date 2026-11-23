import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assinarFn, devolverJulgamentoFn, homologarFn, julgarFn, minhasEspeciesFn } from "@/lib/julgamento.functions";
import { erroMsg } from "@/lib/rotulos";
import type { Julgamento, Papel, Processo } from "@/lib/tipos";

type Dialogo = null | "julgar" | "assinar" | "homologar" | "devolver";

export const brl = (v: string | number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Julgamento (advogado da espécie) → assinatura (Presidente) → homologação. Cada botão só aparece para quem pode. */
export function AcoesJulgamento({ p, julgamento, papeis }: { p: Processo; julgamento: Julgamento | null; papeis: Papel[] }) {
  const qc = useQueryClient();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const tem = (r: Papel) => papeis.includes(r);
  const { data: minhas = [] } = useQuery({ queryKey: ["minhas-especies"], enabled: tem("juridico"), queryFn: () => minhasEspeciesFn() });
  const fechar = () => setDialogo(null);
  const feito = async (m: string) => {
    toast.success(m);
    fechar();
    await qc.invalidateQueries();
  };

  const aJulgar = ["com_defesa", "sem_defesa", "julgamento_devolvido"].includes(p.situacao);
  const podeJulgar = tem("juridico") && aJulgar && !!p.especie && minhas.includes(p.especie);
  const podeAssinar = tem("presidente") && p.situacao === "julgado";
  const podeHomologar = tem("homologador") && p.situacao === "assinado_presidente";
  const podeDevolver = podeAssinar || podeHomologar;
  const semDesignacao = tem("juridico") && aJulgar && !podeJulgar;

  if (!podeJulgar && !podeDevolver && !podeHomologar && !semDesignacao) return null;
  return (
    <>
      {podeJulgar && <Button onClick={() => setDialogo("julgar")}>{p.situacao === "julgamento_devolvido" ? "Rejulgar" : "Julgar"}</Button>}
      {semDesignacao && (
        <span className="self-center text-sm text-muted-foreground">
          {p.especie ? `Você não está designado para a espécie ${p.especie}.` : "Processo sem espécie."}
        </span>
      )}
      {podeAssinar && <Button onClick={() => setDialogo("assinar")}>Assinar (Presidente)</Button>}
      {podeHomologar && <Button onClick={() => setDialogo("homologar")}>Homologar</Button>}
      {podeDevolver && <Button variant="outline" onClick={() => setDialogo("devolver")}>Devolver ao julgamento</Button>}

      {dialogo === "julgar" && <JulgarDialog p={p} julgamento={julgamento} fechar={fechar} depois={feito} />}
      {dialogo === "assinar" && (
        <ObsDialog titulo="Assinar como Presidente" texto={`Confirma a assinatura da decisão: ${resumo(julgamento)}?`} rotulo="Assinar" obrigatoria={false}
          acao={(obs) => assinarFn({ data: { processoId: p.id, obs } })} fechar={fechar} depois={() => feito("Decisão assinada")} />
      )}
      {dialogo === "homologar" && (
        <ObsDialog titulo="Homologar" texto={`Confirma a homologação da decisão: ${resumo(julgamento)}?`} rotulo="Homologar" obrigatoria={false}
          acao={(obs) => homologarFn({ data: { processoId: p.id, obs } })} fechar={fechar} depois={() => feito("Processo homologado")} />
      )}
      {dialogo === "devolver" && (
        <ObsDialog titulo="Devolver ao julgamento" texto="O processo volta ao advogado da espécie para novo julgamento. Informe o motivo." rotulo="Devolver" obrigatoria
          acao={(obs) => devolverJulgamentoFn({ data: { processoId: p.id, obs } })} fechar={fechar} depois={() => feito("Devolvido ao julgamento")} />
      )}
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
    onSuccess: () => depois("Julgamento registrado — segue para a assinatura do Presidente"),
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
            {valorOk && num > 0 && <p className="text-xs text-muted-foreground">{brl(num)} · com 30% de desconto à vista: {brl(num * 0.7)} (a guia GRU será a próxima etapa)</p>}
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

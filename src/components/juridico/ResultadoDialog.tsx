import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registrarResultadoFn } from "@/lib/juridico.functions";
import { CANAL, erroMsg, RESULTADO, RESULTADO_SIGLA } from "@/lib/rotulos";
import type { CanalNotificacao, ResultadoNotificacao } from "@/lib/tipos";

type Desfecho = Exclude<ResultadoNotificacao, "pendente">;
const DESFECHOS: Desfecho[] = ["entregue", "devolvido", "recusado", "mudou_se"];

export function hojeISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Recife" });
}

/** Registra o desfecho de uma notificação: E (entregue), D (devolvido), R (recusado), M (mudou-se). */
export function ResultadoDialog({
  notificacaoId, canal, titulo, dataSaida, fechar,
}: { notificacaoId: string; canal: CanalNotificacao; titulo: string; dataSaida: string; fechar: () => void }) {
  const qc = useQueryClient();
  const [resultado, setResultado] = useState<Desfecho>("entregue");
  const [data, setData] = useState(hojeISO());
  const [recebedor, setRecebedor] = useState("");
  const [obs, setObs] = useState("");
  const salvar = useMutation({
    mutationFn: () => registrarResultadoFn({ data: { notificacaoId, resultado, data, recebedor, obs } }),
    onSuccess: async () => {
      toast.success("Desfecho registrado");
      await qc.invalidateQueries();
      fechar();
    },
    onError: (e) => toast.error(erroMsg(e)),
  });
  const precisaRecebedor = resultado === "entregue" && canal !== "doe";
  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Desfecho da notificação</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{titulo} · {CANAL[canal]}</p>
        <Label htmlFor="desfecho">Desfecho</Label>
        <select id="desfecho" className="h-9 rounded border bg-background px-2 text-sm" value={resultado} onChange={(e) => setResultado(e.target.value as Desfecho)}>
          {DESFECHOS.map((r) => <option key={r} value={r}>{RESULTADO_SIGLA[r]} — {RESULTADO[r]}</option>)}
        </select>
        <Label htmlFor="data-desfecho">{resultado === "entregue" ? "Data da entrega (início do prazo de defesa)" : "Data"}</Label>
        <Input id="data-desfecho" type="date" min={dataSaida} max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />
        {resultado === "entregue" && (
          <>
            <Label htmlFor="recebedor">Quem recebeu{precisaRecebedor ? "" : " (opcional)"}</Label>
            <Input id="recebedor" value={recebedor} onChange={(e) => setRecebedor(e.target.value)} />
          </>
        )}
        <Label htmlFor="obs-desfecho">Observação (opcional)</Label>
        <Textarea id="obs-desfecho" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvar.isPending || !data || (precisaRecebedor && recebedor.trim().length < 3)} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

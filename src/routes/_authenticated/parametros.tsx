import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSessao } from "@/lib/auth";
import { definirParametroFn, listarParametrosFn } from "@/lib/juridico.functions";
import { erroMsg } from "@/lib/rotulos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/parametros")({
  head: () => ({ meta: [{ title: "Parâmetros — SAPP" }, { name: "description", content: "Parâmetros da GRU e do desconto à vista." }] }),
  component: Parametros,
});

const ROTULOS: Record<string, { rotulo: string; dica: string }> = {
  desconto_vista_percentual: { rotulo: "Desconto à vista (%)", dica: "Número inteiro de 0 a 90. Padrão: 30." },
  gru_codigo_recolhimento: { rotulo: "Código de recolhimento da GRU", dica: "Impresso no espelho da GRU." },
  gru_unidade_gestora: { rotulo: "Unidade gestora (UG)", dica: "Impressa no espelho da GRU." },
  gru_instrucoes: { rotulo: "Instruções para o preenchimento", dica: "Texto livre exibido no espelho da GRU." },
};

function Parametros() {
  const { data: sessao } = useSessao();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["parametros"], enabled: sessao?.tem("admin") ?? false, queryFn: () => listarParametrosFn() });
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => setV(Object.fromEntries(data.map((p) => [p.chave, p.valor]))), [data]);
  const salvar = useMutation({
    mutationFn: (chave: string) => definirParametroFn({ data: { chave, valor: v[chave] ?? "" } }),
    onSuccess: () => { toast.success("Parâmetro salvo"); qc.invalidateQueries({ queryKey: ["parametros"] }); },
    onError: (e) => toast.error(erroMsg(e)),
  });
  if (!sessao) return null;
  if (!sessao.tem("admin")) return <SemPermissao />;
  return (
    <>
      <Cabecalho titulo="Parâmetros" sub="GRU e desconto à vista" />
      <div className="max-w-2xl space-y-4">
        {data.map((p) => (
          <div key={p.chave} className="rounded-lg border bg-card p-4">
            <label htmlFor={p.chave} className="text-sm font-medium">{ROTULOS[p.chave]?.rotulo ?? p.chave}</label>
            <p className="mb-2 text-xs text-muted-foreground">{ROTULOS[p.chave]?.dica}</p>
            <div className="flex gap-2">
              <Input id={p.chave} value={v[p.chave] ?? ""} onChange={(e) => setV({ ...v, [p.chave]: e.target.value })} />
              <Button disabled={salvar.isPending || (v[p.chave] ?? "") === p.valor} onClick={() => salvar.mutate(p.chave)}>Salvar</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

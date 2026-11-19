import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { atualizarEspecieFn, inserirEspecieFn, listarEspeciesFn } from "@/lib/cadastros.functions";
import { useSessao } from "@/lib/auth";
import { Cabecalho } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { erroMsg } from "@/lib/rotulos";

export const Route = createFileRoute("/_authenticated/especies")({
  head: () => ({
    meta: [
      { title: "Espécies — SAPP" },
      { name: "description", content: "Tabela de espécies do relatório JR5260." },
      { property: "og:title", content: "Espécies — SAPP" },
      { property: "og:description", content: "Tabela de espécies do SAPP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Especies,
});

function Especies() {
  const { data: sessao } = useSessao();
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const { data: especies = [] } = useQuery({
    queryKey: ["especies"],
    queryFn: () => listarEspeciesFn(),
  });
  const exec = useMutation({
    mutationFn: async (f: () => Promise<unknown>) => {
      await f();
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["especies"] }); },
    onError: (e) => toast.error(erroMsg(e)),
  });
  const admin = sessao?.tem("admin");

  return (
    <>
      <Cabecalho titulo="Espécies" sub="O significado de cada código é confirmado pela instituição, não presumido." />
      {admin && (
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); exec.mutate(() => inserirEspecieFn({ data: { codigo } })); setCodigo(""); }}>
          <Input className="w-32" placeholder="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} required maxLength={3} />
          <Button type="submit">Adicionar</Button>
        </form>
      )}
      <div className="max-w-2xl divide-y rounded-lg border bg-card">
        {especies.map((e) => (
          <div key={e.codigo} className="flex items-center gap-4 p-3">
            <span className="w-12 font-mono font-semibold">{e.codigo}</span>
            <Input
              disabled={!admin}
              defaultValue={e.descricao}
              placeholder="Descrição (a confirmar)"
              onBlur={(ev) => ev.target.value !== e.descricao && exec.mutate(() => atualizarEspecieFn({ data: { codigo: e.codigo, descricao: ev.target.value } }))}
            />
          </div>
        ))}
      </div>
    </>
  );
}

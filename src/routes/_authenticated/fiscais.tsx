import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { alternarFiscalFn, inserirFiscalFn, listarEspeciesFn, listarFiscaisFn } from "@/lib/cadastros.functions";
import { useSessao } from "@/lib/auth";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { erroMsg, SETOR_TECNICO, type SetorTecnico } from "@/lib/rotulos";

export const Route = createFileRoute("/_authenticated/fiscais")({
  head: () => ({
    meta: [
      { title: "Fiscais — SAPP" },
      { name: "description", content: "Cadastro de fiscais, setores técnicos e espécies fiscalizadas." },
      { property: "og:title", content: "Fiscais — SAPP" },
      { property: "og:description", content: "Cadastro de fiscais do SAPP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Fiscais,
});

function Fiscais() {
  const { data: sessao } = useSessao();
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ nome: "", matricula: "", setor: "METROLOGIA" as SetorTecnico, especies: [] as string[] });
  const { data: fiscais = [] } = useQuery({
    queryKey: ["fiscais"],
    queryFn: () => listarFiscaisFn(),
  });
  const { data: especies = [] } = useQuery({
    queryKey: ["especies"],
    queryFn: () => listarEspeciesFn(),
  });
  const exec = useMutation({
    mutationFn: async (f: () => Promise<unknown>) => {
      await f();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscais"] }),
    onError: (e) => toast.error(erroMsg(e)),
  });

  if (!sessao) return null;
  if (!sessao.tem("cpma", "admin")) return <SemPermissao />;

  return (
    <>
      <Cabecalho titulo="Fiscais" sub="Fiscais não são excluídos: quem deixa de atuar é inativado e continua no histórico dos processos antigos." />
      <form
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          exec.mutate(() =>
            inserirFiscalFn({ data: { nome: novo.nome, matricula: novo.matricula, setor: novo.setor, especies: novo.especies } }),
          );
          setNovo({ ...novo, nome: "", matricula: "", especies: [] });
        }}
      >
        <Input className="w-56" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
        <Input className="w-36" placeholder="Identificação" value={novo.matricula} onChange={(e) => setNovo({ ...novo, matricula: e.target.value })} required />
        <select className="h-9 rounded border bg-background px-2 text-sm" value={novo.setor} onChange={(e) => setNovo({ ...novo, setor: e.target.value as SetorTecnico })}>
          {Object.entries(SETOR_TECNICO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!especies.length && (
            <span className="text-muted-foreground">
              Nenhuma espécie cadastrada.{" "}
              {sessao.tem("admin") ? (
                <Link to="/especies" className="text-primary underline">Cadastre as espécies primeiro</Link>
              ) : (
                "Peça ao administrador para cadastrar as espécies."
              )}
            </span>
          )}
          {especies.map((e) => (
            <label key={e.codigo} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={novo.especies.includes(e.codigo)}
                onChange={(ev) => setNovo({ ...novo, especies: ev.target.checked ? [...novo.especies, e.codigo] : novo.especies.filter((x) => x !== e.codigo) })}
              />
              {e.codigo}
            </label>
          ))}
        </div>
        <Button type="submit" disabled={!novo.especies.length || exec.isPending}>Cadastrar fiscal</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Identificação</th><th className="px-3 py-2">Setor técnico</th><th className="px-3 py-2">Espécies</th><th className="px-3 py-2">Situação</th><th /></tr>
          </thead>
          <tbody>
            {fiscais.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-2 font-medium">{f.nome}</td>
                <td className="px-3 py-2">{f.matricula}</td>
                <td className="px-3 py-2">{SETOR_TECNICO[f.setor_tecnico]}</td>
                <td className="px-3 py-2">{f.especies.join(", ")}</td>
                <td className="px-3 py-2"><Badge variant={f.ativo ? "default" : "outline"}>{f.ativo ? "Ativo" : "Inativo"}</Badge></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => exec.mutate(() => alternarFiscalFn({ data: { id: f.id, ativo: !f.ativo } }))}>
                    {f.ativo ? "Inativar" : "Reativar"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

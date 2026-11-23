import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarUsuarioFn, definirPapeisFn, listarUsuariosFn, redefinirSenhaFn } from "@/lib/cadastros.functions";
import { useSessao } from "@/lib/auth";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { erroMsg, PAPEIS, type Papel } from "@/lib/rotulos";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e perfis — SAPP" },
      { name: "description", content: "Gerenciamento de perfis de acesso." },
      { property: "og:title", content: "Usuários e perfis — SAPP" },
      { property: "og:description", content: "Gerenciamento de perfis de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Usuarios,
});

function Usuarios() {
  const { data: sessao } = useSessao();
  const qc = useQueryClient();
  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listarUsuariosFn(),
  });
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "" });
  const criar = useMutation({
    mutationFn: () => criarUsuarioFn({ data: novo }),
    onSuccess: () => { toast.success("Usuário criado. Libere o perfil abaixo."); setNovo({ nome: "", email: "", senha: "" }); qc.invalidateQueries({ queryKey: ["usuarios"] }); },
    onError: (e) => toast.error(erroMsg(e)),
  });
  const redefinir = useMutation({
    mutationFn: ({ id, senha }: { id: string; senha: string }) => redefinirSenhaFn({ data: { id, senha } }),
    onSuccess: () => toast.success("Senha redefinida. As sessões abertas dessa pessoa foram encerradas."),
    onError: (e) => toast.error(erroMsg(e)),
  });
  const definir = useMutation({
    mutationFn: async ({ id, papeis }: { id: string; papeis: Papel[] }) => {
      await definirPapeisFn({ data: { id, papeis } });
    },
    onSuccess: () => { toast.success("Perfis atualizados"); qc.invalidateQueries(); },
    onError: (e) => toast.error(erroMsg(e)),
  });

  if (!sessao) return null;
  if (!sessao.tem("admin")) return <SemPermissao />;

  return (
    <>
      <Cabecalho titulo="Usuários e perfis" sub="O administrador cria as contas e libera o perfil do setor (ou o cadastro por conta própria é habilitado no servidor). Aplique o menor privilégio." />
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4" onSubmit={(e) => { e.preventDefault(); criar.mutate(); }}>
        <Input className="w-56" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
        <Input className="w-64" type="email" placeholder="E-mail" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required />
        <Input className="w-56" type="password" minLength={8} placeholder="Senha inicial (mín. 8)" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} required />
        <Button type="submit" disabled={criar.isPending}>Criar usuário</Button>
      </form>
      <div className="tabela-rolavel rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">E-mail</th>{PAPEIS.map((p) => <th key={p.valor} className="px-3 py-2 text-center">{p.rotulo}</th>)}<th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2 font-medium">{u.nome || "—"}</td>
                <td className="px-3 py-2">{u.email}</td>
                {PAPEIS.map((p) => (
                  <td key={p.valor} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={u.papeis.includes(p.valor)}
                      onChange={(e) =>
                        definir.mutate({ id: u.id, papeis: e.target.checked ? [...u.papeis, p.valor] : u.papeis.filter((x) => x !== p.valor) })
                      }
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { const senha = window.prompt(`Nova senha para ${u.email} (mín. 8 caracteres):`); if (senha) redefinir.mutate({ id: u.id, senha }); }}>Redefinir senha</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

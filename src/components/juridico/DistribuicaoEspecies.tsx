import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listarEspeciesFn } from "@/lib/cadastros.functions";
import { definirEspeciesJulgadorFn, listarJulgadoresFn } from "@/lib/julgamento.functions";
import { erroMsg } from "@/lib/rotulos";
import { Button } from "@/components/ui/button";

/** Homologadores definem quais espécies cada advogado julga. Sem nenhuma marcada, o advogado julga todas (padrão). */
export function DistribuicaoEspecies() {
  const qc = useQueryClient();
  const { data: advogados = [] } = useQuery({ queryKey: ["julgadores"], queryFn: () => listarJulgadoresFn() });
  const { data: especies = [] } = useQuery({ queryKey: ["especies"], queryFn: () => listarEspeciesFn() });
  const definir = useMutation({
    mutationFn: ({ id, especies }: { id: string; especies: string[] }) => definirEspeciesJulgadorFn({ data: { id, especies } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["julgadores"] }),
    onError: (e) => toast.error(erroMsg(e)),
  });
  return (
    <section>
      <h2 className="mb-1 font-semibold">Quem julga cada espécie</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Padrão: cada advogado julga todas as espécies. Marque espécies para restringir um advogado só a elas.
      </p>
      {!advogados.length ? <p className="text-sm text-muted-foreground">Nenhum usuário com o perfil Advogado.</p> : (
        <div className="tabela-rolavel rounded-lg border bg-card">
          {advogados.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-sm last:border-b-0">
              <span className="w-56 font-medium">{a.nome}</span>
              {especies.map((e) => (
                <label key={e.codigo} className="flex items-center gap-1">
                  <input type="checkbox" checked={a.especies.includes(e.codigo)} disabled={definir.isPending}
                    onChange={(ev) => definir.mutate({ id: a.id, especies: ev.target.checked ? [...a.especies, e.codigo] : a.especies.filter((x) => x !== e.codigo) })} />
                  {e.codigo}
                </label>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {a.especies.length ? `Só: ${a.especies.join(", ")}` : "Todas as espécies (padrão)"}
              </span>
              {a.especies.length > 0 && <Button size="sm" variant="ghost" disabled={definir.isPending} onClick={() => definir.mutate({ id: a.id, especies: [] })}>Liberar todas</Button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

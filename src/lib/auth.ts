import { useQuery } from "@tanstack/react-query";
import { obterSessaoFn } from "@/lib/auth.functions";
import { listarPerfisFn } from "@/lib/cadastros.functions";
import type { Papel } from "./tipos";

export function useSessao() {
  return useQuery({
    queryKey: ["sessao"],
    queryFn: async () => {
      const s = await obterSessaoFn();
      if (!s) return null;
      return {
        ...s,
        nome: s.nome || s.email,
        tem: (...p: Papel[]) => p.some((x) => s.papeis.includes(x)),
      };
    },
  });
}

export function usePerfis() {
  return useQuery({
    queryKey: ["perfis"],
    queryFn: async () => new Map([["00000000-0000-0000-0000-000000000000", "Sistema (automático)"], ...(await listarPerfisFn()).map((p): [string, string] => [p.id, p.nome || "—"])]),
  });
}

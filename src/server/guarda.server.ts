import type { Papel, Sessao } from "@/lib/tipos";

/** O navegador não fala com o banco; esta é a porta de entrada. As funções SQL conferem o papel de novo. */
export function exigirPapel(sessao: Sessao, ...papeis: Papel[]) {
  if (!papeis.some((p) => sessao.papeis.includes(p))) throw new Error("Permissão negada");
}

export const PAPEIS_SETORES: Papel[] = ["cca", "cpma", "juridico", "gestao"];

import type { Papel, Processo } from "./rotulos";

export type AreaProcesso = "cpma" | "juridico";

export function podeReceberNaArea(p: Pick<Processo, "setor_atual" | "setor_destino">, papeis: Papel[], area?: AreaProcesso) {
  if (area === "cpma") return p.setor_destino === "CPMA" && papeis.includes("cpma");
  if (area === "juridico") return p.setor_destino === "JURIDICO" && papeis.includes("juridico");
  return papeis.some((papel) => papel.toUpperCase() === p.setor_destino);
}

export function acoesCpma(p: Pick<Processo, "setor_atual" | "setor_destino"> & Partial<Pick<Processo, "digitalizado_em" | "fiscal_id">>, papeis: Papel[]) {
  const autorizado = papeis.includes("cpma");
  const comCpma = autorizado && p.setor_atual === "CPMA" && p.setor_destino === null;
  return {
    receber: autorizado && p.setor_destino === "CPMA",
    informarFiscal: comCpma,
    encaminharJuridico: comCpma && !!p.digitalizado_em && !!p.fiscal_id,
  };
}

export type EtapaCpma = "receber" | "informarFiscal" | "digitalizar" | "encaminhar" | null;

/** Uma etapa por vez: receber → informar fiscal → digitalizar → encaminhar ao Jurídico. */
export function etapaCpma(p: Pick<Processo, "setor_atual" | "setor_destino"> & Partial<Pick<Processo, "digitalizado_em" | "fiscal_id">>, papeis: Papel[]): EtapaCpma {
  const a = acoesCpma(p, papeis);
  if (a.receber) return "receber";
  if (!a.informarFiscal) return null;
  if (!p.fiscal_id) return "informarFiscal";
  if (!p.digitalizado_em) return "digitalizar";
  return "encaminhar";
}

export function acoesJuridico(p: Pick<Processo, "setor_atual" | "setor_destino">, papeis: Papel[]) {
  const autorizado = papeis.includes("juridico");
  return {
    receber: autorizado && p.setor_destino === "JURIDICO",
    comJuridico: autorizado && p.setor_atual === "JURIDICO" && p.setor_destino === null,
  };
}

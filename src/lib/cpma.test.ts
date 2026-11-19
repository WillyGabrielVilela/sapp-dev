import { describe, expect, it } from "vitest";
import { acoesCpma, podeReceberNaArea } from "./cpma";

describe("recebimento restrito à área aberta", () => {
  const enviado = { setor_atual: "CPMA" as const, setor_destino: "JURIDICO" as const };
  it("não permite receber pelo Jurídico dentro da área CPMA, mesmo com ambos os perfis", () => {
    expect(podeReceberNaArea(enviado, ["cpma", "juridico"], "cpma")).toBe(false);
  });
  it("permite que apenas o perfil Jurídico receba na área Jurídico", () => {
    expect(podeReceberNaArea(enviado, ["cpma"], "juridico")).toBe(false);
    expect(podeReceberNaArea(enviado, ["cpma", "juridico"], "juridico")).toBe(true);
  });
  it("preserva o recebimento pela CPMA e do CCA no painel", () => {
    expect(podeReceberNaArea({ setor_atual: "CCA", setor_destino: "CPMA" }, ["cpma"], "cpma")).toBe(true);
    expect(podeReceberNaArea({ setor_atual: "CPMA", setor_destino: "CCA" }, ["cca"])).toBe(true);
  });
});

describe("recebimento e fiscal pela CPMA", () => {
  it("permite receber processo enviado pelo CCA à CPMA", () => {
    expect(acoesCpma({ setor_atual: "CCA", setor_destino: "CPMA" }, ["cpma"]).receber).toBe(true);
  });
  it("exige recebimento antes de informar fiscal", () => {
    expect(acoesCpma({ setor_atual: "CCA", setor_destino: "CPMA" }, ["cpma"]).informarFiscal).toBe(false);
    expect(acoesCpma({ setor_atual: "CPMA", setor_destino: null }, ["cpma"]).informarFiscal).toBe(true);
  });
  it("não libera ações CPMA para CCA ou administrador", () => {
    expect(acoesCpma({ setor_atual: "CCA", setor_destino: "CPMA" }, ["cca", "admin"]).receber).toBe(false);
    expect(acoesCpma({ setor_atual: "CPMA", setor_destino: null }, ["admin"]).informarFiscal).toBe(false);
  });
  it("impede alterar fiscal depois do envio ao Jurídico", () => {
    expect(acoesCpma({ setor_atual: "CPMA", setor_destino: "JURIDICO" }, ["cpma"]).informarFiscal).toBe(false);
  });
});
import { acoesJuridico } from "./cpma";
describe("encaminhamento ao Jurídico", () => {
  const base = { setor_atual: "CPMA" as const, setor_destino: null };
  it("só encaminha com digitalização e fiscal", () => {
    expect(acoesCpma({ ...base, digitalizado_em: null, fiscal_id: "f" }, ["cpma"]).encaminharJuridico).toBe(false);
    expect(acoesCpma({ ...base, digitalizado_em: "2026-01-01", fiscal_id: null }, ["cpma"]).encaminharJuridico).toBe(false);
    expect(acoesCpma({ ...base, digitalizado_em: "2026-01-01", fiscal_id: "f" }, ["cpma"]).encaminharJuridico).toBe(true);
  });
  it("Jurídico recebe processo enviado a ele", () => {
    expect(acoesJuridico({ setor_atual: "CPMA", setor_destino: "JURIDICO" }, ["juridico"]).receber).toBe(true);
    expect(acoesJuridico({ setor_atual: "CPMA", setor_destino: "JURIDICO" }, ["cpma"]).receber).toBe(false);
    expect(acoesJuridico({ setor_atual: "JURIDICO", setor_destino: null }, ["juridico"]).comJuridico).toBe(true);
  });
});
import { etapaCpma } from "./cpma";
describe("etapas da CPMA, uma por vez", () => {
  const c = { setor_atual: "CPMA" as const, setor_destino: null };
  it("segue receber → fiscal → digitalizar → encaminhar", () => {
    expect(etapaCpma({ setor_atual: "CCA", setor_destino: "CPMA" }, ["cpma"])).toBe("receber");
    expect(etapaCpma({ ...c, fiscal_id: null, digitalizado_em: null }, ["cpma"])).toBe("informarFiscal");
    expect(etapaCpma({ ...c, fiscal_id: "f", digitalizado_em: null }, ["cpma"])).toBe("digitalizar");
    expect(etapaCpma({ ...c, fiscal_id: "f", digitalizado_em: "2026-01-01" }, ["cpma"])).toBe("encaminhar");
  });
});

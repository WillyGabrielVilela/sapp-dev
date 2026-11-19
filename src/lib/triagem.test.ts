import { describe, expect, it } from "vitest";
import { avaliarTriagem } from "./triagem";

const item = { numero: "52600.000100/2026-11", abertura: "2026-03-05", situacao: "pendente" };

describe("conferência antes do encaminhamento", () => {
  it("permite abrir a conferência quando falta o total, mas não autoriza confirmar", () => {
    expect(avaliarTriagem([item], null)).toMatchObject({ podeIniciar: true, bloqueado: true });
  });
  it("compara o total com todas as linhas, incluindo descartadas", () => {
    const itens = [item, { ...item, situacao: "descartado" }];
    expect(avaliarTriagem(itens, 2)).toMatchObject({ podeIniciar: true, bloqueado: false });
    expect(avaliarTriagem(itens, 1)).toMatchObject({ podeIniciar: false, bloqueado: true });
  });
  it("não encaminha números duplicados pendentes", () => {
    expect(avaliarTriagem([item, item], 2).podeIniciar).toBe(false);
  });
  it("não encaminha uma linha sem data", () => {
    expect(avaliarTriagem([{ ...item, abertura: null }], 1).podeIniciar).toBe(false);
  });
  it("não encaminha um arquivo sem pendentes", () => {
    expect(avaliarTriagem([{ ...item, situacao: "descartado" }], 1).podeIniciar).toBe(false);
  });
});
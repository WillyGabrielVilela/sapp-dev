import { describe, expect, it } from "vitest";
import { documentoValido, formatarDocumento, validarCnpj, validarCpf } from "./documento";

describe("documento", () => {
  it("valida CPF e CNPJ numéricos", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11.222.333/0001-82")).toBe(false);
  });
  it("valida o CNPJ alfanumérico do exemplo oficial da Receita", () => {
    expect(validarCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(validarCnpj("12.ABC.345/01DE-36")).toBe(false);
  });
  it("aceita vazio e formata", () => {
    expect(documentoValido("")).toBe(true);
    expect(documentoValido("123")).toBe(false);
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento(null)).toBe("—");
  });
});

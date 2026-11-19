import { describe, expect, it } from "vitest";
import { lerRelatorio, type ItemTexto } from "./jr5260";

const linha = (y: number, esp: string, num: string, data: string, prop: string): ItemTexto[] => [
  { str: prop, x: 300, y },
  { str: num, x: 80, y },
  { str: esp, x: 40, y },
  { str: data, x: 220, y },
];
const cab: ItemTexto[] = [{ str: "SGI — JR5260 Processos Cadastrados", x: 40, y: 800 }];

describe("leitura do JR5260", () => {
  it("lê 100 no rodapé pela posição, sem confundir com a página 3 fora de ordem", () => {
    const r = lerRelatorio([{ pagina: 3, itens: [
      ...cab,
      { str: "Total de Processos:", x: 40, y: 40 },
      { str: "3", x: 550, y: 20 },
      { str: "100", x: 180, y: 40 },
    ] }]);
    expect(r.totalRodape).toBe(100);
  });

  it("lê total com separador de milhar e palavras fragmentadas", () => {
    const r = lerRelatorio([{ pagina: 1, itens: [...cab,
      { str: "1.000", x: 200, y: 40 },
      { str: "Processos:", x: 110, y: 40 },
      { str: "Total de", x: 40, y: 40 },
    ] }]);
    expect(r.totalRodape).toBe(1000);
  });

  it("não escolhe um total quando páginas indicam totais conflitantes", () => {
    const r = lerRelatorio([
      { pagina: 1, itens: [...cab, { str: "Total de Processos: 3", x: 40, y: 40 }] },
      { pagina: 2, itens: [...cab, { str: "Total de Processos: 100", x: 40, y: 40 }] },
    ]);
    expect(r.totalRodape).toBeNull();
  });

  it("lê linhas por posição em 2 páginas e confere o rodapé", () => {
    const r = lerRelatorio([
      { pagina: 1, itens: [...cab, ...linha(700, "CT", "52600.000100/2026-11", "05/03/2026", "Empresa A")] },
      { pagina: 2, itens: [...cab, ...linha(700, "BO", "52600.000101/2026-12", "06/03/2026", "Empresa B"), { str: "Total de Processos: 2", x: 40, y: 600 }] },
    ]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({ especie: "CT", numero: "52600.000100/2026-11", abertura: "2026-03-05", proprietario: "Empresa A" });
    expect(r.totalRodape).toBe(2);
  });

  it("sinaliza total do rodapé divergente", () => {
    const r = lerRelatorio([{ pagina: 1, itens: [...cab, ...linha(700, "CT", "52600.000100/2026-11", "05/03/2026", "A"), { str: "Total de Processos: 3", x: 40, y: 600 }] }]);
    expect(r.alertasGerais.some((a) => a.includes("diferem"))).toBe(true);
  });

  it("marca duplicidade, data inválida e lacunas", () => {
    const r = lerRelatorio([
      {
        pagina: 1,
        itens: [
          ...cab,
          ...linha(700, "CT", "52600.000100/2026-11", "31/02/2026", "A"),
          ...linha(680, "CT", "52600.000100/2026-11", "01/02/2026", "A"),
          ...linha(660, "DI", "52600.000103/2026-11", "01/02/2026", "B"),
        ],
      },
    ]);
    expect(r.linhas[0]!.alertas).toContain("Data de abertura inválida");
    expect(r.linhas[1]!.alertas).toContain("Número duplicado no arquivo");
    expect(r.alertasGerais.some((a) => a.includes("000101, 000102"))).toBe(true);
  });

  it("PDF sem texto é inválido", () => {
    const r = lerRelatorio([{ pagina: 1, itens: [] }]);
    expect(r.temTexto).toBe(false);
  });
});

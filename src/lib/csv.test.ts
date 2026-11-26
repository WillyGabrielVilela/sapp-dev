import { describe, expect, it } from "vitest";
import { gerarCsv } from "./csv";

describe("gerarCsv", () => {
  const cols = [
    { titulo: "Nome", valor: (l: { n: string; v: number | null }) => l.n },
    { titulo: "Valor", valor: (l: { n: string; v: number | null }) => l.v },
  ];
  it("usa ; , BOM e CRLF, com decimal em vírgula", () => {
    const csv = gerarCsv(cols, [{ n: "Loja A", v: 1234.5 }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe('\uFEFF"Nome";"Valor"\r\n"Loja A";"1234,5"');
  });
  it("escapa aspas e células vazias", () => {
    expect(gerarCsv(cols, [{ n: 'Loja "Sol"; Cia', v: null }])).toContain('"Loja ""Sol""; Cia";""');
  });
  it("neutraliza fórmulas (injeção de CSV)", () => {
    expect(gerarCsv(cols, [{ n: "=HYPERLINK(\"http://x\")", v: 1 }])).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(gerarCsv(cols, [{ n: "+55 81", v: 1 }])).toContain(`"'+55 81"`);
  });
});

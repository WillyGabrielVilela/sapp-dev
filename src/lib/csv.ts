// Exportação CSV pensada para abrir direto no Excel em português: separador ";", BOM UTF-8, fim de linha CRLF.

export type Coluna<T> = { titulo: string; valor: (linha: T) => string | number | null | undefined };

/** Texto que começa com = + - @ pode ser lido como fórmula pelo Excel: neutralizamos com um apóstrofo. */
function celula(v: string | number | null | undefined): string {
  if (v == null) return '""';
  if (typeof v === "number") return `"${String(v).replace(".", ",")}"`;
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${t.replace(/"/g, '""')}"`;
}

export function gerarCsv<T>(colunas: Coluna<T>[], linhas: T[]): string {
  const cab = colunas.map((c) => celula(c.titulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(";"));
  return "\uFEFF" + [cab, ...corpo].join("\r\n");
}

export function baixarCsv(nomeBase: string, csv: string) {
  const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Recife" });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeBase}-${dia}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Leitura do relatório SGI JR5260 — "Processos Cadastrados".
 *
 * O texto do PDF sai fora de ordem, então usamos a POSIÇÃO de cada palavra:
 * agrupamos por coordenada vertical (linhas) e ordenamos pela horizontal.
 * O dado extraído NUNCA é verdade absoluta: tudo passa pela conferência do CCA.
 */

export type ItemTexto = { str: string; x: number; y: number };
export type PaginaTexto = { pagina: number; itens: ItemTexto[] };

export type LinhaExtraida = {
  pagina: number;
  linha: number;
  especie: string | null;
  numero: string | null;
  abertura: string | null; // ISO yyyy-mm-dd
  aberturaTexto: string | null;
  proprietario: string | null;
  alertas: string[];
};

export type ResultadoLeitura = {
  layoutReconhecido: boolean;
  temTexto: boolean;
  totalRodape: number | null;
  linhas: LinhaExtraida[];
  alertasGerais: string[];
};

export const REGEX_NUMERO = /^\d{5}\.\d{6}\/\d{4}-\d{2}$/;
const NUMERO_NO_TEXTO = /\d{5}\.\d{6}\/\d{4}-\d{2}/;
const DATA = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
const ESPECIE = /^[A-Z]{2,3}$/;

export function dataValida(d: string, m: string, a: string): string | null {
  const dia = Number(d), mes = Number(m), ano = Number(a);
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${a}-${m}-${d}`;
}

function agruparLinhas(itens: ItemTexto[]): string[][] {
  const ordenados = itens.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: { y: number; itens: ItemTexto[] }[] = [];
  for (const it of ordenados) {
    const atual = linhas[linhas.length - 1];
    if (atual && Math.abs(atual.y - it.y) <= 3) atual.itens.push(it);
    else linhas.push({ y: it.y, itens: [it] });
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x).map((i) => i.str.trim()));
}

export function lerRelatorio(paginas: PaginaTexto[]): ResultadoLeitura {
  const textoTotal = paginas.flatMap((p) => p.itens.map((i) => i.str)).join(" ");
  const temTexto = textoTotal.replace(/\s/g, "").length > 0;
  const layoutReconhecido = /JR5260/i.test(textoTotal) || /Processos\s+Cadastrados/i.test(textoTotal);
  // PDF content stream order is not reading order. Never join a footer label
  // to an unrelated page number from another baseline or another page.
  const totais = new Set<number>();
  for (const pag of paginas) {
    for (const tokens of agruparLinhas(pag.itens)) {
      const rodape = tokens.join(" ").match(/Total\s+(?:de\s+)?Processos\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d+)\b/i);
      if (rodape?.[1]) totais.add(Number(rodape[1].replace(/\./g, "")));
    }
  }
  const totalRodape = totais.size === 1 ? Array.from(totais)[0] ?? null : null;

  const linhas: LinhaExtraida[] = [];
  const alertasGerais: string[] = [];
  if (!temTexto) alertasGerais.push("PDF sem camada de texto (possivelmente digitalizado como imagem).");
  else if (!layoutReconhecido) alertasGerais.push("Layout desconhecido: cabeçalho JR5260 / Processos Cadastrados não encontrado.");
  if (temTexto && totalRodape === null) alertasGerais.push("Rodapé 'Total de Processos' não encontrado.");
  if (totais.size > 1) alertasGerais.push("Totais conflitantes no relatório. Confira o total no PDF original.");

  for (const pag of paginas) {
    agruparLinhas(pag.itens).forEach((tokens, idx) => {
      const texto = tokens.join(" ");
      const mNum = texto.match(NUMERO_NO_TEXTO);
      if (!mNum) return;
      const alertas: string[] = [];
      const posNum = tokens.findIndex((t) => t.includes(mNum[0]));
      const antes = tokens.slice(0, posNum).join(" ").split(/\s+/).filter(Boolean);
      const especie = antes.reverse().find((t) => ESPECIE.test(t)) ?? null;
      if (!especie) alertas.push("Espécie não identificada");

      const depois = texto.slice(texto.indexOf(mNum[0]) + mNum[0].length);
      const mData = depois.match(DATA);
      let abertura: string | null = null;
      let proprietario: string | null = null;
      if (mData) {
        abertura = dataValida(mData[1] ?? "", mData[2] ?? "", mData[3] ?? "");
        if (!abertura) alertas.push("Data de abertura inválida");
        proprietario = depois.slice(depois.indexOf(mData[0]) + mData[0].length).trim() || null;
      } else {
        alertas.push("Data de abertura não encontrada");
        proprietario = depois.trim() || null;
      }
      if (!proprietario) alertas.push("Proprietário não identificado");

      linhas.push({
        pagina: pag.pagina,
        linha: idx + 1,
        especie,
        numero: mNum[0],
        abertura,
        aberturaTexto: mData?.[0] ?? null,
        proprietario,
        alertas,
      });
    });
  }

  // duplicidade dentro do mesmo arquivo
  const contagem = new Map<string, number>();
  linhas.forEach((l) => l.numero && contagem.set(l.numero, (contagem.get(l.numero) ?? 0) + 1));
  linhas.forEach((l) => {
    if (l.numero && (contagem.get(l.numero) ?? 0) > 1) l.alertas.push("Número duplicado no arquivo");
  });

  if (totalRodape !== null && totalRodape !== linhas.length) {
    alertasGerais.push(`Linhas lidas (${linhas.length}) diferem do total do rodapé (${totalRodape}). Confirmação bloqueada.`);
  }
  alertasGerais.push(...lacunas(linhas.map((l) => l.numero).filter((n): n is string => !!n)));

  return { layoutReconhecido, temTexto, totalRodape, linhas, alertasGerais };
}

/** Lacunas na numeração sequencial: apenas sinaliza, nunca bloqueia. */
export function lacunas(numeros: string[]): string[] {
  const porAno = new Map<string, number[]>();
  for (const n of numeros) {
    const m = n.match(/^(\d{5})\.(\d{6})\/(\d{4})/);
    if (!m) continue;
    const chave = `${m[1]}/${m[3]}`;
    porAno.set(chave, [...(porAno.get(chave) ?? []), Number(m[2])]);
  }
  const out: string[] = [];
  for (const [chave, seqs] of porAno) {
    const ord = [...new Set(seqs)].sort((a, b) => a - b);
    const faltando: number[] = [];
    for (let i = 1; i < ord.length; i++) for (let s = ord[i - 1]! + 1; s < ord[i]!; s++) faltando.push(s);
    if (faltando.length && faltando.length <= 50) {
      out.push(`Lacuna na numeração (${chave}): ${faltando.map((s) => String(s).padStart(6, "0")).join(", ")}`);
    }
  }
  return out;
}

/** Lê o PDF no navegador (pdfjs carregado sob demanda). */
export async function extrairPaginas(arquivo: File): Promise<PaginaTexto[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const paginas: PaginaTexto[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const itens = content.items
      .filter((it): it is typeof it & { str: string; transform: number[] } => "str" in it)
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    paginas.push({ pagina: i, itens });
  }
  return paginas;
}

export async function sha256(arquivo: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// CPF e CNPJ (inclui o CNPJ alfanumérico, em vigor desde julho/2026: 12 posições [0-9A-Z] + 2 dígitos verificadores).

export function normalizarDocumento(v: string): string {
  return v.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function dv(base: string, pesos: number[]): number {
  const soma = base.split("").reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * (pesos[i] ?? 0), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(v: string): boolean {
  const d = normalizarDocumento(v);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const d1 = dv(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(d.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d === d.slice(0, 9) + d1 + d2;
}

export function validarCnpj(v: string): boolean {
  const d = normalizarDocumento(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const d1 = dv(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d === d.slice(0, 12) + d1 + d2;
}

/** Vazio é aceito (campo opcional). */
export function documentoValido(v: string): boolean {
  const d = normalizarDocumento(v);
  return d === "" || validarCpf(d) || validarCnpj(d);
}

export function formatarDocumento(v: string | null): string {
  if (!v) return "—";
  const d = normalizarDocumento(v);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return v;
}

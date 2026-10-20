/** Junta classes condicionais. Evita uma dependência (clsx) para uma função de 3 linhas. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

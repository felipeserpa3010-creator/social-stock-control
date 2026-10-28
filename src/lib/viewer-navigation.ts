/** Presentation only: database policies remain the authority for data access. */
export function showViewerNavItem(path: string) {
  return ["/dashboard", "/estoque", "/recibos", "/envios-relatorios"].includes(path);
}
export type DispatchItem = { product_id: string; name: string; quantity: string; unit: string; controls_stock: boolean; source_unit_id: string };
export const emptyDispatchItem = (): DispatchItem => ({ product_id: "", name: "", quantity: "1", unit: "unidade", controls_stock: true, source_unit_id: "" });
export function prepareDispatchItems(items: DispatchItem[]) {
  if (!items.length) throw new Error("Adicione um item.");
  return items.map((item) => {
    const quantity = Number(item.quantity.replace(",", "."));
    if (!item.name.trim() || !item.unit.trim() || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Preencha nome, quantidade positiva e unidade de cada item.");
    if (item.source_unit_id && (!item.controls_stock || !item.product_id)) throw new Error("Para retirar do Centro, selecione um produto com controle de estoque.");
    return { ...item, name: item.name.trim(), unit: item.unit.trim(), quantity, product_id: item.product_id || null, source_unit_id: item.source_unit_id || null };
  });
}
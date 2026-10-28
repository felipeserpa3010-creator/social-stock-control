import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyDispatchItem, prepareDispatchItems } from "./dispatch";
describe("itens de distribuição", () => {
  it("permite açúcar externo com controle sem exigir cadastro anterior", () => {
    const [item] = prepareDispatchItems([{ ...emptyDispatchItem(), name: "Açúcar", quantity: "5" }]);
    assert.equal(item?.controls_stock, true); assert.equal(item?.product_id, null); assert.equal(item?.source_unit_id, null); assert.equal(item?.quantity, 5);
  });
  it("preserva a opção de material sem controle", () => {
    assert.equal(prepareDispatchItems([{ ...emptyDispatchItem(), name: "Rodo", controls_stock: false }])[0]?.controls_stock, false);
  });
  it("Centro exige produto cadastrado com controle", () => {
    assert.throws(() => prepareDispatchItems([{ ...emptyDispatchItem(), name: "Arroz", source_unit_id: "centro" }]));
    assert.throws(() => prepareDispatchItems([{ ...emptyDispatchItem(), name: "Arroz", product_id: "arroz", source_unit_id: "centro", controls_stock: false }]));
  });
});
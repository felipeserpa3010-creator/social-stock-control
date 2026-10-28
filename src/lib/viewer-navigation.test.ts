import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { showViewerNavItem } from "./viewer-navigation";

describe("menu do visualizador", () => {
  it("remove Registro de recibos", () => {
    assert.equal(showViewerNavItem("/envios-recibos"), false);
  });
  it("remove Relatórios PDF de estoque", () => {
    assert.equal(showViewerNavItem("/relatorios"), false);
  });
  it("mantém painel, estoque, recibos e relatórios de envios", () => {
    for (const path of ["/dashboard", "/estoque", "/recibos", "/envios-relatorios"]) {
      assert.equal(showViewerNavItem(path), true);
    }
  });
  it("não oferece lançamentos ou administração", () => {
    for (const path of ["/entrada", "/saida", "/distribuir", "/usuarios", "/painel-ceo"]) {
      assert.equal(showViewerNavItem(path), false);
    }
  });
});
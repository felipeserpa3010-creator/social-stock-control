import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { userDeletionError } from "./user-management";

describe("proteções da exclusão de usuários", () => {
  test("impede excluir a própria conta", () => {
    assert.notEqual(userDeletionError("ceo", "ceo", "responsavel"), null);
  });
  test("impede excluir o administrador principal", () => {
    assert.notEqual(userDeletionError("ceo", "outro", "admin"), null);
  });
  test("permite selecionar responsável ou visualizador para exclusão", () => {
    assert.equal(userDeletionError("ceo", "unidade", "responsavel"), null);
    assert.equal(userDeletionError("ceo", "consulta", "visualizador"), null);
  });
});
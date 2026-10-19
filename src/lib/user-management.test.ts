import { describe, expect, test } from "bun:test";
import { userDeletionError } from "./user-management";

describe("proteções da exclusão de usuários", () => {
  test("impede excluir a própria conta", () => {
    expect(userDeletionError("ceo", "ceo", "responsavel")).not.toBeNull();
  });
  test("impede excluir o administrador principal", () => {
    expect(userDeletionError("ceo", "outro", "admin")).not.toBeNull();
  });
  test("permite selecionar responsável ou visualizador para exclusão", () => {
    expect(userDeletionError("ceo", "unidade", "responsavel")).toBeNull();
    expect(userDeletionError("ceo", "consulta", "visualizador")).toBeNull();
  });
});
export function userDeletionError(actorId: string, targetId: string, targetRole: string | null) {
  if (actorId === targetId) return "Você não pode excluir sua própria conta.";
  if (targetRole === "admin") return "O Administrador Principal não pode ser excluído.";
  return null;
}
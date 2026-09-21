const MAX_W = 320;
const MAX_H = 320;
const MAX_BYTES = 300_000;

/**
 * Converte a imagem escolhida em um data URL redimensionado, pronto para ser
 * guardado em `settings.logo_url` e usado tanto na tela quanto no PDF.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem (PNG, JPG ou SVG).");
  }
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagem inválida ou corrompida."));
    el.src = raw;
  });

  const scale = Math.min(1, MAX_W / (img.width || 1), MAX_H / (img.height || 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/png");
  if (out.length > MAX_BYTES) {
    throw new Error("A logo ficou muito grande. Use uma imagem mais simples ou menor.");
  }
  return out;
}

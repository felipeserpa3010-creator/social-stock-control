import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatQty, slugify } from "./format";
import { semadsLogoUrl } from "./brand";

export type InventoryRow = {
  produto: string;
  medida: string;
  estoque: number;
  media?: number | null;
};

export type ReportOptions = {
  titulo: string;
  instituicao: string;
  secretaria: string;
  logoUrl?: string | null;
  unidade: string;
  dataConferencia?: string | null;
  periodoSelecionado?: { from?: string; to?: string } | null;
  incluirMedia?: boolean;
  rows: InventoryRow[];
  assinatura?: boolean;
  modo?: "estoque" | "consumo";
  colunasExtras?: { header: string; key: keyof InventoryRow }[];
};

async function loadLogo(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

export async function buildInventoryPdf(opts: ReportOptions) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const logo = await loadLogo(semadsLogoUrl);
  const dataConf = opts.dataConferencia ? formatDate(opts.dataConferencia) : "—";

  const drawHeader = () => {
    let x = margin;
    if (logo) {
      const h = 16;
      const w = Math.min(28, (logo.w / logo.h) * h);
      try {
        doc.addImage(logo.data, "PNG", margin, 10, w, h);
      } catch {
        /* ignore */
      }
      x = margin + w + 5;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(125, 38, 11);
    doc.text(opts.instituicao.toUpperCase(), x, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(70);
    doc.text(opts.secretaria, x, 20.5);

    doc.setDrawColor(200);
    doc.line(margin, 27, pageW - margin, 27);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.setTextColor(125, 38, 11);
    doc.text(opts.titulo.toUpperCase(), pageW / 2, 34.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text(`Unidade: ${opts.unidade}`, margin, 42);
    doc.text(`Data do relatório: ${dataConf}`, pageW - margin, 42, { align: "right" });
    if (opts.periodoSelecionado?.from || opts.periodoSelecionado?.to) {
      const from = opts.periodoSelecionado.from ? formatDate(opts.periodoSelecionado.from) : "—";
      const to = opts.periodoSelecionado.to ? formatDate(opts.periodoSelecionado.to) : "—";
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text(`Período selecionado: ${from} a ${to}`, pageW - margin, 47, { align: "right" });
    }
  };

  const head = ["Produto", opts.modo === "consumo" ? "Consumo no período" : "Estoque aproximado", "Unidade de medida"];
  if (opts.incluirMedia) head.push("Média de consumo mensal");

  const body = opts.rows.map((r) => {
    const line = [r.produto, formatQty(r.estoque), r.medida];
    if (opts.incluirMedia) {
      line.push(r.media === null || r.media === undefined ? "Dados insuficientes" : formatQty(r.media));
    }
    return line;
  });

  autoTable(doc, {
    head: [head],
    body: body.length ? body : [["Nenhum produto encontrado", "—", "—", ...(opts.incluirMedia ? ["—"] : [])]],
    startY: opts.periodoSelecionado?.from || opts.periodoSelecionado?.to ? 52 : 47,
    margin: { top: opts.periodoSelecionado?.from || opts.periodoSelecionado?.to ? 52 : 47, left: margin, right: margin, bottom: 22 },
    styles: { fontSize: 9, cellPadding: 2.2, lineColor: [215, 220, 216], lineWidth: 0.1 },
    headStyles: { fillColor: [125, 38, 11], textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [249, 244, 241] },
    columnStyles: {
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 38 },
    },
    didDrawPage: () => {
      drawHeader();
    },
  });


  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(125, 38, 11);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`${opts.unidade} | Conferência: ${dataConf}`, margin, pageH - 9);
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 9, { align: "right" });
  }

  return doc;
}

export function reportFileName(prefixo: string, unidade: string, data?: string | null) {
  const d = data ? new Date(`${data}T12:00:00`) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${prefixo}_${slugify(unidade)}_${dd}-${mm}-${d.getFullYear()}.pdf`;
}


export type ReceiptPdfOptions = {
  reciboId: string;
  unidade: string;
  data: string;
  rows: { produto: string; quantidade: number | string; medida: string }[];
};

export async function buildReceiptPdf(opts: ReceiptPdfOptions) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const logo = await loadLogo(semadsLogoUrl);

  let x = margin;
  if (logo) {
    const h = 18;
    const w = Math.min(32, (logo.w / logo.h) * h);
    try { doc.addImage(logo.data, "PNG", margin, 9, w, h); } catch { /* ignore */ }
    x = margin + w + 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(125, 38, 11);
  doc.text("SEMADS", x, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text("Depósito SEMADS", x, 20);
  doc.setDrawColor(125, 38, 11);
  doc.line(margin, 31, pageW - margin, 31);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(125, 38, 11);
  doc.text("RECIBO DE PRODUTOS", pageW / 2, 41, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text(`Recibo: ${opts.reciboId}`, margin, 51);
  doc.text(`Unidade de destino: ${opts.unidade}`, margin, 58);
  doc.text(`Data do lançamento: ${formatDate(opts.data)}`, pageW - margin, 58, { align: "right" });

  autoTable(doc, {
    head: [["Produto", "Quantidade", "Unidade de medida"]],
    body: opts.rows.map((r) => [r.produto, formatQty(Number(r.quantidade)), r.medida || "—"]),
    startY: 66,
    margin: { left: margin, right: margin, bottom: 30 },
    styles: { fontSize: 10, cellPadding: 3, lineColor: [215, 220, 216], lineWidth: 0.1 },
    headStyles: { fillColor: [125, 38, 11], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 244, 241] },
    columnStyles: { 1: { halign: "right", cellWidth: 40 }, 2: { cellWidth: 42 } },
  });

  const finalY = Math.min((doc as any).lastAutoTable?.finalY ?? 90, pageH - 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text("Este recibo registra os produtos enviados à unidade.", margin, finalY + 10);
  doc.text("O estoque da unidade somente é atualizado após a confirmação do recebimento.", margin, finalY + 16);

  return doc;
}

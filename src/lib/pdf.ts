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
  categorySummary?: { categoria: string; total: number; mediaMensal: number }[];
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
  const brown: [number, number, number] = [125, 38, 11];
  const lightBrown: [number, number, number] = [249, 244, 241];
  const dark: [number, number, number] = [42, 42, 42];
  const muted: [number, number, number] = [105, 105, 105];

  const logo = await loadLogo(semadsLogoUrl);
  const dataConf = opts.dataConferencia ? formatDate(opts.dataConferencia) : formatDate(new Date().toISOString().slice(0, 10));
  const hasPeriod = Boolean(opts.periodoSelecionado?.from || opts.periodoSelecionado?.to);
  const from = opts.periodoSelecionado?.from ? formatDate(opts.periodoSelecionado.from) : "—";
  const to = opts.periodoSelecionado?.to ? formatDate(opts.periodoSelecionado.to) : "—";

  const drawHeader = () => {
    doc.setFillColor(...brown);
    doc.rect(0, 0, pageW, 4, "F");

    let x = margin;
    if (logo) {
      const h = 16;
      const w = Math.min(30, (logo.w / logo.h) * h);
      try { doc.addImage(logo.data, "PNG", margin, 9, w, h); } catch { /* ignore */ }
      x = margin + w + 5;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...brown);
    doc.text(opts.instituicao.toUpperCase(), x, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(opts.secretaria, x, 19);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.setTextColor(...brown);
    doc.text(opts.titulo.toUpperCase(), pageW / 2, 35, { align: "center" });

    doc.setDrawColor(225);
    doc.setLineWidth(0.35);
    doc.line(margin, 40, pageW - margin, 40);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text("UNIDADE", margin, 47);
    doc.text("DATA DO RELATÓRIO", pageW - margin, 47, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(opts.unidade, margin, 52);
    doc.text(dataConf, pageW - margin, 52, { align: "right" });

    if (hasPeriod) {
      doc.setFillColor(...lightBrown);
      doc.roundedRect(margin, 57, pageW - margin * 2, 10, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...brown);
      doc.text("PERÍODO ANALISADO", margin + 4, 63.2);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...dark);
      doc.text(`${from} a ${to}`, pageW - margin - 4, 63.2, { align: "right" });
    }
  };

  const drawFooter = (page: number, totalPages: number) => {
    doc.setDrawColor(220);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 16, pageW - margin, pageH - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text("Controle de Estoque • SEMADS", margin, pageH - 10);
    doc.text(`Documento gerado em ${dataConf}`, pageW / 2, pageH - 10, { align: "center" });
    doc.text(`Página ${page} de ${totalPages}`, pageW - margin, pageH - 10, { align: "right" });
  };

  const totalConsumption = opts.rows.reduce((sum, row) => sum + Number(row.estoque || 0), 0);
  const categoryTotals = opts.categorySummary ?? [];
  const monthlyAverage = categoryTotals.reduce((sum, item) => sum + Number(item.mediaMensal || 0), 0);
  const categoryCount = categoryTotals.length;

  drawHeader();
  let cursorY = hasPeriod ? 74 : 60;

  if (opts.modo === "consumo") {
    const cardW = (pageW - margin * 2 - 6) / 3;
    [
      { label: "TOTAL CONSUMIDO", value: formatQty(totalConsumption) },
      { label: "MÉDIA MENSAL", value: formatQty(monthlyAverage) },
      { label: "CATEGORIAS", value: String(categoryCount) },
    ].forEach((card, index) => {
      const x = margin + index * (cardW + 3);
      doc.setFillColor(...lightBrown);
      doc.roundedRect(x, cursorY, cardW, 20, 2.5, 2.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...brown);
      doc.text(card.label, x + 4, cursorY + 7);
      doc.setFontSize(13);
      doc.setTextColor(...dark);
      doc.text(card.value, x + 4, cursorY + 15.5);
    });
    cursorY += 27;

    if (categoryTotals.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...brown);
      doc.text("VISÃO GERAL DO CONSUMO", margin, cursorY);
      cursorY += 6;

      const max = Math.max(...categoryTotals.map((item) => Number(item.total || 0)), 1);
      const barW = pageW - margin * 2 - 72;

      categoryTotals.forEach((item) => {
        if (cursorY > pageH - 48) {
          doc.addPage();
          drawHeader();
          cursorY = hasPeriod ? 74 : 60;
        }
        const total = Number(item.total || 0);
        const ratio = Math.max(0, Math.min(1, total / max));
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...dark);
        const label = item.categoria.length > 24 ? `${item.categoria.slice(0, 23)}…` : item.categoria;
        doc.text(label, margin, cursorY + 4);
        doc.setFillColor(235, 235, 235);
        doc.roundedRect(margin + 48, cursorY, barW, 6, 1.5, 1.5, "F");
        doc.setFillColor(...brown);
        doc.roundedRect(margin + 48, cursorY, Math.max(2, barW * ratio), 6, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...dark);
        doc.text(formatQty(total), pageW - margin, cursorY + 4, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...muted);
        doc.text(`Média mensal: ${formatQty(Number(item.mediaMensal || 0))}`, margin + 48, cursorY + 11);
        cursorY += 17;
      });
      cursorY += 2;
    }

    if (cursorY > pageH - 75) {
      doc.addPage();
      drawHeader();
      cursorY = hasPeriod ? 74 : 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...brown);
    doc.text("DETALHAMENTO POR PRODUTO", margin, cursorY);
    cursorY += 4;
  }

  const head = ["Produto", opts.modo === "consumo" ? "Consumo no período" : "Estoque aproximado", "Unidade de medida"];
  if (opts.incluirMedia) head.push("Média de consumo mensal");
  const body = opts.rows.map((r) => {
    const line = [r.produto, formatQty(r.estoque), r.medida];
    if (opts.incluirMedia) line.push(r.media === null || r.media === undefined ? "Dados insuficientes" : formatQty(r.media));
    return line;
  });

  autoTable(doc, {
    head: [head],
    body: body.length ? body : [["Nenhum produto encontrado", "—", "—", ...(opts.incluirMedia ? ["—"] : [])]],
    startY: opts.modo === "consumo" ? cursorY + 3 : cursorY,
    margin: { top: hasPeriod ? 58 : 47, left: margin, right: margin, bottom: 23 },
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [225, 225, 225], lineWidth: 0.1, textColor: dark, valign: "middle" },
    headStyles: { fillColor: brown, textColor: 255, fontStyle: "bold", fontSize: 8, cellPadding: 2.8 },
    alternateRowStyles: { fillColor: [252, 249, 247] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 40 },
      2: { halign: "center", cellWidth: 34 },
      3: { halign: "right", cellWidth: 42 },
    },
    didDrawPage: () => { drawHeader(); },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
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
  numeroOrdemFornecimento?: string | null;
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
  if (opts.numeroOrdemFornecimento?.trim()) {
    doc.text(`Número da ordem de fornecimento: ${opts.numeroOrdemFornecimento.trim()}`, margin, 58);
    doc.text(`Unidade de destino: ${opts.unidade}`, margin, 65);
    doc.text(`Data do lançamento: ${formatDate(opts.data)}`, pageW - margin, 65, { align: "right" });
  } else {
    doc.text(`Unidade de destino: ${opts.unidade}`, margin, 58);
    doc.text(`Data do lançamento: ${formatDate(opts.data)}`, pageW - margin, 58, { align: "right" });
  }
  doc.text(`Data do lançamento: ${formatDate(opts.data)}`, pageW - margin, 58, { align: "right" });

  autoTable(doc, {
    head: [["Produto", "Quantidade", "Unidade de medida"]],
    body: opts.rows.map((r) => [r.produto, formatQty(Number(r.quantidade)), r.medida || "—"]),
    startY: opts.numeroOrdemFornecimento?.trim() ? 73 : 66,
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

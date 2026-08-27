import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatQty, slugify } from "./format";

export type InventoryRow = {
  categoria: string;
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
  incluirMedia?: boolean;
  rows: InventoryRow[];
  assinatura?: boolean;
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

  const logo = opts.logoUrl ? await loadLogo(opts.logoUrl) : null;
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
    doc.setTextColor(20, 55, 45);
    doc.text(opts.instituicao.toUpperCase(), x, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(70);
    doc.text(opts.secretaria, x, 20.5);

    doc.setDrawColor(200);
    doc.line(margin, 27, pageW - margin, 27);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.setTextColor(20, 55, 45);
    doc.text(opts.titulo.toUpperCase(), pageW / 2, 34.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text(`Unidade: ${opts.unidade}`, margin, 42);
    doc.text(`Data da última conferência: ${dataConf}`, pageW - margin, 42, { align: "right" });
  };

  const head = ["Categoria", "Produto", "Unidade de medida", "Estoque aproximado"];
  if (opts.incluirMedia) head.push("Média de consumo mensal");

  const body = opts.rows.map((r) => {
    const line = [r.categoria, r.produto, r.medida, formatQty(r.estoque)];
    if (opts.incluirMedia) {
      line.push(r.media === null || r.media === undefined ? "Dados insuficientes" : formatQty(r.media));
    }
    return line;
  });

  autoTable(doc, {
    head: [head],
    body: body.length ? body : [["—", "Nenhum produto encontrado", "—", "—", ...(opts.incluirMedia ? ["—"] : [])]],
    startY: 47,
    margin: { top: 47, left: margin, right: margin, bottom: 22 },
    styles: { fontSize: 9, cellPadding: 2.2, lineColor: [215, 220, 216], lineWidth: 0.1 },
    headStyles: { fillColor: [31, 78, 66], textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [246, 249, 247] },
    columnStyles: {
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 34 },
    },
    didDrawPage: () => {
      drawHeader();
    },
  });

  // Assinatura
  if (opts.assinatura !== false) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let y = ((doc as any).lastAutoTable?.finalY ?? 60) + 16;
    if (y > pageH - 60) {
      doc.addPage();
      drawHeader();
      y = 55;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 55, 45);
    doc.text("RESPONSÁVEL PELA CONFERÊNCIA", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text("Nome: __________________________________________", margin, y + 14);
    doc.text("Assinatura: ______________________________________", margin, y + 30);
    doc.text("Data: ______ / ______ / __________", margin, y + 46);
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(210);
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

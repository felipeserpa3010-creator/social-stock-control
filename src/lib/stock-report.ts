import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import headerAsset from "@/assets/timbrado-cabecalho.jpg.asset.json";
import footerAsset from "@/assets/timbrado-rodape.jpg.asset.json";
import { formatDate, formatQty } from "./format";
import type { ReportOptions } from "./pdf";

async function loadLetterhead(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar o timbrado. Tente gerar o relatório novamente.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o timbrado."));
    reader.readAsDataURL(blob);
  });
}

/** Official letterhead is drawn before the table on every page. */
export async function buildStockReport(opts: ReportOptions) {
  const [header, footer] = await Promise.all([
    loadLetterhead(headerAsset.url),
    loadLetterhead(footerAsset.url),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 18;
  const brown: [number, number, number] = [125, 38, 11];
  const date = formatDate(opts.dataConferencia || new Date().toISOString().slice(0, 10));
  const tableHead = ["Produto", "Estoque aproximado", "Unidade de medida"];
  if (opts.estoqueAtualEmBranco) tableHead.push("Estoque atual");
  const rows = opts.rows.map((row) => [
    row.produto, formatQty(row.estoque), row.medida,
    ...(opts.estoqueAtualEmBranco ? [""] : []),
  ]);

  autoTable(doc, {
    head: [tableHead],
    body: rows.length ? rows : [["Nenhum produto encontrado", "—", "—", ...(opts.estoqueAtualEmBranco ? [""] : [])]],
    startY: 49,
    margin: { top: 31, bottom: 46, left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, textColor: [42, 42, 42], lineColor: [233, 227, 224], lineWidth: 0.1, valign: "middle" },
    headStyles: { fillColor: brown, textColor: 255, fontStyle: "bold", cellPadding: 2 },
    alternateRowStyles: { fillColor: [247, 243, 241] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 48, halign: "right" },
      2: { cellWidth: 46, halign: "center" },
      ...(opts.estoqueAtualEmBranco ? { 3: { cellWidth: 48, halign: "center" as const } } : {}),
    },
    rowPageBreak: "avoid",
    willDrawPage: ({ pageNumber }) => {
      const headerWidth = 62;
      doc.addImage(header, "JPEG", (width - headerWidth) / 2, 10, headerWidth, headerWidth * 125 / 525, "official-header");
      const footerWidth = 171;
      doc.addImage(footer, "JPEG", (width - footerWidth) / 2, height - 42, footerWidth, footerWidth * 245 / 1430, "official-footer");
      if (pageNumber !== 1) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...brown);
      const titleLines = doc.splitTextToSize(opts.titulo.toUpperCase(), width - margin * 2);
      doc.text(titleLines, width / 2, 36, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(42, 42, 42);
      const subtitle = `${opts.unidade} · ${opts.rows.length} produtos · Emitido em ${date}`;
      doc.text(doc.splitTextToSize(subtitle, width - margin * 2), width / 2, 43, { align: "center" });
    },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...brown);
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 44, { align: "right" });
  }
  return doc;
}
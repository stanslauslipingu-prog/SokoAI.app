
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import { translations } from '../lib/translations';
import { sanitizeElementColors } from '../lib/colors';

interface BusinessReport {
  picha_kubwa: string;
  namba_muhimu: {
    mauzo: number;
    gharama: number;
    faida: number;
    faida_asilimia: number;
    bidhaa_bora: string;
    tatizo_kuu: string;
  };
  insights: string[];
  mapendekezo: { hatua: string; gharama: string; faida: string }[];
  onyo: string;
  data_graph: any[];
  data_pie?: { name: string; thamani: number; fill: string }[];
  data_profit_trend?: { siku: string; faida: number }[];
  forecast?: number[];
  ledger?: { date: string; desc: string; debit: number; credit: number }[];
}

export async function exportToDocx(report: BusinessReport, language: string, graphImage?: string) {
  try {
    const t = translations[language as keyof typeof translations];
    
    const children: any[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: t.reportTitlePdf || "SOKOAI - RIPOTI YA BIASHARA",
            bold: true,
            size: 32,
            color: "10b981",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `${t.date}: ${new Date().toLocaleDateString()}`, bold: true }),
        ],
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: t.pichaKubwa, bold: true, size: 24 }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: report.picha_kubwa,
        spacing: { after: 400 },
      }),
    ];

    if (graphImage) {
      const base64Data = graphImage.split(',')[1];
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
              transformation: {
                width: 550,
                height: 350,
              },
              type: "png",
            } as any),
          ],
          spacing: { before: 400, after: 400 },
          alignment: AlignmentType.CENTER,
        })
      );
    }

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "UCHAMBUZI WA NAMBA", bold: true, size: 24 }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph(`• ${t.stats.sales}: TSh ${report.namba_muhimu.mauzo.toLocaleString()}`),
      new Paragraph(`• ${t.cost}: TSh ${report.namba_muhimu.gharama.toLocaleString()}`),
      new Paragraph(`• ${t.stats.profit}: TSh ${report.namba_muhimu.faida.toLocaleString()} (${report.namba_muhimu.faida_asilimia}%)`),
      new Paragraph(`• ${t.stats.bestSeller}: ${report.namba_muhimu.bidhaa_bora}`),
      new Paragraph({
        children: [
          new TextRun({ text: `${t.tatizoTitle}: ${report.namba_muhimu.tatizo_kuu}`, bold: true, color: "ef4444" }),
        ],
        spacing: { before: 200, after: 400 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: t.insightsTitle, bold: true, size: 24 }),
        ],
        spacing: { after: 200 },
      }),
      ...report.insights.map(insight => new Paragraph({ text: `• ${insight}`, bullet: { level: 0 } })),
      new Paragraph({
        children: [
          new TextRun({ text: t.recommendationsTitle, bold: true, size: 24 }),
        ],
        spacing: { before: 400, after: 200 },
      }),
      ...report.mapendekezo.map(rec => new Paragraph({ 
        children: [
          new TextRun({ text: `• ${rec.hatua}`, bold: true }),
          new TextRun({ text: ` (${t.cost}: ${rec.gharama}, ${t.potentialBenefit}: ${rec.faida})` }),
        ],
        bullet: { level: 0 } 
      })),
      new Paragraph({
        children: [
          new TextRun({
            text: report.onyo,
            italics: true,
            color: "f59e0b",
          }),
        ],
        spacing: { before: 600 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: t.reportFooter,
            size: 16,
            color: "64748b",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 800 },
      })
    );

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `SokoAI_Ripoti_${new Date().getTime()}.docx`);
  } catch (error) {
    console.error("DOCX generation failed:", error);
  }
}

export async function exportToExcel(report: BusinessReport, language: string, graphImage?: string) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('SokoAI Analysis');

    sheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 50 }
    ];

    sheet.addRow(['REPORT SUMMARY']);
    sheet.addRow(['Date', new Date().toLocaleDateString()]);
    sheet.addRow([]);
    sheet.addRow(['KEY BUSINESS METRICS']);
    sheet.addRow(['Sales (Mauzo)', report.namba_muhimu.mauzo]);
    sheet.addRow(['Expenses (Gharama)', report.namba_muhimu.gharama]);
    sheet.addRow(['Net Profit (Faida)', report.namba_muhimu.faida]);
    sheet.addRow(['Profit Margin (%)', report.namba_muhimu.faida_asilimia]);
    sheet.addRow(['Top Product', report.namba_muhimu.bidhaa_bora]);
    sheet.addRow(['Top Issue', report.namba_muhimu.tatizo_kuu]);
    sheet.addRow([]);

    if (report.ledger && report.ledger.length > 0) {
      sheet.addRow(['LEDGER / FINANCIAL DATA']);
      sheet.addRow(['Date', 'Description', 'Debit', 'Credit']);
      report.ledger.forEach(item => {
        sheet.addRow([item.date, item.desc, item.debit, item.credit]);
      });
      sheet.addRow([]);
    }

    if (graphImage) {
      const imageId = workbook.addImage({
        base64: graphImage.split(',')[1],
        extension: 'png',
      });
      sheet.addImage(imageId, {
        tl: { col: 4, row: 1 },
        ext: { width: 600, height: 400 }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `SokoAI_Business_Data_${new Date().getTime()}.xlsx`);
  } catch (error) {
    console.error("Excel export failed:", error);
  }
}

export async function exportToPdf(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found for PDF export:", elementId);
    return;
  }

  try {
    // Temporarily ensure element is visible for capture if it's the hidden one
    const originalStyle = element.style.cssText;
    if (elementId === "report-capture-root-pdf") {
      element.style.position = 'fixed';
      element.style.left = '0';
      element.style.top = '0';
      element.style.zIndex = '-9999';
      element.style.pointerEvents = 'none';
      element.style.visibility = 'visible';
      element.style.display = 'block';
      element.style.width = '794px'; // Exactly 210mm (A4 width) in pixels at standard 96dpi
      element.style.backgroundColor = '#ffffff';
    }

    // Give browser and Recharts a brief moment to stabilize, parse size, and lay out
    await new Promise(resolve => setTimeout(resolve, 2000));

    const canvas = await html2canvas(element, {
      scale: 2, // High quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 794, // Lock capture width matching A4 bounds
      windowHeight: element.scrollHeight || 1123,
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById(elementId);
        if (clonedEl) {
          sanitizeElementColors(clonedEl);
          clonedEl.style.backgroundColor = '#ffffff';
          clonedEl.style.width = '794px';
        }
      }
    });

    // Reset style
    element.style.cssText = originalStyle;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    let heightLeft = imgHeight;
    let position = 0;

    // First page
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pdfHeight;

    // Subsequent pages
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;
    }

    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  }
}

export async function exportToPng(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc) => {
      const clonedEl = clonedDoc.getElementById(elementId);
      if (clonedEl) {
        sanitizeElementColors(clonedEl);
        clonedEl.style.backgroundColor = '#ffffff';
      }
    }
  });

  canvas.toBlob((blob) => {
    if (blob) {
      saveAs(blob, `${filename}.png`);
    }
  });
}

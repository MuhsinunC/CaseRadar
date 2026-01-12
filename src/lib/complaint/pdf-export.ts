/**
 * PDF Export
 * Generates PDF documents from legal complaints
 */

import jsPDF from 'jspdf';
import type {
  GeneratedComplaint,
  PDFOptions,
  PDFDocument,
  PDFResult,
  FormattedPDF,
  PDFPage,
} from './types';

// Re-export types
export type { GeneratedComplaint, PDFOptions, PDFDocument, PDFResult, FormattedPDF, PDFPage };

// Default PDF options (legal document standards)
const DEFAULT_OPTIONS: Required<PDFOptions> = {
  fontSize: 12,
  fontFamily: 'Times',
  lineSpacing: 2, // Double-spaced
  margins: {
    top: 72, // 1 inch in points
    right: 72,
    bottom: 72,
    left: 72,
  },
};

// Letter size in points (8.5" x 11")
const PAGE_SIZE = {
  width: 612,
  height: 792,
};

/**
 * Format complaint for PDF output
 */
export function formatForPDF(complaint: GeneratedComplaint): FormattedPDF {
  const pages: PDFPage[] = [];
  let pageNumber = 1;

  // Combine all sections in order
  const fullContent = [
    complaint.sections.caption,
    '',
    'INTRODUCTION',
    '',
    complaint.sections.introduction,
    '',
    complaint.sections.jurisdiction,
    '',
    complaint.sections.parties,
    '',
    complaint.sections.factualAllegations,
    '',
    complaint.sections.classAllegations,
    '',
    complaint.sections.causesOfAction,
    '',
    complaint.sections.prayerForRelief,
    '',
    complaint.sections.juryDemand,
    '',
    complaint.sections.signature,
  ].join('\n');

  // Split into pages (rough estimate - actual pagination handled by jsPDF)
  const linesPerPage = 50; // Approximate with double spacing
  const lines = fullContent.split('\n');

  for (let i = 0; i < lines.length; i += linesPerPage) {
    const pageLines = lines.slice(i, i + linesPerPage);
    pages.push({
      content: pageLines.join('\n'),
      pageNumber: pageNumber++,
    });
  }

  return {
    pages,
    header: complaint.disclaimer,
    footer: 'Page {pageNumber}',
    includePageNumbers: true,
  };
}

/**
 * Create PDF document from complaint
 */
export async function createPDFDocument(
  complaint: GeneratedComplaint,
  options: PDFOptions = {}
): Promise<PDFDocument> {
  const opts: Required<PDFOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    margins: {
      ...DEFAULT_OPTIONS.margins,
      ...options.margins,
    },
  };

  // Create new PDF document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  // Set font
  doc.setFont(opts.fontFamily, 'normal');
  doc.setFontSize(opts.fontSize);

  // Calculate text area dimensions
  const textWidth = PAGE_SIZE.width - opts.margins.left - opts.margins.right;
  const textHeight = PAGE_SIZE.height - opts.margins.top - opts.margins.bottom;
  const lineHeight = opts.fontSize * opts.lineSpacing;

  let currentY = opts.margins.top;
  let pageNum = 1;

  // Add draft disclaimer header on first page
  doc.setFontSize(10);
  doc.setFont(opts.fontFamily, 'italic');
  const disclaimerLines = doc.splitTextToSize(complaint.disclaimer, textWidth);
  doc.text(disclaimerLines, opts.margins.left, 36);
  doc.setFont(opts.fontFamily, 'normal');
  doc.setFontSize(opts.fontSize);

  // Helper function to add text with pagination
  const addText = (text: string) => {
    const lines = doc.splitTextToSize(text, textWidth);

    for (const line of lines) {
      if (currentY + lineHeight > PAGE_SIZE.height - opts.margins.bottom) {
        // Add page number to current page
        doc.setFontSize(10);
        doc.text(String(pageNum), PAGE_SIZE.width / 2, PAGE_SIZE.height - 36, { align: 'center' });
        doc.setFontSize(opts.fontSize);

        // Add new page
        doc.addPage();
        pageNum++;
        currentY = opts.margins.top;
      }

      doc.text(line, opts.margins.left, currentY);
      currentY += lineHeight;
    }
  };

  // Add blank line helper
  const addBlankLine = () => {
    currentY += lineHeight;
  };

  // Generate content section by section
  const sections = [
    complaint.sections.caption,
    '\nINTRODUCTION\n',
    complaint.sections.introduction,
    '\n' + complaint.sections.jurisdiction,
    '\n' + complaint.sections.parties,
    '\n' + complaint.sections.factualAllegations,
    '\n' + complaint.sections.classAllegations,
    '\n' + complaint.sections.causesOfAction,
    '\n' + complaint.sections.prayerForRelief,
    '\n' + complaint.sections.juryDemand,
    '\n' + complaint.sections.signature,
  ];

  for (const section of sections) {
    // Handle section breaks with extra spacing
    if (section.startsWith('\n')) {
      addBlankLine();
      addText(section.slice(1));
    } else {
      addText(section);
    }
    addBlankLine();
  }

  // Add page number to last page
  doc.setFontSize(10);
  doc.text(String(pageNum), PAGE_SIZE.width / 2, PAGE_SIZE.height - 36, { align: 'center' });

  // Get PDF as ArrayBuffer
  const buffer = doc.output('arraybuffer');

  return {
    buffer,
    pageSize: PAGE_SIZE,
    options: opts,
    metadata: {
      title: `Class Action Complaint - ${complaint.metadata.patternId || 'Draft'}`,
      author: 'CaseRadar',
      subject: 'Class Action Complaint',
      createdAt: complaint.metadata.generatedAt,
    },
  };
}

/**
 * Generate downloadable PDF
 */
export async function generatePDF(complaint: GeneratedComplaint): Promise<PDFResult> {
  const pdfDoc = await createPDFDocument(complaint);

  // Generate unique filename
  const timestamp = Date.now();
  const patternId = complaint.metadata.patternId || 'draft';
  const filename = `complaint-${patternId}-${timestamp}.pdf`;

  // Create Blob from ArrayBuffer
  const blob = new Blob([pdfDoc.buffer], { type: 'application/pdf' });

  return {
    filename,
    blob,
    size: pdfDoc.buffer.byteLength,
  };
}

/**
 * Download PDF in browser
 */
export function downloadPDF(result: PDFResult): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate PDF and return as base64 string
 */
export async function generatePDFBase64(complaint: GeneratedComplaint): Promise<string> {
  const pdfDoc = await createPDFDocument(complaint);
  const bytes = new Uint8Array(pdfDoc.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

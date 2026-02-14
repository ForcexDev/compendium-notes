import jsPDF from 'jspdf';
import type { PdfStyle } from './store';

interface PdfOptions {
    title: string;
    date: string;
    duration?: string;
    content: string;
    style: PdfStyle;
}

interface StyleConfig {
    fontTitle: string;
    fontBody: string;
    primaryColor: [number, number, number];
    accentColor: [number, number, number];
    headerBg: boolean;
    headerColor?: [number, number, number];
    lineSeparator?: boolean;
    leftColumn?: boolean;
}

// Config per style
const STYLES: Record<PdfStyle, StyleConfig> = {
    minimalista: {
        fontTitle: 'helvetica',
        fontBody: 'helvetica',
        primaryColor: [0, 0, 0],   // Black
        accentColor: [50, 50, 50], // Dark Gray
        headerBg: false,
    },
    academico: {
        fontTitle: 'times',
        fontBody: 'times',
        primaryColor: [0, 51, 102],
        accentColor: [150, 150, 150],
        headerBg: false,
        lineSeparator: true,
    },
    cornell: {
        fontTitle: 'helvetica',
        fontBody: 'helvetica',
        primaryColor: [0, 0, 0],
        accentColor: [60, 60, 60],
        leftColumn: true,
        headerBg: true,
        headerColor: [240, 240, 240],
    }
};

function parseMarkdownSections(content: string) {
    const lines = content.split('\n');
    const sections: { type: 'h1' | 'h2' | 'h3' | 'p' | 'list' | 'quote'; text: string }[] = [];

    let listBuffer: string[] = [];

    const flushList = () => {
        if (listBuffer.length > 0) {
            sections.push({ type: 'list', text: listBuffer.join('\n') });
            listBuffer = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            flushList();
            continue;
        }

        if (trimmed.startsWith('## ')) {
            flushList();
            sections.push({ type: 'h2', text: trimmed.replace('## ', '') });
        } else if (trimmed.startsWith('### ')) {
            flushList();
            sections.push({ type: 'h3', text: trimmed.replace('### ', '') });
        } else if (trimmed.startsWith('# ')) {
            flushList();
            sections.push({ type: 'h1', text: trimmed.replace('# ', '') });
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            listBuffer.push(trimmed.replace(/^[-•] /, ''));
        } else if (trimmed.startsWith('> ')) {
            flushList();
            sections.push({ type: 'quote', text: trimmed.replace('> ', '') });
        } else {
            flushList();
            sections.push({ type: 'p', text: trimmed });
        }
    }
    flushList();
    return sections;
}

function cleanText(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .trim();
}

export function generatePdf(options: PdfOptions, action: 'save' | 'blob' = 'save'): string | void {
    const { title, date, duration, content, style } = options;
    const config = STYLES[style] || STYLES.minimalista;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    // Set PDF Metadata
    doc.setProperties({
        title: title,
        subject: 'Smart Class Notes',
        author: 'Smart Class Notes',
        creator: 'Smart Class Notes'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // Fonts & Colors setup
    doc.setFont(config.fontBody, 'normal');

    const checkPageBreak = (needed: number) => {
        if (y + needed > pageHeight - 20) {
            doc.addPage();
            y = margin;
            if (options.style === 'cornell' && config.leftColumn) {
                // Draw vertical line for Cornell on new page
                doc.setDrawColor(200, 200, 200);
                doc.line(margin + 50, margin, margin + 50, pageHeight - margin);
            }
        }
    };

    // ===== HEADER =====
    if (config.headerBg && style === 'cornell') {
        doc.setFillColor(...config.headerColor!);
        doc.rect(0, 0, pageWidth, 50, 'F'); // Aumentado de 40 a 50 para dar aire
        y = 15;
    }

    // Title
    doc.setFont(config.fontTitle, 'bold');
    doc.setFontSize(style === 'academico' ? 20 : 24);
    doc.setTextColor(...config.primaryColor);

    const titleLines = doc.splitTextToSize(title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 8 + 4;

    // Metadata
    doc.setFont(config.fontBody, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...config.accentColor);

    let metaText = `${date}`;
    if (duration) metaText += `  •  ${duration}`;
    metaText += `  •  Smart Class Notes`;

    doc.text(metaText, margin, y);
    y += 6; // Reducido de 10 a 6

    // Separator
    if (config.lineSeparator || style === 'minimalista') {
        doc.setDrawColor(...config.primaryColor);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8; // Reducido de 10 a 8
    } else {
        y += 5;
    }

    // Cornell: Ensure content starts below the gray header
    if (style === 'cornell' && y < 55) {
        y = 55;
    }

    // Cornell Vertical Line (Left Column)
    if (style === 'cornell') {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        // Start from current Y to bottom
        doc.line(margin + 50, y, margin + 50, pageHeight - margin);
    }

    // ===== CONTENT =====
    const sections = parseMarkdownSections(content);

    for (const section of sections) {
        const text = cleanText(section.text);

        let xPos = margin;
        let maxWidth = contentWidth;

        // Cornell Layout Logic
        if (style === 'cornell') {
            if (section.type === 'h2' || section.type === 'h3') {
                // Headers go in left column (Cue Column)
                maxWidth = 45;
                checkPageBreak(20);
            } else {
                // Content goes in right column (Note Taking Area)
                xPos = margin + 55; // 20 + 50 + 5 padding
                maxWidth = contentWidth - 55;
            }
        }

        if (section.type === 'h1' || section.type === 'h2') {
            checkPageBreak(20);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...config.primaryColor);
            const lines = doc.splitTextToSize(text, maxWidth);
            doc.text(lines, xPos, y);
            y += lines.length * 6 + 4;
        }
        else if (section.type === 'h3') {
            checkPageBreak(15);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...(style === 'minimalista' ? [50, 50, 50] : config.primaryColor) as [number, number, number]);
            const lines = doc.splitTextToSize(text, maxWidth);
            doc.text(lines, xPos, y);
            y += lines.length * 5 + 3;
        }
        else if (section.type === 'list') {
            doc.setFont(config.fontBody, 'normal');
            doc.setFontSize(10);
            doc.setTextColor(20, 20, 20);

            const items = text.split('\n');
            for (const item of items) {
                const bullet = '•';
                const itemLines = doc.splitTextToSize(item, maxWidth - 5);
                checkPageBreak(itemLines.length * 5 + 2);

                doc.text(bullet, xPos, y);
                doc.text(itemLines, xPos + 5, y);
                y += itemLines.length * 5 + 2;
            }
            y += 2;
        }
        else if (section.type === 'quote') {
            checkPageBreak(20);
            const lines = doc.splitTextToSize(text, maxWidth - 10);

            // Draw gray bar
            doc.setFillColor(245, 245, 245);
            doc.rect(xPos, y - 4, maxWidth, (lines.length * 5) + 8, 'F');
            doc.setDrawColor(...config.primaryColor);
            doc.setLineWidth(1);
            doc.line(xPos, y - 4, xPos, y + (lines.length * 5) + 4);

            doc.setFont(config.fontBody, 'italic');
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            doc.text(lines, xPos + 5, y);
            y += lines.length * 5 + 8;
        }
        else {
            // Paragraph
            doc.setFont(config.fontBody, 'normal');
            doc.setFontSize(10);
            doc.setTextColor(40, 40, 40);
            const lines = doc.splitTextToSize(text, maxWidth);
            checkPageBreak(lines.length * 5 + 2);
            doc.text(lines, xPos, y);
            y += lines.length * 5 + 4;

            // Logic to reset Cornell alignment if previous was a header in left col
            if (style === 'cornell' && xPos === margin) {
                // If we printed text in left, move Y down, but usually params are rights
                // Actually standard Cornell: Headers left, Notes right.
                // So if we just printed a header, Y increased. Next paragraph goes to right.
                // We need to keep Y aligned?
                // Simple implementation: Just sequential.
                // Improved Cornell: If H2/H3, save Y, print. Next P, print at Saved Y?
                // For now simple sequential is fine to avoid overlapping logic complexity.
            }
        }
    }

    // Page Numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }

    if (action === 'blob') {
        const blobUrl = doc.output('bloburl').toString();
        const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
        // Add filename hint for some browsers
        return `${blobUrl}#filename=${safeTitle}.pdf`;
    } else {
        const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
        doc.save(`${safeTitle}.pdf`);
    }
}

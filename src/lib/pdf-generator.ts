import jsPDF from 'jspdf';
import type { PdfStyle } from './store';
import { t, type Locale } from './i18n';

interface PdfOptions {
    title: string;
    date: string;
    duration?: string;
    content: string;
    style: PdfStyle;
    locale: Locale;
}

interface StyleConfig {
    fontTitle: string;
    fontBody: string;
    primaryColor: [number, number, number];
    accentColor: [number, number, number];
    metaColor: [number, number, number];
    headerBg: boolean;
    headerColor?: [number, number, number];
    lineSeparator?: boolean;
    leftColumn?: boolean;
}

// Configuración profesional con fuentes distintas
const STYLES: Record<PdfStyle, StyleConfig> = {
    minimalista: {
        fontTitle: 'helvetica',
        fontBody: 'helvetica',
        primaryColor: [0, 0, 0],
        accentColor: [100, 100, 100],
        metaColor: [140, 140, 140],
        headerBg: false,
    },
    academico: {
        fontTitle: 'times',
        fontBody: 'times',
        primaryColor: [0, 51, 102],
        accentColor: [100, 100, 100],
        metaColor: [130, 130, 130],
        headerBg: false,
        lineSeparator: true,  // Activada para separar título de resumen
    },
    cornell: {
        fontTitle: 'helvetica',  // Helvetica es más moderna y legible que Courier
        fontBody: 'helvetica',
        primaryColor: [17, 24, 39],
        accentColor: [55, 65, 81],
        metaColor: [107, 114, 128],
        leftColumn: true,
        headerBg: true,
        headerColor: [249, 250, 251],
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

// Función para procesar texto con negritas
function renderTextWithBold(
    doc: any,
    text: string,
    font: string,
    xPos: number,
    state: { y: number },
    maxWidth: number,
    style: string,
    checkPageBreak: (needed: number) => void
): void {
    const lineHeight = style === 'academico' ? 5.5 : 5;
    let currentX = xPos;

    // Dividir por negritas
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    for (const part of parts) {
        if (!part) continue;

        if (part.startsWith('**') && part.endsWith('**')) {
            // Texto en negrita
            const boldText = part.replace(/\*\*/g, '');
            doc.setFont(font, 'bold');

            const words = boldText.split(' ');
            for (const word of words) {
                if (!word) continue;
                const wordWidth = doc.getTextWidth(word + ' ');

                if (currentX + wordWidth > xPos + maxWidth && currentX > xPos) {
                    state.y += lineHeight;
                    currentX = xPos;
                    checkPageBreak(lineHeight);
                }

                doc.text(word + ' ', currentX, state.y);
                currentX += wordWidth;
            }
        } else {
            // Texto normal
            doc.setFont(font, 'normal');

            const words = part.split(' ');
            for (const word of words) {
                if (!word) continue;
                const wordWidth = doc.getTextWidth(word + ' ');

                if (currentX + wordWidth > xPos + maxWidth && currentX > xPos) {
                    state.y += lineHeight;
                    currentX = xPos;
                    checkPageBreak(lineHeight);
                }

                doc.text(word + ' ', currentX, state.y);
                currentX += wordWidth;
            }
        }
    }
}

export function generatePdf(options: PdfOptions, action: 'save' | 'blob' = 'save'): string | void {
    const { title, date, duration, content, style } = options;
    const config = STYLES[style] || STYLES.minimalista;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    doc.setProperties({
        title: title,
        subject: 'CompendiumNotes',
        author: 'CompendiumNotes',
        creator: 'CompendiumNotes'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPageBreak = (needed: number) => {
        if (y + needed > pageHeight - 20) {
            doc.addPage();
            y = margin;
            if (style === 'cornell' && config.leftColumn) {
                doc.setDrawColor(209, 213, 219);
                doc.setLineWidth(0.3);
                doc.line(margin + 50, margin, margin + 50, pageHeight - margin);
            }
        }
    };

    // ===== HEADER =====
    if (config.headerBg && style === 'cornell') {
        doc.setFillColor(...config.headerColor!);
        doc.rect(0, 0, pageWidth, 55, 'F');
        y = 16;
    }

    // Title
    doc.setFont(config.fontTitle, 'bold');
    doc.setFontSize(style === 'academico' ? 22 : style === 'cornell' ? 26 : 24);
    doc.setTextColor(...config.primaryColor);

    const titleLines = doc.splitTextToSize(title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * (style === 'academico' ? 8.5 : 10) + 3;

    // Metadata
    doc.setFont(config.fontBody, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...config.metaColor);

    let metaText = `${date}`;
    if (duration) metaText += `  •  ${duration}`;
    metaText += `  •  Compendium Notes`;

    doc.text(metaText, margin, y);
    y += 5;

    // Separator
    if (config.lineSeparator) {
        doc.setDrawColor(...config.primaryColor);
        doc.setLineWidth(0.6);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
    } else if (style === 'minimalista') {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.4);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
    } else {
        y += 8;
    }

    // Cornell: Ajustar Y
    if (style === 'cornell' && y < 60) {
        y = 60;
    }

    // Cornell Vertical Line
    if (style === 'cornell') {
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.3);
        doc.line(margin + 50, y, margin + 50, pageHeight - margin);
    }

    // ===== CONTENT =====
    const sections = parseMarkdownSections(content);
    const state = { y };

    const checkPageBreakRef = (needed: number) => {
        if (state.y + needed > pageHeight - 20) {
            doc.addPage();
            state.y = margin;
            if (style === 'cornell' && config.leftColumn) {
                doc.setDrawColor(209, 213, 219);
                doc.setLineWidth(0.3);
                doc.line(margin + 50, margin, margin + 50, pageHeight - margin);
            }
        }
    };

    for (const section of sections) {
        const text = section.text;

        let xPos = margin;
        let maxWidth = contentWidth;

        // Cornell Layout
        if (style === 'cornell') {
            if (section.type === 'h2' || section.type === 'h3') {
                maxWidth = 45;
                checkPageBreakRef(20);
            } else {
                xPos = margin + 55;
                maxWidth = contentWidth - 55;
            }
        }

        if (section.type === 'h1') {
            checkPageBreakRef(20);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(style === 'academico' ? 16 : 18);
            doc.setTextColor(...config.primaryColor);

            const cleanText = text.replace(/\*\*/g, '');
            const lines = doc.splitTextToSize(cleanText, maxWidth);
            doc.text(lines, xPos, state.y);
            state.y += lines.length * 7 + 6;
        }
        else if (section.type === 'h2') {
            checkPageBreakRef(18);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(style === 'academico' ? 14 : style === 'cornell' ? 11 : 13);
            doc.setTextColor(...config.primaryColor);

            const cleanText = text.replace(/\*\*/g, '');
            const lines = doc.splitTextToSize(cleanText, maxWidth);
            doc.text(lines, xPos, state.y);
            state.y += lines.length * (style === 'cornell' ? 4.5 : 5.5) + 5;
        }
        else if (section.type === 'h3') {
            checkPageBreakRef(15);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(style === 'academico' ? 12 : style === 'cornell' ? 10 : 11);
            doc.setTextColor(...(style === 'cornell' ? config.accentColor : config.primaryColor) as [number, number, number]);

            const cleanText = text.replace(/\*\*/g, '');
            const lines = doc.splitTextToSize(cleanText, maxWidth);
            doc.text(lines, xPos, state.y);
            state.y += lines.length * (style === 'cornell' ? 4 : 5) + 4;
        }
        else if (section.type === 'list') {
            doc.setFont(config.fontBody, 'normal');
            doc.setFontSize(style === 'academico' ? 11 : 10);
            doc.setTextColor(40, 40, 40);

            const items = text.split('\n');
            for (const item of items) {
                if (!item.trim()) continue;

                checkPageBreakRef(10);

                const bullet = '•';
                doc.text(bullet, xPos, state.y);

                // Procesar negritas en el item
                renderTextWithBold(doc, item, config.fontBody, xPos + 6, state, maxWidth - 6, style, checkPageBreakRef);
                state.y += (style === 'academico' ? 5.5 : 5) + 3;
            }
            state.y += 3;
        }
        else if (section.type === 'quote') {
            checkPageBreakRef(15);
            const cleanText = text.replace(/\*\*/g, '');
            const lines = doc.splitTextToSize(cleanText, maxWidth - 10);

            // Empezamos bloque de cita
            doc.setFont(config.fontBody, 'italic');
            doc.setFontSize(10);
            doc.setTextColor(70, 70, 70);

            for (const line of lines) {
                checkPageBreakRef(6);

                // Dibujar fondo y sidebar para cada línea (más seguro)
                doc.setFillColor(248, 248, 248);
                doc.rect(xPos, state.y - 4, maxWidth, 6.5, 'F');
                doc.setDrawColor(...config.primaryColor);
                doc.setLineWidth(1.2);
                doc.line(xPos, state.y - 4, xPos, state.y + 2.5);

                doc.text(line, xPos + 6, state.y);
                state.y += 5;
            }
            state.y += 4;
        }
        else {
            // Paragraph con negritas
            doc.setFont(config.fontBody, 'normal');
            doc.setFontSize(style === 'academico' ? 11 : 10);
            doc.setTextColor(50, 50, 50);

            checkPageBreakRef(10);

            renderTextWithBold(doc, text, config.fontBody, xPos, state, maxWidth, style, checkPageBreakRef);
            state.y += (style === 'academico' ? 5.5 : 5) + 4;
        }
    }

    // Page Numbers
    const totalPages = doc.getNumberOfPages();
    const pageLabel = t('pdf.page', options.locale);
    const ofLabel = t('pdf.of', options.locale);

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text(`${pageLabel} ${i} ${ofLabel} ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }

    if (action === 'blob') {
        const blobUrl = doc.output('bloburl').toString();
        const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
        return `${blobUrl}#filename=${safeTitle}.pdf`;
    } else {
        const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
        doc.save(`${safeTitle}.pdf`);
    }
}
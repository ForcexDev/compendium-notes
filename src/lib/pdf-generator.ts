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
        lineSeparator: true,
    },
    cornell: {
        fontTitle: 'helvetica',
        fontBody: 'helvetica',
        primaryColor: [17, 24, 39],
        accentColor: [55, 65, 81],
        metaColor: [107, 114, 128],
        leftColumn: true,
        headerBg: true,
        headerColor: [249, 250, 251],
    }
};

// ---------------------------------------------------------------------------
// Unicode detection
// jsPDF built-in fonts (Helvetica, Times, Courier) only cover Latin-1.
// Any script outside that range needs the html2canvas rendering path.
// Covers: Greek, Cyrillic, Hebrew, Arabic, Indic scripts, Thai/Lao,
//         Japanese, CJK, Korean, and misc Unicode blocks.
// ---------------------------------------------------------------------------
function requiresUnicodeRendering(text: string): boolean {
    return /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0700-\u08FF\u0900-\u09FF\u0A00-\u0DFF\u0E00-\u0FFF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(text);
}

// ---------------------------------------------------------------------------
// Shared markdown parser (used by both rendering paths)
// ---------------------------------------------------------------------------
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
        if (!trimmed) { flushList(); continue; }

        if (trimmed.startsWith('### ')) { flushList(); sections.push({ type: 'h3', text: trimmed.slice(4) }); }
        else if (trimmed.startsWith('## ')) { flushList(); sections.push({ type: 'h2', text: trimmed.slice(3) }); }
        else if (trimmed.startsWith('# ')) { flushList(); sections.push({ type: 'h1', text: trimmed.slice(2) }); }
        else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            listBuffer.push(trimmed.replace(/^[-•] /, ''));
        }
        else if (trimmed.startsWith('> ')) { flushList(); sections.push({ type: 'quote', text: trimmed.slice(2) }); }
        else { flushList(); sections.push({ type: 'p', text: trimmed }); }
    }
    flushList();
    return sections;
}

// ---------------------------------------------------------------------------
// Bold text renderer for the Latin jsPDF path
// ---------------------------------------------------------------------------
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
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    for (const part of parts) {
        if (!part) continue;
        const isBold = part.startsWith('**') && part.endsWith('**');
        const renderText = isBold ? part.replace(/\*\*/g, '') : part;
        doc.setFont(font, isBold ? 'bold' : 'normal');

        for (const word of renderText.split(' ')) {
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

// ---------------------------------------------------------------------------
// UNICODE PATH: html2canvas → jsPDF image
// Requires: npm install html2canvas
// ---------------------------------------------------------------------------
function buildHtmlForCanvas(options: PdfOptions): string {
    const { title, date, content, style } = options;
    const config = STYLES[style] || STYLES.minimalista;
    const primary = `rgb(${config.primaryColor.join(',')})`;
    const meta = `rgb(${config.metaColor.join(',')})`;
    const bodyTxt = '#2d2d2d';
    const quoteTx = '#555555';
    const quoteBg = '#f8f8f8';

    // System font stack with CJK/Arabic/Indic coverage
    const fontStack = style === 'academico'
        ? '"Georgia","Times New Roman",serif'
        : '"Noto Sans","Segoe UI","PingFang SC","Hiragino Sans","Malgun Gothic","Arial Unicode MS",system-ui,sans-serif';

    // word-wrap shorthand applied to every text element
    const ww = 'word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;';

    const h2Border = style === 'academico'
        ? `border-bottom:1px solid ${primary};padding-bottom:4px;` : '';

    const hrHtml = style !== 'cornell'
        ? `<div style="border-top:${style === 'academico' ? `1px solid ${primary}` : '0.5px solid #ccc'};margin:0 0 20px;"></div>`
        : '';

    const headerWrap = style === 'cornell'
        ? `background:rgb(${(config.headerColor || [249, 250, 251]).join(',')});padding:28px 40px 20px;margin:-40px -40px 28px;`
        : '';

    const titleFontSize = style === 'academico' ? '22px' : style === 'cornell' ? '26px' : '24px';

    const headerHtml =
        `<div style="${headerWrap}">` +
        `<div style="font-size:${titleFontSize};font-weight:700;color:${primary};line-height:1.25;margin-bottom:8px;${ww}">` +
        `${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` +
        `<div style="font-size:8.5px;color:${meta};margin-bottom:4px;">${date} • Compendium Notes</div>` +
        `</div>`;

    const sections = parseMarkdownSections(content);
    let bodyHtml = '';

    for (const section of sections) {
        const raw = section.text;
        const safe = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fmt = safe.replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:700;">$1</strong>`);
        const clean = raw.replace(/\*\*/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        switch (section.type) {
            case 'h1': bodyHtml += `<div style="font-size:18px;font-weight:700;color:${primary};margin:24px 0 10px;${ww}">${clean}</div>`; break;
            case 'h2': bodyHtml += `<div style="font-size:14px;font-weight:700;color:${primary};margin:20px 0 8px;${h2Border}${ww}">${clean}</div>`; break;
            case 'h3': bodyHtml += `<div style="font-size:11.5px;font-weight:700;color:${primary};margin:14px 0 6px;${ww}">${clean}</div>`; break;
            case 'p': bodyHtml += `<div style="font-size:10.5px;color:${bodyTxt};margin:0 0 10px;line-height:1.7;${ww}">${fmt}</div>`; break;
            case 'list': {
                const items = raw.split('\n').map(item => {
                    const s = item.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const f = s.replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:700;">$1</strong>`);
                    return `<div style="display:flex;gap:8px;margin:4px 0;">` +
                        `<span style="color:${bodyTxt};flex-shrink:0;margin-top:1px;">•</span>` +
                        `<span style="font-size:10.5px;color:${bodyTxt};line-height:1.7;${ww}">${f}</span></div>`;
                });
                bodyHtml += `<div style="margin:0 0 10px;">${items.join('')}</div>`;
                break;
            }
            case 'quote':
                bodyHtml += `<div style="border-left:3px solid ${primary};background:${quoteBg};padding:8px 12px;` +
                    `margin:0 0 10px;font-style:italic;color:${quoteTx};font-size:10px;line-height:1.7;${ww}">${fmt}</div>`;
                break;
        }
    }

    // The outer div is the exact "paper" — 794px wide, 40px padding all sides.
    // NO overflow:hidden here — content must be fully tall for html2canvas to capture everything.
    // Width is controlled by the fixed 794px + box-sizing:border-box.
    return `<div style="font-family:${fontStack};font-size:11px;color:${bodyTxt};background:#ffffff;` +
        `width:794px;max-width:794px;padding:40px;box-sizing:border-box;line-height:1.7;">` +
        `${headerHtml}${hrHtml}${bodyHtml}</div>`;
}

async function generatePdfViaCanvas(options: PdfOptions, action: 'save' | 'blob'): Promise<string | void> {
    const html2canvas = (await import('html2canvas')).default;

    // Use position:absolute (NOT fixed) so the element can grow taller than the viewport.
    // Append directly to body so html2canvas can measure the full natural height.
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;';
    container.innerHTML = buildHtmlForCanvas(options);
    document.body.appendChild(container);

    const target = container.firstElementChild as HTMLElement;

    try {
        const canvas = await html2canvas(target, {
            scale: 2,               // 2× → crisp at print resolution
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: 794,             // capture exactly 794px wide
            windowWidth: 794,       // prevent viewport-width affecting layout
            scrollX: 0,
            scrollY: 0,
        } as any);

        document.body.removeChild(container);

        // A4 in jsPDF units (mm)
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();   // 210 mm
        const pageH = doc.internal.pageSize.getHeight();  // 297 mm

        // Pixel-to-mm ratio: 794px (content width) maps to 210mm
        // One PDF page in canvas pixels = (297/210) * 794 * scale
        const scale = 2;
        const pxPerMm = (794 * scale) / pageW;
        const pageHeightPx = Math.round(pageH * pxPerMm);

        let offsetY = 0;
        let pageNum = 0;

        while (offsetY < canvas.height) {
            if (pageNum > 0) doc.addPage();

            const sliceH = Math.min(pageHeightPx, canvas.height - offsetY);

            // Create a canvas slice for this page
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = pageHeightPx; // always full page height — white fills partial last page

            const ctx = slice.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, slice.width, slice.height);
            ctx.drawImage(
                canvas,
                0, offsetY,         // source: crop from offsetY in the full canvas
                canvas.width, sliceH,
                0, 0,               // destination: top-left of slice
                canvas.width, sliceH
            );

            doc.addImage(slice.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, pageW, pageH);

            offsetY += pageHeightPx;
            pageNum++;
        }

        // Page numbers
        const total = doc.getNumberOfPages();
        const pageLabel = t('pdf.page', options.locale);
        const ofLabel = t('pdf.of', options.locale);
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(160, 160, 160);
            doc.text(`${pageLabel} ${i} ${ofLabel} ${total}`, pageW - 20, pageH - 10, { align: 'right' });
        }

        const safeTitle = options.title
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .replace(/\s+/g, '_')
            .substring(0, 50) || 'notes';

        if (action === 'blob') {
            return doc.output('bloburl').toString() + `#filename=${safeTitle}.pdf`;
        } else {
            doc.save(`${safeTitle}.pdf`);
        }

    } catch (err) {
        if (document.body.contains(container)) document.body.removeChild(container);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// LATIN PATH: existing jsPDF text renderer (vectorial, searchable, fast)
// ---------------------------------------------------------------------------
function generatePdfLatin(options: PdfOptions, action: 'save' | 'blob'): string | void {
    const { title, date, duration, content, style } = options;
    const config = STYLES[style] || STYLES.minimalista;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setProperties({
        title,
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

    // Header
    if (config.headerBg && style === 'cornell') {
        doc.setFillColor(...config.headerColor!);
        doc.rect(0, 0, pageWidth, 55, 'F');
        y = 16;
    }

    doc.setFont(config.fontTitle, 'bold');
    doc.setFontSize(style === 'academico' ? 22 : style === 'cornell' ? 26 : 24);
    doc.setTextColor(...config.primaryColor);
    const titleLines = doc.splitTextToSize(title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * (style === 'academico' ? 8.5 : 10) + 3;

    doc.setFont(config.fontBody, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...config.metaColor);
    let metaText = date;
    if (duration) metaText += `  •  ${duration}`;
    metaText += '  •  Compendium Notes';
    doc.text(metaText, margin, y);
    y += 5;

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

    if (style === 'cornell' && y < 60) y = 60;
    if (style === 'cornell') {
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.3);
        doc.line(margin + 50, y, margin + 50, pageHeight - margin);
    }

    // Content
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

        if (style === 'cornell') {
            if (section.type === 'h2' || section.type === 'h3') { maxWidth = 45; checkPageBreakRef(20); }
            else { xPos = margin + 55; maxWidth = contentWidth - 55; }
        }

        if (section.type === 'h1') {
            checkPageBreakRef(20);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(style === 'academico' ? 16 : 18);
            doc.setTextColor(...config.primaryColor);
            const lines = doc.splitTextToSize(text.replace(/\*\*/g, ''), maxWidth);
            doc.text(lines, xPos, state.y);
            state.y += lines.length * 7 + 6;
        } else if (section.type === 'h2') {
            checkPageBreakRef(18);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(style === 'academico' ? 14 : style === 'cornell' ? 11 : 13);
            doc.setTextColor(...config.primaryColor);
            const lines = doc.splitTextToSize(text.replace(/\*\*/g, ''), maxWidth);
            doc.text(lines, xPos, state.y);
            state.y += lines.length * (style === 'cornell' ? 4.5 : 5.5) + 5;
        } else if (section.type === 'h3') {
            checkPageBreakRef(15);
            doc.setFont(config.fontTitle, 'bold');
            doc.setFontSize(style === 'academico' ? 12 : style === 'cornell' ? 10 : 11);
            doc.setTextColor(...(style === 'cornell' ? config.accentColor : config.primaryColor) as [number, number, number]);
            const lines = doc.splitTextToSize(text.replace(/\*\*/g, ''), maxWidth);
            doc.text(lines, xPos, state.y);
            state.y += lines.length * (style === 'cornell' ? 4 : 5) + 4;
        } else if (section.type === 'list') {
            doc.setFont(config.fontBody, 'normal');
            doc.setFontSize(style === 'academico' ? 11 : 10);
            doc.setTextColor(40, 40, 40);
            for (const item of text.split('\n')) {
                if (!item.trim()) continue;
                checkPageBreakRef(10);
                doc.text('•', xPos, state.y);
                renderTextWithBold(doc, item, config.fontBody, xPos + 6, state, maxWidth - 6, style, checkPageBreakRef);
                state.y += (style === 'academico' ? 5.5 : 5) + 3;
            }
            state.y += 3;
        } else if (section.type === 'quote') {
            checkPageBreakRef(15);
            const lines = doc.splitTextToSize(text.replace(/\*\*/g, ''), maxWidth - 10);
            doc.setFont(config.fontBody, 'italic');
            doc.setFontSize(10);
            doc.setTextColor(70, 70, 70);
            for (const line of lines) {
                checkPageBreakRef(6);
                doc.setFillColor(248, 248, 248);
                doc.rect(xPos, state.y - 4, maxWidth, 6.5, 'F');
                doc.setDrawColor(...config.primaryColor);
                doc.setLineWidth(1.2);
                doc.line(xPos, state.y - 4, xPos, state.y + 2.5);
                doc.text(line, xPos + 6, state.y);
                state.y += 5;
            }
            state.y += 4;
        } else {
            doc.setFont(config.fontBody, 'normal');
            doc.setFontSize(style === 'academico' ? 11 : 10);
            doc.setTextColor(50, 50, 50);
            checkPageBreakRef(10);
            renderTextWithBold(doc, text, config.fontBody, xPos, state, maxWidth, style, checkPageBreakRef);
            state.y += (style === 'academico' ? 5.5 : 5) + 4;
        }
    }

    // Page numbers
    const total = doc.getNumberOfPages();
    const pageLabel = t('pdf.page', options.locale);
    const ofLabel = t('pdf.of', options.locale);
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text(`${pageLabel} ${i} ${ofLabel} ${total}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
    if (action === 'blob') {
        return doc.output('bloburl').toString() + `#filename=${safeTitle}.pdf`;
    } else {
        doc.save(`${safeTitle}.pdf`);
    }
}

// ---------------------------------------------------------------------------
// Public entry point — async to support the html2canvas path
// ---------------------------------------------------------------------------
export async function generatePdf(
    options: PdfOptions,
    action: 'save' | 'blob' = 'save'
): Promise<string | void> {
    const combined = options.title + ' ' + options.content;

    if (requiresUnicodeRendering(combined)) {
        return generatePdfViaCanvas(options, action);
    }

    return generatePdfLatin(options, action);
}
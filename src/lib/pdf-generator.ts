import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface PdfOptions {
    title: string;
    date: string;
    duration?: string;
    content: string;
}

function parseMarkdownSections(content: string) {
    const sections: { level: number; title: string; body: string }[] = [];
    const lines = content.split('\n');
    let currentSection: { level: number; title: string; body: string } | null = null;

    for (const line of lines) {
        const h2Match = line.match(/^## (.+)/);
        const h3Match = line.match(/^### (.+)/);

        if (h2Match) {
            if (currentSection) sections.push(currentSection);
            currentSection = { level: 2, title: h2Match[1].trim(), body: '' };
        } else if (h3Match) {
            if (currentSection) sections.push(currentSection);
            currentSection = { level: 3, title: h3Match[1].trim(), body: '' };
        } else if (currentSection) {
            currentSection.body += line + '\n';
        }
    }
    if (currentSection) sections.push(currentSection);
    return sections;
}

function cleanText(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^>\s*/gm, '')
        .replace(/^- /gm, '• ')
        .trim();
}

export function generatePdf(options: PdfOptions): void {
    const { title, date, duration, content } = options;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 15; // Raised text higher (was margin=20)

    // Colors
    const primaryColor: [number, number, number] = [102, 126, 234];
    const darkColor: [number, number, number] = [26, 26, 36];
    const bodyColor: [number, number, number] = [55, 65, 81];
    const mutedColor: [number, number, number] = [100, 116, 139];

    function checkPageBreak(neededHeight: number) {
        // Footer height ~20mm
        if (y + neededHeight > pageHeight - 20) {
            doc.addPage();
            y = margin; // Reset to top margin
        }
    }

    function addFooter() {
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(...mutedColor);
            doc.text(
                `Smart Class Notes — Pág. ${i} de ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
    }

    // ===== HEADER =====
    doc.setFillColor(...primaryColor);
    doc.rect(margin, y, contentWidth, 1.5, 'F');
    y += 8;

    // Title
    doc.setFontSize(22);
    doc.setTextColor(...darkColor);
    doc.setFont('helvetica', 'bold');

    // Split title to fit
    const titleLines = doc.splitTextToSize(title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 8 + 4;

    // Metadata (No emojis to avoid encoding issues without custom fonts)
    doc.setFontSize(9);
    doc.setTextColor(...mutedColor);
    doc.setFont('helvetica', 'normal');

    let metaText = `Fecha: ${date}`;
    if (duration) metaText += ` | Duracion: ${duration}`;
    metaText += ` | IA: Whisper V3 + Llama 3.3`;

    doc.text(metaText, margin, y);
    y += 8;

    // Separator
    doc.setFillColor(...primaryColor);
    doc.rect(margin, y, contentWidth, 0.5, 'F');
    y += 12;

    // ===== CONTENT =====
    const sections = parseMarkdownSections(content);

    for (const section of sections) {
        const cleanTitle = cleanText(section.title);
        const cleanBody = cleanText(section.body);

        // H2 Section
        if (section.level === 2) {
            checkPageBreak(30); // Ensure enough space for header + some text

            doc.setFontSize(14);
            doc.setTextColor(...primaryColor);
            doc.setFont('helvetica', 'bold');
            doc.text(cleanTitle, margin, y);
            y += 6;

            // Underline
            doc.setFillColor(...primaryColor);
            doc.rect(margin, y, 40, 0.5, 'F');
            y += 8;
        }
        // H3 Section
        else if (section.level === 3) {
            checkPageBreak(20);

            doc.setFontSize(11);
            doc.setTextColor(...darkColor);
            doc.setFont('helvetica', 'bold');
            doc.text(cleanTitle, margin, y);
            y += 6;
        } else {
            // Normal paragraph text (intro, etc)
            y += 4;
        }

        // Body Text
        if (cleanBody) {
            doc.setFontSize(10);
            doc.setTextColor(...bodyColor);
            doc.setFont('helvetica', 'normal');

            // Split text by lines first (paragraphs)
            const paragraphs = cleanBody.split('\n');

            for (const paragraph of paragraphs) {
                if (!paragraph.trim()) {
                    y += 4; // Space for empty lines
                    continue;
                }

                // Wrap paragraph text
                const lines = doc.splitTextToSize(paragraph, contentWidth);

                // Print each line checking for page break
                for (const line of lines) {
                    checkPageBreak(6);
                    doc.text(line, margin, y);
                    y += 5; // Line height
                }

                y += 2; // Paragraph spacing
            }
            y += 4; // Section spacing
        }
    }

    addFooter();

    // Save
    const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
    doc.save(`${safeTitle}_apuntes.pdf`);
}

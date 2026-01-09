/**
 * PDF Utility with Sinhala Unicode Support
 * Uses html2pdf.js which renders HTML with proper browser fonts
 */
import html2pdf from 'html2pdf.js';

/**
 * Generates PDF from HTML string
 * @param {string} htmlString - HTML content as string
 * @param {string} filename - Output filename
 */
export async function generatePDFFromHTML(htmlString, filename) {
    return new Promise((resolve, reject) => {
        // Create container
        const container = document.createElement('div');
        container.innerHTML = htmlString;
        container.style.fontFamily = "'Noto Sans Sinhala', 'Iskoola Pota', Arial, sans-serif";
        container.style.fontSize = '12px';
        container.style.padding = '20px';
        container.style.background = 'white';
        container.style.color = 'black';
        container.style.width = '210mm'; // A4 width
        container.style.minHeight = '297mm'; // A4 height

        // Add to DOM (visible but off-screen)
        container.style.position = 'fixed';
        container.style.left = '0';
        container.style.top = '0';
        container.style.zIndex = '-9999';
        document.body.appendChild(container);

        const opt = {
            margin: [10, 10, 10, 10],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                logging: false,
                allowTaint: true
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // Give browser time to render fonts
        setTimeout(() => {
            html2pdf()
                .set(opt)
                .from(container)
                .save()
                .then(() => {
                    document.body.removeChild(container);
                    resolve();
                })
                .catch((err) => {
                    document.body.removeChild(container);
                    reject(err);
                });
        }, 100);
    });
}

/**
 * Creates a styled HTML table for PDF export
 * @param {string} title - Report title
 * @param {string} dateRange - Date range string
 * @param {Array} headers - Table headers
 * @param {Array} rows - Table data rows
 * @param {Array} summaryItems - Optional summary cards
 * @returns {string} HTML string
 */
export function createReportHTML(title, dateRange, headers, rows, summaryItems = []) {
    const summaryHTML = summaryItems.length > 0 ? `
        <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
            ${summaryItems.map(item => `
                <div style="padding: 10px 15px; background: ${item.bg || '#f0fdf4'}; border-radius: 8px; min-width: 80px; text-align: center; border: 1px solid #ddd;">
                    <div style="font-size: 10px; color: #666; margin-bottom: 4px;">${item.label}</div>
                    <div style="font-size: 13px; font-weight: bold; color: ${item.color || '#059669'};">${item.value}</div>
                </div>
            `).join('')}
        </div>
    ` : '';

    return `
        <div style="font-family: 'Noto Sans Sinhala', 'Iskoola Pota', Arial, sans-serif; padding: 15px; background: white; color: black;">
            <h1 style="font-size: 18px; margin: 0 0 5px 0; color: #111; font-weight: bold;">${title}</h1>
            <p style="font-size: 10px; color: #666; margin: 0 0 15px 0;">
                Period: ${dateRange} | Generated: ${new Date().toLocaleString()}
            </p>
            
            ${summaryHTML}
            
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; background: white;">
                <thead>
                    <tr style="background: #16a34a; color: white;">
                        ${headers.map(h => `<th style="padding: 8px 6px; text-align: left; border: 1px solid #16a34a; font-weight: bold;">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, i) => `
                        <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                            ${row.map(cell => `<td style="padding: 6px; border: 1px solid #e5e7eb; color: #333;">${cell}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export default { generatePDFFromHTML, createReportHTML };

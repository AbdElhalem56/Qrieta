// High-Precision Thermal Receipt Printing Helper for POS (80mm / 58mm / A4)
// يعمل 100% بدون نت (Offline) ويمنع خروج الصفحة فارغة تماماً

export function printThermalElement(element: HTMLElement | null, docTitle = 'فاتورة ضريبية'): void {
  if (!element) {
    console.error('Print error: Target element is null');
    window.print();
    return;
  }

  try {
    // Clone element to sanitize and convert relative styles
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.maxWidth = '100%';
    clone.style.width = '100%';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.border = 'none';

    // Remove any previous print iframe
    const existingIframe = document.getElementById('qrieta-pos-print-frame');
    if (existingIframe) {
      existingIframe.remove();
    }

    // Create a dedicated hidden iframe for isolated print rendering
    const iframe = document.createElement('iframe');
    iframe.id = 'qrieta-pos-print-frame';
    iframe.setAttribute('style', 'position:fixed;right:-10000px;bottom:-10000px;width:80mm;height:1000px;border:0;visibility:hidden;z-index:-9999;');
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) {
      console.warn('Iframe doc not accessible, falling back to window.print');
      window.print();
      return;
    }

    // Inject complete standalone HTML with clean thermal CSS
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${docTitle}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Helvetica, Arial, sans-serif !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
            direction: rtl !important;
            text-align: right !important;
            width: 100% !important;
            max-width: 80mm !important;
          }
          #print-root {
            width: 76mm !important;
            margin: 0 auto !important;
            padding: 3mm 2mm !important;
            background: #ffffff !important;
          }
          .border-b-2 { border-bottom: 2px dashed #000 !important; }
          .border-b { border-bottom: 1px dashed #888 !important; }
          .border-t { border-top: 1px dashed #888 !important; }
          .border-dashed { border-style: dashed !important; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { padding: 3px 0 !important; }
          img { max-width: 100% !important; height: auto !important; }
          svg { display: block !important; margin: 0 auto !important; max-width: 100% !important; }
          .font-bold, .font-black { font-weight: 700 !important; }
          .font-mono { font-family: monospace, Courier, monospace !important; }
          .text-center { text-align: center !important; }
          .text-left { text-align: left !important; }
          .text-right { text-align: right !important; }
          .flex { display: flex !important; }
          .justify-between { justify-content: space-between !important; }
          .items-center { align-items: center !important; }
          .items-baseline { align-items: baseline !important; }
          .grid { display: grid !important; }
          .grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)) !important; }
          .col-span-6 { grid-column: span 6 / span 6 !important; }
          .col-span-2 { grid-column: span 2 / span 2 !important; }
          .no-print { display: none !important; }
          @media print {
            body {
              width: 80mm !important;
              max-width: 80mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            #print-root {
              width: 78mm !important;
              margin: 0 auto !important;
              padding: 2mm !important;
            }
          }
        </style>
      </head>
      <body>
        <div id="print-root">
          ${clone.innerHTML}
        </div>
      </body>
      </html>
    `);
    iframeDoc.close();

    // Trigger printing after slight delay to allow full DOM & QR render
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print:', err);
        window.print();
      } finally {
        // Clean up iframe after 60 seconds
        setTimeout(() => {
          iframe.remove();
        }, 60000);
      }
    }, 250);

  } catch (error) {
    console.error('Error executing thermal print:', error);
    window.print();
  }
}

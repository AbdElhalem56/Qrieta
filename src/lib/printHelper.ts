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
    iframe.setAttribute('style', 'position:fixed;right:0;top:0;width:80mm;height:100vh;border:0;opacity:0.01;pointer-events:none;z-index:-9999;');
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

export interface KitchenTicketItem {
  name: string;
  quantity: number;
  notes?: string;
  options?: Array<{ name: string; price?: number }>;
}

export interface KitchenTicketData {
  restaurantName: string;
  orderNumber: string | number;
  orderType: 'dine_in' | 'takeaway' | 'delivery' | string;
  tableNumber?: string | number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  cashierName?: string;
  time?: string;
  date?: string;
  items: KitchenTicketItem[];
  orderNotes?: string;
}

export function printKitchenTicket(data: KitchenTicketData): void {
  try {
    const now = new Date();
    const timeFormatted = data.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = data.date || now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

    let orderTypeLabel = '🥡 ســفــري (تيك أواي)';
    if (data.orderType === 'dine_in') {
      orderTypeLabel = `🍽️ صـــالـــة - طــاولــة [ ${data.tableNumber || '؟'} ]`;
    } else if (data.orderType === 'delivery') {
      orderTypeLabel = '🛵 تــوصــيــل (دليفري)';
    }

    const totalQty = data.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

    const itemsHtml = data.items.map((item) => `
      <tr style="border-bottom: 1.5px dashed #000;">
        <td style="text-align: center; vertical-align: top; padding: 7px 2px; width: 44px;">
          <div style="font-size: 19px; font-weight: 900; font-family: monospace; border: 2.5px solid #000; border-radius: 6px; padding: 2px 4px; display: inline-block; line-height: 1; background: #000; color: #fff;">
            ${item.quantity}x
          </div>
        </td>
        <td style="padding: 7px 8px; vertical-align: top; text-align: right;">
          <div style="font-size: 15px; font-weight: 900; color: #000; line-height: 1.25;">
            ${item.name}
          </div>
          ${item.options && item.options.length > 0 ? `
            <div style="font-size: 11px; font-weight: 800; color: #000; margin-top: 3px; line-height: 1.3;">
              ⚙️ ${item.options.map(o => o.name).join(' • ')}
            </div>
          ` : ''}
          ${item.notes ? `
            <div style="font-size: 11px; font-weight: 900; color: #000; background: #fff; border: 1.5px solid #000; padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block;">
              ⚠️ ملاحظة: ${item.notes}
            </div>
          ` : ''}
        </td>
      </tr>
    `).join('');

    // Remove any previous print iframe
    const existingIframe = document.getElementById('qrieta-kot-print-frame');
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'qrieta-kot-print-frame';
    iframe.setAttribute('style', 'position:fixed;right:0;top:0;width:80mm;height:100vh;border:0;opacity:0.01;pointer-events:none;z-index:-9999;');
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) {
      console.warn('Iframe doc not accessible, fallback window.print');
      window.print();
      return;
    }

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>بون مطبخ - ${data.orderNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Helvetica, Arial, sans-serif !important;
            font-size: 12px !important;
            line-height: 1.35 !important;
            direction: rtl !important;
            text-align: right !important;
            width: 100% !important;
            max-width: 80mm !important;
          }
          #print-root {
            width: 76mm !important;
            margin: 0 auto !important;
            padding: 4mm 2mm !important;
            background: #ffffff !important;
          }
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
          <!-- Cutting Line Top -->
          <div style="text-align: center; font-family: monospace; font-size: 11px; margin-bottom: 4px; color: #000; letter-spacing: 2px;">
            - - - - - - - - - - - - - - - -
          </div>

          <!-- Restaurant Name & Slip Title -->
          <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
            <div style="font-size: 15px; font-weight: 900; margin: 0 0 4px 0; color: #000;">
              ${data.restaurantName}
            </div>
            <div style="font-size: 13px; font-weight: 900; background: #000; color: #fff; padding: 3px 12px; border-radius: 4px; display: inline-block; letter-spacing: 0.5px;">
              🍳 بون تشغيل المطبخ
            </div>
          </div>

          <!-- Big Order Number & Order Type (Unified Slip - NO STATIONS) -->
          <div style="border: 2px solid #000; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; background: #fff;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="text-align: right; flex-grow: 1;">
                <div style="font-size: 11px; font-weight: 700; color: #000;">نوع الطلب:</div>
                <div style="font-size: 16px; font-weight: 900; color: #000; margin-top: 1px;">
                  ${orderTypeLabel}
                </div>
              </div>
              <div style="text-align: center; min-width: 75px; border-right: 2px solid #000; padding-right: 8px;">
                <div style="font-size: 10px; font-weight: 800; color: #000;">رقم الأوردر</div>
                <div style="font-size: 32px; font-weight: 900; font-family: monospace; line-height: 1; color: #000;">
                  #${data.orderNumber}
                </div>
              </div>
            </div>

            ${data.customerName || data.customerPhone || data.deliveryAddress ? `
              <div style="border-top: 1.5px dashed #000; margin-top: 5px; padding-top: 4px; font-size: 11px; font-weight: 800; color: #000;">
                ${data.customerName ? `<div>👤 العميل: ${data.customerName}</div>` : ''}
                ${data.customerPhone ? `<div style="font-family: monospace;">📞 هاتف: ${data.customerPhone}</div>` : ''}
                ${data.deliveryAddress ? `<div>📍 العنوان: ${data.deliveryAddress}</div>` : ''}
              </div>
            ` : ''}
          </div>

          <!-- Time & Date & Cashier -->
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-family: monospace; font-weight: 800; border-bottom: 2px dashed #000; padding-bottom: 4px; margin-bottom: 6px; color: #000;">
            <span>⏰ ${timeFormatted}</span>
            <span>📅 ${dateFormatted}</span>
            <span>👤 ${data.cashierName || 'كاشير'}</span>
          </div>

          <!-- Items Table (NO STATIONS - Single Unified Slip) -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
            <thead>
              <tr style="border-bottom: 2px solid #000; font-size: 12px; font-weight: 900;">
                <th style="text-align: center; width: 44px; padding: 4px 0; color: #000;">العدد</th>
                <th style="text-align: right; padding: 4px 8px; color: #000;">الصنف والتفاصيل</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Summary: Total Items -->
          <div style="border-top: 2px solid #000; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 900;">
            <span>إجمالي عدد القطع:</span>
            <span style="font-family: monospace; font-size: 16px; border: 2px solid #000; padding: 2px 8px; border-radius: 4px; background: #000; color: #fff;">
              ${totalQty} صنف
            </span>
          </div>

          <!-- Special Chef Notes (if present) -->
          ${data.orderNotes ? `
            <div style="margin-top: 6px; padding: 6px 8px; border: 2px dashed #000; border-radius: 6px; font-size: 12px; font-weight: 900; background: #fff;">
              📝 ملاحظات خاصة للشيف: ${data.orderNotes}
            </div>
          ` : ''}

          <!-- Cutting Line Bottom -->
          <div style="text-align: center; font-family: monospace; font-size: 11px; margin-top: 8px; color: #000; letter-spacing: 2px;">
            - - - - - - - - - - - - - - - -
          </div>
          <div style="text-align: center; font-size: 10px; font-weight: 800; color: #000; margin-top: 2px;">
            نظام كاشير ومطبخ Qrieta
          </div>
        </div>
      </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print:', err);
        window.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 60000);
      }
    }, 200);

  } catch (error) {
    console.error('Error printing kitchen ticket:', error);
    window.print();
  }
}

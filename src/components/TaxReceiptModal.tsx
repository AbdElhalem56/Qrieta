import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X, CheckCircle2, Building2, Phone, MapPin, Calendar, Clock, User, Receipt, UtensilsCrossed } from 'lucide-react';
import { TaxReceiptData, generateEtaTaxQrCode } from '../lib/taxReceiptHelper';
import { formatCurrency } from '../lib/utils';
import { printThermalElement } from '../lib/printHelper';

interface TaxReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: TaxReceiptData;
}

export const TaxReceiptModal: React.FC<TaxReceiptModalProps> = ({
  isOpen,
  onClose,
  receiptData,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    const el = document.getElementById('eta-thermal-receipt') || printRef.current;
    if (el) {
      printThermalElement(el, `فاتورة-${receiptData.invoiceNumber || 'receipt'}`);
    } else {
      window.print();
    }
  };

  const isoDateTime = typeof receiptData.dateTime === 'string'
    ? receiptData.dateTime
    : receiptData.dateTime.toISOString();

  const formattedDate = new Date(receiptData.dateTime).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const formattedTime = new Date(receiptData.dateTime).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const qrPayload = generateEtaTaxQrCode({
    sellerName: receiptData.restaurantName,
    taxNumber: receiptData.taxNumber || '000-000-000',
    invoiceDateTime: isoDateTime,
    totalWithVat: receiptData.finalTotal,
    vatTotal: receiptData.taxAmount,
    invoiceUuidOrNumber: receiptData.invoiceNumber,
  });

  const orderTypeArabic = {
    dine_in: `صالة ${receiptData.tableNumber ? `(طاولة ${receiptData.tableNumber})` : ''}`,
    takeaway: 'تيك اوي',
    delivery: 'توصيل / دليفري',
  }[receiptData.orderType] || 'طلب مطعم';

  const paymentMethodArabic = {
    cash: 'نقداً (كاش)',
    card: 'بطاقة مصرفية / فيزا (POS)',
    wallet: 'محفظة إلكترونية (E-Wallet)',
    unpaid: 'غير مسدد / آجل',
  }[receiptData.paymentMethod] || 'نقداً';

  const hasTax = (receiptData.taxRate !== undefined && Number(receiptData.taxRate) > 0) || (receiptData.taxAmount !== undefined && Number(receiptData.taxAmount) > 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      {/* Container with Print CSS specific rules */}
      <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col text-right" dir="rtl">
        {/* Header Controls (Hidden during print) */}
        <div className="p-4 bg-gray-900 text-white flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
              <Receipt size={18} />
            </div>
            <div>
              <h3 className="font-black text-sm">فاتورة ضريبية إلكترونية</h3>
              <p className="text-[10px] text-gray-300">مصلحة الضرائب المصرية (ETA E-Receipt)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Printer size={15} />
              <span>طباعة الفاتورة</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Thermal Receipt Layout */}
        <div className="p-6 overflow-y-auto bg-gray-50 flex-1 print:p-0 print:bg-white print:m-0" ref={printRef}>
          <div 
            id="eta-thermal-receipt" 
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mx-auto max-w-[340px] text-gray-900 font-sans leading-tight print:border-none print:shadow-none print:p-2 print:max-w-none print:w-full"
            style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
          >
            {/* Header / Logo */}
            <div className="text-center pb-3 border-b-2 border-dashed border-gray-400">
              {receiptData.restaurantLogo ? (
                <img
                  src={receiptData.restaurantLogo}
                  alt={receiptData.restaurantName}
                  className="w-16 h-16 mx-auto mb-2 object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <UtensilsCrossed size={24} />
                </div>
              )}
              <h1 className="text-lg font-black text-gray-900 tracking-tight">{receiptData.restaurantName}</h1>
              <p className="text-[11px] font-bold text-gray-600 mt-0.5">
                {hasTax ? 'فاتورة ضريبية مبسطة (إيصال إلكتروني)' : 'فاتورة حساب (إيصال طلب)'}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {hasTax ? 'Simplified Tax Invoice' : 'Order Receipt'}
              </p>

              {/* Tax Registration Details (Only when tax registered) */}
              {(hasTax || receiptData.taxNumber) && (
                <div className="mt-2 text-[10px] text-gray-700 bg-gray-100 py-1.5 px-2 rounded-lg border border-gray-200 space-y-0.5 font-mono">
                  {hasTax && (
                    <div className="flex justify-between font-bold">
                      <span>الرقم الضريبي:</span>
                      <span className="tracking-wider">{receiptData.taxNumber || 'غير مسجل'}</span>
                    </div>
                  )}
                  {receiptData.commercialRegistration && (
                    <div className="flex justify-between">
                      <span>السجل التجاري:</span>
                      <span>{receiptData.commercialRegistration}</span>
                    </div>
                  )}
                </div>
              )}

              {receiptData.branchAddress && (
                <p className="text-[10px] text-gray-500 mt-1 flex items-center justify-center gap-1">
                  <MapPin size={10} className="inline text-gray-400" />
                  {receiptData.branchAddress}
                </p>
              )}
              {receiptData.branchPhone && (
                <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1 font-mono">
                  <Phone size={10} className="inline text-gray-400" />
                  {receiptData.branchPhone}
                </p>
              )}
            </div>

            {/* Invoice & Order Metadata */}
            <div className="py-2.5 border-b border-dashed border-gray-300 text-[11px] space-y-1">
              <div className="flex justify-between items-center font-bold">
                <span className="text-gray-600">رقم الفاتورة:</span>
                <span className="font-mono text-gray-900">{receiptData.invoiceNumber}</span>
              </div>
              
              {receiptData.dailyOrderNumber !== undefined && receiptData.dailyOrderNumber !== '' && (
                <div className="flex justify-between items-center bg-gray-900 text-white px-2 py-1 rounded-md font-black">
                  <span className="text-[10px]">رقم الطلب اليومي:</span>
                  <span className="text-sm font-mono tracking-wider">#{receiptData.dailyOrderNumber}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] text-gray-600">
                <span>التاريخ والوقت:</span>
                <span className="font-mono text-gray-800" dir="ltr">{formattedDate} {formattedTime}</span>
              </div>

              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-600">نوع الطلب:</span>
                <span className="font-bold text-gray-900">{orderTypeArabic}</span>
              </div>

              {receiptData.cashierName && (
                <div className="flex justify-between items-center text-[10px] text-gray-600">
                  <span>الكاشير:</span>
                  <span className="font-medium text-gray-800">{receiptData.cashierName}</span>
                </div>
              )}

              {receiptData.customerName && (
                <div className="flex justify-between items-center text-[10px] text-gray-600">
                  <span>العميل:</span>
                  <span className="font-bold text-gray-800">{receiptData.customerName} {receiptData.customerPhone ? `(${receiptData.customerPhone})` : ''}</span>
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div className="py-2.5 border-b-2 border-dashed border-gray-400">
              <div className="grid grid-cols-12 text-[10px] font-black text-gray-500 pb-1 border-b border-gray-200">
                <span className="col-span-6">الصنف</span>
                <span className="col-span-2 text-center">الكمية</span>
                <span className="col-span-2 text-left">السعر</span>
                <span className="col-span-2 text-left">الإجمالي</span>
              </div>

              <div className="divide-y divide-gray-100">
                {receiptData.items.map((item, idx) => (
                  <div key={idx} className="py-1.5 text-[11px]">
                    <div className="grid grid-cols-12 items-baseline">
                      <span className="col-span-6 font-bold text-gray-900 leading-tight">
                        {item.name}
                      </span>
                      <span className="col-span-2 text-center font-mono font-black text-gray-800">
                        {item.quantity}x
                      </span>
                      <span className="col-span-2 text-left font-mono text-[10px] text-gray-600">
                        {item.unitPrice.toFixed(2)}
                      </span>
                      <span className="col-span-2 text-left font-mono font-bold text-gray-900">
                        {item.totalPrice.toFixed(2)}
                      </span>
                    </div>

                    {/* Options & Notes */}
                    {item.options && item.options.length > 0 && (
                      <div className="text-[9px] text-gray-500 pr-2 mt-0.5 space-y-0.5 font-medium">
                        {item.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex justify-between">
                            <span>+ {opt.name}</span>
                            {opt.price > 0 && <span>+{opt.price.toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p className="text-[9px] text-amber-700 font-medium pr-2 mt-0.5 italic">
                        ملاحظة: {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary & Tax Breakdown */}
            <div className="py-2.5 border-b-2 border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>{hasTax ? 'المجموع الفرعي (قبل الضريبة):' : 'المجموع الفرعي:'}</span>
                <span className="font-mono">{receiptData.subtotal.toFixed(2)} ج.م</span>
              </div>

              {receiptData.discountAmount && receiptData.discountAmount > 0 ? (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>الخصم:</span>
                  <span className="font-mono">- {receiptData.discountAmount.toFixed(2)} ج.م</span>
                </div>
              ) : null}

              {/* VAT Line - Only display when tax rate / tax amount is greater than 0 */}
              {hasTax && (
                <div className="flex justify-between text-gray-800 font-bold bg-amber-50/70 px-1.5 py-0.5 rounded">
                  <span>ضريبة القيمة المضافة ({receiptData.taxRate || 14}% VAT):</span>
                  <span className="font-mono">{receiptData.taxAmount.toFixed(2)} ج.م</span>
                </div>
              )}

              {receiptData.serviceFeeAmount && receiptData.serviceFeeAmount > 0 ? (
                <div className="flex justify-between text-gray-600">
                  <span>رسم الخدمة ({receiptData.serviceFeeRate || 0}%):</span>
                  <span className="font-mono">{receiptData.serviceFeeAmount.toFixed(2)} ج.م</span>
                </div>
              ) : null}

              {receiptData.deliveryFee && receiptData.deliveryFee > 0 ? (
                <div className="flex justify-between text-gray-600">
                  <span>خدمة التوصيل:</span>
                  <span className="font-mono">{receiptData.deliveryFee.toFixed(2)} ج.م</span>
                </div>
              ) : null}

              {/* Total Due */}
              <div className="pt-2 mt-1 border-t border-gray-300 flex justify-between items-baseline font-black text-sm text-gray-900">
                <span>الإجمالي النهائي المستحق:</span>
                <span className="text-base font-mono text-gray-950">{receiptData.finalTotal.toFixed(2)} ج.م</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="py-2 border-b border-dashed border-gray-300 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span className="text-gray-600">طريقة السداد:</span>
                <span className="font-bold text-gray-900">{paymentMethodArabic}</span>
              </div>
              {receiptData.amountPaid !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">المبلغ المدفوع:</span>
                  <span className="font-mono font-bold text-gray-900">{receiptData.amountPaid.toFixed(2)} ج.م</span>
                </div>
              )}
              {receiptData.changeDue !== undefined && receiptData.changeDue > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>الباقي للعميل:</span>
                  <span className="font-mono">{receiptData.changeDue.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {/* QR Code for Tax Verification (Egyptian Tax Authority E-Receipt) */}
            <div className="py-3 text-center flex flex-col items-center justify-center">
              <div className="p-2 bg-white rounded-xl border border-gray-300 inline-block shadow-sm">
                <QRCodeSVG
                  value={qrPayload}
                  size={105}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-[9px] font-bold text-gray-700 mt-1.5 tracking-tight">
                {hasTax ? 'امسح الرمز للتحقق من الفاتورة الضريبية' : 'امسح الرمز للتحقق من تفاصيل الطلب'}
              </p>
              <p className="text-[8px] text-gray-500">
                {hasTax ? 'منظومة الفاتورة والإيصال الإلكتروني - مصلحة الضرائب المصرية' : 'إيصال إلكتروني معتمد - نظام إدارة المطاعم'}
              </p>
            </div>

            {/* Footer */}
            <div className="text-center pt-2 border-t border-dashed border-gray-300 text-[9px] text-gray-500 space-y-0.5">
              <p className="font-bold text-gray-700">شكراً لزيارتكم ونتمنى لكم يوماً سعيداً!</p>
              <p className="font-mono text-[8px] text-gray-400">Powered by Qrieta Smart POS System</p>
            </div>
          </div>
        </div>

        {/* Footer Actions (Hidden on print) */}
        <div className="p-4 bg-gray-100 border-t flex gap-3 no-print shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white border border-gray-300 hover:bg-gray-50 rounded-2xl text-xs font-bold text-gray-700 transition-all cursor-pointer"
          >
            إغلاق
          </button>
          <button
            onClick={handlePrint}
            className="flex-2 py-3 bg-gray-900 hover:bg-black text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة الإيصال (Print Receipt)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

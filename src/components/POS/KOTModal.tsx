import React, { useRef } from 'react';
import { Printer, X, ChefHat, CheckCircle2, Clock, Table as TableIcon, User, AlertTriangle } from 'lucide-react';
import { POSCartItem, formatStationLabel } from '../../lib/posStore';
import { printThermalElement } from '../../lib/printHelper';

interface KOTModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  dailyOrderNumber?: string | number;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber?: string | number;
  cashierName?: string;
  cart: POSCartItem[];
  orderNotes?: string;
  onConfirmSend: () => void;
}

export const KOTModal: React.FC<KOTModalProps> = ({
  isOpen,
  onClose,
  restaurantName,
  dailyOrderNumber,
  orderType,
  tableNumber,
  cashierName,
  cart,
  orderNotes,
  onConfirmSend,
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Group items by preparation station
  const stationsMap: Record<string, POSCartItem[]> = {};
  cart.forEach(item => {
    const st = item.station || 'kitchen';
    if (!stationsMap[st]) stationsMap[st] = [];
    stationsMap[st].push(item);
  });

  const handlePrintKOT = () => {
    const el = printContainerRef.current;
    if (el) {
      printThermalElement(el, `بون-مطبخ-${dailyOrderNumber || 'KOT'}`);
    } else {
      window.print();
    }
  };

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

  const getOrderTypeLabel = () => {
    if (orderType === 'dine_in') return `صالة - طاولة #${tableNumber || '?'}`;
    if (orderType === 'takeaway') return 'سفري (تيك أواي)';
    return 'توصيل (دليفري)';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <ChefHat size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">بون تشغيل المطبخ والأقسام (KOT)</h3>
                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                  طلب #{dailyOrderNumber || '1'}
                </span>
              </div>
              <p className="text-xs text-slate-500">توجيه الأصناف وملاحظات الشيف لمحطات التجهيز</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content: Ticket Previews per station */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-slate-50" ref={printContainerRef}>
          {Object.entries(stationsMap).map(([stationKey, items]) => (
            <div 
              key={stationKey}
              className="bg-white border border-slate-300 rounded-2xl p-5 space-y-3 shadow-sm kot-print-ticket relative"
            >
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-3">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{restaurantName}</h4>
                  <span className="text-xs text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block mt-1">
                    محطة: {formatStationLabel(stationKey as any).label}
                  </span>
                </div>
                <div className="text-left">
                  <span className="font-mono font-bold text-lg text-slate-800 block">
                    #{dailyOrderNumber || '1'}
                  </span>
                  <span className="text-[11px] text-slate-500">{getOrderTypeLabel()}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 font-mono border-b border-dashed border-slate-300 pb-2">
                <span>الوقت: {timeFormatted} - {dateFormatted}</span>
                <span>كاشير: {cashierName || 'الرئيسي'}</span>
              </div>

              {/* Items List */}
              <div className="space-y-2.5 py-1">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between text-sm">
                    <div className="flex items-start gap-2">
                      <span className="font-mono font-bold text-base text-slate-900 bg-slate-100 border border-slate-200 w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                        {item.quantity}
                      </span>
                      <div>
                        <span className="font-bold text-slate-800 block">{item.name}</span>
                        {item.options && item.options.length > 0 && (
                          <span className="text-xs text-slate-500 block">
                            + {item.options.map(o => o.name).join(', ')}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded inline-block mt-0.5">
                            ⚠️ {item.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* General Order Notes */}
              {orderNotes && (
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-900 space-y-0.5">
                  <span className="font-bold block">ملاحظات عامة للأوردر:</span>
                  <p>{orderNotes}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handlePrintKOT}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 border border-slate-300 transition-all cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة بون المطبخ (KOT)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              إلغاء
            </button>
            <button
              onClick={() => {
                onConfirmSend();
                onClose();
              }}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>تأكيد الإرسال للمطبخ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

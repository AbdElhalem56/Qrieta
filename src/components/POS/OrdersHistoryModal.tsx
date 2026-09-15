import React, { useState } from 'react';
import { 
  X, 
  Receipt, 
  Printer, 
  RotateCcw, 
  Clock, 
  UtensilsCrossed, 
  ShoppingBag, 
  Bike, 
  User, 
  Phone, 
  MapPin, 
  CreditCard, 
  DollarSign, 
  Smartphone,
  Eye,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Order } from '../../lib/supabase';
import { TaxReceiptData } from '../../lib/taxReceiptHelper';
import { TaxReceiptModal } from '../TaxReceiptModal';
import { getDisplayOrderNumber } from '../../lib/ordersService';

interface OrdersHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onRefundOrder: (order: Order) => void;
  restaurantName: string;
  restaurantGeofence?: any;
}

export const OrdersHistoryModal: React.FC<OrdersHistoryModalProps> = ({
  isOpen,
  onClose,
  orders,
  onRefundOrder,
  restaurantName,
  restaurantGeofence,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [taxReceiptData, setTaxReceiptData] = useState<TaxReceiptData | null>(null);

  if (!isOpen) return null;

  const filteredOrders = React.useMemo(() => {
    const seen = new Set<string>();
    return orders.filter((ord: any) => {
      const id = String(ord.id);
      if (seen.has(id)) return false;
      seen.add(id);

      const matchesType = filterType === 'all' || ord.order_type === filterType;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesType;

      const idMatch = String(ord.id).toLowerCase().includes(query) || 
                      String(ord.daily_order_number || '').toLowerCase().includes(query);
      const customerMatch = (ord.customer_name || '').toLowerCase().includes(query) || 
                            (ord.customer_phone || '').includes(query);
      const itemsMatch = Array.isArray(ord.items) && ord.items.some((it: any) => 
        (it.name || '').toLowerCase().includes(query)
      );

      return matchesType && (idMatch || customerMatch || itemsMatch);
    });
  }, [orders, filterType, searchQuery]);

  const handlePrintReceipt = (ord: any) => {
    const receiptData: TaxReceiptData = {
      restaurantName: restaurantName || 'مطعم كريتا',
      taxNumber: restaurantGeofence?.tax_number || '100-245-890',
      commercialRegistration: restaurantGeofence?.commercial_registration || '45892',
      branchAddress: restaurantGeofence?.address || 'بورسعيد - حي الشرق',
      branchPhone: restaurantGeofence?.phone || '01000000000',
      invoiceNumber: `INV-${getDisplayOrderNumber(ord)}`,
      dailyOrderNumber: getDisplayOrderNumber(ord),
      orderType: ord.order_type || 'dine_in',
      tableNumber: ord.table_number || ord.table?.table_number,
      cashierName: ord.cashier_name || 'الكاشير',
      dateTime: new Date(ord.created_at || Date.now()),
      items: Array.isArray(ord.items) ? ord.items.map((it: any) => ({
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.price,
        totalPrice: (it.price || 0) * (it.quantity || 1),
        notes: it.notes,
        options: it.options,
      })) : [],
      subtotal: (ord.total_amount || ord.total_price || 0) - (ord.tax_amount || 0) - (ord.service_fee || 0),
      taxRate: typeof restaurantGeofence?.tax_rate === 'number' ? restaurantGeofence.tax_rate : (ord.tax_amount && ord.tax_amount > 0 ? 14 : 0),
      taxAmount: ord.tax_amount || 0,
      serviceFeeRate: 12,
      serviceFeeAmount: ord.service_fee || 0,
      deliveryFee: ord.delivery_fee || 0,
      discountAmount: ord.discount_amount || 0,
      finalTotal: ord.total_amount || ord.total_price || 0,
      paymentMethod: ord.payment_method || 'cash',
      amountPaid: ord.total_amount || ord.total_price || 0,
      changeDue: 0,
      customerName: ord.customer_name,
      customerPhone: ord.customer_phone,
      customerAddress: ord.delivery_address,
    };

    setTaxReceiptData(receiptData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <Receipt size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">سجل الفواتير والطلبات</h3>
                <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                  {filteredOrders.length} فاتورة
                </span>
              </div>
              <p className="text-xs text-slate-500">معاينة فواتير اليوم، إعادة الطباعة، أو عمل مرتجع</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Search box */}
          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="بحث برقم الفاتورة، العميل، أو الصنف..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 focus:border-amber-500 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none shadow-sm"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({orders.length})
            </button>
            <button
              onClick={() => setFilterType('dine_in')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'dine_in' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              صالة
            </button>
            <button
              onClick={() => setFilterType('takeaway')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'takeaway' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              تيك اوي
            </button>
            <button
              onClick={() => setFilterType('delivery')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'delivery' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              دليفري
            </button>
          </div>
        </div>

        {/* Content Body: List and Preview */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left / Main Orders List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {filteredOrders.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <Receipt size={40} className="text-slate-300" />
                <p className="font-bold text-sm text-slate-600">لا توجد فواتير مطابقة</p>
                <p className="text-xs text-slate-400">ستظهر الفواتير هنا فور إتمام عمليات البيع</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredOrders.map((ord: any) => {
                  const isSelected = selectedOrder?.id === ord.id;
                  const total = ord.total_amount || ord.total_price || 0;
                  const orderType = ord.order_type || 'dine_in';

                  return (
                    <div
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white ${
                        isSelected 
                          ? 'border-amber-500 shadow-md ring-2 ring-amber-500/20' 
                          : 'border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold font-mono text-xs">
                            #{getDisplayOrderNumber(ord)}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 text-xs">
                                {orderType === 'dine_in' ? 'صالة' : orderType === 'takeaway' ? 'تيك اوي' : 'دليفري'}
                              </span>
                              {ord.table_number && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                                  طاولة #{ord.table_number}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              {new Date(ord.created_at || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <div className="text-left">
                          <span className="font-mono font-bold text-emerald-600 text-sm block">
                            {total.toFixed(2)} ج.م
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold inline-block ${
                            ord.status === 'cancelled' 
                              ? 'bg-rose-50 text-rose-600' 
                              : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {ord.status === 'cancelled' ? 'ملغاة / مرتجع' : 'مدفوعة'}
                          </span>
                        </div>
                      </div>

                      {/* Items Preview */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1 bg-slate-50/50 p-2 rounded-xl">
                        {Array.isArray(ord.items) && ord.items.slice(0, 3).map((it: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[11px]">
                            <span className="truncate max-w-[160px]">{it.quantity}x {it.name}</span>
                            <span className="font-mono text-slate-500">{((it.price || 0) * (it.quantity || 1)).toFixed(2)} ج.م</span>
                          </div>
                        ))}
                        {Array.isArray(ord.items) && ord.items.length > 3 && (
                          <div className="text-[10px] text-slate-400 font-medium text-center pt-0.5">
                            +{ord.items.length - 3} أصناف أخرى...
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="mt-3 flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500">
                          {ord.payment_method === 'cash' ? '💵 كاش' : ord.payment_method === 'card' ? '💳 فيزا' : ord.payment_method === 'wallet' ? '📱 إنستاباي' : '🔄 مقسم'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintReceipt(ord);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                            title="طباعة الفاتورة"
                          >
                            <Printer size={12} />
                            <span>طباعة</span>
                          </button>

                          {ord.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRefundOrder(ord);
                              }}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                              title="مرتجع الفاتورة"
                            >
                              <RotateCcw size={12} />
                              <span>مرتجع</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Selected Order Detailed Receipt Preview (Desktop) */}
          {selectedOrder && (
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-r border-slate-200 bg-white p-4 flex flex-col justify-between shrink-0 shadow-lg md:shadow-none">
              <div className="space-y-3 overflow-y-auto max-h-[350px] md:max-h-none">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">تفاصيل الفاتورة #{getDisplayOrderNumber(selectedOrder)}</h4>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(selectedOrder.created_at || Date.now()).toLocaleString('ar-EG')}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 md:hidden"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Customer Details if delivery/takeaway */}
                {(selectedOrder.customer_name || selectedOrder.customer_phone) && (
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                    {selectedOrder.customer_name && (
                      <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                        <User size={12} className="text-amber-500" />
                        <span>{selectedOrder.customer_name}</span>
                      </div>
                    )}
                    {selectedOrder.customer_phone && (
                      <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                        <Phone size={12} className="text-slate-400" />
                        <span>{selectedOrder.customer_phone}</span>
                      </div>
                    )}
                    {selectedOrder.delivery_address && (
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <MapPin size={12} className="text-rose-500" />
                        <span className="truncate">{selectedOrder.delivery_address}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Items Breakdown */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 block">الأصناف:</span>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {Array.isArray(selectedOrder.items) && selectedOrder.items.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                        <div>
                          <span className="font-bold text-slate-800">{it.quantity}x {it.name}</span>
                          {it.notes && (
                            <span className="text-[10px] text-amber-600 block">📝 {it.notes}</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-700">
                          {((it.price || 0) * (it.quantity || 1)).toFixed(2)} ج.م
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="pt-2 border-t border-slate-200 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between font-bold text-slate-800 text-sm pt-1 border-t border-slate-200">
                    <span>الإجمالي:</span>
                    <span className="font-mono text-emerald-600">
                      {(selectedOrder.total_amount || selectedOrder.total_price || 0).toFixed(2)} ج.م
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-slate-200 flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(selectedOrder)}
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Printer size={14} />
                  <span>طباعة الإيصال</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tax Receipt Modal */}
      {taxReceiptData && (
        <TaxReceiptModal
          isOpen={!!taxReceiptData}
          onClose={() => setTaxReceiptData(null)}
          receiptData={taxReceiptData}
        />
      )}
    </div>
  );
};

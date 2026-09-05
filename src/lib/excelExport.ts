import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { LiveOrder, getDisplayOrderNumber } from './ordersService';

export interface OrderExportFilter {
  restaurantId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status?: string;   // 'all' | 'delivered' | 'preparing' | 'new' | 'cancelled'
  orderType?: string;// 'all' | 'dine_in' | 'delivery' | 'takeaway'
  source?: string;   // 'all' | 'customer_app' | 'cashier_pos'
}

/**
 * Fetch orders from Supabase for the specified date range and restaurant
 */
export async function fetchOrdersByDateRange(filter: OrderExportFilter): Promise<any[]> {
  const { restaurantId, startDate, endDate, status } = filter;
  if (!restaurantId) return [];

  const startIso = `${startDate}T00:00:00`;
  const endIso = `${endDate}T23:59:59`;

  let query = supabase
    .from('orders')
    .select('*, order_items(*, products(*)), tables(table_number)')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    const dbStatus = status === 'completed' ? 'delivered' : status;
    query = query.eq('status', dbStatus);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching orders for date range:', error);
    throw error;
  }

  return data || [];
}

/**
 * Parses customer and order details from live orders or order notes
 */
function parseOrderInfo(order: any, liveOrdersMap: Map<string, LiveOrder>) {
  const orderIdStr = String(order.id);
  const live = liveOrdersMap.get(orderIdStr) || 
               Array.from(liveOrdersMap.values()).find(lo => 
                 lo.daily_order_number && order.daily_order_number && 
                 Number(lo.daily_order_number) === Number(order.daily_order_number)
               );

  // 1. Order Number
  const orderNum = order.daily_order_number || (live?.daily_order_number) || getDisplayOrderNumber(order);

  // 2. Order Type
  let orderType = live?.order_type;
  if (!orderType) {
    if (order.tables?.table_number || order.table_id) {
      orderType = 'dine_in';
    } else if (order.notes?.includes('دليفري') || order.notes?.includes('توصيل')) {
      orderType = 'delivery';
    } else if (order.notes?.includes('سفري') || order.notes?.includes('تيك')) {
      orderType = 'takeaway';
    } else {
      orderType = order.tables ? 'dine_in' : 'takeaway';
    }
  }

  // 3. Customer info
  let customerName = live?.customer_name || '';
  let customerPhone = live?.customer_phone || '';
  let address = live?.delivery_address || '';

  if (!customerName && order.notes) {
    // Try parsing name/phone from notes
    const phoneMatch = order.notes.match(/01[0125][0-9]{8}/);
    if (phoneMatch) customerPhone = phoneMatch[0];
  }

  // 4. Source
  const source = live?.source || (order.notes?.includes('تطبيق الزبائن') ? 'customer_app' : 'cashier_pos');

  // 5. Items summary
  const itemsList: string[] = [];
  let totalItemsCount = 0;

  if (Array.isArray(order.order_items) && order.order_items.length > 0) {
    order.order_items.forEach((it: any) => {
      const q = it.quantity || 1;
      totalItemsCount += q;
      const name = it.products?.name_ar || it.products?.name_en || it.product_name || 'صنف';
      itemsList.push(`${q}x ${name}`);
    });
  } else if (Array.isArray(live?.items) && live.items.length > 0) {
    live.items.forEach(it => {
      const q = it.quantity || 1;
      totalItemsCount += q;
      const name = it.name || (it as any).product_name || 'صنف';
      itemsList.push(`${q}x ${name}`);
    });
  }

  return {
    orderNum,
    orderType,
    customerName,
    customerPhone,
    address,
    source,
    itemsSummary: itemsList.join(' + ') || 'غير محدد',
    totalItemsCount: totalItemsCount || 1,
    status: live?.status || order.status || 'new',
    paymentStatus: live?.payment_status || (order.status === 'delivered' ? 'paid' : 'unpaid')
  };
}

/**
 * Converts orders array to Excel formatted rows and triggers .xlsx download
 */
export function generateOrdersExcelSheet(
  orders: any[],
  liveOrders: LiveOrder[] = [],
  options: {
    restaurantName?: string;
    startDate?: string;
    endDate?: string;
    fileNamePrefix?: string;
  } = {}
) {
  const liveMap = new Map<string, LiveOrder>();
  liveOrders.forEach(lo => liveMap.set(String(lo.id), lo));

  const excelRows = orders.map(order => {
    const info = parseOrderInfo(order, liveMap);
    const dateObj = new Date(order.created_at || Date.now());

    const dateStr = dateObj.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const timeStr = dateObj.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let typeArabic = 'صالة';
    if (info.orderType === 'delivery') typeArabic = 'دليفري (توصيل)';
    else if (info.orderType === 'takeaway') typeArabic = 'سفري (تيك أواي)';

    let sourceArabic = info.source === 'customer_app' ? 'تطبيق الزبائن' : 'كاشير الفرع';

    let tableOrAddress = '-';
    if (info.orderType === 'dine_in') {
      const tNum = order.tables?.table_number || liveMap.get(String(order.id))?.table_number;
      tableOrAddress = tNum ? `طاولة ${tNum}` : 'صالة';
    } else if (info.orderType === 'delivery') {
      tableOrAddress = info.address || 'توصيل منزلي';
    } else {
      tableOrAddress = 'استلام من الفرع';
    }

    let statusArabic = 'جديد';
    if (info.status === 'preparing') statusArabic = 'قيد التحضير';
    else if (info.status === 'ready') statusArabic = 'جاهز للتسليم';
    else if (info.status === 'delivered' || info.status === 'completed') statusArabic = 'تم التسليم';
    else if (info.status === 'cancelled') statusArabic = 'ملغي';

    const paymentArabic = info.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع';

    return {
      'رقم الطلب': `#${info.orderNum}`,
      'التاريخ': dateStr,
      'الوقت': timeStr,
      'نوع الطلب': typeArabic,
      'مصدر الطلب': sourceArabic,
      'الطاولة / العنوان': tableOrAddress,
      'اسم العميل': info.customerName || '-',
      'هاتف العميل': info.customerPhone || '-',
      'الأصناف والكميات': info.itemsSummary,
      'إجمالي القطع': info.totalItemsCount,
      'قيمة الفاتورة (ج.م)': Number(order.total_price || 0),
      'حالة الدفع': paymentArabic,
      'حالة الطلب': statusArabic,
      'ملاحظات': order.notes || '-'
    };
  });

  // Calculate summary row
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
  const totalPieces = excelRows.reduce((sum, r) => sum + Number(r['إجمالي القطع'] || 0), 0);

  // Add summary row at the end
  if (excelRows.length > 0) {
    excelRows.push({
      'رقم الطلب': 'الإجمالي العام',
      'التاريخ': `${excelRows.length} طلب`,
      'الوقت': '',
      'نوع الطلب': '',
      'مصدر الطلب': '',
      'الطاولة / العنوان': '',
      'اسم العميل': '',
      'هاتف العميل': '',
      'الأصناف والكميات': `إجمالي الأصناف: ${totalPieces}`,
      'إجمالي القطع': totalPieces,
      'قيمة الفاتورة (ج.م)': totalRevenue,
      'حالة الدفع': '',
      'حالة الطلب': '',
      'ملاحظات': `تم التصدير في: ${new Date().toLocaleDateString('ar-EG')}`
    });
  }

  // Build worksheet
  const worksheet = XLSX.utils.json_to_sheet(excelRows);

  // Set column widths for clean readability
  worksheet['!cols'] = [
    { wch: 12 }, // رقم الطلب
    { wch: 14 }, // التاريخ
    { wch: 12 }, // الوقت
    { wch: 18 }, // نوع الطلب
    { wch: 16 }, // مصدر الطلب
    { wch: 22 }, // الطاولة / العنوان
    { wch: 18 }, // اسم العميل
    { wch: 16 }, // هاتف العميل
    { wch: 38 }, // الأصناف والكميات
    { wch: 12 }, // إجمالي القطع
    { wch: 18 }, // قيمة الفاتورة
    { wch: 12 }, // حالة الدفع
    { wch: 14 }, // حالة الطلب
    { wch: 25 }, // ملاحظات
  ];

  // Set RTL direction on worksheet view
  if (!worksheet['!views']) worksheet['!views'] = [];
  worksheet['!views'].push({ RTL: true });

  // Create workbook
  const workbook = XLSX.utils.book_new();
  const sheetName = options.restaurantName ? options.restaurantName.substring(0, 25) : 'سجل الطلبات';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Build clean filename
  const now = new Date();
  const dateTag = options.startDate && options.endDate 
    ? `${options.startDate}_إلى_${options.endDate}` 
    : now.toISOString().split('T')[0];

  const safePrefix = options.fileNamePrefix || 'سجل_طلبات';
  const fileName = `${safePrefix}_${dateTag}.xlsx`;

  // Trigger download
  XLSX.writeFile(workbook, fileName);

  return {
    ordersCount: orders.length,
    totalRevenue,
    fileName
  };
}

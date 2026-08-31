import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "categories": "Categories",
      "addToCart": "Add to Cart",
      "notes": "Notes",
      "sugarLevel": "Sugar Level",
      "none": "No Sugar",
      "low": "Low",
      "medium": "Medium",
      "high": "High",
      "cart": "Cart",
      "total": "Total",
      "placeOrder": "Place Order",
      "orderSuccess": "Order placed successfully!",
      "items": "Items",
      "price": "Price",
      "search": "Search menu...",
      "status": "Status",
      "new": "New",
      "preparing": "Preparing",
      "delivered": "Delivered",
      "cancelled": "Cancelled",
      "table": "Table",
      "login": "Login",
      "adminDashboard": "Admin Dashboard",
      "waiterDashboard": "Waiter Dashboard",
      "superAdmin": "Super Admin",
      "addTable": "Add Table",
      "generateQR": "Generate QR",
      "restaurantName": "Restaurant Name",
      "logo": "Logo",
      "colors": "Colors",
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "noItems": "No items found",
      "back": "Back",
      "all": "All",
      "notAvailable": "Currently Unavailable",
      "welcome": "Welcome",
      "discoverMenu": "Discover Menu",
      "specialNotes": "Special Notes",
      "notesPlaceholder": "Any special requirements?",
      "addToOrder": "Add to Order",
      "add": "Add"
    }
  },
  ar: {
    translation: {
      "categories": "التصنيفات",
      "addToCart": "إضافة إلى السلة",
      "notes": "ملاحظات",
      "sugarLevel": "مستوى السكر",
      "none": "بدون سكر",
      "low": "قليل",
      "medium": "متوسط",
      "high": "زيادة",
      "cart": "السلة",
      "total": "الإجمالي",
      "placeOrder": "إتمام الطلب",
      "orderSuccess": "تم تقديم الطلب بنجاح!",
      "items": "أصناف",
      "price": "السعر",
      "search": "بحث في القائمة...",
      "status": "الحالة",
      "new": "جديد",
      "preparing": "قيد التحضير",
      "delivered": "تم التوصيل",
      "cancelled": "ملغي",
      "table": "طاولة",
      "login": "تسجيل الدخول",
      "adminDashboard": "لوحة تحكم المدير",
      "waiterDashboard": "لوحة تحكم النادل",
      "superAdmin": "المسؤول العام",
      "addTable": "إضافة طاولة",
      "generateQR": "إنشاء رمز QR",
      "restaurantName": "اسم المطعم",
      "logo": "الشعار",
      "colors": "الألوان",
      "save": "حفظ",
      "cancel": "إلغاء",
      "delete": "حذف",
      "edit": "تعديل",
      "noItems": "لا توجد عناصر",
      "back": "رجوع",
      "all": "الكل",
      "welcome": "أهلاً بك",
      "discoverMenu": "أكتشف القائمة",
      "notAvailable": "غير متوفر حالياً",
      "specialNotes": "ملاحظات خاصة",
      "notesPlaceholder": "هل هناك أي احتياجات خاصة؟",
      "addToOrder": "إضافة إلى الطلب",
      "add": "إضافة"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;

import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface ProductImageManagerProps {
  currentImageUrl?: string;
  onImageChange: (newUrl: string) => void;
  productId?: string;
  isRTL?: boolean;
}

export const ProductImageManager: React.FC<ProductImageManagerProps> = ({
  currentImageUrl = '',
  onImageChange,
  productId,
  isRTL = true,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>(currentImageUrl);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when prop updates
  React.useEffect(() => {
    setPreviewUrl(currentImageUrl);
  }, [currentImageUrl]);

  const handleFile = async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setUploadError('صيغة الملف غير مدعومة. يرجى اختيار صورة بصيغة (JPG, PNG, WebP).');
      return;
    }

    // Validate size (max 5MB)
    const maxSizeInBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      setUploadError('حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 5 ميجابايت.');
      return;
    }

    setIsUploading(true);

    try {
      // 1. Read as Data URL for instant preview
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        setPreviewUrl(base64Data);

        // 2. Upload to server/Supabase Storage API
        try {
          const res = await fetch('/api/admin/upload-product-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_data: base64Data,
              file_name: file.name,
              mime_type: file.type,
              product_id: productId,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'فشل في رفع الصورة');
          }

          const data = await res.json();
          const finalUrl = data.image_url || base64Data;
          setPreviewUrl(finalUrl);
          onImageChange(finalUrl);
          setUploadSuccess('تم رفع وتعيين صورة المنتج بنجاح!');
          setTimeout(() => setUploadSuccess(null), 4000);
        } catch (apiErr: any) {
          // If server upload failed, we can still use the base64Data safely so the user is not blocked
          console.warn('Upload API notice, using data URL:', apiErr);
          onImageChange(base64Data);
          setUploadSuccess('تم حفظ الصورة محلياً بنجاح.');
          setTimeout(() => setUploadSuccess(null), 3000);
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        setUploadError('تعذر قراءة ملف الصورة. يرجى المحاولة مرة أخرى.');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err.message || 'حدث خطأ غير متوقع أثناء معالجة الصورة.');
      setIsUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl('');
    onImageChange('');
    setUploadError(null);
    setUploadSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">
        صورة المنتج {isRTL ? '(اختيارية)' : '(Optional)'}
      </label>

      {/* Upload & Preview Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col sm:flex-row items-center gap-4 cursor-pointer overflow-hidden ${
          isDragging
            ? 'border-amber-500 bg-amber-50/70'
            : previewUrl
            ? 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
            : 'border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/jpg"
          onChange={handleInputChange}
          className="hidden"
        />

        {/* Thumbnail Preview or Placeholder */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center shadow-inner">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="معاينة المنتج"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback on broken image
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
              <ImageIcon size={32} className="mb-1 text-slate-300" />
              <span className="text-[10px] font-bold">لا توجد صورة</span>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white">
              <Loader2 size={24} className="animate-spin text-amber-400 mb-1" />
              <span className="text-[10px] font-bold">جاري الرفع...</span>
            </div>
          )}
        </div>

        {/* Action & Info Area */}
        <div className="flex-1 text-right flex flex-col justify-center space-y-1.5 w-full">
          {previewUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 size={13} />
                  <span>تم تعيين صورة للمنتج</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                انقر في أي مكان لتغيير الصورة، أو استخدم الزر أدناه لحذفها.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={isUploading}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  <span>تغيير الصورة</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={isUploading}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <X size={13} />
                  <span>حذف الصورة</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-1">
                <Upload size={16} className="text-amber-500" />
                <span>اختر صورة أو اسحبها وأفلتها هنا</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                يدعم صيغ JPG و PNG و WebP بحجم أقصى 5 ميجابايت. ستظهر الصورة تلقائياً في شاشة الكاشير وتطبيق الزبائن.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* URL Direct Input (Optional alternative) */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="أو الصق رابط صورة مباشر هنا (https://...)"
          value={previewUrl.startsWith('data:') ? '' : previewUrl}
          onChange={(e) => {
            const val = e.target.value.trim();
            setPreviewUrl(val);
            onImageChange(val);
          }}
          className="flex-1 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none"
        />
      </div>

      {/* Upload Feedback Messages */}
      {uploadError && (
        <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
          <AlertCircle size={15} className="shrink-0 text-rose-600" />
          <span>{uploadError}</span>
        </div>
      )}
      {uploadSuccess && (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
          <span>{uploadSuccess}</span>
        </div>
      )}
    </div>
  );
};

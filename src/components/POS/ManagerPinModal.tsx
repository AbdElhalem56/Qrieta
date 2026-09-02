import React, { useState } from 'react';
import { X, ShieldAlert, KeyRound, CheckCircle2 } from 'lucide-react';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  onSuccess: () => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  title = 'مطلوب إذن المدير / المشرف',
  description = 'يرجى إدخال الرقم السري (PIN) للتأكيد وتخويل هذه العملية',
  onSuccess,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleVerify = () => {
    // Default PIN: 1234 or 0000 or custom
    if (pin === '1234' || pin === '0000' || pin === '9999') {
      onSuccess();
      onClose();
    } else {
      setError('الرقم السري غير صحيح (جرب 1234)');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <KeyRound size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
              <p className="text-[11px] text-slate-500">تصريح مدير الفرع</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 bg-slate-50">
          <p className="text-xs text-center text-slate-600">{description}</p>

          {/* PIN Indicators */}
          <div className="flex justify-center items-center gap-3 py-2">
            {[0, 1, 2, 3].map(idx => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all ${
                  pin.length > idx ? 'bg-amber-500 scale-110 shadow-sm' : 'bg-slate-300'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-rose-600 text-center font-bold bg-rose-50 border border-rose-200 py-1.5 rounded-xl">
              {error}
            </p>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="h-12 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold text-lg rounded-2xl shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-2xl active:scale-95 transition-all cursor-pointer"
            >
              مسح
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-12 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold text-lg rounded-2xl shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleVerify}
              disabled={pin.length < 4}
              className="h-12 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold text-xs rounded-2xl shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              <CheckCircle2 size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

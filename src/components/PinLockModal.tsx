import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, Delete, LogOut, Check, AlertCircle } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface PinLockModalProps {
  user: any;
  services: { db: any; auth: any };
  onUnlock: () => void;
  onLogout: () => void;
}

// SHA-256 with salt helper
export async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}:hayat_online_secure_app_2026`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateRandomSalt(): string {
  const arr = new Uint8Array(16);
  window.crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function PinLockModal({ user, services, onUnlock, onLogout }: PinLockModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [setupStep, setSetupStep] = useState<'create' | 'confirm'>('create');
  const [storedData, setStoredData] = useState<{ pinHash: string; salt: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Check if PIN exists in Firestore
  const [loadError, setLoadError] = useState<string | null>(null);

  const checkPinStatus = async () => {
    if (!user || user.isLocalGuest || !services.db) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const userDocRef = doc(services.db, 'users', user.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists() && snap.data().pinHash && snap.data().salt) {
        setStoredData({
          pinHash: snap.data().pinHash,
          salt: snap.data().salt
        });
        setIsSetupMode(false);
      } else {
        setIsSetupMode(true);
        setSetupStep('create');
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Error loading PIN config:", err);
      setLoadError("تعذّر الاتصال بقاعدة البيانات للتحقق من الرمز السري.");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkPinStatus();
  }, [user, services.db]);

  const handleKeyPress = (num: string) => {
    setErrorMsg(null);
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        handleComplete(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setErrorMsg(null);
    setPin(prev => prev.slice(0, -1));
  };

  const handleComplete = async (enteredPin: string) => {
    if (isSetupMode) {
      if (setupStep === 'create') {
        setConfirmPin(enteredPin);
        setPin('');
        setSetupStep('confirm');
      } else {
        // Confirmation step
        if (enteredPin !== confirmPin) {
          setErrorMsg('الرمزان غير متطابقين، يرجى المحاولة مجدداً');
          setPin('');
          setConfirmPin('');
          setSetupStep('create');
          return;
        }
        // Save new PIN
        setIsLoading(true);
        try {
          const salt = generateRandomSalt();
          const pinHash = await hashPinWithSalt(enteredPin, salt);
          const userDocRef = doc(services.db, 'users', user.uid);
          await setDoc(userDocRef, {
            pinHash,
            salt,
            updatedAt: serverTimestamp()
          }, { merge: true });

          setIsSuccess(true);
          setTimeout(() => {
            onUnlock();
          }, 400);
        } catch (err: any) {
          setErrorMsg('فشل حفظ الرمز السري، يرجى التحقق من الاتصال');
          setIsLoading(false);
        }
      }
    } else {
      // Verification mode
      if (!storedData) return;
      setIsLoading(true);
      try {
        const computedHash = await hashPinWithSalt(enteredPin, storedData.salt);
        if (computedHash === storedData.pinHash) {
          setIsSuccess(true);
          setTimeout(() => {
            onUnlock();
          }, 350);
        } else {
          setErrorMsg('الرمز السري غير صحيح');
          setPin('');
          setIsLoading(false);
        }
      } catch (err) {
        setErrorMsg('حدث خطأ أثناء التحقق');
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-indigo-100 p-8 text-center relative overflow-hidden"
      >
        {/* Top Decorative Header */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-purple-900 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-purple-900/25">
          {isSuccess ? <Check size={32} className="text-emerald-300" /> : <Lock size={28} />}
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-1">
          {isSetupMode
            ? (setupStep === 'create' ? 'إنشاء رمز سري جديد' : 'تأكيد الرمز السري')
            : 'تأكيد الرمز السري'}
        </h2>
        <p className="text-xs text-slate-600 mb-6 font-medium">
          {isSetupMode
            ? (setupStep === 'create' ? 'عيّن رمزاً مكوناً من 4 أرقام لحماية حسابك' : 'أعد إدخال نفس الرمز للتأكيد')
            : 'أدخل الرمز السري المكون من 4 أرقام لمتابعة استخدام النظام'}
        </p>

        {/* PIN Indicators */}
        <div className="flex justify-center items-center gap-4 mb-6">
          {[0, 1, 2, 3].map(idx => (
            <motion.div
              key={idx}
              animate={{
                scale: pin.length > idx ? 1.15 : 1,
                borderColor: pin.length > idx ? '#6D28D9' : '#CBD5E1',
                backgroundColor: pin.length > idx ? '#6D28D9' : '#F8FAFC'
              }}
              transition={{ duration: 0.15 }}
              className="w-4 h-4 rounded-full border-2"
            />
          ))}
        </div>

        {/* Error message */}
        {loadError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-2 text-xs text-rose-600 font-bold mb-4 bg-rose-50 p-2.5 rounded-xl border border-rose-100"
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle size={14} />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={checkPinStatus}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-lg transition-all"
            >
              إعادة المحاولة
            </button>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-1.5 text-xs text-rose-600 font-bold mb-4 bg-rose-50 p-2.5 rounded-xl border border-rose-100"
          >
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 mb-6 select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              disabled={isLoading}
              onClick={() => handleKeyPress(num)}
              className="h-14 rounded-2xl bg-slate-50 hover:bg-purple-50 text-slate-800 hover:text-purple-950 font-bold text-xl transition-all active:scale-95 border border-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          <div className="flex items-center justify-center">
            {isSetupMode && setupStep === 'confirm' && (
              <button
                type="button"
                onClick={() => {
                  setSetupStep('create');
                  setPin('');
                  setConfirmPin('');
                }}
                className="text-[11px] text-purple-700 font-bold underline"
              >
                رجوع
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleKeyPress('0')}
            className="h-14 rounded-2xl bg-slate-50 hover:bg-purple-50 text-slate-800 hover:text-purple-950 font-bold text-xl transition-all active:scale-95 border border-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            disabled={isLoading || pin.length === 0}
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold transition-all active:scale-95 border border-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-40"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Footer info & Logout */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="truncate max-w-[170px] text-right font-medium">
            {user?.email || user?.displayName}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span>تسجيل خروج</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

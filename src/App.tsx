/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './components/Logo';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc, 
  getDoc,
  setDoc, 
  deleteDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { db as initialDb, auth as initialAuth, initFirebase } from './firebase';
import { 
  LayoutDashboard, 
  Receipt, 
  TrendingUp, 
  Trash2, 
  Plus, 
  LogOut, 
  User as UserIcon, 
  ShoppingBag, 
  Target, 
  AlertTriangle, 
  FileBarChart, 
  Settings, 
  Printer, 
  Search, 
  CreditCard, 
  X, 
  Menu, 
  AlertCircle, 
  PieChart as PieChartIcon, 
  Download, 
  Image as ImageIcon 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area 
} from 'recharts';
import { 
  BudgetTarget, 
  Expense, 
  Revenue, 
  WasteItem, 
  Category, 
  ProductType, 
  Invoice 
} from './types';
import { ALLOWED_EMAILS, isEmailAllowed, getAuthorDisplayName } from './config';
import { cleanOklColorsAndPatchGetComputedStyle } from './utils/canvasExport';
import { DialogModal, DialogState } from './components/ConfirmModal';
import PinLockModal from './components/PinLockModal';
import BudgetComparisonChart from './components/BudgetComparisonChart';

// Lazy-loaded views for code splitting
const InvoicesView = React.lazy(() => import('./components/InvoicesView'));
const ReportsView = React.lazy(() => import('./components/ReportsView'));

// --- Helpers ---

const safeFormat = (dateStr: string | undefined | null, formatStr: string) => {
  if (!dateStr) return '---';
  try {
    const date = parseISO(dateStr);
    if (isNaN(date.getTime())) return '---';
    return format(date, formatStr, { locale: arSA });
  } catch (e) {
    return '---';
  }
};

const translateCategory = (cat: string) => {
  const map: Record<string, string> = {
    materials: 'خامات أولية',
    marketing: 'حملات تسويقية',
    maintenance: 'صيانة وتشغيل',
    wages: 'أجور وتكليفات',
    other: 'مصاريف عامة'
  };
  return map[cat] || cat;
};

const translateProduct = (type: string) => {
  const map: Record<string, string> = {
    acrylic: 'منتجات أكريليك',
    wood: 'منتجات خشبية',
    svg: 'ملفات رقمية (SVG)',
    other: 'منتج آخر'
  };
  return map[type] || type;
};

const translatePaymentMethod = (method: string) => {
  const map: Record<string, string> = {
    cash: 'نقدًا',
    mada: 'مدى',
    visa_master: 'فيزا / ماستركارد',
    apple_pay: 'أبل باي',
    bank_transfer: 'تحويل بنكي'
  };
  return map[method] || 'نقدًا';
};

const generateCashFlowTrend = (revenues: any[], expenses: any[]) => {
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = format(d, 'yyyy-MM');
    const rev = revenues.filter(r => r.date && r.date.startsWith(monthStr)).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const exp = expenses.filter(e => e.date && e.date.startsWith(monthStr)).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    trend.push({ month: format(d, 'MMM', { locale: arSA }), net: rev - exp });
  }
  return trend;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [services, setServices] = useState<{ db: any, auth: any }>({ db: initialDb, auth: initialAuth });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'revenues' | 'budget' | 'waste' | 'reports' | 'settings' | 'invoices'>('dashboard');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  // App PIN Lock state
  const [isPinUnlocked, setIsPinUnlocked] = useState(false);

  // Reusable Dialog state replacing alert/confirm
  const [dialog, setDialog] = useState<DialogState | null>(null);

  // Settings State
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('hayat_finance_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      storeName: 'حياة ديزاين',
      isTaxRegistered: false,
      taxRate: 15,
      taxNumber: '',
      currency: 'SAR',
      contactPhone: '',
      address: 'المملكة العربية السعودية',
      showPaymentMethodGraph: true
    };
  });

  const [budgets, setBudgets] = useState<BudgetTarget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [waste, setWaste] = useState<WasteItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // 1. Settings Migration to Firestore users/{uid}/settings/store
  useEffect(() => {
    if (!user || (user as any).isLocalGuest || !services.db) return;

    let isMounted = true;
    async function syncUserSettings() {
      try {
        const settingsDocRef = doc(services.db, 'users', user.uid, 'settings', 'store');
        const snap = await getDoc(settingsDocRef);
        if (snap.exists()) {
          if (isMounted) setSettings(snap.data());
        } else {
          // First time: migrate local settings to Firestore then clear localStorage
          const localSaved = localStorage.getItem('hayat_finance_settings');
          let initialSettingsToSave = settings;
          if (localSaved) {
            try {
              initialSettingsToSave = JSON.parse(localSaved);
            } catch (e) {}
          }
          await setDoc(settingsDocRef, initialSettingsToSave, { merge: true });
          localStorage.removeItem('hayat_finance_settings');
          if (isMounted) setSettings(initialSettingsToSave);
        }
      } catch (err) {
        console.error("Settings sync error:", err);
      }
    }

    syncUserSettings();
    return () => { isMounted = false; };
  }, [user, services.db]);

  // Update Settings handler (Firestore for auth users, localStorage for guests)
  const updateSettings = async (newSettings: any) => {
    setSettings(newSettings);
    if (user && !(user as any).isLocalGuest && services.db) {
      try {
        const settingsDocRef = doc(services.db, 'users', user.uid, 'settings', 'store');
        await setDoc(settingsDocRef, newSettings, { merge: true });
      } catch (err) {
        console.error('Failed to save settings to Firestore:', err);
      }
    } else {
      localStorage.setItem('hayat_finance_settings', JSON.stringify(newSettings));
    }
  };

  // 2. Auto-lock after 5 minutes in background
  useEffect(() => {
    let backgroundTime: number | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (backgroundTime && (Date.now() - backgroundTime > 5 * 60 * 1000)) {
          setIsPinUnlocked(false);
        }
        backgroundTime = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadLocalData = () => {
    const rawBudgets = localStorage.getItem('local_budgets');
    const rawExpenses = localStorage.getItem('local_expenses');
    const rawRevenues = localStorage.getItem('local_revenues');
    const rawWastes = localStorage.getItem('local_wastes');
    const rawInvoices = localStorage.getItem('local_invoices');

    if (!rawBudgets && !rawExpenses && !rawRevenues) {
      const now = new Date();
      const monthStr = format(now, 'yyyy-MM');
      const isoDate = now.toISOString();

      const defaultRevenues = [
        { id: 'rev-1', productType: 'acrylic' as any, amount: 4500, orderNumber: '1001', date: isoDate, description: 'مشروع لوحات أكريليك لمكتب هندسي', paymentMethod: 'bank_transfer', userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any },
        { id: 'rev-2', productType: 'wood' as any, amount: 3200, orderNumber: '1002', date: isoDate, description: 'صواني خطوبة خشبية مخصصة للعميل', paymentMethod: 'mada', userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any },
        { id: 'rev-3', productType: 'svg' as any, amount: 850, orderNumber: '1003', date: isoDate, description: 'تصميم هوية بصرية متكاملة', paymentMethod: 'apple_pay', userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any }
      ];

      const defaultExpenses = [
        { id: 'exp-1', category: 'materials' as any, amount: 1200, date: isoDate, description: 'شراء ألواح خشب ومواد خام', userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any },
        { id: 'exp-2', category: 'marketing' as any, amount: 450, date: isoDate, description: 'إعلانات ممولة تيك توك وسناب', userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any },
        { id: 'exp-3', category: 'wages' as any, amount: 1500, date: isoDate, description: 'أجور عمال الصنفرة والتجميع', userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any }
      ];

      const defaultBudgets = [
        { id: 'bud-1', category: 'materials' as any, amount: 5000, month: monthStr, userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any },
        { id: 'bud-2', category: 'marketing' as any, amount: 1500, month: monthStr, userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any },
        { id: 'bud-3', category: 'wages' as any, amount: 4000, month: monthStr, userId: 'guest-development-user-id', createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any }
      ];

      const defaultInvoices = [
        {
          id: 'local-inv-1',
          invoiceNumber: 'INV-2026-001',
          customerName: 'شركة السديم للفندقة',
          customerPhone: '0500000000',
          date: format(now, 'yyyy-MM-dd'),
          dueDate: format(new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
          notes: 'يرجى سداد المبلغ المتبقي خلال ١٥ يوماً من تاريخ التوريد.',
          logoPreset: 'preset1',
          items: [
            { id: 'item-1', name: 'طاولة استقبال أكريليك فاخرة مع طباعة شعار المتجر بالذهب', quantity: 1, price: 3500, total: 3500 },
            { id: 'item-2', name: 'ستاند لوحات طاولات خشب طبيعي مع إطار زجاجي', quantity: 10, price: 100, total: 1000 }
          ],
          subtotal: 4500,
          taxRate: 0,
          taxAmount: 0,
          discount: 250,
          grandTotal: 4250,
          userId: 'guest-development-user-id',
          createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any
        }
      ];

      localStorage.setItem('local_budgets', JSON.stringify(defaultBudgets));
      localStorage.setItem('local_expenses', JSON.stringify(defaultExpenses));
      localStorage.setItem('local_revenues', JSON.stringify(defaultRevenues));
      localStorage.setItem('local_wastes', JSON.stringify([]));
      localStorage.setItem('local_invoices', JSON.stringify(defaultInvoices));

      setBudgets(defaultBudgets);
      setExpenses(defaultExpenses);
      setRevenues(defaultRevenues);
      setWaste([]);
      setInvoices(defaultInvoices);
    } else {
      setBudgets(JSON.parse(rawBudgets || '[]'));
      setExpenses(JSON.parse(rawExpenses || '[]'));
      setRevenues(JSON.parse(rawRevenues || '[]'));
      setWaste(JSON.parse(rawWastes || '[]'));
      setInvoices(JSON.parse(rawInvoices || '[]'));
    }
  };

  useEffect(() => {
    if ((user as any)?.isLocalGuest) {
      loadLocalData();
      window.addEventListener('localDataChanged', loadLocalData);
      return () => {
        window.removeEventListener('localDataChanged', loadLocalData);
      };
    }
  }, [user]);

  // Init Firebase & Auth State Listeners
  useEffect(() => {
    async function setup() {
      const { db: newDb, auth: newAuth } = await initFirebase();
      setServices({ db: newDb, auth: newAuth });
      
      if (newAuth) {
        onAuthStateChanged(newAuth, async (u) => {
          if (u) {
            // Strictly enforce email whitelist
            if (!isEmailAllowed(u.email)) {
              await signOut(newAuth);
              setUser(null);
              setIsPinUnlocked(false);
              setLoginError('هذا الحساب غير مصرّح له');
              setLoading(false);
              return;
            }
            setUser(u);
            setLoginError(null);
          } else {
            setUser(current => {
              if (current && (current as any).isLocalGuest) return current;
              return null;
            });
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }
    setup();
  }, []);

  // Data Fetching: Shared ledger for allowed users once logged in, verified, and unlocked via PIN
  useEffect(() => {
    if (!user || (user as any).isLocalGuest || !services.db) return;
    if (!isEmailAllowed(user.email) || !isPinUnlocked) return;

    const unsubBudgets = onSnapshot(
      collection(services.db, 'budgets'),
      (snap) => {
        setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetTarget)));
      },
      (err) => console.error("Budgets listener error:", err)
    );

    const unsubExpenses = onSnapshot(
      collection(services.db, 'expenses'),
      (snap) => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      },
      (err) => console.error("Expenses listener error:", err)
    );

    const unsubRevenues = onSnapshot(
      collection(services.db, 'revenues'),
      (snap) => {
        setRevenues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Revenue)));
      },
      (err) => console.error("Revenues listener error:", err)
    );

    const unsubWaste = onSnapshot(
      collection(services.db, 'wastes'),
      (snap) => {
        setWaste(snap.docs.map(d => ({ id: d.id, ...d.data() } as WasteItem)));
      },
      (err) => console.error("Wastes listener error:", err)
    );

    const unsubInvoices = onSnapshot(
      collection(services.db, 'invoices'),
      (snap) => {
        const parsedInvoices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
        setInvoices(parsedInvoices);
      },
      (err) => console.error("Invoices listener error:", err)
    );

    return () => {
      unsubBudgets();
      unsubExpenses();
      unsubRevenues();
      unsubWaste();
      unsubInvoices();
    };
  }, [user, isPinUnlocked, services.db]);

  const handleSeedData = () => {
    if (!user) return;
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'استعادة البيانات التجريبية',
      message: 'هل تريد استعادة البيانات التجريبية؟ سيتم إضافة سجلات جديدة لمساعدتك في تجربة لوحة التحكم.',
      confirmLabel: 'نعم، استعادة',
      cancelLabel: 'إلغاء',
      onConfirm: async () => {
        try {
          const now = new Date();
          const monthStr = format(now, 'yyyy-MM');
          const isoDate = now.toISOString();

          const sampleRevenues = [
            { productType: 'acrylic', amount: 450, orderNumber: '1001', date: isoDate, description: 'لوحة مكتبية أكريليك' },
            { productType: 'wood', amount: 1200, orderNumber: '1002', date: isoDate, description: 'صينية ضيافة خشب' },
            { productType: 'svg', amount: 80, orderNumber: '1003', date: isoDate, description: 'تصميم شعار SVG' }
          ];

          const sampleExpenses = [
            { category: 'materials', amount: 300, date: isoDate, description: 'شراء خشب زان' },
            { category: 'marketing', amount: 150, date: isoDate, description: 'إعلان انستقرام' }
          ];

          const sampleBudgets = [
            { category: 'materials', amount: 5000, month: monthStr },
            { category: 'marketing', amount: 1000, month: monthStr },
            { category: 'wages', amount: 3000, month: monthStr }
          ];

          if ((user as any)?.isLocalGuest) {
            const localRevenues = JSON.parse(localStorage.getItem('local_revenues') || '[]');
            const localExpenses = JSON.parse(localStorage.getItem('local_expenses') || '[]');
            const localBudgets = JSON.parse(localStorage.getItem('local_budgets') || '[]');

            sampleRevenues.forEach((r, idx) => {
              localRevenues.push({ id: `seed-rev-${Date.now()}-${idx}`, ...r, userId: user.uid });
            });
            sampleExpenses.forEach((e, idx) => {
              localExpenses.push({ id: `seed-exp-${Date.now()}-${idx}`, ...e, userId: user.uid });
            });
            sampleBudgets.forEach((b, idx) => {
              localBudgets.push({ id: `seed-bud-${Date.now()}-${idx}`, ...b, userId: user.uid });
            });

            localStorage.setItem('local_revenues', JSON.stringify(localRevenues));
            localStorage.setItem('local_expenses', JSON.stringify(localExpenses));
            localStorage.setItem('local_budgets', JSON.stringify(localBudgets));
            window.dispatchEvent(new Event('localDataChanged'));

            setDialog({
              isOpen: true,
              type: 'success',
              title: 'نجاح العملية',
              message: 'تمت استعادة البيانات بنجاح في ذاكرة المتصفح المحلية'
            });
            return;
          }

          for (const r of sampleRevenues) await addDoc(collection(services.db, 'revenues'), { ...r, userId: user.uid, createdByEmail: user.email || '', createdAt: serverTimestamp() });
          for (const e of sampleExpenses) await addDoc(collection(services.db, 'expenses'), { ...e, userId: user.uid, createdByEmail: user.email || '', createdAt: serverTimestamp() });
          for (const b of sampleBudgets) await addDoc(collection(services.db, 'budgets'), { ...b, userId: user.uid, createdByEmail: user.email || '', createdAt: serverTimestamp() });

          setDialog({
            isOpen: true,
            type: 'success',
            title: 'نجاح العملية',
            message: 'تمت إضافة البيانات التجريبية بنجاح إلى حسابك'
          });
        } catch (err) {
          console.error(err);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'خطأ',
            message: 'فشل في إضافة البيانات التجريبية'
          });
        }
      }
    });
  };

  const handleLogin = async () => {
    if (!services.auth) return;
    try {
      setLoginError(null);
      const res = await signInWithPopup(services.auth, new GoogleAuthProvider());
      if (res.user && !isEmailAllowed(res.user.email)) {
        await signOut(services.auth);
        setUser(null);
        setIsPinUnlocked(false);
        setLoginError('هذا الحساب غير مصرّح له');
      }
    } catch (err: any) {
      console.error("Firebase Login Error:", err);
      const code = err?.code || '';
      const message = err?.message || String(err);
      if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain')) {
        setLoginError('unauthorized-domain');
      } else {
        setLoginError(message);
      }
    }
  };

  const handleLogout = () => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'تسجيل الخروج',
      message: 'هل أنت متأكد من رغبتك في تسجيل الخروج من النظام المالي؟',
      confirmLabel: 'تسجيل خروج',
      cancelLabel: 'إلغاء',
      onConfirm: () => {
        setIsPinUnlocked(false);
        if ((user as any)?.isLocalGuest) {
          setUser(null);
          return;
        }
        services.auth && signOut(services.auth);
        setUser(null);
      }
    });
  };

  const handleGuestLogin = () => {
    setUser({
      uid: 'guest-development-user-id',
      displayName: 'مُصمم زائر (بيئة تجريبية)',
      email: 'guest@hayat-design.com',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    } as any);
    setTimeout(() => {
      setUser(current => {
        if (current) {
          return { ...current, isLocalGuest: true };
        }
        return null;
      });
      setIsPinUnlocked(true); // Guests bypass cloud PIN
    }, 10);
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-hayat-cream font-sans text-sm font-bold text-slate-600">جاري التحميل...</div>;

  if (!services.auth || !services.db) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-hayat-cream font-sans p-6 text-center">
        <AlertTriangle size={48} className="text-amber-600 mb-4" />
        <h1 className="font-serif text-3xl mb-2 text-hayat-navy">يجب تفعيل قاعدة البيانات</h1>
        <p className="text-slate-600 text-sm">يرجى التحقق من اتصال قاعدة بيانات Firebase للبدء.</p>
      </div>
    );
  }

  // Login Screen
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-hayat-cream font-sans p-6 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-900/5 rounded-full blur-3xl"></div>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-md w-full bg-white p-8 sm:p-10 rounded-[3rem] shadow-hayat-lg border border-indigo-100/60 relative z-10 text-center"
        >
          <div className="flex flex-col items-center mb-6">
            <motion.div
              initial={{ rotate: -10, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Logo className="w-20 h-20 mb-4 drop-shadow-sm" />
            </motion.div>
            <h1 className="font-serif text-3xl sm:text-4xl text-hayat-navy mb-1 tracking-tight">حياة أونلاين</h1>
            <p className="text-xs font-bold text-purple-900">النظام المالي الذكي</p>
          </div>
          
          <div className="space-y-4">
            <p className="text-slate-600 text-sm leading-relaxed px-2">
              إدارة الفواتير، تتبع التدفقات النقدية، الميزانية، وتحليل كفاءة الإنتاج.
            </p>

            {/* Error Message */}
            {loginError && (
              <div className={`p-4 rounded-2xl text-right space-y-2 border ${
                loginError === 'هذا الحساب غير مصرّح له'
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 text-rose-600" />
                  <span>
                    {loginError === 'هذا الحساب غير مصرّح له'
                      ? 'هذا الحساب غير مصرّح له'
                      : 'عذراً، النطاق غير مصرح له في إعدادات Firebase'}
                  </span>
                </div>
                {loginError === 'هذا الحساب غير مصرّح له' ? (
                  <p className="text-xs text-rose-800 leading-relaxed">
                    الدخول متاح فقط للحسابات الإدارية المعتمدة في النظام.
                  </p>
                ) : (
                  <p className="text-xs text-amber-800 leading-relaxed">
                    يرجى إضافة النطاق ({window.location.hostname}) إلى Authorized Domains في Firebase Console.
                  </p>
                )}
              </div>
            )}
            
            <button 
              onClick={handleLogin}
              aria-label="الدخول بحساب Google"
              className="w-full bg-purple-950 hover:bg-purple-900 text-white py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-bold text-sm shadow-md active:scale-95 cursor-pointer"
            >
              <div className="bg-white/15 p-1.5 rounded-lg">
                <UserIcon size={18} />
              </div>
              الدخول باستخدام حساب Google
            </button>

            <button 
              onClick={handleGuestLogin}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors font-bold text-xs border border-slate-200 active:scale-95 cursor-pointer"
            >
              <span>🚀 تجربة لوحة التحكم (وضع تجريبي محلي)</span>
            </button>
          </div>
        </motion.div>

        {/* Dialog Modal */}
        <DialogModal dialog={dialog} onClose={() => setDialog(null)} />
      </div>
    );
  }

  // App PIN Lock Screen (for authenticated users)
  if (!isPinUnlocked && !(user as any).isLocalGuest) {
    return (
      <PinLockModal 
        user={user}
        services={services}
        onUnlock={() => setIsPinUnlocked(true)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-hayat-cream font-sans text-stone-800 rtl md:flex flex-col" dir="rtl">
      {/* 3. Prominent Banner for Guest Mode */}
      {(user as any)?.isLocalGuest && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2.5 text-center text-amber-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm z-50">
          <AlertTriangle size={18} className="text-amber-700 flex-shrink-0" />
          <span>وضع تجريبي - البيانات محفوظة في هذا الجهاز فقط</span>
        </div>
      )}

      <div className="flex-1 md:flex">
        {/* Mobile Top Header */}
        <header className="md:hidden bg-white/95 backdrop-blur-lg border-b border-hayat-border/40 sticky top-0 px-4 sm:px-6 py-3.5 flex justify-between items-center z-40 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Logo className="w-8 h-8 flex-shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-serif text-base text-hayat-navy font-bold leading-tight">{settings.storeName}</h1>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">نشط</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('settings')}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-l border-hayat-border/60 min-h-screen p-6 sticky top-0 h-screen select-none">
          <div className="flex items-center gap-3 mb-10 px-2">
            <Logo className="w-10 h-10" />
            <div>
              <h1 className="font-serif text-lg font-bold text-hayat-navy leading-tight">{settings.storeName}</h1>
              <p className="text-xs font-bold text-purple-900">النظام المالي الذكي</p>
            </div>
          </div>

          <nav className="space-y-1.5 flex-1">
            <NavItem icon={<LayoutDashboard size={18} />} label="لوحة التحكم" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon={<TrendingUp size={18} />} label="المبيعات" active={activeTab === 'revenues'} onClick={() => setActiveTab('revenues')} />
            <NavItem icon={<Receipt size={18} />} label="المصاريف" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
            <NavItem icon={<CreditCard size={18} />} label="الفواتير" active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} />
            <NavItem icon={<Target size={18} />} label="الميزانية" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
            <NavItem icon={<AlertTriangle size={18} />} label="الهدر" active={activeTab === 'waste'} onClick={() => setActiveTab('waste')} />
            <NavItem icon={<FileBarChart size={18} />} label="التقارير" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
            <NavItem icon={<Settings size={18} />} label="الإعدادات" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </nav>

          <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-900 font-bold text-xs">
                {user.displayName?.[0] || 'ح'}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-slate-800 truncate">{user.displayName}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              title="تسجيل الخروج"
              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-8 md:p-10 max-w-7xl mx-auto w-full pb-24 md:pb-10">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                ref={dashboardRef}
              >
                <DashboardHeader 
                  user={user} 
                  budgets={budgets} 
                  expenses={expenses} 
                  revenues={revenues} 
                  waste={waste} 
                  dashboardRef={dashboardRef} 
                  onSeedData={handleSeedData}
                  settings={settings}
                />
                
                <DashboardContent budgets={budgets} expenses={expenses} revenues={revenues} waste={waste} settings={settings} />
              </motion.div>
            )}

            {activeTab === 'expenses' && (
              <DataListSection 
                title="إدارة المصاريف" 
                type="expense" 
                items={expenses} 
                user={user} 
                services={services} 
                settings={settings} 
                setDialog={setDialog}
              />
            )}

            {activeTab === 'revenues' && (
              <DataListSection 
                title="إدارة المبيعات" 
                type="revenue" 
                items={revenues} 
                user={user} 
                services={services} 
                settings={settings} 
                setDialog={setDialog}
              />
            )}

            {activeTab === 'invoices' && (
              <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold text-slate-600">جاري تحميل الفواتير...</div>}>
                <InvoicesView invoices={invoices} user={user} services={services} settings={settings} />
              </React.Suspense>
            )}

            {activeTab === 'budget' && (
              <DataListSection 
                title="تخطيط الميزانية" 
                type="budget" 
                items={budgets} 
                user={user} 
                services={services} 
                settings={settings} 
                budgets={budgets}
                expenses={expenses}
                setDialog={setDialog}
              />
            )}

            {activeTab === 'waste' && (
              <DataListSection 
                title="تتبع الهدر" 
                type="waste" 
                items={waste} 
                user={user} 
                services={services} 
                settings={settings} 
                setDialog={setDialog}
              />
            )}

            {activeTab === 'reports' && (
              <React.Suspense fallback={<div className="p-12 text-center text-sm font-bold text-slate-600">جاري تحميل التقارير...</div>}>
                <ReportsView 
                  expenses={expenses} 
                  revenues={revenues} 
                  budgets={budgets} 
                  waste={waste} 
                  setActiveTab={setActiveTab} 
                  settings={settings} 
                />
              </React.Suspense>
            )}

            {activeTab === 'settings' && (
              <SettingsView settings={settings} setSettings={updateSettings} />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex justify-around items-center z-40 select-none pb-safe">
        <MobileTabButton icon={<LayoutDashboard size={18} />} label="الرئيسية" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileTabButton icon={<TrendingUp size={18} />} label="المبيعات" active={activeTab === 'revenues'} onClick={() => setActiveTab('revenues')} />
        <MobileTabButton icon={<Receipt size={18} />} label="المصاريف" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
        <MobileTabButton icon={<CreditCard size={18} />} label="الفواتير" active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} />
        <MobileTabButton icon={<Target size={18} />} label="الميزانية" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
        <MobileTabButton icon={<FileBarChart size={18} />} label="التقارير" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
      </nav>

      {/* Global Dialog Modal */}
      <DialogModal dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl w-full transition-all duration-200 cursor-pointer ${
        active 
          ? 'bg-purple-900 text-white shadow-sm font-bold' 
          : 'hover:bg-slate-100 text-slate-600 hover:text-purple-950 font-semibold'
      }`}
    >
      <span>{icon}</span>
      <span className="font-bold text-sm">{label}</span>
    </button>
  );
}

function MobileTabButton({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center flex-1 py-1 text-center cursor-pointer"
    >
      <div className={`p-1.5 rounded-xl transition-all ${
        active ? 'text-purple-900 bg-purple-50 font-bold' : 'text-slate-500'
      }`}>
        {icon}
      </div>
      <span className={`text-[10px] mt-0.5 ${active ? 'text-purple-900 font-bold' : 'text-slate-500 font-semibold'}`}>{label}</span>
    </button>
  );
}

function DashboardHeader({ user, budgets, expenses, revenues, waste, dashboardRef, onSeedData }: any) {
  const [isExporting, setIsExporting] = useState(false);
  const currentMonth = format(new Date(), 'yyyy-MM');

  const monthRevenues = revenues.filter((r: any) => r.date && r.date.startsWith(currentMonth));
  const monthExpenses = expenses.filter((e: any) => e.date && e.date.startsWith(currentMonth));
  const monthWaste = waste.filter((w: any) => w.date && w.date.startsWith(currentMonth));
  
  const totalRevenue = monthRevenues.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
  const totalExpense = monthExpenses.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
  const netProfit = totalRevenue - totalExpense;
  const totalWaste = monthWaste.reduce((acc: number, curr: any) => acc + (Number(curr.estimatedCost) || 0), 0);

  const exportAsImage = async () => {
    if (!dashboardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F8F7FD',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
        }
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `تقرير_لوحة_التحكم_${currentMonth}.png`;
      link.click();
    } catch (err) {
      console.error("Export image failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsPDF = async () => {
    if (!dashboardRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F8F7FD',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`تقرير_لوحة_التحكم_${currentMonth}.pdf`);
    } catch (err) {
      console.error("Export PDF failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-8 border-b border-indigo-100/60">
        <div>
          <h2 className="font-serif text-3xl md:text-4xl text-hayat-navy mb-2 tracking-tight">
            أهلاً بك، {user.displayName?.split(' ')[0]}
          </h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              النظام نشط
            </span>
            <p className="text-slate-600 font-bold text-xs">
              متابعة الأداء المالي لشهر {format(new Date(), 'MMMM yyyy', { locale: arSA })}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          <button 
            onClick={exportAsPDF}
            disabled={isExporting}
            className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-4"
          >
            <Download size={14} />
            <span>تصدير PDF</span>
          </button>
          <button 
            onClick={exportAsImage}
            disabled={isExporting}
            className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-4"
          >
            <ImageIcon size={14} />
            <span>حفظ كصورة</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="إجمالي المبيعات" value={totalRevenue} color="#059669" />
        <StatCard label="المصاريف الفعلية" value={totalExpense} color="#E11D48" />
        <StatCard label="صافي الربح" value={netProfit} highlight color="#6D28D9" />
        <StatCard label="قيمة الهدر" value={totalWaste} color="#D97706" />
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight, color }: any) {
  return (
    <div 
      className={`p-6 rounded-3xl transition-all border shadow-hayat relative bg-white ${
        highlight ? 'border-purple-300 ring-2 ring-purple-100' : 'border-indigo-50'
      }`}
    >
      <p className="text-xs font-bold text-slate-600 mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: color || '#2E1065' }}>
          {value.toLocaleString()}
        </p>
        <span className="text-xs font-bold text-slate-500">ريال</span>
      </div>
    </div>
  );
}

function DashboardContent({ budgets, expenses, revenues }: any) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  
  const categories: Category[] = ['materials', 'marketing', 'maintenance', 'wages', 'other'];
  const budgetVsActual = categories.map(cat => {
    const target = budgets.find((b: any) => b.category === cat && b.month === currentMonth)?.amount || 0;
    const actual = expenses.filter((e: any) => e.category === cat && e.date && e.date.startsWith(currentMonth))
                           .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
    return { name: translateCategory(cat), target, actual };
  });

  const recentRevenues = [...revenues]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 5);

  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Actual vs Budget */}
        <div className="lg:col-span-2 card-hayat flex flex-col min-h-[460px]">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-bold mb-1 text-hayat-navy">مقارنة الإنفاق</h3>
              <p className="text-xs text-slate-600 font-bold">التقديري مقابل الفعلي</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <div className="w-3 h-3 rounded-sm bg-purple-200"></div> 
                التقديري
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <div className="w-3 h-3 rounded-sm bg-emerald-600"></div> 
                الفعلي
              </div>
            </div>
          </div>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActual} barGap={10}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={13} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis fontSize={12} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                  cursor={{ fill: '#F8F7FD' }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e0e7ff', 
                    padding: '12px'
                  }} 
                />
                <Bar name="الميزانية التقديرية" dataKey="target" fill="#DDD6FE" radius={[6, 6, 0, 0]} barSize={32} />
                <Bar name="المصروف الفعلي" dataKey="actual" fill="#059669" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash Flow Trend */}
        <div className="card-hayat flex flex-col min-h-[460px]">
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-1 text-hayat-navy">حركة التدفق النقدي</h3>
            <p className="text-xs text-slate-600 font-bold">صافي التدفق المالي لآخر 6 أشهر</p>
          </div>
          <div className="flex-grow h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={generateCashFlowTrend(revenues, expenses)}>
                <defs>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" fontSize={12} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis fontSize={12} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" name="صافي التدفق" dataKey="net" stroke="#059669" fill="url(#colorNet)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-hayat">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold mb-1 text-hayat-navy">أحدث الإيرادات</h3>
              <p className="text-xs text-slate-600 font-bold">آخر عمليات المبيعات المسجلة</p>
            </div>
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
          </div>
          <div className="space-y-2">
            {recentRevenues.length > 0 ? recentRevenues.map((r) => (
              <div key={r.id} className="flex justify-between items-center p-3 rounded-2xl hover:bg-slate-50 transition-all border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{translateProduct(r.productType)}</p>
                    <p className="text-xs text-slate-500">{safeFormat(r.date, 'dd MMMM yyyy')}</p>
                  </div>
                </div>
                <div className="text-left font-bold text-sm text-emerald-800 tabular-nums">
                  +{(Number(r.amount) || 0).toLocaleString()} ريال
                </div>
              </div>
            )) : (
              <p className="text-center py-8 text-sm text-slate-500 font-bold">لا توجد مبيعات مسجلة مؤخراً</p>
            )}
          </div>
        </div>

        <div className="card-hayat">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold mb-1 text-hayat-navy">أحدث المصاريف</h3>
              <p className="text-xs text-slate-600 font-bold">آخر بنود النفقات المصروفة</p>
            </div>
            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full"></div>
          </div>
          <div className="space-y-2">
            {recentExpenses.length > 0 ? recentExpenses.map((e) => (
              <div key={e.id} className="flex justify-between items-center p-3 rounded-2xl hover:bg-slate-50 transition-all border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 text-rose-700">
                    <Receipt size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{translateCategory(e.category)}</p>
                    <p className="text-xs text-slate-500">{safeFormat(e.date, 'dd MMMM yyyy')}</p>
                  </div>
                </div>
                <div className="text-left font-bold text-sm text-rose-800 tabular-nums">
                  -{(Number(e.amount) || 0).toLocaleString()} ريال
                </div>
              </div>
            )) : (
              <p className="text-center py-8 text-sm text-slate-500 font-bold">لا توجد مصاريف مسجلة مؤخراً</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataListSection({ 
  title, 
  type, 
  items, 
  user, 
  services, 
  settings,
  budgets = [],
  expenses = [],
  setDialog
}: { 
  title: string, 
  type: 'budget'|'expense'|'revenue'|'waste', 
  items: any[], 
  user: User, 
  services: any, 
  settings: any,
  budgets?: BudgetTarget[],
  expenses?: Expense[],
  setDialog: (d: DialogState | null) => void
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const handleDelete = (id: string) => {
    setDialog({
      isOpen: true,
      type: 'danger',
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من مسح هذا السجل المالي نهائياً؟',
      confirmLabel: 'نعم، احذف',
      cancelLabel: 'إلغاء',
      onConfirm: async () => {
        try {
          if ((user as any)?.isLocalGuest) {
            const collectionName = `${type}s`;
            const localKey = `local_${collectionName}`;
            let existing: any[] = [];
            try {
              existing = JSON.parse(localStorage.getItem(localKey) || '[]');
            } catch (e) {}
            const filtered = existing.filter((item: any) => item.id !== id);
            localStorage.setItem(localKey, JSON.stringify(filtered));
            window.dispatchEvent(new Event('localDataChanged'));
            return;
          }
          await deleteDoc(doc(services.db, `${type}s`, id));
        } catch (e: any) {
          console.error(e);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'خطأ',
            message: e?.message || 'تعذر حذف السجل'
          });
        }
      }
    });
  };

  const filteredItems = React.useMemo(() => {
    return items.filter(item => {
      const textMatch = search === '' ? true : (
        (item.description?.toLowerCase().includes(search.toLowerCase())) ||
        (item.reason?.toLowerCase().includes(search.toLowerCase())) ||
        (item.material?.toLowerCase().includes(search.toLowerCase())) ||
        (item.orderNumber?.toLowerCase().includes(search.toLowerCase())) ||
        (translateCategory(item.category || '').toLowerCase().includes(search.toLowerCase())) ||
        (translateProduct(item.productType || '').toLowerCase().includes(search.toLowerCase()))
      );

      const payMatch = paymentFilter === 'all' ? true : (item.paymentMethod === paymentFilter);

      let dateMatch = true;
      if (type !== 'budget' && item.date) {
        const dStr = item.date.split('T')[0];
        if (dateFrom && dStr < dateFrom) dateMatch = false;
        if (dateTo && dStr > dateTo) dateMatch = false;
      } else if (type === 'budget' && item.month) {
        if (dateFrom && item.month < dateFrom.substring(0, 7)) dateMatch = false;
        if (dateTo && item.month > dateTo.substring(0, 7)) dateMatch = false;
      }

      return textMatch && payMatch && dateMatch;
    });
  }, [items, search, paymentFilter, dateFrom, dateTo, type]);

  return (
    <div className="space-y-8">
      {/* 6. Budget Screen: Comparison Bar Chart */}
      {type === 'budget' && (
        <BudgetComparisonChart 
          budgets={budgets.length > 0 ? budgets : items} 
          expenses={expenses} 
          settings={settings} 
        />
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-hayat-lg overflow-hidden border border-hayat-border/60"
      >
        <div className="bg-white p-6 sm:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-hayat-border/40">
          <div>
            <h2 className="text-2xl font-bold text-hayat-navy mb-1 tracking-tight">{title}</h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-hayat-wood flex-shrink-0"></span>
              <p className="text-slate-600 text-xs font-bold">
                {type === 'expense' ? 'سجل المصاريف' : type === 'revenue' ? 'سجل المبيعات' : type === 'budget' ? 'أهداف الميزانية' : 'سجل الهدر'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowAdd(!showAdd)} 
            className={showAdd ? 'btn-secondary text-sm' : 'btn-primary text-sm flex items-center gap-2'}
          >
            {showAdd ? 'إلغاء العملية' : (
              <>
                <Plus size={16} />
                <span>سجل جديد +</span>
              </>
            )}
          </button>
        </div>

        <AnimatePresence>
          {showAdd && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-50/80 p-6 sm:p-8 border-b border-slate-200"
            >
              <DataForm 
                type={type} 
                onComplete={() => setShowAdd(false)} 
                user={user} 
                services={services} 
                settings={settings} 
                existingItems={items}
                setDialog={setDialog}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="bg-hayat-cream/40 p-4 sm:p-6 border-b border-hayat-border/30 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="ابحث بالوصف أو التصنيف أو رقم الطلب..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full bg-white border border-slate-200 outline-none px-4 pr-11 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all" 
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {type !== 'budget' && (
              <select 
                value={paymentFilter} 
                onChange={e => setPaymentFilter(e.target.value)} 
                className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm font-medium text-slate-900 outline-none"
              >
                <option value="all">كل طرق الدفع</option>
                <option value="cash">نقدًا</option>
                <option value="mada">مدى</option>
                <option value="apple_pay">أبل باي</option>
                <option value="visa_master">فيزا / ماستركارد</option>
                <option value="bank_transfer">تحويل بنكي</option>
              </select>
            )}

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <span>الفترة:</span>
              <input 
                type={type === 'budget' ? 'month' : 'date'}
                value={dateFrom} 
                onChange={e => setDateFrom(e.target.value)} 
                className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-900" 
              />
              <span>إلى</span>
              <input 
                type={type === 'budget' ? 'month' : 'date'}
                value={dateTo} 
                onChange={e => setDateTo(e.target.value)} 
                className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-900" 
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-600 text-xs font-bold">
                <th className="py-5 px-6 sm:px-10">التاريخ</th>
                <th className="py-5 px-6 sm:px-10">{type === 'budget' ? 'بند الميزانية' : (type === 'revenue' ? 'المنتج / الطلب' : 'البيان')}</th>
                <th className="py-5 px-6 sm:px-10 text-left">القيمة المالية</th>
                {type !== 'budget' && <th className="py-5 px-6 sm:px-10">طريقة الدفع والتفاصيل</th>}
                <th className="py-5 px-6 sm:px-10">أضافه</th>
                <th className="py-5 px-6 sm:px-10 w-36 text-left">العمليات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hayat-border/30 text-sm">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-hayat-accent/40 transition-colors group">
                  <td className="py-5 px-6 sm:px-10 min-w-[130px] font-bold text-slate-600 tabular-nums text-xs">
                    {type === 'budget' ? item.month : safeFormat(item.date, 'yyyy / MM / dd')}
                  </td>
                  <td className="py-5 px-6 sm:px-10 font-bold text-slate-900">
                    <div className="flex flex-col">
                      <span>
                        {type === 'budget' || type === 'expense' ? translateCategory(item.category) : 
                         type === 'revenue' ? translateProduct(item.productType) : item.material}
                      </span>
                      {type === 'revenue' && item.orderNumber && (
                        <span className="text-xs text-slate-500 font-bold mt-0.5">رقم الطلب: #{item.orderNumber}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-5 px-6 sm:px-10 text-left min-w-[150px]">
                    <div className="flex flex-col items-end">
                      <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-serif font-bold text-base ${
                        type === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-900'
                      }`}>
                        {(Number(item.amount) || Number(item.estimatedCost) || 0).toLocaleString()}
                        <span className="text-xs font-sans font-bold">ريال</span>
                      </div>
                      {settings.isTaxRegistered && item.taxAmount > 0 && (
                        <span className="text-xs text-slate-500 font-bold mt-0.5">شامل الضريبة ({item.taxAmount} ريال)</span>
                      )}
                    </div>
                  </td>
                  {type !== 'budget' && (
                    <td className="py-5 px-6 sm:px-10 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.paymentMethod && (
                          <span className="bg-slate-100 text-xs text-slate-700 font-bold px-2.5 py-1 rounded-full border border-slate-200">
                            {translatePaymentMethod(item.paymentMethod)}
                          </span>
                        )}
                        <span className="text-slate-600 text-xs font-medium truncate max-w-[180px]">
                          {item.description || item.reason || 'سجل تشغيلي عام'}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="py-5 px-6 sm:px-10 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      getAuthorDisplayName(item, user?.email) === 'أبو عبود'
                        ? 'bg-purple-100 text-purple-900 border border-purple-200'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}>
                      {getAuthorDisplayName(item, user?.email)}
                    </span>
                  </td>
                  <td className="py-5 px-6 sm:px-10 text-left">
                    <div className="flex items-center justify-end gap-1.5">
                      {type !== 'budget' && (
                        <button 
                          onClick={() => setSelectedReceipt(item)} 
                          title="عرض وطباعة سند"
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:text-purple-950 hover:bg-purple-50 transition-all cursor-pointer"
                        >
                          <Printer size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(item.id)} 
                        title="حذف"
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={type === 'budget' ? 5 : 6} className="py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-hayat-accent rounded-full flex items-center justify-center text-slate-400 mb-3">
                        <LayoutDashboard size={32} />
                      </div>
                      <p className="text-slate-600 text-sm font-bold mb-3">
                        {type === 'waste' ? 'لا توجد سجلات هدر مسجلة' : 'لا توجد بيانات مطابقة لخيارات التصفية'}
                      </p>
                      {/* 6. Waste empty state button */}
                      {type === 'waste' && (
                        <button 
                          type="button"
                          onClick={() => setShowAdd(true)}
                          className="px-6 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                        >
                          <Plus size={16} />
                          <span>أضف أول سجل هدر</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Statistics */}
        <div className="bg-hayat-accent/20 p-6 sm:p-8 border-t border-hayat-border/40 flex justify-end">
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-600 mb-1">عدد النتائج بعد التصفية</p>
              <p className="text-xl font-bold text-hayat-navy">{filteredItems.length}</p>
            </div>
            <div className="w-px h-10 bg-hayat-border/40"></div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-600 mb-1">إجمالي المبالغ بعد التصفية</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-serif font-bold text-hayat-navy">
                  {filteredItems.reduce((acc, curr) => acc + (Number(curr.amount) || Number(curr.estimatedCost) || 0), 0).toLocaleString()}
                </p>
                <span className="text-xs font-bold text-slate-600">ريال</span>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt Voucher Modal */}
        <AnimatePresence>
          {selectedReceipt && (
            <ReceiptVoucherModal 
              item={selectedReceipt} 
              type={type} 
              settings={settings} 
              onClose={() => setSelectedReceipt(null)}
              setDialog={setDialog}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function DataForm({ type, onComplete, user, services, settings, existingItems, setDialog }: any) {
  const [formData, setFormData] = useState<any>({
    date: format(new Date(), 'yyyy-MM-dd'),
    month: format(new Date(), 'yyyy-MM'),
    category: 'materials',
    customCategory: '',
    amount: '',
    description: '',
    productType: 'acrylic',
    customProductType: '',
    orderNumber: '',
    material: '',
    reason: '',
    estimatedCost: '',
    paymentMethod: 'cash'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveCategory = formData.category === 'custom' 
    ? (formData.customCategory?.trim() || 'أخرى') 
    : formData.category;

  const effectiveProductType = formData.productType === 'custom' 
    ? (formData.customProductType?.trim() || 'أخرى') 
    : formData.productType;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (type === 'expense' && formData.category === 'custom' && !formData.customCategory?.trim()) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'تنبيه',
        message: 'يرجى كتابة اسم الفئة / التصنيف المخصص للمصروف'
      });
      return;
    }

    if (type === 'revenue' && formData.productType === 'custom' && !formData.customProductType?.trim()) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'تنبيه',
        message: 'يرجى كتابة نوع أو طبيعة المنتج المخصصة'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const collectionName = `${type}s`;
      const payload: any = {
        userId: user.uid,
        createdByEmail: user.email || '',
        createdAt: serverTimestamp(),
      };

      if (type === 'budget') {
        payload.category = effectiveCategory;
        payload.amount = Number(formData.amount);
        payload.month = formData.month;
      } else if (type === 'expense') {
        payload.category = effectiveCategory;
        payload.amount = Number(formData.amount);
        payload.date = new Date(formData.date).toISOString();
        payload.description = formData.description;
        payload.paymentMethod = formData.paymentMethod || 'cash';
        
        const taxRate = settings.isTaxRegistered ? settings.taxRate : 0;
        const calculatedTax = settings.isTaxRegistered ? (Number(formData.amount) - (Number(formData.amount) / (1 + (taxRate / 100)))) : 0;
        payload.taxAmount = Number(calculatedTax.toFixed(2));
      } else if (type === 'revenue') {
        payload.amount = Number(formData.amount);
        payload.productType = effectiveProductType;
        payload.orderNumber = formData.orderNumber;
        payload.description = formData.description;
        payload.date = new Date(formData.date).toISOString();
        payload.paymentMethod = formData.paymentMethod || 'cash';
        
        const taxRate = settings.isTaxRegistered ? settings.taxRate : 0;
        const calculatedTax = settings.isTaxRegistered ? (Number(formData.amount) - (Number(formData.amount) / (1 + (taxRate / 100)))) : 0;
        payload.taxAmount = Number(calculatedTax.toFixed(2));
      } else if (type === 'waste') {
        payload.material = formData.material;
        payload.estimatedCost = Number(formData.estimatedCost);
        payload.reason = formData.reason;
        payload.date = new Date(formData.date).toISOString();
      }

      if ((user as any)?.isLocalGuest) {
        const id = `local-${type}-${Date.now()}`;
        const newRecord = { id, ...payload, createdAt: new Date().toISOString() };
        
        let existing: any[] = [];
        try {
          existing = JSON.parse(localStorage.getItem(`local_${collectionName}`) || '[]');
        } catch (e) {}
        existing.push(newRecord);
        localStorage.setItem(`local_${collectionName}`, JSON.stringify(existing));
        window.dispatchEvent(new Event('localDataChanged'));
        setIsSubmitting(false);
        onComplete();
        return;
      }

      await addDoc(collection(services.db, collectionName), payload);
      setIsSubmitting(false);
      onComplete();
    } catch (err: any) {
      console.error(err);
      setIsSubmitting(false);
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'خطأ في الحفظ',
        message: err?.message || 'تعذر حفظ السجل، يرجى مراجعة الصلاحيات والاتصال.'
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
      {type === 'budget' && (
        <>
          <FormGroup label="فترة الميزانية" child={<input type="month" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} className="form-input" required />} />
          <FormGroup label="تصنيف البند" child={
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input">
              <option value="materials">خامات أولية</option>
              <option value="marketing">حملات تسويقية</option>
              <option value="maintenance">صيانة وتشغيل</option>
              <option value="wages">أجور وتكليفات</option>
              <option value="other">مصاريف عامة</option>
            </select>
          } />
          <FormGroup label="الميزانية المقررة" child={
            <div className="relative">
              <input type="number" step="0.01" min="0" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input pl-12" required />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">ريال</span>
            </div>
          } />
        </>
      )}

      {type === 'expense' && (
        <>
          <FormGroup label="تاريخ الصرف" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
          <FormGroup label="فئة المصروف" child={
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input">
              <option value="materials">خامات أولية</option>
              <option value="marketing">حملات تسويقية</option>
              <option value="maintenance">صيانة وتشغيل</option>
              <option value="wages">أجور وتكليفات</option>
              <option value="other">مصاريف عامة</option>
            </select>
          } />
          <FormGroup label="القيمة الإجمالية" child={
            <div className="relative">
              <input type="number" step="0.01" min="0" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input pl-12" required />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">ريال</span>
            </div>
          } />
          <FormGroup label="طريقة الدفع" child={
            <select value={formData.paymentMethod} onChange={e => setFormData({...formData, paymentMethod: e.target.value})} className="form-input">
              <option value="cash">نقداً</option>
              <option value="mada">مدى</option>
              <option value="apple_pay">أبل باي</option>
              <option value="visa_master">فيزا / ماستركارد</option>
              <option value="bank_transfer">تحويل بنكي</option>
            </select>
          } />
          <FormGroup label="وصف العملية" child={<input type="text" placeholder="مثلاً: شراء خشب أكريليك" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="form-input" />} />
        </>
      )}

      {type === 'revenue' && (
        <>
          <FormGroup label="تاريخ التحصيل" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
          <FormGroup label="طبيعة المنتج" child={
            <select value={formData.productType} onChange={e => setFormData({...formData, productType: e.target.value})} className="form-input">
              <option value="acrylic">منتجات أكريليك</option>
              <option value="wood">منتجات خشبية</option>
              <option value="svg">ملفات رقمية (SVG)</option>
              <option value="other">منتجات أخرى</option>
            </select>
          } />
          <FormGroup label="قيمة المبيعات" child={
            <div className="relative">
              <input type="number" step="0.01" min="0" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input pl-12" required />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">ريال</span>
            </div>
          } />
          <FormGroup label="طريقة الدفع" child={
            <select value={formData.paymentMethod} onChange={e => setFormData({...formData, paymentMethod: e.target.value})} className="form-input">
              <option value="cash">نقداً</option>
              <option value="mada">مدى</option>
              <option value="apple_pay">أبل باي</option>
              <option value="visa_master">فيزا / ماستركارد</option>
              <option value="bank_transfer">تحويل بنكي</option>
            </select>
          } />
          <FormGroup label="رقم المرجع / الطلب" child={<input type="text" placeholder="Exp: 1004" value={formData.orderNumber} onChange={e => setFormData({...formData, orderNumber: e.target.value})} className="form-input" />} />
        </>
      )}

      {type === 'waste' && (
        <>
          <FormGroup label="تاريخ الرصد" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
          <FormGroup label="المادة التالفة" child={<input type="text" placeholder="نوع الخامة" value={formData.material} onChange={e => setFormData({...formData, material: e.target.value})} className="form-input" required />} />
          <FormGroup label="التكلفة التقديرية" child={
            <div className="relative">
              <input type="number" step="0.01" min="0" value={formData.estimatedCost} onChange={e => setFormData({...formData, estimatedCost: e.target.value})} className="form-input pl-12" required />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">ريال</span>
            </div>
          } />
          <FormGroup label="سبب الهدر" child={<input type="text" placeholder="توضيح السبب" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="form-input" />} />
        </>
      )}

      <button 
        type="submit" 
        disabled={isSubmitting} 
        className="btn-primary h-[50px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
      >
        {isSubmitting ? <span>جارٍ الحفظ...</span> : <span>اعتماد السجل</span>}
      </button>
    </form>
  );
}

function FormGroup({ label, child }: any) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold text-slate-700">{label}</label>
      {child}
    </div>
  );
}

function SettingsView({ settings, setSettings }: { settings: any, setSettings: any }) {
  const [formData, setFormData] = useState({ ...settings });
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSettings(formData);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2.5rem] shadow-hayat-lg overflow-hidden border border-hayat-border/60 max-w-4xl mx-auto"
    >
      <div className="bg-white p-6 sm:p-10 border-b border-hayat-border/40">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="text-hayat-navy w-8 h-8" />
          <h2 className="text-2xl font-bold text-hayat-navy tracking-tight">إعدادات النظام والمتجر</h2>
        </div>
        <p className="text-slate-600 text-xs font-bold">حفظ إعدادات المتجر وبيانات الضريبة والفواتير في السحابة</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700">اسم المتجر / المنشأة</label>
            <input 
              type="text" 
              value={formData.storeName} 
              onChange={e => setFormData({ ...formData, storeName: e.target.value })} 
              className="form-input" 
              required 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700">العملة الأساسية</label>
            <input 
              type="text" 
              value={formData.currency} 
              onChange={e => setFormData({ ...formData, currency: e.target.value })} 
              className="form-input" 
              required 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700">رقم الهاتف للتواصل في الفواتير</label>
            <input 
              type="text" 
              placeholder="مثال: 05xxxxxxxx" 
              value={formData.contactPhone} 
              onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} 
              className="form-input" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700">العنوان الجغرافي للمتجر</label>
            <input 
              type="text" 
              value={formData.address} 
              onChange={e => setFormData({ ...formData, address: e.target.value })} 
              className="form-input" 
            />
          </div>
        </div>

        <div className="border-t border-hayat-border/40 pt-6 space-y-6">
          <h3 className="text-sm font-bold text-hayat-navy">إعدادات ضريبة القيمة المضافة</h3>
          
          <div className="bg-slate-50 p-6 rounded-2xl flex flex-col md:flex-row gap-4 md:items-center justify-between border border-slate-200">
            <div>
              <p className="text-sm font-bold text-slate-900">التسجيل الضريبي</p>
              <p className="text-xs text-slate-600 mt-1">تفعيل أو تعطيل حسابات ضريبة القيمة المضافة في جميع السجلات والفواتير.</p>
            </div>
            
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={formData.isTaxRegistered} 
                onChange={e => setFormData({ ...formData, isTaxRegistered: e.target.checked })} 
                className="sr-only peer" 
              />
              <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              <span className="mr-3 text-xs font-bold text-slate-700 select-none">
                {formData.isTaxRegistered ? "خاضع للضريبة (مفعل)" : "غير خاضع للضريبة (معطل)"}
              </span>
            </label>
          </div>

          <AnimatePresence>
            {formData.isTaxRegistered && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 overflow-hidden"
              >
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700">الرقم الضريبي للمنشأة</label>
                  <input 
                    type="text" 
                    placeholder="رقم التسجيل الضريبي المكون من 15 خانة" 
                    value={formData.taxNumber} 
                    onChange={e => setFormData({ ...formData, taxNumber: e.target.value })} 
                    className="form-input font-mono font-bold" 
                    required={formData.isTaxRegistered}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700">نسبة ضريبة القيمة المضافة (%)</label>
                  <input 
                    type="number" 
                    placeholder="15" 
                    value={formData.taxRate} 
                    onChange={e => setFormData({ ...formData, taxRate: Number(e.target.value) })} 
                    className="form-input font-mono font-bold" 
                    required={formData.isTaxRegistered}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {savedMsg && (
          <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 py-3 rounded-xl">
            ✓ تم حفظ إعدادات المتجر بنجاح وتطبيقها على حسابك!
          </div>
        )}

        <button type="submit" className="btn-primary w-full h-[52px] font-bold text-sm cursor-pointer">
          حفظ التغييرات
        </button>
      </form>
    </motion.div>
  );
}

function ReceiptVoucherModal({ item, type, settings, onClose, setDialog }: any) {
  const isRevenue = type === 'revenue';
  const displayId = item.id ? item.id.substring(0, 8).toUpperCase() : 'N/A';
  const [isExportingImage, setIsExportingImage] = useState(false);
  
  const voucherTitle = isRevenue 
    ? "سند قبض ومبيعات معتمد" 
    : type === 'expense' 
      ? "سند صرف ونفقات تشغيلية" 
      : "تقرير هدر في المواد والخامات";

  const taxRate = settings.isTaxRegistered ? (settings.taxRate || 15) : 0;
  const amount = isRevenue ? item.amount : type === 'expense' ? item.amount : item.estimatedCost || 0;
  
  const beforeTaxAmount = settings.isTaxRegistered 
    ? amount / (1 + taxRate / 100) 
    : amount;
  const taxAmount = amount - beforeTaxAmount;

  const handlePrint = () => {
    window.print();
  };

  const handleExportImage = async () => {
    const voucherElement = document.getElementById('printable-voucher');
    if (!voucherElement || isExportingImage) return;

    try {
      setIsExportingImage(true);
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(voucherElement, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
        }
      });

      const imageURI = canvas.toDataURL('image/png', 1.0);
      const fileName = `سند_${displayId}_${isRevenue ? 'مبيعات' : type === 'expense' ? 'مصروف' : 'هدر'}.png`;

      const downloadLink = document.createElement('a');
      downloadLink.href = imageURI;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err) {
      console.error('Failed to export voucher image:', err);
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'خطأ',
        message: 'حدث خطأ أثناء تصدير السند كصورة، يرجى المحاولة مرة أخرى.'
      });
    } finally {
      setIsExportingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2.5rem] shadow-hayat-lg overflow-hidden border border-hayat-border/60 max-w-2xl w-full flex flex-col my-auto"
      >
        <div className="bg-slate-50 px-6 py-4 border-b border-hayat-border/40 flex justify-between items-center text-hayat-navy">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <p className="text-xs font-bold text-slate-700">سند ومعاملة مالية معتمدة</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div id="printable-voucher" className="p-6 md:p-10 space-y-6 md:space-y-8 print:p-8 bg-white">
          <div className="text-center space-y-2 border-b border-hayat-border/60 pb-6 font-sans">
            <h3 className="font-serif text-2xl text-hayat-navy font-bold leading-tight">{settings.storeName}</h3>
            <p className="text-xs text-slate-600 font-bold">سند مالي معتمد</p>
            {settings.address && <p className="text-xs text-slate-600 font-bold">{settings.address}</p>}
            {settings.contactPhone && <p className="text-xs text-slate-600 font-mono font-bold leading-none">{settings.contactPhone}</p>}
          </div>

          <div className="bg-purple-50/50 rounded-2xl p-4 text-center border border-purple-100 font-sans">
            <h4 className="text-base font-bold text-hayat-navy">{voucherTitle}</h4>
            <p className="text-xs text-slate-600 font-bold mt-1 font-mono">رقم السند: #{displayId}</p>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs border-b border-hayat-border/40 pb-6 text-right" dir="rtl">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">تاريخ المعاملة</p>
              <p className="font-bold text-hayat-navy tabular-nums text-sm">{item.date ? safeFormat(item.date, 'yyyy / MM / dd') : '---'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">نوع العملية</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRevenue ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                <p className="font-bold text-hayat-navy text-sm">
                  {isRevenue 
                    ? translateProduct(item.productType) 
                    : type === 'expense' 
                      ? translateCategory(item.category) 
                      : item.material || 'هدر مواد'}
                </p>
              </div>
            </div>
            {item.paymentMethod && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">طريقة الدفع</p>
                <p className="font-bold text-hayat-navy text-sm">{translatePaymentMethod(item.paymentMethod)}</p>
              </div>
            )}
            {isRevenue && item.orderNumber && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">الرقم المرجعي للطلب</p>
                <p className="font-bold text-hayat-navy font-mono text-sm">#{item.orderNumber}</p>
              </div>
            )}
          </div>

          <div className="space-y-3" dir="rtl">
            {settings.isTaxRegistered ? (
              <>
                <div className="flex justify-between items-center text-xs text-slate-600 font-bold font-sans">
                  <span>القيمة الخاضعة للضريبة</span>
                  <span className="font-bold tabular-nums text-sm">{beforeTaxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-600 border-b border-dashed border-hayat-border/40 pb-3 font-bold font-sans">
                  <span>ضريبة القيمة المضافة ({taxRate}%)</span>
                  <span className="font-bold tabular-nums text-sm">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</span>
                </div>
              </>
            ) : null}

            <div className={`flex justify-between items-center ${settings.isTaxRegistered ? 'pt-3' : 'border-b border-dashed border-hayat-border/40 pb-3'}`}>
              <span className="text-sm font-bold text-hayat-navy">المجموع الإجمالي النهائي</span>
              <span className="font-serif font-black text-xl text-hayat-navy tabular-nums font-sans">
                {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>

          {settings.isTaxRegistered && settings.taxNumber && (
            <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl text-center font-sans">
              <p className="text-xs font-bold text-slate-700">
                الرقم الضريبي للمنشأة: <span className="font-mono tabular-nums text-slate-900">{settings.taxNumber}</span>
              </p>
            </div>
          )}

          {item.description && (
            <div className="border-t border-hayat-border/30 pt-4 text-right" dir="rtl">
              <p className="text-xs font-bold text-slate-500 mb-1">تفاصيل المعاملة</p>
              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed font-semibold">
                {item.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-center pt-8 border-t border-dashed border-hayat-border/40">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-4">التوقيع والاعتماد</p>
              <div className="w-24 h-px bg-slate-300 mx-auto"></div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-4">الختم والمصادقة</p>
              <div className="w-24 h-px bg-slate-300 mx-auto"></div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 border-t border-hayat-border/40 flex justify-end gap-3 select-none" data-html2canvas-ignore="true">
          <button 
            onClick={handleExportImage} 
            disabled={isExportingImage}
            className="btn-emerald py-2.5 px-5 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Download size={14} />
            <span>{isExportingImage ? 'جارٍ التجهيز...' : 'تصدير كصورة'}</span>
          </button>
          <button 
            onClick={handlePrint} 
            className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Printer size={14} />
            <span>طباعة السند</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

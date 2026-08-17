/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './components/Logo';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc,
  getDocFromServer
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
  Filter,
  SlidersHorizontal,
  Building,
  DollarSign,
  FileText,
  Calendar,
  CreditCard,
  ChevronDown,
  X,
  Menu,
  ShieldAlert,
  AlertOctagon,
  AlertCircle,
  PieChart as PieChartIcon,
  Download,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, parseISO, isSameMonth } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
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
  Invoice,
  InvoiceItem
} from './types';
import InvoicesView from './components/InvoicesView';

// --- Helpers ---

// Fix html2canvas unsupported oklch/oklab color parsing in modern browsers
const cleanOklColorsAndPatchGetComputedStyle = (clonedDoc: Document) => {
  const resolveToSlateHex = (colorStr: string): string => {
    const match = colorStr.match(/(?:oklch|oklab)\(\s*([0-9.-]+%?)/i);
    let lightness = 0.5;
    if (match) {
      const rawVal = match[1];
      if (rawVal.endsWith('%')) {
        lightness = parseFloat(rawVal) / 100;
      } else {
        lightness = parseFloat(rawVal);
      }
    }
    
    if (lightness >= 0.96) return '#FFFFFF';
    if (lightness >= 0.92) return '#F8FAFC'; // slate-50
    if (lightness >= 0.85) return '#F1F5F9'; // slate-100
    if (lightness >= 0.75) return '#E2E8F0'; // slate-200
    if (lightness >= 0.65) return '#CBD5E1'; // slate-300
    if (lightness >= 0.55) return '#94A3B8'; // slate-400
    if (lightness >= 0.45) return '#64748B'; // slate-500
    if (lightness >= 0.35) return '#475569'; // slate-600
    if (lightness >= 0.25) return '#334155'; // slate-700
    if (lightness >= 0.15) return '#1E293B'; // slate-800
    return '#0F172A'; // slate-900
  };

  const sanitizeColorValue = (value: string): string => {
    if (typeof value === 'string' && (value.includes('oklch') || value.includes('oklab'))) {
      return resolveToSlateHex(value);
    }
    return value;
  };

  const patchWin = (win: Window) => {
    if (!win || (win as any).__oklPatched) return;
    (win as any).__oklPatched = true;
    const originalGetComputedStyle = win.getComputedStyle;
    win.getComputedStyle = function (el: Element, pseudoElt?: string | null) {
      const style = originalGetComputedStyle.call(this, el, pseudoElt);
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return function (propertyName: string) {
              const val = target.getPropertyValue(propertyName);
              return sanitizeColorValue(val);
            };
          }
          const value = target[prop as any];
          if (typeof value === 'string') {
            return sanitizeColorValue(value);
          }
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }
      }) as any;
    };
  };

  // Patch cloned iframe's window
  if (clonedDoc.defaultView) {
    patchWin(clonedDoc.defaultView);
  }
  // Also patch the main window
  if (typeof window !== 'undefined') {
    patchWin(window);
  }

  // 1. Process all styles safely with a regex that supports nesting
  const oklColorRegex = /(oklch|oklab)\((?:[^()]+|\([^()]*\))*\)/gi;
  clonedDoc.querySelectorAll('style').forEach(styleTag => {
    if (styleTag.innerHTML.includes('oklch') || styleTag.innerHTML.includes('oklab')) {
      styleTag.innerHTML = styleTag.innerHTML.replace(oklColorRegex, (m) => resolveToSlateHex(m));
    }
  });

  // 2. Process all style attributes if they contain oklch/oklab
  clonedDoc.querySelectorAll('*').forEach((el: any) => {
    if (el.style) {
      if (el.style.cssText && (el.style.cssText.includes('oklch') || el.style.cssText.includes('oklab'))) {
        el.style.cssText = el.style.cssText.replace(oklColorRegex, (m) => resolveToSlateHex(m));
      }
    }
  });
};

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
  // Get last 6 months
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = format(d, 'yyyy-MM');
    const rev = revenues.filter(r => r.date && r.date.startsWith(monthStr)).reduce((a, c) => a + c.amount, 0);
    const exp = expenses.filter(e => e.date && e.date.startsWith(monthStr)).reduce((a, c) => a + c.amount, 0);
    trend.push({ month: format(d, 'MMM'), net: rev - exp });
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
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('hayat_finance_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // use default
      }
    }
    return {
      storeName: 'حياة ديزاين',
      isTaxRegistered: false, // Default to false (Not subject to tax) as requested!
      taxRate: 15,
      taxNumber: '',
      currency: 'SAR',
      contactPhone: '',
      address: 'المملكة العربية السعودية',
      showPaymentMethodGraph: true
    };
  });

  useEffect(() => {
    localStorage.setItem('hayat_finance_settings', JSON.stringify(settings));
  }, [settings]);
  
  const [budgets, setBudgets] = useState<BudgetTarget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [waste, setWaste] = useState<WasteItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const loadLocalData = () => {
    const rawBudgets = localStorage.getItem('local_budgets');
    const rawExpenses = localStorage.getItem('local_expenses');
    const rawRevenues = localStorage.getItem('local_revenues');
    const rawWastes = localStorage.getItem('local_wastes');
    const rawInvoices = localStorage.getItem('local_invoices');

    if (!rawBudgets && !rawExpenses && !rawRevenues) {
      // Seed default demo data locally
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
      
      const parsedInvoices = JSON.parse(rawInvoices || '[]') as Invoice[];
      const strippedInvoices = parsedInvoices.map(inv => ({
        ...inv,
        taxRate: 0,
        taxAmount: 0,
        grandTotal: Math.max(0, (inv.subtotal || 0) - (inv.discount || 0))
      }));
      setInvoices(strippedInvoices);
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

  // Init Firebase
  useEffect(() => {
    async function setup() {
      const { db: newDb, auth: newAuth } = await initFirebase();
      setServices({ db: newDb, auth: newAuth });
      
      if (newAuth) {
        onAuthStateChanged(newAuth, (u) => {
          if (u) {
            setUser(u);
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

  // Data Fetching
  useEffect(() => {
    if (!user || (user as any).isLocalGuest || !services.db) return;

    // Listen to plural collections (standard)
    const unsubBudgets = onSnapshot(collection(services.db, 'budgets'), (snap) => {
      setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetTarget)));
    }, (err) => console.error("Budgets listener error:", err));

    const unsubExpenses = onSnapshot(collection(services.db, 'expenses'), (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    }, (err) => console.error("Expenses listener error:", err));

    const unsubRevenues = onSnapshot(collection(services.db, 'revenues'), (snap) => {
      setRevenues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Revenue)));
    }, (err) => console.error("Revenues listener error:", err));

    const unsubWaste = onSnapshot(collection(services.db, 'wastes'), (snap) => {
      setWaste(snap.docs.map(d => ({ id: d.id, ...d.data() } as WasteItem)));
    }, (err) => console.error("Wastes listener error:", err));

    const unsubInvoices = onSnapshot(collection(services.db, 'invoices'), (snap) => {
      const parsedInvoices = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      const strippedInvoices = parsedInvoices.map(inv => ({
        ...inv,
        taxRate: 0,
        taxAmount: 0,
        grandTotal: Math.max(0, (inv.subtotal || 0) - (inv.discount || 0))
      }));
      setInvoices(strippedInvoices);
    }, (err) => console.error("Invoices listener error:", err));

    return () => {
      unsubBudgets();
      unsubExpenses();
      unsubRevenues();
      unsubWaste();
      unsubInvoices();
    };
  }, [user, services.db]);

  const handleSeedData = async () => {
    if (!user) return;
    if (!window.confirm('هل تريد استعادة البيانات التجريبية؟ سيتم إضافة سجلات جديدة لمساعدتك في تجربة لوحة التحكم.')) return;

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

        alert('تمت استعادة البيانات بنجاح في ذاكرة المتصفح المحلية');
        return;
      }

      for (const r of sampleRevenues) await addDoc(collection(services.db, 'revenues'), { ...r, userId: user.uid, createdAt: serverTimestamp() });
      for (const e of sampleExpenses) await addDoc(collection(services.db, 'expenses'), { ...e, userId: user.uid, createdAt: serverTimestamp() });
      for (const b of sampleBudgets) await addDoc(collection(services.db, 'budgets'), { ...b, userId: user.uid, createdAt: serverTimestamp() });

      alert('تمت استعادة البيانات بنجاح');
    } catch (err) {
      console.error(err);
      alert('فشل في إضافة البيانات');
    }
  };

  const handleLogin = async () => {
    if (!services.auth) return;
    try {
      setLoginError(null);
      await signInWithPopup(services.auth, new GoogleAuthProvider());
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
    if (window.confirm('هل تريد تسجيل الخروج؟')) {
      if ((user as any)?.isLocalGuest) {
        setUser(null);
        return;
      }
      services.auth && signOut(services.auth);
    }
  };

  const handleGuestLogin = () => {
    setUser({
      uid: 'guest-development-user-id',
      displayName: 'مُصمم زائر (بيئة تجريبية)',
      email: 'guest@hayat-design.com',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    } as any);
    // Add custom helper tag
    setTimeout(() => {
      setUser(current => {
        if (current) {
          return { ...current, isLocalGuest: true };
        }
        return null;
      });
    }, 10);
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-hayat-cream font-sans">Loading...</div>;

  if (!services.auth || !services.db) {
     return (
       <div className="flex flex-col items-center justify-center h-screen bg-hayat-cream font-sans p-6 text-center">
         <AlertTriangle size={48} className="text-orange-500 mb-4" />
         <h1 className="font-serif text-3xl mb-2 text-hayat-navy">يجب إعداد Firebase أولاً</h1>
         <p className="text-stone-500">يرجى الضغط على زر "Set up Firebase" في AI Studio لتفعيل قاعدة البيانات.</p>
       </div>
     );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-hayat-cream font-sans p-6 overflow-hidden relative">
        {/* Background Accents */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
           <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-hayat-wood/5 rounded-full blur-3xl"></div>
           <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-hayat-navy/5 rounded-full blur-3xl"></div>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-hayat-lg border border-hayat-border/40 relative z-10"
        >
          <div className="flex flex-col items-center mb-8">
            <motion.div
              initial={{ rotate: -10, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Logo className="w-20 h-20 mb-5 drop-shadow-sm" />
            </motion.div>
            <h1 className="font-serif text-4xl text-hayat-navy mb-2 tracking-tight">حياة ديزاين</h1>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Operational Dashboard</p>
          </div>
          
          <div className="space-y-5">
            <p className="text-slate-500 text-xs leading-relaxed text-center px-4">
              نظام الإدارة المالية الذكي لتتبع التدفقات النقدية، الميزانية، وتحليل كفاءة الإنتاج.
            </p>

            {loginError && (
              <div className="p-5 rounded-2xl bg-orange-50 border border-orange-250 text-right space-y-3 relative z-20">
                <div className="flex items-center gap-2 text-orange-900 font-bold text-xs">
                  <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />
                  <span>عذراً، النطاق غير مصرح له في مشروعك</span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  مشروع Firebase يرفض تسجيل الدخول بسبب تشغيل التطبيق في بيئة تطوير AI Studio المؤقتة. لمعالجة ذلك بسهولة:
                </p>
                
                <div className="text-[10px] bg-white/80 p-2.5 rounded-xl border border-orange-100 flex items-center justify-between gap-2.5">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.hostname);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="px-2.5 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-850 rounded-lg text-[9px] font-bold active:scale-95 transition-all flex-shrink-0"
                  >
                    {copied ? '✔ تم نسخ النطاق' : 'نسخ النطاق الحالي'}
                  </button>
                  <span className="font-mono text-stone-600 font-bold select-all overflow-hidden text-ellipsis whitespace-nowrap text-left block flex-grow" dir="ltr">
                    {window.location.hostname}
                  </span>
                </div>
                
                <ol className="list-decimal list-inside text-[10px] text-stone-500 space-y-1.5 pr-2">
                  <li>اذهب إلى تطبيق <span className="font-bold">Firebase Console</span>.</li>
                  <li>انتقل إلى <span className="font-bold">Authentication</span> ثم <span className="font-bold">Settings</span>.</li>
                  <li>تحت <span className="font-bold">Authorized Domains</span>، قم بإضافة هذا النطاق المنسوخ.</li>
                </ol>

                <div className="w-full h-px bg-orange-200/50 my-2"></div>
                <p className="text-[10px] text-orange-800 font-semibold text-center italic">
                  * أو يمكنك الضغط أدناه للدخول للوحة دون اتصال والاستكشاف الفوري!
                </p>
              </div>
            )}
            
            <button 
              onClick={handleLogin}
              className="w-full bg-hayat-navy text-white py-4.5 rounded-[1.25rem] flex items-center justify-center gap-4 hover:bg-slate-800 transition-all font-bold text-xs uppercase tracking-widest shadow-hayat active:scale-[0.98]"
            >
              <div className="bg-white/10 p-1.5 rounded-lg">
                <UserIcon size={18} />
              </div>
              الدخول باستخدام حساب Google
            </button>

            <button 
              onClick={handleGuestLogin}
              className="w-full bg-stone-100 hover:bg-stone-200 text-hayat-navy py-4 rounded-[1.25rem] flex items-center justify-center gap-3 transition-colors font-bold text-xs border border-stone-200/50 active:scale-[0.98]"
            >
              🚀 تجربة لوحة التحكم والمحاكاة المحلية السريعة
            </button>
            
            <div className="pt-6 border-t border-hayat-border/40 flex flex-col items-center">
               <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mb-3">Enterprise Edition 2024</p>
               <div className="flex gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-hayat-wood/40"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-hayat-navy/40"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-hayat-wood/40"></div>
               </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hayat-cream font-sans text-stone-800 rtl md:flex" dir="rtl">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white/90 backdrop-blur-lg border-b border-hayat-border/40 sticky top-0 px-4 sm:px-6 py-3.5 flex justify-between items-center z-40 select-none shadow-sm">
        <div className="flex items-center gap-2.5">
          <Logo className="w-8 h-8 flex-shrink-0" />
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-serif text-[16px] text-hayat-navy font-bold leading-tight">{settings.storeName}</h1>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black bg-emerald-100 text-emerald-800">نشط</span>
            </div>
            <p className="text-[8.5px] text-slate-400 font-extrabold uppercase tracking-wider">لوحة الإدارة والمحاسبة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-left font-sans hidden sm:block">
            <p className="text-xs font-bold text-hayat-navy leading-none">{user.displayName?.split(' ')[0]}</p>
          </div>
          <button 
            onClick={() => setShowMoreMenu(true)} 
            className="relative focus:outline-none cursor-pointer"
          >
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-xl border border-hayat-border/60 shadow-sm object-cover" alt="User" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border border-white rounded-full"></div>
          </button>
        </div>
      </header>

      {/* Desktop Sidebar / Nav */}
      <nav className="hidden md:block w-72 h-screen sticky top-0 bg-white border-r border-hayat-border/60 z-50">
        <div className="flex flex-col h-full p-6 justify-between gap-1">
          <div>
            <div className="mb-10 p-6 border-b border-hayat-border/60">
              <div className="flex items-center gap-3 mb-2">
                <Logo className="w-10 h-10" />
                <h1 className="font-serif text-2xl text-hayat-navy tracking-tight">{settings.storeName}</h1>
              </div>
              <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-bold">Financial Intelligence</p>
            </div>
            
            <div className="flex flex-col gap-1 w-full">
              <NavItem icon={<LayoutDashboard size={18} />} label="الرئيسية" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
              <NavItem icon={<Receipt size={18} />} label="المصاريف" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
              <NavItem icon={<ShoppingBag size={18} />} label="المبيعات" active={activeTab === 'revenues'} onClick={() => setActiveTab('revenues')} />
              <NavItem icon={<FileText size={18} />} label="الملفات والفواتير" active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} />
              <NavItem icon={<Target size={18} />} label="الميزانية" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
              <NavItem icon={<AlertTriangle size={18} />} label="الهدر" active={activeTab === 'waste'} onClick={() => setActiveTab('waste')} />
              <NavItem icon={<FileBarChart size={18} />} label="التقارير" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
              <NavItem icon={<Settings size={18} />} label="الإعدادات" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="pt-4 border-t border-hayat-border/60">
               <NavItem icon={<LogOut size={18} />} label="إنهاء الجلسة" active={false} onClick={handleLogout} />
            </div>

            <div className="flex items-center gap-3 p-4 bg-hayat-accent rounded-2xl border border-hayat-border/40 mx-2">
              <div className="relative">
                <img src={user.photoURL || ''} className="w-10 h-10 rounded-xl border-2 border-white shadow-sm object-cover" alt="Avatar" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
              </div>
              <div className="flex-1 truncate">
                <p className="text-[11px] font-bold text-hayat-navy truncate">{user.displayName}</p>
                <p className="text-[9px] text-slate-400 font-medium">{user.email?.split('@')[0]}</p>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16.5 bg-white/95 backdrop-blur-md border-t border-hayat-border/30 flex justify-around items-center px-4 pb-safe z-50 select-none shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.03)]">
        <MobileTabButton 
          icon={<LayoutDashboard size={19} />} 
          label="الرئيسية" 
          active={activeTab === 'dashboard'} 
          onClick={() => { setActiveTab('dashboard'); setShowMoreMenu(false); }} 
        />
        <MobileTabButton 
          icon={<Receipt size={19} />} 
          label="المصاريف" 
          active={activeTab === 'expenses'} 
          onClick={() => { setActiveTab('expenses'); setShowMoreMenu(false); }} 
        />
        <MobileTabButton 
          icon={<ShoppingBag size={19} />} 
          label="المبيعات" 
          active={activeTab === 'revenues'} 
          onClick={() => { setActiveTab('revenues'); setShowMoreMenu(false); }} 
        />
        <MobileTabButton 
          icon={<FileBarChart size={19} />} 
          label="التقارير" 
          active={activeTab === 'reports'} 
          onClick={() => { setActiveTab('reports'); setShowMoreMenu(false); }} 
        />
        <MobileTabButton 
          icon={<Menu size={19} />} 
          label="المزيد" 
          active={showMoreMenu} 
          onClick={() => setShowMoreMenu(!showMoreMenu)} 
        />
      </nav>

      {/* Mobile Bottom Sheets (Drawer) */}
      <AnimatePresence>
        {showMoreMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreMenu(false)}
              className="fixed inset-0 bg-black/60 z-[90] md:hidden backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.25rem] border-t border-hayat-border shadow-2xl z-[100] md:hidden pb-12 overflow-hidden"
            >
              {/* Drawer Pull Handle */}
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-4 cursor-pointer" onClick={() => setShowMoreMenu(false)}></div>
              
              <div className="flex items-center gap-3 px-8 pb-5 border-b border-slate-100">
                <div className="relative">
                  <img src={user.photoURL || ''} className="w-11 h-11 rounded-xl border border-slate-200 shadow-sm object-cover" alt="UserAvatar" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                </div>
                <div className="flex-1 truncate text-right">
                  <p className="text-[13px] font-black text-hayat-navy truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">{user.email}</p>
                </div>
              </div>

              <div className="p-6 grid grid-cols-2 gap-3.5">
                <button 
                  onClick={() => { setActiveTab('budget'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all text-center gap-2.5 ${
                    activeTab === 'budget' 
                      ? 'bg-hayat-navy/5 border-hayat-navy text-hayat-navy font-bold' 
                      : 'bg-hayat-accent border-hayat-border/40 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Target size={20} className={activeTab === 'budget' ? 'text-hayat-wood' : 'text-slate-400'} />
                  <span className="font-bold text-xs">تخطيط الميزانية</span>
                </button>

                <button 
                  onClick={() => { setActiveTab('waste'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all text-center gap-2.5 ${
                    activeTab === 'waste' 
                      ? 'bg-hayat-navy/5 border-hayat-navy text-hayat-navy font-bold' 
                      : 'bg-hayat-accent border-hayat-border/40 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <AlertTriangle size={20} className={activeTab === 'waste' ? 'text-hayat-wood' : 'text-slate-400'} />
                  <span className="font-bold text-xs">تتبع الهدر</span>
                </button>

                <button 
                  onClick={() => { setActiveTab('invoices'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all text-center gap-2.5 ${
                    activeTab === 'invoices' 
                      ? 'bg-hayat-navy/5 border-hayat-navy text-hayat-navy font-bold' 
                      : 'bg-hayat-accent border-hayat-border/40 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FileText size={20} className={activeTab === 'invoices' ? 'text-hayat-wood' : 'text-slate-400'} />
                  <span className="font-bold text-xs">الملفات والفواتير</span>
                </button>

                <button 
                  onClick={() => { setActiveTab('settings'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all text-center gap-2.5 ${
                    activeTab === 'settings' 
                      ? 'bg-hayat-navy/5 border-hayat-navy text-hayat-navy font-bold' 
                      : 'bg-hayat-accent border-hayat-border/40 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Settings size={20} className={activeTab === 'settings' ? 'text-hayat-wood' : 'text-slate-400'} />
                  <span className="font-bold text-xs">الإعدادات</span>
                </button>

                <button 
                  onClick={() => { handleLogout(); setShowMoreMenu(false); }}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl border border-transparent bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all text-center gap-2.5"
                >
                  <LogOut size={20} className="text-rose-500" />
                  <span className="font-bold text-xs">تسجيل الخروج</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="p-4 md:p-12 pb-28 md:pb-12 max-w-7xl mx-auto flex-1 w-full overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dash" 
              id="dash"
              initial={{ opacity: 0, x: 20 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -20 }}
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
          {activeTab === 'expenses' && <DataListSection title="إدارة المصاريف" type="expense" items={expenses} user={user} services={services} settings={settings} />}
          {activeTab === 'revenues' && <DataListSection title="إدارة المبيعات" type="revenue" items={revenues} user={user} services={services} settings={settings} />}
          {activeTab === 'invoices' && <InvoicesView invoices={invoices} user={user} services={services} settings={settings} />}
          {activeTab === 'budget' && <DataListSection title="تخطيط الميزانية" type="budget" items={budgets} user={user} services={services} settings={settings} />}
          {activeTab === 'waste' && <DataListSection title="تتبع الهدر" type="waste" items={waste} user={user} services={services} settings={settings} />}
          {activeTab === 'reports' && <ReportsView expenses={expenses} revenues={revenues} budgets={budgets} waste={waste} setActiveTab={setActiveTab} settings={settings} />}
          {activeTab === 'settings' && <SettingsView settings={settings} setSettings={setSettings} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3.5 rounded-xl w-full transition-all duration-300 group ${
        active 
          ? 'bg-hayat-navy text-white shadow-hayat' 
          : 'hover:bg-slate-100 text-slate-500 hover:text-hayat-navy'
      }`}
    >
      <span className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </span>
      <span className="hidden md:block font-bold text-xs tracking-wide">{label}</span>
      {active && (
        <motion.div 
          layoutId="activeNav"
          className="mr-auto hidden md:block w-1.5 h-1.5 bg-hayat-wood rounded-full"
        />
      )}
    </button>
  );
}

function MobileTabButton({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center select-none cursor-pointer"
    >
      <div className={`p-1.5 rounded-xl transition-all duration-300 ${
        active 
          ? 'text-hayat-navy bg-hayat-accent/80 scale-110 shadow-sm' 
          : 'text-slate-400 hover:text-slate-600 font-medium'
      }`}>
        {icon}
      </div>
      <span className={`text-[9.5px] mt-1 font-bold ${active ? 'text-hayat-navy font-black' : 'text-slate-400 font-semibold'}`}>{label}</span>
    </button>
  );
}

function DashboardHeader({ user, budgets, expenses, revenues, waste, dashboardRef, onSeedData }: any) {
  const [isExporting, setIsExporting] = useState(false);
  const currentMonth = format(new Date(), 'yyyy-MM');
  
  const safeParseDate = (dateStr: string) => {
    try {
      return parseISO(dateStr);
    } catch (e) {
      return new Date();
    }
  };

  const monthRevenues = revenues.filter((r: any) => r.date && format(safeParseDate(r.date), 'yyyy-MM') === currentMonth);
  const monthExpenses = expenses.filter((e: any) => e.date && format(safeParseDate(e.date), 'yyyy-MM') === currentMonth);
  const monthWaste = waste.filter((w: any) => w.date && format(safeParseDate(w.date), 'yyyy-MM') === currentMonth);
  
  const totalRevenue = monthRevenues.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const totalExpense = monthExpenses.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const netProfit = totalRevenue - totalExpense;

  const noData = revenues.length === 0 && expenses.length === 0;

  const downloadReportCSV = () => {
    let csvContent = "\uFEFF"; // BOM for Arabic support
    csvContent += "البيانات المالية لشهر " + format(new Date(), 'MMMM yyyy', { locale: arSA }) + "\n\n";

    // Sales
    csvContent += "المبيعات\n";
    csvContent += "التاريخ,المنتج,القيمة,رقم الطلب\n";
    monthRevenues.forEach((r: any) => {
      csvContent += `${safeFormat(r.date, 'yyyy-MM-dd')},${translateProduct(r.productType)},${r.amount},${r.orderNumber || ''}\n`;
    });

    // Expenses
    csvContent += "\nالمصاريف\n";
    csvContent += "التاريخ,الفئة,المبلغ,الوصف\n";
    monthExpenses.forEach((e: any) => {
      csvContent += `${safeFormat(e.date, 'yyyy-MM-dd')},${translateCategory(e.category)},${e.amount},${e.description || ''}\n`;
    });

    // Waste
    csvContent += "\nالهدر\n";
    csvContent += "التاريخ,المادة,التكلفة,السبب\n";
    monthWaste.forEach((w: any) => {
      csvContent += `${safeFormat(w.date, 'yyyy-MM-dd')},${w.material},${w.estimatedCost},${w.reason || ''}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Hayat_Design_Report_${currentMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAsImage = async () => {
    if (!dashboardRef.current) return;
    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const element = dashboardRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F9F7F5',
        logging: false,
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);

          const clonedElement = clonedDoc.getElementById('dash');
          if (clonedElement) {
             clonedElement.style.padding = '60px';
             clonedElement.style.width = '1200px';
             clonedElement.style.background = '#F9F7F5';
          }
        }

      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `Hayat_Design_Report_${currentMonth}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsPDF = async () => {
    if (!dashboardRef.current) return;
    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const element = dashboardRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F9F7F5',
        logging: false,
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);

          const clonedElement = clonedDoc.getElementById('dash');
          if (clonedElement) {
             clonedElement.style.padding = '60px';
             clonedElement.style.width = '1200px';
             clonedElement.style.background = '#F9F7F5';
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Hayat_Design_Report_${currentMonth}.pdf`);
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  const totalWaste = monthWaste.reduce((acc: number, curr: any) => acc + curr.estimatedCost, 0);
  const wastePercentage = totalExpense > 0 ? (totalWaste / totalExpense) * 100 : 0;

  return (
    <div className="mb-14">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pb-10 border-b border-hayat-border/60">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="font-serif text-3xl md:text-5xl text-hayat-navy mb-3 tracking-tight">أهلاً بك، {user.displayName?.split(' ')[0]}</h2>
          <div className="flex items-center gap-3">
             <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                نشط الآن
             </span>
             <p className="text-slate-400 font-bold text-[11px] uppercase tracking-wider">
               متابعة الأداء المالي - {format(new Date(), 'MMMM yyyy')}
             </p>
          </div>
        </motion.div>
        
        <div className="flex flex-wrap gap-3" data-html2canvas-ignore="true">
          {noData && (
             <button 
               onClick={onSeedData}
               className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-hayat-wood text-white shadow-hayat hover:bg-yellow-700 transition-all ml-4"
             >
               استعادة بيانات تجريبية
             </button>
          )}
          <div className="flex bg-white/50 backdrop-blur-sm border border-hayat-border p-1.5 rounded-2xl shadow-hayat">
            <ExportButton label="PDF" onClick={exportAsPDF} disabled={isExporting} />
            <ExportButton label="صورة" onClick={exportAsImage} disabled={isExporting} />
            <ExportButton label="CSV" onClick={downloadReportCSV} disabled={isExporting} last />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="إجمالي المبيعات" value={totalRevenue} delay={0.1} color="#059669" />
        <StatCard label="المصاريف الفعلية" value={totalExpense} delay={0.2} color="#E11D48" />
        <StatCard label="صافي الربح" value={netProfit} delay={0.3} highlight color="#5B21B6" />
        <StatCard label="قيمة الهدر" value={totalWaste} delay={0.4} color="#D97706" />
      </div>
    </div>
  );
}

function ExportButton({ label, onClick, disabled, last }: { label: string, onClick: () => void, disabled: boolean, last?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-hayat-cream transition-all text-hayat-navy disabled:opacity-50 ${!last ? 'border-l border-hayat-border/40' : ''}`}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, delay, highlight, color }: any) {
  const primaryColor = "#2E1065";
  const emeraldColor = "#059669";
  const violetColor = "#6D28D9";
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`p-8 rounded-3xl transition-all border shadow-hayat relative overflow-hidden group`}
      style={{ 
        backgroundColor: '#FFFFFF',
        borderColor: highlight ? violetColor : '#E0E7FF',
        borderWidth: highlight ? '2px' : '1px'
      }}
    >
      {highlight && (
         <div className="absolute top-0 right-0 w-24 h-24 bg-purple-600/5 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-125"></div>
      )}
      <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-slate-400">{label}</p>
      <div className="flex items-baseline gap-2">
         <p className="text-3xl font-bold tracking-tight" style={{ color: color || primaryColor }}>{value.toLocaleString()}</p>
         <span className="text-[10px] font-bold text-slate-400">ريال</span>
      </div>
      <div className="mt-6 flex items-center gap-2">
         <div className="h-1.5 flex-1 bg-purple-50 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '65%' }}
              className="h-full bg-emerald-500 rounded-full"
            />
         </div>
         <span className="text-[9px] font-bold text-slate-400">Target</span>
      </div>
    </motion.div>
  );
}

function DashboardContent({ budgets, expenses, revenues, waste }: any) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  
  // Budget vs Actual Data
  const categories: Category[] = ['materials', 'marketing', 'maintenance', 'wages', 'other'];
  const budgetVsActual = categories.map(cat => {
    const target = budgets.find((b: any) => b.category === cat && b.month === currentMonth)?.amount || 0;
    const actual = expenses.filter((e: any) => e.category === cat && e.date && e.date.startsWith(currentMonth))
                           .reduce((acc: number, curr: any) => acc + curr.amount, 0);
    return { name: translateCategory(cat), target, actual };
  });

  const recentRevenues = [...revenues]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 5);

  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 5);

  const navyColor = "#2E1065";
  const woodColor = "#059669";
  const purpleColor = "#6D28D9";

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Actual vs Budget - Span 2 */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 card-hayat flex flex-col min-h-[500px]"
        >
          <div className="flex justify-between items-center mb-10">
            <div>
               <h3 className="text-xl font-bold mb-1" style={{ color: navyColor }}>مقارنة الإنفاق</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Estimated vs Actual</p>
            </div>
            <div className="flex gap-6">
               <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#EDE9FE' }}></div> 
                  تقديري
               </div>
               <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  <div className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: woodColor }}></div> 
                  فعلي
               </div>
            </div>
          </div>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActual} barGap={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                  cursor={{ fill: '#F8F7FD' }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e0e7ff', 
                    boxShadow: '0 10px 15px -3px rgba(91,33,182,0.05)',
                    padding: '12px'
                  }}
                />
                <Bar name="التقديري" dataKey="target" fill="#EDE9FE" radius={[6, 6, 0, 0]} barSize={34} isAnimationActive={false} />
                <Bar name="الفعلي" dataKey="actual" fill={woodColor} radius={[6, 6, 0, 0]} barSize={34} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Analytics - Span 1 */}
        <motion.div 
           initial={{ opacity: 0, x: -20 }}
           animate={{ opacity: 1, x: 0 }}
           className="card-hayat flex flex-col min-h-[500px]"
        >
          <div className="mb-10">
             <h3 className="text-xl font-bold mb-1" style={{ color: navyColor }}>مؤشر الاستهلاك</h3>
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Category Burn Rate</p>
          </div>
          <div className="space-y-8 flex-grow">
            {budgetVsActual.map((item, idx) => {
              const percentage = item.target > 0 ? (item.actual / item.target) * 100 : 0;
              const cappedPercentage = Math.min(percentage, 100);
              const isOver = item.actual > item.target && item.target > 0;
              return (
                <div key={idx}>
                  <div className="flex justify-between items-end mb-2.5">
                    <span className="text-[11px] font-bold text-slate-700">{item.name}</span>
                    <span className="text-[10px] font-black" style={{ color: isOver ? '#EF4444' : '#059669' }}>
                      {Math.round(percentage)}%
                    </span>
                  </div>
                  <div className="h-2 bg-purple-50 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${cappedPercentage}%` }}
                      transition={{ duration: 1.5, ease: "circOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: isOver ? '#EF4444' : woodColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-10 pt-10 border-t border-indigo-100/60">
            <h4 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400">Cash Flow Trend</h4>
            <div className="h-32">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={generateCashFlowTrend(revenues, expenses)}>
                    <defs>
                      <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={woodColor} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={woodColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" hide />
                    <Tooltip cursor={false} />
                    <Area type="monotone" dataKey="net" stroke={woodColor} fill="url(#colorNet)" strokeWidth={2.5} isAnimationActive={false} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-hayat">
          <div className="flex justify-between items-center mb-8">
            <div>
               <h3 className="text-xl font-bold mb-1" style={{ color: navyColor }}>أحدث المبيعات</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recent Revenue</p>
            </div>
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.4)]"></div>
          </div>
          <div className="space-y-1">
            {recentRevenues.length > 0 ? recentRevenues.map((r) => (
              <div key={r.id} className="flex justify-between items-center p-4 rounded-2xl hover:bg-purple-50/50 transition-all group border border-transparent hover:border-indigo-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{translateProduct(r.productType)}</p>
                    <p className="text-[10px] font-bold text-slate-400">{safeFormat(r.date, 'dd MMMM')}</p>
                  </div>
                </div>
                <div className="text-left font-serif">
                  <p className="text-lg font-bold text-emerald-700">{r.amount.toLocaleString()} <span className="text-[10px] font-sans font-bold">ريال</span></p>
                  <p className="text-[9px] font-bold uppercase tracking-tighter text-slate-400">Reference: #{r.orderNumber || '----'}</p>
                </div>
              </div>
            )) : (
              <p className="text-center py-12 text-sm italic text-slate-400">لا توجد مبيعات مسجلة</p>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-hayat">
          <div className="flex justify-between items-center mb-8">
            <div>
               <h3 className="text-xl font-bold mb-1" style={{ color: navyColor }}>أحدث المصاريف</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recent Expenses</p>
            </div>
            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.4)]"></div>
          </div>
          <div className="space-y-1">
            {recentExpenses.length > 0 ? recentExpenses.map((e) => (
              <div key={e.id} className="flex justify-between items-center p-4 rounded-2xl hover:bg-purple-50/50 transition-all group border border-transparent hover:border-indigo-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: '#FFF1F2', color: '#F43F5E' }}>
                    <Receipt size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{translateCategory(e.category)}</p>
                    <p className="text-[10px] font-bold text-slate-400">{safeFormat(e.date, 'dd MMMM')}</p>
                  </div>
                </div>
                <div className="text-left font-serif">
                  <p className="text-lg font-bold text-rose-700">{e.amount.toLocaleString()} <span className="text-[10px] font-sans font-bold">ريال</span></p>
                  <p className="text-[9px] font-bold uppercase tracking-tighter truncate max-w-[120px] text-slate-400">{e.description || 'General Operation'}</p>
                </div>
              </div>
            )) : (
              <p className="text-center py-12 text-sm italic text-slate-400">لا توجد مصاريف مسجلة</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// --- Expense Category Pie Chart Analysis Component ---

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  materials: '#5B21B6',   // Royal Violet
  marketing: '#059669',   // Emerald Green
  maintenance: '#D97706', // Amber Gold
  wages: '#2563EB',       // Blue
  other: '#E11D48',       // Rose Red
};

const EXPENSE_FALLBACK_COLORS = [
  '#7C3AED', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', 
  '#06B6D4', '#8B5CF6', '#14B8A6', '#F97316', '#6366F1'
];

interface ExpensePieChartAnalysisProps {
  expenses: Expense[];
  title?: string;
  subtitle?: string;
  settings?: any;
  compact?: boolean;
}

function ExpensePieChartAnalysis({
  expenses,
  title = "تحليل وتوزيع المصاريف حسب الفئات",
  subtitle = "مخطط بياني دائري تفاعلي لعرض نسب وتفاصيل استهلاك النفقات التشغيلية",
  settings,
  compact = false
}: ExpensePieChartAnalysisProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Group and calculate statistics
  const data = React.useMemo(() => {
    const map: Record<string, { category: string; name: string; amount: number; count: number; tax: number }> = {};
    expenses.forEach(e => {
      const cat = e.category || 'other';
      if (!map[cat]) {
        map[cat] = {
          category: cat,
          name: translateCategory(cat),
          amount: 0,
          count: 0,
          tax: 0
        };
      }
      map[cat].amount += (e.amount || 0);
      map[cat].count += 1;
      map[cat].tax += (e.taxAmount || 0);
    });

    const total = Object.values(map).reduce((sum, item) => sum + item.amount, 0);

    return Object.values(map)
      .map((item, idx) => ({
        ...item,
        percentage: total > 0 ? (item.amount / total) * 100 : 0,
        color: EXPENSE_CATEGORY_COLORS[item.category] || EXPENSE_FALLBACK_COLORS[idx % EXPENSE_FALLBACK_COLORS.length]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const totalAmount = React.useMemo(() => data.reduce((sum, d) => sum + d.amount, 0), [data]);
  const totalTax = React.useMemo(() => data.reduce((sum, d) => sum + d.tax, 0), [data]);
  const activeItem = activeIndex !== null ? data[activeIndex] : null;
  const topCategory = data.length > 0 ? data[0] : null;

  if (expenses.length === 0 || totalAmount === 0) {
    return (
      <div className="bg-purple-50/30 border border-purple-100 rounded-3xl p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-900 mx-auto flex items-center justify-center">
          <PieChartIcon size={24} />
        </div>
        <h4 className="text-base font-bold text-hayat-navy">لا توجد مصاريف مسجلة في هذه الفترة</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">قم بإضافة مصاريف أو تغيير نطاق الفترة الزمنية لعرض المخطط البياني الدائري التفاعلي.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-indigo-100/80 p-6 md:p-8 shadow-hayat space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-600"></span>
            <h3 className="text-lg font-bold text-hayat-navy">{title}</h3>
          </div>
          {subtitle && <p className="text-xs font-semibold text-slate-400 mt-1">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 bg-purple-50/60 border border-purple-100 px-3.5 py-1.5 rounded-xl">
          <span className="text-[10px] font-black text-purple-900 uppercase">إجمالي النفقات:</span>
          <span className="text-sm font-serif font-black text-purple-950 tabular-nums">
            {totalAmount.toLocaleString()} <span className="text-[10px] font-sans font-normal">ريال</span>
          </span>
        </div>
      </div>

      {/* KPI highlight pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-purple-50/40 border border-purple-100/60 p-3.5 rounded-2xl">
          <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider block mb-1">أعلى فئة استهلاك</span>
          <p className="text-xs font-bold text-slate-800 truncate">{topCategory?.name || '-'}</p>
          <span className="text-[10px] font-black text-emerald-700 block mt-0.5">{topCategory?.percentage.toFixed(1)}% من الإجمالي</span>
        </div>

        <div className="bg-emerald-50/40 border border-emerald-100/60 p-3.5 rounded-2xl">
          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1">عدد الفئات النشطة</span>
          <p className="text-base font-serif font-black text-emerald-950 tabular-nums">{data.length} <span className="text-[10px] font-sans font-bold">فئات</span></p>
          <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">{expenses.length} عملية مسجلة</span>
        </div>

        <div className="bg-blue-50/40 border border-blue-100/60 p-3.5 rounded-2xl">
          <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider block mb-1">متوسط العملية</span>
          <p className="text-base font-serif font-black text-blue-950 tabular-nums">
            {expenses.length > 0 ? Math.round(totalAmount / expenses.length).toLocaleString() : 0} <span className="text-[10px] font-sans font-bold">ريال</span>
          </p>
          <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">لكل فاتورة / سند</span>
        </div>

        {settings?.isTaxRegistered ? (
          <div className="bg-rose-50/40 border border-rose-100/60 p-3.5 rounded-2xl">
            <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider block mb-1">الضريبة المدخلة (VAT)</span>
            <p className="text-base font-serif font-black text-rose-950 tabular-nums">{totalTax.toLocaleString()} <span className="text-[10px] font-sans font-bold">ريال</span></p>
            <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">مستردة للإقرار</span>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">طريقة العرض</span>
            <p className="text-xs font-bold text-slate-700">مخطط دائري تفاعلي</p>
            <span className="text-[10px] font-semibold text-purple-700 block mt-0.5">حرك المؤشر للتفاصيل</span>
          </div>
        )}
      </div>

      {/* Main Chart + Interactive Categories split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
        {/* Donut Pie Chart with Centered Dynamic Info */}
        <div className="lg:col-span-5 relative flex items-center justify-center min-h-[300px]">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Tooltip 
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-indigo-100 text-right space-y-1 z-50">
                        <div className="flex items-center justify-between gap-3">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs font-bold text-slate-800">{item.name}</span>
                        </div>
                        <div className="text-base font-serif font-black text-purple-950">
                          {item.amount.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400 font-bold border-t border-slate-100 pt-1">
                          <span>النسبة: {item.percentage.toFixed(1)}%</span>
                          <span>{item.count} سندات</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={68}
                outerRadius={105}
                paddingAngle={3}
                dataKey="amount"
                nameKey="name"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color} 
                    stroke="#ffffff"
                    strokeWidth={activeIndex === index ? 3 : 1.5}
                    style={{
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.2s ease-in-out',
                      filter: activeIndex === index ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' : 'none'
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Central Donut Floating Metrics */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            {activeItem ? (
              <motion.div 
                key={`active-${activeItem.category}`}
                initial={{ scale: 0.85, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                className="space-y-0.5"
              >
                <span className="text-[10px] font-bold text-slate-400 block truncate max-w-[120px]">{activeItem.name}</span>
                <span className="text-lg font-serif font-black text-purple-950 block leading-tight">
                  {activeItem.amount.toLocaleString()} <span className="text-[10px] font-sans font-bold">ريال</span>
                </span>
                <span 
                  className="text-[10px] font-black px-2 py-0.5 rounded-full inline-block"
                  style={{ backgroundColor: `${activeItem.color}20`, color: activeItem.color }}
                >
                  {activeItem.percentage.toFixed(1)}%
                </span>
              </motion.div>
            ) : (
              <motion.div 
                key="idle"
                initial={{ scale: 0.85, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                className="space-y-0.5"
              >
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">إجمالي النفقات</span>
                <span className="text-base font-serif font-black text-purple-950 block leading-tight">
                  {totalAmount.toLocaleString()} <span className="text-[9px] font-sans font-bold">ريال</span>
                </span>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                  {data.length} فئات نشطة
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Categories Interactive Breakdown List */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-wider pb-1 px-1">
            <span>الفئة وعدد السندات</span>
            <span>القيمة والنسبة المئوية</span>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {data.map((item, idx) => (
              <div 
                key={item.category}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(null)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeIndex === idx 
                    ? 'bg-purple-50/80 border-purple-300 shadow-sm translate-x-[-2px]' 
                    : 'bg-white hover:bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-xs font-bold text-slate-800">{item.name}</span>
                    <span className="text-[10px] font-semibold text-slate-400">({item.count} سند)</span>
                  </div>
                  <div className="flex items-center gap-2 font-serif">
                    <span className="text-sm font-black text-purple-950">
                      {item.amount.toLocaleString()} <span className="text-[10px] font-sans font-bold text-slate-400">ريال</span>
                    </span>
                    <span 
                      className="text-[10px] font-black px-2 py-0.5 rounded-full" 
                      style={{ backgroundColor: `${item.color}15`, color: item.color }}
                    >
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(item.percentage, 2)}%`, backgroundColor: item.color }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Revenue / Sales Product Pie Chart Analysis Component ---

const REVENUE_PRODUCT_COLORS: Record<string, string> = {
  acrylic: '#5B21B6',   // Royal Violet
  wood: '#059669',      // Emerald Green
  svg: '#D97706',       // Amber Gold
  other: '#2563EB',     // Royal Blue
};

const REVENUE_FALLBACK_COLORS = [
  '#059669', '#5B21B6', '#D97706', '#2563EB', '#EC4899', 
  '#06B6D4', '#8B5CF6', '#10B981', '#F97316', '#6366F1'
];

interface RevenuePieChartAnalysisProps {
  revenues: Revenue[];
  title?: string;
  subtitle?: string;
  settings?: any;
  compact?: boolean;
}

function RevenuePieChartAnalysis({
  revenues,
  title = "تحليل وتوزيع المبيعات حسب نوع المنتج",
  subtitle = "مخطط بياني دائري تفاعلي لعرض نسب المبيعات وحصص المنتجات الأكثر ربحية",
  settings,
  compact = false
}: RevenuePieChartAnalysisProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Group and calculate statistics
  const data = React.useMemo(() => {
    const map: Record<string, { productType: string; name: string; amount: number; count: number; tax: number }> = {};
    revenues.forEach(r => {
      const pType = r.productType || 'other';
      if (!map[pType]) {
        map[pType] = {
          productType: pType,
          name: translateProduct(pType),
          amount: 0,
          count: 0,
          tax: 0
        };
      }
      map[pType].amount += (r.amount || 0);
      map[pType].count += 1;
      map[pType].tax += (r.taxAmount || 0);
    });

    const total = Object.values(map).reduce((sum, item) => sum + item.amount, 0);

    return Object.values(map)
      .map((item, idx) => ({
        ...item,
        percentage: total > 0 ? (item.amount / total) * 100 : 0,
        color: REVENUE_PRODUCT_COLORS[item.productType] || REVENUE_FALLBACK_COLORS[idx % REVENUE_FALLBACK_COLORS.length]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [revenues]);

  const totalAmount = React.useMemo(() => data.reduce((sum, d) => sum + d.amount, 0), [data]);
  const totalTax = React.useMemo(() => data.reduce((sum, d) => sum + d.tax, 0), [data]);
  const activeItem = activeIndex !== null ? data[activeIndex] : null;
  const topProduct = data.length > 0 ? data[0] : null;

  if (revenues.length === 0 || totalAmount === 0) {
    return (
      <div className="bg-emerald-50/30 border border-emerald-100 rounded-3xl p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center">
          <PieChartIcon size={24} />
        </div>
        <h4 className="text-base font-bold text-hayat-navy">لا توجد مبيعات مسجلة في هذه الفترة</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">قم بإضافة مبيعات أو تغيير نطاق الفترة الزمنية لعرض المخطط البياني الدائري التفاعلي.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-emerald-100/80 p-6 md:p-8 shadow-hayat space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <h3 className="text-lg font-bold text-hayat-navy">{title}</h3>
          </div>
          {subtitle && <p className="text-xs font-semibold text-slate-400 mt-1">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-100 px-3.5 py-1.5 rounded-xl">
          <span className="text-[10px] font-black text-emerald-900 uppercase">إجمالي المبيعات:</span>
          <span className="text-sm font-serif font-black text-emerald-950 tabular-nums">
            {totalAmount.toLocaleString()} <span className="text-[10px] font-sans font-normal">ريال</span>
          </span>
        </div>
      </div>

      {/* KPI highlight pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-emerald-50/40 border border-emerald-100/60 p-3.5 rounded-2xl">
          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1">المنتج الأكثر مبيعاً</span>
          <p className="text-xs font-bold text-slate-800 truncate">{topProduct?.name || '-'}</p>
          <span className="text-[10px] font-black text-purple-700 block mt-0.5">{topProduct?.percentage.toFixed(1)}% من الإجمالي</span>
        </div>

        <div className="bg-purple-50/40 border border-purple-100/60 p-3.5 rounded-2xl">
          <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider block mb-1">أنواع المنتجات</span>
          <p className="text-base font-serif font-black text-purple-950 tabular-nums">{data.length} <span className="text-[10px] font-sans font-bold">منتجات</span></p>
          <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">{revenues.length} طلبات مكتملة</span>
        </div>

        <div className="bg-blue-50/40 border border-blue-100/60 p-3.5 rounded-2xl">
          <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider block mb-1">متوسط قيمة الطلب</span>
          <p className="text-base font-serif font-black text-blue-950 tabular-nums">
            {revenues.length > 0 ? Math.round(totalAmount / revenues.length).toLocaleString() : 0} <span className="text-[10px] font-sans font-bold">ريال</span>
          </p>
          <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">لكل فاتورة / طلب</span>
        </div>

        {settings?.isTaxRegistered ? (
          <div className="bg-amber-50/40 border border-amber-100/60 p-3.5 rounded-2xl">
            <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block mb-1">ضريبة المبيعات (VAT)</span>
            <p className="text-base font-serif font-black text-amber-950 tabular-nums">{totalTax.toLocaleString()} <span className="text-[10px] font-sans font-bold">ريال</span></p>
            <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">محصلة من العملاء</span>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">طريقة العرض</span>
            <p className="text-xs font-bold text-slate-700">مخطط دائري تفاعلي</p>
            <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">حرك المؤشر للتفاصيل</span>
          </div>
        )}
      </div>

      {/* Main Chart + Interactive Categories split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
        {/* Donut Pie Chart with Centered Dynamic Info */}
        <div className="lg:col-span-5 relative flex items-center justify-center min-h-[300px]">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Tooltip 
                content={({ active, payload }: any) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-emerald-100 text-right space-y-1 z-50">
                        <div className="flex items-center justify-between gap-3">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs font-bold text-slate-800">{item.name}</span>
                        </div>
                        <div className="text-base font-serif font-black text-emerald-950">
                          {item.amount.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400 font-bold border-t border-slate-100 pt-1">
                          <span>النسبة: {item.percentage.toFixed(1)}%</span>
                          <span>{item.count} طلبات</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={68}
                outerRadius={105}
                paddingAngle={3}
                dataKey="amount"
                nameKey="name"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color} 
                    stroke="#ffffff"
                    strokeWidth={activeIndex === index ? 3 : 1.5}
                    style={{
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.2s ease-in-out',
                      filter: activeIndex === index ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' : 'none'
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Central Donut Floating Metrics */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            {activeItem ? (
              <motion.div 
                key={`active-${activeItem.productType}`}
                initial={{ scale: 0.85, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                className="space-y-0.5"
              >
                <span className="text-[10px] font-bold text-slate-400 block truncate max-w-[120px]">{activeItem.name}</span>
                <span className="text-lg font-serif font-black text-emerald-950 block leading-tight">
                  {activeItem.amount.toLocaleString()} <span className="text-[10px] font-sans font-bold">ريال</span>
                </span>
                <span 
                  className="text-[10px] font-black px-2 py-0.5 rounded-full inline-block"
                  style={{ backgroundColor: `${activeItem.color}20`, color: activeItem.color }}
                >
                  {activeItem.percentage.toFixed(1)}%
                </span>
              </motion.div>
            ) : (
              <motion.div 
                key="idle"
                initial={{ scale: 0.85, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                className="space-y-0.5"
              >
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">إجمالي المبيعات</span>
                <span className="text-base font-serif font-black text-emerald-950 block leading-tight">
                  {totalAmount.toLocaleString()} <span className="text-[9px] font-sans font-bold">ريال</span>
                </span>
                <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full inline-block">
                  {data.length} منتجات نشطة
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Products Interactive Breakdown List */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-wider pb-1 px-1">
            <span>نوع المنتج وعدد الطلبات</span>
            <span>القيمة والنسبة المئوية</span>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {data.map((item, idx) => (
              <div 
                key={item.productType}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(null)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeIndex === idx 
                    ? 'bg-emerald-50/80 border-emerald-300 shadow-sm translate-x-[-2px]' 
                    : 'bg-white hover:bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-xs font-bold text-slate-800">{item.name}</span>
                    <span className="text-[10px] font-semibold text-slate-400">({item.count} طلب)</span>
                  </div>
                  <div className="flex items-center gap-2 font-serif">
                    <span className="text-sm font-black text-emerald-950">
                      {item.amount.toLocaleString()} <span className="text-[10px] font-sans font-bold text-slate-400">ريال</span>
                    </span>
                    <span 
                      className="text-[10px] font-black px-2 py-0.5 rounded-full" 
                      style={{ backgroundColor: `${item.color}15`, color: item.color }}
                    >
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(item.percentage, 2)}%`, backgroundColor: item.color }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Reports Section ---

function ReportsView({ expenses, revenues, budgets, waste = [], setActiveTab, settings }: { expenses: Expense[], revenues: Revenue[], budgets: BudgetTarget[], waste?: WasteItem[], setActiveTab: (tab: any) => void, settings: any }) {
  const [viewMode, setViewMode] = useState<'pl' | 'revenue_analysis' | 'expense_analysis' | 'chart' | 'table'>('pl');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const reportsRef = useRef<HTMLDivElement>(null);

  const navyColor = '#2E1065';
  const woodColor = '#059669';
  const purpleColor = '#6D28D9';

  // Date states for Profit & Loss and general filtering
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return format(startOfMonth(d), 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return format(endOfMonth(d), 'yyyy-MM-dd');
  });

  // Quick preset handlers
  const presetThisMonth = () => {
    const d = new Date();
    setDateFrom(format(startOfMonth(d), 'yyyy-MM-dd'));
    setDateTo(format(endOfMonth(d), 'yyyy-MM-dd'));
  };

  const presetThisQuarter = () => {
    const d = new Date();
    const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    const startQ = new Date(d.getFullYear(), qStartMonth, 1);
    const endQ = endOfMonth(new Date(d.getFullYear(), qStartMonth + 2, 1));
    setDateFrom(format(startQ, 'yyyy-MM-dd'));
    setDateTo(format(endQ, 'yyyy-MM-dd'));
  };

  const presetThisYear = () => {
    const d = new Date();
    setDateFrom(format(new Date(d.getFullYear(), 0, 1), 'yyyy-MM-dd'));
    setDateTo(format(new Date(d.getFullYear(), 11, 31), 'yyyy-MM-dd'));
  };

  const presetAllTime = () => {
    setDateFrom('');
    setDateTo('');
  };

  // Filtered dataset hooks based on custom date range
  const filteredRevenues = React.useMemo(() => {
    return revenues.filter(r => {
      if (!r.date) return false;
      const dStr = r.date.split('T')[0];
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });
  }, [revenues, dateFrom, dateTo]);

  const filteredExpenses = React.useMemo(() => {
    return expenses.filter(e => {
      if (!e.date) return false;
      const dStr = e.date.split('T')[0];
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });
  }, [expenses, dateFrom, dateTo]);

  const filteredWaste = React.useMemo(() => {
    return waste.filter(w => {
      if (!w.date) return false;
      const dStr = w.date.split('T')[0];
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });
  }, [waste, dateFrom, dateTo]);

  // Profit & Loss calculation based on the custom date range
  const plData = React.useMemo(() => {
    const totalRevenue = filteredRevenues.reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalWaste = filteredWaste.reduce((sum, w) => sum + w.estimatedCost, 0);

    const totalRevenueTax = filteredRevenues.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
    const totalExpenseTax = filteredExpenses.reduce((sum, e) => sum + (e.taxAmount || 0), 0);

    // Group revenues by ProductType
    const revenueBreakdown: Record<string, { type: string; amount: number; tax: number; count: number }> = {};
    filteredRevenues.forEach(r => {
      const pType = r.productType || 'other';
      if (!revenueBreakdown[pType]) {
        revenueBreakdown[pType] = { type: pType, amount: 0, tax: 0, count: 0 };
      }
      revenueBreakdown[pType].amount += r.amount;
      revenueBreakdown[pType].tax += (r.taxAmount || 0);
      revenueBreakdown[pType].count += 1;
    });

    // Group expenses by Category
    const expenseBreakdown: Record<string, { category: string; amount: number; tax: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      const cat = e.category || 'other';
      if (!expenseBreakdown[cat]) {
        expenseBreakdown[cat] = { category: cat, amount: 0, tax: 0, count: 0 };
      }
      expenseBreakdown[cat].amount += e.amount;
      expenseBreakdown[cat].tax += (e.taxAmount || 0);
      expenseBreakdown[cat].count += 1;
    });

    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = totalRevenue - totalExpenses - totalWaste;
    const operatingMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const wasteRatio = totalRevenue > 0 ? (totalWaste / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalExpenses,
      totalWaste,
      totalRevenueTax,
      totalExpenseTax,
      revenueBreakdown: Object.values(revenueBreakdown).sort((a, b) => b.amount - a.amount),
      expenseBreakdown: Object.values(expenseBreakdown).sort((a, b) => b.amount - a.amount),
      grossProfit,
      netProfit,
      operatingMargin,
      netMargin,
      wasteRatio,
      revenuesCount: filteredRevenues.length,
      expensesCount: filteredExpenses.length,
      wasteCount: filteredWaste.length
    };
  }, [filteredRevenues, filteredExpenses, filteredWaste]);

  // Aggregate data by month for standard trend views
  const monthlyData = React.useMemo(() => {
    const data: Record<string, { month: string; revenue: number; expense: number; budget: number }> = {};
    
    // Process all dates to find all months present
    const allDates = [
      ...revenues.map(r => r.date),
      ...expenses.map(e => e.date),
      ...budgets.map(b => `${b.month}-01`)
    ].filter(Boolean);
    
    const months = Array.from(new Set(allDates.map(d => {
      try {
        return format(parseISO(d!), 'yyyy-MM');
      } catch (e) {
        return '';
      }
    }).filter(Boolean))).sort();
    
    months.forEach(m => {
      data[m] = { month: m, revenue: 0, expense: 0, budget: 0 };
    });
    
    revenues.forEach(r => {
      if (!r.date) return;
      const m = format(parseISO(r.date), 'yyyy-MM');
      if (data[m]) data[m].revenue += r.amount;
    });
    
    expenses.forEach(e => {
      if (!e.date) return;
      const m = format(parseISO(e.date), 'yyyy-MM');
      if (data[m]) data[m].expense += e.amount;
    });
    
    budgets.forEach(b => {
      const m = b.month;
      if (data[m]) data[m].budget += b.amount;
    });
    
    // Filter months if dates are specified to streamline trends as well
    let finalMonths = Object.keys(data);
    if (dateFrom || dateTo) {
      finalMonths = finalMonths.filter(m => {
        const startOfM = `${m}-01`;
        const endOfM = format(endOfMonth(parseISO(startOfM)), 'yyyy-MM-dd');
        if (dateFrom && endOfM < dateFrom) return false;
        if (dateTo && startOfM > dateTo) return false;
        return true;
      });
    }
    
    return finalMonths.map(m => {
      const d = data[m];
      return {
        ...d,
        formattedMonth: format(parseISO(`${d.month}-01`), 'MMM yyyy', { locale: arSA }),
        profit: d.revenue - d.expense,
        margin: d.revenue > 0 ? (d.revenue - d.expense) / d.revenue * 100 : 0
      };
    });
  }, [revenues, expenses, budgets, dateFrom, dateTo]);

  const exportReport = async (formatType: 'pdf' | 'png') => {
    if (!reportsRef.current) return;
    const element = reportsRef.current;
    
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F9F7F5',
        onclone: (clonedDoc) => {
           cleanOklColorsAndPatchGetComputedStyle(clonedDoc);

           const el = clonedDoc.getElementById('reports-content');
           if (el) {
              el.style.padding = '40px';
              el.style.width = '1200px';
           }
        }
      });
      
      if (formatType === 'png') {
        const link = document.createElement('a');
        link.download = `Hayat_Design_Report_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = canvas.toDataURL();
        link.click();
      } else {
        const pdf = new jsPDF('l', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Hayat_Design_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 text-right"
      dir="rtl"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-serif text-hayat-navy mb-2">التقارير التحليلية والمالية</h2>
          <p className="text-slate-400 text-sm font-bold">تحليل دقيق للأداء المالي، الاستهلاك، وقائمة الأرباح والخسائر المباشرة</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-2xl shadow-hayat border border-hayat-border/40 overflow-x-auto w-full md:w-auto">
           <button 
            onClick={() => setViewMode('pl')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all ${viewMode === 'pl' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             الأرباح والخسائر
           </button>
           <button 
            onClick={() => setViewMode('revenue_analysis')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewMode === 'revenue_analysis' ? 'bg-emerald-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             <PieChartIcon size={13} className={viewMode === 'revenue_analysis' ? 'text-emerald-200' : 'text-emerald-600'} />
             <span>تحليل المبيعات</span>
           </button>
           <button 
            onClick={() => setViewMode('expense_analysis')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewMode === 'expense_analysis' ? 'bg-purple-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             <PieChartIcon size={13} className={viewMode === 'expense_analysis' ? 'text-purple-200' : 'text-purple-600'} />
             <span>تحليل المصاريف</span>
           </button>
           <button 
            onClick={() => setViewMode('chart')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all ${viewMode === 'chart' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             الاتجاهات والرسوم
           </button>
           <button 
            onClick={() => setViewMode('table')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all ${viewMode === 'table' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             الجداول التفصيلية
           </button>
        </div>
      </div>

      {/* Modern Date Filter panel */}
      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-hayat-border/50 shadow-hayat flex flex-col md:flex-row justify-between items-stretch md:items-center gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <Calendar className="text-hayat-wood w-5 h-5 flex-shrink-0" />
            <h3 className="text-sm font-bold text-hayat-navy">فلترة مخصصة للفترة الزمنية</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">الفترة من</span>
              <input 
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-hayat-accent/40 border border-hayat-border/30 px-4 py-2.5 rounded-xl text-xs font-bold text-hayat-navy outline-none focus:border-hayat-navy transition-colors text-right"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">الفترة إلى</span>
              <input 
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-hayat-accent/40 border border-hayat-border/30 px-4 py-2.5 rounded-xl text-xs font-bold text-hayat-navy outline-none focus:border-hayat-navy transition-colors text-right"
              />
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-col justify-end gap-2 px-1 border-t md:border-t-0 md:border-r border-hayat-border/30 pt-4 md:pt-0 md:pr-6 md:min-w-[160px]">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">فترات سريعة</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button 
              onClick={presetThisMonth}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 transition-colors"
            >
              هذا الشهر
            </button>
            <button 
              onClick={presetThisQuarter}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 transition-colors"
            >
              هذا الربع
            </button>
            <button 
              onClick={presetThisYear}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 transition-colors"
            >
              هذه السنة
            </button>
            <button 
              onClick={presetAllTime}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 transition-colors"
            >
              كل الأوقات
            </button>
          </div>
        </div>
      </div>

      <div id="reports-content" ref={reportsRef} className="card-hayat bg-white space-y-12 min-h-[400px] flex flex-col items-center justify-center p-8 sm:p-12">
        {monthlyData.length === 0 && viewMode !== 'pl' ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-hayat-accent/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileBarChart size={32} className="text-hayat-navy/40" />
            </div>
            <h3 className="text-xl font-bold text-hayat-navy mb-2">لا توجد بيانات كافية للتقارير</h3>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">أضف بعض المبيعات والمصاريف ليتمكن النظام من تحليل بياناتك وعرض التقارير الشهرية للفترة المحددة.</p>
            <button 
              onClick={() => setActiveTab('revenues')}
              className="mt-8 px-6 py-3 bg-hayat-navy text-white rounded-xl font-bold text-xs shadow-hayat hover:scale-105 transition-transform"
            >
              إضافة مبيعات الآن
            </button>
          </div>
        ) : viewMode === 'pl' ? (
          <div className="w-full space-y-10" dir="rtl">
            {/* Header / Sub-banner */}
            <div className="border-b border-hayat-border/60 pb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1.5 md:text-right">
                <h3 className="font-serif text-3xl font-black text-hayat-navy tracking-tight">{settings.storeName}</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.25em] font-extrabold">قائمة الأرباح والخسائر الموحدة • P&L Statement</p>
                <p className="text-xs text-slate-500 font-bold">
                  كشف الحسابات للفترة: <span className="font-serif text-hayat-wood font-extrabold">{dateFrom ? safeFormat(dateFrom, 'yyyy/MM/dd') : 'أول معاملة'}</span> م — إلى: <span className="font-serif text-hayat-wood font-extrabold">{dateTo ? safeFormat(dateTo, 'yyyy/MM/dd') : 'اليوم'}</span> م
                </p>
              </div>
              
              <div className="bg-hayat-accent/30 border border-hayat-border/30 rounded-2xl p-4 text-left">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">المطابقة والنظام</span>
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-black text-hayat-navy">معتمدة ومحدثة</span>
                </div>
                {settings.isTaxRegistered && <span className="text-[8.5px] font-bold text-slate-400 block mt-1">الرقم الضريبي: {settings.taxNumber}</span>}
              </div>
            </div>

            {/* Financial Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 bg-emerald-50/50 border border-emerald-100 rounded-3xl text-right space-y-2">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">إجمالي المقبوضات/المبيعات</span>
                <p className="text-2xl font-serif font-black text-emerald-800 tabular-nums">
                  {plData.totalRevenue.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className="text-[10px] text-slate-400 block font-bold">{plData.revenuesCount} طلب مالي للعملاء</span>
              </div>

              <div className="p-6 bg-rose-50/50 border border-rose-100 rounded-3xl text-right space-y-2">
                <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block">إجمالي النفقات/المصاريف</span>
                <p className="text-2xl font-serif font-black text-rose-800 tabular-nums">
                  {plData.totalExpenses.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className="text-[10px] text-slate-400 block font-bold">{plData.expensesCount} سند مالي مصروف</span>
              </div>

              <div className="p-6 bg-amber-50/40 border border-amber-100/60 rounded-3xl text-right space-y-2">
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">هدر المواد والتصنيع</span>
                <p className="text-2xl font-serif font-black text-amber-800 tabular-nums">
                  {plData.totalWaste.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className="text-[10px] text-slate-400 block font-bold">{plData.wasteCount} تالف مواد / عيوب مصنعية</span>
              </div>

              <div className={`p-6 border rounded-3xl text-right space-y-2 ${plData.netProfit >= 0 ? 'bg-purple-50/70 border-purple-100' : 'bg-red-50 border-red-200'}`}>
                <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: plData.netProfit >= 0 ? navyColor : '#B91C1C' }}>صافي الأرباح بالفترة</span>
                <p className="text-2xl font-serif font-black tabular-nums" style={{ color: plData.netProfit >= 0 ? navyColor : '#911F1F' }}>
                  {plData.netProfit.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className={`text-[10px] block font-black ${plData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  هامش مبيعات ناصع {Math.round(plData.netMargin)}%
                </span>
              </div>
            </div>

            {/* Split Account Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-4">
              {/* OPERATING REVENUES breakdown */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b-2 border-emerald-400 pb-3">
                  <span className="text-sm font-black text-emerald-900">1. الإيرادات التشغيلية المباشرة</span>
                  <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">Inflow Channels</span>
                </div>
                
                <div className="divide-y divide-slate-100 text-xs font-bold text-slate-600">
                  {['acrylic', 'wood', 'svg', 'other'].map(pType => {
                    const item = plData.revenueBreakdown.find(b => b.type === pType) || { amount: 0, count: 0, tax: 0 };
                    const pct = plData.totalRevenue > 0 ? (item.amount / plData.totalRevenue) * 100 : 0;
                    return (
                      <div key={pType} className="flex justify-between items-center py-3.5">
                        <div className="space-y-1">
                          <span className="text-slate-800 text-sm block">{translateProduct(pType)}</span>
                          <span className="text-[10px] text-slate-400 block font-normal">{item.count} طلب شراء</span>
                        </div>
                        <div className="text-left font-serif">
                          <p className="text-slate-800 text-sm tabular-nums font-black">{item.amount.toLocaleString()} ريال</p>
                          <p className="text-[10px] text-slate-400 font-sans font-medium">{Math.round(pct)}% من المقبوضات</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center text-xs font-black text-slate-800 border border-slate-100/80">
                  <span>إجمالي مبيعات وإيرادات الفترة م ل</span>
                  <span className="font-serif text-sm font-black text-emerald-700">{plData.totalRevenue.toLocaleString()} ريال</span>
                </div>
              </div>

              {/* OPERATING EXPENSES breakdown */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b-2 border-rose-300 pb-3">
                  <span className="text-sm font-black text-rose-800">2. مصروفات وتكاليف الإنتاج والتشغيل</span>
                  <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full uppercase">Outflow Channels</span>
                </div>
                
                <div className="divide-y divide-slate-100 text-xs font-bold text-slate-600">
                  {['materials', 'marketing', 'maintenance', 'wages', 'other'].map(cat => {
                    const item = plData.expenseBreakdown.find(b => b.category === cat) || { amount: 0, count: 0, tax: 0 };
                    const pct = plData.totalExpenses > 0 ? (item.amount / plData.totalExpenses) * 100 : 0;
                    return (
                      <div key={cat} className="flex justify-between items-center py-3.5">
                        <div className="space-y-1">
                          <span className="text-slate-800 text-sm block">{translateCategory(cat)}</span>
                          <span className="text-[10px] text-slate-400 block font-normal">{item.count} فاتورة صادرة</span>
                        </div>
                        <div className="text-left font-serif">
                          <p className="text-slate-800 text-sm tabular-nums font-black">{item.amount.toLocaleString()} ريال</p>
                          <p className="text-[10px] text-slate-400 font-sans font-medium">{Math.round(pct)}% من النفقات</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center text-xs font-black text-slate-800 border border-slate-100/80">
                  <span>إجمالي مصروفات ونفقات الفترة م ل</span>
                  <span className="font-serif text-sm font-black text-rose-700">{plData.totalExpenses.toLocaleString()} ريال</span>
                </div>
              </div>
            </div>

            {/* Waste and VAT adjustments */}
            <div className="border-t border-dashed border-hayat-border/60 pt-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-bold text-slate-600">
              {/* Waste box */}
              <div className="bg-amber-50/20 border border-amber-200/40 p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-black text-sm">3. خسائر الهدر المالي الممتص بالفترة</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-bold">
                  تنتج مبالغ الهدر جراء تلف خامات الأكريليك، أخطاء القياسات أو الخسائر الفنية للقطع المعيبة، ويتم اقتطاعها وتصنيفها كـ كلفة خسارة تامة بالفترة.
                </p>
                <div className="flex justify-between items-center pt-2 font-serif text-amber-950 font-black border-t border-amber-100/50">
                  <span>القيمة الكلية للهدر والخسارة</span>
                  <span className="text-sm">{plData.totalWaste.toLocaleString()} ريال</span>
                </div>
              </div>

              {/* VAT summary box */}
              {settings.isTaxRegistered && (
                <div className="bg-hayat-accent/20 border border-hayat-border/30 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-hayat-navy">
                    <Receipt className="w-5 h-5" />
                    <span className="font-black text-sm">4. تسويات ضريبة القيمة المضافة (VAT Summary)</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">الضريبة المخرجة (المحصلة من العملاء)</span>
                      <span className="font-serif tabular-nums text-emerald-600 font-extrabold">+{plData.totalRevenueTax.toLocaleString()} ريال</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">الضريبة المدخلة (المدفوعة للموردين)</span>
                      <span className="font-serif tabular-nums text-rose-600 font-extrabold">-{plData.totalExpenseTax.toLocaleString()} ريال</span>
                    </div>
                    <div className="flex justify-between pt-1 font-black text-hayat-navy border-t border-slate-100">
                      <span>صافي المديونية / الارتجاع الضريبي</span>
                      <span className="font-serif tabular-nums">
                        {(plData.totalRevenueTax - plData.totalExpenseTax).toLocaleString()} ريال
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Final bottom audit total */}
            <div className="border-t-4 border-double border-purple-900/30 pt-6 mt-10">
              <div className="bg-purple-950 text-white rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl shadow-purple-950/10">
                <div className="space-y-1 text-center md:text-right">
                  <span className="text-[10px] font-black tracking-widest text-emerald-300 uppercase block mb-1">صافي نتيجة الأعمال للفترة م ل</span>
                  <h4 className="text-lg font-black font-serif">نتيجة الأرباح أو الخسائر الصافية للفترة المحددة</h4>
                </div>
                
                <div className="text-center md:text-left font-serif">
                  <p className="text-4xl font-black text-emerald-300 tabular-nums leading-none">
                    {plData.netProfit.toLocaleString()} <span className="text-base font-sans font-bold">ريال</span>
                  </p>
                  <p className="text-xs text-white/80 mt-2 font-sans font-bold">
                    صافي هامش مبيعاتك: <span className="text-emerald-300 font-black">{Math.round(plData.netMargin)}%</span> • معامل هدر الإيراد: <span className="text-purple-200 font-black">{Math.round(plData.wasteRatio)}%</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Stamp and signature placeholders */}
            <div className="grid grid-cols-2 gap-4 text-center pt-12 border-t border-dashed border-hayat-border/40 select-none">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">إعداد المحاسب المالي</p>
                <div className="w-32 h-px bg-slate-300 mx-auto"></div>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">اعتماد الإدارة المكلّفة</p>
                <div className="w-32 h-px bg-slate-300 mx-auto"></div>
              </div>
            </div>
          </div>
        ) : viewMode === 'revenue_analysis' ? (
          <div className="w-full space-y-6">
            <RevenuePieChartAnalysis 
              revenues={filteredRevenues} 
              settings={settings}
              title="تحليل وتوزيع المبيعات حسب نوع المنتج (Pie Chart)"
              subtitle="مخطط بياني دائري تفاعلي وتحليل لحصص المبيعات والمنتجات الأكثر طلباً في الفترة المحددة"
            />
          </div>
        ) : viewMode === 'expense_analysis' ? (
          <div className="w-full space-y-6">
            <ExpensePieChartAnalysis 
              expenses={filteredExpenses} 
              settings={settings}
              title="تحليل وتوزيع المصاريف حسب الفئات (Pie Chart)"
              subtitle="مخطط بياني دائري تفاعلي وتحليل كمي ونسب استهلاك الميزانية بحسب النطاق الزمني المحدد"
            />
          </div>
        ) : viewMode === 'chart' ? (
          <div className="w-full space-y-10">
            <div className="flex justify-between items-center bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
               <h4 className="text-sm font-bold text-hayat-navy">تحليل المبيعات والمصاريف الشهرية</h4>
               <div className="flex gap-2">
                  <button 
                    onClick={() => setChartType('bar')}
                    className={`p-2 rounded-lg transition-all ${chartType === 'bar' ? 'bg-purple-900 text-white shadow-sm' : 'bg-white text-slate-400'}`}
                  >
                    <LayoutDashboard size={16} />
                  </button>
                  <button 
                    onClick={() => setChartType('line')}
                    className={`p-2 rounded-lg transition-all ${chartType === 'line' ? 'bg-purple-900 text-white shadow-sm' : 'bg-white text-slate-400'}`}
                  >
                    <TrendingUp size={16} />
                  </button>
               </div>
            </div>
            
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={monthlyData} barGap={8}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="formattedMonth" fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e0e7ff', boxShadow: '0 10px 15px -3px rgba(91,33,182,0.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '10px' }} />
                    <Bar name="إجمالي المبيعات" dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} barSize={34} />
                    <Bar name="إجمالي المصاريف" dataKey="expense" fill="#E11D48" radius={[4, 4, 0, 0]} barSize={34} />
                  </BarChart>
                ) : (
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E11D48" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#E11D48" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="formattedMonth" fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e0e7ff', boxShadow: '0 10px 15px -3px rgba(91,33,182,0.05)' }} />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '10px' }} />
                    <Area type="monotone" name="المبيعات" dataKey="revenue" stroke="#059669" strokeWidth={3} fill="url(#revenueGrad)" />
                    <Area type="monotone" name="المصاريف" dataKey="expense" stroke="#E11D48" strokeWidth={3} fill="url(#expenseGrad)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Visual Sales & Expense Breakdown Pie Charts in Charts mode */}
            <div className="grid grid-cols-1 gap-8 pt-6 border-t border-indigo-100/60">
              <RevenuePieChartAnalysis 
                revenues={filteredRevenues} 
                settings={settings}
                title="توزيع ونسب المبيعات حسب نوع المنتج (Pie Chart)"
                subtitle="تحليل مرئي لحصص إيرادات المنتجات ضمن الفترة المحددة"
              />
              <ExpensePieChartAnalysis 
                expenses={filteredExpenses} 
                settings={settings}
                title="توزيع ونسب استهلاك المصاريف حسب الفئات (Pie Chart)"
                subtitle="تحليل مرئي لحصص التكلفة الممتصة ضمن الفترة المحددة"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-indigo-100/60">
               <div>
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">تحليل هامش الربح الشهري</h5>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="formattedMonth" hide />
                          <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '10px' }} />
                          <Line type="monotone" name="هامش الربح %" dataKey="margin" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669' }} />
                       </LineChart>
                    </ResponsiveContainer>
                  </div>
               </div>
               <div className="flex flex-col justify-center bg-hayat-accent/10 p-8 rounded-[2rem] border border-hayat-border/20">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">ملخص الأداء المتراكم</h5>
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">متوسط الربح الشهري</span>
                        <span className="text-lg font-serif font-black text-hayat-navy">
                           {monthlyData.length > 0 ? (monthlyData.reduce((acc, curr) => acc + curr.profit, 0) / monthlyData.length).toLocaleString() : 0} <span className="text-[9px] font-sans">ريال</span>
                        </span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">أعلى شهر مبيعات</span>
                        <span className="text-lg font-serif font-black text-emerald-600">
                           {monthlyData.length > 0 ? Math.max(...monthlyData.map(d => d.revenue)).toLocaleString() : 0} <span className="text-[9px] font-sans">ريال</span>
                        </span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">متوسط المصاريف</span>
                        <span className="text-lg font-serif font-black text-rose-600">
                           {monthlyData.length > 0 ? (monthlyData.reduce((acc, curr) => acc + curr.expense, 0) / monthlyData.length).toLocaleString() : 0} <span className="text-[9px] font-sans">ريال</span>
                        </span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-400 text-[9px] uppercase tracking-[0.2em] font-black">
                  <th className="py-6 px-10">الشهر</th>
                  <th className="py-6 px-10">المبيعات</th>
                  <th className="py-6 px-10">المصاريف</th>
                  <th className="py-6 px-10">الربح الصافي</th>
                  <th className="py-6 px-10 text-left">هامش الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hayat-border/30">
                {monthlyData.slice().reverse().map((data) => (
                  <tr key={data.month} className="hover:bg-hayat-accent/40 transition-colors">
                    <td className="py-6 px-10">
                       <span className="text-xs font-black text-hayat-navy uppercase tracking-widest">{format(parseISO(`${data.month}-01`), 'MMMM yyyy', { locale: arSA })}</span>
                    </td>
                    <td className="py-6 px-10 font-bold text-emerald-600 tabular-nums">
                       {data.revenue.toLocaleString()} <span className="text-[9px] font-sans opacity-40">ريال</span>
                    </td>
                    <td className="py-6 px-10 font-bold text-rose-600 tabular-nums">
                       {data.expense.toLocaleString()} <span className="text-[9px] font-sans opacity-40">ريال</span>
                    </td>
                    <td className="py-6 px-10 font-serif font-black text-hayat-navy text-lg tabular-nums">
                       {data.profit.toLocaleString()} <span className="text-[10px] font-sans opacity-40">ريال</span>
                    </td>
                    <td className="py-6 px-10 text-left">
                       <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black ${data.margin >= 30 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {Math.round(data.margin)}%
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 select-none" data-html2canvas-ignore="true">
        <button 
          onClick={() => exportReport('pdf')}
          className="btn-secondary flex items-center gap-2 font-bold cursor-pointer transition-transform hover:scale-102"
        >
          تصدير كـ PDF
        </button>
        <button 
          onClick={() => exportReport('png')}
          className="btn-primary flex items-center gap-2 font-bold cursor-pointer transition-transform hover:scale-102"
        >
          تنزيل كصورة
        </button>
      </div>
    </motion.div>
  );
}

function DataListSection({ title, type, items, user, services, settings }: { title: string, type: 'budget'|'expense'|'revenue'|'waste', items: any[], user: User, services: any, settings: any }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showPieChart, setShowPieChart] = useState(false);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من مسح هذا السجل؟')) return;
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
    } catch (e) {
      console.error(e);
    }
  };

  // Advanced inline sorting and filtering
  const filteredItems = React.useMemo(() => {
    return items.filter(item => {
      // 1. Text Search Filter
      const textMatch = search === '' ? true : (
        (item.description?.toLowerCase().includes(search.toLowerCase())) ||
        (item.reason?.toLowerCase().includes(search.toLowerCase())) ||
        (item.material?.toLowerCase().includes(search.toLowerCase())) ||
        (item.orderNumber?.toLowerCase().includes(search.toLowerCase())) ||
        (translateCategory(item.category || '').toLowerCase().includes(search.toLowerCase())) ||
        (translateProduct(item.productType || '').toLowerCase().includes(search.toLowerCase()))
      );

      // 2. Payment Method Filter
      const payMatch = paymentFilter === 'all' ? true : (item.paymentMethod === paymentFilter);

      // 3. Date range filter
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
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2.5rem] shadow-hayat-lg overflow-hidden border border-hayat-border/60"
    >
      <div className="bg-white p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-hayat-border/40">
        <div>
          <h2 className="text-2xl font-bold text-hayat-navy mb-1 tracking-tight">{title}</h2>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-hayat-wood flex-shrink-0"></span>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{type === 'expense' ? 'Expenses Ledger' : type === 'revenue' ? 'Sales Ledger' : 'Ledger System'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {type === 'revenue' && (
            <button 
              onClick={() => setShowPieChart(!showPieChart)} 
              className={`px-4 sm:px-5 py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                showPieChart 
                  ? 'bg-emerald-800 text-white shadow-md' 
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/60'
              }`}
            >
              <PieChartIcon size={16} className={showPieChart ? 'text-emerald-200' : 'text-emerald-700'} />
              <span>{showPieChart ? 'إخفاء المخطط الدائري' : 'تحليل المبيعات (Pie Chart)'}</span>
            </button>
          )}
          {type === 'expense' && (
            <button 
              onClick={() => setShowPieChart(!showPieChart)} 
              className={`px-4 sm:px-5 py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                showPieChart 
                  ? 'bg-purple-900 text-white shadow-md' 
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200/60'
              }`}
            >
              <PieChartIcon size={16} className={showPieChart ? 'text-emerald-300' : 'text-purple-700'} />
              <span>{showPieChart ? 'إخفاء المخطط الدائري' : 'تحليل المصاريف (Pie Chart)'}</span>
            </button>
          )}
          <button 
            onClick={() => setShowAdd(!showAdd)} 
            className={showAdd ? 'btn-secondary' : 'btn-primary'}
          >
            {showAdd ? 'إلغاء العملية' : 'سجل جديد +'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showPieChart && type === 'revenue' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hayat-border/40 bg-emerald-50/20"
          >
            <div className="p-4 sm:p-6 md:p-10">
              <RevenuePieChartAnalysis 
                revenues={filteredItems} 
                settings={settings}
                title="المخطط الدائري لتوزيع المبيعات حسب نوع المنتج"
                subtitle="تحليل مرئي تفاعلي مباشر للمبيعات المصفاة حالياً حسب البحث والفلاتر"
              />
            </div>
          </motion.div>
        )}
        {showPieChart && type === 'expense' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hayat-border/40 bg-purple-50/20"
          >
            <div className="p-4 sm:p-6 md:p-10">
              <ExpensePieChartAnalysis 
                expenses={filteredItems} 
                settings={settings}
                title="المخطط الدائري لتوزيع المصاريف حسب الفئات"
                subtitle="تحليل مرئي تفاعلي مباشر للمصاريف المصفاة حالياً حسب البحث والفلاتر"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hayat-border/40 bg-hayat-accent/30"
          >
            <div className="p-10">
              <RecordForm type={type} user={user} services={services} settings={settings} existingItems={items} onComplete={() => setShowAdd(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced Filters HUD */}
      {type !== 'budget' && (
        <div className="bg-hayat-cream/40 px-10 py-6 border-b border-hayat-border/30 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          <div className="relative">
            <Search size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="ابحث بالبيان أو رقم الطلب..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full bg-white border border-hayat-border/60 outline-none px-4 pr-10 py-2.5 rounded-xl text-xs text-hayat-navy focus:border-hayat-navy transition-all" 
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">طريقة الدفع:</span>
            <select 
              value={paymentFilter} 
              onChange={e => setPaymentFilter(e.target.value)} 
              className="flex-grow bg-white border border-hayat-border/60 outline-none px-4 py-2.5 rounded-xl text-xs text-hayat-navy focus:border-hayat-navy"
            >
              <option value="all">الكل</option>
              <option value="cash">نقداً</option>
              <option value="mada">مدى</option>
              <option value="apple_pay">أبل باي</option>
              <option value="visa_master">فيزا / ماستركارد</option>
              <option value="bank_transfer">تحويل بنكي</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">من تاريخ:</span>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
              className="flex-grow bg-white border border-hayat-border/60 outline-none px-3 py-2 rounded-xl text-xs text-hayat-navy"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">إلى تاريخ:</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
              className="flex-grow bg-white border border-hayat-border/60 outline-none px-3 py-2 rounded-xl text-xs text-hayat-navy"
            />
          </div>
        </div>
      )}

      {/* Mobile Touch Cards View */}
      <div className="block md:hidden p-4 space-y-3 bg-slate-50/50">
        {filteredItems.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        }).map((item) => (
          <div 
            key={item.id} 
            className="bg-white rounded-2xl p-4 border border-indigo-100/70 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                    type === 'revenue' 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/50' 
                      : type === 'expense'
                      ? 'bg-purple-50 text-purple-900 border border-purple-200/50'
                      : 'bg-amber-50 text-amber-800 border border-amber-200/50'
                  }`}>
                    {type === 'budget' || type === 'expense' ? translateCategory(item.category) : 
                     type === 'revenue' ? translateProduct(item.productType) : item.material}
                  </span>
                  {item.paymentMethod && (
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {translatePaymentMethod(item.paymentMethod)}
                    </span>
                  )}
                </div>
                {type === 'revenue' && item.orderNumber && (
                  <p className="text-[10px] font-bold text-slate-500">رقم الطلب: #{item.orderNumber}</p>
                )}
                {(item.description || item.reason) && (
                  <p className="text-xs font-semibold text-slate-700 leading-snug">{item.description || item.reason}</p>
                )}
              </div>

              <div className="text-left font-serif flex flex-col items-end">
                <div className={`px-2.5 py-1 rounded-xl text-base font-black tabular-nums ${
                  type === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-950'
                }`}>
                  {(item.amount || item.estimatedCost || 0).toLocaleString()}
                  <span className="text-[9px] font-sans font-bold mr-1">ريال</span>
                </div>
                {settings.isTaxRegistered && item.taxAmount > 0 && (
                  <span className="text-[9px] text-slate-400 font-bold mt-0.5">شامل {item.taxAmount} ضريبة</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
              <span className="font-bold tabular-nums">
                {type === 'budget' ? item.month : safeFormat(item.date, 'yyyy / MM / dd')}
              </span>

              <div className="flex items-center gap-2">
                {type !== 'budget' && (
                  <button 
                    onClick={() => setSelectedReceipt(item)} 
                    title="سند"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 text-[10px] font-bold hover:bg-purple-100 transition-colors"
                  >
                    <Printer size={13} />
                    <span>سند</span>
                  </button>
                )}
                <button 
                  onClick={() => handleDelete(item.id)} 
                  title="حذف"
                  className="p-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <LayoutDashboard size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-xs font-bold">لا توجد بيانات مطابقة لخيارات التصفية</p>
          </div>
        )}
      </div>

      {/* Desktop Ledger Table */}
      <div className="hidden md:block p-0 overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-400 text-[10px] uppercase tracking-[0.15em] font-black">
              <th className="py-6 px-10">التاريخ</th>
              <th className="py-6 px-10">{type === 'budget' ? 'بند الميزانية' : (type === 'revenue' ? 'المنتج / الطلب' : 'البيان')}</th>
              <th className="py-6 px-10 text-left">القيمة المالية</th>
              {type !== 'budget' && <th className="py-6 px-10">التفاصيل وطريقة الدفع</th>}
              <th className="py-6 px-10 w-32">العمليات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hayat-border/30">
            {filteredItems.sort((a, b) => {
              const aTime = a.createdAt?.seconds || 0;
              const bTime = b.createdAt?.seconds || 0;
              return bTime - aTime;
            }).map((item) => (
              <tr key={item.id} className="hover:bg-hayat-accent/40 transition-colors group">
                <td className="py-6 px-10 min-w-[130px]">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                      <span className="text-[11px] text-slate-400 font-bold tabular-nums">
                        {type === 'budget' ? item.month : safeFormat(item.date, 'yyyy / MM / dd')}
                      </span>
                   </div>
                </td>
                <td className="py-6 px-10 font-bold text-hayat-navy text-sm">
                   <div className="flex flex-col">
                      <span>
                        {type === 'budget' || type === 'expense' ? translateCategory(item.category) : 
                         type === 'revenue' ? translateProduct(item.productType) : item.material}
                      </span>
                      {type === 'revenue' && item.orderNumber && (
                        <span className="text-[9px] text-slate-400 font-bold mt-0.5">رقم الطلب: #{item.orderNumber}</span>
                      )}
                   </div>
                </td>
                <td className="py-6 px-10 text-left min-w-[150px]">
                  <div className="flex flex-col items-end">
                    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-serif font-bold text-base ${type === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-hayat-navy'}`}>
                      {(item.amount || item.estimatedCost || 0).toLocaleString()}
                      <span className="text-[9px] font-sans font-black opacity-60 uppercase tracking-tighter">ريال</span>
                    </div>
                    {settings.isTaxRegistered && item.taxAmount > 0 && (
                      <span className="text-[9px] text-slate-400 font-bold mt-1">مشمل الضريبة ({item.taxAmount} ريال)</span>
                    )}
                  </div>
                </td>
                {type !== 'budget' && (
                  <td className="py-6 px-10 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.paymentMethod && (
                        <span className="bg-stone-100 text-[10px] text-stone-600 font-semibold px-2.5 py-1 rounded-full border border-stone-200/50">
                          {translatePaymentMethod(item.paymentMethod)}
                        </span>
                      )}
                      <span className="text-slate-400 text-[11px] font-medium truncate max-w-[180px]">
                        {item.description || item.reason || 'سجل تشغيلي عام'}
                      </span>
                    </div>
                  </td>
                )}
                <td className="py-6 px-10 text-left min-w-[120px]">
                   <div className="flex items-center justify-end gap-1.5">
                     {type !== 'budget' && (
                        <button 
                         onClick={() => setSelectedReceipt(item)} 
                         title="عرض وطباعة سند"
                         className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-hayat-wood hover:bg-hayat-accent transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Printer size={15} />
                        </button>
                     )}
                     <button 
                      onClick={() => handleDelete(item.id)} 
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                     >
                       <Trash2 size={15} />
                     </button>
                   </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={type === 'budget' ? 4 : 5} className="py-20 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-hayat-accent rounded-full flex items-center justify-center text-slate-300 mb-4">
                      <LayoutDashboard size={32} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">لا توجد بيانات مطابقة لخيارات التصفية</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-hayat-accent/20 p-8 border-t border-hayat-border/40 flex justify-end">
          <div className="flex items-center gap-10">
             <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">عدد العناصر الفلترة</p>
                <p className="text-xl font-bold text-hayat-navy">{filteredItems.length}</p>
             </div>
             <div className="w-px h-10 bg-hayat-border/40"></div>
             <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">القيمة الإجمالية المصفاة</p>
                <div className="flex items-baseline gap-2">
                   <p className="text-2xl font-serif font-black text-hayat-navy">
                     {filteredItems.reduce((acc, curr) => acc + (curr.amount || curr.estimatedCost || 0), 0).toLocaleString()}
                   </p>
                   <span className="text-[10px] font-bold text-slate-400">ريال</span>
                </div>
             </div>
          </div>
      </div>

      <AnimatePresence>
        {selectedReceipt && (
          <ReceiptVoucherModal 
            item={selectedReceipt} 
            type={type} 
            settings={settings} 
            onClose={() => setSelectedReceipt(null)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RecordForm({ type, user, services, settings, existingItems = [], onComplete }: { type: any, user: User, services: any, settings: any, existingItems?: any[], onComplete: () => void }) {
  const [formData, setFormData] = useState<any>({
    category: 'materials',
    customCategory: '',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    month: format(new Date(), 'yyyy-MM'),
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
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);
  const lastSubmitTimeRef = useRef<number>(0);

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
      alert('يرجى كتابة اسم الفئة / التصنيف المخصص للمصروف');
      return;
    }

    if (type === 'revenue' && formData.productType === 'custom' && !formData.customProductType?.trim()) {
      alert('يرجى كتابة نوع أو طبيعة المنتج المخصصة');
      return;
    }

    const now = Date.now();
    // Anti-rapid click lock (within 2 seconds)
    if (lastSubmitTimeRef.current && (now - lastSubmitTimeRef.current < 2000)) {
      return;
    }
    lastSubmitTimeRef.current = now;

    // 1. Validate duplicates before posting
    let duplicateFound: any = null;

    if (type === 'expense') {
      const enteredDate = formData.date;
      const enteredAmount = Number(formData.amount);
      const enteredCat = effectiveCategory;
      const enteredDesc = (formData.description || '').trim().toLowerCase();

      duplicateFound = existingItems.find((item: any) => {
        const itemDate = (item.date || '').split('T')[0];
        const itemAmount = Number(item.amount);
        const itemCat = item.category;
        const itemDesc = (item.description || '').trim().toLowerCase();

        const sameDate = itemDate === enteredDate;
        const sameAmount = Math.abs(itemAmount - enteredAmount) < 0.01;
        const sameCategory = itemCat === enteredCat;
        const sameDesc = (enteredDesc && itemDesc) ? (itemDesc === enteredDesc) : true;

        return sameDate && sameAmount && sameCategory && sameDesc;
      });
    } else if (type === 'revenue') {
      const enteredDate = formData.date;
      const enteredAmount = Number(formData.amount);
      const enteredProduct = effectiveProductType;
      const enteredOrder = (formData.orderNumber || '').trim().toLowerCase();
      const enteredDesc = (formData.description || '').trim().toLowerCase();

      duplicateFound = existingItems.find((item: any) => {
        const itemDate = (item.date || '').split('T')[0];
        const itemAmount = Number(item.amount);
        const itemProduct = item.productType;
        const itemOrder = (item.orderNumber || '').trim().toLowerCase();
        const itemDesc = (item.description || '').trim().toLowerCase();

        // If exact same order number is supplied and matches
        if (enteredOrder && itemOrder && enteredOrder === itemOrder) {
          return true;
        }

        const sameDate = itemDate === enteredDate;
        const sameAmount = Math.abs(itemAmount - enteredAmount) < 0.01;
        const sameProduct = itemProduct === enteredProduct;
        const sameDesc = (enteredDesc && itemDesc) ? (itemDesc === enteredDesc) : true;

        return sameDate && sameAmount && sameProduct && sameDesc;
      });
    } else if (type === 'budget') {
      const enteredMonth = formData.month;
      const enteredCat = effectiveCategory;
      duplicateFound = existingItems.find((item: any) => item.month === enteredMonth && item.category === enteredCat);
    } else if (type === 'waste') {
      const enteredDate = formData.date;
      const enteredMat = (formData.material || '').trim().toLowerCase();
      const enteredCost = Number(formData.estimatedCost);

      duplicateFound = existingItems.find((item: any) => {
        const itemDate = (item.date || '').split('T')[0];
        const itemMat = (item.material || '').trim().toLowerCase();
        const itemCost = Number(item.estimatedCost);
        return itemDate === enteredDate && itemMat === enteredMat && Math.abs(itemCost - enteredCost) < 0.01;
      });
    }

    // IF DUPLICATE IS FOUND: ABORT AND WARN USER, DO NOT POST (لا ترحله)
    if (duplicateFound) {
      setDuplicateWarning({
        type,
        duplicateItem: duplicateFound,
        newItem: { ...formData, category: effectiveCategory, productType: effectiveProductType }
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const collectionName = `${type}s`;
      const payload: any = {
        userId: user.uid,
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
        const id = `local-${type}-${Date.now()}-${Math.random()}`;
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
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
      alert('خطأ في الحفظ، يرجى مراجعة الصلاحيات');
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-end">
        {type === 'budget' && (
          <>
            <FormGroup label="فترة الميزانية" child={<input type="month" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} className="form-input" required />} />
            <FormGroup label="تصنيف البند" child={
              <div className="space-y-2">
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input">
                  <option value="materials">خامات أولية</option>
                  <option value="marketing">حملات تسويقية</option>
                  <option value="maintenance">صيانة وتشغيل</option>
                  <option value="wages">أجور وتكليفات</option>
                  <option value="other">مصاريف عامة</option>
                  <option value="custom">✏️ كتابة تصنيف مخصص...</option>
                </select>
                {formData.category === 'custom' && (
                  <input 
                    type="text" 
                    placeholder="اكتب اسم البند المخصص..." 
                    value={formData.customCategory} 
                    onChange={e => setFormData({...formData, customCategory: e.target.value})} 
                    className="form-input text-xs border-amber-400 focus:border-amber-500 bg-amber-50/40"
                    required
                    autoFocus
                  />
                )}
              </div>
            } />
            <FormGroup label="الميزانية المقررة" child={
              <div className="relative">
                <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input pl-12" required />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">SAR</span>
              </div>
            } />
          </>
        )}

        {type === 'expense' && (
          <>
            <FormGroup label="تاريخ الصرف" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
            <FormGroup label="فئة المصروف" child={
              <div className="space-y-2">
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input">
                  <option value="materials">خامات أولية</option>
                  <option value="marketing">حملات تسويقية</option>
                  <option value="maintenance">صيانة وتشغيل</option>
                  <option value="wages">أجور وتكليفات</option>
                  <option value="other">مصاريف عامة</option>
                  <option value="custom">✏️ كتابة نوع/فئة مخصصة...</option>
                </select>
                {formData.category === 'custom' && (
                  <input 
                    type="text" 
                    placeholder="اكتب اسم الفئة أو نوع المصروف..." 
                    value={formData.customCategory} 
                    onChange={e => setFormData({...formData, customCategory: e.target.value})} 
                    className="form-input text-xs border-amber-400 focus:border-amber-500 bg-amber-50/40"
                    required
                    autoFocus
                  />
                )}
              </div>
            } />
            <FormGroup label="القيمة الإجمالية" child={
               <div className="relative">
                  <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input pl-12" required />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">SAR</span>
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
              <div className="space-y-2">
                <select value={formData.productType} onChange={e => setFormData({...formData, productType: e.target.value})} className="form-input">
                  <option value="acrylic">منتجات أكريليك</option>
                  <option value="wood">منتجات خشبية</option>
                  <option value="svg">ملفات رقمية (SVG)</option>
                  <option value="other">منتجات أخرى</option>
                  <option value="custom">✏️ كتابة نوع منتج مخصص...</option>
                </select>
                {formData.productType === 'custom' && (
                  <input 
                    type="text" 
                    placeholder="اكتب نوع أو صنف المنتج هنا..." 
                    value={formData.customProductType} 
                    onChange={e => setFormData({...formData, customProductType: e.target.value})} 
                    className="form-input text-xs border-amber-400 focus:border-amber-500 bg-amber-50/40"
                    required
                    autoFocus
                  />
                )}
              </div>
            } />
            <FormGroup label="قيمة المبيعات" child={
              <div className="relative">
                 <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input pl-12" required />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">SAR</span>
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
            <FormGroup label="رقم المرجعي / الطلب" child={<input type="text" placeholder="Exp: 50442" value={formData.orderNumber} onChange={e => setFormData({...formData, orderNumber: e.target.value})} className="form-input" />} />
          </>
        )}

        {type === 'waste' && (
          <>
            <FormGroup label="تاريخ الرصد" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
            <FormGroup label="المادة التالفة" child={<input type="text" placeholder="نوع الخامة" value={formData.material} onChange={e => setFormData({...formData, material: e.target.value})} className="form-input" required />} />
            <FormGroup label="التكلفة التقديرية" child={
              <div className="relative">
                <input type="number" value={formData.estimatedCost} onChange={e => setFormData({...formData, estimatedCost: e.target.value})} className="form-input pl-12" required />
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">SAR</span>
              </div>
            } />
            <FormGroup label="سبب الهدر" child={<input type="text" placeholder="توضيح السبب" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="form-input" />} />
          </>
        )}

        <button 
          type="submit" 
          disabled={isSubmitting} 
          className="btn-primary h-[52px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <span>جارِ الحفظ...</span>
          ) : (
            <span>اعتماد البيانات</span>
          )}
        </button>
      </form>

      {/* Duplicate Warning Modal */}
      <AnimatePresence>
        {duplicateWarning && (
          <DuplicateAlertModal 
            warning={duplicateWarning} 
            onClose={() => setDuplicateWarning(null)} 
            onCancelRecord={() => {
              setDuplicateWarning(null);
              onComplete();
            }} 
          />
        )}
      </AnimatePresence>
    </>
  );
}

function DuplicateAlertModal({ 
  warning, 
  onClose, 
  onCancelRecord 
}: { 
  warning: { type: string; duplicateItem: any; newItem: any }; 
  onClose: () => void; 
  onCancelRecord: () => void; 
}) {
  const { type, duplicateItem } = warning;

  const typeName = type === 'expense' 
    ? 'مصروف' 
    : type === 'revenue' 
    ? 'مبيع / إيراد' 
    : type === 'budget' 
    ? 'بند ميزانية' 
    : 'عنصر هدر';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-[2.25rem] shadow-2xl border border-rose-100 max-w-lg w-full overflow-hidden text-right"
        dir="rtl"
      >
        {/* Warning Banner Header */}
        <div className="bg-rose-50/90 border-b border-rose-100 p-6 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-600/20">
            <ShieldAlert size={26} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                حماية القيود المالية
              </span>
              <span className="text-rose-600 font-bold text-xs">⚠️ تم إيقاف الترحيل</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-1 font-serif">
              تم رصد {typeName} مكرر بنفس التفاصيل!
            </h3>
            <p className="text-xs text-rose-700 font-medium mt-1 leading-relaxed">
              لم يتم ترحيل أو حفظ هذا السجل لتفادي ازدواجية وتكرار المعاملات المالية بالخطأ.
            </p>
          </div>
        </div>

        {/* Comparison Details */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
              <span className="text-[11px] font-bold text-slate-400">تفاصيل المعاملة السابقة المسجلة بالنظام:</span>
              <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">سجل مطابق مسجل مسبقاً</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">القيمة المالية:</span>
                <span className="font-serif font-black text-slate-900 text-sm">
                  {(duplicateItem.amount || duplicateItem.estimatedCost || 0).toLocaleString()} ريال
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">تاريخ السجل:</span>
                <span className="font-bold text-slate-700 font-sans">
                  {type === 'budget' ? duplicateItem.month : safeFormat(duplicateItem.date, 'yyyy / MM / dd')}
                </span>
              </div>

              {type === 'expense' && (
                <>
                  <div>
                    <span className="text-slate-400 block text-[10px]">فئة المصروف:</span>
                    <span className="font-bold text-slate-800">{translateCategory(duplicateItem.category)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">البيان / الوصف:</span>
                    <span className="font-bold text-slate-800 truncate block">{duplicateItem.description || 'بدون بيان'}</span>
                  </div>
                </>
              )}

              {type === 'revenue' && (
                <>
                  <div>
                    <span className="text-slate-400 block text-[10px]">نوع المنتج:</span>
                    <span className="font-bold text-slate-800">{translateProduct(duplicateItem.productType)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">رقم الطلب / المرجع:</span>
                    <span className="font-bold text-slate-800">{duplicateItem.orderNumber ? `#${duplicateItem.orderNumber}` : 'غير محدد'}</span>
                  </div>
                </>
              )}

              {type === 'waste' && (
                <>
                  <div>
                    <span className="text-slate-400 block text-[10px]">المادة التالفة:</span>
                    <span className="font-bold text-slate-800">{duplicateItem.material}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">السبب:</span>
                    <span className="font-bold text-slate-800 truncate block">{duplicateItem.reason || 'غير محدد'}</span>
                  </div>
                </>
              )}

              {type === 'budget' && (
                <div>
                  <span className="text-slate-400 block text-[10px]">بند الميزانية:</span>
                  <span className="font-bold text-slate-800">{translateCategory(duplicateItem.category)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Practical Advice Banner */}
          <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3.5 flex items-start gap-2.5 text-[11px] text-amber-900">
            <AlertCircle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>تنبيه للمستخدم:</strong> إذا كانت هذه عملية حقيقية منفصلة حدثت بنفس اليوم بنفس القيمة، يرجى كتابة بيان توضيحي مميز أو إدخال رقم طلب/مرجع فريد لإتمام ترحيلها بنجاح.
            </p>
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancelRecord}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-all"
          >
            إلغاء العملية تماماً
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary py-2.5 px-6 text-xs font-bold"
          >
            تعديل بيانات القيد
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function FormGroup({ label, child }: any) {
  return (
    <div className="flex flex-col gap-3 group">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-focus-within:text-hayat-wood transition-colors">{label}</label>
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
      <div className="bg-white p-10 border-b border-hayat-border/40">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="text-hayat-navy w-8 h-8" />
          <h2 className="text-2xl font-bold text-hayat-navy tracking-tight">إعدادات النظام والمتجر</h2>
        </div>
        <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">تنظيم وتعديل معدلات الضريبة والعملة ومطبوعات الفواتير الموحدة</p>
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-500">اسم المتجر / العلامة التجارية</label>
            <input 
              type="text" 
              value={formData.storeName} 
              onChange={e => setFormData({ ...formData, storeName: e.target.value })} 
              className="w-full bg-white border border-hayat-border/60 outline-none px-4 py-3 rounded-2xl text-sm text-hayat-navy focus:border-hayat-navy transition-all" 
              required 
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-500">العملة الأساسية</label>
            <input 
              type="text" 
              value={formData.currency} 
              onChange={e => setFormData({ ...formData, currency: e.target.value })} 
              className="w-full bg-white border border-hayat-border/60 outline-none px-4 py-3 rounded-2xl text-sm text-hayat-navy focus:border-hayat-navy transition-all" 
              required 
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-500">رقم التواصل للإسناد على الفواتير</label>
            <input 
              type="text" 
              placeholder="مثال: 9665xxxxxxxx" 
              value={formData.contactPhone} 
              onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} 
              className="w-full bg-white border border-hayat-border/60 outline-none px-4 py-3 rounded-2xl text-sm text-hayat-navy focus:border-hayat-navy transition-all" 
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-500">العنوان الجغرافي للمتجر</label>
            <input 
              type="text" 
              value={formData.address} 
              onChange={e => setFormData({ ...formData, address: e.target.value })} 
              className="w-full bg-white border border-hayat-border/60 outline-none px-4 py-3 rounded-2xl text-sm text-hayat-navy focus:border-hayat-navy transition-all" 
            />
          </div>
        </div>

        <div className="border-t border-hayat-border/40 pt-8 space-y-6">
          <h3 className="text-sm font-bold text-hayat-navy mb-4">تنظيم وضريبة القيمة المضافة (VAT)</h3>
          
          <div className="bg-hayat-accent/20 p-6 rounded-2xl flex flex-col md:flex-row gap-6 md:items-center justify-between">
            <div>
              <p className="text-sm font-bold text-hayat-navy">التسجيل الضريبي للمتجر</p>
              <p className="text-xs text-slate-400 mt-1">تفعيل أو تعطيل حسابات ضريبة القيمة المضافة في جميع السجلات والتقارير المالية.</p>
            </div>
            
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={formData.isTaxRegistered} 
                onChange={e => setFormData({ ...formData, isTaxRegistered: e.target.checked })} 
                className="sr-only peer" 
              />
              <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-hayat-wood"></div>
              <span className="mr-3 text-xs font-bold text-slate-600 select-none">
                {formData.isTaxRegistered ? "خاضع للضريبة (نشط)" : "غير خاضع للضريبة (موقوف)"}
              </span>
            </label>
          </div>

          <AnimatePresence>
            {formData.isTaxRegistered && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 overflow-hidden"
              >
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-500">الرقم الضريبي الموحد (TIN)</label>
                  <input 
                    type="text" 
                    placeholder="رقم التسجيل الضريبي المكون من 15 خانة" 
                    value={formData.taxNumber} 
                    onChange={e => setFormData({ ...formData, taxNumber: e.target.value })} 
                    className="w-full bg-white border border-hayat-border/60 outline-none px-4 py-3 rounded-2xl text-sm font-mono text-hayat-navy focus:border-hayat-navy transition-all" 
                    required={formData.isTaxRegistered}
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-500">نسبة ضريبة القيمة المضافة (%)</label>
                  <input 
                    type="number" 
                    placeholder="مثال: 15" 
                    value={formData.taxRate} 
                    onChange={e => setFormData({ ...formData, taxRate: Number(e.target.value) })} 
                    className="w-full bg-white border border-hayat-border/60 outline-none px-4 py-3 rounded-2xl text-sm font-mono text-hayat-navy focus:border-hayat-navy transition-all" 
                    required={formData.isTaxRegistered}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {savedMsg && (
          <div className="text-center text-xs font-bold text-emerald-600 bg-emerald-50 py-3 rounded-xl">
            تم حفظ إعدادات المتجر بنجاح ومطابقتها بالتسلسل المالي!
          </div>
        )}

        <button type="submit" className="btn-primary w-full h-[54px] font-bold">
          حفظ التغييرات وتطبيقها
        </button>
      </form>
    </motion.div>
  );
}

function ReceiptVoucherModal({ item, type, settings, onClose }: { item: any, type: string, settings: any, onClose: () => void }) {
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
  
  // Calculate tax components
  const beforeTaxAmount = settings.isTaxRegistered 
    ? amount / (1 + taxRate / 100) 
    : amount;
  const taxAmount = amount - beforeTaxAmount;

  const handlePrint = () => {
    window.print();
  };

  const handleExportImage = async () => {
    const voucherElement = document.getElementById('printable-voucher');
    if (!voucherElement) return;

    try {
      setIsExportingImage(true);
      const canvas = await html2canvas(voucherElement, {
        scale: 3, // High-DPI crisp quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
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
      alert('حدث خطأ أثناء تصدير السند كصورة، يرجى المحاولة مرة أخرى.');
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
        {/* Modal Actions Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-hayat-border/40 flex justify-between items-center text-hayat-navy">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-hayat-wood animate-pulse"></span>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">سند ومعاملة معتمدة</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Voucher Bill Body */}
        <div id="printable-voucher" className="p-6 md:p-10 space-y-6 md:space-y-8 print:p-8 bg-white">
          {/* Business Header */}
          <div className="text-center space-y-2 border-b border-hayat-border/60 pb-6 font-sans">
            <h3 className="font-serif text-xl md:text-2xl text-hayat-navy font-bold leading-tight">{settings.storeName}</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.22em] font-bold">سند ومعاملة مالية موثقة</p>
            {settings.address && <p className="text-xs text-slate-500 font-bold">{settings.address}</p>}
            {settings.contactPhone && <p className="text-xs text-slate-500 font-mono font-bold leading-none">{settings.contactPhone}</p>}
          </div>

          {/* Voucher Title Hud */}
          <div className="bg-hayat-accent/20 rounded-2xl p-4 text-center border border-hayat-border/20 font-sans">
            <h4 className="text-base font-black text-hayat-navy uppercase tracking-widest">{voucherTitle}</h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1 font-mono">رقم السند: #{displayId}</p>
          </div>

          {/* Transaction Metadata */}
          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs border-b border-hayat-border/40 pb-6 text-right" dir="rtl">
            <div>
              <p className="text-[10px] font-black text-slate-400 mb-1">تاريخ المعاملة</p>
              <p className="font-bold text-hayat-navy tabular-nums">{item.date ? safeFormat(item.date, 'yyyy / MM / dd') : 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 mb-1">نوع العملية</p>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isRevenue ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                <p className="font-bold text-hayat-navy">
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
                <p className="text-[10px] font-black text-slate-400 mb-1">طريقة الدفع ومصادقتها</p>
                <p className="font-bold text-hayat-navy">{translatePaymentMethod(item.paymentMethod)}</p>
              </div>
            )}
            {isRevenue && item.orderNumber && (
              <div>
                <p className="text-[10px] font-black text-slate-400 mb-1">الرقم المرجعي للطلب</p>
                <p className="font-bold text-hayat-navy font-mono">#{item.orderNumber}</p>
              </div>
            )}
          </div>

          {/* Financial Receipt Grid */}
          <div className="space-y-3" dir="rtl">
            {settings.isTaxRegistered ? (
              <>
                <div className="flex justify-between items-center text-xs text-slate-500 font-bold font-sans">
                  <span>القيمة الخاضعة للضريبة</span>
                  <span className="font-bold tabular-nums">{beforeTaxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500 border-b border-dashed border-hayat-border/40 pb-3 font-bold font-sans">
                  <span>ضريبة القيمة المضافة ({taxRate}%)</span>
                  <span className="font-bold tabular-nums">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</span>
                </div>
              </>
            ) : null}

            <div className={`flex justify-between items-center ${settings.isTaxRegistered ? 'pt-3' : 'border-b border-dashed border-hayat-border/40 pb-3'}`}>
              <span className="text-sm font-bold text-hayat-navy">المجموع الإجمالي النهائي</span>
              <span className="font-serif font-black text-lg md:text-xl text-hayat-navy tabular-nums font-sans">
                {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>

          {/* Business and Tax Details */}
          {settings.isTaxRegistered && (
            <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl text-center space-y-1 font-sans">
              <p className="text-[9px] font-bold text-slate-600">الرقم الضريبي للمنشأة: <span className="font-mono tabular-nums text-slate-900">{settings.taxNumber}</span></p>
              <p className="text-[9px] text-slate-400">فاتورة ضريبية مبسطة صادرة طبقا لتعليمات هيئة الزكاة والضريبة والجمارك</p>
            </div>
          )}

          {/* Descriptions/Notes */}
          {item.description && (
            <div className="border-t border-hayat-border/30 pt-4 text-right" dir="rtl">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">تفاصيل وموجز المعاملة</p>
              <p className="text-xs text-slate-600 bg-stone-50 p-3 rounded-xl border border-stone-200/30 leading-relaxed font-semibold">
                {item.description}
              </p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-4 text-center pt-8 border-t border-dashed border-hayat-border/40">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">التوقيع والاعتماد</p>
              <div className="w-24 h-px bg-slate-300 mx-auto"></div>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">الختم والمصادقة</p>
              <div className="w-24 h-px bg-slate-300 mx-auto"></div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="bg-slate-50 px-6 py-4.5 md:px-10 md:py-6 border-t border-hayat-border/40 flex flex-wrap justify-between sm:justify-end items-center gap-2.5 sm:gap-3" data-html2canvas-ignore="true">
          <button 
            onClick={onClose}
            className="px-4 sm:px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 font-bold transition-all hover:bg-slate-50 cursor-pointer"
          >
            إغلاق النافذة
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportImage}
              disabled={isExportingImage}
              className="px-4 sm:px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isExportingImage ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>جارِ تجهيز الصورة...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>تصدير كصورة</span>
                </>
              )}
            </button>
            <button 
              onClick={handlePrint}
              className="px-4 sm:px-5 py-2.5 bg-hayat-navy hover:bg-hayat-navy/95 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <Printer size={14} />
              <span>طباعة السند</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

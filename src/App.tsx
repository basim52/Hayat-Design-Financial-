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
  Menu
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
  ProductType 
} from './types';

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
  const [services, setServices] = useState<{ db: any, auth: any }>({ db: initialDb, auth: initialAuth });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'revenues' | 'budget' | 'waste' | 'reports' | 'settings'>('dashboard');
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
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Init Firebase
  useEffect(() => {
    async function setup() {
      const { db: newDb, auth: newAuth } = await initFirebase();
      setServices({ db: newDb, auth: newAuth });
      
      if (newAuth) {
        onAuthStateChanged(newAuth, (u) => {
          setUser(u);
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
    if (!user || !services.db) return;

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

    return () => {
      unsubBudgets();
      unsubExpenses();
      unsubRevenues();
      unsubWaste();
    };
  }, [user, services.db]);

  const handleSeedData = async () => {
    if (!user || !services.db) return;
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

      for (const r of sampleRevenues) await addDoc(collection(services.db, 'revenues'), { ...r, userId: user.uid, createdAt: serverTimestamp() });
      for (const e of sampleExpenses) await addDoc(collection(services.db, 'expenses'), { ...e, userId: user.uid, createdAt: serverTimestamp() });
      for (const b of sampleBudgets) await addDoc(collection(services.db, 'budgets'), { ...b, userId: user.uid, createdAt: serverTimestamp() });

      alert('تمت استعادة البيانات بنجاح');
    } catch (err) {
      console.error(err);
      alert('فشل في إضافة البيانات');
    }
  };

  const handleLogin = () => services.auth && signInWithPopup(services.auth, new GoogleAuthProvider());
  const handleLogout = () => {
    if (window.confirm('هل تريد تسجيل الخروج؟')) {
       services.auth && signOut(services.auth);
    }
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
          className="max-w-md w-full bg-white p-12 md:p-16 rounded-[3rem] shadow-hayat-lg border border-hayat-border/40 relative z-10"
        >
          <div className="flex flex-col items-center mb-10">
            <motion.div
              initial={{ rotate: -10, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Logo className="w-24 h-24 mb-6 drop-shadow-sm" />
            </motion.div>
            <h1 className="font-serif text-5xl text-hayat-navy mb-3 tracking-tight">حياة ديزاين</h1>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Operational Dashboard</p>
          </div>
          
          <div className="space-y-6">
            <p className="text-slate-500 text-sm leading-relaxed text-center px-4">
              نظام الإدارة المالية الذكي لتتبع التدفقات النقدية، الميزانية، وتحليل كفاءة الإنتاج.
            </p>
            
            <button 
              onClick={handleLogin}
              className="w-full bg-hayat-navy text-white py-5 rounded-[1.25rem] flex items-center justify-center gap-4 hover:bg-slate-800 transition-all font-bold text-xs uppercase tracking-widest shadow-hayat active:scale-[0.98]"
            >
              <div className="bg-white/10 p-1.5 rounded-lg">
                <UserIcon size={18} />
              </div>
              الدخول لـ لوحة التحكم
            </button>
            
            <div className="pt-8 border-t border-hayat-border/40 flex flex-col items-center">
               <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mb-4">Enterprise Edition 2024</p>
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
      <header className="md:hidden bg-white/80 backdrop-blur-md border-b border-hayat-border/40 sticky top-0 px-6 py-4.5 flex justify-between items-center z-40 select-none">
        <div className="flex items-center gap-2.5">
          <Logo className="w-8 h-8" />
          <div>
            <h1 className="font-serif text-[17px] text-hayat-navy font-bold leading-none">{settings.storeName}</h1>
            <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider mt-1">Financial Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="text-left font-sans">
            <p className="text-xs font-bold text-hayat-navy leading-none">{user.displayName?.split(' ')[0]}</p>
          </div>
          <img src={user.photoURL || ''} className="w-8 h-8 rounded-xl border border-hayat-border/60 shadow-sm object-cover" alt="User" />
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
          // 1. Robust oklch/oklab stripping from ALL stylesheets
          clonedDoc.querySelectorAll('style').forEach(styleTag => {
            if (styleTag.innerHTML.includes('oklch') || styleTag.innerHTML.includes('oklab')) {
              styleTag.innerHTML = styleTag.innerHTML.replace(/(oklch|oklab)\([^)]+\)/g, '#000000');
            }
          });

          // 2. Comprehensive element-level override
          clonedDoc.querySelectorAll('*').forEach((el: any) => {
            if (el.style) {
              // Strip from inline style text
              if (el.style.cssText && (el.style.cssText.includes('oklch') || el.style.cssText.includes('oklab'))) {
                el.style.cssText = el.style.cssText.replace(/(oklch|oklab)\([^)]+\)/g, '#000000');
              }
              
              // Override computed styles that html2canvas might still "see"
              const computed = window.getComputedStyle(el);
              if (computed.color.includes('oklch') || computed.color.includes('oklab')) el.style.color = '#0F172A';
              if (computed.backgroundColor.includes('oklch') || computed.backgroundColor.includes('oklab')) {
                el.style.backgroundColor = el.classList.contains('card-hayat') ? '#FFFFFF' : 'transparent';
              }
              if (computed.borderColor.includes('oklch') || computed.borderColor.includes('oklab')) el.style.borderColor = '#E2E8F0';
              if (computed.fill?.includes('oklch') || computed.fill?.includes('oklab')) el.style.fill = '#888888';
              if (computed.stroke?.includes('oklch') || computed.stroke?.includes('oklab')) el.style.stroke = '#888888';
            }
          });

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
          // 1. Robust oklch/oklab stripping from ALL stylesheets
          clonedDoc.querySelectorAll('style').forEach(styleTag => {
            if (styleTag.innerHTML.includes('oklch') || styleTag.innerHTML.includes('oklab')) {
              styleTag.innerHTML = styleTag.innerHTML.replace(/(oklch|oklab)\([^)]+\)/g, '#000000');
            }
          });

          // 2. Comprehensive element-level override
          clonedDoc.querySelectorAll('*').forEach((el: any) => {
            if (el.style) {
              if (el.style.cssText && (el.style.cssText.includes('oklch') || el.style.cssText.includes('oklab'))) {
                el.style.cssText = el.style.cssText.replace(/(oklch|oklab)\([^)]+\)/g, '#000000');
              }
              const computed = window.getComputedStyle(el);
              if (computed.color.includes('oklch') || computed.color.includes('oklab')) el.style.color = '#0F172A';
              if (computed.backgroundColor.includes('oklch') || computed.backgroundColor.includes('oklab')) {
                el.style.backgroundColor = el.classList.contains('card-hayat') ? '#FFFFFF' : 'transparent';
              }
              if (computed.borderColor.includes('oklch') || computed.borderColor.includes('oklab')) el.style.borderColor = '#E2E8F0';
              if (computed.fill?.includes('oklch') || computed.fill?.includes('oklab')) el.style.fill = '#888888';
              if (computed.stroke?.includes('oklch') || computed.stroke?.includes('oklab')) el.style.stroke = '#888888';
            }
          });

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
        <StatCard label="إجمالي المبيعات" value={totalRevenue} delay={0.1} />
        <StatCard label="المصاريف الفعلية" value={totalExpense} delay={0.2} />
        <StatCard label="صافي الربح" value={netProfit} delay={0.3} highlight />
        <StatCard label="قيمة الهدر" value={totalWaste} delay={0.4} color="#A16207" />
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
  const navyColor = "#0F172A";
  const woodColor = "#A16207";
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`p-8 rounded-3xl transition-all border shadow-hayat relative overflow-hidden group`}
      style={{ 
        backgroundColor: '#FFFFFF',
        borderColor: highlight ? woodColor : '#E2E8F0',
        borderWidth: highlight ? '2px' : '1px'
      }}
    >
      {highlight && (
         <div className="absolute top-0 right-0 w-24 h-24 bg-hayat-wood/5 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-125"></div>
      )}
      <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-slate-400">{label}</p>
      <div className="flex items-baseline gap-2">
         <p className="text-3xl font-bold tracking-tight" style={{ color: color || navyColor }}>{value.toLocaleString()}</p>
         <span className="text-[10px] font-bold text-slate-400">ريال</span>
      </div>
      <div className="mt-6 flex items-center gap-2">
         <div className="h-1 flex-1 bg-slate-50 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '65%' }}
              className="h-full bg-hayat-wood/20 rounded-full"
            />
         </div>
         <span className="text-[9px] font-bold text-slate-300">Target</span>
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

  const navyColor = "#0F172A";
  const woodColor = "#A16207";

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
               <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#F1F5F9' }}></div> 
                  تقديري
               </div>
               <div className="flex items-center gap-2 text-[10px] font-black text-hayat-wood uppercase tracking-widest">
                  <div className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: woodColor }}></div> 
                  فعلي
               </div>
            </div>
          </div>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActual} barGap={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                  cursor={{ fill: '#F9F7F5' }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e2e8f0', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
                    padding: '12px'
                  }}
                />
                <Bar name="التقديري" dataKey="target" fill="#f1f5f9" radius={[6, 6, 0, 0]} barSize={34} isAnimationActive={false} />
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
                    <span className="text-[11px] font-bold" style={{ color: '#475569' }}>{item.name}</span>
                    <span className="text-[10px] font-black" style={{ color: isOver ? '#EF4444' : '#94A3B8' }}>
                      {Math.round(percentage)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
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
          
          <div className="mt-10 pt-10 border-t border-hayat-border/60">
            <h4 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400">Cash Flow Trend</h4>
            <div className="h-32">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={generateCashFlowTrend(revenues, expenses)}>
                    <defs>
                      <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={woodColor} stopOpacity={0.15}/>
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
              <div key={r.id} className="flex justify-between items-center p-4 rounded-2xl hover:bg-hayat-accent transition-all group border border-transparent hover:border-hayat-border/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: '#ECFDF5', color: '#10B981' }}>
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#334155' }}>{translateProduct(r.productType)}</p>
                    <p className="text-[10px] font-bold" style={{ color: '#94A3B8' }}>{safeFormat(r.date, 'dd MMMM')}</p>
                  </div>
                </div>
                <div className="text-left font-serif">
                  <p className="text-lg font-bold" style={{ color: '#047857' }}>{r.amount.toLocaleString()} <span className="text-[10px] font-sans">ريال</span></p>
                  <p className="text-[9px] font-bold uppercase tracking-tighter" style={{ color: '#94A3B8' }}>Reference: #{r.orderNumber || '----'}</p>
                </div>
              </div>
            )) : (
              <p className="text-center py-12 text-sm italic" style={{ color: '#94A3B8' }}>لا توجد مبيعات مسجلة</p>
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
              <div key={e.id} className="flex justify-between items-center p-4 rounded-2xl hover:bg-hayat-accent transition-all group border border-transparent hover:border-hayat-border/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: '#FFF1F2', color: '#F43F5E' }}>
                    <Receipt size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#334155' }}>{translateCategory(e.category)}</p>
                    <p className="text-[10px] font-bold" style={{ color: '#94A3B8' }}>{safeFormat(e.date, 'dd MMMM')}</p>
                  </div>
                </div>
                <div className="text-left font-serif">
                  <p className="text-lg font-bold" style={{ color: '#BE123C' }}>{e.amount.toLocaleString()} <span className="text-[10px] font-sans">ريال</span></p>
                  <p className="text-[9px] font-bold uppercase tracking-tighter truncate max-w-[120px]" style={{ color: '#94A3B8' }}>{e.description || 'General Operation'}</p>
                </div>
              </div>
            )) : (
              <p className="text-center py-12 text-sm italic" style={{ color: '#94A3B8' }}>لا توجد مصاريف مسجلة</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// --- List Sections ---

// --- Reports Section ---

function ReportsView({ expenses, revenues, budgets, waste = [], setActiveTab, settings }: { expenses: Expense[], revenues: Revenue[], budgets: BudgetTarget[], waste?: WasteItem[], setActiveTab: (tab: any) => void, settings: any }) {
  const [viewMode, setViewMode] = useState<'pl' | 'chart' | 'table'>('pl');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const reportsRef = useRef<HTMLDivElement>(null);

  const navyColor = '#0A1E31';
  const woodColor = '#A16207';

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

  // Profit & Loss calculation based on the custom date range
  const plData = React.useMemo(() => {
    const filteredRevenues = revenues.filter(r => {
      if (!r.date) return false;
      const dStr = r.date.split('T')[0];
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });

    const filteredExpenses = expenses.filter(e => {
      if (!e.date) return false;
      const dStr = e.date.split('T')[0];
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });

    const filteredWaste = waste.filter(w => {
      if (!w.date) return false;
      const dStr = w.date.split('T')[0];
      if (dateFrom && dStr < dateFrom) return false;
      if (dateTo && dStr > dateTo) return false;
      return true;
    });

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
  }, [revenues, expenses, waste, dateFrom, dateTo]);

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
           // 1. Robust oklch/oklab stripping from ALL stylesheets
           clonedDoc.querySelectorAll('style').forEach(styleTag => {
             if (styleTag.innerHTML.includes('oklch') || styleTag.innerHTML.includes('oklab')) {
               styleTag.innerHTML = styleTag.innerHTML.replace(/(oklch|oklab)\([^)]+\)/g, '#000000');
             }
           });

           // 2. Comprehensive element-level override
           clonedDoc.querySelectorAll('*').forEach((el: any) => {
             if (el.style) {
               if (el.style.cssText && (el.style.cssText.includes('oklch') || el.style.cssText.includes('oklab'))) {
                 el.style.cssText = el.style.cssText.replace(/(oklch|oklab)\([^)]+\)/g, '#000000');
               }
               const computed = window.getComputedStyle(el);
               if (computed.color.includes('oklch') || clonedDoc.body.style.color.includes('oklab')) el.style.color = '#0F172A';
               if (computed.backgroundColor.includes('oklch') || computed.backgroundColor.includes('oklab')) {
                 el.style.backgroundColor = el.classList.contains('card-hayat') ? '#FFFFFF' : 'transparent';
               }
               if (computed.borderColor.includes('oklch') || computed.borderColor.includes('oklab')) el.style.borderColor = '#E2E8F0';
               if (computed.fill?.includes('oklch') || computed.fill?.includes('oklab')) el.style.fill = '#888888';
               if (computed.stroke?.includes('oklch') || computed.stroke?.includes('oklab')) el.style.stroke = '#888888';
             }
           });

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
            className={`px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all ${viewMode === 'pl' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             الأرباح والخسائر
           </button>
           <button 
            onClick={() => setViewMode('chart')}
            className={`px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all ${viewMode === 'chart' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
           >
             الاتجاهات والرسوم
           </button>
           <button 
            onClick={() => setViewMode('table')}
            className={`px-5 py-2.5 rounded-xl text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all ${viewMode === 'table' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
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

              <div className={`p-6 border rounded-3xl text-right space-y-2 ${plData.netProfit >= 0 ? 'bg-amber-50/80 border-hayat-border/80' : 'bg-red-50 border-red-200'}`}>
                <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: plData.netProfit >= 0 ? navyColor : '#B91C1C' }}>صافي الأرباح بالفترة</span>
                <p className="text-2xl font-serif font-black tabular-nums" style={{ color: plData.netProfit >= 0 ? navyColor : '#911F1F' }}>
                  {plData.netProfit.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className={`text-[10px] block font-black ${plData.netProfit >= 0 ? 'text-amber-800' : 'text-red-600'}`}>
                  هامش مبيعات ناصع {Math.round(plData.netMargin)}%
                </span>
              </div>
            </div>

            {/* Split Account Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-4">
              {/* OPERATING REVENUES breakdown */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b-2 border-emerald-300 pb-3">
                  <span className="text-sm font-black text-emerald-800">1. الإيرادات التشغيلية المباشرة</span>
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">Inflow Channels</span>
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
              <div className="bg-hayat-accent/20 border border-hayat-border/30 p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-hayat-navy">
                  <Receipt className="w-5 h-5" />
                  <span className="font-black text-sm">4. تسويات ضريبة القيمة المضافة (VAT Summary)</span>
                </div>
                {settings.isTaxRegistered ? (
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
                ) : (
                  <p className="text-[11px] text-slate-400 italic font-bold pt-2 leading-relaxed">
                    النظام مُسجل حالياِ كمنشأة معفاة. يمكن تعديل الرقم الضريبي والهيكل الضريبي من قائمة الإعدادات لبدء تجميع كشوفات الضريبة المضافة.
                  </p>
                )}
              </div>
            </div>

            {/* Final bottom audit total */}
            <div className="border-t-4 border-double border-hayat-navy/40 pt-6 mt-10">
              <div className="bg-hayat-navy text-white rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="space-y-1 text-center md:text-right">
                  <span className="text-[10px] font-black tracking-widest text-[#EADEC9] uppercase block mb-1">صافي نتيجة الأعمال للفترة م ل</span>
                  <h4 className="text-lg font-black font-serif">نتيجة الأرباح أو الخسائر الصافية للفترة المحددة</h4>
                </div>
                
                <div className="text-center md:text-left font-serif">
                  <p className="text-4xl font-black text-[#EADEC9] tabular-nums leading-none">
                    {plData.netProfit.toLocaleString()} <span className="text-base font-sans font-bold">ريال</span>
                  </p>
                  <p className="text-xs text-white/70 mt-2 font-sans font-bold">
                    صافي هامش مبيعاتك: <span className="text-[#EADEC9] font-black">{Math.round(plData.netMargin)}%</span> • معامل هدر الإيراد: <span className="text-[#EADEC9] font-black">{Math.round(plData.wasteRatio)}%</span>
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
        ) : viewMode === 'chart' ? (
          <div className="w-full space-y-10">
            <div className="flex justify-between items-center bg-hayat-accent/20 p-4 rounded-2xl">
               <h4 className="text-sm font-bold text-hayat-navy">تحليل المبيعات والمصاريف الشهرية</h4>
               <div className="flex gap-2">
                  <button 
                    onClick={() => setChartType('bar')}
                    className={`p-2 rounded-lg transition-all ${chartType === 'bar' ? 'bg-hayat-wood text-white shadow-sm' : 'bg-white text-slate-300'}`}
                  >
                    <LayoutDashboard size={16} />
                  </button>
                  <button 
                    onClick={() => setChartType('line')}
                    className={`p-2 rounded-lg transition-all ${chartType === 'line' ? 'bg-hayat-wood text-white shadow-sm' : 'bg-white text-slate-300'}`}
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
                    <XAxis dataKey="formattedMonth" fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '10px' }} />
                    <Bar name="إجمالي المبيعات" dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} barSize={34} />
                    <Bar name="إجمالي المصاريف" dataKey="expense" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={34} />
                  </BarChart>
                ) : (
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="formattedMonth" fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }} />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '10px' }} />
                    <Area type="monotone" name="المبيعات" dataKey="revenue" stroke="#10B981" strokeWidth={3} fill="url(#revenueGrad)" />
                    <Area type="monotone" name="المصاريف" dataKey="expense" stroke="#F43F5E" strokeWidth={3} fill="url(#expenseGrad)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-hayat-border/40">
               <div>
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">تحليل هامش الربح الشهري</h5>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="formattedMonth" hide />
                          <YAxis fontSize={10} fontWeight={700} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '10px' }} />
                          <Line type="monotone" name="هامش الربح %" dataKey="margin" stroke="#A16207" strokeWidth={3} dot={{ r: 4, fill: '#A16207' }} />
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
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من مسح هذا السجل؟')) return;
    try {
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
        <button 
          onClick={() => setShowAdd(!showAdd)} 
          className={showAdd ? 'btn-secondary' : 'btn-primary'}
        >
          {showAdd ? 'إلغاء العملية' : 'سجل جديد +'}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hayat-border/40 bg-hayat-accent/30"
          >
            <div className="p-10">
              <RecordForm type={type} user={user} services={services} settings={settings} onComplete={() => setShowAdd(false)} />
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

      <div className="p-0 overflow-x-auto">
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

function RecordForm({ type, user, services, settings, onComplete }: { type: any, user: User, services: any, settings: any, onComplete: () => void }) {
  const [formData, setFormData] = useState<any>({
    category: 'materials',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    month: format(new Date(), 'yyyy-MM'),
    description: '',
    productType: 'acrylic',
    orderNumber: '',
    material: '',
    reason: '',
    estimatedCost: '',
    paymentMethod: 'cash'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const collectionName = `${type}s`;
      const payload: any = {
        userId: user.uid,
        createdAt: serverTimestamp(),
      };

      if (type === 'budget') {
        payload.category = formData.category;
        payload.amount = Number(formData.amount);
        payload.month = formData.month;
      } else if (type === 'expense') {
        payload.category = formData.category;
        payload.amount = Number(formData.amount);
        payload.date = new Date(formData.date).toISOString();
        payload.description = formData.description;
        payload.paymentMethod = formData.paymentMethod || 'cash';
        
        const taxRate = settings.isTaxRegistered ? settings.taxRate : 0;
        const calculatedTax = settings.isTaxRegistered ? (Number(formData.amount) - (Number(formData.amount) / (1 + (taxRate / 100)))) : 0;
        payload.taxAmount = Number(calculatedTax.toFixed(2));
      } else if (type === 'revenue') {
        payload.amount = Number(formData.amount);
        payload.productType = formData.productType;
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

      await addDoc(collection(services.db, collectionName), payload);
      onComplete();
    } catch (err) {
      console.error(err);
      alert('خطأ في الحفظ، يرجى مراجعة الصلاحيات');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-end">
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
             <select value={formData.productType} onChange={e => setFormData({...formData, productType: e.target.value})} className="form-input">
              <option value="acrylic">منتجات أكريليك</option>
              <option value="wood">منتجات خشبية</option>
              <option value="svg">ملفات رقمية (SVG)</option>
              <option value="other">منتجات أخرى</option>
            </select>
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

      <button type="submit" className="btn-primary h-[52px]">اعتماد البيانات</button>
    </form>
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

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2.5rem] shadow-hayat-lg overflow-hidden border border-hayat-border/60 max-w-2xl w-full flex flex-col"
      >
        {/* Modal Actions Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-hayat-border/40 flex justify-between items-center text-hayat-navy">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-hayat-wood animate-pulse"></span>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">سند ومعاملة معتمدة</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Voucher Bill Body */}
        <div id="printable-voucher" className="p-6 md:p-10 space-y-6 md:space-y-8 print:p-8">
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
            <div className="flex justify-between items-center text-xs text-slate-500 font-bold font-sans">
              <span>القيمة الخاضعة للضريبة</span>
              <span className="font-bold tabular-nums">{beforeTaxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</span>
            </div>
            
            {settings.isTaxRegistered ? (
              <div className="flex justify-between items-center text-xs text-slate-500 border-b border-dashed border-hayat-border/40 pb-3 font-bold font-sans">
                <span>ضريبة القيمة المضافة ({taxRate}%)</span>
                <span className="font-bold tabular-nums">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال</span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-xs text-slate-400 border-b border-dashed border-hayat-border/40 pb-3 italic font-bold font-sans">
                <span>ضريبة القيمة المضافة</span>
                <span className="font-black text-[9px] uppercase text-amber-700">المتجر غير خاضع للضريبة حالياً</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-3">
              <span className="text-sm font-bold text-hayat-navy">المجموع الإجمالي النهائي</span>
              <span className="font-serif font-black text-lg md:text-xl text-hayat-navy tabular-nums font-sans">
                {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </span>
            </div>
          </div>

          {/* Business and Tax Details */}
          <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl text-center space-y-1 font-sans">
            {settings.isTaxRegistered ? (
              <>
                <p className="text-[9px] font-bold text-slate-600">الرقم الضريبي للمنشأة: <span className="font-mono tabular-nums text-slate-900">{settings.taxNumber}</span></p>
                <p className="text-[9px] text-slate-400">فاتورة ضريبية مبسطة صادرة طبقا لتعليمات هيئة الزكاة والضريبة والجمارك</p>
              </>
            ) : (
              <p className="text-[9px] font-bold text-slate-500">هذه المنشأة معفاة من ضريبة القيمة المضافة أو غير خاضعة لها بموجب الضوابط حالياً.</p>
            )}
          </div>

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
        <div className="bg-slate-50 px-6 py-4.5 md:px-10 md:py-6 border-t border-hayat-border/40 flex justify-end gap-3" data-html2canvas-ignore="true">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 font-bold transition-all hover:bg-slate-50"
          >
            إغلاق النافذة
          </button>
          <button 
            onClick={handlePrint}
            className="px-5 py-2.5 bg-hayat-navy text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:bg-hayat-navy/95 shadow-sm"
          >
            <Printer size={14} />
            طباعة السند
          </button>
        </div>
      </motion.div>
    </div>
  );
}

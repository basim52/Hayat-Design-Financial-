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
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, parseISO, isSameMonth } from 'date-fns';
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

// --- Components ---

const COLORS = ['#A16207', '#1E293B', '#64748b', '#94a3b8', '#cbd5e1'];
const PRODUCT_COLORS = {
  acrylic: '#A16207',
  wood: '#1E293B',
  svg: '#0f172a',
  other: '#64748b'
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<{ db: any, auth: any }>({ db: initialDb, auth: initialAuth });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'revenues' | 'budget' | 'waste'>('dashboard');
  
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

    // Remove userId filter to allow all employees/users in the same Firebase project to see data
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
    <div className="min-h-screen bg-hayat-cream font-sans text-stone-800 rtl" dir="rtl">
      {/* Sidebar / Nav */}
      <nav className="fixed bottom-0 w-full bg-white/80 backdrop-blur-md border-t border-hayat-border md:w-72 md:h-screen md:sticky md:top-0 md:bg-white md:border-r md:border-t-0 z-50">
        <div className="flex md:flex-col h-full p-4 justify-around md:justify-start gap-1">
          <div className="hidden md:block mb-10 p-6 border-b border-hayat-border/60">
             <div className="flex items-center gap-3 mb-2">
                <Logo className="w-10 h-10" />
                <h1 className="font-serif text-2xl text-hayat-navy tracking-tight">حياة ديزاين</h1>
             </div>
             <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-bold">Financial Intelligence</p>
          </div>
          
          <div className="flex md:flex-col gap-1 w-full flex-1">
            <NavItem icon={<LayoutDashboard size={18} />} label="الرئيسية" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon={<Receipt size={18} />} label="المصاريف" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
            <NavItem icon={<ShoppingBag size={18} />} label="المبيعات" active={activeTab === 'revenues'} onClick={() => setActiveTab('revenues')} />
            <NavItem icon={<Target size={18} />} label="الميزانية" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
            <NavItem icon={<AlertTriangle size={18} />} label="الهدر" active={activeTab === 'waste'} onClick={() => setActiveTab('waste')} />
          </div>

          <div className="hidden md:block pt-4 border-t border-hayat-border/60">
             <NavItem icon={<LogOut size={18} />} label="إنهاء الجلسة" active={false} onClick={handleLogout} />
          </div>

          <div className="md:mt-6 flex items-center gap-3 p-4 bg-hayat-accent rounded-2xl border border-hayat-border/40 mb-4 mx-2">
            <div className="relative">
              <img src={user.photoURL || ''} className="w-10 h-10 rounded-xl border-2 border-white shadow-sm object-cover" alt="Avatar" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="hidden md:block flex-1 truncate">
              <p className="text-[11px] font-bold text-hayat-navy truncate">{user.displayName}</p>
              <p className="text-[9px] text-slate-400 font-medium">{user.email?.split('@')[0]}</p>
            </div>
          </div>
        </div>
      </nav>

      <main className="p-6 md:p-12 pb-24 md:pb-12 max-w-7xl mx-auto">
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
               <DashboardHeader user={user} budgets={budgets} expenses={expenses} revenues={revenues} waste={waste} dashboardRef={dashboardRef} />
               
               <DashboardContent budgets={budgets} expenses={expenses} revenues={revenues} waste={waste} />
            </motion.div>
          )}
          {activeTab === 'expenses' && <DataListSection title="إدارة المصاريف" type="expense" items={expenses} user={user} services={services} />}
          {activeTab === 'revenues' && <DataListSection title="إدارة المبيعات" type="revenue" items={revenues} user={user} services={services} />}
          {activeTab === 'budget' && <DataListSection title="تخطيط الميزانية" type="budget" items={budgets} user={user} services={services} />}
          {activeTab === 'waste' && <DataListSection title="تتبع الهدر" type="waste" items={waste} user={user} services={services} />}
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

function DashboardHeader({ user, budgets, expenses, revenues, waste, dashboardRef }: any) {
  const [isExporting, setIsExporting] = useState(false);
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthRevenues = revenues.filter((r: any) => format(parseISO(r.date), 'yyyy-MM') === currentMonth);
  const monthExpenses = expenses.filter((e: any) => format(parseISO(e.date), 'yyyy-MM') === currentMonth);
  const monthWaste = waste.filter((w: any) => format(parseISO(w.date), 'yyyy-MM') === currentMonth);
  
  const totalRevenue = monthRevenues.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const totalExpense = monthExpenses.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const netProfit = totalRevenue - totalExpense;

  const downloadReportCSV = () => {
    let csvContent = "\uFEFF"; // BOM for Arabic support
    csvContent += "البيانات المالية لشهر " + format(new Date(), 'MMMM yyyy') + "\n\n";

    // Sales
    csvContent += "المبيعات\n";
    csvContent += "التاريخ,المنتج,القيمة,رقم الطلب\n";
    monthRevenues.forEach((r: any) => {
      csvContent += `${format(parseISO(r.date), 'yyyy-MM-dd')},${translateProduct(r.productType)},${r.amount},${r.orderNumber || ''}\n`;
    });

    // Expenses
    csvContent += "\nالمصاريف\n";
    csvContent += "التاريخ,الفئة,المبلغ,الوصف\n";
    monthExpenses.forEach((e: any) => {
      csvContent += `${format(parseISO(e.date), 'yyyy-MM-dd')},${translateCategory(e.category)},${e.amount},${e.description || ''}\n`;
    });

    // Waste
    csvContent += "\nالهدر\n";
    csvContent += "التاريخ,المادة,التكلفة,السبب\n";
    monthWaste.forEach((w: any) => {
      csvContent += `${format(parseISO(w.date), 'yyyy-MM-dd')},${w.material},${w.estimatedCost},${w.reason || ''}\n`;
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
          const clonedElement = clonedDoc.getElementById('dash');
          if (clonedElement) {
             clonedElement.style.padding = '60px';
             clonedElement.style.width = '1200px';
             clonedElement.style.background = '#F9F7F5';
             const allElements = clonedElement.querySelectorAll('*');
             allElements.forEach((el: any) => {
                if (el.tagName === 'svg' || el.tagName === 'path' || el.tagName === 'circle') return;
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.color.includes('oklch')) { el.style.color = '#0F172A'; }
                if (computedStyle.backgroundColor.includes('oklch')) { el.style.backgroundColor = 'transparent'; }
             });
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
          const clonedElement = clonedDoc.getElementById('dash');
          if (clonedElement) {
             clonedElement.style.padding = '60px';
             clonedElement.style.width = '1200px';
             clonedElement.style.background = '#F9F7F5';
             const allElements = clonedElement.querySelectorAll('*');
             allElements.forEach((el: any) => {
                if (el.tagName === 'svg' || el.tagName === 'path') return;
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.color.includes('oklch')) { el.style.color = '#0F172A'; }
             });
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
    const actual = expenses.filter((e: any) => e.category === cat && format(parseISO(e.date), 'yyyy-MM') === currentMonth)
                           .reduce((acc: number, curr: any) => acc + curr.amount, 0);
    return { name: translateCategory(cat), target, actual };
  });

  const recentRevenues = [...revenues]
    .filter(r => format(parseISO(r.date), 'yyyy-MM') === currentMonth)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const recentExpenses = [...expenses]
    .filter(e => format(parseISO(e.date), 'yyyy-MM') === currentMonth)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
                    <p className="text-[10px] font-bold" style={{ color: '#94A3B8' }}>{format(parseISO(r.date), 'dd MMMM')}</p>
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
                    <p className="text-[10px] font-bold" style={{ color: '#94A3B8' }}>{format(parseISO(e.date), 'dd MMMM')}</p>
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

function DataListSection({ title, type, items, user, services }: { title: string, type: 'budget'|'expense'|'revenue'|'waste', items: any[], user: User, services: any }) {
  const [showAdd, setShowAdd] = useState(false);

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من مسح هذا السجل؟')) return;
    try {
      await deleteDoc(doc(services.db, `${type}s`, id));
    } catch (e) {
      console.error(e);
    }
  };

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
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Management & Archives</p>
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
              <RecordForm type={type} user={user} services={services} onComplete={() => setShowAdd(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-0 overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-400 text-[9px] uppercase tracking-[0.2em] font-black">
              <th className="py-6 px-10">التاريخ</th>
              <th className="py-6 px-10">{type === 'budget' ? 'بند الميزانية' : (type === 'revenue' ? 'المنتج / الطلب' : 'البيان')}</th>
              <th className="py-6 px-10 text-left">القيمة المالية</th>
              {type !== 'budget' && <th className="py-6 px-10">التفاصيل الإضافية</th>}
              <th className="py-6 px-10 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hayat-border/30">
            {items.sort((a, b) => {
              const aTime = a.createdAt?.seconds || 0;
              const bTime = b.createdAt?.seconds || 0;
              return bTime - aTime;
            }).map((item) => (
              <tr key={item.id} className="hover:bg-hayat-accent/40 transition-colors group">
                <td className="py-6 px-10">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                      <span className="text-[11px] text-slate-400 font-bold tabular-nums">
                        {type === 'budget' ? item.month : format(parseISO(item.date), 'yyyy / MM / dd')}
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
                        <span className="text-[9px] text-slate-400 font-bold">Ref: #{item.orderNumber}</span>
                      )}
                   </div>
                </td>
                <td className="py-6 px-10 text-left">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-serif font-bold text-base ${type === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-hayat-navy'}`}>
                    {(item.amount || item.estimatedCost)?.toLocaleString()}
                    <span className="text-[9px] font-sans font-black opacity-40 uppercase tracking-tighter">SAR</span>
                  </div>
                </td>
                {type !== 'budget' && (
                  <td className="py-6 px-10 text-slate-400 text-[11px] font-medium max-w-[200px] truncate tabular-nums">
                    {item.description || item.reason || (item.orderNumber ? `Sale Transaction` : 'سجل تشغيلي عام')}
                  </td>
                )}
                <td className="py-6 px-10 text-left">
                   <button 
                    onClick={() => handleDelete(item.id)} 
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-200 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                   >
                     <Trash2 size={16} />
                   </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-20 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-hayat-accent rounded-full flex items-center justify-center text-slate-300 mb-4">
                      <LayoutDashboard size={32} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">لا توجد بيانات مسجلة حالياً</p>
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
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">عدد السجلات</p>
                <p className="text-xl font-bold text-hayat-navy">{items.length}</p>
             </div>
             <div className="w-px h-10 bg-hayat-border/40"></div>
             <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">إجمالي القيمة المالية</p>
                <div className="flex items-baseline gap-2">
                   <p className="text-2xl font-serif font-black text-hayat-navy">
                     {items.reduce((acc, curr) => acc + (curr.amount || curr.estimatedCost || 0), 0).toLocaleString()}
                   </p>
                   <span className="text-[10px] font-bold text-slate-400">ريال</span>
                </div>
             </div>
          </div>
      </div>
    </motion.div>
  );
}

function RecordForm({ type, user, services, onComplete }: { type: any, user: User, services: any, onComplete: () => void }) {
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
    estimatedCost: ''
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
      } else if (type === 'revenue') {
        payload.amount = Number(formData.amount);
        payload.productType = formData.productType;
        payload.orderNumber = formData.orderNumber;
        payload.description = formData.description;
        payload.date = new Date(formData.date).toISOString();
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

// --- Utils ---

function translateCategory(cat: string) {
  const map: any = { materials: 'خامات', marketing: 'تسويق', maintenance: 'صيانة', wages: 'أجور', other: 'أخرى' };
  return map[cat] || cat;
}

function translateProduct(p: string) {
  const map: any = { acrylic: 'أكريليك', wood: 'خشب', svg: 'SVG (رقمي)', other: 'أخرى' };
  return map[p] || p;
}

function generateCashFlowTrend(revenues: Revenue[], expenses: Expense[]) {
  // Aggregate by month for last 6 months
  const months = [];
  for (let i = 5; i >= 0; i--) {
     const date = new Date();
     date.setMonth(date.getMonth() - i);
     months.push(format(date, 'yyyy-MM'));
  }

  return months.map(m => {
    const rev = revenues.filter(r => format(parseISO(r.date), 'yyyy-MM') === m).reduce((a, b) => a + b.amount, 0);
    const exp = expenses.filter(e => format(parseISO(e.date), 'yyyy-MM') === m).reduce((a, b) => a + b.amount, 0);
    return { month: format(parseISO(m + '-01'), 'MMM'), net: rev - exp };
  });
}

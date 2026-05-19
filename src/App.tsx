/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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

    const unsubBudgets = onSnapshot(query(collection(services.db, 'budgets'), where('userId', '==', user.uid)), (snap) => {
      setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetTarget)));
    });
    const unsubExpenses = onSnapshot(query(collection(services.db, 'expenses'), where('userId', '==', user.uid)), (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    });
    const unsubRevenues = onSnapshot(query(collection(services.db, 'revenues'), where('userId', '==', user.uid)), (snap) => {
      setRevenues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Revenue)));
    });
    const unsubWaste = onSnapshot(query(collection(services.db, 'waste'), where('userId', '==', user.uid)), (snap) => {
      setWaste(snap.docs.map(d => ({ id: d.id, ...d.data() } as WasteItem)));
    });

    return () => {
      unsubBudgets();
      unsubExpenses();
      unsubRevenues();
      unsubWaste();
    };
  }, [user, services.db]);

  const handleLogin = () => services.auth && signInWithPopup(services.auth, new GoogleAuthProvider());
  const handleLogout = () => services.auth && signOut(services.auth);

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
      <div className="flex flex-col items-center justify-center h-screen bg-hayat-cream font-sans p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-12 rounded-3xl shadow-xl border border-hayat-wood/10"
        >
          <div className="flex flex-col items-center mb-6">
            <img 
              src="/logo.png" 
              alt="Hayat Design Logo" 
              className="w-32 h-32 mb-4 object-contain"
              referrerPolicy="no-referrer"
            />
            <h1 className="font-serif text-4xl text-hayat-navy">حياة ديزاين</h1>
          </div>
          <p className="text-slate-500 mb-8 leading-relaxed">اللوحة المالية الذكية لإدارة الميزانية وتتبع المبيعات</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-hayat-navy text-white py-4 rounded-lg flex items-center justify-center gap-3 hover:bg-slate-800 transition-colors font-medium shadow-md"
          >
            <UserIcon size={20} />
            تسجيل الدخول باستخدام جوجل
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hayat-cream font-sans text-stone-800 rtl" dir="rtl">
      {/* Sidebar / Nav */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-hayat-border md:w-64 md:h-screen md:sticky md:top-0 md:bg-white md:border-r z-50">
        <div className="flex md:flex-col h-full p-4 justify-around md:justify-start gap-2">
          <div className="hidden md:block mb-8 p-4 border-b border-hayat-border pb-6">
             <div className="flex items-center gap-3">
               <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-10 h-10 object-contain"
                referrerPolicy="no-referrer"
               />
               <h1 className="font-serif text-2xl text-hayat-navy">
                 حياة ديزاين
               </h1>
             </div>
             <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-2 font-bold">Dashboard | لوحة التحكم</p>
          </div>
          
          <NavItem icon={<LayoutDashboard size={20} />} label="الرئيسية" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Receipt size={20} />} label="المصاريف" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
          <NavItem icon={<ShoppingBag size={20} />} label="المبيعات" active={activeTab === 'revenues'} onClick={() => setActiveTab('revenues')} />
          <NavItem icon={<Target size={20} />} label="الميزانية" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
          <NavItem icon={<AlertTriangle size={20} />} label="الهدر" active={activeTab === 'waste'} onClick={() => setActiveTab('waste')} />

          <div className="md:mt-auto flex items-center gap-3 p-4 border-t border-hayat-border md:mb-4">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-hayat-border" alt="Avatar" />
            <div className="hidden md:block flex-1 truncate">
              <p className="text-xs font-bold text-slate-900 truncate">{user.displayName}</p>
              <button onClick={handleLogout} className="text-[10px] text-slate-400 hover:text-red-500 mt-1 flex items-center gap-1 font-bold">
                <LogOut size={10} /> تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="p-6 md:p-12 pb-24 md:pb-12 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dash" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
               <DashboardHeader user={user} budgets={budgets} expenses={expenses} revenues={revenues} />
               
               <DashboardContent budgets={budgets} expenses={expenses} revenues={revenues} />
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
      className={`flex items-center gap-4 p-3 rounded-xl w-full transition-all duration-200 ${active ? 'bg-hayat-navy text-white shadow-md' : 'hover:bg-slate-100 text-slate-500'}`}
    >
      {icon}
      <span className="hidden md:block font-medium text-sm">{label}</span>
    </button>
  );
}

function DashboardHeader({ user, budgets, expenses, revenues }: any) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthRevenues = revenues.filter((r: any) => format(parseISO(r.date), 'yyyy-MM') === currentMonth);
  const monthExpenses = expenses.filter((e: any) => format(parseISO(e.date), 'yyyy-MM') === currentMonth);
  
  const totalRevenue = monthRevenues.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const totalExpense = monthExpenses.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const netProfit = totalRevenue - totalExpense;

  return (
    <div className="mb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-hayat-border pb-8">
        <div>
          <h2 className="font-serif text-4xl text-hayat-navy mb-2 tracking-tight">أهلاً بك، {user.displayName?.split(' ')[0]}</h2>
          <p className="text-slate-500 font-medium text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            متابعة الميزانية التشغيلية - {format(new Date(), 'MMMM yyyy')}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white border border-hayat-border px-4 py-2 rounded-lg flex items-center gap-3 shadow-sm">
             <div className="w-2 h-2 bg-hayat-wood rounded-full"></div>
             <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">تدفق نقدي إيجابي</span>
          </div>
          <button className="bg-hayat-navy text-white px-6 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-slate-800 transition-all uppercase tracking-widest">تحميل التقرير</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="إجمالي المبيعات" value={totalRevenue} color="text-emerald-700" sub="+12% عن الشهر الماضي" />
        <StatCard label="المصاريف الفعلية" value={totalExpense} color="text-rose-700" sub={`الميزانية الإجمالية: 15,000`} />
        <StatCard label="صافي الربح" value={netProfit} color="text-hayat-navy" sub="هامش الربح: 47.5%" highlight />
        <StatCard label="معدل الهدر (Waste)" value={240} color="text-amber-700" sub="بناءً على قص الخامات" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, sub, highlight }: any) {
  return (
    <div className={`p-6 rounded-xl transition-all border ${highlight ? 'bg-white border-hayat-wood border-2 shadow-md scale-105' : 'bg-white border-hayat-border shadow-sm'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mb-2 text-hayat-navy`}>{value.toLocaleString()} <span className="text-sm font-normal opacity-60">ريال</span></p>
      <p className={`text-[10px] font-medium ${highlight ? 'text-hayat-wood' : 'text-slate-400'}`}>{sub}</p>
    </div>
  );
}

function DashboardContent({ budgets, expenses, revenues }: any) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  
  // Budget vs Actual Data
  const categories: Category[] = ['materials', 'marketing', 'maintenance', 'wages', 'other'];
  const budgetVsActual = categories.map(cat => {
    const target = budgets.find((b: any) => b.category === cat && b.month === currentMonth)?.amount || 0;
    const actual = expenses.filter((e: any) => e.category === cat && format(parseISO(e.date), 'yyyy-MM') === currentMonth)
                           .reduce((acc: number, curr: any) => acc + curr.amount, 0);
    return { name: translateCategory(cat), target, actual };
  });

  // Sales by Product Type
  const productData = Object.keys(PRODUCT_COLORS).map(type => ({
    name: translateProduct(type),
    value: revenues.filter((r: any) => r.productType === type && format(parseISO(r.date), 'yyyy-MM') === currentMonth)
                   .reduce((acc: number, curr: any) => acc + curr.amount, 0),
    type
  })).filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Actual vs Budget - Span 2 */}
      <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-hayat-border shadow-sm flex flex-col min-h-[450px]">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-lg font-bold text-hayat-navy">مقارنة الميزانية التقديرية بالإنفاق الفعلي</h3>
          <div className="flex gap-4">
             <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400"><span className="w-2 h-2 bg-slate-100 rounded-full"></span> تقديري</div>
             <div className="flex items-center gap-2 text-[10px] font-bold text-hayat-wood"><span className="w-2 h-2 bg-hayat-wood rounded-full"></span> فعلي</div>
          </div>
        </div>
        <div className="flex-grow">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={budgetVsActual} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" fontSize={11} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}
              />
              <Bar name="التقديري" dataKey="target" fill="#f1f5f9" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar name="الفعلي" dataKey="actual" fill="#A16207" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Burn Rate / Analysis - Span 1 */}
      <div className="bg-white p-8 rounded-2xl border border-hayat-border shadow-sm flex flex-col min-h-[450px]">
        <h3 className="text-lg font-bold text-hayat-navy mb-8">مؤشر استهلاك الميزانية</h3>
        <div className="space-y-8 flex-grow">
          {budgetVsActual.map((item, idx) => {
            const percentage = item.target > 0 ? (item.actual / item.target) * 100 : 0;
            const cappedPercentage = Math.min(percentage, 100);
            const isOver = item.actual > item.target && item.target > 0;
            return (
              <div key={idx}>
                <div className="flex justify-between text-[11px] mb-2 font-bold">
                  <span className="text-slate-600">{item.name}</span>
                  <span className={isOver ? 'text-red-500' : 'text-slate-400'}>
                    {Math.round(percentage)}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${cappedPercentage}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-hayat-wood'}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-8 pt-8 border-t border-hayat-border">
          <h4 className="text-sm font-bold text-hayat-navy mb-4">تحليل المبيعات والنمو م6</h4>
          <div className="h-40">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={generateCashFlowTrend(revenues, [])}>
                 <defs>
                   <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#A16207" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="#A16207" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <XAxis dataKey="month" hide />
                 <Tooltip />
                 <Area type="monotone" dataKey="net" stroke="#A16207" fill="url(#colorSales)" strokeWidth={2} />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>
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
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-hayat-border">
      <div className="bg-white p-8 flex justify-between items-center border-b border-hayat-border">
        <div>
          <h2 className="text-xl font-bold text-hayat-navy">{title}</h2>
          <p className="text-slate-400 text-xs mt-1 font-medium">إدارة كافة السجلات التشغيلية</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)} 
          className="bg-hayat-navy text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-sm text-xs font-bold uppercase tracking-widest"
        >
          {showAdd ? 'إلغاء' : 'إضافة جديد +'}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-hayat-border bg-slate-50/50"
          >
            <div className="p-8">
              <RecordForm type={type} user={user} services={services} onComplete={() => setShowAdd(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-0 overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-hayat-border text-slate-400 text-[10px] uppercase tracking-wider font-bold">
              <th className="py-4 px-6">التاريخ</th>
              <th className="py-4 px-6">{type === 'budget' ? 'البند' : (type === 'revenue' ? 'المنتج' : 'الوصف')}</th>
              <th className="py-4 px-6 text-left">المبلغ</th>
              {type !== 'budget' && <th className="py-4 px-6">البيان / ملاحظات</th>}
              <th className="py-4 px-6 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hayat-border">
            {items.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds).map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-4 px-6 text-xs text-slate-500 font-medium">{type === 'budget' ? item.month : format(parseISO(item.date), 'yyyy/MM/dd')}</td>
                <td className="py-4 px-6 font-bold text-slate-700 text-sm">
                  {type === 'budget' || type === 'expense' ? translateCategory(item.category) : 
                   type === 'revenue' ? translateProduct(item.productType) : item.material}
                </td>
                <td className="py-4 px-6 text-left">
                  <span className={`font-bold text-sm ${type === 'revenue' ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {(item.amount || item.estimatedCost)?.toLocaleString()} <span className="text-[10px] text-slate-400 font-medium">ريال</span>
                  </span>
                </td>
                {type !== 'budget' && <td className="py-4 px-6 text-slate-400 text-xs font-medium max-w-xs truncate">{item.description || item.reason || item.orderNumber}</td>}
                <td className="py-4 px-6">
                   <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                     <Trash2 size={14} />
                   </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
      {type === 'budget' && (
        <>
          <FormGroup label="الشهر" child={<input type="month" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} className="form-input" required />} />
          <FormGroup label="البند" child={
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input">
              <option value="materials">خامات</option>
              <option value="marketing">تسويق</option>
              <option value="maintenance">صيانة</option>
              <option value="wages">أجور</option>
              <option value="other">أخرى</option>
            </select>
          } />
          <FormGroup label="المبلغ التقديري" child={<input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input" required />} />
        </>
      )}

      {type === 'expense' && (
        <>
          <FormGroup label="التاريخ" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
          <FormGroup label="الفئة" child={
             <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input">
              <option value="materials">خامات</option>
              <option value="marketing">تسويق</option>
              <option value="maintenance">صيانة</option>
              <option value="wages">أجور</option>
              <option value="other">أخرى</option>
            </select>
          } />
          <FormGroup label="المبلغ" child={<input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input" required />} />
          <FormGroup label="البيان" child={<input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="form-input" />} />
        </>
      )}

      {type === 'revenue' && (
        <>
          <FormGroup label="التاريخ" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
          <FormGroup label="نوع المنتج" child={
             <select value={formData.productType} onChange={e => setFormData({...formData, productType: e.target.value})} className="form-input">
              <option value="acrylic">أكريليك</option>
              <option value="wood">خشب</option>
              <option value="svg">تصاميم رقمية (SVG)</option>
              <option value="other">أخرى</option>
            </select>
          } />
          <FormGroup label="القيمة" child={<input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="form-input" required />} />
          <FormGroup label="رقم الطلب" child={<input type="text" value={formData.orderNumber} onChange={e => setFormData({...formData, orderNumber: e.target.value})} className="form-input" />} />
        </>
      )}

      {type === 'waste' && (
        <>
          <FormGroup label="التاريخ" child={<input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" required />} />
          <FormGroup label="المادة المهدرة" child={<input type="text" value={formData.material} onChange={e => setFormData({...formData, material: e.target.value})} className="form-input" required />} />
          <FormGroup label="التكلفة التقديرية" child={<input type="number" value={formData.estimatedCost} onChange={e => setFormData({...formData, estimatedCost: e.target.value})} className="form-input" required />} />
          <FormGroup label="السبب" child={<input type="text" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="form-input" />} />
        </>
      )}

      <button type="submit" className="bg-hayat-navy text-white p-4 rounded-xl hover:bg-hayat-wood transition-colors shadow-lg font-bold">حفظ السجل</button>
    </form>
  );
}

function FormGroup({ label, child }: any) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">{label}</label>
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

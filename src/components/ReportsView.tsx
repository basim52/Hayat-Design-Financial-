import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
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
  LineChart, 
  Line, 
  AreaChart, 
  Area 
} from 'recharts';
import { 
  FileBarChart, 
  Calendar, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  LayoutDashboard, 
  AlertTriangle, 
  Receipt 
} from 'lucide-react';
import { Expense, Revenue, BudgetTarget, WasteItem, Category, ProductType } from '../types';
import { cleanOklColorsAndPatchGetComputedStyle } from '../utils/canvasExport';

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

interface ReportsViewProps {
  expenses: Expense[];
  revenues: Revenue[];
  budgets: BudgetTarget[];
  waste?: WasteItem[];
  setActiveTab: (tab: any) => void;
  settings: any;
}

export default function ReportsView({
  expenses,
  revenues,
  budgets,
  waste = [],
  setActiveTab,
  settings
}: ReportsViewProps) {
  const [viewMode, setViewMode] = useState<'pl' | 'chart' | 'table'>('pl');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [isExporting, setIsExporting] = useState(false);
  const reportsRef = useRef<HTMLDivElement>(null);

  const navyColor = '#2E1065';
  const woodColor = '#059669';

  // Date states for Profit & Loss and general filtering
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return format(startOfMonth(d), 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return format(endOfMonth(d), 'yyyy-MM-dd');
  });

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

  const plData = React.useMemo(() => {
    const totalRevenue = filteredRevenues.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalWaste = filteredWaste.reduce((sum, w) => sum + (Number(w.estimatedCost) || 0), 0);

    const totalRevenueTax = filteredRevenues.reduce((sum, r) => sum + (Number(r.taxAmount) || 0), 0);
    const totalExpenseTax = filteredExpenses.reduce((sum, e) => sum + (Number(e.taxAmount) || 0), 0);

    const revenueBreakdown: Record<string, { type: string; amount: number; tax: number; count: number }> = {};
    filteredRevenues.forEach(r => {
      const pType = r.productType || 'other';
      if (!revenueBreakdown[pType]) {
        revenueBreakdown[pType] = { type: pType, amount: 0, tax: 0, count: 0 };
      }
      revenueBreakdown[pType].amount += (Number(r.amount) || 0);
      revenueBreakdown[pType].tax += (Number(r.taxAmount) || 0);
      revenueBreakdown[pType].count += 1;
    });

    const expenseBreakdown: Record<string, { category: string; amount: number; tax: number; count: number }> = {};
    filteredExpenses.forEach(e => {
      const cat = e.category || 'other';
      if (!expenseBreakdown[cat]) {
        expenseBreakdown[cat] = { category: cat, amount: 0, tax: 0, count: 0 };
      }
      expenseBreakdown[cat].amount += (Number(e.amount) || 0);
      expenseBreakdown[cat].tax += (Number(e.taxAmount) || 0);
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

  const monthlyData = React.useMemo(() => {
    const data: Record<string, { month: string; revenue: number; expense: number; budget: number }> = {};
    
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
      try {
        const m = format(parseISO(r.date), 'yyyy-MM');
        if (data[m]) data[m].revenue += (Number(r.amount) || 0);
      } catch (e) {}
    });

    expenses.forEach(e => {
      if (!e.date) return;
      try {
        const m = format(parseISO(e.date), 'yyyy-MM');
        if (data[m]) data[m].expense += (Number(e.amount) || 0);
      } catch (e) {}
    });

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

  // Code-split dynamic export using async import()
  const exportReport = async (formatType: 'pdf' | 'png') => {
    if (!reportsRef.current || isExporting) return;
    setIsExporting(true);
    const element = reportsRef.current;
    
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
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
        link.download = `تقرير_حياة_المالي_${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = canvas.toDataURL();
        link.click();
      } else {
        const { default: jsPDF } = await import('jspdf');
        const pdf = new jsPDF('l', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`تقرير_حياة_المالي_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      }
    } catch (err) {
      console.error("Export failure:", err);
    } finally {
      setIsExporting(false);
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
          <p className="text-slate-600 text-sm font-bold">تحليل دقيق للأداء المالي، الاستهلاك، وقائمة الأرباح والخسائر المباشرة</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-2xl shadow-hayat border border-hayat-border/40 overflow-x-auto w-full md:w-auto">
          <button 
            onClick={() => setViewMode('pl')}
            className={`px-5 py-2.5 rounded-xl text-xs whitespace-nowrap font-bold transition-all cursor-pointer ${
              viewMode === 'pl' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            قائمة الأرباح والخسائر
          </button>
          <button 
            onClick={() => setViewMode('chart')}
            className={`px-5 py-2.5 rounded-xl text-xs whitespace-nowrap font-bold transition-all cursor-pointer ${
              viewMode === 'chart' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            الاتجاهات والرسوم البيانية
          </button>
          <button 
            onClick={() => setViewMode('table')}
            className={`px-5 py-2.5 rounded-xl text-xs whitespace-nowrap font-bold transition-all cursor-pointer ${
              viewMode === 'table' ? 'bg-hayat-navy text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            الجداول الشهرية
          </button>
        </div>
      </div>

      {/* Date Filter panel */}
      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-hayat-border/50 shadow-hayat flex flex-col md:flex-row justify-between items-stretch md:items-center gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <Calendar className="text-hayat-wood w-5 h-5 flex-shrink-0" />
            <h3 className="text-sm font-bold text-hayat-navy">فلترة مخصصة للفترة الزمنية</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-600">الفترة من</span>
              <input 
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-hayat-accent/40 border border-hayat-border/30 px-4 py-2.5 rounded-xl text-sm font-bold text-hayat-navy outline-none focus:border-hayat-navy transition-colors text-right"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-600">الفترة إلى</span>
              <input 
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-hayat-accent/40 border border-hayat-border/30 px-4 py-2.5 rounded-xl text-sm font-bold text-hayat-navy outline-none focus:border-hayat-navy transition-colors text-right"
              />
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-col justify-end gap-2 px-1 border-t md:border-t-0 md:border-r border-hayat-border/30 pt-4 md:pt-0 md:pr-6 md:min-w-[180px]">
          <span className="text-xs font-bold text-slate-600 block mb-1">فترات سريعة</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button 
              onClick={presetThisMonth}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              هذا الشهر
            </button>
            <button 
              onClick={presetThisQuarter}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              هذا الربع
            </button>
            <button 
              onClick={presetThisYear}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              هذه السنة
            </button>
            <button 
              onClick={presetAllTime}
              className="px-3 py-2 bg-slate-50 hover:bg-hayat-accent border border-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              كل الأوقات
            </button>
          </div>
        </div>
      </div>

      <div id="reports-content" ref={reportsRef} className="card-hayat bg-white space-y-12 min-h-[400px] p-8 sm:p-12">
        {monthlyData.length === 0 && viewMode !== 'pl' ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-hayat-accent/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileBarChart size={32} className="text-hayat-navy/40" />
            </div>
            <h3 className="text-xl font-bold text-hayat-navy mb-2">لا توجد بيانات كافية للتقارير</h3>
            <p className="text-slate-600 text-sm max-w-xs mx-auto">أضف بعض المبيعات والمصاريف ليتمكن النظام من تحليل بياناتك وعرض التقارير الشهرية للفترة المحددة.</p>
            <button 
              onClick={() => setActiveTab('revenues')}
              className="mt-8 px-6 py-3 bg-hayat-navy text-white rounded-xl font-bold text-xs shadow-hayat hover:scale-105 transition-transform cursor-pointer"
            >
              إضافة مبيعات الآن
            </button>
          </div>
        ) : viewMode === 'pl' ? (
          <div className="w-full space-y-10" dir="rtl">
            {/* Header */}
            <div className="border-b border-hayat-border/60 pb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1.5 md:text-right">
                <h3 className="font-serif text-3xl font-black text-hayat-navy tracking-tight">{settings.storeName}</h3>
                <p className="text-xs text-slate-600 font-bold">قائمة الأرباح والخسائر الموحدة</p>
                <p className="text-sm text-slate-600 font-bold">
                  كشف الحسابات للفترة: <span className="font-serif text-hayat-wood font-extrabold">{dateFrom ? safeFormat(dateFrom, 'yyyy/MM/dd') : 'أول معاملة'}</span> م — إلى: <span className="font-serif text-hayat-wood font-extrabold">{dateTo ? safeFormat(dateTo, 'yyyy/MM/dd') : 'اليوم'}</span> م
                </p>
              </div>
              
              <div className="bg-hayat-accent/30 border border-hayat-border/30 rounded-2xl p-4 text-left">
                <span className="text-xs font-bold text-slate-600 block mb-1">المطابقة والنظام</span>
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-sm font-bold text-hayat-navy">معتمدة ومحدثة</span>
                </div>
                {settings.isTaxRegistered && <span className="text-xs font-bold text-slate-600 block mt-1">الرقم الضريبي: {settings.taxNumber}</span>}
              </div>
            </div>

            {/* Financial Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 bg-emerald-50/50 border border-emerald-100 rounded-3xl text-right space-y-2">
                <span className="text-xs font-bold text-emerald-700 block">إجمالي المقبوضات/المبيعات</span>
                <p className="text-2xl font-serif font-black text-emerald-800 tabular-nums">
                  {plData.totalRevenue.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className="text-xs text-slate-600 block font-bold">{plData.revenuesCount} طلب مالي للعملاء</span>
              </div>

              <div className="p-6 bg-rose-50/50 border border-rose-100 rounded-3xl text-right space-y-2">
                <span className="text-xs font-bold text-rose-700 block">إجمالي النفقات/المصاريف</span>
                <p className="text-2xl font-serif font-black text-rose-800 tabular-nums">
                  {plData.totalExpenses.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className="text-xs text-slate-600 block font-bold">{plData.expensesCount} سند مالي مصروف</span>
              </div>

              <div className="p-6 bg-amber-50/40 border border-amber-100/60 rounded-3xl text-right space-y-2">
                <span className="text-xs font-bold text-amber-800 block">هدر المواد والتصنيع</span>
                <p className="text-2xl font-serif font-black text-amber-800 tabular-nums">
                  {plData.totalWaste.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className="text-xs text-slate-600 block font-bold">{plData.wasteCount} تالف مواد / عيوب مصنعية</span>
              </div>

              <div className={`p-6 border rounded-3xl text-right space-y-2 ${plData.netProfit >= 0 ? 'bg-purple-50/70 border-purple-100' : 'bg-red-50 border-red-200'}`}>
                <span className="text-xs font-bold block" style={{ color: plData.netProfit >= 0 ? navyColor : '#B91C1C' }}>صافي الأرباح بالفترة</span>
                <p className="text-2xl font-serif font-black tabular-nums" style={{ color: plData.netProfit >= 0 ? navyColor : '#911F1F' }}>
                  {plData.netProfit.toLocaleString()} <span className="text-xs font-sans">ريال</span>
                </p>
                <span className={`text-xs block font-bold ${plData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  هامش مبيعات ناصع {Math.round(plData.netMargin)}%
                </span>
              </div>
            </div>

            {/* Split Account Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-4">
              {/* OPERATING REVENUES breakdown */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b-2 border-emerald-400 pb-3">
                  <span className="text-sm font-bold text-emerald-900">1. الإيرادات التشغيلية المباشرة</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">التدفقات النقدية الواردة</span>
                </div>
                
                <div className="divide-y divide-slate-100 text-sm font-bold text-slate-700">
                  {['acrylic', 'wood', 'svg', 'other'].map(pType => {
                    const item = plData.revenueBreakdown.find(b => b.type === pType) || { amount: 0, count: 0, tax: 0 };
                    const pct = plData.totalRevenue > 0 ? (item.amount / plData.totalRevenue) * 100 : 0;
                    return (
                      <div key={pType} className="flex justify-between items-center py-3.5">
                        <div className="space-y-1">
                          <span className="text-slate-800 text-sm block">{translateProduct(pType)}</span>
                          <span className="text-xs text-slate-500 block font-normal">{item.count} طلب شراء</span>
                        </div>
                        <div className="text-left font-serif">
                          <p className="text-slate-800 text-sm tabular-nums font-bold">{item.amount.toLocaleString()} ريال</p>
                          <p className="text-xs text-slate-500 font-sans font-medium">{Math.round(pct)}% من المقبوضات</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center text-sm font-bold text-slate-800 border border-slate-100/80">
                  <span>إجمالي مبيعات وإيرادات الفترة</span>
                  <span className="font-serif text-base font-bold text-emerald-700">{plData.totalRevenue.toLocaleString()} ريال</span>
                </div>
              </div>

              {/* OPERATING EXPENSES breakdown */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b-2 border-rose-300 pb-3">
                  <span className="text-sm font-bold text-rose-800">2. مصروفات وتكاليف الإنتاج والتشغيل</span>
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">التدفقات النقدية الصادرة</span>
                </div>
                
                <div className="divide-y divide-slate-100 text-sm font-bold text-slate-700">
                  {['materials', 'marketing', 'maintenance', 'wages', 'other'].map(cat => {
                    const item = plData.expenseBreakdown.find(b => b.category === cat) || { amount: 0, count: 0, tax: 0 };
                    const pct = plData.totalExpenses > 0 ? (item.amount / plData.totalExpenses) * 100 : 0;
                    return (
                      <div key={cat} className="flex justify-between items-center py-3.5">
                        <div className="space-y-1">
                          <span className="text-slate-800 text-sm block">{translateCategory(cat)}</span>
                          <span className="text-xs text-slate-500 block font-normal">{item.count} فاتورة مصروف</span>
                        </div>
                        <div className="text-left font-serif">
                          <p className="text-slate-800 text-sm tabular-nums font-bold">{item.amount.toLocaleString()} ريال</p>
                          <p className="text-xs text-slate-500 font-sans font-medium">{Math.round(pct)}% من النفقات</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center text-sm font-bold text-slate-800 border border-slate-100/80">
                  <span>إجمالي مصروفات ونفقات الفترة</span>
                  <span className="font-serif text-base font-bold text-rose-700">{plData.totalExpenses.toLocaleString()} ريال</span>
                </div>
              </div>
            </div>

            {/* Waste and VAT adjustments */}
            <div className="border-t border-dashed border-hayat-border/60 pt-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm font-bold text-slate-700">
              <div className="bg-amber-50/20 border border-amber-200/40 p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-bold text-sm">3. خسائر الهدر المالي الممتص بالفترة</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                  تنتج مبالغ الهدر جراء تلف خامات الأكريليك، أخطاء القياسات أو الخسائر الفنية للقطع المعيبة، ويتم اقتطاعها وتصنيفها كـ كلفة خسارة تامة بالفترة.
                </p>
                <div className="flex justify-between items-center pt-2 font-serif text-amber-950 font-bold border-t border-amber-100/50">
                  <span>القيمة الكلية للهدر والخسارة</span>
                  <span className="text-sm">{plData.totalWaste.toLocaleString()} ريال</span>
                </div>
              </div>

              {settings.isTaxRegistered && (
                <div className="bg-hayat-accent/20 border border-hayat-border/30 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-hayat-navy">
                    <Receipt className="w-5 h-5" />
                    <span className="font-bold text-sm">4. تسويات ضريبة القيمة المضافة</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-bold">الضريبة المخرجة (المحصلة من العملاء)</span>
                      <span className="font-serif tabular-nums text-emerald-700 font-bold">+{plData.totalRevenueTax.toLocaleString()} ريال</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-bold">الضريبة المدخلة (المدفوعة للموردين)</span>
                      <span className="font-serif tabular-nums text-rose-700 font-bold">-{plData.totalExpenseTax.toLocaleString()} ريال</span>
                    </div>
                    <div className="flex justify-between pt-1 font-bold text-hayat-navy border-t border-slate-100">
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
                  <span className="text-xs font-bold tracking-widest text-emerald-300 block mb-1">صافي نتيجة الأعمال للفترة</span>
                  <h4 className="text-lg font-bold font-serif">نتيجة الأرباح أو الخسائر الصافية للفترة المحددة</h4>
                </div>
                
                <div className="text-center md:text-left font-serif">
                  <p className="text-4xl font-black text-emerald-300 tabular-nums leading-none">
                    {plData.netProfit.toLocaleString()} <span className="text-base font-sans font-bold">ريال</span>
                  </p>
                  <p className="text-xs text-white/90 mt-2 font-sans font-bold">
                    صافي هامش مبيعاتك: <span className="text-emerald-300 font-bold">{Math.round(plData.netMargin)}%</span> • معامل هدر الإيراد: <span className="text-purple-200 font-bold">{Math.round(plData.wasteRatio)}%</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-4 text-center pt-12 border-t border-dashed border-hayat-border/40 select-none">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-6">إعداد المحاسب المالي</p>
                <div className="w-32 h-px bg-slate-300 mx-auto"></div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 mb-6">اعتماد الإدارة المكلّفة</p>
                <div className="w-32 h-px bg-slate-300 mx-auto"></div>
              </div>
            </div>
          </div>
        ) : viewMode === 'chart' ? (
          <div className="w-full space-y-10">
            <div className="flex justify-between items-center bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
               <h4 className="text-sm font-bold text-hayat-navy">تحليل المبيعات والمصاريف الشهرية</h4>
               <div className="flex gap-2">
                  <button 
                    onClick={() => setChartType('bar')}
                    className={`p-2 rounded-lg transition-all cursor-pointer ${chartType === 'bar' ? 'bg-purple-900 text-white shadow-sm' : 'bg-white text-slate-500'}`}
                  >
                    <LayoutDashboard size={16} />
                  </button>
                  <button 
                    onClick={() => setChartType('line')}
                    className={`p-2 rounded-lg transition-all cursor-pointer ${chartType === 'line' ? 'bg-purple-900 text-white shadow-sm' : 'bg-white text-slate-500'}`}
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
                    <XAxis dataKey="formattedMonth" fontSize={13} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={13} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e0e7ff', boxShadow: '0 10px 15px -3px rgba(91,33,182,0.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '13px' }} />
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
                    <XAxis dataKey="formattedMonth" fontSize={13} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={13} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e0e7ff', boxShadow: '0 10px 15px -3px rgba(91,33,182,0.05)' }} />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '13px' }} />
                    <Area type="monotone" name="المبيعات" dataKey="revenue" stroke="#059669" strokeWidth={3} fill="url(#revenueGrad)" />
                    <Area type="monotone" name="المصاريف" dataKey="expense" stroke="#E11D48" strokeWidth={3} fill="url(#expenseGrad)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-indigo-100/60">
               <div>
                  <h5 className="text-xs font-bold text-slate-600 mb-4">تحليل هامش الربح الشهري</h5>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="formattedMonth" hide />
                          <YAxis fontSize={12} fontWeight={700} tick={{ fill: '#475569' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                          <Line type="monotone" name="هامش الربح %" dataKey="margin" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669' }} />
                       </LineChart>
                    </ResponsiveContainer>
                  </div>
               </div>
               <div className="flex flex-col justify-center bg-hayat-accent/10 p-8 rounded-[2rem] border border-hayat-border/20">
                  <h5 className="text-xs font-bold text-slate-600 mb-4">ملخص الأداء المتراكم</h5>
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">متوسط الربح الشهري</span>
                        <span className="text-lg font-serif font-bold text-hayat-navy">
                           {monthlyData.length > 0 ? (monthlyData.reduce((acc, curr) => acc + curr.profit, 0) / monthlyData.length).toLocaleString() : 0} <span className="text-xs font-sans">ريال</span>
                        </span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">أعلى شهر مبيعات</span>
                        <span className="text-lg font-serif font-bold text-emerald-600">
                           {monthlyData.length > 0 ? Math.max(...monthlyData.map(d => d.revenue)).toLocaleString() : 0} <span className="text-xs font-sans">ريال</span>
                        </span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-600">متوسط المصاريف</span>
                        <span className="text-lg font-serif font-bold text-rose-600">
                           {monthlyData.length > 0 ? (monthlyData.reduce((acc, curr) => acc + curr.expense, 0) / monthlyData.length).toLocaleString() : 0} <span className="text-xs font-sans">ريال</span>
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
                <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-600 text-xs font-bold">
                  <th className="py-5 px-8">الشهر</th>
                  <th className="py-5 px-8">المبيعات</th>
                  <th className="py-5 px-8">المصاريف</th>
                  <th className="py-5 px-8">الربح الصافي</th>
                  <th className="py-5 px-8 text-left">هامش الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hayat-border/30 text-sm">
                {monthlyData.slice().reverse().map((data) => (
                  <tr key={data.month} className="hover:bg-hayat-accent/40 transition-colors">
                    <td className="py-5 px-8">
                       <span className="font-bold text-hayat-navy">{format(parseISO(`${data.month}-01`), 'MMMM yyyy', { locale: arSA })}</span>
                    </td>
                    <td className="py-5 px-8 font-bold text-emerald-600 tabular-nums">
                       {data.revenue.toLocaleString()} <span className="text-xs font-sans opacity-70">ريال</span>
                    </td>
                    <td className="py-5 px-8 font-bold text-rose-600 tabular-nums">
                       {data.expense.toLocaleString()} <span className="text-xs font-sans opacity-70">ريال</span>
                    </td>
                    <td className="py-5 px-8 font-serif font-bold text-hayat-navy text-base tabular-nums">
                       {data.profit.toLocaleString()} <span className="text-xs font-sans opacity-70">ريال</span>
                    </td>
                    <td className="py-5 px-8 text-left">
                       <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${data.margin >= 30 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
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
          disabled={isExporting}
          className="btn-secondary flex items-center gap-2 font-bold cursor-pointer transition-transform hover:scale-102 disabled:opacity-50"
        >
          {isExporting ? 'جاري التصدير...' : 'تصدير كـ PDF'}
        </button>
        <button 
          onClick={() => exportReport('png')}
          disabled={isExporting}
          className="btn-primary flex items-center gap-2 font-bold cursor-pointer transition-transform hover:scale-102 disabled:opacity-50"
        >
          {isExporting ? 'جاري التحميل...' : 'تنزيل كصورة'}
        </button>
      </div>
    </motion.div>
  );
}

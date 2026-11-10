import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from 'recharts';
import { format } from 'date-fns';
import { BudgetTarget, Expense, Category } from '../types';
import { TrendingUp, AlertTriangle, CheckCircle, Calendar, DollarSign } from 'lucide-react';

interface BudgetComparisonProps {
  budgets: BudgetTarget[];
  expenses: Expense[];
  settings: any;
}

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

export default function BudgetComparisonChart({ budgets, expenses, settings }: BudgetComparisonProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const categories: Category[] = ['materials', 'marketing', 'maintenance', 'wages', 'other'];

  const comparisonData = useMemo(() => {
    return categories.map(cat => {
      // Find budget for this category and month
      const budgetItems = budgets.filter(b => b.category === cat && b.month === selectedMonth);
      const targetAmount = budgetItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

      // Find expenses for this category and month
      const expenseItems = expenses.filter(e => {
        if (!e.date) return false;
        const eMonth = e.date.substring(0, 7);
        return e.category === cat && eMonth === selectedMonth;
      });
      const actualAmount = expenseItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

      const diff = targetAmount - actualAmount;
      const isUnder = actualAmount <= targetAmount;
      const percent = targetAmount > 0 ? Math.round((actualAmount / targetAmount) * 100) : (actualAmount > 0 ? 100 : 0);

      return {
        category: cat,
        name: translateCategory(cat),
        target: targetAmount,
        actual: actualAmount,
        difference: diff,
        isUnder,
        percent
      };
    });
  }, [budgets, expenses, selectedMonth]);

  const totalTarget = comparisonData.reduce((acc, curr) => acc + curr.target, 0);
  const totalActual = comparisonData.reduce((acc, curr) => acc + curr.actual, 0);
  const totalDiff = totalTarget - totalActual;
  const isOverallUnder = totalActual <= totalTarget;

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-indigo-50 shadow-hayat space-y-8 mb-8">
      {/* Header and Month Picker */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-indigo-50">
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">
            مقارنة الميزانية بالمصروف الفعلي
          </h3>
          <p className="text-xs text-slate-600 font-semibold">
            رسم بياني يقارن الميزانية التقديرية بالنفقات الفعلية لكل بند، وتوضيح الفرق بالأخضر (وفر) أو الأحمر (تجاوز)
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl px-3 py-1.5 self-stretch sm:self-auto">
          <Calendar size={16} className="text-purple-700" />
          <span className="text-xs font-bold text-slate-700">الشهر:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-sm font-bold text-slate-900 outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-100/60">
          <p className="text-xs text-slate-600 font-bold mb-1">إجمالي الميزانية المحددة</p>
          <p className="text-2xl font-bold text-purple-950 tabular-nums">
            {totalTarget.toLocaleString()} <span className="text-xs font-normal text-slate-500">ريال</span>
          </p>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60">
          <p className="text-xs text-slate-600 font-bold mb-1">إجمالي المصروف الفعلي</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {totalActual.toLocaleString()} <span className="text-xs font-normal text-slate-500">ريال</span>
          </p>
        </div>

        <div className={`rounded-2xl p-4 border ${
          isOverallUnder 
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
            : 'bg-rose-50/70 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-700">صافي الفرق العام</span>
            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
              isOverallUnder ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {isOverallUnder ? 'وفر في الميزانية ✓' : 'تجاوز للميزانية ⚠️'}
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {isOverallUnder ? '+' : ''}{totalDiff.toLocaleString()} <span className="text-xs font-normal opacity-75">ريال</span>
          </p>
        </div>
      </div>

      {/* Interactive Bar Chart */}
      <div className="h-80 w-full pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparisonData} barGap={10} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis 
              dataKey="name" 
              fontSize={14} 
              fontWeight={700} 
              tick={{ fill: '#334155' }} 
              axisLine={false} 
              tickLine={false} 
              dy={10} 
            />
            <YAxis 
              fontSize={13} 
              fontWeight={700} 
              tick={{ fill: '#475569' }} 
              axisLine={false} 
              tickLine={false} 
              dx={-10} 
            />
            <Tooltip
              cursor={{ fill: '#F5F3FF' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0]?.payload;
                if (!data) return null;
                return (
                  <div className="bg-white p-4 rounded-2xl shadow-xl border border-indigo-100 text-right min-w-[220px]">
                    <p className="font-bold text-slate-900 text-base mb-2 border-b border-slate-100 pb-1.5">{data.name}</p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-purple-900 font-bold">
                        <span>الميزانية المحددة:</span>
                        <span className="tabular-nums">{data.target.toLocaleString()} ريال</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 font-bold">
                        <span>المصروف الفعلي:</span>
                        <span className="tabular-nums">{data.actual.toLocaleString()} ريال</span>
                      </div>
                      <div className={`flex justify-between items-center font-black pt-1.5 border-t border-slate-100 ${
                        data.isUnder ? 'text-emerald-700' : 'text-rose-600'
                      }`}>
                        <span>{data.isUnder ? 'الوفر (تحت الميزانية):' : 'التجاوز (فوق الميزانية):'}</span>
                        <span className="tabular-nums">{data.isUnder ? '+' : ''}{data.difference.toLocaleString()} ريال</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Legend 
              verticalAlign="top" 
              align="left"
              wrapperStyle={{ paddingBottom: '20px', fontWeight: 'bold', fontSize: '13px' }}
            />
            <Bar 
              name="الميزانية المحددة" 
              dataKey="target" 
              fill="#C4B5FD" 
              radius={[6, 6, 0, 0]} 
              barSize={28}
            />
            <Bar 
              name="المصروف الفعلي" 
              dataKey="actual" 
              radius={[6, 6, 0, 0]} 
              barSize={28}
            >
              {comparisonData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.isUnder ? '#059669' : '#E11D48'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Cards for each Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-indigo-50">
        {comparisonData.map((item) => (
          <div 
            key={item.category} 
            className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-200 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-slate-800">{item.name}</span>
                <span className={`text-xs font-black px-2.5 py-1 rounded-xl tabular-nums ${
                  item.isUnder 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {item.isUnder ? `وفر: +${item.difference.toLocaleString()} ريال` : `تجاوز: -${Math.abs(item.difference).toLocaleString()} ريال`}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">الميزانية:</span>
                  <span className="font-bold text-slate-800 tabular-nums">{item.target.toLocaleString()} ريال</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">المصروف الفعلي:</span>
                  <span className="font-bold text-slate-800 tabular-nums">{item.actual.toLocaleString()} ريال</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    item.isUnder ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(item.percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 font-bold mt-1.5">
                <span>استهلاك الميزانية</span>
                <span className={`tabular-nums ${item.isUnder ? 'text-emerald-700' : 'text-rose-600 font-black'}`}>
                  {item.percent}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

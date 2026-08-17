import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Printer, 
  Download, 
  FileImage, 
  Eye, 
  FileText, 
  X, 
  Search, 
  Calendar, 
  Phone, 
  User as UserIcon,
  ShoppingBag,
  Building,
  Upload,
  Sparkles,
  Percent,
  Check,
  Edit,
  Share2,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  query,
  where,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { Invoice, InvoiceItem } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface InvoicesViewProps {
  invoices: Invoice[];
  user: any;
  services: any;
  settings: any;
}

// Custom getComputedStyle clean up helper to prevent oklch/oklab failures inside html2canvas
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

export default function InvoicesView({ invoices, user, services, settings }: InvoicesViewProps) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<Invoice | null>(null);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const nameMatch = inv.customerName?.toLowerCase().includes(search.toLowerCase()) || 
                        inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase());
      const dateMatch = dateFilter === '' ? true : inv.date === dateFilter;
      return nameMatch && dateMatch;
    }).sort((a, b) => {
      const aTime = a.createdAt?.seconds || (a.date ? new Date(a.date).getTime() / 1000 : Date.now() / 1000);
      const bTime = b.createdAt?.seconds || (b.date ? new Date(b.date).getTime() / 1000 : Date.now() / 1000);
      return bTime - aTime;
    });
  }, [invoices, search, dateFilter]);

  // Grand total of filtered invoices
  const filteredTotal = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  }, [filteredInvoices]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذه الفاتورة نهائياً؟')) return;
    try {
      const inv = invoices.find(i => i.id === id);
      
      if (user?.isLocalGuest) {
        const localInvoices = JSON.parse(localStorage.getItem('local_invoices') || '[]');
        const filtered = localInvoices.filter((i: any) => i.id !== id);
        localStorage.setItem('local_invoices', JSON.stringify(filtered));
        
        const localReves = JSON.parse(localStorage.getItem('local_revenues') || '[]');
        const filteredReves = localReves.filter((r: any) => r.invoiceId !== id && r.id !== inv?.revenueId);
        localStorage.setItem('local_revenues', JSON.stringify(filteredReves));
        
        window.dispatchEvent(new Event('localDataChanged'));
        return;
      }
      
      await deleteDoc(doc(services.db, 'invoices', id));
      
      if (inv?.revenueId) {
        try {
          await deleteDoc(doc(services.db, 'revenues', inv.revenueId));
        } catch (e) {}
      } else {
        const q = query(collection(services.db, 'revenues'), where('invoiceId', '==', id));
        const qSnap = await getDocs(q);
        for (const docItem of qSnap.docs) {
          try {
            await deleteDoc(doc(services.db, 'revenues', docItem.id));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Error deleting invoice: ', err);
    }
  };

  const handleOpenAddModal = () => {
    setSelectedInvoice(null);
    setShowAddEditModal(true);
  };

  const handleOpenEditModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowAddEditModal(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2.5rem] shadow-hayat-lg overflow-hidden border border-hayat-border/60"
    >
      {/* Header HUD */}
      <div className="bg-white p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-hayat-border/40">
        <div>
          <h2 className="text-2xl font-bold text-hayat-navy mb-1 tracking-tight">إدارة الفواتير والملفات</h2>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-hayat-wood flex-shrink-0"></span>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Invoicing Ledger & Generator</p>
          </div>
        </div>
        <button 
          onClick={handleOpenAddModal} 
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          <span>إنشاء فاتورة جديدة</span>
        </button>
      </div>

      {/* Advanced Filters */}
      <div className="bg-hayat-cream/40 px-10 py-6 border-b border-hayat-border/30 flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="ابحث باسم العميل أو رقم الفاتورة..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="w-full bg-white border border-hayat-border/60 outline-none px-4 pr-10 py-2.5 rounded-xl text-xs text-hayat-navy focus:border-hayat-navy transition-all" 
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">تاريخ الفاتورة:</span>
          <input 
            type="date" 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)} 
            className="bg-white border border-hayat-border/60 outline-none px-3 py-2 rounded-xl text-xs text-hayat-navy w-full sm:w-auto"
          />
        </div>
      </div>

      {/* Invoices List */}
      <div className="p-0 overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-400 text-[10px] uppercase tracking-[0.15em] font-black">
              <th className="py-6 px-10">رقم الفاتورة</th>
              <th className="py-6 px-10">العميل</th>
              <th className="py-6 px-10">التاريخ</th>
              <th className="py-6 px-10 text-left">المبلغ الإجمالي</th>
              <th className="py-6 px-10 w-44">العمليات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hayat-border/30">
            {filteredInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-hayat-accent/40 transition-colors group">
                <td className="py-6 px-10 min-w-[140px] font-mono text-xs font-bold text-slate-600">
                  {inv.invoiceNumber}
                </td>
                <td className="py-6 px-10 min-w-[200px]">
                  <div className="flex flex-col">
                    <span className="font-bold text-hayat-navy text-sm">{inv.customerName}</span>
                    {inv.customerPhone && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-sans">
                        <Phone size={10} />
                        {inv.customerPhone}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-6 px-10 text-xs text-slate-500 font-bold tabular-nums">
                  {inv.date}
                </td>
                <td className="py-6 px-10 text-left">
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-serif font-bold text-base bg-emerald-50 text-emerald-700">
                    {(inv.grandTotal || 0).toLocaleString()}
                    <span className="text-[9px] font-sans font-black opacity-60 uppercase">ريال</span>
                  </div>
                </td>
                <td className="py-6 px-10 text-left">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setShowPreviewModal(inv)}
                      title="عرض ومشاركة الفاتورة"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-hayat-navy hover:bg-hayat-accent transition-all"
                    >
                      <Eye size={15} />
                    </button>
                    <button 
                      onClick={() => handleOpenEditModal(inv)}
                      title="تعديل الفاتورة"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-hayat-wood hover:bg-hayat-accent transition-all"
                    >
                      <Edit size={15} />
                    </button>
                    <button 
                      onClick={() => handleDelete(inv.id)} 
                      title="حذف"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all focus:outline-none"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={5} className="py-20 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-hayat-accent rounded-full flex items-center justify-center text-slate-300 mb-4">
                      <FileText size={32} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">لا توجد فواتير مطابقة لخيارات التصفية</p>
                    <button 
                      onClick={handleOpenAddModal}
                      className="text-xs font-bold text-hayat-wood hover:underline mt-2"
                    >
                      أنشئ أول فاتورة الآن
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer statistics totals summary */}
      <div className="bg-hayat-accent/20 p-8 border-t border-hayat-border/40 flex justify-end">
        <div className="flex items-center gap-10">
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">إجمالي الفواتير الصادرة</p>
            <p className="text-xl font-bold text-hayat-navy">{filteredInvoices.length}</p>
          </div>
          <div className="w-px h-10 bg-hayat-border/40"></div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">المجموع الكلي للفواتير المصفاة</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-serif font-black text-hayat-navy">
                {filteredTotal.toLocaleString()}
              </p>
              <span className="text-[10px] font-bold text-slate-400">ريال</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Invoice Modal Component */}
      <AnimatePresence>
        {showAddEditModal && (
          <AddEditInvoiceModal 
            invoice={selectedInvoice}
            invoices={invoices}
            user={user}
            services={services}
            settings={settings}
            onClose={() => setShowAddEditModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Invoice Sharing Preview Modal Component */}
      <AnimatePresence>
        {showPreviewModal && (
          <InvoicePreviewModal 
            invoice={showPreviewModal}
            settings={settings}
            onClose={() => setShowPreviewModal(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ==========================================
   Add / Edit Invoice Modal Logic & UI
   ========================================== */
function AddEditInvoiceModal({ invoice, invoices = [], user, services, settings, onClose }: { invoice: Invoice | null, invoices?: Invoice[], user: any, services: any, settings: any, onClose: () => void }) {
  const isEdit = !!invoice;
  
  // Create auto serial numbers
  const generateInvoiceNumber = () => {
    const rNum = Math.floor(1000 + Math.random() * 9000);
    return `INV-${format(new Date(), 'yyyy')}-${rNum}`;
  };

  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber || generateInvoiceNumber());
  const [customerName, setCustomerName] = useState(invoice?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(invoice?.customerPhone || '');
  const [date, setDate] = useState(invoice?.date || format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(invoice?.dueDate || format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState(invoice?.notes || 'نشكركم لثقتكم بنا وبخدماتنا!');
  const [paymentMethod, setPaymentMethod] = useState<string>((invoice as any)?.paymentMethod || 'bank_transfer');
  const [primaryProductType, setPrimaryProductType] = useState<string>((invoice as any)?.primaryProductType || '');
  const [customPrimaryProductType, setCustomPrimaryProductType] = useState<string>('');
  
  // Logo customization state
  const [logoPreset, setLogoPreset] = useState(invoice?.logoPreset || 'default');
  const [customLogoBase64, setCustomLogoBase64] = useState(invoice?.customLogoBase64 || '');
  const [templatePreset, setTemplatePreset] = useState<string>(invoice?.templatePreset || 'classic');

  // Subtotal and tax items list
  const [items, setItems] = useState<InvoiceItem[]>(invoice?.items || [
    { id: '1', name: '', quantity: 1, price: 0, total: 0 }
  ]);
  const [taxRate, setTaxRate] = useState<number>(invoice?.taxRate !== undefined ? invoice.taxRate : (settings.isTaxRegistered ? settings.taxRate : 0));
  const [discount, setDiscount] = useState<number>(invoice?.discount || 0);

  // Helper to detect product type based on containing text
  const detectedType = useMemo(() => {
    for (const item of items) {
      const name = (item.name || '').toLowerCase();
      if (name.includes('أكريليك') || name.includes('acrylic')) return 'acrylic';
      if (name.includes('خشب') || name.includes('wood')) return 'wood';
      if (name.includes('svg') || name.includes('ملف') || name.includes('تصميم') || name.includes('شعار')) return 'svg';
    }
    return 'other';
  }, [items]);

  // Bulk Import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const handleProcessBulkImport = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    const importedItems: InvoiceItem[] = [];
    
    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;
      
      // Split by comma, tab, pipe, or semicolon
      const parts = cleanLine.split(/[,;\t|]+/);
      if (parts.length > 0) {
        const name = parts[0].trim();
        if (!name) return;
        
        let quantity = 1;
        let price = 0;
        
        if (parts.length === 2) {
          // Name, Price
          const num = parseFloat(parts[1].replace(/[^\d.]/g, ''));
          price = isNaN(num) ? 0 : num;
        } else if (parts.length >= 3) {
          // Name, Qty, Price
          const qStr = parts[1].replace(/[^\d.]/g, '');
          const pStr = parts[2].replace(/[^\d.]/g, '');
          const q = parseInt(qStr, 10);
          const p = parseFloat(pStr);
          quantity = isNaN(q) || q <= 0 ? 1 : q;
          price = isNaN(p) ? 0 : p;
        }
        
        importedItems.push({
          id: `imported-${Date.now()}-${idx}-${Math.random()}`,
          name,
          quantity,
          price,
          total: quantity * price
        });
      }
    });
    
    if (importedItems.length > 0) {
      // If the only item is empty, replace it; otherwise append
      const finalItems = (items.length === 1 && items[0].name.trim() === '' && items[0].price === 0)
        ? importedItems
        : [...items, ...importedItems];
      setItems(finalItems);
      setBulkText('');
      setShowBulkImport(false);
      alert(`تم بنجاح استيراد ${importedItems.length} بند/صنف بنجاح!`);
    } else {
      alert('لم نجد أي بنود صالحة بتنسيق: اسم الصنف, ثم الكمية, ثم السعر. يرجى مراجعة التنسيق.');
    }
  };

  // File reader for store logo
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800000) {
        alert('حجم الصورة كبير جداً! يرجى اختيار صورة أصغر من 800 كيلوبايت للتخزين السحابي السريع.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomLogoBase64(reader.result as string);
        setLogoPreset('custom');
      };
      reader.readAsDataURL(file);
    }
  };

  // Add / Edit Row operations inside the dynamic invoice sheet
  const handleAddItemRow = () => {
    const newId = (items.length + 1).toString();
    setItems([...items, { id: newId, name: '', quantity: 1, price: 0, total: 0 }]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItemField = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Recalculate row total
        if (field === 'price' || field === 'quantity') {
          const q = field === 'quantity' ? Number(value) : item.quantity;
          const p = field === 'price' ? Number(value) : item.price;
          updated.total = q * p;
        }
        return updated;
      }
      return item;
    }));
  };

  // Live calculation metrics
  const calculatedSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [items]);

  const calculatedTaxAmount = useMemo(() => {
    if (!settings.isTaxRegistered) return 0;
    const subAfterDiscount = calculatedSubtotal - discount;
    return Math.max(0, parseFloat(((subAfterDiscount * taxRate) / 100).toFixed(2)));
  }, [calculatedSubtotal, taxRate, discount, settings.isTaxRegistered]);

  const calculatedGrandTotal = useMemo(() => {
    const subAfterDiscount = calculatedSubtotal - discount;
    return Math.max(0, subAfterDiscount + (settings.isTaxRegistered ? calculatedTaxAmount : 0));
  }, [calculatedSubtotal, discount, calculatedTaxAmount, settings.isTaxRegistered]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('يرجى تعبئة اسم العميل');
      return;
    }
    // Filter empty items
    const filledItems = items.filter(item => item.name.trim() !== '');
    if (filledItems.length === 0) {
      alert('يرجى إضافة صنف/منتج واحد على الأقل مع تحديد اسم الصنف وسعره.');
      return;
    }

    const effectivePrimaryType = primaryProductType === 'custom'
      ? (customPrimaryProductType.trim() || 'أخرى')
      : (primaryProductType || detectedType);

    const finalProductType = effectivePrimaryType;

    // Check duplicate invoice when creating new invoice
    if (!isEdit && invoices) {
      const duplicateInvoice = invoices.find(inv => {
        if (invoiceNumber && inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()) {
          return true;
        }
        const sameCustomer = (inv.customerName || '').trim().toLowerCase() === customerName.trim().toLowerCase();
        const sameDate = inv.date === date;
        const sameTotal = Math.abs((inv.grandTotal || 0) - (calculatedGrandTotal || 0)) < 0.01;
        return sameCustomer && sameDate && sameTotal;
      });

      if (duplicateInvoice) {
        alert(`⚠️ تنبيه: تم رصد فاتورة مكررة مسجلة مسبقاً بنفس رقم الفاتورة أو نفس العميل والتاريخ والقيمة (${duplicateInvoice.invoiceNumber || duplicateInvoice.customerName})! لم يتم ترحيل أو حفظ الفاتورة لتفادي تكرار المبيعات.`);
        return;
      }
    }

    const payload: any = {
      userId: user?.uid || '',
      invoiceNumber: invoiceNumber || '',
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      date: date || '',
      dueDate: dueDate || '',
      notes: notes || '',
      logoPreset: logoPreset || 'default',
      customLogoBase64: customLogoBase64 || '',
      items: filledItems,
      subtotal: Number(calculatedSubtotal) || 0,
      taxRate: settings.isTaxRegistered ? (Number(taxRate) || 0) : 0,
      taxAmount: settings.isTaxRegistered ? (Number(calculatedTaxAmount) || 0) : 0,
      discount: Number(discount) || 0,
      grandTotal: settings.isTaxRegistered ? (Number(calculatedGrandTotal) || 0) : (Number(calculatedSubtotal) - Number(discount)),
      paymentMethod: paymentMethod,
      primaryProductType: finalProductType,
      templatePreset: templatePreset,
      updatedAt: serverTimestamp()
    };

    if (!isEdit) {
      payload.createdAt = serverTimestamp();
    }

    try {
      if (user?.isLocalGuest) {
        const localInvoices = JSON.parse(localStorage.getItem('local_invoices') || '[]');
        const localRevenues = JSON.parse(localStorage.getItem('local_revenues') || '[]');
        const localPayload = { ...payload };
        localPayload.updatedAt = { seconds: Date.now() / 1000, nanoseconds: 0 };
        
        if (isEdit && invoice) {
          const index = localInvoices.findIndex((i: any) => i.id === invoice.id);
          const existingInv = index !== -1 ? localInvoices[index] : null;
          const revId = existingInv?.revenueId || invoice.revenueId;
          
          localPayload.revenueId = revId;
          
          if (index !== -1) {
            localInvoices[index] = { ...localInvoices[index], ...localPayload };
          }
          localStorage.setItem('local_invoices', JSON.stringify(localInvoices));
          
          const revPayload = {
            id: revId || `local-revenue-${Date.now()}-${Math.random()}`,
            userId: user.uid,
            amount: localPayload.grandTotal,
            productType: finalProductType,
            orderNumber: localPayload.invoiceNumber,
            description: `فاتورة مبيعات رقم ${localPayload.invoiceNumber} للعميل ${localPayload.customerName}`,
            date: new Date(localPayload.date).toISOString(),
            paymentMethod: paymentMethod,
            taxAmount: localPayload.taxAmount || 0,
            invoiceId: invoice.id,
            createdAt: existingInv?.createdAt || { seconds: Date.now() / 1000, nanoseconds: 0 }
          };
          
          const revIndex = localRevenues.findIndex((r: any) => r.id === revId || r.invoiceId === invoice.id);
          if (revIndex !== -1) {
            localRevenues[revIndex] = { ...localRevenues[revIndex], ...revPayload };
          } else {
            localRevenues.push(revPayload);
          }
          localStorage.setItem('local_revenues', JSON.stringify(localRevenues));
          
          alert('تم تعديل الفاتورة وحفظ التغييرات وتحديث المبيعات بنجاح!');
        } else {
          const invId = `local-invoice-${Date.now()}-${Math.random()}`;
          const revId = `local-revenue-${Date.now()}-${Math.random()}`;
          
          localPayload.id = invId;
          localPayload.revenueId = revId;
          localPayload.createdAt = { seconds: Date.now() / 1000, nanoseconds: 0 };
          localInvoices.push(localPayload);
          localStorage.setItem('local_invoices', JSON.stringify(localInvoices));
          
          const revPayload = {
            id: revId,
            userId: user.uid,
            amount: localPayload.grandTotal,
            productType: finalProductType,
            orderNumber: localPayload.invoiceNumber,
            description: `فاتورة مبيعات رقم ${localPayload.invoiceNumber} للعميل ${localPayload.customerName}`,
            date: new Date(localPayload.date).toISOString(),
            paymentMethod: paymentMethod,
            taxAmount: localPayload.taxAmount || 0,
            invoiceId: invId,
            createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 }
          };
          localRevenues.push(revPayload);
          localStorage.setItem('local_revenues', JSON.stringify(localRevenues));
          
          alert('تم إنشاء الفاتورة وقيدها في المبيعات بنجاح!');
        }
        window.dispatchEvent(new Event('localDataChanged'));
        onClose();
        return;
      }

      if (isEdit && invoice) {
        const revId = invoice.revenueId;
        payload.revenueId = revId || null;
        
        await updateDoc(doc(services.db, 'invoices', invoice.id), payload);
        
        const revPayload: any = {
          amount: payload.grandTotal,
          productType: finalProductType,
          orderNumber: payload.invoiceNumber,
          description: `فاتورة مبيعات رقم ${payload.invoiceNumber} للعميل ${payload.customerName}`,
          date: new Date(payload.date || Date.now()).toISOString(),
          paymentMethod: paymentMethod,
          taxAmount: payload.taxAmount || 0,
          invoiceId: invoice.id,
          updatedAt: serverTimestamp()
        };
        
        if (revId) {
          try {
            await updateDoc(doc(services.db, 'revenues', revId), revPayload);
          } catch (e) {
            await setDoc(doc(services.db, 'revenues', revId), {
              ...revPayload,
              userId: user.uid,
              createdAt: serverTimestamp()
            });
          }
        } else {
          const q = query(collection(services.db, 'revenues'), where('invoiceId', '==', invoice.id));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            const existingRevId = qSnap.docs[0].id;
            await updateDoc(doc(services.db, 'revenues', existingRevId), revPayload);
            await updateDoc(doc(services.db, 'invoices', invoice.id), { revenueId: existingRevId });
          } else {
            const newRevRef = doc(collection(services.db, 'revenues'));
            await setDoc(newRevRef, {
              ...revPayload,
              userId: user.uid,
              createdAt: serverTimestamp()
            });
            await updateDoc(doc(services.db, 'invoices', invoice.id), { revenueId: newRevRef.id });
          }
        }
        
        alert('تم تعديل الفاتورة وتحديث المبيعات بنجاح!');
      } else {
        const newInvoiceRef = doc(collection(services.db, 'invoices'));
        const newInvoiceId = newInvoiceRef.id;
        
        const newRevenueRef = doc(collection(services.db, 'revenues'));
        const newRevenueId = newRevenueRef.id;
        
        payload.id = newInvoiceId;
        payload.revenueId = newRevenueId;
        payload.createdAt = serverTimestamp();
        
        await setDoc(newInvoiceRef, payload);
        
        const revPayload = {
          userId: user.uid,
          amount: payload.grandTotal,
          productType: finalProductType,
          orderNumber: payload.invoiceNumber,
          description: `فاتورة مبيعات رقم ${payload.invoiceNumber} للعميل ${payload.customerName}`,
          date: new Date(payload.date || Date.now()).toISOString(),
          paymentMethod: paymentMethod,
          taxAmount: payload.taxAmount || 0,
          invoiceId: newInvoiceId,
          createdAt: serverTimestamp()
        };
        await setDoc(newRevenueRef, revPayload);
        
        alert('تم إنشاء الفاتورة وقيدها في المبيعات بنجاح!');
      }
      onClose();
    } catch (err: any) {
      console.error('Error saving invoice: ', err);
      alert(`عذراً، فشل في حفظ الفاتورة. خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
      >
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Modal Header */}
          <div className="bg-slate-50 px-8 py-5 border-b border-slate-200/60 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-hayat-navy/5 text-hayat-navy">
                <FileText size={18} />
              </span>
              <h3 className="text-lg font-bold text-hayat-navy">
                {isEdit ? 'تعديل الفاتورة الصادرة' : 'إنشاء فاتورة جديدة'}
              </h3>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all border border-slate-200/50"
            >
              <X size={15} />
            </button>
          </div>

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin">
          {/* Metadata Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-400">رقم الفاتورة (تلقائي / مخصص)</label>
              <input 
                type="text" 
                value={invoiceNumber} 
                onChange={e => setInvoiceNumber(e.target.value)}
                className="bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-mono focus:border-hayat-navy outline-none"
                required
              />
            </div>
            
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400">اسم العميل بالكامل / الجهة المستلمة *</label>
              <div className="relative">
                <UserIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={customerName} 
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="أدخل اسم العميل أو اسم المؤسسة المستلمة"
                  className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 font-bold focus:border-hayat-navy outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-400">رقم هاتف العميل</label>
              <div className="relative">
                <Phone size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={customerPhone} 
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="05xxxxxxx"
                  className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 font-mono focus:border-hayat-navy outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-400">تاريخ الفاتورة</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-400">تاريخ الاستحقاق (اختياري)</label>
              <input 
                type="date" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            </div>

            {/* Custom Logo preset choice */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-400">تخصيص شعار في ترويسة الفاتورة</label>
              <div className="flex items-center gap-2">
                <select 
                  value={logoPreset}
                  onChange={e => setLogoPreset(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 flex-grow"
                >
                  <option value="default">شعار حياة النباتي الافتراضي</option>
                  <option value="luxury">أيقونة تاجر فاخرة (ذهبي)</option>
                  <option value="coffee">أيقونة مقهى وغذاء</option>
                  <option value="creative">أيقونة نجمة إبداعية</option>
                  <option value="custom">تحميل شعار مخصص (Upload)</option>
                  <option value="none">بدون شعار - ترويسة نصية فقط</option>
                </select>
                {logoPreset === 'custom' && (
                  <label className="bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer rounded-xl p-2 border border-slate-200">
                    <Upload size={14} />
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleLogoUpload} 
                      className="hidden" 
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Logo preview if customized */}
          {logoPreset === 'custom' && customLogoBase64 && (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 flex items-center gap-4">
              <img src={customLogoBase64} alt="Custom Logo Preview" className="h-10 w-10 object-contain rounded border bg-white" />
              <div>
                <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <Sparkles size={11} />
                  تم تحميل الشعار المخصص بنجاح وسيتم إدراجه بالفواتير
                </p>
                <p className="text-[9px] text-slate-400">سيظهر بشكل متناسق في ملف الـ PDF المطبوع والكروكي الصوري</p>
              </div>
            </div>
          )}

          {/* Invoice Template Customization Block */}
          <div className="bg-blue-50/30 border border-blue-100/50 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              قالب وتصميم الفاتورة المحدد
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500">اختر قالب التصميم الرسومي</label>
                <select 
                  value={templatePreset}
                  onChange={e => setTemplatePreset(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:border-blue-500 outline-none"
                >
                  <option value="classic">الكلاسيكي الرسمي (Classic Ruled)</option>
                  <option value="modern">الحديث المبسط (Modern Simple)</option>
                  <option value="compact">قالب الصفحة الواحدة المضغوط (Compact 1-Page - موفر للمساحة)</option>
                  <option value="luxury">الملكي الفاخر الذهبي (Luxury Gold)</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 justify-center">
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                  * اختر قالب <b className="text-blue-600">الصفحة الواحدة المضغوط (Compact)</b> للبنود الكثيرة لضمان احتواء الفاتورة بأكملها في ورقة واحدة A4 دون انقسام أو فراغات زائدة.
                </p>
              </div>
            </div>
          </div>

          {/* Sales Connection Fields (ارتباط المبيعات) */}
          <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              قيد المبيعات والربط المالي التلقائي
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500">طريقة الدفع المقبوضة لـ المبيعات</label>
                <select 
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:border-emerald-500 outline-none"
                >
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="mada">مدى (Mada)</option>
                  <option value="apple_pay">آبل باي (Apple Pay)</option>
                  <option value="cash">نقداً (Cash)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500">تصنيف المنتج لـ المبيعات</label>
                <div className="space-y-2">
                  <select 
                    value={primaryProductType}
                    onChange={e => setPrimaryProductType(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:border-emerald-500 outline-none"
                  >
                    <option value="">كشف تلقائي الذكي: ({
                      detectedType === 'acrylic' ? 'منتجات أكريليك' :
                      detectedType === 'wood' ? 'منتجات خشبية' :
                      detectedType === 'svg' ? 'ملفات رقمية (SVG)' : 'منتج آخر'
                    })</option>
                    <option value="acrylic">منتجات أكريليك</option>
                    <option value="wood">منتجات خشبية</option>
                    <option value="svg">ملفات رقمية (SVG)</option>
                    <option value="other">منتج آخر</option>
                    <option value="custom">✏️ كتابة نوع منتج مخصص...</option>
                  </select>
                  {primaryProductType === 'custom' && (
                    <input 
                      type="text" 
                      placeholder="اكتب نوع أو تصنيف المنتج المخصص..." 
                      value={customPrimaryProductType} 
                      onChange={e => setCustomPrimaryProductType(e.target.value)} 
                      className="w-full bg-amber-50/40 border border-amber-400 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none font-bold"
                      required
                      autoFocus
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Items Sheets Rows */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2 gap-2">
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">العناصر والبنود المفصلة للفاتورة (الأصناف)</h4>
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowBulkImport(!showBulkImport)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Sparkles size={12} />
                  <span>استيراد جماعي سريع (Excel/نصوص)</span>
                </button>
                <button 
                  type="button" 
                  onClick={handleAddItemRow}
                  className="text-xs font-bold text-hayat-wood hover:text-hayat-navy bg-hayat-accent hover:bg-hayat-accent/80 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  + إضافة صنف جديد
                </button>
                {items.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => {
                      if (window.confirm('هل أنت متأكد من مسح جميع بنود الفاتورة الحالية؟')) {
                        setItems([{ id: '1', name: '', quantity: 1, price: 0, total: 0 }]);
                      }
                    }}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline"
                  >
                    مسح الكل
                  </button>
                )}
              </div>
            </div>

            {/* Bulk Import Section */}
            {showBulkImport && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <h5 className="text-[11px] font-extrabold text-indigo-950">لوحة الاستيراد السريع للأصناف المتعددة</h5>
                  <span className="text-[10px] text-slate-400">انسخ والصق من ملف Excel أو اكتب سطر بسطر</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  أدخل كل صنف في سطر مستقل بالتنسيق التالي: <strong className="text-indigo-700">اسم الصنف, الكمية, السعر</strong><br />
                  مثال: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">طاولة طعام خشبية, 2, 450</code> أو <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">كوب زجاجي فاخر, 120</code> (في حال كتابة قيمتين سيتم اعتبار القيمة الثانية هي السعر والكمية 1 تلقائياً).
                </p>
                <textarea 
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder="طاولة قهوة مستديرة, 2, 850&#10;شمعة الصويا المعطرة, 5, 45&#10;ورق جدران كلاسيكي, 4, 180"
                  rows={4}
                  className="w-full bg-white border border-indigo-100 rounded-xl p-3 text-xs text-slate-800 outline-none focus:border-indigo-500 font-mono leading-relaxed"
                />
                <div className="flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setShowBulkImport(false)}
                    className="px-4 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 bg-white border border-slate-200"
                  >
                    إلغاء
                  </button>
                  <button 
                    type="button" 
                    onClick={handleProcessBulkImport}
                    className="px-5 py-1.5 rounded-lg text-[10px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-colors"
                  >
                    استيراد وإدراج الأصناف
                  </button>
                </div>
              </motion.div>
            )}

            <div className="space-y-3.5">
              {items.map((item, index) => (
                <div key={item.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50/40 p-4 rounded-2xl border border-slate-100">
                  <div className="flex-grow w-full">
                    <label className="text-[9px] font-bold text-slate-400 block mb-1">الصنف والمواصفات *</label>
                    <input 
                      type="text" 
                      value={item.name} 
                      onChange={e => handleUpdateItemField(item.id, 'name', e.target.value)}
                      placeholder="اسم المنتج أو الخدمة المقدمة تفصيلاً"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-hayat-navy"
                      required
                    />
                  </div>

                  <div className="w-full sm:w-24">
                    <label className="text-[9px] font-bold text-slate-400 block mb-1">الكمية</label>
                    <input 
                      type="number" 
                      min="1"
                      value={item.quantity} 
                      onChange={e => handleUpdateItemField(item.id, 'quantity', Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 text-center font-mono outline-none"
                      required
                    />
                  </div>

                  <div className="w-full sm:w-32">
                    <label className="text-[9px] font-bold text-slate-400 block mb-1">السعر الفردي / المبلغ (ريال) *</label>
                    <input 
                      type="number" 
                      min="0"
                      step="any"
                      value={item.price || ''} 
                      onChange={e => handleUpdateItemField(item.id, 'price', Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 text-center font-serif font-bold outline-none"
                      required
                    />
                  </div>

                  <div className="w-full sm:w-32 text-center text-xs font-bold text-slate-700 min-w-[100px]">
                    <span className="text-[9px] font-bold text-slate-400 block mb-1">المجموع الفرعي</span>
                    <span className="font-serif block py-2.5">
                      {((item.quantity || 0) * (item.price || 0)).toLocaleString()} <span className="text-[9px] font-sans opacity-60">ريال</span>
                    </span>
                  </div>

                  <button 
                    type="button" 
                    onClick={() => handleRemoveItemRow(item.id)}
                    disabled={items.length === 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-slate-300 hover:text-rose-500 border border-slate-100 shadow-sm mt-3.5 hover:bg-rose-50 disabled:opacity-45"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary calculations, Tax and Discounts parameters */}
          <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row justify-between gap-6 items-start">
            <div className="w-full md:w-1/2 flex flex-col gap-3">
              <label className="text-[10px] font-bold text-slate-400">ملاحظات الفاتورة والتزامات العميل</label>
              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="شروط الدفع أو الضمانات..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 outline-none focus:bg-white focus:border-hayat-navy transition-all"
              />
            </div>

            <div className="w-full md:w-1/3 bg-slate-50 rounded-2xl p-6 border border-slate-150 flex flex-col gap-4">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>المجموع الكلي المبدئي</span>
                <span className="font-serif font-bold">{calculatedSubtotal.toLocaleString()} ريال</span>
              </div>

              {/* Discount selection */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-200/50 pt-2.5">
                <span className="text-xs text-slate-500">معدل الخصم (ريال)</span>
                <input 
                  type="number" 
                  min="0"
                  max={calculatedSubtotal}
                  value={discount || ''}
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-24 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-center font-bold text-slate-700 outline-none"
                />
              </div>

              {/* VAT selection */}
              {settings.isTaxRegistered && (
                <div className="flex items-center justify-between gap-2 border-t border-slate-200/50 pt-2.5">
                  <span className="text-xs text-slate-500">ضريبة القيمة المضافة (%)</span>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={e => setTaxRate(Number(e.target.value))}
                    className="w-24 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-center font-bold text-slate-700 outline-none"
                  />
                </div>
              )}

              {settings.isTaxRegistered && taxRate > 0 && (
                <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-200/30 pt-1">
                  <span>قيمة الضريبة المحسوبة</span>
                  <span className="font-serif text-[11px] font-bold">+{calculatedTaxAmount.toLocaleString()} ريال</span>
                </div>
              )}

              <div className="flex justify-between items-center border-t border-slate-200 pt-3 text-hayat-navy">
                <span className="text-xs font-bold">المجموع النهائي الصافي</span>
                <span className="font-serif text-lg font-black">{calculatedGrandTotal.toLocaleString()} ريال</span>
              </div>
            </div>
          </div>

          </div>

          {/* Form Actions footer - Sticky */}
          <div className="flex justify-end gap-3 p-6 bg-slate-50 border-t border-slate-150/60 flex-shrink-0">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              إلغاء
            </button>
            <button 
              type="submit" 
              className="px-8 py-2.5 rounded-xl bg-hayat-navy text-white text-xs font-extrabold hover:bg-opacity-90 shadow-lg shadow-slate-200 transition-colors"
            >
              جاهز وحفظ الفاتورة
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ==========================================
   Invoice preview dialog, PDF and Image export
   ========================================== */
function InvoicePreviewModal({ invoice, settings, onClose }: { invoice: Invoice, settings: any, onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadingImg, setDownloadingImg] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // Choose templates dynamically inside preview
  const [selectedTemplate, setSelectedTemplate] = useState<string>(invoice.templatePreset || 'classic');
  const [fitToSinglePage, setFitToSinglePage] = useState<boolean>(true);

  // Auto logo preset rendering matching Saudi elegant guidelines
  const renderLogoForInvoice = () => {
    switch (invoice.logoPreset) {
      case 'luxury':
        return (
          <div className="h-11 w-11 rounded-full border-2 border-amber-400 bg-amber-500/10 flex items-center justify-center text-amber-500 flex-shrink-0">
            <Sparkles size={20} />
          </div>
        );
      case 'coffee':
        return (
          <div className="h-11 w-11 rounded-full border-2 border-amber-600 bg-amber-600/5 flex items-center justify-center text-amber-700 flex-shrink-0">
            <ShoppingBag size={18} />
          </div>
        );
      case 'creative':
        return (
          <div className="h-11 w-11 rounded-full border-2 border-indigo-400 bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0">
            <Sparkles size={18} />
          </div>
        );
      case 'custom':
        if (invoice.customLogoBase64) {
          return <img src={invoice.customLogoBase64} alt="Brand Logo" className="h-10 w-auto max-w-[120px] object-contain rounded bg-white flex-shrink-0" />;
        }
        break;
      case 'none':
        return null;
      default:
        // Elegant life/plant logo preset representing Hayat brand
        return (
          <div className="h-11 w-11 rounded-xl bg-hayat-navy flex items-center justify-center text-white shadow-md flex-shrink-0">
            <FileText size={20} />
          </div>
        );
    }
    return (
      <div className="h-11 w-11 rounded-xl bg-hayat-navy flex items-center justify-center text-white shadow-md flex-shrink-0">
        <FileText size={20} />
      </div>
    );
  };

  // Convert and export via jsPDF - auto-sliced pages for large rows
  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);

    try {
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready;
      }

      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution density
        useCORS: true,
        backgroundColor: '#FFFFFF',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
          
          // Inject custom styling to resolve Arabic shaping and letter-spacing bugs in html2canvas exports
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap');
            
            /* Reset letter-spacing globally inside PDF/Image print context to allow proper Arabic cursive linking */
            * {
              letter-spacing: 0px !important;
              letter-spacing: normal !important;
              text-rendering: optimizeLegibility !important;
              -webkit-font-smoothing: antialiased !important;
              font-feature-settings: "kern" 1, "liga" 1 !important;
            }
            
            /* Apply beautiful Arabic fonts for templates inside export canvas */
            .font-serif {
              font-family: 'Amiri', 'Cormorant Garamond', Georgia, serif !important;
            }
            
            body, .font-sans, html {
              font-family: 'Cairo', 'Inter', system-ui, -apple-system, sans-serif !important;
            }
            
            /* Force RTL layout properties */
            [dir="rtl"] {
              direction: rtl !important;
              unicode-bidi: embed !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });

      const imgData = canvas.toDataURL('image/png');
      
      // Standard A4 width and height in pt
      const imgWidth = 595.28;
      const pageHeight = 841.89;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      const pdf = new jsPDF('p', 'pt', 'a4');
      let position = 0;

      // Page 1
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Check if there is overflow for next pages, only if single page target is disabled
      let pageNum = 1;
      while (heightLeft > 0 && !fitToSinglePage) {
        position = -pageHeight * pageNum;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        pageNum++;
      }

      pdf.save(`فاتورة_رقم_${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('حدث خطأ أثناء تحضير ملف الـ PDF. يرجى تجربة حفظ الفاتورة كصورة أو استخدام خيار الطباعة المباشرة.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Convert and export as clean high-density image
  const handleExportImage = async () => {
    if (!printRef.current) return;
    setDownloadingImg(true);

    try {
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready;
      }

      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
          
          // Inject custom styling to resolve Arabic shaping and letter-spacing bugs in html2canvas exports
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap');
            
            /* Reset letter-spacing globally inside PDF/Image print context to allow proper Arabic cursive linking */
            * {
              letter-spacing: 0px !important;
              letter-spacing: normal !important;
              text-rendering: optimizeLegibility !important;
              -webkit-font-smoothing: antialiased !important;
              font-feature-settings: "kern" 1, "liga" 1 !important;
            }
            
            /* Apply beautiful Arabic fonts for templates inside export canvas */
            .font-serif {
              font-family: 'Amiri', 'Cormorant Garamond', Georgia, serif !important;
            }
            
            body, .font-sans, html {
              font-family: 'Cairo', 'Inter', system-ui, -apple-system, sans-serif !important;
            }
            
            /* Force RTL layout properties */
            [dir="rtl"] {
              direction: rtl !important;
              unicode-bidi: embed !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `فاتورة_رقم_${invoice.invoiceNumber}.png`;
      link.click();
    } catch (err) {
      console.error('Error generating Image:', err);
    } finally {
      setDownloadingImg(false);
    }
  };

  // Browser standard print action - beautifully compiled via Tailwind CDN using sandboxed-friendly virtual iframe
  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;
    
    // Create a hidden iframe representing a printing gateway to survive iframes
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(`
        <html dir="rtl">
          <head>
            <title>فاتورة رقم ${invoice.invoiceNumber}</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
            <script src="https://cdn.tailwindcss.com"></script>
            <script>
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      'hayat-navy': '#1E293B',
                      'hayat-wood': '#854D0E',
                      'hayat-border': '#CBD5E1',
                      'hayat-accent': '#F8FAFC',
                      'hayat-cream': '#FEF08A'
                    }
                  }
                }
              }
            </script>
            <style>
              @media print {
                body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                @page {
                  size: A4 portrait;
                  margin: 1cm;
                }
              }
              body, .font-sans {
                font-family: 'Cairo', 'Inter', sans-serif, system-ui;
                background-color: white !important;
              }
              .font-serif {
                font-family: 'Amiri', 'Cormorant Garamond', Georgia, serif !important;
              }
              /* Eliminate any tracking-wider or tracking-widest that disrupts Arabic cursive letter connection */
              * {
                letter-spacing: normal !important;
                letter-spacing: 0px !important;
              }
            </style>
          </head>
          <body class="p-2 bg-white select-text">
            <div class="max-w-[21cm] mx-auto">
              ${printContent}
            </div>
            <script>
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  window.frameElement?.parentNode?.removeChild(window.frameElement);
                }, 500);
              }, 700);
            </script>
          </body>
        </html>
      `);
      iframeDoc.close();
      
      // Delay printing trigger slightly to let content build
      setTimeout(() => {
        iframe.contentWindow?.focus();
        try {
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Iframe printing support failure:", e);
        }
      }, 1000);
    }
  };

  const [copied, setCopied] = useState(false);

  const handleWhatsAppShare = () => {
    const itemsText = (invoice.items || []).map((item, idx) => 
      `${idx + 1}. ${item.name} | الكمية: ${item.quantity} | السعر: ${item.price} ريال`
    ).join('\n');

    const hasTax = invoice.taxRate > 0;
    const shareText = `*${hasTax ? 'فاتورة ضريبية مبسطة' : 'فاتورة مبيعات مبسطة'} صادرة من:* ${settings.storeName}
*رقم الفاتورة:* ${invoice.invoiceNumber}
*تاريخ الإصدار:* ${invoice.date}
*تاريخ الاستحقاق:* ${invoice.dueDate || 'غير محدد'}
*العميل الموقر:* ${invoice.customerName}
${invoice.customerPhone ? `*رقم هاتف العميل:* ${invoice.customerPhone}` : ''}
----------------------------------------
*التفاصيل والبنود:*
${itemsText}
----------------------------------------
*المجموع الكلي المبدئي:* ${invoice.subtotal.toLocaleString()} ريال
${invoice.discount > 0 ? `*الخصم المطبق:* ${invoice.discount.toLocaleString()} ريال` : ''}
${hasTax ? `*ضريبة القيمة المضافة (${invoice.taxRate}%):* ${invoice.taxAmount.toLocaleString()} ريال` : ''}
*المجموع النهائي الصافي:* ${invoice.grandTotal.toLocaleString()} ريال

_نشكركم لثقتكم الغالية بنا وبخدماتنا._`;

    const encodedText = encodeURIComponent(shareText);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${invoice.customerPhone || ''}&text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleCopyClipboard = async () => {
    const itemsText = (invoice.items || []).map((item, idx) => 
      `• ${item.name} | الكمية: ${item.quantity} | السعر: ${item.price} ريال`
    ).join('\n');

    const hasTax = invoice.taxRate > 0;
    const shareText = `*${hasTax ? 'فاتورة ضريبية' : 'فاتورة مبيعات'} من:* ${settings.storeName}
*رقم الفاتورة:* ${invoice.invoiceNumber}
*التاريخ:* ${invoice.date}
*العميل الموقر:* ${invoice.customerName}
----------------------------------------
*التفاصيل والبنود:*
${itemsText}
----------------------------------------
*المجموع النهائي الصافي:* ${invoice.grandTotal.toLocaleString()} ريال`;

    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Determine dynamic variables based on current template of choice
  const isClassic = selectedTemplate === 'classic';
  const isModern = selectedTemplate === 'modern';
  const isCompact = selectedTemplate === 'compact';
  const isLuxury = selectedTemplate === 'luxury';

  // Choose standard color accents based on current template
  let primaryColorHex = '#1E293B'; // classic slate
  if (isModern) {
    primaryColorHex = '#4F46E5'; // indigo
  } else if (isCompact) {
    primaryColorHex = '#0F766E'; // teal
  } else if (isLuxury) {
    primaryColorHex = '#B45309'; // amber-gold
  }

  // Sizing adjusters when "fit to single page" is checked
  const invoicePadding = fitToSinglePage ? 'p-6 md:p-8' : 'p-10 md:p-12';
  const headerMb = fitToSinglePage ? 'mb-4' : 'mb-8';
  const sectionMy = fitToSinglePage ? 'my-3' : 'my-6';
  const tableMy = fitToSinglePage ? 'my-4' : 'my-8';
  const tableCellPy = fitToSinglePage ? 'py-1.5 px-3 text-[11px]' : 'py-3 px-4 text-xs';
  const notesAndTotalsGap = fitToSinglePage ? 'gap-4 pt-3' : 'gap-8 pt-6';
  const footerMt = fitToSinglePage ? 'mt-6' : 'mt-12';

  // Apply styling accents based on chosen Template
  let containerStyleClasses = 'bg-white mx-auto select-text text-slate-800 flex flex-col justify-between';
  let headerBorderClasses = 'border-2 border-slate-300 rounded-xl overflow-hidden';
  let headerCellLeftClasses = 'p-4 bg-slate-50/50 text-right flex gap-3 items-center border-l-2 border-slate-300';
  let headerCellRightClasses = 'p-4 bg-slate-50/50 text-right flex flex-col justify-between';
  let customerBoxClasses = 'grid grid-cols-2 border-2 border-slate-300 rounded-xl overflow-hidden';
  let tableHeaderTrClasses = 'bg-slate-100 text-[11px] font-black text-slate-700';
  let tableTrClasses = 'text-slate-850 hover:bg-slate-50/40 transition-colors border border-slate-300';
  let tableBorderClasses = 'w-full text-right border-collapse border-2 border-slate-300 rounded-xl overflow-hidden';
  let tableBorderContainer = `overflow-hidden rounded-xl border border-slate-300 ${tableMy}`;
  let primaryColText = 'text-hayat-navy';
  let subtotalsTableClasses = 'w-full text-xs font-sans border-collapse border-2 border-slate-300 rounded-xl overflow-hidden';
  let badgeClasses = 'bg-slate-200 text-slate-800 text-[9px] font-extrabold px-3 py-0.5 rounded-full border border-slate-300/60 font-sans';
  let qrContainerClasses = 'flex items-center gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 max-w-[280px]';
  let footerBorderClass = 'pt-3 border-t border-slate-150 w-full';

  if (isModern) {
    containerStyleClasses += ' rounded-3xl';
    headerBorderClasses = 'bg-gradient-to-r from-indigo-50/60 to-slate-50/60 rounded-2xl p-4 flex flex-row justify-between items-center border border-indigo-100/60';
    headerCellLeftClasses = 'text-right flex gap-3.5 items-center';
    headerCellRightClasses = 'text-right flex flex-col items-end justify-center';
    customerBoxClasses = 'grid grid-cols-2 bg-slate-50/80 rounded-2xl p-4 gap-4';
    tableBorderContainer = `overflow-hidden rounded-2xl border border-slate-150 ${tableMy}`;
    tableBorderClasses = 'w-full text-right border-collapse';
    tableHeaderTrClasses = 'bg-indigo-650/10 text-indigo-900 border-b border-indigo-100 text-[11px] font-extrabold';
    tableTrClasses = 'text-slate-800 border-b border-slate-100 odd:bg-slate-50/20';
    primaryColText = 'text-indigo-950 font-black';
    subtotalsTableClasses = 'w-full text-xs font-sans border-collapse';
    badgeClasses = 'bg-indigo-50 text-indigo-700 text-[9px] font-extrabold px-3 py-1 rounded-full border border-indigo-200';
    qrContainerClasses = 'flex items-center gap-2.5 bg-indigo-50/20 p-2.5 rounded-xl border border-indigo-100/30 max-w-[280px]';
    footerBorderClass = 'pt-3 border-t border-indigo-50 w-full';
  } else if (isCompact) {
    containerStyleClasses += ' font-sans text-xs';
    headerBorderClasses = 'bg-teal-50/30 rounded-xl p-3 flex flex-row justify-between items-center border border-teal-100/50';
    headerCellLeftClasses = 'text-right flex gap-2.5 items-center text-[11px]';
    headerCellRightClasses = 'text-right flex flex-col items-end justify-center';
    customerBoxClasses = 'grid grid-cols-2 bg-teal-50/10 rounded-xl p-3.5 border border-teal-100/30 gap-2';
    tableBorderContainer = `overflow-hidden rounded-xl border border-teal-100 ${tableMy}`;
    tableBorderClasses = 'w-full text-right border-collapse';
    tableHeaderTrClasses = 'bg-teal-700 text-white text-[10px] font-bold';
    tableTrClasses = 'text-slate-850 hover:bg-slate-50/30 border-b border-teal-50';
    primaryColText = 'text-teal-950';
    subtotalsTableClasses = 'w-full text-[11px] font-sans border-collapse';
    badgeClasses = 'bg-teal-50 text-teal-800 text-[8.5px] font-bold px-2.5 py-0.5 rounded border border-teal-200';
    qrContainerClasses = 'flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 text-[10px] max-w-[270px]';
    footerBorderClass = 'pt-2.5 border-t border-slate-100 w-full';
  } else if (isLuxury) {
    containerStyleClasses += ' font-serif min-h-[29.7cm]';
    headerBorderClasses = 'border-double border-4 border-amber-300 rounded-xl p-5 bg-gradient-to-b from-amber-50/20 to-stone-50 text-right flex flex-row justify-between items-center';
    headerCellLeftClasses = 'text-right flex gap-3.5 items-center';
    headerCellRightClasses = 'text-right flex flex-col items-end justify-center';
    customerBoxClasses = 'grid grid-cols-2 border border-amber-200 bg-stone-50 rounded-xl p-4 gap-4';
    tableBorderContainer = `overflow-hidden rounded-xl border border-amber-300 ${tableMy}`;
    tableBorderClasses = 'w-full text-right border-collapse';
    tableHeaderTrClasses = 'bg-amber-100/70 text-amber-900 border-b border-amber-300 text-[11px] font-semibold';
    tableTrClasses = 'text-slate-800 border-b border-amber-100/50 odd:bg-stone-50/30';
    primaryColText = 'text-amber-950 font-black';
    subtotalsTableClasses = 'w-full text-xs font-sans border-collapse';
    badgeClasses = 'bg-amber-50/80 text-amber-800 text-[9px] font-bold px-3 py-1 rounded border border-amber-300/80';
    qrContainerClasses = 'flex items-center gap-2.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200/50 max-w-[280px]';
    footerBorderClass = 'pt-3 border-t border-amber-200 w-full';
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
         initial={{ scale: 0.95, opacity: 0 }}
         animate={{ scale: 1, opacity: 1 }}
         exit={{ scale: 0.95, opacity: 0 }}
         className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Navigation actions bar */}
        <div className="px-8 py-4 bg-slate-50 border-b border-slate-150/60 flex flex-wrap justify-between items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-slate-500" />
            <span className="text-xs font-extrabold text-slate-600">عرض وتصدير الفاتورة - تفاعلي</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button 
              onClick={handlePrint}
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Printer size={13} />
              <span>طباعة مباشرة</span>
            </button>
            <button 
              onClick={handleExportPDF}
              type="button"
              disabled={downloadingPdf}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-hayat-navy text-white hover:bg-opacity-90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download size={13} />
              <span>{downloadingPdf ? 'جاري التحضير...' : 'تحميل PDF'}</span>
            </button>
            <button 
              onClick={handleExportImage}
              type="button"
              disabled={downloadingImg}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileImage size={13} />
              <span>{downloadingImg ? 'جاري تصدير الصورة...' : 'حفظ كصورة'}</span>
            </button>

            <span className="h-6 w-px bg-slate-200 mx-1"></span>

            <button 
              onClick={handleWhatsAppShare}
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
            >
              <Share2 size={13} />
              <span>واتساب ومشاركة</span>
            </button>
            <button 
              onClick={handleCopyClipboard}
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-600 animate-pulse" />
                  <span className="text-emerald-600">تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>نسخ النص</span>
                </>
              )}
            </button>

            <span className="h-6 w-px bg-slate-200 mx-1"></span>

            <button 
              onClick={onClose}
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 font-bold transition-all border border-slate-200/60 bg-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Master Flex container layout: Left control pane, Right instant simulation sheet */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100/20">
          
          {/* Settings sidebar on left */}
          <div className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-l border-slate-150 p-6 flex flex-col gap-6 flex-shrink-0 overflow-y-auto">
            <div>
              <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500 animate-pulse" />
                تغيير مظهر وقالب الفاتورة
              </h4>
              <p className="text-[10px] text-slate-400 mt-1">اختر من القوالب المصممة حديثاً لمعاينة وتصدير فاتورة مبيعاتك بشكل فوري</p>
            </div>

            {/* Template Selector Radio Cards */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">القوالب والتصاميم المتاحة:</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'classic', label: 'القالب الرسمي الكلاسيكي', emoji: '🏛️', desc: 'إطار ممتد ومربعات مسطّرة واضحة للتدقيق والمنشآت' },
                  { id: 'modern', label: 'القالب الحديث الناعم', emoji: '✨', desc: 'مظهر عصري، تظليل خفيف وهوامش دائرية وتصميم ناعم' },
                  { id: 'compact', label: 'المحترف المضغوط (A4)', emoji: '📄', desc: 'هوّامش وحشو فائق الضغط لحماية الفاتورة من التجزئة لصفحتين' },
                  { id: 'luxury', label: 'الملكي الفاخر الذهبي', emoji: '👑', desc: 'لمسات ذهبية عريقة وأرقام كلاسيكية وسياق دبل عريض' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    type="button"
                    className={`w-full text-right p-3 rounded-2xl border transition-all flex items-start gap-2.5 ${
                      selectedTemplate === t.id 
                        ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-extrabold shadow-sm' 
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <span className="text-base my-0.5">{t.emoji}</span>
                    <div className="flex flex-col text-right">
                      <span className="text-xs">{t.label}</span>
                      <span className="text-[9px] text-slate-400 font-medium leading-normal mt-0.5">{t.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Compact Height Checkbox */}
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">انضغاط الصفحة الواحدة (A4 Fit):</label>
              
              <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-150 cursor-pointer hover:bg-slate-100/60 transition-colors">
                <input 
                  type="checkbox"
                  checked={fitToSinglePage}
                  onChange={e => setFitToSinglePage(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-700">احتواء في صفحة واحدة</span>
                  <span className="text-[9px] text-slate-400 leading-normal mt-0.5">
                    يقوم بتقليل تباعد الأسطر وهوامش الجداول وحشو الترويسة لضمان استقرار الفاتورة بالكامل في صفحة واحدة.
                  </span>
                </div>
              </label>
            </div>

            <div className="mt-auto bg-amber-50/50 border border-amber-200/40 rounded-2xl p-4">
              <p className="text-[10px] text-amber-800 font-bold leading-relaxed flex items-start gap-1.5">
                <span className="bullet text-sm leading-none">•</span>
                <span>
                  نوصي باختيار <b>"المحترف المضغوط"</b> وتفعيل كرت <b>"احتواء في صفحة واحدة"</b> في حال زادت بنود فواتيركم عن 5 عناصر لضمان عدم حدوث انقسام للـ PDF.
                </span>
              </p>
            </div>
          </div>

          {/* Scaled Preview Document */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin bg-slate-100/40 flex justify-center items-start">
            <div 
              ref={printRef}
              id="invoice-document"
              className={`${containerStyleClasses} ${invoicePadding} border border-slate-200 max-w-[21cm] w-full shadow-md rounded-2xl bg-white`}
              style={{ minHeight: fitToSinglePage ? 'auto' : '29.7cm' }}
            >
              {/* Elegant Header section and content */}
              <div className="flex-grow">
                
                {/* 1. Header block */}
                {isClassic && (
                  <div className={`${headerBorderClasses} ${headerMb}`}>
                    <div className={headerCellLeftClasses}>
                      {renderLogoForInvoice()}
                      <div className="space-y-0.5">
                        <h2 className="text-base font-black text-hayat-navy leading-snug">{settings.storeName}</h2>
                        <p className="text-[10px] text-slate-500 font-bold">{settings.address || 'المملكة العربية السعودية'}</p>
                        {settings.contactPhone && (
                          <p className="text-[9px] text-slate-500 font-mono mt-0.5">{settings.contactPhone}</p>
                        )}
                        {settings.isTaxRegistered && settings.taxNumber && (
                          <p className="text-[9px] text-slate-500 font-bold">الرقم الضريبي: {settings.taxNumber}</p>
                        )}
                      </div>
                    </div>

                    <div className={headerCellRightClasses}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={badgeClasses}>
                          {invoice.taxRate > 0 ? "فاتورة ضريبية مبسطة" : "فاتورة مبيعات مبسطة"}
                        </span>
                        <span className="text-[10px] font-mono font-black text-slate-400">#{invoice.invoiceNumber}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <p className="flex justify-between font-sans gap-4">
                          <span className="text-slate-400 font-bold flex-shrink-0">رقم الفاتورة:</span>
                          <span className="font-mono font-black text-slate-900">{invoice.invoiceNumber}</span>
                        </p>
                        <p className="flex justify-between font-sans gap-4">
                          <span className="text-slate-400 font-bold flex-shrink-0">تاريخ الإصدار:</span>
                          <span className="font-bold text-slate-800">{invoice.date}</span>
                        </p>
                        {invoice.dueDate && (
                          <p className="flex justify-between font-sans gap-4">
                            <span className="text-slate-400 font-bold flex-shrink-0">تاريخ الاستحقاق:</span>
                            <span className="font-bold text-slate-800">{invoice.dueDate}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {(isModern || isCompact || isLuxury) && (
                  <div className={`${headerBorderClasses} ${headerMb}`}>
                    <div className={headerCellLeftClasses}>
                      {renderLogoForInvoice()}
                      <div className="space-y-0.5 text-right">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-black text-slate-900 leading-none">{settings.storeName}</h2>
                          <span className={badgeClasses}>
                            {invoice.taxRate > 0 ? "فاتورة ضريبية مبسطة" : "فاتورة مبيعات مبسطة"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold leading-normal">{settings.address || 'المملكة العربية السعودية'}</p>
                        <div className="flex items-center gap-3 text-[9px] text-slate-400 font-mono">
                          {settings.contactPhone && <span>الجوال: {settings.contactPhone}</span>}
                          {settings.isTaxRegistered && settings.taxNumber && (
                            <span className="font-sans font-bold">الرقم الضريبي: {settings.taxNumber}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={headerCellRightClasses}>
                      <span className="text-[13px] font-mono font-black text-indigo-650" style={{ color: primaryColorHex }}>
                        #{invoice.invoiceNumber}
                      </span>
                      <div className="text-[9.5px] text-slate-500 space-y-0.5 mt-1 font-sans">
                        <p className="flex justify-end gap-2">
                          <span className="text-slate-400">تاريخ الفاتورة:</span>
                          <span className="font-bold text-slate-800">{invoice.date}</span>
                        </p>
                        {invoice.dueDate && (
                          <p className="flex justify-end gap-2">
                            <span className="text-slate-400">تاريخ الاستحقاق:</span>
                            <span className="font-bold text-slate-800">{invoice.dueDate}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Customer billing information details */}
                {isCompact ? (
                  <div className={`${customerBoxClasses} ${sectionMy}`}>
                    <div className="text-right">
                      <span className="text-[8.5px] font-black text-teal-800 uppercase block mb-0.5" style={{ letterSpacing: 'normal' }}>العميل الموقّر:</span>
                      <p className="text-xs font-black text-slate-800">{invoice.customerName}</p>
                      {invoice.customerPhone && (
                        <p className="text-[10px] text-slate-500 font-mono leading-tight">الجوال: {invoice.customerPhone}</p>
                      )}
                    </div>
                    <div className="text-left flex flex-col justify-center items-end text-[10px] text-slate-500">
                      <p className="text-right"><span className="text-[8.5px] text-slate-400 font-bold block">تسوية الحساب:</span> مكتملة وموثقة ماليًا</p>
                    </div>
                  </div>
                ) : (
                  <div className={`${customerBoxClasses} ${sectionMy}`}>
                    <div className={`p-4 md:p-5 text-right space-y-1 block ${isClassic ? 'border-l-2 border-slate-300' : ''}`}>
                      <h4 className="text-[9px] font-black text-slate-400 uppercase" style={{ letterSpacing: 'normal' }}>العميل العزيز / مستلم الفاتورة:</h4>
                      <p className={`text-sm font-black ${primaryColText}`}>{invoice.customerName}</p>
                      {invoice.customerPhone && (
                        <p className="text-xs text-slate-500 font-mono font-bold">رقم الجوال: {invoice.customerPhone}</p>
                      )}
                    </div>

                    <div className="p-4 md:p-5 text-right space-y-1 text-xs text-slate-600 flex flex-col justify-center">
                      <h4 className="text-[9px] font-black text-slate-400 uppercase" style={{ letterSpacing: 'normal' }}>تفاصيل الدفع والتسوية:</h4>
                      <p className="flex justify-between">
                        <span>حالة المعاملة الرقمية:</span>
                        <span className="text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-sans font-bold text-[10px]">مكتملة ومصدقة</span>
                      </p>
                      <p className="flex justify-between">
                        <span>طريقة تسوية الدفع:</span>
                        <span className="font-extrabold text-slate-850 font-bold">مستند مالي معتمد</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. Items details table */}
                <div className={tableBorderContainer}>
                  <table className={tableBorderClasses}>
                    <thead>
                      <tr className={tableHeaderTrClasses}>
                        <th className="py-2 px-2 text-center w-10 border-b border-l border-slate-200">#</th>
                        <th className="py-2 px-3 text-right border-b border-l border-slate-200">اسم المادة / الصنف والوصف البنيوي</th>
                        <th className="py-2 px-2 text-center w-16 border-b border-l border-slate-200">الكمية</th>
                        <th className="py-2 px-2 text-center w-24 border-b border-l border-slate-200">سعر المفرد</th>
                        <th className="py-2 px-3 text-left w-28 border-b border-slate-200">القيمة الكلية</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11.5px]">
                      {invoice.items.map((item, idx) => (
                        <tr key={item.id} className={tableTrClasses}>
                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-400 border-l border-slate-200/50">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-slate-900 border-l border-slate-200/50">{item.name}</td>
                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-800 border-l border-slate-200/50">{item.quantity}</td>
                          <td className="py-2 px-2 text-center font-semibold text-slate-700 border-l border-slate-200/50">
                            {(item.price || 0).toLocaleString()} <span className="text-[9px] text-slate-400 font-sans">ريـال</span>
                          </td>
                          <td className="py-2 px-3 text-left font-black text-slate-950 bg-slate-50/20">
                            {(item.total || 0).toLocaleString()} <span className="text-[9.5px] text-slate-500 font-sans">ريـال</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 4. Totals box, Notes and QR code representation */}
                <div className={`grid grid-cols-1 md:grid-cols-2 ${notesAndTotalsGap}`}>
                  <div className="flex flex-col justify-end text-right space-y-3">
                    {invoice.notes && (
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 text-right">
                        <h5 className="text-[9px] font-black text-slate-400 uppercase mb-0.5" style={{ letterSpacing: 'normal' }}>ملاحظات والتزامات:</h5>
                        <p className="text-[10px] leading-relaxed text-slate-600">{invoice.notes}</p>
                      </div>
                    )}
                    {/* Simulated standard QR placeholder to give highly professional local look */}
                    <div className={qrContainerClasses}>
                      <div className="h-12 w-12 bg-white border border-slate-200 rounded flex items-center justify-center p-1 flex-shrink-0">
                        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,#000,#000_1px,transparent_1.5px,transparent_4px)] opacity-85"></div>
                      </div>
                      <div>
                        {invoice.taxRate > 0 ? (
                          <>
                            <h6 className="text-[9.5px] font-bold text-slate-600 mb-0.5">الرمز المشفر الموثق (QR)</h6>
                            <p className="text-[8px] text-slate-400 font-sans">فاتورة مسجلة للنظام الضريبي السعودي للفوترة المبسطة</p>
                          </>
                        ) : (
                          <>
                            <h6 className="text-[9.5px] font-bold text-slate-600 mb-0.5">رمز التحقق المعتمد (QR)</h6>
                            <p className="text-[8px] text-slate-400 font-sans">رمز مالي إلكتروني ثنائي الأبعاد لمطابقة صفقات المتجر</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="w-full max-w-[340px] border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <table className={subtotalsTableClasses}>
                        <tbody>
                          <tr className="border-b border-slate-200">
                            <td className="py-2 px-3 text-right text-slate-500 font-bold bg-slate-50/50">المجموع الأساسي الفرعي:</td>
                            <td className="py-2 px-3 text-left font-semibold text-slate-900 text-right bg-slate-50/20 w-28">
                              {(invoice.subtotal || 0).toLocaleString()} ريال
                            </td>
                          </tr>

                          {invoice.discount > 0 && (
                            <tr className="border-b border-slate-200">
                              <td className="py-2 px-3 text-right text-emerald-600 font-bold bg-slate-50/50">الخصم المطبق الفوري:</td>
                              <td className="py-2 px-3 text-left font-black text-emerald-700 text-right bg-emerald-50/10">
                                -{(invoice.discount || 0).toLocaleString()} ريال
                              </td>
                            </tr>
                          )}

                          {invoice.taxRate > 0 && (
                            <tr className="border-b border-slate-200">
                              <td className="py-2 px-3 text-right text-slate-500 font-bold bg-slate-50/50">الضريبة المضافة ({invoice.taxRate}%):</td>
                              <td className="py-2 px-3 text-left font-semibold text-slate-900 text-right bg-slate-50/20">
                                +{(invoice.taxAmount || 0).toLocaleString()} ريال
                              </td>
                            </tr>
                          )}

                          <tr className="bg-slate-100/80 font-black text-slate-900 border-t border-slate-300">
                            <td className="py-2 px-3 text-right text-xs">المجموع الكلي النهائي الصافي:</td>
                            <td className="py-2 px-3 text-left text-sm font-black text-slate-950 text-right" style={{ color: primaryColorHex }}>
                              {(invoice.grandTotal || 0).toLocaleString()} ريال
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Small Footer sign page decoration in relative block flow */}
              <div className={`${footerMt} flex justify-between items-center text-[8.5px] text-slate-400 font-bold ${footerBorderClass}`}>
                <p>صنع في نظام فوترة "حياة" المالي الذكي</p>
                <p>توقيع وختم المتجر المعتمد</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

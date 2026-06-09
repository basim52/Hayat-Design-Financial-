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
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp 
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
  const win = clonedDoc.defaultView;
  if (win) {
    const originalGetComputedStyle = win.getComputedStyle;
    win.getComputedStyle = function (el: Element, pseudoElt?: string | null) {
      const style = originalGetComputedStyle.call(this, el, pseudoElt);
      return new Proxy(style, {
        get(target, prop) {
          const val = Reflect.get(target, prop);
          if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
            if (prop === 'color') return '#0F172A';
            if (prop === 'backgroundColor') {
              return el.classList.contains('invoice-badge') ? '#F1F5F9' : 'transparent';
            }
            if (prop === 'borderColor') return '#E2E8F0';
            if (prop === 'fill' || prop === 'stroke') return '#888888';
            return '#000000';
          }
          return val;
        }
      });
    };
  }
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
      if (user?.isLocalGuest) {
        const localInvoices = JSON.parse(localStorage.getItem('local_invoices') || '[]');
        const filtered = localInvoices.filter((i: any) => i.id !== id);
        localStorage.setItem('local_invoices', JSON.stringify(filtered));
        window.dispatchEvent(new Event('localDataChanged'));
        return;
      }
      await deleteDoc(doc(services.db, 'invoices', id));
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
function AddEditInvoiceModal({ invoice, user, services, settings, onClose }: { invoice: Invoice | null, user: any, services: any, settings: any, onClose: () => void }) {
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
  
  // Logo customization state
  const [logoPreset, setLogoPreset] = useState(invoice?.logoPreset || 'default');
  const [customLogoBase64, setCustomLogoBase64] = useState(invoice?.customLogoBase64 || '');

  // Subtotal and tax items list
  const [items, setItems] = useState<InvoiceItem[]>(invoice?.items || [
    { id: '1', name: '', quantity: 1, price: 0, total: 0 }
  ]);
  const [taxRate, setTaxRate] = useState<number>(invoice?.taxRate !== undefined ? invoice.taxRate : (settings.isTaxRegistered ? settings.taxRate : 0));
  const [discount, setDiscount] = useState<number>(invoice?.discount || 0);

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
    const subAfterDiscount = calculatedSubtotal - discount;
    return Math.max(0, parseFloat(((subAfterDiscount * taxRate) / 100).toFixed(2)));
  }, [calculatedSubtotal, taxRate, discount]);

  const calculatedGrandTotal = useMemo(() => {
    const subAfterDiscount = calculatedSubtotal - discount;
    return Math.max(0, subAfterDiscount + calculatedTaxAmount);
  }, [calculatedSubtotal, discount, calculatedTaxAmount]);

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
      taxRate: Number(taxRate) || 0,
      taxAmount: Number(calculatedTaxAmount) || 0,
      discount: Number(discount) || 0,
      grandTotal: Number(calculatedGrandTotal) || 0,
      updatedAt: serverTimestamp()
    };

    if (!isEdit) {
      payload.createdAt = serverTimestamp();
    }

    try {
      if (user?.isLocalGuest) {
        const localInvoices = JSON.parse(localStorage.getItem('local_invoices') || '[]');
        const localPayload = { ...payload };
        localPayload.updatedAt = { seconds: Date.now() / 1000, nanoseconds: 0 };
        
        if (isEdit && invoice) {
          const index = localInvoices.findIndex((i: any) => i.id === invoice.id);
          if (index !== -1) {
            localInvoices[index] = { ...localInvoices[index], ...localPayload };
          }
          localStorage.setItem('local_invoices', JSON.stringify(localInvoices));
          alert('تم تعديل الفاتورة وحفظ التغييرات بنجاح!');
        } else {
          localPayload.id = `local-invoice-${Date.now()}-${Math.random()}`;
          localPayload.createdAt = { seconds: Date.now() / 1000, nanoseconds: 0 };
          localInvoices.push(localPayload);
          localStorage.setItem('local_invoices', JSON.stringify(localInvoices));
          alert('تم إنشاء الفاتورة وحفظها بنجاح!');
        }
        window.dispatchEvent(new Event('localDataChanged'));
        onClose();
        return;
      }

      if (isEdit && invoice) {
        await updateDoc(doc(services.db, 'invoices', invoice.id), payload);
        alert('تم تعديل الفاتورة وحفظ التغييرات بنجاح!');
      } else {
        await addDoc(collection(services.db, 'invoices'), payload);
        alert('تم إنشاء الفاتورة وحفظها بنجاح!');
      }
      onClose();
    } catch (err: any) {
      console.error('Error saving invoice: ', err);
      alert(`عذراً، فشل في حفظ الفاتورة. خطأ: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-5xl overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="bg-slate-50 px-8 py-5 border-b border-slate-200/60 flex justify-between items-center">
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto max-h-[75vh] scrollbar-thin">
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
                  تم تحميل الشعار המخصص بنجاح وسيتم إدراجه بالفواتير
                </p>
                <p className="text-[9px] text-slate-400">سيظهر بشكل متناسق في ملف الـ PDF المطبوع والكروكي الصوري</p>
              </div>
            </div>
          )}

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

              {taxRate > 0 && (
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

          {/* Form Actions footer */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button 
              type="submit" 
              className="px-8 py-2.5 rounded-xl bg-hayat-navy text-white text-xs font-extrabold hover:bg-opacity-90 shadow-lg shadow-slate-200"
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

  // Auto logo preset rendering matching Saudi elegant guidelines
  const renderLogoForInvoice = () => {
    switch (invoice.logoPreset) {
      case 'luxury':
        return (
          <div className="h-12 w-12 rounded-full border-2 border-amber-400 bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Sparkles size={24} />
          </div>
        );
      case 'coffee':
        return (
          <div className="h-12 w-12 rounded-full border-2 border-amber-600 bg-amber-600/5 flex items-center justify-center text-amber-700">
            <ShoppingBag size={22} />
          </div>
        );
      case 'creative':
        return (
          <div className="h-12 w-12 rounded-full border-2 border-indigo-400 bg-indigo-50 flex items-center justify-center text-indigo-500">
            <Sparkles size={22} />
          </div>
        );
      case 'custom':
        if (invoice.customLogoBase64) {
          return <img src={invoice.customLogoBase64} alt="Brand Logo" className="h-12 w-auto max-w-[150px] object-contain rounded bg-white" />;
        }
        break;
      case 'none':
        return null;
      default:
        // Elegant life/plant logo preset representing Hayat brand
        return (
          <div className="h-12 w-12 rounded-2xl bg-hayat-navy flex items-center justify-center text-white shadow-md">
            <FileText size={22} />
          </div>
        );
    }
    return (
      <div className="h-12 w-12 rounded-2xl bg-hayat-navy flex items-center justify-center text-white shadow-md">
        <FileText size={22} />
      </div>
    );
  };

  // Convert and export via jsPDF - auto-sliced pages for large rows
  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution density
        useCORS: true,
        backgroundColor: '#FFFFFF',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
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

      // Check if there is overflow for next pages
      let pageNum = 1;
      while (heightLeft > 0) {
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
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
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

  // Browser standard print action - beautifully compiled via Tailwind CDN
  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>فاتورة رقم ${invoice.invoiceNumber}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
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
                  margin: 1.5cm;
                }
              }
              body {
                font-family: 'Inter', sans-serif, system-ui;
                background-color: white !important;
              }
            </style>
          </head>
          <body class="p-4 bg-white select-text">
            <div class="max-w-[21cm] mx-auto">
              ${printContent}
            </div>
            <script>
              setTimeout(function() {
                window.print();
                window.close();
              }, 700);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-4xl overflow-hidden my-8"
      >
        {/* Navigation actions bar */}
        <div className="px-8 py-4 bg-slate-50 border-b border-slate-150/60 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-slate-500" />
            <span className="text-xs font-extrabold text-slate-600">الفاتورة المجهزة للعرض والطباعة</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Printer size={13} />
              <span>طباعة</span>
            </button>
            <button 
              onClick={handleExportPDF}
              disabled={downloadingPdf}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-hayat-navy text-white hover:bg-opacity-90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download size={13} />
              <span>{downloadingPdf ? 'جاري التحضير...' : 'تحميل PDF'}</span>
            </button>
            <button 
              onClick={handleExportImage}
              disabled={downloadingImg}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileImage size={13} />
              <span>{downloadingImg ? 'جاري تصدير الصورة...' : 'حفظ كصورة'}</span>
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 font-bold transition-all border border-slate-200/60 bg-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Invoice template container */}
        <div className="p-8 max-h-[70vh] overflow-y-auto scrollbar-thin bg-slate-100/40">
          <div 
            ref={printRef}
            id="invoice-document"
            className="bg-white mx-auto border border-slate-200 p-12 max-w-[21cm] shadow-sm rounded-2xl select-text text-slate-800 flex flex-col justify-between"
            style={{ minHeight: '29.7cm' }}
          >
            {/* Elegant Header section and content */}
            <div className="flex-grow">
              <div className="flex justify-between items-start border-b-2 border-slate-200/50 pb-8">
                <div className="flex gap-4 items-center">
                  {renderLogoForInvoice()}
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-hayat-navy leading-none mb-1">{settings.storeName}</h2>
                    <p className="text-[10px] text-slate-400 font-bold">{settings.address || 'المملكة العربية السعودية'}</p>
                    {settings.contactPhone && (
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">{settings.contactPhone}</p>
                    )}
                    {settings.taxNumber && (
                      <p className="text-[9px] text-slate-400 font-bold mt-1">الرقم الضريبي: {settings.taxNumber}</p>
                    )}
                  </div>
                </div>

                <div className="text-left font-mono">
                  <span className="bg-slate-100 text-[10px] text-slate-600 font-extrabold px-3 py-1 rounded-full border border-slate-200/50 invoice-badge text-center inline-block mb-3.5">
                    فاتورة ضريبية مبسطة
                  </span>
                  <p className="text-xs font-bold text-slate-600">رقم الفاتورة: <span className="font-bold text-slate-900">{invoice.invoiceNumber}</span></p>
                  <p className="text-[10px] text-slate-400 mt-1">تاريخ الإصدار: {invoice.date}</p>
                  {invoice.dueDate && (
                    <p className="text-[10px] text-slate-400 mt-0.5">تاريخ الاستحقاق: {invoice.dueDate}</p>
                  )}
                </div>
              </div>

              {/* Bill-to customers card details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-10 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="text-right space-y-1">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">مستلم الفاتورة:</h4>
                  <p className="text-sm font-black text-hayat-navy">{invoice.customerName}</p>
                  {invoice.customerPhone && (
                    <p className="text-xs text-slate-500 font-mono">{invoice.customerPhone}</p>
                  )}
                </div>

                <div className="text-left space-y-1 md:border-r border-slate-200 pr-0 md:pr-6 md:rtl:border-r-0 md:rtl:border-l pl-0 md:pl-6 text-slate-500 text-xs">
                  <p>الحالة المعالجة: <span className="text-emerald-600 font-bold">مكتملة ومستحقة</span></p>
                  <p>طريقة تسوية الدفعة: <span className="font-bold">ثقة وتراضي مالي</span></p>
                </div>
              </div>

              {/* Items details table */}
              <div className="my-8">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-xs font-extrabold text-slate-500">
                      <th className="py-3 px-2 w-10">#</th>
                      <th className="py-3 px-2 text-right">الصنف والوصف</th>
                      <th className="py-3 px-2 text-center w-20">الكمية</th>
                      <th className="py-3 px-2 text-center w-28">سعر الوحدة</th>
                      <th className="py-3 px-2 text-left w-32">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {invoice.items.map((item, idx) => (
                      <tr key={item.id} className="text-slate-700">
                        <td className="py-4 px-2">{idx + 1}</td>
                        <td className="py-4 px-2 font-bold text-slate-900">{item.name}</td>
                        <td className="py-4 px-2 text-center font-mono">{item.quantity}</td>
                        <td className="py-4 px-2 text-center font-serif font-bold">{(item.price || 0).toLocaleString()} <span className="text-[9px] opacity-60">ريال</span></td>
                        <td className="py-4 px-2 text-left font-serif font-black text-slate-950">{(item.total || 0).toLocaleString()} <span className="text-[9px] opacity-60">ريال</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals box, Notes and QR code representation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-200">
                <div className="flex flex-col justify-end text-right">
                  {invoice.notes && (
                    <div className="mb-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">ملاحظات والتزامات:</h5>
                      <p className="text-[10.5px] leading-relaxed text-slate-500">{invoice.notes}</p>
                    </div>
                  )}
                  {/* Simulated Zatca standard QR placeholder to give highly professional local look */}
                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/60 max-w-[280px]">
                    <div className="h-14 w-14 bg-white border border-slate-200 rounded flex items-center justify-center p-1 flex-shrink-0">
                      <div className="h-full w-full bg-[repeating-linear-gradient(45deg,#000,#000_1px,transparent_1.5px,transparent_4px)] opacity-85"></div>
                    </div>
                    <div>
                      <h6 className="text-[9px] font-bold text-slate-500 mb-0.5">الرمز المشفر الموثق (QR)</h6>
                      <p className="text-[8px] text-slate-400">فاتورة مسجلة للنظام الضريبي السعودي للفوترة المبسطة</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pr-0 md:pr-10">
                  <div className="w-full max-w-[280px] bg-slate-50/50 border border-slate-200 rounded-2xl p-6 flex flex-col gap-3.5">
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>المجموع الفرعي:</span>
                      <span className="font-serif font-bold">{(invoice.subtotal || 0).toLocaleString()} ريال</span>
                    </div>

                    {invoice.discount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600">
                        <span>الخصم المطبق:</span>
                        <span className="font-serif font-bold">-{(invoice.discount || 0).toLocaleString()} ريال</span>
                      </div>
                    )}

                    {invoice.taxRate > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-slate-500 border-t border-dashed border-slate-200 pt-2">
                        <span>الضريبة ({invoice.taxRate}%):</span>
                        <span className="font-serif font-bold">+{invoice.taxAmount?.toLocaleString() || 0} ريال</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-slate-200 pt-3 text-hayat-navy">
                      <span className="text-xs font-black">المجموع الكلي النهائي:</span>
                      <span className="font-serif text-base font-black">{(invoice.grandTotal || 0).toLocaleString()} ريال</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Small Footer sign page decoration in relative block flow */}
            <div className="mt-12 flex justify-between items-center text-[8px] text-slate-400 font-bold pt-4 border-t border-slate-100 w-full">
              <p>نظام فوترة "حياة" المالي الذكي</p>
              <p>توقيع وختم المتجر المعتمد</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

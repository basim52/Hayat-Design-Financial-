import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Printer, 
  Download, 
  Eye, 
  FileText, 
  X, 
  Search, 
  Calendar, 
  Phone, 
  User as UserIcon, 
  Upload, 
  Sparkles, 
  Check, 
  Edit, 
  Share2, 
  Copy,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { 
  collection, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  query,
  where,
  getDocs,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { Invoice, InvoiceItem } from '../types';
import { generateInvoiceQRCodeDataURL } from '../utils/zatcaTlv';
import { cleanOklColorsAndPatchGetComputedStyle } from '../utils/canvasExport';
import { DialogModal, DialogState } from './ConfirmModal';
import { getAuthorDisplayName } from '../config';

interface InvoicesViewProps {
  invoices: Invoice[];
  user: any;
  services: any;
  settings: any;
}

export default function InvoicesView({ invoices, user, services, settings }: InvoicesViewProps) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<Invoice | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

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

  const handleDelete = (id: string) => {
    setDialog({
      isOpen: true,
      type: 'danger',
      title: 'تأكيد حذف الفاتورة',
      message: 'هل أنت متأكد من رغبتك في حذف هذه الفاتورة وسجل الإيراد المرتبط بها نهائياً؟',
      confirmLabel: 'نعم، احذف',
      cancelLabel: 'إلغاء',
      onConfirm: async () => {
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
            const q = query(
              collection(services.db, 'revenues'), 
              where('invoiceId', '==', id)
            );
            const qSnap = await getDocs(q);
            for (const docItem of qSnap.docs) {
              try {
                await deleteDoc(doc(services.db, 'revenues', docItem.id));
              } catch (e) {}
            }
          }
        } catch (err: any) {
          console.error('Error deleting invoice: ', err);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'خطأ أثناء الحذف',
            message: err?.message || 'تعذر حذف الفاتورة، يرجى المحاولة لاحقاً.'
          });
        }
      }
    });
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
      {/* Header */}
      <div className="bg-white p-6 sm:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-hayat-border/40">
        <div>
          <h2 className="text-2xl font-bold text-hayat-navy mb-1 tracking-tight">إدارة الفواتير</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-hayat-wood flex-shrink-0"></span>
            <p className="text-slate-600 text-xs font-bold">إصدار ومتابعة وطباعة الفواتير المالية المعتمدة</p>
          </div>
        </div>
        <button 
          onClick={handleOpenAddModal} 
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          <span>إنشاء فاتورة جديدة</span>
        </button>
      </div>

      {/* Advanced Filters */}
      <div className="bg-hayat-cream/40 px-6 sm:px-10 py-5 border-b border-hayat-border/30 flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="ابحث باسم العميل أو رقم الفاتورة..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="w-full bg-white border border-slate-200 outline-none px-4 pr-11 py-2.5 rounded-xl text-sm text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all font-medium" 
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-600 whitespace-nowrap">تاريخ الفاتورة:</span>
          <input 
            type="date" 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)} 
            className="bg-white border border-slate-200 outline-none px-3 py-2 rounded-xl text-sm font-medium text-slate-900 w-full sm:w-auto"
          />
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="p-0 overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-hayat-accent border-b border-hayat-border/40 text-slate-600 text-xs font-bold">
              <th className="py-5 px-6 sm:px-10">رقم الفاتورة</th>
              <th className="py-5 px-6 sm:px-10">العميل</th>
              <th className="py-5 px-6 sm:px-10">التاريخ</th>
              <th className="py-5 px-6 sm:px-10 text-left">المبلغ الإجمالي</th>
              <th className="py-5 px-6 sm:px-10">أضافه</th>
              <th className="py-5 px-6 sm:px-10 w-44 text-left">العمليات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hayat-border/30 text-sm">
            {filteredInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-hayat-accent/40 transition-colors group">
                <td className="py-5 px-6 sm:px-10 min-w-[140px] font-mono font-bold text-slate-700">
                  {inv.invoiceNumber}
                </td>
                <td className="py-5 px-6 sm:px-10 min-w-[200px]">
                  <div className="flex flex-col">
                    <span className="font-bold text-hayat-navy text-sm">{inv.customerName}</span>
                    {inv.customerPhone && (
                      <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 font-sans">
                        <Phone size={12} />
                        {inv.customerPhone}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-5 px-6 sm:px-10 text-sm text-slate-600 font-bold tabular-nums">
                  {inv.date}
                </td>
                <td className="py-5 px-6 sm:px-10 text-left">
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-serif font-bold text-base bg-emerald-50 text-emerald-800">
                    {(inv.grandTotal || 0).toLocaleString()}
                    <span className="text-xs font-sans font-bold">ريال</span>
                  </div>
                </td>
                <td className="py-5 px-6 sm:px-10 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    getAuthorDisplayName(inv, user?.email) === 'أبو عبود'
                      ? 'bg-purple-100 text-purple-900 border border-purple-200'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  }`}>
                    {getAuthorDisplayName(inv, user?.email)}
                  </span>
                </td>
                <td className="py-5 px-6 sm:px-10 text-left">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setShowPreviewModal(inv)}
                      title="عرض وطباعة ومشاركة الفاتورة"
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:text-hayat-navy hover:bg-hayat-accent transition-all cursor-pointer"
                    >
                      <Eye size={17} />
                    </button>
                    <button 
                      onClick={() => handleOpenEditModal(inv)}
                      title="تعديل الفاتورة"
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:text-hayat-wood hover:bg-hayat-accent transition-all cursor-pointer"
                    >
                      <Edit size={17} />
                    </button>
                    <button 
                      onClick={() => handleDelete(inv.id)} 
                      title="حذف الفاتورة"
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-hayat-accent rounded-full flex items-center justify-center text-slate-400 mb-4">
                      <FileText size={32} />
                    </div>
                    <p className="text-slate-600 text-sm font-bold mb-3">لا توجد فواتير مطابقة لخيارات التصفية</p>
                    <button 
                      onClick={handleOpenAddModal}
                      className="px-5 py-2.5 bg-purple-900 text-white rounded-xl text-xs font-bold hover:bg-purple-950 transition-all cursor-pointer"
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

      {/* Footer totals */}
      <div className="bg-hayat-accent/20 p-6 sm:p-8 border-t border-hayat-border/40 flex justify-end">
        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-600 mb-1">عدد الفواتير بعد التصفية</p>
            <p className="text-xl font-bold text-hayat-navy">{filteredInvoices.length}</p>
          </div>
          <div className="w-px h-10 bg-hayat-border/40"></div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-600 mb-1">إجمالي المبالغ بعد التصفية</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-serif font-bold text-hayat-navy">
                {filteredTotal.toLocaleString()}
              </p>
              <span className="text-xs font-bold text-slate-600">ريال</span>
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

      {/* Dialog Modal */}
      <DialogModal dialog={dialog} onClose={() => setDialog(null)} />
    </motion.div>
  );
}

/* ========================================================
   Add / Edit Invoice Modal - Divided into 3 Distinct Steps
   ======================================================== */
function AddEditInvoiceModal({
  invoice,
  invoices = [],
  user,
  services,
  settings,
  onClose
}: {
  invoice: Invoice | null;
  invoices?: Invoice[];
  user: any;
  services: any;
  settings: any;
  onClose: () => void;
}) {
  const isEdit = !!invoice;
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto generate serial
  const generateInvoiceNumber = () => {
    const rNum = Math.floor(1000 + Math.random() * 9000);
    return `INV-${format(new Date(), 'yyyy')}-${rNum}`;
  };

  // Step 1: Customer details
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber || generateInvoiceNumber());
  const [customerName, setCustomerName] = useState(invoice?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(invoice?.customerPhone || '');
  const [date, setDate] = useState(invoice?.date || format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(invoice?.dueDate || format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState<string>((invoice as any)?.paymentMethod || 'bank_transfer');
  const [templatePreset, setTemplatePreset] = useState<string>(invoice?.templatePreset || 'classic');
  const [logoPreset, setLogoPreset] = useState(invoice?.logoPreset || 'default');
  const [customLogoBase64, setCustomLogoBase64] = useState(invoice?.customLogoBase64 || '');

  // Step 2: Items
  const [items, setItems] = useState<InvoiceItem[]>(invoice?.items || [
    { id: '1', name: '', quantity: 1, price: 0, total: 0 }
  ]);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Step 3: Discount, Tax & Notes
  const [taxRate, setTaxRate] = useState<number>(
    invoice?.taxRate !== undefined 
      ? invoice.taxRate 
      : (settings.isTaxRegistered ? settings.taxRate : 0)
  );
  const [discount, setDiscount] = useState<number>(invoice?.discount || 0);
  const [notes, setNotes] = useState(invoice?.notes || 'نشكركم لثقتكم بنا وبخدماتنا.');
  const [primaryProductType, setPrimaryProductType] = useState<string>((invoice as any)?.primaryProductType || 'other');

  // Live Calculations
  const calculatedSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
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

  const handleAddItemRow = () => {
    const newId = (items.length + 1).toString() + '-' + Date.now();
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

  const handleProcessBulkImport = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    const importedItems: InvoiceItem[] = [];
    
    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;
      const parts = cleanLine.split(/[,;\t|]+/);
      if (parts.length > 0) {
        const name = parts[0].trim();
        if (!name) return;
        let quantity = 1;
        let price = 0;
        if (parts.length === 2) {
          const num = parseFloat(parts[1].replace(/[^\d.]/g, ''));
          price = isNaN(num) ? 0 : num;
        } else if (parts.length >= 3) {
          const q = parseInt(parts[1].replace(/[^\d.]/g, ''), 10);
          const p = parseFloat(parts[2].replace(/[^\d.]/g, ''));
          quantity = isNaN(q) || q <= 0 ? 1 : q;
          price = isNaN(p) ? 0 : p;
        }
        importedItems.push({
          id: `imp-${Date.now()}-${idx}`,
          name,
          quantity,
          price,
          total: quantity * price
        });
      }
    });
    
    if (importedItems.length > 0) {
      const finalItems = (items.length === 1 && items[0].name.trim() === '' && items[0].price === 0)
        ? importedItems
        : [...items, ...importedItems];
      setItems(finalItems);
      setBulkText('');
      setShowBulkImport(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800000) {
        setDialog({
          isOpen: true,
          type: 'alert',
          title: 'حجم الصورة كبير',
          message: 'يرجى اختيار صورة أصغر من 800 كيلوبايت للتخزين السحابي السريع.'
        });
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

  const validateStep1 = () => {
    if (!customerName.trim()) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'بيانات ناقصة',
        message: 'يرجى تعبئة اسم العميل أو المؤسسة المستلمة للمتابعة.'
      });
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const validItems = items.filter(i => i.name.trim() !== '');
    if (validItems.length === 0) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'بنود الفاتورة',
        message: 'يرجى كتابة اسم بند/صنف واحد على الأقل مع تحديد سعره.'
      });
      return false;
    }
    return true;
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateStep1() || !validateStep2()) return;

    const filledItems = items.filter(item => item.name.trim() !== '');

    // Duplicate check for new invoices
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
        setDialog({
          isOpen: true,
          type: 'alert',
          title: 'فاتورة مسجلة مسبقاً',
          message: `تم رصد فاتورة مسجلة بنفس الرقم أو نفس العميل والتاريخ والقيمة (${duplicateInvoice.invoiceNumber || duplicateInvoice.customerName}). تم إيقاف الحفظ لمنع تكرار المبيعات.`
        });
        return;
      }
    }

    setIsSubmitting(true);

    const payload: any = {
      userId: isEdit && invoice?.userId ? invoice.userId : (user?.uid || ''),
      createdByEmail: isEdit && invoice?.createdByEmail ? invoice.createdByEmail : (user?.email || ''),
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
      primaryProductType: primaryProductType,
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
          const revId = invoice.revenueId || (index !== -1 ? localInvoices[index].revenueId : null);
          localPayload.revenueId = revId;
          
          if (index !== -1) {
            localInvoices[index] = { ...localInvoices[index], ...localPayload };
          }
          localStorage.setItem('local_invoices', JSON.stringify(localInvoices));
          
          const revPayload = {
            id: revId || `local-revenue-${Date.now()}`,
            userId: user.uid,
            amount: localPayload.grandTotal,
            productType: primaryProductType,
            orderNumber: localPayload.invoiceNumber,
            description: `فاتورة مبيعات رقم ${localPayload.invoiceNumber} للعميل ${localPayload.customerName}`,
            date: new Date(localPayload.date).toISOString(),
            paymentMethod: paymentMethod,
            taxAmount: localPayload.taxAmount || 0,
            invoiceId: invoice.id,
            createdAt: localPayload.createdAt || { seconds: Date.now() / 1000, nanoseconds: 0 }
          };
          
          const revIndex = localRevenues.findIndex((r: any) => r.id === revId || r.invoiceId === invoice.id);
          if (revIndex !== -1) {
            localRevenues[revIndex] = { ...localRevenues[revIndex], ...revPayload };
          } else {
            localRevenues.push(revPayload);
          }
          localStorage.setItem('local_revenues', JSON.stringify(localRevenues));
        } else {
          const invId = `local-invoice-${Date.now()}`;
          const revId = `local-revenue-${Date.now()}`;
          localPayload.id = invId;
          localPayload.revenueId = revId;
          localPayload.createdAt = { seconds: Date.now() / 1000, nanoseconds: 0 };
          localInvoices.push(localPayload);
          localStorage.setItem('local_invoices', JSON.stringify(localInvoices));
          
          const revPayload = {
            id: revId,
            userId: user.uid,
            amount: localPayload.grandTotal,
            productType: primaryProductType,
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
        }
        window.dispatchEvent(new Event('localDataChanged'));
        setIsSubmitting(false);
        onClose();
        return;
      }

      // Firestore persistence
      if (isEdit && invoice) {
        const revId = invoice.revenueId;
        payload.revenueId = revId || null;
        const originalUserId = invoice.userId || user.uid;
        const originalCreatedByEmail = invoice.createdByEmail || user.email || '';
        
        await updateDoc(doc(services.db, 'invoices', invoice.id), payload);
        
        const revPayload: any = {
          userId: originalUserId,
          createdByEmail: originalCreatedByEmail,
          amount: payload.grandTotal,
          productType: primaryProductType,
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
              createdAt: serverTimestamp()
            });
          }
        } else {
          const q = query(
            collection(services.db, 'revenues'), 
            where('invoiceId', '==', invoice.id)
          );
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            const existingRevId = qSnap.docs[0].id;
            await updateDoc(doc(services.db, 'revenues', existingRevId), revPayload);
            await updateDoc(doc(services.db, 'invoices', invoice.id), { revenueId: existingRevId });
          } else {
            const newRevRef = doc(collection(services.db, 'revenues'));
            await setDoc(newRevRef, {
              ...revPayload,
              createdAt: serverTimestamp()
            });
            await updateDoc(doc(services.db, 'invoices', invoice.id), { revenueId: newRevRef.id });
          }
        }
      } else {
        const newInvoiceRef = doc(collection(services.db, 'invoices'));
        const newInvoiceId = newInvoiceRef.id;
        
        const newRevenueRef = doc(collection(services.db, 'revenues'));
        const newRevenueId = newRevenueRef.id;
        
        payload.id = newInvoiceId;
        payload.revenueId = newRevenueId;
        payload.userId = user.uid;
        payload.createdByEmail = user.email || '';
        payload.createdAt = serverTimestamp();
        
        await setDoc(newInvoiceRef, payload);
        
        const revPayload = {
          userId: user.uid,
          createdByEmail: user.email || '',
          amount: payload.grandTotal,
          productType: primaryProductType,
          orderNumber: payload.invoiceNumber,
          description: `فاتورة مبيعات رقم ${payload.invoiceNumber} للعميل ${payload.customerName}`,
          date: new Date(payload.date || Date.now()).toISOString(),
          paymentMethod: paymentMethod,
          taxAmount: payload.taxAmount || 0,
          invoiceId: newInvoiceId,
          createdAt: serverTimestamp()
        };
        await setDoc(newRevenueRef, revPayload);
      }

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error('Error saving invoice:', err);
      setIsSubmitting(false);
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'خطأ في الحفظ',
        message: err?.message || 'تعذر حفظ الفاتورة، يرجى مراجعة الصلاحيات والاتصال.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        <form onSubmit={handleFinalSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Modal Header */}
          <div className="bg-slate-50 px-6 sm:px-8 py-5 border-b border-slate-200/60 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-100 text-purple-900">
                <FileText size={18} />
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                {isEdit ? 'تعديل الفاتورة' : 'إنشاء فاتورة جديدة'}
              </h3>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* 3-Step Progress Bar Indicator */}
          <div className="px-6 sm:px-8 py-4 bg-white border-b border-slate-100">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              {[
                { step: 1, label: '١. بيانات العميل' },
                { step: 2, label: '٢. بنود الفاتورة' },
                { step: 3, label: '٣. الخصم والملاحظات' }
              ].map(item => {
                const isActive = currentStep === item.step;
                const isPassed = currentStep > item.step;
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => {
                      if (item.step === 2 && !validateStep1()) return;
                      if (item.step === 3 && (!validateStep1() || !validateStep2())) return;
                      setCurrentStep(item.step as 1 | 2 | 3);
                    }}
                    className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all border cursor-pointer ${
                      isActive 
                        ? 'bg-purple-900 text-white border-purple-900 shadow-sm' 
                        : isPassed
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 1: Customer Details */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
            {currentStep === 1 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">رقم الفاتورة</label>
                    <input 
                      type="text" 
                      value={invoiceNumber} 
                      onChange={e => setInvoiceNumber(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono font-bold focus:border-purple-600 outline-none"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700">اسم العميل بالكامل / الجهة المستلمة *</label>
                    <div className="relative">
                      <UserIcon size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        value={customerName} 
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder="أدخل اسم العميل أو اسم المؤسسة المستلمة"
                        className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-3.5 py-2.5 text-sm text-slate-900 font-bold focus:border-purple-600 outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">رقم هاتف العميل</label>
                    <div className="relative">
                      <Phone size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        value={customerPhone} 
                        onChange={e => setCustomerPhone(e.target.value)}
                        placeholder="05xxxxxxx"
                        className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-3.5 py-2.5 text-sm text-slate-900 font-mono focus:border-purple-600 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">تاريخ الفاتورة</label>
                    <input 
                      type="date" 
                      value={date} 
                      onChange={e => setDate(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:border-purple-600 outline-none"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">تاريخ الاستحقاق (اختياري)</label>
                    <input 
                      type="date" 
                      value={dueDate} 
                      onChange={e => setDueDate(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:border-purple-600 outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:border-purple-600 outline-none"
                    >
                      <option value="bank_transfer">تحويل بنكي</option>
                      <option value="mada">مدى</option>
                      <option value="apple_pay">أبل باي</option>
                      <option value="visa_master">فيزا / ماستركارد</option>
                      <option value="cash">نقداً</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">قالب تصميم الفاتورة</label>
                    <select
                      value={templatePreset}
                      onChange={e => setTemplatePreset(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:border-purple-600 outline-none"
                    >
                      <option value="classic">كلاسيكي معتمد (رسمي)</option>
                      <option value="modern">عصري أنيق (نيلي)</option>
                      <option value="compact">مضغوط وعملي (تيركواز)</option>
                      <option value="luxury">فاخر ملكي (ذهبي)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">شعار الترويسة</label>
                    <div className="flex items-center gap-2">
                      <select 
                        value={logoPreset}
                        onChange={e => setLogoPreset(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 flex-grow"
                      >
                        <option value="default">شعار حياة الافتراضي</option>
                        <option value="luxury">أيقونة تاجر فاخرة</option>
                        <option value="coffee">أيقونة مقهى وغذاء</option>
                        <option value="creative">أيقونة نجمة إبداعية</option>
                        <option value="custom">رفع شعار مخصص</option>
                        <option value="none">بدون شعار</option>
                      </select>
                      {logoPreset === 'custom' && (
                        <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer rounded-xl p-2.5 border border-slate-200">
                          <Upload size={16} />
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

                {logoPreset === 'custom' && customLogoBase64 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-4">
                    <img src={customLogoBase64} alt="شعار المتجر" className="h-12 w-12 object-contain rounded-xl border bg-white p-1" />
                    <div>
                      <p className="text-xs font-bold text-emerald-800">تم تحميل الشعار بنجاح</p>
                      <p className="text-xs text-slate-600">سيظهر الشعار في ترويسة الفاتورة المطبوعة وملف PDF.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Items List */}
            {currentStep === 2 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-900">جدول بنود ومنتجات الفاتورة</h4>
                  <button 
                    type="button" 
                    onClick={() => setShowBulkImport(!showBulkImport)}
                    className="text-xs font-bold text-purple-800 hover:underline cursor-pointer"
                  >
                    {showBulkImport ? 'إغلاق الاستيراد السريع' : '+ استيراد سريع للبنود'}
                  </button>
                </div>

                {showBulkImport && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-slate-600 font-bold">
                      الصق بنود الفاتورة بالصيغة: اسم الصنف, ثم الكمية, ثم السعر (سطر لكل صنف):
                    </p>
                    <textarea
                      rows={3}
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      placeholder="لوحة أكريليك, 1, 350&#10;صينية خشبية, 2, 120"
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-900 font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleProcessBulkImport}
                      className="px-4 py-2 bg-purple-900 text-white rounded-xl text-xs font-bold hover:bg-purple-950 transition-all cursor-pointer"
                    >
                      إدراج البنود في الفاتورة
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div 
                      key={item.id} 
                      className="grid grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-2xl border border-slate-200/80"
                    >
                      <div className="col-span-1 text-center font-bold text-xs text-slate-500">
                        {index + 1}
                      </div>
                      <div className="col-span-5 sm:col-span-5">
                        <input
                          type="text"
                          placeholder="اسم الصنف أو الخدمة *"
                          value={item.name}
                          onChange={e => handleUpdateItemField(item.id, 'name', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-purple-600"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          placeholder="الكمية"
                          value={item.quantity}
                          onChange={e => handleUpdateItemField(item.id, 'quantity', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none text-center"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="السعر"
                          value={item.price || ''}
                          onChange={e => handleUpdateItemField(item.id, 'price', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none text-center"
                          required
                        />
                      </div>
                      <div className="col-span-2 text-left font-bold text-sm text-slate-800 tabular-nums flex items-center justify-between">
                        <span>{(item.total || 0).toLocaleString()} ر.س</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(item.id)}
                          disabled={items.length === 1}
                          className="text-slate-400 hover:text-rose-600 p-1 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>إضافة بند جديد</span>
                  </button>
                  <div className="text-left font-bold text-sm text-slate-700">
                    المجموع الأولي: <span className="text-base text-purple-950 font-serif font-black">{calculatedSubtotal.toLocaleString()} ريال</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Discount, Tax & Summary */}
            {currentStep === 3 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">نوع المنتج الرئيسي (لقيد المبيعات)</label>
                    <select
                      value={primaryProductType}
                      onChange={e => setPrimaryProductType(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:border-purple-600 outline-none"
                    >
                      <option value="acrylic">منتجات أكريليك</option>
                      <option value="wood">منتجات خشبية</option>
                      <option value="svg">ملفات رقمية (SVG)</option>
                      <option value="other">منتج آخر</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700">مبلغ الخصم (ريال)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={discount || ''}
                      onChange={e => setDiscount(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:border-purple-600 outline-none"
                    />
                  </div>

                  {settings.isTaxRegistered ? (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700">نسبة الضريبة المضافة (%)</label>
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        value={taxRate}
                        onChange={e => setTaxRate(Number(e.target.value) || 0)}
                        className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:border-purple-600 outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600 font-bold">
                      <span>المنشأة غير مسجلة في الضريبة</span>
                      <span className="text-[11px] text-slate-500 font-normal">يمكن تفعيل الضريبة من شاشة الإعدادات.</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">ملاحظات وشروط الفاتورة</label>
                  <textarea 
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-900 outline-none focus:border-purple-600"
                    placeholder="مثال: يرجى السداد خلال ١٥ يوماً من تاريخ التوريد."
                  />
                </div>

                {/* Final Summary Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2.5">
                  <h5 className="text-xs font-bold text-slate-700 pb-2 border-b border-slate-200">ملخص الحساب النهائي:</h5>
                  <div className="flex justify-between text-sm text-slate-700 font-bold">
                    <span>المجموع الأساسي الفرعي:</span>
                    <span className="tabular-nums">{calculatedSubtotal.toLocaleString()} ريال</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-700 font-bold">
                      <span>الخصم المطبق:</span>
                      <span className="tabular-nums">-{discount.toLocaleString()} ريال</span>
                    </div>
                  )}
                  {settings.isTaxRegistered && (
                    <div className="flex justify-between text-sm text-slate-700 font-bold">
                      <span>ضريبة القيمة المضافة ({taxRate}%):</span>
                      <span className="tabular-nums">+{calculatedTaxAmount.toLocaleString()} ريال</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                    <span>المجموع الكلي الصافي:</span>
                    <span className="text-xl font-serif text-purple-900 tabular-nums">
                      {calculatedGrandTotal.toLocaleString()} ريال
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Modal Navigation & Action Buttons */}
          <div className="bg-slate-50 px-6 sm:px-8 py-4 border-t border-slate-200/60 flex items-center justify-between flex-shrink-0">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((currentStep - 1) as 1 | 2)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight size={16} />
                  <span>السابق</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep === 1 && validateStep1()) setCurrentStep(2);
                    else if (currentStep === 2 && validateStep2()) setCurrentStep(3);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <span>التالي</span>
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Check size={18} />
                  <span>{isSubmitting ? 'جارٍ الحفظ...' : (isEdit ? 'تعديل الفاتورة' : 'حفظ الفاتورة وقيدها في المبيعات')}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </motion.div>

      {/* Dialog Modal */}
      <DialogModal dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/* ========================================================
   Invoice Sharing & Print Preview Modal Component
   ======================================================== */
function InvoicePreviewModal({
  invoice,
  settings,
  onClose
}: {
  invoice: Invoice;
  settings: any;
  onClose: () => void;
}) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

  const hasTaxNumber = !!(settings.taxNumber && (invoice.taxRate > 0 || settings.isTaxRegistered));

  // Generate QR Code with standard TLV encoding when tax number exists
  useEffect(() => {
    let active = true;
    async function loadQR() {
      if (hasTaxNumber) {
        const qrUrl = await generateInvoiceQRCodeDataURL(
          settings.storeName,
          settings.taxNumber,
          invoice.date,
          invoice.grandTotal,
          invoice.taxAmount
        );
        if (active) setQrCodeDataUrl(qrUrl);
      }
    }
    loadQR();
    return () => { active = false; };
  }, [invoice, settings, hasTaxNumber]);

  // Clean print handler without cdn.tailwindcss.com
  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;
    
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
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <title>فاتورة رقم ${invoice.invoiceNumber}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 1cm;
              }
              * {
                box-sizing: border-box;
                font-family: 'Cairo', system-ui, -apple-system, sans-serif;
                letter-spacing: normal !important;
              }
              body {
                background: white !important;
                color: #0f172a !important;
                margin: 0;
                padding: 10px;
                font-size: 13px;
                line-height: 1.5;
                direction: rtl;
                text-align: right;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                padding: 8px 12px;
                text-align: right;
              }
              .border { border: 1px solid #e2e8f0; }
              .border-b { border-bottom: 1px solid #e2e8f0; }
              .border-t { border-top: 1px solid #e2e8f0; }
              .rounded-xl { border-radius: 12px; }
              .rounded-2xl { border-radius: 16px; }
              .p-4 { padding: 16px; }
              .p-6 { padding: 24px; }
              .mb-4 { margin-bottom: 16px; }
              .mb-6 { margin-bottom: 24px; }
              .flex { display: flex; }
              .grid { display: grid; }
              .grid-cols-2 { grid-template-columns: repeat(2, 1fr); gap: 16px; }
              .justify-between { justify-content: space-between; }
              .items-center { align-items: center; }
              .text-left { text-align: left; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-bold { font-weight: 700; }
              .text-xs { font-size: 12px; }
              .text-sm { font-size: 14px; }
              .text-base { font-size: 16px; }
              .text-xl { font-size: 20px; }
              .text-2xl { font-size: 24px; }
              .bg-slate-50 { background-color: #f8fafc; }
              .bg-slate-100 { background-color: #f1f5f9; }
              .text-slate-500 { color: #64748b; }
              .text-slate-700 { color: #334155; }
              .text-slate-900 { color: #0f172a; }
              .text-emerald-700 { color: #047857; }
              .text-purple-900 { color: #581c87; }
            </style>
          </head>
          <body>
            <div style="max-width: 21cm; margin: 0 auto;">
              ${printContent}
            </div>
            <script>
              setTimeout(function() {
                window.focus();
                window.print();
                setTimeout(function() {
                  window.frameElement?.parentNode?.removeChild(window.frameElement);
                }, 500);
              }, 400);
            </script>
          </body>
        </html>
      `);
      iframeDoc.close();
    }
  };

  // Dynamic import of jspdf and html2canvas for PDF export
  const handleExportPDF = async () => {
    if (!printRef.current || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');

      const canvas = await html2canvas(printRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
        }
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`فاتورة_${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Dynamic import of html2canvas for Image export
  const handleExportImage = async () => {
    if (!printRef.current || downloadingImage) return;
    setDownloadingImage(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        onclone: (clonedDoc) => {
          cleanOklColorsAndPatchGetComputedStyle(clonedDoc);
        }
      });
      const link = document.createElement('a');
      link.download = `فاتورة_${invoice.invoiceNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Image export error:', err);
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleCopyClipboard = async () => {
    const itemsText = (invoice.items || []).map((item, idx) => 
      `• ${item.name} | الكمية: ${item.quantity} | السعر: ${item.price} ريال`
    ).join('\n');

    const shareText = `*${invoice.taxRate > 0 ? 'فاتورة ضريبية' : 'فاتورة مبيعات'} من:* ${settings.storeName}
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
    } catch (err) {}
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Navigation Toolbar */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200/60 flex flex-wrap justify-between items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-purple-900" />
            <span className="text-sm font-bold text-slate-800">معاينة وتصدير الفاتورة</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={handlePrint}
              type="button"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} />
              <span>طباعة</span>
            </button>
            <button 
              onClick={handleExportPDF}
              type="button"
              disabled={downloadingPdf}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-900 text-white hover:bg-purple-950 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              <span>{downloadingPdf ? 'جارٍ التحضير...' : 'تحميل PDF'}</span>
            </button>
            <button 
              onClick={handleExportImage}
              type="button"
              disabled={downloadingImage}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              <span>{downloadingImage ? 'جارٍ التحميل...' : 'حفظ كصورة'}</span>
            </button>
            <button 
              onClick={handleCopyClipboard}
              type="button"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copied ? 'تم النسخ' : 'نسخ نص'}</span>
            </button>
            <button 
              onClick={onClose}
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors cursor-pointer mr-2"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Invoice Printable Sheet Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/60 flex justify-center">
          <div 
            ref={printRef}
            className="w-full max-w-[21cm] bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200 text-right space-y-6"
          >
            {/* Header: Store Info & Invoice Title */}
            <div className="flex justify-between items-start border-b-2 border-slate-200 pb-6 gap-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-serif font-black text-slate-900">{settings.storeName}</h2>
                {settings.address && <p className="text-xs text-slate-600 font-bold">{settings.address}</p>}
                {settings.contactPhone && <p className="text-xs text-slate-600 font-mono font-bold">{settings.contactPhone}</p>}
                {settings.taxNumber && (
                  <p className="text-xs text-slate-700 font-bold">
                    الرقم الضريبي: <span className="font-mono font-bold">{settings.taxNumber}</span>
                  </p>
                )}
              </div>

              <div className="text-left space-y-1">
                <span className="inline-block px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800">
                  {invoice.taxRate > 0 ? 'فاتورة ضريبية' : 'فاتورة مبيعات'}
                </span>
                <p className="text-sm font-mono font-bold text-slate-900">رقم الفاتورة: {invoice.invoiceNumber}</p>
                <p className="text-xs text-slate-600 font-bold">تاريخ الإصدار: {invoice.date}</p>
                {invoice.dueDate && <p className="text-xs text-slate-500 font-bold">تاريخ الاستحقاق: {invoice.dueDate}</p>}
              </div>
            </div>

            {/* Customer Information Card */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-bold block mb-1">العميل الموقر:</span>
                <span className="text-sm font-bold text-slate-900">{invoice.customerName}</span>
              </div>
              {invoice.customerPhone && (
                <div>
                  <span className="text-slate-500 font-bold block mb-1">رقم الهاتف:</span>
                  <span className="text-sm font-mono font-bold text-slate-800">{invoice.customerPhone}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">الصنف / الخدمة</th>
                    <th className="py-3 px-4 text-center w-24">الكمية</th>
                    <th className="py-3 px-4 text-center w-28">السعر</th>
                    <th className="py-3 px-4 text-left w-28">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {(invoice.items || []).map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="py-3 px-4 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold">{item.name}</td>
                      <td className="py-3 px-4 text-center font-bold">{item.quantity}</td>
                      <td className="py-3 px-4 text-center font-bold tabular-nums">{(Number(item.price) || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-left font-bold tabular-nums">{(Number(item.total) || 0).toLocaleString()} ريال</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & QR Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 items-start">
              {/* QR and Notes */}
              <div className="space-y-4">
                {hasTaxNumber && qrCodeDataUrl ? (
                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 max-w-xs">
                    <img src={qrCodeDataUrl} alt="رمز الاستجابة السريعة للفاتورة" className="w-20 h-20 object-contain rounded bg-white p-0.5 border" />
                    <div className="space-y-0.5">
                      <h6 className="text-xs font-bold text-slate-800">رمز الاستجابة السريعة (QR)</h6>
                      <p className="text-[11px] text-slate-500">بيانات الفاتورة والضريبة</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
                    <span className="font-bold block text-slate-800 mb-0.5">معرّف السجل الإلكتروني</span>
                    <span className="font-mono text-[11px]">{invoice.invoiceNumber}</span>
                  </div>
                )}

                {invoice.notes && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                    <span className="text-slate-500 font-bold block mb-1">ملاحظات:</span>
                    <p className="text-slate-700 leading-relaxed">{invoice.notes}</p>
                  </div>
                )}
              </div>

              {/* Totals Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 px-3 bg-slate-50 text-slate-600 font-bold">المجموع الأساسي:</td>
                      <td className="py-2.5 px-3 text-left font-bold text-slate-900 tabular-nums">
                        {(invoice.subtotal || 0).toLocaleString()} ريال
                      </td>
                    </tr>
                    {invoice.discount > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 bg-slate-50 text-emerald-700 font-bold">الخصم المطبق:</td>
                        <td className="py-2.5 px-3 text-left font-bold text-emerald-700 tabular-nums">
                          -{(invoice.discount || 0).toLocaleString()} ريال
                        </td>
                      </tr>
                    )}
                    {invoice.taxRate > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 bg-slate-50 text-slate-600 font-bold">الضريبة المضافة ({invoice.taxRate}%):</td>
                        <td className="py-2.5 px-3 text-left font-bold text-slate-900 tabular-nums">
                          +{(invoice.taxAmount || 0).toLocaleString()} ريال
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-100/90 text-sm font-black text-slate-900">
                      <td className="py-3 px-3">المجموع النهائي الصافي:</td>
                      <td className="py-3 px-3 text-left font-serif text-base text-purple-950 tabular-nums">
                        {(invoice.grandTotal || 0).toLocaleString()} ريال
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-bold">
              <p>نظام حياة المالي</p>
              <p>توقيع وختم المنشأة</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

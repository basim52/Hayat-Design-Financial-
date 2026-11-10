import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle, Info, HelpCircle, X } from 'lucide-react';

export interface DialogState {
  isOpen: boolean;
  type: 'confirm' | 'alert' | 'success' | 'danger';
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface DialogModalProps {
  dialog: DialogState | null;
  onClose: () => void;
}

export function DialogModal({ dialog, onClose }: DialogModalProps) {
  if (!dialog || !dialog.isOpen) return null;

  const isConfirm = dialog.type === 'confirm' || dialog.type === 'danger';

  const getIcon = () => {
    switch (dialog.type) {
      case 'danger':
        return <AlertTriangle className="w-8 h-8 text-rose-600" />;
      case 'success':
        return <CheckCircle className="w-8 h-8 text-emerald-600" />;
      case 'confirm':
        return <HelpCircle className="w-8 h-8 text-purple-600" />;
      default:
        return <Info className="w-8 h-8 text-purple-600" />;
    }
  };

  const getIconBg = () => {
    switch (dialog.type) {
      case 'danger':
        return 'bg-rose-50 border-rose-100';
      case 'success':
        return 'bg-emerald-50 border-emerald-100';
      case 'confirm':
        return 'bg-purple-50 border-purple-100';
      default:
        return 'bg-indigo-50 border-indigo-100';
    }
  };

  const handleConfirm = () => {
    if (dialog.onConfirm) {
      dialog.onConfirm();
    }
    onClose();
  };

  const handleCancel = () => {
    if (dialog.onCancel) {
      dialog.onCancel();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-indigo-50 relative text-right"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border ${getIconBg()}`}>
              {getIcon()}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 leading-snug mb-1">
                {dialog.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {dialog.message}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
            {isConfirm && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm transition-all active:scale-95 cursor-pointer"
              >
                {dialog.cancelLabel || 'إلغاء'}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-6 py-2.5 rounded-xl text-white font-bold text-sm transition-all shadow-md active:scale-95 cursor-pointer ${
                dialog.type === 'danger'
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                  : 'bg-purple-900 hover:bg-purple-950 shadow-purple-200'
              }`}
            >
              {dialog.confirmLabel || (isConfirm ? 'تأكيد' : 'حسناً')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" stroke="#E2E8F0" strokeWidth="1" />
        {/* Stylized Pen Nib */}
        <path d="M50 25L35 60L50 75L65 60L50 25Z" fill="#7C3AED" /> {/* Purple */}
        <path d="M50 25L45 60L50 65L55 60L50 25Z" fill="#2DD4BF" /> {/* Teal */}
        <circle cx="50" cy="55" r="3" fill="white" />
      </svg>
      <div className="flex flex-col">
        <span className="font-serif text-hayat-navy text-xl leading-none">حياة</span>
        <span className="font-sans text-teal-500 text-[10px] uppercase tracking-widest font-bold leading-none">Design</span>
      </div>
    </div>
  );
};

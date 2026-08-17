import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" stroke="#E0E7FF" strokeWidth="1" />
        {/* Abstract "H" and Design elements in Royal Violet and Emerald */}
        <rect x="35" y="30" width="8" height="40" rx="4" fill="#5B21B6" />
        <rect x="57" y="30" width="8" height="40" rx="4" fill="#5B21B6" />
        <rect x="35" y="46" width="30" height="8" rx="4" fill="#059669" />
        <circle cx="50" cy="80" r="4" fill="#10B981" className="animate-pulse" />
      </svg>
    </div>
  );
};


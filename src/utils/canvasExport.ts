/**
 * Fix html2canvas unsupported oklch/oklab color parsing in modern browsers
 */
export const cleanOklColorsAndPatchGetComputedStyle = (clonedDoc: Document) => {
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
    if (lightness >= 0.92) return '#F8FAFC';
    if (lightness >= 0.85) return '#F1F5F9';
    if (lightness >= 0.75) return '#E2E8F0';
    if (lightness >= 0.65) return '#CBD5E1';
    if (lightness >= 0.55) return '#94A3B8';
    if (lightness >= 0.45) return '#64748B';
    if (lightness >= 0.35) return '#475569';
    if (lightness >= 0.25) return '#334155';
    if (lightness >= 0.15) return '#1E293B';
    return '#0F172A';
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

  if (clonedDoc.defaultView) {
    patchWin(clonedDoc.defaultView);
  }
  if (typeof window !== 'undefined') {
    patchWin(window);
  }

  const oklColorRegex = /(oklch|oklab)\((?:[^()]+|\([^()]*\))*\)/gi;
  clonedDoc.querySelectorAll('style').forEach(styleTag => {
    if (styleTag.innerHTML.includes('oklch') || styleTag.innerHTML.includes('oklab')) {
      styleTag.innerHTML = styleTag.innerHTML.replace(oklColorRegex, (m) => resolveToSlateHex(m));
    }
  });

  clonedDoc.querySelectorAll('*').forEach((el: any) => {
    if (el.style) {
      if (el.style.cssText && (el.style.cssText.includes('oklch') || el.style.cssText.includes('oklab'))) {
        el.style.cssText = el.style.cssText.replace(oklColorRegex, (m) => resolveToSlateHex(m));
      }
    }
  });
};

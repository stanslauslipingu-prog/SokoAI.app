import { oklch, formatHex, parse } from 'culori';

/**
 * html2canvas fails on oklch() and oklab() colors.
 * This utility finds any non-standard colors in a string or style object and converts them to HEX.
 */
export function sanitizeColor(color: string | any): string {
  if (typeof color !== 'string') return color;
  
  // If it's already hex or standard rgb, return as is
  if (color.startsWith('#') || (color.startsWith('rgb') && !color.includes('okl'))) return color;
  
  // Regex to find oklch(...) and oklab(...)
  const colorRegex = /(oklch|oklab)\s*\([^)]+\)/g;
  
  if (colorRegex.test(color)) {
    return color.replace(colorRegex, (match) => {
      try {
        const parsed = parse(match);
        if (parsed) {
          return formatHex(parsed) || match;
        }
      } catch (e) {}
      return match;
    });
  }
  
  // Single color strings
  try {
    const parsed = parse(color);
    if (parsed) {
      // Modern formats like oklch/oklab cause issues in older libs like html2canvas
      return formatHex(parsed) || color;
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return color;
}

/**
 * Recursively cleans OKLCH/OKLAB colors from a DOM element's styles before html2canvas capture.
 */
export function sanitizeElementColors(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
  let current: Node | null = walker.currentNode;
  
  while(current) {
    const el = current as HTMLElement;
    const style = window.getComputedStyle(el);
    
    // Check common color properties, including backgrounds that might have gradients
    const props = ['color', 'backgroundColor', 'borderColor', 'outlineColor', 'stopColor', 'fill', 'stroke', 'background', 'backgroundImage'];
    
    props.forEach(prop => {
      const value = (style as any)[prop];
      if (value && (value.includes('oklch') || value.includes('oklab'))) {
        el.style[prop as any] = sanitizeColor(value);
      }
    });
    
    current = walker.nextNode();
  }
}

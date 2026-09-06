import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  id: string;
  label: string;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  triggerClassName = '',
  popoverClassName = '',
  disabled = false,
  placeholder
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.id === value);

  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      // Logic to keep the menu inside the viewport
      const menuHeight = options.length * 40 + 20; // Estimated
      const menuWidth = Math.max(140, rect.width);
      const spaceBelow = window.innerHeight - rect.bottom;
      
      let top = rect.bottom + 6;
      if (spaceBelow < menuHeight && rect.top > menuHeight) {
        top = rect.top - menuHeight - 6;
      }

      const centeredLeft = rect.left + rect.width / 2 - menuWidth / 2;
      const left = Math.min(
        Math.max(8, centeredLeft),
        Math.max(8, window.innerWidth - menuWidth - 8)
      );

      setCoords({
        top,
        left,
        width: menuWidth
      });
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    
    const handleScroll = () => updateCoords();
    const handleResize = () => updateCoords();
    
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !popoverRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className="custom-select-container" ref={triggerRef}>
      <button
        type="button"
        className={`custom-select-trigger ${triggerClassName} ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="select-value">
          {selectedOption ? selectedOption.label : (placeholder || value)}
        </span>
        <svg
          className="select-chevron"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          className={`custom-select-popover ${popoverClassName}`}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            minWidth: coords.width,
            zIndex: 9999
          }}
        >
          <div className="custom-select-options-inner">
            {options.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`custom-select-option ${value === opt.id ? 'active' : ''}`}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

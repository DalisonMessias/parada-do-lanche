import React, { useEffect, useMemo, useRef, useState } from 'react';

export type CustomSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
  buttonClassName?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  name,
  className = '',
  buttonClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-left font-black text-gray-800 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'border-primary ring-1 ring-primary/30' : ''
        } ${buttonClassName}`}
      >
        <span className={`${selected ? 'text-gray-800' : 'text-gray-400'} block truncate`}>
          {selected?.label || placeholder}
        </span>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && !disabled ? (
        <div className="absolute z-[260] mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-xl max-h-64 overflow-auto py-1">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || '__empty__'}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm font-black transition-colors ${
                  isSelected ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                } ${option.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default CustomSelect;


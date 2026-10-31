import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { Button } from './Button';
interface StatusOption {
  value: string;
  label?: string;
}
interface StatusDropdownProps {
  value: string;
  options: readonly StatusOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}
export const StatusDropdown: React.FC<StatusDropdownProps> = ({ value, options, onChange, disabled = false, label = 'Statut' }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 208, maxHeight: 280 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const close = () => setOpen(false);
  const choose = (index: number) => {
    const option = options[index];
    if (!option || disabled) return;
    close();
    triggerRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  };
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(208, window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const desired = Math.min(280, options.length * 36 + 8);
    const useBelow = below >= desired || below >= above;
    const maxHeight = Math.max(36, Math.min(desired, useBelow ? below : above));
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: useBelow ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4), width, maxHeight });
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!triggerRef.current?.contains(node) && !menuRef.current?.contains(node)) close();
    };
    const onScroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) menuRef.current?.querySelector(`#${CSS.escape(`${id}-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape' && open) { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActive(open ? Math.max(0, Math.min(options.length - 1, active + direction)) : selectedIndex);
      setOpen(true);
    } else if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active); else { setActive(selectedIndex); setOpen(true); }
    }
  };
  return <>
    <Button ref={triggerRef} variant="ghost" size="sm" role="combobox" aria-label={`${label} : ${value}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled || !options.length} onKeyDown={onKeyDown} onClick={() => { setActive(selectedIndex); setOpen((current) => !current); }}>{options.find((option) => option.value === value)?.label || value}</Button>
    {open && createPortal(<div ref={menuRef} id={id} role="listbox" aria-label={label} className="fixed z-[100] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 text-sm text-zinc-800 shadow-lg" style={position}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)} className={`flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 ${index === active ? 'bg-zinc-100 text-zinc-950' : 'hover:bg-zinc-50'} ${option.value === value ? 'font-semibold' : 'font-medium'}`}><span>{option.label || option.value}</span>{option.value === value && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}</div>)}
    </div>, document.body)}
  </>;
};

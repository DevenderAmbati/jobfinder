import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'md' | 'sm';
  'aria-label'?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  size = 'md',
  'aria-label': ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? placeholder;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const gap = 6;
      const menuMax = Math.min(256, viewportH * 0.5);
      const spaceBelow = viewportH - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < Math.min(menuMax, 160) && spaceAbove > spaceBelow;
      const width =
        size === 'sm'
          ? Math.max(rect.width, Math.min(288, viewportW * 0.8))
          : rect.width;
      const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));

      setMenuStyle({
        position: 'fixed',
        left,
        width,
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? viewportH - rect.top + gap : undefined,
        maxHeight: Math.max(
          120,
          openUp
            ? Math.min(menuMax, spaceAbove)
            : Math.min(menuMax, spaceBelow),
        ),
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, size]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    setHighlight(index);
    queueMicrotask(() => listRef.current?.focus());

    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, options, value]);

  useEffect(() => {
    if (!open || highlight < 0) {
      return;
    }
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    );
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((prev) => Math.min(options.length - 1, Math.max(0, prev) + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((prev) => Math.max(0, prev - 1));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setHighlight(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setHighlight(options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[highlight];
      if (option) {
        choose(option.value);
      }
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            className="select-field__menu"
            role="listbox"
            tabIndex={-1}
            style={menuStyle}
            aria-activedescendant={
              highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
            }
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === highlight;
              return (
                <li
                  key={`${option.value}-${index}`}
                  id={`${listId}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    'select-field__option',
                    isSelected ? 'is-selected' : '',
                    isActive ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option.value);
                  }}
                >
                  {option.label}
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={[
        'select-field',
        size === 'sm' ? 'select-field--sm' : '',
        open ? 'is-open' : '',
        disabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={triggerRef}
        type="button"
        className="select-field__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          className={[
            'select-field__value',
            !selected ? 'is-placeholder' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {label}
        </span>
        <span className="select-field__chevron" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}

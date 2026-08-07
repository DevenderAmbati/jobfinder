import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { SelectOption } from './Select';

interface MultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'All',
  searchPlaceholder = 'Search…',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const label = useMemo(() => {
    if (value.length === 0) {
      return placeholder;
    }
    if (value.length === 1) {
      return (
        options.find((option) => option.value === value[0])?.label ?? value[0]
      );
    }
    return `${value.length} selected`;
  }, [value, options, placeholder]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const gap = 6;
      const menuMax = Math.min(320, viewportH * 0.55);
      const spaceBelow = viewportH - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < Math.min(menuMax, 180) && spaceAbove > spaceBelow;
      const width = Math.max(rect.width, Math.min(320, viewportW * 0.9));
      const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));

      setMenuStyle({
        position: 'fixed',
        left,
        width,
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? viewportH - rect.top + gap : undefined,
        maxHeight: Math.max(
          160,
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
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    setHighlight(0);
    queueMicrotask(() => searchRef.current?.focus());

    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listRef.current?.contains(target) ||
        searchRef.current?.contains(target)
      ) {
        return;
      }
      // Also allow clicks on the portal panel wrapper
      const panel = document.getElementById(listId);
      if (panel?.contains(target)) {
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
  }, [open, listId]);

  useEffect(() => {
    if (!open || highlight < 0) {
      return;
    }
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    );
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open, filtered]);

  function toggle(nextValue: string) {
    if (selectedSet.has(nextValue)) {
      onChange(value.filter((item) => item !== nextValue));
      return;
    }
    onChange([...value, nextValue]);
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

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((prev) =>
        Math.min(filtered.length - 1, Math.max(0, prev) + 1),
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((prev) => Math.max(0, prev - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlight];
      if (option) {
        toggle(option.value);
      }
      return;
    }
  }

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            id={listId}
            className="select-field__menu multi-select__panel"
            style={menuStyle}
            role="presentation"
          >
            <div className="multi-select__search">
              <input
                ref={searchRef}
                className="input input--sm"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </div>
            {value.length > 0 ? (
              <div className="multi-select__toolbar">
                <button
                  type="button"
                  className="multi-select__clear"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange([]);
                  }}
                >
                  Clear selection
                </button>
              </div>
            ) : null}
            <ul
              ref={listRef}
              className="multi-select__list"
              role="listbox"
              aria-multiselectable="true"
              aria-label={ariaLabel}
            >
              {filtered.length === 0 ? (
                <li className="select-field__option is-empty">No matches</li>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = selectedSet.has(option.value);
                  const isActive = index === highlight;
                  return (
                    <li
                      key={option.value}
                      id={`${listId}-opt-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      className={[
                        'select-field__option',
                        'multi-select__option',
                        isSelected ? 'is-selected' : '',
                        isActive ? 'is-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        toggle(option.value);
                      }}
                    >
                      <span
                        className={[
                          'multi-select__check',
                          isSelected ? 'is-checked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden="true"
                      />
                      <span className="multi-select__label">{option.label}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={[
        'select-field',
        'multi-select',
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
            value.length === 0 ? 'is-placeholder' : '',
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

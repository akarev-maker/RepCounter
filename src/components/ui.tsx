import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-ink text-white hover:bg-black disabled:bg-ink/25 disabled:text-white/90 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]',
  secondary:
    'bg-surface text-ink border border-line-strong hover:border-ink-3 disabled:text-ink-3 disabled:border-line',
  ghost: 'text-ink-2 hover:bg-black/[0.04] hover:text-ink disabled:text-ink-3',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
    md: 'h-10 px-4 text-sm rounded-xl gap-2',
    lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
  };
  return (
    <button
      type="button"
      className={`inline-flex select-none items-center justify-center font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</p>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  size = 'md',
}: {
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex w-full rounded-xl bg-black/[0.05] p-1 ${disabled ? 'opacity-50' : ''}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-lg font-semibold transition ${
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3 text-sm'
            } ${
              active
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'warn' | 'error' | 'info';
  children: ReactNode;
}) {
  const tones = {
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    info: 'border-line bg-canvas text-ink-2',
  };
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

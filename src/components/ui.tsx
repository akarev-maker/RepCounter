import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-cream hover:bg-black disabled:bg-ink/25 disabled:text-cream/90',
  secondary:
    'bg-transparent text-ink border border-line-strong hover:border-ink-3 disabled:text-ink-3 disabled:border-line',
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
    sm: 'h-9 px-4 text-[13px] gap-1.5',
    md: 'h-10 px-5 text-sm gap-2',
    lg: 'h-[52px] px-6 text-[15px] gap-2',
  };
  return (
    <button
      type="button"
      className={`inline-flex select-none items-center justify-center rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(60,50,30,0.04)] ${className}`}>
      {children}
    </section>
  );
}

/** Small italic serif label, e.g. "set up", "log this set". */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="font-display text-[15px] italic leading-none text-ink-2 lowercase">{children}</p>;
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
      className={`inline-flex w-full rounded-full border border-line-strong p-[3px] ${disabled ? 'opacity-50' : ''}`}
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
            className={`flex-1 rounded-full font-medium transition ${
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3 text-sm'
            } ${active ? 'bg-ink text-cream' : 'text-ink-2 hover:text-ink'}`}
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
    info: 'border-line bg-[#ebe6dc] text-ink-2',
  };
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

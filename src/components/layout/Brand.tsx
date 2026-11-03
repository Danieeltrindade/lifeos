import { useId } from 'react';
import { Link } from 'react-router';

export function BrandMark({ className = 'size-8' }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--lo-brand-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--lo-brand-to)' }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        strokeWidth="2.5"
        style={{ stroke: 'var(--lo-brand-ink)' }}
      />
      <path
        d="M16 10.5V16l3.75 2.25"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--lo-brand-ink)' }}
      />
    </svg>
  );
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md" aria-label="LifeOS — início">
      <BrandMark className="size-8 drop-shadow-[0_4px_12px_var(--lo-brand-shadow)]" />
      <span className="text-[1.1875rem] font-semibold tracking-[-0.02em]">
        Life<span className="text-primary">OS</span>
      </span>
    </Link>
  );
}

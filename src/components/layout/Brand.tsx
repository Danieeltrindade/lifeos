import { Link } from 'react-router';

export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle cx="16" cy="16" r="8.5" fill="none" strokeWidth="2.5" className="stroke-primary-fg" />
      <path
        d="M16 7.5v8.5l5 3"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-accent"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md" aria-label="LifeOS — início">
      <BrandMark />
      <span className="text-title-sm font-semibold tracking-tight">
        Life<span className="text-fg-subtle">OS</span>
      </span>
    </Link>
  );
}

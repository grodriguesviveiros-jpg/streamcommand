import { useEffect, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-mist-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  };
  return (
    <button
      type={props.type ?? 'button'}
      {...props}
      className={`${variants[variant]} ${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : ''} ${className}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-mist-500">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${className}`} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input min-h-[90px] resize-y ${className}`} />;
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`input appearance-none ${className}`}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-sm text-mist-300"
    >
      <span
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
        style={{ background: checked ? 'var(--primary)' : 'rgba(255,255,255,0.14)' }}
      >
        <span
          className="absolute h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(3px)' }}
        />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}

const TONES: Record<string, string> = {
  neutral: 'border-white/10 bg-white/[0.05] text-mist-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  primary: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={`badge ${TONES[tone] ?? TONES.neutral}`}>{children}</span>;
}

export function Dot({ tone = 'neutral', pulse = false }: { tone?: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    success: '#34d399',
    danger: '#fb7185',
    warning: '#fbbf24',
    neutral: '#5f6b82',
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${pulse ? 'animate-pulse-soft' : ''}`}
      style={{ background: colors[tone] ?? colors.neutral }}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        className={`animate-fade-up panel w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <div className="panel-head">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-mist-400">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-mist-300">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {description ? <p className="mt-1 max-w-md text-xs text-mist-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ background: tone === 'secondary' ? 'var(--secondary)' : 'var(--primary)' }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-mist-400">{label}</p>
        {icon ? <span className="text-mist-400">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mist-400">{hint}</p> : null}
    </Card>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
      {message}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-6 text-xs text-mist-400">
      <Loader2 size={14} className="animate-spin" />
      {label ?? 'Carregando…'}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
        />
        <input value={value} onChange={(event) => onChange(event.target.value)} className="input font-mono text-xs" />
      </div>
    </div>
  );
}

/** Confirmação em duas etapas, sem diálogo nativo do navegador. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Confirmar',
  className = '',
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      variant={armed ? 'danger' : 'ghost'}
      size="sm"
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`chip flex items-center gap-1.5 ${value === tab.value ? 'chip-active' : ''}`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

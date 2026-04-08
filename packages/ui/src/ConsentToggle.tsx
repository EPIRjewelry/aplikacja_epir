import type {ReactNode} from 'react';

export type ConsentToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Prosty kontrolowany przełącznik zgody (checkbox + label).
 */
export function ConsentToggle({
  checked,
  onChange,
  label,
  id = 'epir-consent-toggle',
  disabled = false,
  className = '',
}: ConsentToggleProps) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-2 text-sm text-gray-700 ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`.trim()}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

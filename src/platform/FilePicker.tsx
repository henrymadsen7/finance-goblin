import { useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
export default function FilePicker({
  label,
  accept,
  disabled,
  onChange,
  className = "life-button life-file-button",
  children,
}: {
  label: string;
  accept: string;
  disabled?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label={label}
      >
        {children || label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={onChange}
        hidden
        aria-label={label}
      />
    </>
  );
}

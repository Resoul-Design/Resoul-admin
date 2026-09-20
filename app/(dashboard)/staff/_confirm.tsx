"use client";

export function ConfirmSubmitButton({
  form,
  message,
  className,
  children,
}: {
  form?: string;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      form={form}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

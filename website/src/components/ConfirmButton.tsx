"use client";

/** Submit button that asks for confirmation first (for destructive actions).
 *  Cancelling the browser confirm prevents the form submit. */
export default function ConfirmButton({
  children,
  className,
  message,
}: {
  children: React.ReactNode;
  className?: string;
  message: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

import { ExclamationCircleIcon } from "@heroicons/react/24/solid";

type FormFieldErrorProps = {
  id: string;
  message?: string;
};

export default function FormFieldError({ id, message }: FormFieldErrorProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className="mt-1.5 inline-flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-sm font-semibold text-red-800"
    >
      <ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

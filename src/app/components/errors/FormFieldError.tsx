import FieldError from "@/app/components/errors/FieldError";

type FormFieldErrorProps = {
  id: string;
  message?: string;
};

export default function FormFieldError({ id, message }: FormFieldErrorProps) {
  return <FieldError id={id} message={message} />;
}

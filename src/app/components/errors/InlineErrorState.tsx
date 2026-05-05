import FeedbackAlert from "@/app/components/errors/FeedbackAlert";

type InlineErrorStateProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export default function InlineErrorState({
  title = "Não foi possível carregar esta informação",
  message = "Verifique a ligação e tente novamente.",
  actionLabel = "Recarregar",
  onAction,
  className = "",
}: InlineErrorStateProps) {
  return <FeedbackAlert variant="error" title={title} message={message} actionLabel={actionLabel} onAction={onAction} className={className} />;
}

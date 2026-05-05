import WarningAlert from "@/app/components/errors/WarningAlert";

type AppErrorBannerProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function AppErrorBanner({
  title = "Ligação indisponível",
  message = "Não conseguimos contactar o servidor neste momento.",
  actionLabel = "Tentar novamente",
  onAction,
}: AppErrorBannerProps) {
  return <WarningAlert title={title} message={message} actionLabel={actionLabel} onAction={onAction} />;
}

import AppErrorBanner from "@/app/components/errors/AppErrorBanner";

type BannerErrorProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

export default function BannerError({
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: BannerErrorProps) {
  return (
    <AppErrorBanner
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
      onDismiss={onDismiss}
    />
  );
}

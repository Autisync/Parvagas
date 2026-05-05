import FeedbackAlert, { type FeedbackAlertProps } from "@/app/components/errors/FeedbackAlert";

type WarningAlertProps = Omit<FeedbackAlertProps, "variant">;

export default function WarningAlert(props: WarningAlertProps) {
  return <FeedbackAlert variant="warning" {...props} />;
}

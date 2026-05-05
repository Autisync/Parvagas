import FeedbackAlert, { type FeedbackAlertProps } from "@/app/components/errors/FeedbackAlert";

type SuccessAlertProps = Omit<FeedbackAlertProps, "variant">;

export default function SuccessAlert(props: SuccessAlertProps) {
  return <FeedbackAlert variant="success" {...props} />;
}

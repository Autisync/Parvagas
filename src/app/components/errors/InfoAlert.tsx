import FeedbackAlert, { type FeedbackAlertProps } from "@/app/components/errors/FeedbackAlert";

type InfoAlertProps = Omit<FeedbackAlertProps, "variant">;

export default function InfoAlert(props: InfoAlertProps) {
  return <FeedbackAlert variant="info" {...props} />;
}

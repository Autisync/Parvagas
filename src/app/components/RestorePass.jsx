"use client";

import React from "react";
import {
  Button,
  Dialog,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
  Input,
} from "@material-tailwind/react";
import { apiFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { useClientLocale } from "@/lib/i18n/client";
import FormFieldError from "@/app/components/errors/FormFieldError";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DialogWithForm() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const { notify } = useAppNotifier();
  const { dict } = useClientLocale();

  const handleOpen = () => setOpen((cur) => !cur);

  React.useEffect(() => {
    if (!success) return;
    notify(success, "success");
    setSuccess("");
  }, [success, notify]);

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    setSubmitted(true);

    if (!email.trim()) {
      setError(dict.auth.resetDialog.errorEmailRequired);
      return;
    }

    if (!emailRegex.test(email.trim())) {
      setError(dict.auth.resetDialog.errorEmailInvalid);
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch("/auth/forgot-password", {
        method: "POST",
        suppressGlobalErrors: true,
        body: JSON.stringify({ email: email.trim() }),
      });
      setSuccess(response?.message || dict.auth.resetDialog.successFallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o pedido de recuperação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="font-normal text-red-500 hover:text-red-400"
        onClick={handleOpen}
      >
        {dict.auth.resetDialog.trigger}
      </button>
      <Dialog
        size="xs"
        open={open}
        handler={handleOpen}
        className="bg-transparent shadow-none"
      >
        <Card className="mx-auto w-full max-w-[24rem]">
          <CardBody className="flex flex-col gap-4">
            <Typography variant="h4" color="red">
              {dict.auth.resetDialog.title}
            </Typography>

            <Typography className="-mb-2 text-gray-900" variant="h6">
              {dict.auth.resetDialog.emailLabel}
            </Typography>
            <Input
              label={dict.auth.resetDialog.emailLabel}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            <FormFieldError
              id="reset-email-error"
              message={submitted || touched ? error : ""}
            />
            <Typography
              className="font-normal text-xs text-gray-900"
              variant="paragraph"
              color="gray"
            >
              {dict.auth.resetDialog.helper}
            </Typography>

          </CardBody>
          <CardFooter className="pt-0">
            <Button variant="gradient" type="button" onClick={handleSubmit} disabled={loading} fullWidth>
              {loading ? dict.auth.resetDialog.sending : dict.auth.resetDialog.submit}
            </Button>
          </CardFooter>
        </Card>
      </Dialog>
    </>
  );
}

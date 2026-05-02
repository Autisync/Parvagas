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

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DialogWithForm() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const { notify } = useAppNotifier();

  const handleOpen = () => setOpen((cur) => !cur);

  React.useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

  React.useEffect(() => {
    if (!success) return;
    notify(success, "success");
    setSuccess("");
  }, [success, notify]);

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Informe o email associado à sua conta.");
      return;
    }

    if (!emailRegex.test(email.trim())) {
      setError("Informe um email válido.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSuccess(response?.message || "Se existir uma conta com este email, será enviado um link de recuperação.");
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
        Esqueceu a palavra-passe?
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
              Recuperar Palavra-Passe
            </Typography>

            <Typography className="-mb-2 text-gray-900" variant="h6">
              Email associado à sua conta
            </Typography>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Typography
              className="font-normal text-xs text-gray-900"
              variant="paragraph"
              color="gray"
            >
              Vamos enviar um link para redefinir a palavra-passe da sua conta.
            </Typography>

          </CardBody>
          <CardFooter className="pt-0">
            <Button variant="gradient" type="button" onClick={handleSubmit} disabled={loading} fullWidth>
              {loading ? "A enviar..." : "Recuperar Palavra-Passe"}
            </Button>
          </CardFooter>
        </Card>
      </Dialog>
    </>
  );
}

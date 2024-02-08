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
  Checkbox,
} from "@material-tailwind/react";

export default function DialogWithForm() {
  const [open, setOpen] = React.useState(false);
  const handleOpen = () => setOpen((cur) => !cur);

  return (
    <>
      <a
        href="#"
        className="font-normal text-red-500 hover:text-red-400"
        onClick={handleOpen}
      >
        Esqueceu a palavra-passe?
      </a>
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
              Email associado a sua Conta
            </Typography>
            <Input label="Email" />
            <Typography
              className="font-normal text-xs text-gray-900"
              variant="paragraph"
              color="gray"
            >
              Vamos enviar um email para restorar a palavra-passe da sua cont
            </Typography>
          </CardBody>
          <CardFooter className="pt-0">
            <Button variant="gradient" onClick={handleOpen} fullWidth>
              Recuperar Palavra-Passe
            </Button>
          </CardFooter>
        </Card>
      </Dialog>
    </>
  );
}

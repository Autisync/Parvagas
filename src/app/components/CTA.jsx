"use client";
{
  /* <div className="z-50 bottom-10 right-4 fixed"> */
}

import { Tooltip, Typography } from "@material-tailwind/react";

export default function TooltipCustomStyles() {
  return (
    <div className="z-50 bottom-10 right-4 fixed">
      <Tooltip
        placement="bottom"
        className="border border-blue-gray-50 bg-red-500 px-4 py-3 shadow-xl shadow-black/10"
        content={
          <div className="w-80">
            <Typography color="blue-gray" className="font-medium">
              ParVagas Recrutamento
            </Typography>
            <Typography
              variant="small"
              color="blue-gray"
              className="font-normal opacity-80"
            >
              Estamos sempre disponiveis para ouvir o seu feedback. Para
              partilhar envie e-mail para{" "}
              <span className="text-gray-900">feedback@parvagas.co.ao </span>
            </Typography>
          </div>
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          className="h-5 w-5 cursor-pointer text-blue-gray-500"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
      </Tooltip>
    </div>
  );
}

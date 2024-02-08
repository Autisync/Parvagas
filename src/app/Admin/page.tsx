// import { BugAntIcon, ChatBubbleLeftRightIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import Image from "next/image";
import Logo from "/public/icon2.png";

export default function LogIn() {
  return (
    <div>
      <div className="flex min-h-full flex-col justify-center px-6 py-24 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <Image
            width={500}
            height={500}
            className="mx-auto h-20 w-auto"
            src={Logo}
            alt="Company Logo"
          />
          <h2 className="mt-5 text-center text-2xl font-bold leading-9 tracking-tight to-blue-500">
            Acesso ao Portal
          </h2>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <form className="space-y-6" action="#" method="POST">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium leading-6 text-balance"
              >
                Email
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-cyan-600 shadow-sm ring-1 ring-inset ring-red-500 focus:ring-2 focus:ring-inset focus:ring-balck sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-black"
                >
                  Palavra-passe
                </label>
                <div className="text-sm">
                  <a
                    href="#"
                    className="font-normal text-red-500 hover:text-red-400"
                  >
                    Esqueceu a palavra-passe?
                  </a>
                </div>
              </div>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-red-500 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="flex w-full justify-center rounded-md bg-red-500 px-3 py-1.5 text-sm font-normal leading-6 text-white shadow-sm  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 hover:bg-slate-900 duration-500 ease-in-out transform"
              >
                Aceder Portal
              </button>
            </div>
          </form>

          {/* <p className="mt-10 text-center text-sm text-gray-400">
            Not a member?
            <a
              href="#"
              className="font-semibold leading-6 text-red-500 hover:text-red-400"
            >
              Start a 7 days free trial
            </a>
          </p> */}
        </div>
      </div>
    </div>
  );
}

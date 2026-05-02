import Image from "next/image";
import Nav from "../components/DashboardContent/Nav";
import { Metadata } from "next";
import AdminOverviewBanner from "./AdminOverviewBanner";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Dasboard",
    description: "Plataforma útil para agerir talento Profissional submetido.",
    url: "https://parVagas.co.ao",
    siteName: "parVagas",
    images: [
      {
        url: "https://www.segucyber.ao/public/OG/homepage.png", // Must be an absolute URL
        width: 300,
        height: 300,
      },
      {
        url: "https://www.segucyber.ao/public/OG/homepage.png", // Must be an absolute URL
        width: 300,
        height: 300,
        alt: "Homepage",
      },
    ],
    locale: "pt",
    type: "website",
  },
};

export default function Dashboard() {
  return (
    <>
      <Nav />
      <div className="flex overflow-hidden bg-gray-50 w-full">
        <div
          id="main-content"
          className="h-full w-full bg-gray-50 relative overflow-y-auto"
        >
          <main>
            <div className="pt-6 px-4">
              <AdminOverviewBanner />
              <div className="w-full grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                {/* Número Total de CV coletados */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8  2xl:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-shrink-0">
                      <span className="text-2xl sm:text-3xl leading-none font-bold text-gray-900">
                        45,385
                      </span>
                      <h3 className="text-base font-normal text-gray-500 capitalize">
                        Número Total de CV coletados
                      </h3>
                    </div>
                    <div className="flex items-center justify-end flex-1 text-green-500 text-base font-bold">
                      12.5%
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                      <h3 className="text-xs font-normal text-gray-500 capitalize">
                        / Mes Passado
                      </h3>
                    </div>
                  </div>
                  <div id="main-chart"></div>
                </div>

                {/* Recem Candidatos */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8 ">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Recem Candidatos
                      </h3>
                      <span className="text-base font-normal text-gray-500">
                        Lista de candidatos mais recente
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      <a
                        href="#"
                        className="text-sm font-medium text-gray-700 hover:shadow-xl hover:scale-105 hover:bg-gray-900 duration-500 ease-in-out transform p-2 hover:text-white hover:rounded-xl rounded-md"
                      >
                        Ver Todos
                      </a>
                    </div>
                  </div>
                  <div className="flex flex-col mt-8">
                    <div className="overflow-x-auto rounded-lg">
                      <div className="align-middle inline-block min-w-full">
                        <div className="shadow overflow-hidden sm:rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th
                                  scope="col"
                                  className="p-4 text-left text-xs font-medium text-gray-500 capitalize tracking-wider"
                                >
                                  Nome - Profissão
                                </th>
                                <th
                                  scope="col"
                                  className="p-4 text-left text-xs font-medium text-gray-500 capitalize tracking-wider"
                                >
                                  Data
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              <tr>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-900">
                                  Victoria
                                  <span className="font-semibold"> RH</span>
                                </td>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-500">
                                  Apr 18 ,2021
                                </td>
                              </tr>

                              <tr className="bg-gray-50">
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-900 rounded-lg rounded-left">
                                  Kim{" "}
                                  <span className="font-semibold">
                                    Informatica
                                  </span>
                                </td>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-500">
                                  Apr 15 ,2021
                                </td>
                              </tr>

                              <tr>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-900">
                                  Madalena{" "}
                                  <span className="font-semibold">
                                    Metalurgica
                                  </span>
                                </td>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-500">
                                  Apr 15 ,2021
                                </td>
                              </tr>

                              <tr className="bg-gray-50">
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-900 rounded-lg rounded-left">
                                  Pedro{" "}
                                  <span className="font-semibold">Geologo</span>
                                </td>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-500">
                                  Apr 11 ,2021
                                </td>
                              </tr>

                              <tr>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-900">
                                  Mark{" "}
                                  <span className="font-semibold">
                                    Eng. de Minas
                                  </span>
                                </td>
                                <td className="p-4 whitespace-nowrap text-sm font-normal text-gray-500">
                                  Apr 6 ,2021
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Candidatos / Mes */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8 ">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl sm:text-3xl leading-none font-bold text-gray-900">
                        2,340
                      </span>
                      <h3 className="text-base font-normal text-gray-500">
                        Candidatos / Mes
                      </h3>
                    </div>
                    <div className="ml-5 w-0 flex items-center justify-end flex-1 text-green-500 text-base font-bold">
                      14.6%
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Visitors / Mes */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8 ">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl sm:text-3xl leading-none font-bold text-gray-900">
                        5,355
                      </span>
                      <h3 className="text-base font-normal text-gray-500">
                        Visitors / Mes
                      </h3>
                    </div>
                    <div className="ml-5 w-0 flex items-center justify-end flex-1 text-green-500 text-base font-bold">
                      32.9%
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Candidatos empregados */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8 ">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="text-2xl sm:text-3xl leading-none font-bold text-gray-900">
                        385
                      </span>
                      <h3 className="text-base font-normal text-gray-500">
                        Candidatos empregados
                      </h3>
                    </div>
                    <div className="ml-5 w-0 flex items-center justify-end flex-1 text-red-500 text-base font-bold">
                      -2.7%
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-2 xl:gap-4 my-4">
                {/* Taxa de aceitação da oferta */}
                <div className="bg-white shadow rounded-lg mb-4 p-4 sm:p-6 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-shrink-0">
                      <span className="text-2xl sm:text-3xl leading-none font-bold text-gray-900">
                        45%
                      </span>
                      <h3 className="text-base font-normal text-gray-500 capitalize">
                        Taxa de aceitação da oferta
                      </h3>
                    </div>
                    <div className="flex items-center justify-end flex-1 text-green-500 text-base font-bold">
                      12.5%
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                      <h3 className="text-xs font-normal text-gray-500 capitalize">
                        / Mes Passado
                      </h3>
                    </div>
                  </div>
                  <div id="main-chart"></div>
                </div>

                {/* Talentos disponíveis / Profissão */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8 ">
                  <h3 className="text-xl leading-none font-bold text-gray-900 mb-10">
                    Talentos disponíveis / Profissão
                  </h3>
                  <div className="block w-full overflow-x-auto">
                    <table className="items-center w-full bg-transparent border-collapse">
                      <thead>
                        <tr>
                          <th className="px-4 bg-gray-50 text-gray-700 align-middle py-3 text-xs font-semibold text-left uppercase border-l-0 border-r-0 whitespace-nowrap">
                            Profissão
                          </th>
                          <th className="px-4 bg-gray-50 text-gray-700 align-middle py-3 text-xs font-semibold text-left uppercase border-l-0 border-r-0 whitespace-nowrap">
                            Talento Disponivel
                          </th>
                          <th className="px-4 bg-gray-50 text-gray-700 align-middle py-3 text-xs font-semibold text-left uppercase border-l-0 border-r-0 whitespace-nowrap min-w-140-px"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {/* Eng. de Mina */}
                        <tr className="text-gray-500">
                          <th className="border-t-0 px-4 align-middle text-sm font-normal whitespace-nowrap p-4 text-left">
                            Eng. de Mina
                          </th>
                          <td className="border-t-0 px-4 align-middle text-xs font-medium text-gray-900 whitespace-nowrap p-4">
                            5,649
                          </td>
                          <td className="border-t-0 px-4 align-middle text-xs whitespace-nowrap p-4">
                            <div className="flex items-center">
                              <span className="mr-2 text-xs font-medium">
                                30%
                              </span>
                              <div className="relative w-full">
                                <div className="w-full bg-gray-200 rounded-sm h-2">
                                  <div
                                    className="bg-cyan-600 h-2 rounded-sm"
                                    style={{ width: "30%" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {/* Administrador */}
                        <tr className="text-gray-500">
                          <th className="border-t-0 px-4 align-middle text-sm font-normal whitespace-nowrap p-4 text-left">
                            Administrador
                          </th>
                          <td className="border-t-0 px-4 align-middle text-xs font-medium text-gray-900 whitespace-nowrap p-4">
                            4,025
                          </td>
                          <td className="border-t-0 px-4 align-middle text-xs whitespace-nowrap p-4">
                            <div className="flex items-center">
                              <span className="mr-2 text-xs font-medium">
                                24%
                              </span>
                              <div className="relative w-full">
                                <div className="w-full bg-gray-200 rounded-sm h-2">
                                  <div
                                    className="bg-orange-300 h-2 rounded-sm"
                                    style={{ width: "24%" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {/* Recursos Humano */}
                        <tr className="text-gray-500">
                          <th className="border-t-0 px-4 align-middle text-sm font-normal whitespace-nowrap p-4 text-left">
                            Recursos Humano
                          </th>
                          <td className="border-t-0 px-4 align-middle text-xs font-medium text-gray-900 whitespace-nowrap p-4">
                            3,105
                          </td>
                          <td className="border-t-0 px-4 align-middle text-xs whitespace-nowrap p-4">
                            <div className="flex items-center">
                              <span className="mr-2 text-xs font-medium">
                                18%
                              </span>
                              <div className="relative w-full">
                                <div className="w-full bg-gray-200 rounded-sm h-2">
                                  <div
                                    className="bg-teal-400 h-2 rounded-sm"
                                    style={{ width: "18%" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {/* Ciber Segurança */}
                        <tr className="text-gray-500">
                          <th className="border-t-0 px-4 align-middle text-sm font-normal whitespace-nowrap p-4 text-left">
                            Ciber Segurança
                          </th>
                          <td className="border-t-0 px-4 align-middle text-xs font-medium text-gray-900 whitespace-nowrap p-4">
                            1251
                          </td>
                          <td className="border-t-0 px-4 align-middle text-xs whitespace-nowrap p-4">
                            <div className="flex items-center">
                              <span className="mr-2 text-xs font-medium">
                                12%
                              </span>
                              <div className="relative w-full">
                                <div className="w-full bg-gray-200 rounded-sm h-2">
                                  <div
                                    className="bg-pink-600 h-2 rounded-sm"
                                    style={{ width: "12%" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Outros */}
                        <tr className="text-gray-500">
                          <th className="border-t-0 px-4 align-middle text-sm font-normal whitespace-nowrap p-4 text-left">
                            Outros
                          </th>
                          <td className="border-t-0 px-4 align-middle text-xs font-medium text-gray-900 whitespace-nowrap p-4">
                            734
                          </td>
                          <td className="border-t-0 px-4 align-middle text-xs whitespace-nowrap p-4">
                            <div className="flex items-center">
                              <span className="mr-2 text-xs font-medium">
                                9%
                              </span>
                              <div className="relative w-full">
                                <div className="w-full bg-gray-200 rounded-sm h-2">
                                  <div
                                    className="bg-indigo-600 h-2 rounded-sm"
                                    style={{ width: "9%" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Eng. Eletrico */}
                        <tr className="text-gray-500">
                          <th className="border-t-0 align-middle text-sm font-normal whitespace-nowrap p-4 pb-0 text-left">
                            Eng. Eletrico
                          </th>
                          <td className="border-t-0 align-middle text-xs font-medium text-gray-900 whitespace-nowrap p-4 pb-0">
                            456
                          </td>
                          <td className="border-t-0 align-middle text-xs whitespace-nowrap p-4 pb-0">
                            <div className="flex items-center">
                              <span className="mr-2 text-xs font-medium">
                                7%
                              </span>
                              <div className="relative w-full">
                                <div className="w-full bg-gray-200 rounded-sm h-2">
                                  <div
                                    className="bg-purple-500 h-2 rounded-sm"
                                    style={{ width: "7%" }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <p className="text-center text-sm leading-3 text-gray-600 my-5">
            Copyright &copy;{new Date().getFullYear()} ParVagas - All rights
            reserved.
          </p>
        </div>
      </div>
    </>
  );
}

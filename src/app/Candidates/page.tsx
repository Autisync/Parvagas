import Image from "next/image";
import Nav from "../components/DashboardContent/Nav";
import { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Candidatos",
    description: "List de Candidatos",
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
          className="h-full w-full bg-gray-50 relative overflow-y-auto "
        >
          <main>
            <div className="pt-6 px-4">
              {/* Stats */}
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
                        535
                      </span>
                      <h3 className="text-base font-normal text-gray-500">
                        Candidatos com Experiença em Oil & Gas
                      </h3>
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
                      34
                      <h3 className="text-xs font-normal text-gray-500 capitalize">
                        - este Mes
                      </h3>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-1 xl:gap-4 my-4">
                {/* Talentos disponíveis */}
                <div className="bg-white shadow rounded-lg p-4 sm:p-6 xl:p-8 ">
                  <h3 className="text-xl leading-none font-bold text-gray-900 mb-10">
                    Talentos disponíveis
                  </h3>
                  {/* Search */}
                  <div className="flex float-end text-xl leading-none font-bold text-gray-900 mb-10">
                    <form action="#" method="GET" className="">
                      <label htmlFor="mobile-search" className="sr-only">
                        Search
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg
                            className="w-5 h-5 text-gray-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                          </svg>
                        </div>
                        <input
                          type="text"
                          name="email"
                          id="topbar-search"
                          className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-cyan-600 focus:border-cyan-600 block w-full px-10 p-2.5"
                          placeholder="Pesquisar"
                        />
                      </div>
                    </form>
                  </div>
                  {/* Search end */}

                  {/* Candidates data */}
                  {/* Not complete */}
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

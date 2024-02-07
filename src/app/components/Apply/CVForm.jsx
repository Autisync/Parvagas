/*
  This example requires some changes to your config:
  
  ```
  // tailwind.config.js
  module.exports = {
    // ...
    plugins: [
      // ...
      require('@tailwindcss/forms'),
    ],
  }
  ```
*/
import {
  DocumentArrowUpIcon,
  PhotoIcon,
  UserCircleIcon,
} from "@heroicons/react/24/solid";

export default function CVForm() {
  return (
    <div className="p-28 px-10 sm:px-32 bg-gray-900">
      <form>
        <div className="space-y-12">
          <div className="border-b border-white/10 pb-12">
            <h2 className=" text-3xl font-semibold leading-7 text-white pb-2">
              Envie o seu CV Hoje!
            </h2>
            <p className="mt-1 text-base leading-6 text-gray-400">
              Temos uma base de dados para ajudar transformar o seu futuro
              profissional hoje!
            </p>
          </div>

          <div className="border-b border-white/10 pb-12">
            <h2 className="text-base font-semibold leading-7 text-white">
              Informação Pessoal
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
            Use um endereço permanente onde você possa receber correspondências.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              {/* Nome */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="first-name"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Nome Completo
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="first-name"
                    id="first-name"
                    autoComplete="given-name"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Data de Nascimento */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="last-name"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Data de Nascimento
                </label>
                <div className="mt-2">
                  <input
                    type="date"
                    name="last-name"
                    id="last-name"
                    autoComplete="family-name"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Email */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Email address
                </label>
                <div className="mt-2">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Contacto Telefonico */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="tel"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Contacto Telefonico
                </label>
                <div className="mt-2">
                  <input
                    id="tel"
                    name="tel"
                    type="text"
                    autoComplete="tel"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Sexo */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="sexo"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Sexo
                </label>
                <div className="mt-2">
                  <select
                    id="sexo"
                    name="sexo"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 [&_*]:text-black"
                  >
                    <option>Masculino</option>
                    <option>Feminino</option>
                    <option>Binary</option>
                    <option>Prefiro nao Especificar</option>
                  </select>
                </div>
              </div>
              {/* Habilitação Académica */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="country"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Habilitação Académica
                </label>
                <div className="mt-2">
                  <select
                    id="country"
                    name="country"
                    autoComplete="country-name"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 [&_*]:text-black"
                  >
                    <option>Ensino Medio</option>
                    <option>Bachelarado</option>
                    <option>Licenciatura</option>
                    <option>Mestrado</option>
                    <option>Doutourado</option>
                  </select>
                </div>
              </div>
              {/* Profissão */}
              <div className="sm:col-span-2 sm:col-start-1">
                <label
                  htmlFor="profession"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Profissão
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="profession"
                    id="profession"
                    autoComplete="address-level2"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Oil & Gas Experience */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="experience"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Experiença Oil & Gas?
                </label>

                <div className="mt-2">
                  <select
                    id="experience"
                    name="experience"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 [&_*]:text-black"
                  >
                    <option>Sim</option>
                    <option>Não</option>
                  </select>
                </div>
              </div>
              {/* Experiença Geral */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="overall_experience"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Anos Experiença Profissional
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    name="overall_experience"
                    id="overall_experience"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              {/* Residencia Angolano */}
              <div className="col-span-full">
                <label
                  htmlFor="street-address"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Residencia Angolano
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="street-address"
                    id="street-address"
                    autoComplete="street-address"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              {/* Cidade */}
              <div className="sm:col-span-2 sm:col-start-1">
                <label
                  htmlFor="city"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Cidade
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="city"
                    id="city"
                    autoComplete="address-level2"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Empregadora atual */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="region"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Empregadora atual
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="region"
                    id="region"
                    autoComplete="address-level1"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Nacionalidade */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="nacionalidade"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Nacionalidade
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="nacionalidade"
                    id="nacionalidade"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              {/* Defende a tua Personalidade */}
              <div className="col-span-full">
                <label
                  htmlFor="about"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Defende a tua Personalidade
                </label>
                <div className="mt-2">
                  <textarea
                    id="about"
                    name="about"
                    rows={3}
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                    defaultValue={""}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-400">
                  Por que devemos considerar-te como um candidato potencial.
                </p>
              </div>
              {/* Upload CV */}
              <div className="col-span-full">
                <label
                  htmlFor="cover-photo"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Curriculum Vitae
                </label>
                <div className="mt-2 flex justify-center rounded-lg border border-dashed border-white/25 px-6 py-10">
                  <div className="text-center">
                    <DocumentArrowUpIcon
                      className="mx-auto h-12 w-12 text-gray-500"
                      aria-hidden="true"
                    />
                    <div className="mt-4 flex text-sm leading-6 text-gray-400">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md bg-gray-900 font-semibold text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-red-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 hover:text-red-500"
                      >
                        <span className="p-2">Descarga de ficheiro</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                        />
                      </label>
                      <p className="pl-1">ou arraste e solte</p>
                    </div>
                    <p className="text-xs leading-5 text-gray-400">
                      PDF, docx up to 10MB
                    </p>
                  </div>
                </div>
              </div>
              {/* Upload extra files */}
              <div className="col-span-full">
                <label
                  htmlFor="cover-photo"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Outros Documentos (Certificados, carta de apresentação e etc.
                  - Junte em um unico ficheiro formato PDF)
                </label>
                <div className="mt-2 flex justify-center rounded-lg border border-dashed border-white/25 px-6 py-10">
                  <div className="text-center">
                    <DocumentArrowUpIcon
                      className="mx-auto h-12 w-12 text-gray-500"
                      aria-hidden="true"
                    />
                    <div className="mt-4 flex text-sm leading-6 text-gray-400">
                      <label
                        htmlFor="extrafile-upload"
                        className="relative cursor-pointer rounded-md bg-gray-900 font-semibold text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-red-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 hover:text-red-500"
                      >
                        <span className="p-2">Descarga de ficheiro</span>
                        <input
                          id="extrafile-upload"
                          name="extrafile-upload"
                          type="file"
                          className="sr-only"
                        />
                      </label>
                      <p className="pl-1">ou arraste e solte</p>
                    </div>
                    <p className="text-xs leading-5 text-gray-400">
                      PDF, docx up to 10MB
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-white/10 pb-12">
            <h2 className="text-base font-semibold leading-7 text-white">
              Autorização legal
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              <input
                title="agree"
                id="push-email"
                name="push-notifications"
                type="checkbox"
                className="pl-2 h-4 w-4 border-white/10 bg-white/5 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
              />{" "}
              Concordo e garanto à ParVagas a segurança e o processamento das
              informações que forneci e considero que são verdadeiras.
            </p>

            {/* <div className="mt-10 space-y-10">
              <fieldset>
                <legend className="text-sm font-semibold leading-6 text-white">
                  By Email
                </legend>
                <div className="mt-6 space-y-6">
                  <div className="relative flex gap-x-3">
                    <div className="flex h-6 items-center">
                      <input
                        id="comments"
                        name="comments"
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
                      />
                    </div>
                    <div className="text-sm leading-6">
                      <label
                        htmlFor="comments"
                        className="font-medium text-white"
                      >
                        Comments
                      </label>
                      <p className="text-gray-400">
                        Get notified when someones posts a comment on a posting.
                      </p>
                    </div>
                  </div>
                  <div className="relative flex gap-x-3">
                    <div className="flex h-6 items-center">
                      <input
                        id="candidates"
                        name="candidates"
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
                      />
                    </div>
                    <div className="text-sm leading-6">
                      <label
                        htmlFor="candidates"
                        className="font-medium text-white"
                      >
                        Candidates
                      </label>
                      <p className="text-gray-400">
                        Get notified when a candidate applies for a job.
                      </p>
                    </div>
                  </div>
                  <div className="relative flex gap-x-3">
                    <div className="flex h-6 items-center">
                      <input
                        id="offers"
                        name="offers"
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
                      />
                    </div>
                    <div className="text-sm leading-6">
                      <label
                        htmlFor="offers"
                        className="font-medium text-white"
                      >
                        Offers
                      </label>
                      <p className="text-gray-400">
                        Get notified when a candidate accepts or rejects an
                        offer.
                      </p>
                    </div>
                  </div>
                </div>
              </fieldset>
            </div> */}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-x-6">
          <button
            type="submit"
            className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-lg hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 duration-500 ease-in-out transform"
          >
            Submeter Curriculo
          </button>
        </div>
      </form>
    </div>
  );
}

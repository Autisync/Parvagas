"use client";
import {
  DocumentArrowUpIcon,
  PhotoIcon,
  UserCircleIcon,
} from "@heroicons/react/24/solid";
import { useState } from "react";

export default function CVForm() {
  const initialFormData = {
    'fullName': '',
    'dateOfBirth': '',
    'email': '',
    'cellphoneContact': '',
    'gender': '',
    'qualification': '',
    'profession': '',
    'expirienceInOilGas': '',
    'overall_experience': '',
    'residencialAddress': '',
    'city': '',
    'currentEmployer': '',
    'nationality': '',
    'personalStatement': '',
    'file-upload': '',       
    'extrafile-upload': [],   
  };
  const [email, setEmail] = useState("");

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
  };

  const [formData, setFormData] = useState(initialFormData);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("formData: ",formData)
    // Call a function to send the form data to the backend
    // sendDataToBackend(formData);  
  };

  const sendDataToBackend = async (formData) => {
   
    try {
      const response = await fetch('http://localhost:3001/applications/application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
  
      if (response.ok) {
        // Handle success, e.g., show a success message or redirect
        console.log('Data sent successfully');
      } else {
        // Handle error, e.g., show an error message
        console.error('Failed to send data to the backend');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };
  
  return (
    <div className="p-28 px-10 sm:px-32 bg-gray-900">
      <form  onSubmit={handleSubmit} enctype="multipart/form-data">
        {/* Form content */}
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
            <h2 className="text-xl font-bold leading-7 text-red-500">
              Informação Pessoal
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Use um endereço permanente onde você possa receber
              correspondências.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              {/* Nome */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Nome Completo
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="fullName"
                    id="fullName"
                    value={formData["first-name"]}
                    onChange={handleInputChange}
                    autoComplete="given-name"
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Data de Nascimento */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="dateOfBirth"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Data de Nascimento
                </label>
                <div className="mt-2">
                  <input
                    type="date"
                    name="dateOfBirth"
                    id="dateOfBirth"
                    value={formData["dateOfBirth"]}
                    onChange={handleInputChange}
                    autoComplete="family-name"
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 px-1 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
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
                    value={formData.email}
                    onChange={handleInputChange}
                    type="email"
                    autoComplete="email"
                    className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 px-2 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Contacto Telefonico */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="cellphoneContact"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Contacto Telefonico
                </label>
                <div className="mt-2">
                  <input
                    id="cellphoneContact"
                    name="cellphoneContact"
                    type="text"
                    value={formData.cellphoneContact}
                    onChange={handleInputChange}
                    autoComplete="cellphoneContact"
                    className="block w-full rounded-md px-2 border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* gender */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="gender"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Sexo
                </label>
                <div className="mt-2">
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 [&_*]:text-black"
                  >
                    <option value="">Escolha</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Binario">Binario</option>
                    <option value="Prefiro nao Especificar">Prefiro nao Especificar</option>
                  </select>
                </div>
              </div>
              {/* Habilitação Académica */}
              <div className="sm:col-span-3">
                <label
                  htmlFor="qualification"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Habilitação Académica
                </label>
                <div className="mt-2">
                  <select
                    id="qualification"
                    name="qualification"
                    autoComplete="qualification-name"
                    value={formData.qualification}
                    onChange={handleInputChange}
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 [&_*]:text-black"
                  >
                    <option value="">Escolha</option>
                    <option value="Ensino Médio">Ensino Médio</option>
                    <option value="Certificado">Certificado</option>
                    <option value="Curso Técnico">Curso Técnico</option>
                    <option value="Grau de Associado">Grau de Associado</option>
                    <option value="Bachelarado">Bachelarado</option>
                    <option value="Licenciatura">Licenciatura</option>
                    <option value="Mestrado">Mestrado</option>
                    <option value="Doutourado">Doutourado</option>
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
                    value={formData.profession}
                    onChange={handleInputChange}
                    autoComplete="profession"
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Oil & Gas expiriencia */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="expirienceInOilGas"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Experiência Oil & Gas?
                </label>

                <div className="mt-2">
                  <select
                    id="expirienceInOilGas"
                    name="expirienceInOilGas"
                    value={formData.expirienceInOilGas}
                    
                    onChange={handleInputChange}
                    className="block px-2 w-full rounded-md border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 [&_*]:text-black"
                  >
                    {/* <option>Escolha</option> */}
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
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
                    value={formData.overall_experience}
                    onChange={handleInputChange}
                    className="block w-full rounded-md px-2 border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              {/* Residencia Angolano */}
              <div className="col-span-full">
                <label
                  htmlFor="residencialAddress"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Endereço Físico
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="residencialAddress"
                    id="residencialAddress"
                    value={formData["residencialAddress"]}
                    onChange={handleInputChange}
                    autoComplete="residencialAddress"
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
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
                    value={formData.city}
                    onChange={handleInputChange}
                    autoComplete="address-level2"
                    className="block w-full rounded-md px-2 border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* Empregadora atual */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="currentEmployer"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Empregadora atual
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="currentEmployer"
                    id="currentEmployer"
                    value={formData.currentEmployer}
                    onChange={handleInputChange}
                    autoComplete="address-level1"
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
              {/* nationality */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="nationality"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  nationalidade
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="nationality"
                    id="nationality"
                    value={formData.nationality}
                    onChange={handleInputChange}
                    className="block w-full px-2 rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              {/* Defende a tua Personalidade */}
              <div className="col-span-full">
                <label
                  htmlFor="personalStatement"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Defende a tua Personalidade
                </label>
                <div className="mt-2">
                  <textarea
                    id="personalStatement"
                    name="personalStatement"
                    rows={3}
                    value={formData.personalStatement}
                    onChange={handleInputChange}
                    className=" px-2 block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
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
                          value={formData["file-upload"]}
                          onChange={handleInputChange}
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
                {/* Label */}
                <label
                  htmlFor="cover-photo"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Outros Documentos (Certificados, carta de apresentação e etc.
                  - Junte em um unico ficheiro formato PDF)
                </label>
                {/* Input */}
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
                          value={formData["extrafile-upload"]}
                          onChange={handleInputChange}
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

              <h2 className="text-xl font-bold leading-7 text-red-500 w-full">
                Criação de Conta PARVAGAS
              </h2>
              {/* EMAIL for account creation */}
              {/* <div className="sm:col-span-2 sm:col-start-1">
                <label
                  htmlFor="city"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Email/Username
                </label>
                <div className="mt-2">
                  <input
                    type="email_two"
                    name="email_two"
                    id="email"
                    value={email} // Bind value to state
                    onChange={() => {}} // Disable input
                    disabled
                    autoComplete="address-level2"
                    className="block w-full rounded-md px-2 border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div> */}
              {/* Password for account creation  */}
              {/* <div className="sm:col-span-2">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Palavra-Passe
                </label>
                <div className="mt-2">
                  <input
                    type="password"
                    name="Password"
                    id="password"
                    autoComplete="password"
                    className="px-2 block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div> */}
              {/* Password for account creation  */}
              {/* <div className="sm:col-span-2">
                <label
                  htmlFor="password_valid"
                  className="block text-sm font-medium leading-6 text-white"
                >
                  Confirme Palavra-Passe
                </label>
                <div className="mt-2">
                  <input
                    type="password"
                    name="password_valid"
                    id="password_valid"
                    className=" px-2 block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/20 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6"
                  />
                </div>
              </div> */}
            </div>
          </div>

          {/* Terms adn conditions */}
          <div className="border-b border-white/10 pb-12">
            <h2 className="text-base font-semibold leading-7 text-white">
              Autorização legal
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              {/* <input
                title="agree"
                id="push-email"
                name="push-notifications"
                type="checkbox"
                className="pl-2 h-4 w-4 border-white/10 bg-white/5 text-red-600 focus:ring-red-600 focus:ring-offset-gray-900"
              />{" "} */}
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
                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-red-600 focus:ring-red-600 focus:ring-offset-gray-900"
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
                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-red-600 focus:ring-red-600 focus:ring-offset-gray-900"
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
                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-red-600 focus:ring-red-600 focus:ring-offset-gray-900"
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

        {/* Submit button */}
        <div className="mt-6 flex items-center justify-end gap-x-6">
          <button
            type="submit"
            className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-lg hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 duration-500 ease-in-out transform"
          >
            Submeter
          </button>
        </div>
      </form>
    </div>
  );
}

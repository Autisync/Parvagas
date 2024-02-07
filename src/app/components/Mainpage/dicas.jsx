import Image from "next/image";

const posts = [
  {
    id: 1,
    title: "Como Compilar um CV Profiisional",
    href: "#",
    description:
      "A busca por um espaço no mercado de trabalho Angolano pode ser bem diferente de muitos outros lugars.Ao aplicar para uma vaga de emprego em Angola, por exemplo, além de caprichar no currículo e no perfil do LinkedIn, é essencial preparar uma boa carta de apresentação.",
    date: "Mar 16, 2023",
    datetime: "2023-03-16",
    category: { title: "Marketing", href: "#" },
    author: {
      name: "D.A Miguel",
      role: "Co-Founder",
      href: "#",
      imageUrl:
        "https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
  },
  {
    id: 2,
    title: "Como se apresentar em uma Entrevista",
    href: "#",
    description:
      "Todos, sem exceção, tem uma história para contar. E não importa se é alguém que se prepara para sua primeira entrevista de emprego ou se candidata a um cargo de alto nível executivo, a estrutura de uma boa apresentação pessoal é sempre a mesma.",
    date: "Dez 23, 2023",
    datetime: "2023-12-23",
    category: { title: "Recursos Humanos", href: "#" },
    author: {
      name: "Tavarez Kint",
      role: "Phd em Recursos Humanos",
      href: "#",
      imageUrl:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
  },
  {
    id: 3,
    title: "Como Pedir um Aumento por E-mail",
    href: "#",
    description:
      "Pedir um aumento pode ser uma experiência bastante assustadora. Colocar o pedido em um e-mail cuidadosamente redigido pode ajudá-lo a esclarecer as expectativas e a organizar os pensamentos.",
    date: "Dez 23, 2023",
    datetime: "2023-12-23",
    category: { title: "Finanças", href: "#" },
    author: {
      name: "Joana Suarez",
      role: "Analista Financeira",
      href: "#",
      imageUrl:
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
  },
  // More posts...
];

export default function Dicas() {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:mx-0">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Dicas para Colaboradores
          </h2>
          <p className="mt-2 text-lg leading-8 text-gray-600">
            Estamos sempre ao teu lado, torcendo pelo teu sucesso. Oferecemos
            dicas para ajudar na tua jornada de independência financeira, desde
            estratégias de investimento até sugestões de economia de custos.
            Estamos comprometidos em ajudar-te a alcançar os teus objetivos
            financeiros e a criar um futuro próspero.
          </p>
        </div>
        <div className=" mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {posts.map((post) => (
            <article
              key={post.id}
              className="flex max-w-xl flex-col items-start justify-between hover:bg-slate-50 p-2 rounded-lg hover:shadow-md ease-in-out transform duration-500"
            >
              <div className="flex items-center gap-x-4 text-xs">
                <time dateTime={post.datetime} className="text-gray-500">
                  {post.date}
                </time>
                <a
                  href={post.category.href}
                  className="relative z-10 rounded-full bg-gray-50 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100"
                >
                  {post.category.title}
                </a>
              </div>
              <div className="group relative">
                <h3 className="mt-3 text-lg font-semibold leading-6 text-gray-900 group-hover:text-gray-600">
                  <a href={post.href}>
                    <span className="absolute inset-0" />
                    {post.title}
                  </a>
                </h3>
                <p className="mt-5 line-clamp-3 text-sm leading-6 text-gray-600">
                  {post.description}
                </p>
              </div>
              <div className="relative mt-8 flex items-center gap-x-4">
                <Image
                  width={500}
                  height={500}
                  src={post.author.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded-full bg-gray-50"
                />
                <div className="text-sm leading-6">
                  <p className="font-semibold text-gray-900">
                    <a href={post.author.href}>
                      <span className="absolute inset-0" />
                      {post.author.name}
                    </a>
                  </p>
                  <p className="text-gray-600">{post.author.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

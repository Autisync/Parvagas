"""Curated career-tips / blog content for the public site.

This is editorial content with a low change rate, so it is served from a
versioned Python module rather than a database table. Each entry maps directly
to the shape the Next.js pages expect:

* list / homepage cards use: _id, slug, title, category, excerpt, readTime,
  publishedAt, featuredOnHome
* the article page additionally uses: author, coverImage, body[], takeaways[]

Paragraphs in ``body`` may use ``**bold**`` spans — the frontend renders them.
To publish a new article, append a dict here (keep ``slug`` unique) and
redeploy. A future iteration can migrate this to an admin-managed table without
changing the public API contract.
"""
from __future__ import annotations

from typing import Any

# Ordered newest-first. ``published_at`` is ISO-8601 (UTC).
CAREER_POSTS: list[dict[str, Any]] = [
    {
        "id": "cv-que-passa-nos-filtros",
        "slug": "cv-que-passa-nos-filtros-ats",
        "title": "Como escrever um CV que passa nos filtros automáticos (ATS)",
        "category": "CV",
        "author": "Equipa Parvagas",
        "read_time": "6 min",
        "published_at": "2026-06-20T09:00:00Z",
        "featured_on_home": True,
        "cover_image": None,
        "excerpt": (
            "Muitas empresas em Angola já usam sistemas que leem o seu CV antes "
            "de um recrutador. Saiba como estruturar o documento para não ser "
            "eliminado logo na triagem."
        ),
        "body": [
            "Um **ATS** (Applicant Tracking System) é um programa que organiza e "
            "filtra candidaturas. Cada vez mais empresas em Luanda e nas "
            "províncias usam estas ferramentas, sobretudo para vagas com muitos "
            "candidatos. Se o seu CV não estiver legível para a máquina, pode "
            "nunca chegar a olhos humanos.",
            "**Use um formato simples.** Evite tabelas complexas, caixas de "
            "texto, imagens e colunas múltiplas para informação essencial. "
            "Prefira um título claro, secções bem identificadas (Experiência, "
            "Formação, Competências) e texto corrido.",
            "**Inclua as palavras-chave do anúncio.** Se a vaga pede "
            "\"gestão de stock\" ou \"Excel avançado\", use exatamente esses "
            "termos quando forem verdade. O sistema procura correspondências "
            "entre o anúncio e o seu CV.",
            "**Guarde em PDF, salvo indicação contrária.** O PDF preserva a "
            "formatação na maioria dos sistemas modernos. Confirme sempre o que "
            "o anúncio pede — alguns ainda preferem Word.",
            "**Não esconda texto.** Escrever palavras-chave em branco ou em "
            "letra minúscula para enganar o sistema é detetado e leva à "
            "exclusão. Seja honesto e específico.",
        ],
        "takeaways": [
            "Estrutura simples: secções claras, sem tabelas ou imagens para dados essenciais.",
            "Reutilize as palavras-chave do anúncio quando correspondem à sua experiência.",
            "PDF é o formato mais seguro, exceto se pedirem outro.",
            "Nunca tente enganar o filtro com texto escondido.",
        ],
    },
    {
        "id": "preparar-entrevista-presencial",
        "slug": "preparar-entrevista-emprego-angola",
        "title": "Preparar uma entrevista de emprego em Angola: guia prático",
        "category": "Entrevista",
        "author": "Equipa Parvagas",
        "read_time": "7 min",
        "published_at": "2026-06-14T09:00:00Z",
        "featured_on_home": True,
        "cover_image": None,
        "excerpt": (
            "A entrevista é onde a candidatura se decide. Veja como pesquisar a "
            "empresa, responder às perguntas difíceis e causar boa impressão."
        ),
        "body": [
            "**Pesquise a empresa antes de ir.** Saiba o que faz, em que setor "
            "atua e, se possível, notícias recentes. Demonstrar que conhece a "
            "organização mostra interesse genuíno e diferencia-o de outros "
            "candidatos.",
            "**Prepare a sua apresentação.** Quase todas as entrevistas começam "
            "com \"fale-me de si\". Tenha uma resposta de 60 a 90 segundos que "
            "ligue o seu percurso à vaga — não conte a história toda da sua "
            "vida.",
            "**Antecipe as perguntas comuns:** porque saiu do emprego anterior, "
            "quais os seus pontos fortes e fracos, e onde se vê daqui a alguns "
            "anos. Respostas honestas e concretas valem mais do que frases "
            "decoradas.",
            "**Leve documentos e chegue cedo.** Leve cópias do CV e dos "
            "certificados. Planeie o trajeto em Luanda contando com o trânsito; "
            "chegar 10 a 15 minutos antes transmite seriedade.",
            "**Tenha perguntas para o fim.** Pergunte sobre a equipa, os "
            "objetivos da função ou os próximos passos do processo. Quem "
            "pergunta demonstra envolvimento.",
        ],
        "takeaways": [
            "Pesquise a empresa e relacione o seu percurso com a vaga.",
            "Treine a apresentação inicial de 60-90 segundos.",
            "Leve cópias de CV e certificados e chegue cedo.",
            "Prepare 2 ou 3 perguntas para fazer ao entrevistador.",
        ],
    },
    {
        "id": "carta-apresentacao-eficaz",
        "slug": "carta-de-apresentacao-eficaz",
        "title": "Carta de apresentação: vale a pena e como fazer uma boa",
        "category": "Carreira",
        "author": "Equipa Parvagas",
        "read_time": "5 min",
        "published_at": "2026-06-08T09:00:00Z",
        "featured_on_home": False,
        "cover_image": None,
        "excerpt": (
            "Uma carta curta e personalizada pode dar contexto ao seu CV e "
            "mostrar motivação. Saiba o que incluir e o que evitar."
        ),
        "body": [
            "A carta de apresentação não substitui o CV — complementa-o. Serve "
            "para explicar **porque** se candidata e **o que** traz para a "
            "função, em três ou quatro parágrafos curtos.",
            "**Personalize sempre.** Uma carta genérica enviada para dezenas de "
            "vagas nota-se de imediato. Mencione o nome da empresa e a função "
            "específica.",
            "**Primeiro parágrafo:** diga a que vaga se candidata e uma razão "
            "forte de interesse. **Parágrafos do meio:** ligue uma ou duas "
            "experiências concretas às necessidades do anúncio. **Fecho:** "
            "mostre disponibilidade e agradeça.",
            "**Seja breve.** Meia página chega. Recrutadores leem muitas "
            "candidaturas; objetividade é uma vantagem.",
        ],
        "takeaways": [
            "A carta complementa o CV, não o repete.",
            "Personalize com o nome da empresa e da função.",
            "Estrutura: interesse, prova concreta, fecho.",
            "Mantenha-a com meia página, no máximo.",
        ],
    },
    {
        "id": "trabalho-remoto-angola",
        "slug": "encontrar-trabalho-remoto-a-partir-de-angola",
        "title": "Como encontrar trabalho remoto a partir de Angola",
        "category": "Remoto",
        "author": "Equipa Parvagas",
        "read_time": "8 min",
        "published_at": "2026-05-30T09:00:00Z",
        "featured_on_home": True,
        "cover_image": None,
        "excerpt": (
            "O trabalho remoto abre portas para empresas de todo o mundo. Veja "
            "que competências valorizam, como se candidatar e como gerir os "
            "desafios locais."
        ),
        "body": [
            "O trabalho remoto deixou de ser exceção. Para profissionais em "
            "Angola, representa acesso a oportunidades que antes exigiam "
            "emigrar — mas também exige preparação específica.",
            "**Invista nas competências mais procuradas:** programação, design, "
            "marketing digital, redação, apoio ao cliente e gestão de "
            "projetos. Muitas destas áreas têm formação gratuita ou de baixo "
            "custo online.",
            "**Prepare uma boa ligação e um espaço de trabalho.** A "
            "fiabilidade da internet é avaliada pelos empregadores remotos. "
            "Ter um plano de dados de reserva pode ser decisivo.",
            "**Construa um portefólio.** Em áreas técnicas e criativas, mostrar "
            "trabalho concreto vale mais do que o diploma. Reúna exemplos, "
            "mesmo que de projetos pessoais.",
            "**Atenção ao fuso horário e ao pagamento.** Confirme as horas de "
            "sobreposição exigidas e como receberá — transferência "
            "internacional, plataformas de pagamento ou intermediários. "
            "Desconfie de propostas que pedem dinheiro adiantado: são quase "
            "sempre fraudes.",
        ],
        "takeaways": [
            "Aposte em competências digitais procuradas globalmente.",
            "Internet fiável e espaço de trabalho contam como requisito.",
            "Um portefólio concreto abre mais portas do que o diploma.",
            "Nunca pague para conseguir um emprego — é sinal de fraude.",
        ],
    },
    {
        "id": "primeiro-emprego-sem-experiencia",
        "slug": "primeiro-emprego-sem-experiencia",
        "title": "Primeiro emprego sem experiência: por onde começar",
        "category": "Carreira",
        "author": "Equipa Parvagas",
        "read_time": "6 min",
        "published_at": "2026-05-22T09:00:00Z",
        "featured_on_home": False,
        "cover_image": None,
        "excerpt": (
            "Conseguir o primeiro emprego parece um círculo vicioso: pedem "
            "experiência que ainda não tem. Veja como quebrar esse ciclo."
        ),
        "body": [
            "Quase todos os profissionais já estiveram onde está agora. A falta "
            "de experiência formal compensa-se com **iniciativa, atitude e "
            "competências demonstráveis**.",
            "**Valorize tudo o que já fez:** trabalho voluntário, projetos "
            "académicos, ajuda num negócio familiar, formações curtas. Tudo "
            "isto conta como experiência relevante quando bem apresentado.",
            "**Considere estágios e funções de entrada.** Mesmo que o salário "
            "inicial seja modesto, a primeira experiência abre as seguintes. "
            "Encare-a como investimento.",
            "**Use a sua rede de contactos.** Muitas vagas em Angola preenchem-"
            "se por indicação. Diga às pessoas à sua volta que procura "
            "trabalho e em que área.",
            "**Mostre vontade de aprender.** Para funções de entrada, "
            "empregadores procuram atitude. Demonstrar que aprende depressa e "
            "trabalha bem em equipa pode pesar mais do que o currículo.",
        ],
        "takeaways": [
            "Apresente voluntariado, projetos e formações como experiência.",
            "Aceite estágios e funções de entrada como porta de acesso.",
            "Ative a sua rede de contactos — muitas vagas vão por indicação.",
            "Atitude e vontade de aprender contam muito num primeiro emprego.",
        ],
    },
    {
        "id": "evitar-vagas-fraudulentas",
        "slug": "como-evitar-vagas-fraudulentas",
        "title": "Como reconhecer e evitar vagas de emprego fraudulentas",
        "category": "Carreira",
        "author": "Equipa Parvagas",
        "read_time": "5 min",
        "published_at": "2026-05-15T09:00:00Z",
        "featured_on_home": False,
        "cover_image": None,
        "excerpt": (
            "Anúncios falsos exploram quem procura emprego. Aprenda os sinais "
            "de alerta para proteger o seu dinheiro e os seus dados."
        ),
        "body": [
            "Infelizmente, existem anúncios de emprego falsos cujo objetivo é "
            "enganar candidatos. Conhecer os sinais protege-o.",
            "**Sinal de alerta nº1: pedir dinheiro.** Nenhum empregador legítimo "
            "cobra para o contratar, seja para \"taxa de processo\", \"farda\" "
            "ou \"exame médico\" adiantado. Se pedem pagamento, é fraude.",
            "**Promessas exageradas.** Salários muito acima do mercado para "
            "pouca exigência, ou \"ganhe muito trabalhando de casa sem "
            "experiência\", são iscos típicos.",
            "**Comunicação pouco profissional.** Endereços de email genéricos, "
            "erros constantes, pressão para decidir \"hoje mesmo\" e recusa em "
            "dar informação clara sobre a empresa são sinais de risco.",
            "**Proteja os seus dados.** Não envie cópia do BI, dados bancários "
            "ou fotografias pessoais antes de confirmar que a empresa e a vaga "
            "são reais. Na Parvagas, pode denunciar qualquer anúncio "
            "suspeito.",
        ],
        "takeaways": [
            "Empregador que pede dinheiro = fraude. Sempre.",
            "Desconfie de salários altos para exigências mínimas.",
            "Verifique a empresa antes de partilhar documentos pessoais.",
            "Denuncie anúncios suspeitos para proteger outros candidatos.",
        ],
    },
]


def _to_card(post: dict[str, Any]) -> dict[str, Any]:
    """List / homepage card shape (no heavy body fields)."""
    return {
        "_id": post["id"],
        "slug": post["slug"],
        "title": post["title"],
        "category": post["category"],
        "excerpt": post["excerpt"],
        "readTime": post["read_time"],
        "publishedAt": post["published_at"],
        "featuredOnHome": post.get("featured_on_home", False),
    }


def _to_detail(post: dict[str, Any]) -> dict[str, Any]:
    """Full article shape used by the post page."""
    card = _to_card(post)
    card.update(
        {
            "author": post.get("author"),
            "coverImage": post.get("cover_image"),
            "body": list(post.get("body", [])),
            "takeaways": list(post.get("takeaways", [])),
        }
    )
    return card


def list_posts(limit: int | None = None) -> list[dict[str, Any]]:
    cards = [_to_card(p) for p in CAREER_POSTS]
    return cards[:limit] if limit else cards


def featured_posts(limit: int = 3) -> list[dict[str, Any]]:
    featured = [_to_card(p) for p in CAREER_POSTS if p.get("featured_on_home")]
    return featured[:limit]


def get_post(slug: str) -> dict[str, Any] | None:
    for p in CAREER_POSTS:
        if p["slug"] == slug:
            return _to_detail(p)
    return None


def total_count() -> int:
    return len(CAREER_POSTS)

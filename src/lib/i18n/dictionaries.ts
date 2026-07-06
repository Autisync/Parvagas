import { DEFAULT_LOCALE, ENABLE_I18N } from "@/config/appConfig";

export type AppLocale = "pt" | "en";

export type Dictionary = {
  header: {
    home: string;
    jobs: string;
    companies: string;
    career: string;
    portal: string;
    submitCv: string;
    signOut: string;
    openMenu: string;
    closeMenu: string;
    portalMode: string;
    enterPortal: string;
  };
  home: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaCreateProfile: string;
    ctaViewJobs: string;
    onboardingTitle: string;
    onboardingDesc: string;
    onboardingBonus: string;
    hiringTitle: string;
    hiringDesc: string;
    hiringCta: string;
    featuredJobsTitle: string;
    viewAll: string;
    noFeaturedJobs: string;
    seeJob: string;
    careerTipsTitle: string;
    viewAllTips: string;
    tipsSoon: string;
    adsTitle: string;
    adsDesc: string;
    adsNote: string;
    carouselPrev: string;
    carouselNext: string;
    carouselSlideLabel: (n: number) => string;
  };
  jobsList: {
    eyebrow: string;
    title: string;
    loadingSummary: string;
    activeSummary: (total: number) => string;
    searchKeyword: string;
    searchLocation: string;
    allCategories: string;
    modePlaceholder: string;
    searchButton: string;
    loadError: string;
    empty: string;
    viewDetails: string;
    prev: string;
    next: string;
    pageOf: (page: number, totalPages: number) => string;
    loadingFallback: string;
  };
  portal: {
    candidate: {
      role: string;
      dashboard: string;
      profile: string;
      cvDocs: string;
      recommended: string;
      jobs: string;
      saved: string;
      applications: string;
      alerts: string;
      settings: string;
      singleSession: string;
      logout: string;
      welcome: (name?: string) => string;
      welcomeDescription: string;
    };
    company: {
      role: string;
      dashboard: string;
      profile: string;
      newJob: string;
      jobs: string;
      applications: string;
      approvals: string;
      users: string;
      settings: string;
      singleSession: string;
      doubleSession: string;
      logout: string;
      welcome: (name?: string) => string;
      welcomeDescription: string;
    };
    admin: {
      roleLabel: string;
      superAdminConsole: string;
      moderatorConsole: string;
      superAdminDescription: string;
      moderatorDescription: string;
      menuOpen: string;
      menuClose: string;
      logout: string;
      publicLogin: string;
      breadcrumbRoot: string;
      dashboardTitle: string;
      dashboardDescription: string;
      quickLinksTitle: string;
    };
  };
  footer: {
    allRightsReserved: string;
    privacy: string;
    terms: string;
    retention: string;
    employerTerms: string;
    designHostedBy: string;
  };
  access: {
    title: string;
    subtitle: string;
    login: string;
    signup: string;
    inviteOnly: string;
    candidateRole: string;
    candidateDescription: string;
    companyRole: string;
    companyDescription: string;
    adminRole: string;
    adminDescription: string;
  };
  careerList: {
    title: string;
    subtitle: string;
    empty: string;
    readArticle: string;
    // Landing hero
    heroEyebrow: string;
    heroTitle: string;
    heroSubtitle: string;
    heroCta: string;
    // Featured video
    videoTitle: string;
    videoSubtitle: string;
    videoPlayLabel: string;
    // Category pills
    catAll: string;
    catCv: string;
    catInterview: string;
    catCareer: string;
    catRemote: string;
    // Articles section
    articlesTitle: string;
  };
  careerPost: {
    backToCareer: string;
    by: (author: string) => string;
    keyPoints: string;
    viewAll: string;
    fallbackTitle: string;
    fallbackDescription: string;
  };
  jobDetail: {
    notFoundTitle: string;
    notFoundDescription: string;
    backToJobs: string;
    breadcrumbHome: string;
    breadcrumbJobs: string;
    aboutJob: string;
    responsibilities: string;
    requirements: string;
    requiredSkills: string;
    preferredSkills: string;
    summary: string;
    salary: string;
    experience: string;
    yearsExperience: (years: number) => string;
    validUntil: string;
    publishedOn: string;
    languages: string;
    company: string;
    companySize: string;
    applyNow: string;
    viewAllJobs: string;
    companyFallback: string;
    categoryFallback: string;
  };
  legal: {
    privacyTitle: string;
    privacyBody: string;
    termsTitle: string;
    termsBody: string;
    retentionTitle: string;
    retentionBody: string;
    employerTermsTitle: string;
    employerTermsBody: string;
  };
  companyPage: {
    heroEyebrow: string;
    heroTitleLine1: string;
    heroTitleLine2Lead: string;
    heroTitleLine2Emphasis: string;
    heroSubtitle: string;
    heroCta: string;
    // Benefits section
    benefitsEyebrow: string;
    benefitsTitle: string;
    benefitsSubtitle: string;
    benefit1Title: string;
    benefit1Desc: string;
    benefit2Title: string;
    benefit2Desc: string;
    benefit3Title: string;
    benefit3Desc: string;
    benefit4Title: string;
    benefit4Desc: string;
    benefit5Title: string;
    benefit5Desc: string;
    // Steps section
    stepsEyebrow: string;
    stepsTitle: string;
    stepsSubtitle: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    stepsCta: string;
    // Social proof
    proofEyebrow: string;
    proofStat1Value: string;
    proofStat1Label: string;
    proofStat2Value: string;
    proofStat2Label: string;
    proofStat3Value: string;
    proofStat3Label: string;
    proofTestimonialQuote: string;
    proofTestimonialAuthor: string;
    proofTestimonialRole: string;
    // FAQ
    faqEyebrow: string;
    faqTitle: string;
    faqSubtitle: string;
    faq1Q: string;
    faq1A: string;
    faq2Q: string;
    faq2A: string;
    faq3Q: string;
    faq3A: string;
    faq4Q: string;
    faq4A: string;
    faqSupportLink: string;
  };
  auth: {
    login: {
      roleCandidate: string;
      roleCompany: string;
      roleCandidateHint: string;
      roleCompanyHint: string;
      pageEyebrow: string;
      pageTitle: string;
      pageSubtitle: string;
      sideEyebrow: string;
      sideTitle: string;
      sideDescription: string;
      sideBadge1: string;
      sideLinkHome: string;
      email: string;
      password: string;
      newPassword: string;
      confirmNewPassword: string;
      processing: string;
      resetPassword: string;
      resetAndSignIn: string;
      signIn: string;
      noAccount: string;
      createAccount: string;
      forgotPassword: string;
      errorUseAdminAccess: string;
      errorRoleMismatch: (role: string) => string;
      errorFillCredentials: string;
      errorFirstAccessReset: string;
      errorInvalidCredentials: string;
      resetSuccess: string;
      resetPrompt: string;
    };
    signup: {
      roleCandidate: string;
      roleCompany: string;
      roleCandidateHint: string;
      roleCompanyHint: string;
      pageEyebrow: string;
      pageTitle: string;
      pageSubtitle: string;
      sideEyebrow: string;
      sideTitle: string;
      sideDescription: string;
      sideBadge1: string;
      sideLinkHome: string;
      inviteDetected: string;
      fullName: string;
      companyName: string;
      legalName: string;
      legalNameOptional: string;
      companyIdentifier: string;
      companyIdentifierHelp: string;
      email: string;
      password: string;
      confirmPassword: string;
      createAccount: string;
      creatingAccount: string;
      hasAccount: string;
      signIn: string;
      errorFillRequired: string;
      errorPasswordsMismatch: string;
      errorCompanyNameRequired: string;
      errorIdentifierRequired: string;
      errorIdentifierInvalid: string;
      successInviteAccepted: string;
      successAccountCreated: string;
    };
    resetDialog: {
      trigger: string;
      title: string;
      emailLabel: string;
      helper: string;
      sending: string;
      submit: string;
      errorEmailRequired: string;
      errorEmailInvalid: string;
      successFallback: string;
    };
  };
};

export const dictionaries: Record<AppLocale, Dictionary> = {
  pt: {
    header: {
      home: "Inicio",
      jobs: "Vagas",
      companies: "Empresas",
      career: "Carreira",
      portal: "Portal",
      submitCv: "Submeter CV",
      signOut: "Sair",
      openMenu: "Abrir menu",
      closeMenu: "Fechar menu",
      portalMode: "Modo Portal",
      enterPortal: "Entrar no Portal",
    },
    home: {
      eyebrow: "Parvagas Angola",
      title: "Talentos e Empresas no mesmo portal de recrutamento",
      subtitle: "Candidatos criam perfil a partir do CV com apoio de IA e empresas publicam vagas públicas ou privadas com controlo total.",
      ctaCreateProfile: "Criar Perfil por CV",
      ctaViewJobs: "Ver Vagas Disponíveis",
      onboardingTitle: "Onboarding de Candidatos",
      onboardingDesc: "Carregue CV em PDF ou DOCX, revise os dados extraídos por IA e publique o seu perfil profissional em minutos.",
      onboardingBonus: "🎁 Bónus: preencha o seu perfil e descarregue um CV em formato profissional (ATS), pronto para outras candidaturas.",
      hiringTitle: "Contratação para Empresas",
      hiringDesc: "Crie conta empresarial, valide a empresa e publique vagas públicas ou privadas com rastreio de candidaturas.",
      hiringCta: "Criar Conta Empresarial",
      featuredJobsTitle: "Vagas em Destaque",
      viewAll: "Ver todas",
      noFeaturedJobs: "Sem vagas em destaque de momento.",
      seeJob: "Ver vaga",
      careerTipsTitle: "Dicas de Carreira",
      viewAllTips: "Ver todas",
      tipsSoon: "Artigos de carreira em breve.",
      adsTitle: "Espaços de Anúncios",
      adsDesc: "Campanhas manuais para banner da home, listagem de vagas, detalhe da vaga e cartões patrocinados.",
      adsNote: "Sem checkout online. Gestão comercial totalmente manual pelo admin.",
      carouselPrev: "Slide anterior",
      carouselNext: "Próximo slide",
      carouselSlideLabel: (n: number) => `Ir para o slide ${n}`,
    },
    jobsList: {
      eyebrow: "Parvagas Angola",
      title: "Vagas Disponíveis",
      loadingSummary: "A carregar vagas...",
      activeSummary: (total) => `${total} oportunidades activas em Angola`,
      searchKeyword: "Palavra-chave...",
      searchLocation: "Província / Cidade",
      allCategories: "Todas as categorias",
      modePlaceholder: "Modalidade",
      searchButton: "Pesquisar",
      loadError: "Erro ao carregar vagas. Verifique a ligação.",
      empty: "Nenhuma vaga encontrada para os filtros seleccionados.",
      viewDetails: "Ver detalhes",
      prev: "Anterior",
      next: "Próxima",
      pageOf: (page, totalPages) => `Página ${page} de ${totalPages}`,
      loadingFallback: "A carregar vagas...",
    },
    portal: {
      candidate: {
        role: "Candidato",
        dashboard: "Dashboard",
        profile: "Meu Perfil",
        cvDocs: "CV e Documentos",
        recommended: "Vagas Recomendadas",
        jobs: "Vagas Disponíveis",
        saved: "Vagas Guardadas",
        applications: "Minhas Candidaturas",
        alerts: "Alertas de Vagas",
        settings: "Definições",
        singleSession: "Sessão ativa",
        logout: "Terminar sessão",
        welcome: (name) => `Bem-vindo${name ? `, ${name}` : ""}`,
        welcomeDescription: "Acompanhe as suas candidaturas, vagas guardadas e recomendações personalizadas.",
      },
      company: {
        role: "Empresa",
        dashboard: "Dashboard",
        profile: "Perfil da empresa",
        newJob: "Nova vaga",
        jobs: "Vagas",
        applications: "Candidaturas",
        approvals: "Aprovações",
        users: "Utilizadores",
        settings: "Definições",
        singleSession: "Sessão única",
        doubleSession: "Sessão dupla detectada",
        logout: "Terminar sessão",
        welcome: (name) => `Bem-vindo${name ? `, ${name}` : ""}`,
        welcomeDescription: "Gerencie vagas, acompanhe candidatos e tome decisões de recrutamento mais rapidamente.",
      },
      admin: {
        roleLabel: "Admin Portal",
        superAdminConsole: "SuperAdmin Console",
        moderatorConsole: "Moderator Console",
        superAdminDescription: "Controlo total, auditoria e exportações.",
        moderatorDescription: "Moderação operacional e leitura de dados.",
        menuOpen: "Menu",
        menuClose: "Fechar menu",
        logout: "Terminar sessão",
        publicLogin: "Login público",
        breadcrumbRoot: "Portal / Admin",
        dashboardTitle: "Dashboard Executivo",
        dashboardDescription: "Visão consolidada das operações da plataforma com foco em qualidade, risco e compliance.",
        quickLinksTitle: "Ações rápidas",
      },
    },
    footer: {
      allRightsReserved: "Todos os direitos reservados.",
      privacy: "Privacidade",
      terms: "Termos",
      retention: "Retenção",
      employerTerms: "Termos do Empregador",
      designHostedBy: "Design e hospedagem por",
    },
    access: {
      title: "Portal de Acesso",
      subtitle: "Escolha o fluxo dedicado ao seu tipo de utilizador.",
      login: "Login",
      signup: "Criar conta",
      inviteOnly: "Por convite",
      candidateRole: "Candidato",
      candidateDescription: "Entrar para gerir perfil, vagas recomendadas e candidaturas.",
      companyRole: "Empresa",
      companyDescription: "Entrar para publicar vagas e acompanhar candidaturas.",
      adminRole: "Admin/Moderador",
      adminDescription: "Acesso operacional criado apenas por super-admin.",
    },
    careerList: {
      title: "Dicas de Carreira",
      subtitle: "Conteúdo editorial para melhorar candidatura, entrevistas e posicionamento profissional no mercado angolano.",
      empty: "Artigos em breve.",
      readArticle: "Ler artigo",
      heroEyebrow: "Desenvolva a sua carreira",
      heroTitle: "Conselhos práticos para crescer no mercado angolano",
      heroSubtitle: "Artigos, guias e vídeos escritos por especialistas para o ajudar a escrever um CV vencedor, brilhar em entrevistas e avançar na carreira.",
      heroCta: "Explorar artigos",
      videoTitle: "Como preparar o CV perfeito para o mercado angolano",
      videoSubtitle: "Neste vídeo explicamos passo a passo como estruturar o seu currículo, destacar competências e passar pelos filtros das empresas.",
      videoPlayLabel: "Reproduzir vídeo",
      catAll: "Todos",
      catCv: "CV & Perfil",
      catInterview: "Entrevistas",
      catCareer: "Carreira",
      catRemote: "Trabalho Remoto",
      articlesTitle: "Artigos recentes",
    },
    careerPost: {
      backToCareer: "Voltar a Dicas de Carreira",
      by: (author) => `Por ${author}`,
      keyPoints: "Pontos-chave",
      viewAll: "Ver todos os artigos",
      fallbackTitle: "Dicas de Carreira | Parvagas",
      fallbackDescription: "Conteúdo editorial para profissionais angolanos.",
    },
    jobDetail: {
      notFoundTitle: "Vaga não encontrada",
      notFoundDescription: "Esta vaga pode ter sido removida ou já não está disponível.",
      backToJobs: "Voltar às vagas",
      breadcrumbHome: "Início",
      breadcrumbJobs: "Vagas",
      aboutJob: "Sobre a vaga",
      responsibilities: "Responsabilidades",
      requirements: "Qualificações",
      requiredSkills: "Competências obrigatórias",
      preferredSkills: "Competências valorizadas",
      summary: "Resumo",
      salary: "Salário",
      experience: "Experiência",
      yearsExperience: (years) => `${years}+ anos`,
      validUntil: "Válido até",
      publishedOn: "Publicado em",
      languages: "Idiomas",
      company: "Empresa",
      companySize: "Dimensão",
      applyNow: "Candidatar-me agora",
      viewAllJobs: "Ver todas as vagas",
      companyFallback: "Empresa",
      categoryFallback: "Geral",
    },
    legal: {
      privacyTitle: "Política de Privacidade",
      privacyBody: "A Parvagas processa dados de candidatos e empresas para fins de recrutamento, incluindo processamento de CV com IA mediante consentimento explícito.",
      termsTitle: "Termos de Serviço",
      termsBody: "Regras de utilização da plataforma para candidatos, empresas e administradores.",
      retentionTitle: "Política de Retenção de Dados",
      retentionBody: "Define prazos de retenção para perfis, candidaturas, logs e auditoria.",
      employerTermsTitle: "Termos para Empregadores",
      employerTermsBody: "Regras de publicação de vagas, moderação, conformidade e uso de vagas privadas.",
    },
    companyPage: {
      heroEyebrow: "Ajudando Empresas",
      heroTitleLine1: "Maior",
      heroTitleLine2Lead: "Base de Dados de",
      heroTitleLine2Emphasis: "Talentos em Angola",
      heroSubtitle: "Uma plataforma útil para quem procura talento profissional para seus projetos em Angola. Oferecemos acesso a uma ampla gama de profissionais em diferentes setores e locais.",
      heroCta: "Criar Perfil de Empresa",
      // Benefits
      benefitsEyebrow: "Por que recrutar com Parvagas?",
      benefitsTitle: "Contrate mais rápido, com mais qualidade",
      benefitsSubtitle: "Parvagas foi construída para ligar empresas angolanas e portuguesas aos candidatos certos — activos, qualificados e prontos para trabalhar.",
      benefit1Title: "Candidatos activos e comprometidos",
      benefit1Desc: "O nosso público são profissionais em busca activa de emprego, não utilizadores passivos de redes sociais. Isso traduz‑se em taxas de resposta mais elevadas e processos mais rápidos.",
      benefit2Title: "Filtragem avançada de candidatos",
      benefit2Desc: "Filtre por competências, anos de experiência, localização e área de atuação. Poupe horas de triagem e foque‑se apenas nos perfis relevantes.",
      benefit3Title: "Employer branding profissional",
      benefit3Desc: "Apresente a cultura, benefícios e missão da sua empresa numa página dedicada. Atraia talentos que partilham os seus valores antes mesmo de publicar a primeira vaga.",
      benefit4Title: "Analytics e relatórios de recrutamento",
      benefit4Desc: "Aceda a painéis com dados sobre origem dos candidatos, taxa de candidatura, tempo de resposta e tendências de contratação para otimizar cada processo.",
      benefit5Title: "Alcance Angola e Portugal",
      benefit5Desc: "Publique vagas com visibilidade simultânea em Angola e Portugal, ampliando o seu leque de talento sem custos adicionais.",
      // Steps
      stepsEyebrow: "Comece em minutos",
      stepsTitle: "Três passos para contratar",
      stepsSubtitle: "Desde o registo à primeira candidatura qualificada, o processo é simples e rápido.",
      step1Title: "Crie o perfil da sua empresa",
      step1Desc: "Preencha as informações da empresa e verifique a sua conta. O perfil fica visível para milhares de candidatos qualificados.",
      step2Title: "Publique uma vaga",
      step2Desc: "Descreva os requisitos, defina se a vaga é pública ou privada e active recomendações automáticas por IA.",
      step3Title: "Faça shortlist e contrate",
      step3Desc: "Use filtros inteligentes e recomendações de IA para identificar os melhores candidatos e avance para a entrevista rapidamente.",
      stepsCta: "Criar Perfil de Empresa",
      // Social proof
      proofEyebrow: "Resultados comprovados",
      proofStat1Value: "90%",
      proofStat1Label: "das empresas encontram candidatos qualificados em menos de duas semanas",
      proofStat2Value: "5.000+",
      proofStat2Label: "candidatos activos na plataforma",
      proofStat3Value: "3×",
      proofStat3Label: "mais rápido do que recrutamento tradicional via redes sociais",
      proofTestimonialQuote: "Antes passávamos semanas a filtrar mensagens no WhatsApp e no Facebook. Com a Parvagas publicámos a vaga numa manhã e, em dez dias, tínhamos 43 candidaturas já organizadas e verificadas. Contratámos um engenheiro sénior sem sair da plataforma.",
      proofTestimonialAuthor: "Ana Paula Ferreira",
      proofTestimonialRole: "Directora de Recursos Humanos · Kianda Talent, Luanda",
      // FAQ
      faqEyebrow: "Perguntas frequentes",
      faqTitle: "Tudo o que precisa de saber",
      faqSubtitle: "Ainda tem dúvidas? Consulte as respostas abaixo ou entre em contacto com a nossa equipa.",
      faq1Q: "Qual é o custo para publicar uma vaga?",
      faq1A: "O registo de empresa é gratuito. A publicação de vagas públicas está disponível nos nossos planos mensais. Contacte‑nos para conhecer os preços actuais.",
      faq2Q: "Como é feita a verificação da empresa?",
      faq2A: "Após o registo, a nossa equipa revê as informações submetidas e confirma a autenticidade da empresa em até 48 horas úteis.",
      faq3Q: "Posso publicar vagas privadas (apenas por convite)?",
      faq3A: "Sim. As vagas privadas são visíveis apenas para candidatos seleccionados por si ou recomendados pela IA, garantindo maior discrição no processo.",
      faq4Q: "Como funcionam as recomendações de IA?",
      faq4A: "O nosso motor de correspondência analisa as competências, experiência e preferências dos candidatos e compara com os requisitos da vaga, sugerindo os perfis mais compatíveis.",
      faqSupportLink: "Falar com o Suporte",
    },
    auth: {
      login: {
        roleCandidate: "Candidato",
        roleCompany: "Empresa",
        roleCandidateHint: "Perfil, recomendações e candidaturas",
        roleCompanyHint: "Vagas, equipa e candidaturas",
        pageEyebrow: "Login",
        pageTitle: "Entrar no portal",
        pageSubtitle: "Escolha o tipo de conta e autentique-se no ambiente correto.",
        sideEyebrow: "Portal Parvagas",
        sideTitle: "Acesso focado para candidatos e empresas.",
        sideDescription: "Entre no fluxo correto para gerir candidaturas, recomendações, vagas e equipas com uma experiência simples e segura.",
        sideBadge1: "Admins usam uma rota dedicada fora do login público.",
        sideLinkHome: "Voltar ao site público",
        email: "Email",
        password: "Palavra-passe",
        newPassword: "Nova password",
        confirmNewPassword: "Confirmar nova password",
        processing: "A processar...",
        resetPassword: "Redefinir password",
        resetAndSignIn: "Redefinir e entrar",
        signIn: "Entrar",
        noAccount: "Ainda não tem conta?",
        createAccount: "Criar conta",
        forgotPassword: "Esqueceu a palavra-passe?",
        errorUseAdminAccess: "Use o acesso administrativo dedicado.",
        errorRoleMismatch: (role) => `Esta área é para ${role}. Use o portal correto para a sua conta.`,
        errorFillCredentials: "Preencha o email e a palavra-passe.",
        errorFirstAccessReset: "Primeiro acesso: defina uma nova password para continuar.",
        errorInvalidCredentials: "Credenciais inválidas.",
        resetSuccess: "Password redefinida com sucesso. Faça login com a nova credencial.",
        resetPrompt: "Defina uma nova password para concluir a recuperação de conta.",
      },
      signup: {
        roleCandidate: "Candidato",
        roleCompany: "Empresa",
        roleCandidateHint: "Perfil, recomendações e candidaturas",
        roleCompanyHint: "Publicar vagas e gerir candidaturas",
        pageEyebrow: "Signup",
        pageTitle: "Criar conta",
        pageSubtitle: "Escolha o perfil correto para configurar o acesso inicial.",
        sideEyebrow: "Criar conta",
        sideTitle: "Um início simples para cada tipo de utilizador.",
        sideDescription: "Candidatos e empresas entram por fluxos públicos separados. A criação de administradores fica reservada ao super-admin.",
        sideBadge1: "Empresas passam por validação de NIF e nome normalizado para evitar duplicados.",
        sideLinkHome: "Voltar ao site público",
        inviteDetected: "Convite de equipa detectado. O email deve corresponder ao convite para associar à empresa.",
        fullName: "Nome completo",
        companyName: "Nome da empresa",
        legalName: "Razão social",
        legalNameOptional: "Opcional",
        companyIdentifier: "NIF / Identificador único",
        companyIdentifierHelp: "Use 6-20 caracteres alfanuméricos, sem espaços especiais.",
        email: "Email",
        password: "Palavra-passe",
        confirmPassword: "Confirmar palavra-passe",
        createAccount: "Criar conta",
        creatingAccount: "A criar conta...",
        hasAccount: "Já tem conta?",
        signIn: "Entrar",
        errorFillRequired: "Preencha nome, email e palavra-passe.",
        errorPasswordsMismatch: "As palavras-passe não coincidem.",
        errorCompanyNameRequired: "Informe o nome da empresa.",
        errorIdentifierRequired: "Informe o NIF/identificador da empresa.",
        errorIdentifierInvalid: "NIF inválido. Use 6-20 caracteres alfanuméricos.",
        successInviteAccepted: "Convite aceite. Faça login com o email convidado e altere a password no primeiro acesso.",
        successAccountCreated: "Conta criada com sucesso. Pode iniciar sessão agora.",
      },
      resetDialog: {
        trigger: "Esqueceu a palavra-passe?",
        title: "Recuperar Palavra-Passe",
        emailLabel: "Email associado à sua conta",
        helper: "Vamos enviar um link para redefinir a palavra-passe da sua conta.",
        sending: "A enviar...",
        submit: "Recuperar Palavra-Passe",
        errorEmailRequired: "Informe o email associado à sua conta.",
        errorEmailInvalid: "Informe um email válido.",
        successFallback: "Se existir uma conta com este email, será enviado um link de recuperação.",
      },
    },
  },
  en: {
    header: {
      home: "Home",
      jobs: "Jobs",
      companies: "Companies",
      career: "Career",
      portal: "Portal",
      submitCv: "Submit CV",
      signOut: "Sign out",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      portalMode: "Portal Mode",
      enterPortal: "Enter Portal",
    },
    home: {
      eyebrow: "Parvagas Angola",
      title: "Talent and companies on one recruitment platform",
      subtitle: "Candidates build profiles from CVs with AI assistance, while companies publish public or private jobs with full control.",
      ctaCreateProfile: "Create Profile from CV",
      ctaViewJobs: "Browse Open Jobs",
      onboardingTitle: "Candidate Onboarding",
      onboardingDesc: "Upload CV in PDF or DOCX, review AI-extracted details, and publish your profile in minutes.",
      onboardingBonus: "🎁 Bonus: fill out your profile and download a professional, ATS-ready CV for other applications.",
      hiringTitle: "Hiring for Companies",
      hiringDesc: "Create a company account, verify your company, and publish public or private jobs with applicant tracking.",
      hiringCta: "Create a Company Account",
      featuredJobsTitle: "Featured Jobs",
      viewAll: "View all",
      noFeaturedJobs: "No featured jobs at the moment.",
      seeJob: "View job",
      careerTipsTitle: "Career Tips",
      viewAllTips: "View all",
      tipsSoon: "Career articles coming soon.",
      adsTitle: "Ad Placements",
      adsDesc: "Manual campaigns for homepage banners, job listings, job details, and sponsored cards.",
      adsNote: "No online checkout. Commercial operations are managed manually by admins.",
      carouselPrev: "Previous slide",
      carouselNext: "Next slide",
      carouselSlideLabel: (n: number) => `Go to slide ${n}`,
    },
    jobsList: {
      eyebrow: "Parvagas Angola",
      title: "Available Jobs",
      loadingSummary: "Loading jobs...",
      activeSummary: (total) => `${total} active opportunities in Angola`,
      searchKeyword: "Keyword...",
      searchLocation: "Province / City",
      allCategories: "All categories",
      modePlaceholder: "Work mode",
      searchButton: "Search",
      loadError: "Could not load jobs. Please check your connection.",
      empty: "No jobs found for the selected filters.",
      viewDetails: "View details",
      prev: "Previous",
      next: "Next",
      pageOf: (page, totalPages) => `Page ${page} of ${totalPages}`,
      loadingFallback: "Loading jobs...",
    },
    portal: {
      candidate: {
        role: "Candidate",
        dashboard: "Dashboard",
        profile: "My Profile",
        cvDocs: "CV & Documents",
        recommended: "Recommended Jobs",
        jobs: "Available Jobs",
        saved: "Saved Jobs",
        applications: "My Applications",
        alerts: "Job Alerts",
        settings: "Settings",
        singleSession: "Single session",
        logout: "Sign out",
        welcome: (name) => `Welcome${name ? `, ${name}` : ""}`,
        welcomeDescription: "Track your applications, saved jobs, and personalized recommendations.",
      },
      company: {
        role: "Company",
        dashboard: "Dashboard",
        profile: "Company Profile",
        newJob: "New Job",
        jobs: "Jobs",
        applications: "Applicants",
        approvals: "Approvals",
        users: "Users",
        settings: "Settings",
        singleSession: "Single session",
        doubleSession: "Concurrent session detected",
        logout: "Sign out",
        welcome: (name) => `Welcome${name ? `, ${name}` : ""}`,
        welcomeDescription: "Manage job posts, track applicants, and make hiring decisions faster.",
      },
      admin: {
        roleLabel: "Admin Portal",
        superAdminConsole: "SuperAdmin Console",
        moderatorConsole: "Moderator Console",
        superAdminDescription: "Full control, auditing, and exports.",
        moderatorDescription: "Operational moderation and read-only data supervision.",
        menuOpen: "Menu",
        menuClose: "Close menu",
        logout: "Sign out",
        publicLogin: "Public login",
        breadcrumbRoot: "Portal / Admin",
        dashboardTitle: "Executive Dashboard",
        dashboardDescription: "Consolidated operational view focused on quality, risk, and compliance.",
        quickLinksTitle: "Quick actions",
      },
    },
    footer: {
      allRightsReserved: "All rights reserved.",
      privacy: "Privacy",
      terms: "Terms",
      retention: "Retention",
      employerTerms: "Employer Terms",
      designHostedBy: "Design and hosted by",
    },
    access: {
      title: "Access Portal",
      subtitle: "Choose the flow for your user type.",
      login: "Login",
      signup: "Sign up",
      inviteOnly: "Invite only",
      candidateRole: "Candidate",
      candidateDescription: "Sign in to manage profile, recommendations, and applications.",
      companyRole: "Company",
      companyDescription: "Sign in to publish jobs and review applicants.",
      adminRole: "Admin/Moderator",
      adminDescription: "Operational access created only by super-admin.",
    },
    careerList: {
      title: "Career Tips",
      subtitle: "Editorial content to improve applications, interviews, and professional positioning in Angola.",
      empty: "Articles coming soon.",
      readArticle: "Read article",
      heroEyebrow: "Grow your career",
      heroTitle: "Practical advice to advance in the Angolan market",
      heroSubtitle: "Articles, guides and videos written by experts to help you write a winning CV, shine in interviews, and advance your career.",
      heroCta: "Explore articles",
      videoTitle: "How to prepare the perfect CV for the Angolan market",
      videoSubtitle: "In this video we explain step by step how to structure your CV, highlight skills, and pass company filters.",
      videoPlayLabel: "Play video",
      catAll: "All",
      catCv: "CV & Profile",
      catInterview: "Interviews",
      catCareer: "Career",
      catRemote: "Remote Work",
      articlesTitle: "Recent articles",
    },
    careerPost: {
      backToCareer: "Back to Career Tips",
      by: (author) => `By ${author}`,
      keyPoints: "Key takeaways",
      viewAll: "View all articles",
      fallbackTitle: "Career Tips | Parvagas",
      fallbackDescription: "Editorial content for Angolan professionals.",
    },
    jobDetail: {
      notFoundTitle: "Job not found",
      notFoundDescription: "This job may have been removed or is no longer available.",
      backToJobs: "Back to jobs",
      breadcrumbHome: "Home",
      breadcrumbJobs: "Jobs",
      aboutJob: "About this role",
      responsibilities: "Responsibilities",
      requirements: "Qualifications",
      requiredSkills: "Required skills",
      preferredSkills: "Preferred skills",
      summary: "Summary",
      salary: "Salary",
      experience: "Experience",
      yearsExperience: (years) => `${years}+ years`,
      validUntil: "Valid until",
      publishedOn: "Published on",
      languages: "Languages",
      company: "Company",
      companySize: "Company size",
      applyNow: "Apply now",
      viewAllJobs: "View all jobs",
      companyFallback: "Company",
      categoryFallback: "General",
    },
    legal: {
      privacyTitle: "Privacy Policy",
      privacyBody: "Parvagas processes candidate and company data for recruitment purposes, including AI CV processing with explicit consent.",
      termsTitle: "Terms of Service",
      termsBody: "Platform usage rules for candidates, companies, and administrators.",
      retentionTitle: "Data Retention Policy",
      retentionBody: "Defines retention periods for profiles, applications, logs, and audit data.",
      employerTermsTitle: "Employer Terms",
      employerTermsBody: "Rules for publishing jobs, moderation, compliance, and private job usage.",
    },
    companyPage: {
      heroEyebrow: "Helping Companies",
      heroTitleLine1: "The Largest",
      heroTitleLine2Lead: "Talent Database in",
      heroTitleLine2Emphasis: "Angola",
      heroSubtitle: "A practical platform for companies seeking professional talent for projects in Angola. We provide access to a broad range of professionals across sectors and locations.",
      heroCta: "Create Company Profile",
      // Benefits
      benefitsEyebrow: "Why hire with Parvagas?",
      benefitsTitle: "Hire faster, hire better",
      benefitsSubtitle: "Parvagas connects Angolan and Portuguese companies with the right candidates — active, qualified and ready to work.",
      benefit1Title: "Active, engaged candidates",
      benefit1Desc: "Our audience are professionals actively seeking employment, not passive social media users. That means higher response rates and faster processes.",
      benefit2Title: "Advanced candidate filtering",
      benefit2Desc: "Filter by skills, years of experience, location and field. Save hours of screening and focus only on relevant profiles.",
      benefit3Title: "Professional employer branding",
      benefit3Desc: "Present your company culture, benefits and mission on a dedicated page. Attract talent that shares your values before you post your first job.",
      benefit4Title: "Recruitment analytics",
      benefit4Desc: "Access dashboards with data on candidate sources, application rate, response time and hiring trends to optimise each process.",
      benefit5Title: "Reach Angola and Portugal",
      benefit5Desc: "Post jobs with simultaneous visibility in Angola and Portugal, expanding your talent pool at no extra cost.",
      // Steps
      stepsEyebrow: "Get started in minutes",
      stepsTitle: "Three steps to hire",
      stepsSubtitle: "From registration to your first qualified application, the process is simple and fast.",
      step1Title: "Create your company profile",
      step1Desc: "Fill in your company information and verify your account. Your profile becomes visible to thousands of qualified candidates.",
      step2Title: "Post a job",
      step2Desc: "Describe your requirements, set whether the vacancy is public or private, and enable automatic AI recommendations.",
      step3Title: "Shortlist and hire",
      step3Desc: "Use smart filters and AI recommendations to identify the best candidates and move to interview quickly.",
      stepsCta: "Create Company Profile",
      // Social proof
      proofEyebrow: "Proven results",
      proofStat1Value: "90%",
      proofStat1Label: "of companies find qualified candidates within two weeks",
      proofStat2Value: "5,000+",
      proofStat2Label: "active candidates on the platform",
      proofStat3Value: "3×",
      proofStat3Label: "faster than traditional social media recruitment",
      proofTestimonialQuote: "We used to spend weeks filtering WhatsApp and Facebook messages. With Parvagas we posted the role in one morning and, within ten days, had 43 applications already organised and verified. We hired a senior engineer without ever leaving the platform.",
      proofTestimonialAuthor: "Ana Paula Ferreira",
      proofTestimonialRole: "HR Director · Kianda Talent, Luanda",
      // FAQ
      faqEyebrow: "Frequently asked questions",
      faqTitle: "Everything you need to know",
      faqSubtitle: "Still have questions? Check the answers below or contact our team.",
      faq1Q: "How much does it cost to post a job?",
      faq1A: "Company registration is free. Public job posting is available on our monthly plans. Contact us for current pricing.",
      faq2Q: "How is company verification done?",
      faq2A: "After registration, our team reviews the submitted information and confirms the company's authenticity within 48 business hours.",
      faq3Q: "Can I post private jobs (invite only)?",
      faq3A: "Yes. Private jobs are only visible to candidates you select or that are recommended by AI, ensuring greater discretion in the process.",
      faq4Q: "How do AI recommendations work?",
      faq4A: "Our matching engine analyses candidates' skills, experience and preferences and compares them with the job requirements, suggesting the most compatible profiles.",
      faqSupportLink: "Contact Support",
    },
    auth: {
      login: {
        roleCandidate: "Candidate",
        roleCompany: "Company",
        roleCandidateHint: "Profile, recommendations, and applications",
        roleCompanyHint: "Jobs, team, and applicants",
        pageEyebrow: "Login",
        pageTitle: "Sign in to portal",
        pageSubtitle: "Choose your account type and sign in to the correct environment.",
        sideEyebrow: "Parvagas Portal",
        sideTitle: "Focused access for candidates and companies.",
        sideDescription: "Use the right flow to manage applications, recommendations, jobs, and teams with a simple and secure experience.",
        sideBadge1: "Admins use a dedicated route outside public login.",
        sideLinkHome: "Back to public site",
        email: "Email",
        password: "Password",
        newPassword: "New password",
        confirmNewPassword: "Confirm new password",
        processing: "Processing...",
        resetPassword: "Reset password",
        resetAndSignIn: "Reset and sign in",
        signIn: "Sign in",
        noAccount: "No account yet?",
        createAccount: "Create account",
        forgotPassword: "Forgot password?",
        errorUseAdminAccess: "Use the dedicated admin access.",
        errorRoleMismatch: (role) => `This area is for ${role}. Please use the correct portal.`,
        errorFillCredentials: "Fill in email and password.",
        errorFirstAccessReset: "First access: set a new password to continue.",
        errorInvalidCredentials: "Invalid credentials.",
        resetSuccess: "Password reset successfully. Please sign in with your new password.",
        resetPrompt: "Set a new password to finish account recovery.",
      },
      signup: {
        roleCandidate: "Candidate",
        roleCompany: "Company",
        roleCandidateHint: "Profile, recommendations, and applications",
        roleCompanyHint: "Post jobs and manage applicants",
        pageEyebrow: "Sign up",
        pageTitle: "Create account",
        pageSubtitle: "Choose the right profile to set up initial access.",
        sideEyebrow: "Create account",
        sideTitle: "A simple start for every user type.",
        sideDescription: "Candidates and companies use separate public flows. Admin creation stays restricted to super-admin.",
        sideBadge1: "Companies are validated with normalized tax ID and name to avoid duplicates.",
        sideLinkHome: "Back to public site",
        inviteDetected: "Team invite detected. The email must match the invite to link to company.",
        fullName: "Full name",
        companyName: "Company name",
        legalName: "Legal name",
        legalNameOptional: "Optional",
        companyIdentifier: "Tax ID / Unique identifier",
        companyIdentifierHelp: "Use 6-20 alphanumeric characters without special spaces.",
        email: "Email",
        password: "Password",
        confirmPassword: "Confirm password",
        createAccount: "Create account",
        creatingAccount: "Creating account...",
        hasAccount: "Already have an account?",
        signIn: "Sign in",
        errorFillRequired: "Fill in name, email, and password.",
        errorPasswordsMismatch: "Passwords do not match.",
        errorCompanyNameRequired: "Please provide company name.",
        errorIdentifierRequired: "Please provide company tax ID/identifier.",
        errorIdentifierInvalid: "Invalid tax ID. Use 6-20 alphanumeric characters.",
        successInviteAccepted: "Invite accepted. Sign in with invited email and change password on first access.",
        successAccountCreated: "Account created successfully. You can sign in now.",
      },
      resetDialog: {
        trigger: "Forgot password?",
        title: "Recover Password",
        emailLabel: "Account email",
        helper: "We will send a link to reset your account password.",
        sending: "Sending...",
        submit: "Recover Password",
        errorEmailRequired: "Please provide your account email.",
        errorEmailInvalid: "Please provide a valid email.",
        successFallback: "If an account exists for this email, a recovery link will be sent.",
      },
    },
  },
};

export const normalizeLocale = (value: string | null | undefined): AppLocale => {
  if (!ENABLE_I18N) return DEFAULT_LOCALE;
  return String(value || "").toLowerCase() === "en" ? "en" : "pt";
};

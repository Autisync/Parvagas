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
    hiringTitle: string;
    hiringDesc: string;
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
      hiringTitle: "Contratação para Empresas",
      hiringDesc: "Crie conta empresarial, valide a empresa e publique vagas públicas ou privadas com rastreio de candidaturas.",
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
      hiringTitle: "Hiring for Companies",
      hiringDesc: "Create a company account, verify your company, and publish public or private jobs with applicant tracking.",
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
  },
};

export const normalizeLocale = (value: string | null | undefined): AppLocale => {
  return String(value || "").toLowerCase() === "en" ? "en" : "pt";
};

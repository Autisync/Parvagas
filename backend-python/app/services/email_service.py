"""Email service for sending emails."""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from html import escape
from jinja2 import Template
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class EmailService:
    """Email service for sending emails."""

    @staticmethod
    def _build_email_html(
        title: str,
        body_html: str,
        action_text: str = "",
        action_url: str = "",
        preheader: str = "",
    ) -> str:
        """Minimal, professional email layout shared by all templates.

        Design: lots of whitespace, a single brand accent, a clean text
        wordmark (no remote logo to avoid broken images), system fonts, and an
        email-client-robust table-based structure with fully inlined styles.
        """
        html_template = """\
<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<title>{{ title }}</title>
</head>
<body style="margin:0; padding:0; background:#f4f4f5; -webkit-font-smoothing:antialiased;">
<span style="display:none; max-height:0; overflow:hidden; opacity:0; color:#f4f4f5;">{{ preheader }}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border:1px solid #ececec; border-radius:14px; overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 0 32px;">
            <span style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:18px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:{{ brand_primary_color }};">{{ brand_name }}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px 32px;">
            <h1 style="margin:0; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:20px; line-height:1.35; font-weight:700; color:#18181b;">{{ title }}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 32px 8px 32px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.65; color:#3f3f46;">
            {{ body_html | safe }}
          </td>
        </tr>
        {% if action_text and action_url %}
        <tr>
          <td style="padding:12px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:8px; background:{{ brand_primary_color }};">
                  <a href="{{ action_url }}" style="display:inline-block; padding:12px 22px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">{{ action_text }}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        {% endif %}
        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="border-top:1px solid #f0f0f0; padding-top:18px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#a1a1aa;">
              <p style="margin:0 0 2px;">{{ brand_team_name }}</p>
              <p style="margin:0;"><a href="{{ frontend_url }}" style="color:#a1a1aa; text-decoration:none;">{{ frontend_label }}</a></p>
            </div>
          </td>
        </tr>
      </table>
      <p style="max-width:480px; margin:16px auto 0; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:11px; line-height:1.5; color:#c4c4c8; text-align:center;">Recebeu este email porque tem uma conta na {{ brand_name }}.</p>
    </td>
  </tr>
</table>
</body>
</html>
"""
        frontend_url = (settings.FRONTEND_URL or "https://parvagas.pt").rstrip("/")
        frontend_label = frontend_url.replace("https://", "").replace("http://", "")

        return Template(html_template).render(
            title=title,
            body_html=body_html,
            action_text=action_text,
            action_url=action_url,
            preheader=preheader or title,
            frontend_url=frontend_url,
            frontend_label=frontend_label,
            brand_name=settings.BRAND_NAME,
            brand_team_name=settings.BRAND_TEAM_NAME,
            brand_primary_color=settings.BRAND_PRIMARY_COLOR,
        )

    @staticmethod
    def send_verification_email(email: str, full_name: str, verification_link: str) -> bool:
        """Send email verification email."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            subject = f"{settings.BRAND_NAME} — Confirme o seu email"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
            <p style="margin:0 0 14px;">Obrigado por se registar. Confirme o seu email para ativar a sua conta.</p>
            <p style="margin:0 0 14px;">Este link expira em 24 horas. Se não criou esta conta, ignore esta mensagem.</p>
            """

            html_content = EmailService._build_email_html(
                title="Confirme o seu email",
                body_html=body_html,
                action_text="Confirmar email",
                action_url=verification_link,
                preheader="Confirme o seu email para ativar a conta.",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send verification email: {str(e)}")
            return False

    @staticmethod
    def send_password_reset_email(email: str, full_name: str, reset_link: str) -> bool:
        """Send password reset email."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            subject = f"{settings.BRAND_NAME} — Redefinir a sua palavra-passe"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
            <p style="margin:0 0 14px;">Recebemos um pedido para redefinir a sua palavra-passe.</p>
            <p style="margin:0 0 14px;">Este link expira em 1 hora. Se não fez este pedido, ignore esta mensagem — a sua palavra-passe permanece inalterada.</p>
            """

            html_content = EmailService._build_email_html(
                title="Redefinir a palavra-passe",
                body_html=body_html,
                action_text="Redefinir palavra-passe",
                action_url=reset_link,
                preheader="Pedido de redefinição de palavra-passe.",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send password reset email: {str(e)}")
            return False

    @staticmethod
    def send_guest_cv_claim_email(email: str, full_name: str, claim_link: str) -> bool:
        """Sent once, the first time a guest-created account has a CV on
        file (via the CV builder's first export, or a spontaneous CV-drop
        submission), nudging them to set a real password so they can log
        back in later. Reuses the password-reset token mechanism —
        clicking the link both verifies the email and claims the account
        AND lets them set that password in one step (see
        AuthService.reset_password)."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            subject = f"{settings.BRAND_NAME} — O seu CV foi recebido"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
            <p style="margin:0 0 14px;">O seu CV foi recebido e fica guardado no seu perfil em {escape(settings.BRAND_NAME)}. Defina uma palavra-passe para poder entrar, acompanhar o estado do seu perfil e ser contactado sobre vagas relevantes.</p>
            <p style="margin:0 0 14px;">Este link expira em 1 hora. Se não pretende guardar uma conta, pode ignorar esta mensagem.</p>
            """

            html_content = EmailService._build_email_html(
                title="O seu CV foi recebido",
                body_html=body_html,
                action_text="Definir palavra-passe",
                action_url=claim_link,
                preheader="Defina uma palavra-passe para guardar o acesso ao seu perfil.",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send guest CV claim email: {str(e)}")
            return False

    @staticmethod
    def send_welcome_email(email: str, full_name: str, role: str) -> bool:
        """Send welcome email after successful registration."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            role_pt = {"candidate": "Candidato", "company": "Empresa", "admin": "Administrador"}.get(
                str(role).lower(), str(role)
            )
            subject = f"Bem-vindo à {settings.BRAND_NAME}"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
            <p style="margin:0 0 14px;">A sua conta foi criada com sucesso como <strong>{escape(role_pt)}</strong>.</p>
            <p style="margin:0 0 14px;">Já pode iniciar sessão e começar a usar a {settings.BRAND_NAME}.</p>
            """

            html_content = EmailService._build_email_html(
                title=f"Bem-vindo à {settings.BRAND_NAME}",
                body_html=body_html,
                action_text="Abrir a plataforma",
                action_url=settings.FRONTEND_URL,
                preheader="A sua conta foi criada com sucesso.",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send welcome email: {str(e)}")
            return False

    @staticmethod
    def send_newsletter_confirmation_email(email: str) -> bool:
        """Confirm a newsletter opt-in (job-openings + platform news)."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            subject = f"Subscrição confirmada — {settings.BRAND_NAME}"
            body_html = """
            <p style="margin:0 0 14px;">Olá,</p>
            <p style="margin:0 0 14px;">A sua subscrição foi confirmada. Vai passar a receber novidades sobre novas vagas e da plataforma.</p>
            <p style="margin:0 0 14px;">Pode cancelar a subscrição a qualquer momento a partir dos links nos nossos e-mails.</p>
            """

            html_content = EmailService._build_email_html(
                title="Subscrição confirmada",
                body_html=body_html,
                action_text="Ver vagas disponíveis",
                action_url=f"{settings.FRONTEND_URL}/Vagas-Disponiveis",
                preheader="A sua subscrição às novidades da Parvagas foi confirmada.",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send newsletter confirmation email: {str(e)}")
            return False

    @staticmethod
    def send_newsletter_issue_email(
        email: str,
        subject: str,
        intro_paragraphs: list[str],
        jobs_html: str,
        unsubscribe_url: str,
    ) -> bool:
        """A compiled newsletter issue, sent to one subscriber. Dispatched via
        the generic send_templated_email task so every send gets EmailLog
        coverage. Always carries a working one-click unsubscribe link — the
        confirmation email sent on signup already promises this exists."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            paragraphs_html = "".join(
                f'<p style="margin:0 0 14px;">{escape(p)}</p>' for p in intro_paragraphs if p and p.strip()
            )
            body_html = paragraphs_html + jobs_html + f"""
            <p style="margin:20px 0 0; font-size:12px; color:#a1a1aa;">
              Já não quer receber estes emails?
              <a href="{unsubscribe_url}" style="color:#a1a1aa; text-decoration:underline;">Cancelar subscrição</a>.
            </p>
            """

            html_content = EmailService._build_email_html(
                title=subject,
                body_html=body_html,
                action_text="Ver todas as vagas",
                action_url=f"{settings.FRONTEND_URL}/Vagas-Disponiveis",
                preheader=subject,
            )

            return EmailService._send_email(email, f"{settings.BRAND_NAME} — {subject}", html_content)

        except Exception as e:
            logger.error(f"Failed to send newsletter issue email: {str(e)}")
            return False

    @staticmethod
    def send_application_received_email(email: str, full_name: str, job_id: str, tracking_url: str = "") -> bool:
        """Send acknowledgement after a job application is submitted.

        `tracking_url` is set only for guest (no-account) applicants — it's a
        token link to a public status page, since they have no portal to log
        into. Candidates with an account get the normal "see your portal"
        copy instead.
        """
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            job_url = f"{(settings.FRONTEND_URL or '').rstrip('/')}/Vagas-Disponiveis/{job_id}"
            subject = f"{settings.BRAND_NAME} — Candidatura recebida"
            if tracking_url:
                tracking_line = f'<p style="margin:0 0 14px;">Como não tem conta, use este link para acompanhar o estado da sua candidatura a qualquer momento: <a href="{tracking_url}" style="color:{settings.BRAND_PRIMARY_COLOR};">acompanhar candidatura</a>.</p>'
                action_text, action_url = "Acompanhar candidatura", tracking_url
            else:
                tracking_line = '<p style="margin:0 0 14px;">Pode acompanhar o estado das suas candidaturas no seu portal.</p>'
                action_text, action_url = "Ver a vaga", job_url

            body_html = f"""
            <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
            <p style="margin:0 0 14px;">Recebemos a sua candidatura. A equipa de recrutamento vai analisar o seu perfil e será notificado/a sempre que houver uma atualização.</p>
            {tracking_line}
            """

            html_content = EmailService._build_email_html(
                title="Candidatura recebida",
                body_html=body_html,
                action_text=action_text,
                action_url=action_url,
                preheader="Recebemos a sua candidatura.",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send application confirmation email: {str(e)}")
            return False

    # Candidate-facing labels + short messages for each pipeline state.
    _STATUS_COPY = {
        "under_review": ("Candidatura em análise", "A sua candidatura está a ser analisada pela equipa de recrutamento."),
        "viewed": ("Candidatura visualizada", "A empresa visualizou a sua candidatura."),
        "shortlisted": ("Pré-selecionado", "Boas notícias — foi pré-selecionado/a para esta vaga."),
        "interview": ("Convite para entrevista", "Foi selecionado/a para uma entrevista. A empresa irá contactá-lo/a com os próximos passos."),
        "offer": ("Proposta de emprego", "Parabéns! Recebeu uma proposta para esta vaga."),
        "hired": ("Contratado", "Parabéns! Foi selecionado/a para a vaga. Bem-vindo/a à equipa."),
        "rejected": ("Atualização da candidatura", "Agradecemos o seu interesse. Desta vez a empresa avançou com outros candidatos, mas o seu perfil continua ativo para futuras oportunidades."),
    }

    @staticmethod
    def send_application_status_email(email: str, full_name: str, job_title: str, new_status: str) -> bool:
        """Notify a candidate when the status of their application changes."""
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {email}")
                return False

            status_key = str(new_status or "").strip().lower()
            title, message = EmailService._STATUS_COPY.get(
                status_key, ("Atualização da candidatura", "Há uma atualização sobre a sua candidatura.")
            )
            role = (full_name or "").strip() or "Candidato/a"
            job_label = (job_title or "").strip() or "a vaga a que se candidatou"
            portal_url = f"{(settings.FRONTEND_URL or '').rstrip('/')}/Portal/Candidato"

            subject = f"{settings.BRAND_NAME} — {title}: {job_label}"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {escape(role)},</p>
            <p style="margin:0 0 14px;">{message}</p>
            <p style="margin:0 0 4px; color:#71717a; font-size:13px;">Vaga</p>
            <p style="margin:0 0 14px; font-weight:600; color:#18181b;">{escape(job_label)}</p>
            <p style="margin:0 0 14px;">Pode ver os detalhes no seu portal de candidato.</p>
            """

            html_content = EmailService._build_email_html(
                title=title,
                body_html=body_html,
                action_text="Ver candidaturas",
                action_url=portal_url,
                preheader=f"{title}: {job_label}",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send application status email: {str(e)}")
            return False

    # ------------------------------------------------------------------ #
    #  Shared compose helper — keeps every template tiny and consistent.  #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _compose_and_send(
        to_email: str,
        subject: str,
        title: str,
        body_html: str,
        action_text: str = "",
        action_url: str = "",
        preheader: str = "",
    ) -> bool:
        try:
            if not EmailService._email_enabled():
                logger.warning(f"Email not configured, skipping email to {to_email}")
                return False
            html = EmailService._build_email_html(title, body_html, action_text, action_url, preheader)
            return EmailService._send_email(to_email, subject, html)
        except Exception as e:
            logger.error(f"Failed to send '{subject}' to {to_email}: {e}")
            return False

    @staticmethod
    def _base_url() -> str:
        return (settings.FRONTEND_URL or "https://parvagas.pt").rstrip("/")

    # ============================ CANDIDATES ============================ #

    @staticmethod
    def send_job_alert_digest(email: str, full_name: str, query_label: str, jobs: list) -> bool:
        """Daily/instant digest of new jobs matching a candidate's saved alert."""
        base = EmailService._base_url()
        rows = ""
        for j in (jobs or [])[:10]:
            title = escape((j.get("title") or "Vaga").strip())
            company = escape((j.get("company") or "").strip())
            location = escape((j.get("location") or "").strip())
            url = j.get("url") or f"{base}/Vagas-Disponiveis/{j.get('id', '')}"
            meta = " · ".join([x for x in [company, location] if x])
            rows += f"""
            <a href="{url}" style="display:block; text-decoration:none; border:1px solid #f0f0f0; border-radius:10px; padding:14px 16px; margin:0 0 10px;">
              <span style="display:block; font-size:15px; font-weight:600; color:#18181b;">{title}</span>
              <span style="display:block; font-size:13px; color:#71717a; margin-top:2px;">{meta}</span>
            </a>"""
        count = len(jobs or [])
        body = f"""
        <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
        <p style="margin:0 0 16px;">Encontrámos <strong>{count}</strong> nova(s) vaga(s) para o seu alerta <strong>{escape(query_label)}</strong>:</p>
        {rows}
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Novas vagas para si",
            "Novas vagas para o seu alerta", body,
            "Ver todas as vagas", f"{base}/Vagas-Disponiveis",
            preheader=f"{count} nova(s) vaga(s) para {query_label}",
        )

    @staticmethod
    def send_account_suspended_email(email: str, full_name: str, reason: str = "") -> bool:
        reason_html = f'<p style="margin:0 0 14px;">Motivo: {escape(reason)}</p>' if reason else ""
        body = f"""
        <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
        <p style="margin:0 0 14px;">A sua conta na {settings.BRAND_NAME} foi suspensa e o acesso está temporariamente indisponível.</p>
        {reason_html}
        <p style="margin:0 0 14px;">Se considera que se trata de um engano, responda a este email para contactar a nossa equipa.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Conta suspensa",
            "A sua conta foi suspensa", body,
            preheader="A sua conta foi suspensa.",
        )

    @staticmethod
    def send_account_reactivated_email(email: str, full_name: str) -> bool:
        body = f"""
        <p style="margin:0 0 14px;">Olá {escape(full_name)},</p>
        <p style="margin:0 0 14px;">A sua conta na {settings.BRAND_NAME} foi reativada. Já pode iniciar sessão normalmente.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Conta reativada",
            "A sua conta foi reativada", body,
            "Iniciar sessão", f"{EmailService._base_url()}/Login",
            preheader="A sua conta foi reativada.",
        )

    # ============================ COMPANIES ============================= #

    @staticmethod
    def send_company_verified_email(email: str, company_name: str) -> bool:
        base = EmailService._base_url()
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">A empresa <strong>{escape(company_name)}</strong> foi verificada com sucesso. A partir de agora as suas vagas exibem o selo de empresa verificada.</p>
        <p style="margin:0 0 14px;">Já pode publicar vagas e gerir candidaturas no seu portal.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Empresa verificada",
            "Empresa verificada", body,
            "Abrir portal da empresa", f"{base}/Portal/Empresa/Perfil",
            preheader=f"{company_name} foi verificada.",
        )

    @staticmethod
    def send_company_rejected_email(email: str, company_name: str, reason: str = "") -> bool:
        reason_html = f'<p style="margin:0 0 14px;">Motivo: {escape(reason)}</p>' if reason else ""
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">Não foi possível verificar a empresa <strong>{escape(company_name)}</strong> neste momento.</p>
        {reason_html}
        <p style="margin:0 0 14px;">Pode atualizar os dados da empresa e voltar a submeter para revisão.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Verificação não aprovada",
            "Verificação não aprovada", body,
            "Rever dados da empresa", f"{EmailService._base_url()}/Portal/Empresa/Perfil",
            preheader="A verificação da empresa não foi aprovada.",
        )

    @staticmethod
    def send_company_suspended_email(email: str, company_name: str, reason: str = "") -> bool:
        reason_html = f'<p style="margin:0 0 14px;">Motivo: {escape(reason)}</p>' if reason else ""
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">A conta da empresa <strong>{escape(company_name)}</strong> foi suspensa. As vagas ativas deixam de estar visíveis até à reativação.</p>
        {reason_html}
        <p style="margin:0 0 14px;">Para esclarecer a situação, responda a este email.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Conta de empresa suspensa",
            "Conta de empresa suspensa", body,
            preheader="A conta da empresa foi suspensa.",
        )

    @staticmethod
    def send_new_applicant_email(email: str, recruiter_name: str, candidate_name: str, job_title: str, application_id: str = "") -> bool:
        """Notify a company when a new candidate applies to one of their jobs."""
        base = EmailService._base_url()
        body = f"""
        <p style="margin:0 0 14px;">Olá {escape(recruiter_name or '')},</p>
        <p style="margin:0 0 14px;">Recebeu uma nova candidatura.</p>
        <p style="margin:0 0 4px; color:#71717a; font-size:13px;">Candidato</p>
        <p style="margin:0 0 12px; font-weight:600; color:#18181b;">{escape(candidate_name or 'Candidato')}</p>
        <p style="margin:0 0 4px; color:#71717a; font-size:13px;">Vaga</p>
        <p style="margin:0 0 14px; font-weight:600; color:#18181b;">{escape(job_title or 'a sua vaga')}</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Nova candidatura: {job_title or 'vaga'}",
            "Nova candidatura recebida", body,
            "Ver candidaturas", f"{base}/Portal/Empresa/Candidaturas",
            preheader=f"{candidate_name or 'Um candidato'} candidatou-se a {job_title or 'a sua vaga'}.",
        )

    @staticmethod
    def send_external_employer_new_applicant_email(
        email: str, company_name: str, candidate_name: str, job_title: str, view_url: str, claim_url: str,
    ) -> bool:
        """Notify a real hiring company that has no Parvagas account when a
        candidate applies to one of their (aggregated/scraped) postings.

        `view_url` is a token link to a read-only list of every application
        received for this specific job — no login required. `claim_url`
        offers to convert this into a real company account so future
        applications land in a proper dashboard instead of an inbox.
        """
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">Recebeu uma nova candidatura para uma vaga publicada no {escape(settings.BRAND_NAME)}.</p>
        <p style="margin:0 0 4px; color:#71717a; font-size:13px;">Candidato</p>
        <p style="margin:0 0 12px; font-weight:600; color:#18181b;">{escape(candidate_name or 'Candidato')}</p>
        <p style="margin:0 0 4px; color:#71717a; font-size:13px;">Vaga</p>
        <p style="margin:0 0 14px; font-weight:600; color:#18181b;">{escape(job_title or 'a sua vaga')}</p>
        <p style="margin:0 0 14px;">Pode ver todas as candidaturas recebidas para esta vaga através do link abaixo — não precisa de criar conta.</p>
        <p style="margin:0 0 14px;">Se preferir gerir as suas vagas e candidaturas num painel completo (respostas, estados, histórico), pode <a href="{claim_url}" style="color:{settings.BRAND_PRIMARY_COLOR};">criar uma conta de empresa gratuita</a> a qualquer momento.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Nova candidatura: {job_title or 'vaga'}",
            "Nova candidatura recebida", body,
            "Ver candidaturas desta vaga", view_url,
            preheader=f"{candidate_name or 'Um candidato'} candidatou-se a {job_title or 'a sua vaga'} no {settings.BRAND_NAME}.",
        )

    @staticmethod
    def send_job_approved_email(email: str, recruiter_name: str, job_title: str, job_id: str = "") -> bool:
        base = EmailService._base_url()
        body = f"""
        <p style="margin:0 0 14px;">Olá {escape(recruiter_name or '')},</p>
        <p style="margin:0 0 14px;">A sua vaga <strong>{escape(job_title)}</strong> foi aprovada e está agora publicada e visível para candidatos.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Vaga publicada: {job_title}",
            "A sua vaga foi publicada", body,
            "Ver a vaga", f"{base}/Vagas-Disponiveis/{job_id}",
            preheader=f"{job_title} foi aprovada e publicada.",
        )

    @staticmethod
    def send_job_rejected_email(email: str, recruiter_name: str, job_title: str, reason: str = "") -> bool:
        reason_html = f'<p style="margin:0 0 14px;">Motivo: {escape(reason)}</p>' if reason else ""
        body = f"""
        <p style="margin:0 0 14px;">Olá {escape(recruiter_name or '')},</p>
        <p style="margin:0 0 14px;">A sua vaga <strong>{escape(job_title)}</strong> não foi aprovada para publicação.</p>
        {reason_html}
        <p style="margin:0 0 14px;">Pode editar a vaga e voltar a submeter para revisão.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Vaga não aprovada: {job_title}",
            "Vaga não aprovada", body,
            "Editar vaga", f"{EmailService._base_url()}/Portal/Empresa/Vagas",
            preheader=f"{job_title} não foi aprovada.",
        )

    @staticmethod
    def send_team_invite_email(email: str, company_name: str, inviter_name: str, invite_link: str, role: str = "membro") -> bool:
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;"><strong>{escape(inviter_name or 'Um administrador')}</strong> convidou-o/a para se juntar à equipa de <strong>{escape(company_name)}</strong> na {settings.BRAND_NAME} como <strong>{escape(role)}</strong>.</p>
        <p style="margin:0 0 14px;">Este convite expira em 7 dias.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Convite para a equipa de {company_name}",
            "Foi convidado para uma equipa", body,
            "Aceitar convite", invite_link,
            preheader=f"Convite para a equipa de {company_name}.",
        )

    @staticmethod
    def send_subscription_activated_email(email: str, company_name: str, plan_name: str, period_end: str = "") -> bool:
        when = f" Renova em {escape(period_end)}." if period_end else ""
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">A subscrição do plano <strong>{escape(plan_name)}</strong> da empresa <strong>{escape(company_name)}</strong> está ativa.{when}</p>
        <p style="margin:0 0 14px;">Obrigado por confiar na {settings.BRAND_NAME}.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Plano {plan_name} ativado",
            "Subscrição ativada", body,
            "Ver faturação", f"{EmailService._base_url()}/Portal/Empresa/Planos",
            preheader=f"O plano {plan_name} está ativo.",
        )

    @staticmethod
    def send_payment_instructions_email(email: str, company_name: str, plan_name: str, amount, currency: str, reference: str) -> bool:
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">Para ativar o plano <strong>{escape(plan_name)}</strong> da empresa <strong>{escape(company_name)}</strong>, conclua o pagamento com os dados abaixo.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
          <tr><td style="padding:4px 0; color:#71717a; font-size:13px;">Montante</td><td style="padding:4px 0 4px 16px; font-weight:600; color:#18181b;">{escape(str(amount))} {escape(str(currency))}</td></tr>
          <tr><td style="padding:4px 0; color:#71717a; font-size:13px;">Referência</td><td style="padding:4px 0 4px 16px; font-weight:600; color:#18181b; font-family:monospace;">{escape(str(reference))}</td></tr>
        </table>
        <p style="margin:0 0 14px;">A conta é ativada automaticamente assim que o pagamento for confirmado.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Pagamento pendente ({reference})",
            "Conclua o seu pagamento", body,
            "Ver faturação", f"{EmailService._base_url()}/Portal/Empresa/Planos",
            preheader=f"Pagamento pendente — referência {reference}.",
        )

    @staticmethod
    def send_subscription_expiring_email(email: str, company_name: str, plan_name: str, days_left: int) -> bool:
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">O plano <strong>{escape(plan_name)}</strong> da empresa <strong>{escape(company_name)}</strong> expira dentro de <strong>{days_left} dia(s)</strong>.</p>
        <p style="margin:0 0 14px;">Renove para manter as vagas ativas e o acesso a todas as funcionalidades.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — O seu plano expira em breve",
            "O seu plano expira em breve", body,
            "Renovar plano", f"{EmailService._base_url()}/Portal/Empresa/Planos",
            preheader=f"O plano {plan_name} expira em {days_left} dia(s).",
        )

    @staticmethod
    def send_subscription_lapsed_grace_email(
        email: str, party_name: str, plan_name: str, grace_days_left: int, portal_path: str,
    ) -> bool:
        """Sent once, the day a plan's period ends without renewal — the
        manual-payment-rail equivalent of a dunning notice (there is no
        automatic card charge to retry; this asks the user to complete a
        manual payment before access is actually cut)."""
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">O plano <strong>{escape(plan_name)}</strong> de <strong>{escape(party_name)}</strong> terminou sem renovação.</p>
        <p style="margin:0 0 14px;">Tem <strong>{grace_days_left} dia(s)</strong> para renovar antes de perder o acesso às funcionalidades do plano.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — O seu plano terminou",
            "O seu plano terminou", body,
            "Renovar agora", f"{EmailService._base_url()}{portal_path}",
            preheader=f"Tem {grace_days_left} dia(s) para renovar o plano {plan_name}.",
        )

    @staticmethod
    def send_dispute_message_email(email: str, subject: str, title: str, body_html: str, portal_path: str) -> bool:
        """Generic passthrough for the canned dispute-response templates
        (Modelo A-F, modelo-resposta-disputa.md) — the PT copy itself lives
        in app.services.dispute_service since it's tightly coupled to the
        dispute state machine, not a fixed brand template like the rest of
        this file's methods."""
        return EmailService._compose_and_send(
            email, subject, title, body_html,
            "Ver disputa", f"{EmailService._base_url()}{portal_path}",
            preheader=title,
        )

    @staticmethod
    def send_company_verification_email(email: str, subject: str, body: str) -> bool:
        """Admin-composed company-verification-workflow email (approval,
        request for more info, rejection, deactivation). The admin UI's
        preview-then-send flow lets the subject/body be freely edited before
        sending, so — like send_dispute_message_email — this is a generic
        passthrough rather than one of the fixed per-status templates
        elsewhere in this file."""
        body_html = "".join(
            f'<p style="margin:0 0 14px;">{escape(line)}</p>' for line in (body or "").split("\n") if line.strip()
        )
        return EmailService._compose_and_send(email, subject, subject, body_html, preheader=subject)

    @staticmethod
    def send_subscription_expired_email(email: str, party_name: str, plan_name: str, portal_path: str) -> bool:
        body = f"""
        <p style="margin:0 0 14px;">Olá,</p>
        <p style="margin:0 0 14px;">O plano <strong>{escape(plan_name)}</strong> de <strong>{escape(party_name)}</strong> foi desativado por falta de renovação dentro do período de tolerância.</p>
        <p style="margin:0 0 14px;">Pode subscrever novamente a qualquer momento para recuperar o acesso.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Plano desativado",
            "Plano desativado", body,
            "Ver planos", f"{EmailService._base_url()}{portal_path}",
            preheader=f"O plano {plan_name} foi desativado.",
        )

    # ============================== ADMINS ============================== #

    @staticmethod
    def send_admin_company_pending_email(email: str, company_name: str) -> bool:
        body = f"""
        <p style="margin:0 0 14px;">A empresa <strong>{escape(company_name)}</strong> submeteu-se para verificação e aguarda revisão.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Empresa a aguardar verificação",
            "Nova empresa para verificar", body,
            "Rever empresas", f"{EmailService._base_url()}/Admin",
            preheader=f"{company_name} aguarda verificação.",
        )

    @staticmethod
    def send_admin_job_pending_email(email: str, job_title: str, company_name: str) -> bool:
        body = f"""
        <p style="margin:0 0 14px;">A vaga <strong>{escape(job_title)}</strong> de <strong>{escape(company_name)}</strong> aguarda revisão antes de ser publicada.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Vaga a aguardar revisão",
            "Nova vaga para rever", body,
            "Rever vagas", f"{EmailService._base_url()}/Admin",
            preheader=f"{job_title} aguarda revisão.",
        )

    @staticmethod
    def send_scraped_jobs_digest_email(email: str, pending_count: int) -> bool:
        """Daily nudge so scraped jobs don't pile up unreviewed. Caller is
        responsible for not sending this when pending_count is 0."""
        body = f"""
        <p style="margin:0 0 14px;">
            Há <strong>{pending_count}</strong> vaga{"s" if pending_count != 1 else ""} raspada{"s" if pending_count != 1 else ""}
            à espera de revisão no painel de curadoria.
        </p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — {pending_count} vaga(s) raspada(s) por rever",
            "Vagas por rever", body,
            "Rever vagas raspadas", f"{EmailService._base_url()}/Portal/Admin/scraped?filter=pending",
            preheader=f"{pending_count} vaga(s) aguardam a sua revisão.",
        )

    @staticmethod
    def send_admin_job_reported_email(email: str, job_title: str, reason: str = "", reporter: str = "") -> bool:
        who = f" por {escape(reporter)}" if reporter else ""
        reason_html = f'<p style="margin:0 0 14px;">Motivo indicado: {escape(reason)}</p>' if reason else ""
        body = f"""
        <p style="margin:0 0 14px;">A vaga <strong>{escape(job_title)}</strong> foi denunciada{who}.</p>
        {reason_html}
        <p style="margin:0 0 14px;">Reveja a vaga e tome a ação adequada.</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Vaga denunciada: {job_title}",
            "Vaga denunciada", body,
            "Rever vagas", f"{EmailService._base_url()}/Admin",
            preheader=f"{job_title} foi denunciada.",
        )

    @staticmethod
    def send_admin_contact_message_email(email: str, sender_name: str, sender_role: str, reason: str, message: str) -> bool:
        body = f"""
        <p style="margin:0 0 14px;"><strong>{escape(sender_name)}</strong> ({escape(sender_role)}) enviou uma mensagem através do painel.</p>
        <p style="margin:0 0 14px;">Motivo: {escape(reason)}</p>
        <p style="margin:0 0 14px; white-space:pre-wrap;">{escape(message)}</p>
        """
        return EmailService._compose_and_send(
            email, f"{settings.BRAND_NAME} — Nova mensagem: {reason}",
            "Nova mensagem de utilizador", body,
            "Ver utilizadores", f"{EmailService._base_url()}/Admin",
            preheader=f"{sender_name} enviou uma mensagem.",
        )

    # ============================ SECURITY ============================== #

    @staticmethod
    def send_security_alert_email(subject: str, title: str, lines: list[str]) -> bool:
        """Alert the admins about a security concern (login burst, email
        rate-limit hit, ...). Goes to SECURITY_ALERT_EMAIL cc
        SECURITY_ALERT_CC, and bypasses the hourly outbound cap
        (priority=True) — the alert about abuse must not be suppressed by the
        very cap that the abuse tripped."""
        try:
            if not EmailService._email_enabled():
                logger.warning("Email not configured, skipping security alert")
                return False
            paragraphs = "".join(
                f'<p style="margin:0 0 14px;">{escape(line)}</p>' for line in lines
            )
            html = EmailService._build_email_html(
                title=title,
                body_html=paragraphs,
                action_text="Abrir separador Segurança",
                action_url=f"{EmailService._base_url()}/Portal/Admin/security",
                preheader=title,
            )
            return EmailService._send_email(
                settings.SECURITY_ALERT_EMAIL,
                f"{settings.BRAND_NAME} — {subject}",
                html,
                cc=settings.SECURITY_ALERT_CC or None,
                priority=True,
            )
        except Exception as e:
            logger.error(f"Failed to send security alert email: {e}")
            return False

    @staticmethod
    def _email_enabled() -> bool:
        """True when a usable delivery provider is configured."""
        if settings.EMAIL_PROVIDER == "resend":
            return bool(settings.RESEND_API_KEY)
        return bool(settings.SMTP_HOST)

    @staticmethod
    def _check_outbound_rate_limit(to_email: str) -> bool:
        """Enforce the global hourly outbound cap (EMAIL_MAX_PER_HOUR).

        Returns True when the send may proceed. Counter lives in Redis keyed
        by the current UTC hour; if Redis is unreachable the check fails OPEN
        (legitimate transactional email must not depend on Redis uptime). On
        the first send over the cap, a high-severity security event is
        recorded and the admins are alerted (via the priority bypass).
        """
        limit = settings.EMAIL_MAX_PER_HOUR
        if limit <= 0:
            return True
        try:
            import redis as _redis
            from datetime import datetime, timezone

            client = _redis.Redis.from_url(settings.REDIS_URL, socket_timeout=3)
            hour_key = f"email:outbound:{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"
            count = client.incr(hour_key)
            if count == 1:
                client.expire(hour_key, 7200)
            if count <= limit:
                return True
            logger.error(
                f"Outbound email cap hit ({count}/{limit} this hour) — blocked send to {to_email}"
            )
            if count == limit + 1:  # alert once per hour-window, on first block
                from app.services.security_service import record_email_rate_limit_hit
                record_email_rate_limit_hit(sent_this_hour=int(count), blocked_recipient=to_email)
            return False
        except Exception as e:  # noqa: BLE001 — fail open
            logger.warning(f"Outbound rate-limit check unavailable ({e}); allowing send")
            return True

    @staticmethod
    def _send_via_resend(to_email: str, subject: str, html_content: str, cc: str | None = None) -> bool:
        """Send through the Resend HTTP API (better deliverability than a shared SMTP IP)."""
        import httpx

        payload = {"from": settings.SMTP_FROM, "to": [to_email], "subject": subject, "html": html_content}
        if cc:
            payload["cc"] = [cc]
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json=payload,
            timeout=15,
        )
        if resp.status_code in (200, 201):
            logger.info(f"Email sent to {to_email} via Resend")
            return True
        logger.error(f"Resend send failed ({resp.status_code}): {resp.text[:200]}")
        return False

    @staticmethod
    def _send_email(
        to_email: str,
        subject: str,
        html_content: str,
        cc: str | None = None,
        priority: bool = False,
    ) -> bool:
        """Send an email via the configured provider (smtp | resend).

        `priority=True` (security alerts only) skips the hourly outbound cap.
        """
        try:
            if not priority and not EmailService._check_outbound_rate_limit(to_email):
                return False

            if settings.EMAIL_PROVIDER == "resend":
                return EmailService._send_via_resend(to_email, subject, html_content, cc=cc)

            # Default: SMTP
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.SMTP_FROM
            msg["To"] = to_email
            if cc:
                msg["Cc"] = cc
            msg.attach(MIMEText(html_content, "html"))
            # Port 465 = SMTPS (implicit TLS from first byte, use SMTP_SSL).
            # Port 587 / SMTP_SECURE = submission with STARTTLS upgrade (use SMTP).
            if settings.SMTP_PORT == 465:
                import ssl as _ssl
                with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT,
                                       timeout=20, context=_ssl.create_default_context()) as server:
                    server.ehlo()
                    if settings.SMTP_USER and settings.SMTP_PASS:
                        server.login(settings.SMTP_USER, settings.SMTP_PASS)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
                    server.ehlo()
                    if settings.SMTP_SECURE or server.has_extn("starttls"):
                        server.starttls()
                        server.ehlo()
                    if settings.SMTP_USER and settings.SMTP_PASS:
                        server.login(settings.SMTP_USER, settings.SMTP_PASS)
                    server.send_message(msg)
            logger.info(f"Email sent to {to_email} via SMTP")
            return True

        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False

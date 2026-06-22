"""Email service for sending emails."""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
            if not settings.SMTP_HOST:
                logger.warning(f"SMTP not configured, skipping email to {email}")
                return False
            
            subject = f"{settings.BRAND_NAME} — Confirme o seu email"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {full_name},</p>
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
            if not settings.SMTP_HOST:
                logger.warning(f"SMTP not configured, skipping email to {email}")
                return False
            
            subject = f"{settings.BRAND_NAME} — Redefinir a sua palavra-passe"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {full_name},</p>
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
    def send_welcome_email(email: str, full_name: str, role: str) -> bool:
        """Send welcome email after successful registration."""
        try:
            if not settings.SMTP_HOST:
                logger.warning(f"SMTP not configured, skipping email to {email}")
                return False
            
            role_pt = {"candidate": "Candidato", "company": "Empresa", "admin": "Administrador"}.get(
                str(role).lower(), str(role)
            )
            subject = f"Bem-vindo à {settings.BRAND_NAME}"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {full_name},</p>
            <p style="margin:0 0 14px;">A sua conta foi criada com sucesso como <strong>{role_pt}</strong>.</p>
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
    def send_application_received_email(email: str, full_name: str, job_id: str) -> bool:
        """Send acknowledgement after a job application is submitted."""
        try:
            if not settings.SMTP_HOST:
                logger.warning(f"SMTP not configured, skipping email to {email}")
                return False

            job_url = f"{(settings.FRONTEND_URL or '').rstrip('/')}/Vagas-Disponiveis/{job_id}"
            subject = f"{settings.BRAND_NAME} — Candidatura recebida"
            body_html = f"""
            <p style="margin:0 0 14px;">Olá {full_name},</p>
            <p style="margin:0 0 14px;">Recebemos a sua candidatura. A equipa de recrutamento vai analisar o seu perfil e será notificado/a sempre que houver uma atualização.</p>
            <p style="margin:0 0 14px;">Pode acompanhar o estado das suas candidaturas no seu portal.</p>
            """

            html_content = EmailService._build_email_html(
                title="Candidatura recebida",
                body_html=body_html,
                action_text="Ver a vaga",
                action_url=job_url,
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
            if not settings.SMTP_HOST:
                logger.warning(f"SMTP not configured, skipping email to {email}")
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
            <p style="margin:0 0 14px;">Olá {role},</p>
            <p style="margin:0 0 14px;">{message}</p>
            <p style="margin:0 0 4px; color:#71717a; font-size:13px;">Vaga</p>
            <p style="margin:0 0 14px; font-weight:600; color:#18181b;">{job_label}</p>
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

    @staticmethod
    def _send_email(to_email: str, subject: str, html_content: str) -> bool:
        """Internal method to send email via SMTP."""
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.SMTP_FROM
            msg["To"] = to_email
            
            # Attach HTML
            msg.attach(MIMEText(html_content, "html"))
            
            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_SECURE:
                    server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASS:
                    server.login(settings.SMTP_USER, settings.SMTP_PASS)
                server.send_message(msg)
            
            logger.info(f"Email sent to {to_email}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False

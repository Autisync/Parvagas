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
    def _build_email_html(title: str, body_html: str, action_text: str = "", action_url: str = "") -> str:
        """Build a branded email layout shared by all templates."""
        html_template = """
        <div style="font-family: Arial, sans-serif; background: #f4f6f8; padding: 24px;">
            <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
                <div style="padding: 20px; background: {{ brand_bg_muted }}; text-align: center; border-bottom: 1px solid #e5e7eb;">
                    <img src="{{ brand_logo_url }}" alt="{{ brand_name }}" style="max-height: 56px; width: auto;" />
                </div>
                <div style="padding: 28px; color: {{ brand_text_strong }}; line-height: 1.6;">
                    <h2 style="margin-top: 0; margin-bottom: 16px; color: {{ brand_text_strong }};">{{ title }}</h2>
                    <div>{{ body_html | safe }}</div>
                    {% if action_text and action_url %}
                    <div style="margin: 24px 0;">
                        <a href="{{ action_url }}" style="display: inline-block; padding: 12px 18px; border-radius: 9999px; background: {{ brand_primary_color }}; color: #ffffff; text-decoration: none; font-weight: 600;">{{ action_text }}</a>
                    </div>
                    {% endif %}
                </div>
                <div style="padding: 18px 28px; border-top: 1px solid #e5e7eb; color: {{ brand_text_muted }}; font-size: 13px; background: {{ brand_bg_muted }};">
                    <p style="margin: 0 0 6px;">{{ brand_team_name }}</p>
                    <p style="margin: 0;">{{ brand_name }}</p>
                </div>
            </div>
        </div>
        """

        return Template(html_template).render(
            title=title,
            body_html=body_html,
            action_text=action_text,
            action_url=action_url,
            brand_logo_url=settings.BRAND_LOGO_URL,
            brand_name=settings.BRAND_NAME,
            brand_team_name=settings.BRAND_TEAM_NAME,
            brand_primary_color=settings.BRAND_PRIMARY_COLOR,
            brand_primary_color_hover=settings.BRAND_PRIMARY_COLOR_HOVER,
            brand_text_strong=settings.BRAND_TEXT_STRONG,
            brand_text_muted=settings.BRAND_TEXT_MUTED,
            brand_bg_muted=settings.BRAND_BG_MUTED,
        )
    
    @staticmethod
    def send_verification_email(email: str, full_name: str, verification_link: str) -> bool:
        """Send email verification email."""
        try:
            if not settings.SMTP_HOST:
                logger.warning(f"SMTP not configured, skipping email to {email}")
                return False
            
            subject = f"{settings.BRAND_NAME} - Verify Your Email"
            body_html = f"""
            <p>Hello {full_name},</p>
            <p>Thank you for signing up. Please verify your email to activate your account.</p>
            <p>This link expires in 24 hours.</p>
            <p>If you did not create this account, you can ignore this message.</p>
            """

            html_content = EmailService._build_email_html(
                title="Welcome! Verify Your Email",
                body_html=body_html,
                action_text="Verify Email",
                action_url=verification_link,
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
            
            subject = f"{settings.BRAND_NAME} - Reset Your Password"
            body_html = f"""
            <p>Hello {full_name},</p>
            <p>We received a request to reset your password.</p>
            <p>This link expires in 1 hour. If you did not request a reset, you can ignore this message.</p>
            """

            html_content = EmailService._build_email_html(
                title="Password Reset Request",
                body_html=body_html,
                action_text="Reset Password",
                action_url=reset_link,
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
            
            subject = f"Welcome to {settings.BRAND_NAME}!"
            body_html = f"""
            <p>Hello {full_name},</p>
            <p>Your account has been created successfully as a <strong>{role}</strong>.</p>
            <p>You can now log in and start using {settings.BRAND_NAME}.</p>
            """

            html_content = EmailService._build_email_html(
                title=f"Welcome to {settings.BRAND_NAME}",
                body_html=body_html,
                action_text="Open Platform",
                action_url=settings.FRONTEND_URL,
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

            subject = f"{settings.BRAND_NAME} - Candidatura recebida"
            body_html = f"""
            <p>Olá {full_name},</p>
            <p>Recebemos a sua candidatura para a vaga <strong>{job_id}</strong>.</p>
            <p>A equipa de recrutamento irá analisar o seu perfil e entrar em contacto quando houver atualização.</p>
            """

            html_content = EmailService._build_email_html(
                title="Candidatura recebida com sucesso",
                body_html=body_html,
                action_text="Ver vagas disponíveis",
                action_url=f"{settings.FRONTEND_URL}/Vagas-Disponiveis",
            )

            return EmailService._send_email(email, subject, html_content)

        except Exception as e:
            logger.error(f"Failed to send application confirmation email: {str(e)}")
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

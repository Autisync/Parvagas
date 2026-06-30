/**
 * reCAPTCHA disclosure. The floating badge is hidden via CSS
 * (.grecaptcha-badge in globals.css), which Google permits only if this
 * disclosure is shown next to the protected action. Render it near the
 * submit button on any page that calls getRecaptchaToken().
 */
export default function RecaptchaNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] leading-snug text-slate-400 ${className}`}>
      Este site é protegido pelo reCAPTCHA e aplicam-se a{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-600"
      >
        Política de Privacidade
      </a>{" "}
      e os{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-600"
      >
        Termos de Serviço
      </a>{" "}
      da Google.
    </p>
  );
}

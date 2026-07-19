import { Trans } from "@lingui/react/macro";
import { cn } from "@reactive-resume/utils/style";
import { branding } from "@/libs/branding";

type Props = React.ComponentProps<"div">;

export function Copyright({ className, ...props }: Props) {
	return (
		<div className={cn("text-muted-foreground/80 text-xs leading-relaxed", className)} {...props}>
			<p>
				<Trans>
					Consulte os{" "}
					<a
						href="https://parvagas.pt/termos"
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium underline underline-offset-2"
					>
						Termos e Condicoes
					</a>
					.
				</Trans>
			</p>

			<p>
				<Trans>Parvagas CV Builder</Trans>
			</p>
			<p>
				<Trans>
					Plataforma tecnológica concebida e desenvolvida pela{" "}
					<a
						href={branding.autisyncUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium underline underline-offset-2"
					>
						Autisync
					</a>
					.
				</Trans>
			</p>
			<p>
				<Trans>
					Baseado no projeto open-source Reactive Resume, licenciado sob MIT.{" "}
					<a
						href={branding.mitLicenseUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium underline underline-offset-2"
					>
						Licenca
					</a>
					.
				</Trans>
			</p>

			<p>
				<Trans>
					Suporte:{" "}
					<a
						target="_blank"
						rel="noopener noreferrer"
						href="mailto:suporte@parvagas.pt"
						className="font-medium underline underline-offset-2"
					>
						suporte@parvagas.pt
					</a>
					.
				</Trans>
			</p>

			<p className="mt-4">
				<Trans comment="App version label in footer; includes semantic version variable">
					Parvagas CV Builder v{__APP_VERSION__}
				</Trans>
			</p>
		</div>
	);
}

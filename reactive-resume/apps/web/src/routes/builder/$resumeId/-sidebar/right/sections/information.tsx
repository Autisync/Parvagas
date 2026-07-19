import { Trans } from "@lingui/react/macro";
import { HandHeartIcon } from "@phosphor-icons/react";
import { Button } from "@reactive-resume/ui/components/button";
import { SectionBase } from "../shared/section-base";

export function InformationSectionBuilder() {
	return (
		<SectionBase type="information" className="space-y-4">
			<div className="space-y-2 rounded-md border bg-sky-600 p-5 text-white dark:bg-sky-700">
				<h4 className="font-medium tracking-tight">
					<Trans>Need help with Parvagas CV Builder?</Trans>
				</h4>

				<div className="space-y-2 text-xs leading-normal">
					<Trans>
						<p>
							O Parvagas CV Builder faz parte do ecossistema oficial da Parvagas para candidatos e recrutadores.
						</p>
						<p>
							Se tiver dificuldades com conta, exportacao, templates ou candidaturas, fale com o suporte oficial.
						</p>
					</Trans>
				</div>

				<Button
					size="sm"
					variant="default"
					nativeButton={false}
					className="mt-2 whitespace-normal px-4! text-xs"
					render={
						<a href="mailto:suporte@parvagas.pt" target="_blank" rel="noopener noreferrer">
							<HandHeartIcon />
							<span className="truncate">
								<Trans>Contactar suporte Parvagas</Trans>
							</span>
						</a>
					}
				/>
			</div>

			<div className="flex flex-wrap gap-0.5">
				<Button
					size="sm"
					variant="link"
					className="text-xs"
					nativeButton={false}
					render={
						<a href="https://parvagas.pt" target="_blank" rel="noopener noreferrer">
							<Trans>Documentation</Trans>
						</a>
					}
				/>

				<Button
					size="sm"
					variant="link"
					className="text-xs"
					nativeButton={false}
					render={
						<a href="https://parvagas.pt/termos" target="_blank" rel="noopener noreferrer">
							<Trans>Terms</Trans>
						</a>
					}
				/>

				<Button
					size="sm"
					variant="link"
					className="text-xs"
					nativeButton={false}
					render={
						<a href="mailto:suporte@parvagas.pt" target="_blank" rel="noopener noreferrer">
							<Trans>Report a Bug</Trans>
						</a>
					}
				/>

				<Button
					size="sm"
					variant="link"
					className="text-xs"
					nativeButton={false}
					render={
						<a href="https://parvagas.pt/privacidade" target="_blank" rel="noopener noreferrer">
							<Trans>Privacy</Trans>
						</a>
					}
				/>

				<Button
					size="sm"
					variant="link"
					className="text-xs"
					nativeButton={false}
					render={
						<a href="https://parvagas.pt" target="_blank" rel="noopener noreferrer">
							<Trans>Parvagas Website</Trans>
						</a>
					}
				/>
			</div>
		</SectionBase>
	);
}

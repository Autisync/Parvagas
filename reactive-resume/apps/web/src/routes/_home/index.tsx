import { createFileRoute } from "@tanstack/react-router";
import { createRootStructuredDataScript, getCanonicalRootUrl } from "@/libs/seo";
import { Faq } from "./-sections/faq";
import { Features } from "./-sections/features";
import { Footer } from "./-sections/footer";
import { Hero } from "./-sections/hero";
import { Prefooter } from "./-sections/prefooter";
import { Templates } from "./-sections/templates";

export const Route = createFileRoute("/_home/")({
	component: RouteComponent,
	head: () => {
		const appUrl = typeof window !== "undefined" ? window.location.origin : "https://cv.parvagas.pt";
		const canonicalUrl = getCanonicalRootUrl(appUrl);

		return {
			links: [{ rel: "canonical", href: canonicalUrl }],
			scripts: [createRootStructuredDataScript(canonicalUrl)],
		};
	},
});

function RouteComponent() {
	return (
		<main id="main-content" className="relative bg-background text-foreground">
			<Hero />

			<div className="container mx-auto px-4 pb-10 sm:px-6 lg:px-12">
				<div className="overflow-hidden rounded-3xl border bg-card shadow-sm [&>section]:border-border [&>section]:border-t">
					<Features />
					<Templates />
					<Faq />
					<Prefooter />
					<Footer />
				</div>
			</div>
		</main>
	);
}

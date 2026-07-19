import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { onError } from "@orpc/server";
import { BatchHandlerPlugin, RequestHeadersPlugin, StrictGetMethodPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { downloadResumePdfProcedure } from "@reactive-resume/api/features/resume/export";
import router from "@reactive-resume/api/routers";
import { env } from "@reactive-resume/env/server";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { appVersion } from "../app-version";
import { mergeResponseHeaders } from "../http/headers";
import { getRequestLocale } from "../rpc/locale";

const openAPIRouter = {
	...router,
	resume: {
		...router.resume,
		downloadPdf: downloadResumePdfProcedure,
	},
};

const openAPIHandler = new OpenAPIHandler(openAPIRouter, {
	plugins: [
		new BatchHandlerPlugin(),
		new RequestHeadersPlugin(),
		new StrictGetMethodPlugin(),
		new SmartCoercionPlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error("[OpenAPI]", error);
		}),
	],
});

const openAPIGenerator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

export async function handleOpenApi(request: Request) {
	if (request.method === "GET" && (request.url.endsWith("/spec.json") || request.url.endsWith("/spec"))) {
		const spec = await openAPIGenerator.generate(openAPIRouter, {
			info: {
				title: "Parvagas CV Builder API",
				version: appVersion,
				description:
					"Parvagas CV Builder API. Plataforma tecnologica concebida e desenvolvida pela Autisync, baseada no projeto open-source Reactive Resume (MIT).",
				license: { name: "MIT", url: "https://github.com/amruthpillai/reactive-resume/blob/main/LICENSE" },
				contact: { name: "Parvagas", email: "suporte@parvagas.pt", url: "https://parvagas.pt/contactos" },
			},
			servers: [{ url: `${env.APP_URL}/api/openapi` }],
			externalDocs: { url: "https://docs.rxresu.me", description: "Reactive Resume Documentation (upstream)" },
			commonSchemas: {
				ResumeData: { schema: resumeDataSchema },
			},
			components: {
				securitySchemes: {
					apiKey: {
						type: "apiKey",
						name: "x-api-key",
						in: "header",
						description: "The API key to authenticate requests.",
					},
				},
			},
			security: [{ apiKey: [] }],
			filter: ({ contract }) => !contract["~orpc"].route.tags?.includes("Internal"),
		});

		return Response.json(spec);
	}

	const resHeaders = new Headers();
	const { response } = await openAPIHandler.handle(request, {
		prefix: "/api/openapi",
		context: { locale: getRequestLocale(request), reqHeaders: request.headers, resHeaders },
	});

	if (!response) return new Response("NOT_FOUND", { status: 404 });
	return mergeResponseHeaders(response, resHeaders);
}

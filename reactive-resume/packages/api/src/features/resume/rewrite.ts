import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { assertAiRequestsAllowed } from "../../integrations/parvagas/entitlements";
import { protectedProcedure } from "../../context";

const rewriteInput = z.object({
	id: z.string().min(1),
	tone: z.string().optional(),
	instructions: z.string().optional(),
});

export const rewrite = protectedProcedure
	.route({
		method: "POST",
		path: "/resumes/{id}/rewrite",
		tags: ["Resumes"],
		operationId: "rewriteResume",
		summary: "Rewrite a resume with the Parvagas backend",
		description:
			"Forwards the rewrite request to the Parvagas backend service and returns the generated result. Requires authentication.",
		successDescription: "The rewritten resume payload returned by the backend.",
	})
	.input(rewriteInput)
	.output(z.unknown())
	.handler(async ({ input, context }) => {
		await assertAiRequestsAllowed(context.user.id);
		const backendUrl = process.env.PARVAGAS_BACKEND_URL || process.env.BACKEND_URL || "http://backend-python:8000";
		const url = `${backendUrl.replace(/\/$/, "")}/resumes/rewrite`;

		const headers = new Headers();
		const authorization = context.reqHeaders.get("authorization");
		if (authorization) headers.set("authorization", authorization);
		const apiKey = context.reqHeaders.get("x-api-key");
		if (apiKey) headers.set("x-api-key", apiKey);
		const cookie = context.reqHeaders.get("cookie");
		if (cookie) headers.set("cookie", cookie);
		headers.set("content-type", "application/json");

		const body = JSON.stringify({
			resume_id: input.id,
			tone: input.tone ?? "professional",
			instructions: input.instructions,
		});

		let res: Response;
		try {
			res = await fetch(url, { method: "POST", headers, body });
		} catch {
			throw new ORPCError("BACKEND_PYTHON_UNAVAILABLE", {
				status: 502,
				message: "Failed to reach Parvagas backend for resume rewrite.",
			});
		}

		if (!res.ok) {
			const text = await res.text().catch(() => null);
			throw new ORPCError("BACKEND_PYTHON_ERROR", {
				status: res.status,
				message: "Parvagas backend returned an error during resume rewrite.",
				data: text,
			});
		}

		const data = await res.json().catch(() => null);
		if (!data) throw new ORPCError("INVALID_BACKEND_RESPONSE", { status: 502 });

		return data;
	});

export default rewrite;

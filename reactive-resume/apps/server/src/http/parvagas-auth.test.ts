import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	env: {
		APP_URL: "http://localhost:3050",
		PARVAGAS_API_URL: "http://localhost:8000",
		PARVAGAS_API_KEY: "server-secret",
		PARVAGAS_SERVER_SECRET: "server-secret",
		PARVAGAS_MAIN_URL: "https://parvagas.pt",
		PARVAGAS_CANDIDATE_CV_URL: "https://parvagas.pt/Portal/Candidato/CV-e-Documentos",
		PARVAGAS_ALLOWED_RETURN_ORIGINS: "https://parvagas.pt,http://localhost:3000",
		PARVAGAS_AUTH_EXCHANGE_PATH: "/api/v1/cv-builder/exchange",
		PARVAGAS_AUTH_START_FALLBACK_URL: "https://parvagas.pt/Login?role=candidate",
	},
	findAccountByProviderId: vi.fn(),
	findUserById: vi.fn(),
	findUserByEmail: vi.fn(),
	createAccount: vi.fn(),
	createSession: vi.fn(),
	getCookies: vi.fn(),
	fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetchMock);

vi.mock("@reactive-resume/env/server", () => ({ env: mocks.env }));
vi.mock("@reactive-resume/db/client", () => ({ db: { insert: vi.fn(), select: vi.fn() } }));
vi.mock("@reactive-resume/db/schema", () => ({ account: {}, user: {} }));
vi.mock("@reactive-resume/utils/string", () => ({
	generateId: () => "generated-id",
	toUsername: (value: string) => value.toLowerCase(),
}));

vi.mock("@reactive-resume/auth/config", () => ({
	auth: {
		options: {},
		$context: Promise.resolve({
			secret: "auth-secret",
			sessionConfig: { expiresIn: 604800 },
			internalAdapter: {
				findAccountByProviderId: mocks.findAccountByProviderId,
				findUserById: mocks.findUserById,
				findUserByEmail: mocks.findUserByEmail,
				createAccount: mocks.createAccount,
				createSession: mocks.createSession,
			},
		}),
	},
}));

vi.mock("better-auth/cookies", () => ({
	getCookies: mocks.getCookies,
}));

const { handleParvagasExchange, handleParvagasStart } = await import("./parvagas-auth");

describe("parvagas-auth handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.findUserByEmail.mockResolvedValue(null);
		mocks.findAccountByProviderId.mockResolvedValue({ userId: "local-user-1" });
		mocks.findUserById.mockResolvedValue({ id: "local-user-1", email: "candidate@parvagas.pt" });
		mocks.createSession.mockResolvedValue({ token: "session-token" });
		mocks.getCookies.mockReturnValue({
			sessionToken: {
				name: "better-auth.session_token",
				attributes: {
					httpOnly: true,
					path: "/",
					secure: false,
					sameSite: "lax",
				},
			},
		});
		mocks.fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					sub: "parvagas-user-1",
					email: "candidate@parvagas.pt",
					name: "Candidate Name",
					return_url: "http://localhost:3000/Portal/Candidato/CV-e-Documentos",
					nonce: "nonce-1",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);
	});

	it("redirects /auth/parvagas/start to Parvagas login with safe returnTo", async () => {
		const response = await handleParvagasStart();

		expect(response.status).toBe(302);
		const location = response.headers.get("Location") ?? "";
		expect(location).toContain("https://parvagas.pt/Login?role=candidate");
		expect(location).toContain("returnTo=http%3A%2F%2Flocalhost%3A3050%2Fauth%2Fparvagas%2Fstart");
	});

	it("returns error redirect when code query param is missing", async () => {
		const request = new Request("http://localhost:3050/auth/parvagas/exchange");
		const response = await handleParvagasExchange(request);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("https://parvagas.pt/Login?role=candidate&error=parvagas_exchange_failed");
		expect(mocks.fetchMock).not.toHaveBeenCalled();
	});

	it("exchanges code, sets session cookie and redirects to dashboard resumes by default", async () => {
		const request = new Request("http://localhost:3050/auth/parvagas/exchange?code=abc123");
		const response = await handleParvagasExchange(request);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/dashboard/resumes?from=parvagas");
		expect(response.headers.get("Set-Cookie")).toContain("better-auth.session_token=session-token.");
		expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
		expect(mocks.fetchMock).toHaveBeenCalledOnce();
		expect(mocks.fetchMock).toHaveBeenCalledWith(
			"http://localhost:8000/api/v1/cv-builder/exchange",
			expect.objectContaining({
				headers: expect.objectContaining({ "X-CV-Builder-Key": "server-secret" }),
			}),
		);
	});

	it("redirects to target resume builder route when target_resume_id is present", async () => {
		mocks.fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					sub: "parvagas-user-1",
					email: "candidate@parvagas.pt",
					name: "Candidate Name",
					return_url: "http://localhost:3000/Portal/Candidato/CV-e-Documentos",
					nonce: "nonce-1",
					target_resume_id: "resume-77",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const request = new Request("http://localhost:3050/auth/parvagas/exchange?code=abc123");
		const response = await handleParvagasExchange(request);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/builder/resume-77?from=parvagas");
	});

	it("does not silently link an existing local account solely by email", async () => {
		mocks.findAccountByProviderId.mockResolvedValueOnce(null);
		mocks.findUserByEmail.mockResolvedValueOnce({ user: { id: "email-user-1", email: "candidate@parvagas.pt" } });

		const request = new Request("http://localhost:3050/auth/parvagas/exchange?code=abc123");
		const response = await handleParvagasExchange(request);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("error=parvagas_exchange_failed");
		expect(mocks.createAccount).not.toHaveBeenCalled();
		expect(mocks.createSession).not.toHaveBeenCalled();
	});
});

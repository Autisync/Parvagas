import { createHash, createHmac } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getCookies } from "better-auth/cookies";
import { auth } from "@reactive-resume/auth/config";
import { db } from "@reactive-resume/db/client";
import { account, user } from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { generateId, toUsername } from "@reactive-resume/utils/string";

const PARVAGAS_PROVIDER = "parvagas";

type ExchangePayload = {
	sub: string;
	email: string;
	name: string;
	avatar_url?: string | null;
	locale?: string;
	plan?: string;
	return_url: string;
	nonce: string;
	target_resume_id?: string | null;
};

type CookieOptions = {
	domain?: string;
	expires?: Date;
	httpOnly?: boolean;
	maxAge?: number;
	path?: string;
	sameSite?: "lax" | "strict" | "none";
	secure?: boolean;
	partitioned?: boolean;
};

function serializeSignedCookie(key: string, value: string, secret: string, options: CookieOptions = {}): string {
	const signature = createHmac("sha256", secret).update(value).digest("base64");
	let cookie = `${key}=${encodeURIComponent(`${value}.${signature}`)}`;

	if (options.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
	if (options.domain) cookie += `; Domain=${options.domain}`;
	if (options.path) cookie += `; Path=${options.path}`;
	if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
	if (options.httpOnly) cookie += "; HttpOnly";
	if (options.secure) cookie += "; Secure";
	if (options.sameSite) cookie += `; SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`;
	if (options.partitioned) cookie += "; Partitioned";

	return cookie;
}

function sanitizeRedirectTarget(pathOrUrl: string | null | undefined): string {
	if (!pathOrUrl) return "/dashboard";

	try {
		const parsed = new URL(pathOrUrl, env.APP_URL);
		const appOrigin = new URL(env.APP_URL).origin;
		const allowedReturnOrigins = env.PARVAGAS_ALLOWED_RETURN_ORIGINS.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean);
		if (parsed.origin !== appOrigin && !allowedReturnOrigins.includes(parsed.origin)) return "/dashboard";
		return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/dashboard";
	} catch {
		return "/dashboard";
	}
}

function buildDestination(payload: ExchangePayload): string {
	const requested = sanitizeRedirectTarget(payload.return_url);
	if (payload.target_resume_id) {
		const encoded = encodeURIComponent(payload.target_resume_id);
		return `/builder/${encoded}?from=parvagas`;
	}
	if (requested.startsWith("/Portal/")) return "/dashboard/resumes?from=parvagas";
	return requested;
}

function getParvagasServerSecret(): string | undefined {
	return env.PARVAGAS_SERVER_SECRET || env.PARVAGAS_API_KEY;
}

function baseUsernameFrom(email: string): string {
	const [local] = email.split("@");
	const normalized = toUsername(local || "");
	if (normalized.length >= 3) return normalized;
	return `user${normalized}`.slice(0, 64);
}

async function resolveUniqueUsername(email: string): Promise<string> {
	const base = baseUsernameFrom(email);

	for (let i = 0; i < 25; i += 1) {
		const candidate = i === 0 ? base : `${base}${String(i).padStart(2, "0")}`.slice(0, 64);
		const existing = await db
			.select({ id: user.id })
			.from(user)
			.where(or(eq(user.username, candidate), eq(user.displayUsername, candidate)))
			.limit(1);
		if (existing.length === 0) return candidate;
	}

	const suffix = createHash("sha256").update(`${email}:${Date.now()}`).digest("hex").slice(0, 8);
	return `${base.slice(0, 55)}${suffix}`;
}

async function exchangeCodeWithParvagas(code: string): Promise<ExchangePayload> {
	if (!env.PARVAGAS_API_URL) throw new Error("PARVAGAS_API_URL is not configured");
	const serverSecret = getParvagasServerSecret();
	if (!serverSecret) throw new Error("PARVAGAS_SERVER_SECRET is not configured");

	const endpoint = new URL(env.PARVAGAS_AUTH_EXCHANGE_PATH, env.PARVAGAS_API_URL).toString();
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-CV-Builder-Key": serverSecret,
		},
		body: JSON.stringify({ code }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Parvagas exchange failed (${response.status}): ${body}`);
	}

	const payload = (await response.json()) as ExchangePayload;
	if (!payload.sub || !payload.email || !payload.name) {
		throw new Error("Parvagas exchange returned an incomplete identity payload");
	}
	return payload;
}

async function ensureLocalUser(payload: ExchangePayload) {
	const context = await auth.$context;

	const existingProviderAccount = await context.internalAdapter.findAccountByProviderId(payload.sub, PARVAGAS_PROVIDER);
	if (existingProviderAccount) {
		const existingUser = await context.internalAdapter.findUserById(existingProviderAccount.userId);
		if (existingUser) return existingUser;
	}

	const byEmail = await context.internalAdapter.findUserByEmail(payload.email, { includeAccounts: true });
	if (byEmail?.user) {
		throw new Error("Já existe uma conta do CV Builder com este email. Entre nessa conta e associe o Parvagas antes de continuar.");
	}

	const username = await resolveUniqueUsername(payload.email);
	const now = new Date();
	const inserted = await db
		.insert(user)
		.values({
			id: generateId(),
			email: payload.email,
			name: payload.name,
			image: payload.avatar_url ?? null,
			emailVerified: true,
			username,
			displayUsername: username,
			createdAt: now,
			updatedAt: now,
		})
		.returning({ id: user.id })
		.then((rows) => rows[0]);

	await db.insert(account).values({
		id: generateId(),
		accountId: payload.sub,
		providerId: PARVAGAS_PROVIDER,
		userId: inserted.id,
		createdAt: now,
		updatedAt: now,
	});

	const createdUser = await context.internalAdapter.findUserById(inserted.id);
	if (!createdUser) throw new Error("Could not load created user");
	return createdUser;
}

async function createSignedSessionCookie(userId: string): Promise<string> {
	const context = await auth.$context;
	const session = await context.internalAdapter.createSession(userId, false);
	const authCookies = getCookies(auth.options);
	const maxAge = context.sessionConfig.expiresIn;

	return Promise.resolve(serializeSignedCookie(
		authCookies.sessionToken.name,
		session.token,
		context.secret,
		{
			...authCookies.sessionToken.attributes,
			maxAge,
		},
	));
}

function buildErrorRedirect(message: string): string {
	const login = new URL(env.PARVAGAS_AUTH_START_FALLBACK_URL, env.PARVAGAS_MAIN_URL);
	login.searchParams.set("error", "parvagas_exchange_failed");
	login.searchParams.set("message", message.slice(0, 160));
	return login.toString();
}

export async function handleParvagasStart(): Promise<Response> {
	const login = new URL(env.PARVAGAS_AUTH_START_FALLBACK_URL, env.PARVAGAS_MAIN_URL);
	if (!login.searchParams.has("returnTo")) {
		login.searchParams.set("returnTo", new URL("/auth/parvagas/start", env.APP_URL).toString());
	}
	return new Response(null, {
		status: 302,
		headers: { Location: login.toString() },
	});
}

export async function handleParvagasExchange(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const code = (url.searchParams.get("code") || "").trim();
	if (!code) {
		return new Response(null, {
			status: 302,
			headers: { Location: buildErrorRedirect("Código de sessão inválido.") },
		});
	}

	try {
		const payload = await exchangeCodeWithParvagas(code);
		const localUser = await ensureLocalUser(payload);
		const sessionCookie = await createSignedSessionCookie(localUser.id);
		const destination = buildDestination(payload);

		const headers = new Headers({
			Location: destination,
			"Cache-Control": "no-store",
		});
		headers.append("Set-Cookie", sessionCookie);

		return new Response(null, { status: 302, headers });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Falha inesperada ao iniciar sessão";
		return new Response(null, {
			status: 302,
			headers: { Location: buildErrorRedirect(message) },
		});
	}
}

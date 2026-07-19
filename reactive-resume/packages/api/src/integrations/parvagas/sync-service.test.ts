import { describe, expect, it } from "vitest";
import { computeBackoffSeconds, mapActionToEventType, toSignature } from "./sync-service";

describe("parvagas sync service helpers", () => {
	it("maps resume actions to canonical sync events", () => {
		expect(mapActionToEventType("create")).toBe("resume.created");
		expect(mapActionToEventType("import")).toBe("resume.created");
		expect(mapActionToEventType("duplicate")).toBe("resume.created");
		expect(mapActionToEventType("update")).toBe("resume.updated");
		expect(mapActionToEventType("patch")).toBe("resume.updated");
		expect(mapActionToEventType("delete")).toBe("resume.deleted");
	});

	it("uses exponential backoff with a hard cap", () => {
		expect(computeBackoffSeconds(1)).toBe(30);
		expect(computeBackoffSeconds(2)).toBe(60);
		expect(computeBackoffSeconds(3)).toBe(120);
		expect(computeBackoffSeconds(10)).toBe(1800);
	});

	it("produces deterministic HMAC signatures", () => {
		const signature = toSignature("secret", "1700000000", '{"x":1}');
		expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
		expect(signature).toBe(toSignature("secret", "1700000000", '{"x":1}'));
		expect(signature).not.toBe(toSignature("secret", "1700000001", '{"x":1}'));
	});
});

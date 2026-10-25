import { describe, expect, it } from "vitest";
import { EXAMPLE_WORKFLOW, maskSecret, parseWorkflows, scanWorkflow } from "@/lib/n8nscan";

const scan = (wf: object) => scanWorkflow(wf as never);
const ids = (wf: object) => scan(wf).findings.map((f) => f.id);

describe("n8n workflow risk scanner", () => {
  it("finds every risk in the example workflow and never shows a full secret", () => {
    const r = scan(JSON.parse(EXAMPLE_WORKFLOW));
    expect(r.findings.map((f) => f.id)).toEqual(expect.arrayContaining(["secrets", "open-webhook", "swallowed-errors", "ai-retry", "ai-output-unchecked", "api-retry", "empty-results", "wf-error-workflow", "timezone", "no-heartbeat"]));
    expect(r.grade).toBe("At risk");
    const text = JSON.stringify(r);
    expect(text).not.toContain("9f3kQ7xLm2Vb8nR4tY6wZ1pS5dH0jC3e");
    expect(text).toContain("Bearer••••");
  });

  it("gives a well-built workflow a good score", () => {
    const r = scan({
      name: "Safe", settings: { errorWorkflow: "12", timezone: "Europe/London" },
      nodes: [
        { name: "Hook", type: "n8n-nodes-base.webhook", parameters: { authentication: "headerAuth" } },
        { name: "Get", type: "n8n-nodes-base.httpRequest", retryOnFail: true, parameters: { url: "https://x", authentication: "genericCredentialType" } },
        { name: "Empty?", type: "n8n-nodes-base.if", parameters: {} },
        { name: "AI", type: "@n8n/n8n-nodes-langchain.agent", retryOnFail: true, parameters: { text: "={{ $json.q }}" } },
        { name: "Valid?", type: "n8n-nodes-base.code", parameters: {} },
      ],
      connections: { Hook: { main: [[{ node: "Get" }]] }, Get: { main: [[{ node: "Empty?" }]] }, "Empty?": { main: [[{ node: "AI" }]] }, AI: { main: [[{ node: "Valid?" }]] } },
    });
    expect(r.findings).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.passed).toEqual(expect.arrayContaining(["No API keys or tokens pasted inside nodes", "Webhooks require authentication", "An error workflow is set"]));
  });

  it("detects common key formats, and auth headers with literal values, but not expressions or credentials", () => {
    const node = (v: string, name = "Authorization") => ({ nodes: [{ name: "H", type: "n8n-nodes-base.httpRequest", retryOnFail: true, parameters: { headerParameters: { parameters: [{ name, value: v }] } } }], connections: {} });
    expect(ids(node("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123"))).toContain("secrets");
    expect(ids(node("AIzaSyA1234567890abcdefghijklmnopqrstuv"))).toContain("secrets");
    expect(ids(node("a8f5f167f44f4964e6c998dee827110c", "x-api-key"))).toContain("secrets");
    expect(ids(node("={{ $credentials.token }}"))).not.toContain("secrets");
    expect(ids(node("application/json", "Content-Type"))).not.toContain("secrets");
    for (const placeholder of ["YOUR_API_KEY_HERE_PLEASE", "Bearer {your_token_goes_here}", "bot[your_telegram_token]", "SUPABASE_SERVICE_ROLE_KEY"]) expect(ids(node(placeholder))).not.toContain("secrets");
  });

  it("doesn't judge settings it can't see when nodes were copied from the canvas", () => {
    const r = scan({ nodes: [{ name: "S", type: "n8n-nodes-base.scheduleTrigger", parameters: {} }], connections: {} });
    expect(r.settingsMissing).toBe(true);
    expect(r.findings.map((f) => f.id)).not.toContain("wf-error-workflow");
    expect(r.findings.map((f) => f.id)).not.toContain("timezone");
  });

  it("flags HTTP never-error, pinned data and disabled nodes; Langchain sub-nodes are not orphans", () => {
    const r = scan({
      nodes: [
        { name: "T", type: "n8n-nodes-base.manualTrigger" },
        { name: "H", type: "n8n-nodes-base.httpRequest", retryOnFail: true, parameters: { options: { response: { response: { neverError: true } } } } },
        { name: "Model", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi" },
        { name: "Old", type: "n8n-nodes-base.set", disabled: true },
      ],
      connections: { T: { main: [[{ node: "H" }]] }, Model: { ai_languageModel: [[{ node: "H" }]] } },
      pinData: { H: [{ json: { email: "a@b.com" } }] },
    });
    const got = r.findings.map((f) => f.id);
    expect(got).toEqual(expect.arrayContaining(["never-error", "pinned-data", "disabled"]));
    expect(got).not.toContain("orphans");
  });

  it("parses single workflows, copied nodes and arrays, and explains bad input", () => {
    expect(parseWorkflows(EXAMPLE_WORKFLOW)).toMatchObject({ ok: true });
    expect(parseWorkflows(JSON.stringify([JSON.parse(EXAMPLE_WORKFLOW), JSON.parse(EXAMPLE_WORKFLOW)]))).toMatchObject({ ok: true, workflows: [{}, {}] });
    expect(parseWorkflows("hello")).toMatchObject({ ok: false });
    expect(parseWorkflows('{"foo":1}')).toMatchObject({ ok: false });
    expect(maskSecret("abcdefghijkl")).toBe("abcdef••••kl");
  });

  it("flags AI output that is used without a structure check, unless a parser or check follows", () => {
    const ai = { name: "Write reply", type: "@n8n/n8n-nodes-langchain.chainLlm", retryOnFail: true, parameters: {} };
    const crm = { name: "CRM", type: "n8n-nodes-base.hubspot", retryOnFail: true };
    const t = { name: "T", type: "n8n-nodes-base.manualTrigger" };
    const flagged = scan({ nodes: [t, ai, crm], connections: { T: { main: [[{ node: "Write reply" }]] }, "Write reply": { main: [[{ node: "CRM" }]] } } });
    expect(flagged.findings.find((f) => f.id === "ai-output-unchecked")).toMatchObject({ nodes: ["Write reply"], severity: "medium" });

    const withParser = scan({
      nodes: [t, ai, crm, { name: "Parser", type: "@n8n/n8n-nodes-langchain.outputParserStructured" }],
      connections: { T: { main: [[{ node: "Write reply" }]] }, "Write reply": { main: [[{ node: "CRM" }]] }, Parser: { ai_outputParser: [[{ node: "Write reply" }]] } },
    });
    expect(withParser.findings.map((f) => f.id)).not.toContain("ai-output-unchecked");
    expect(withParser.passed).toContain("AI output is checked before it's used");

    const withIf = scan({
      nodes: [t, ai, { name: "Has fields?", type: "n8n-nodes-base.if" }, crm],
      connections: { T: { main: [[{ node: "Write reply" }]] }, "Write reply": { main: [[{ node: "Has fields?" }]] }, "Has fields?": { main: [[{ node: "CRM" }]] } },
    });
    expect(withIf.findings.map((f) => f.id)).not.toContain("ai-output-unchecked");

    const extractor = scan({ nodes: [t, { name: "Extract", type: "@n8n/n8n-nodes-langchain.informationExtractor", retryOnFail: true }], connections: { T: { main: [[{ node: "Extract" }]] } } });
    expect(extractor.findings.map((f) => f.id)).not.toContain("ai-output-unchecked");
  });
});

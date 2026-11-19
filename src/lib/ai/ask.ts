import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You are Ops AI inside CallOpps, a calling CRM for an admissions/sales call centre in India.
Answer the manager's question using only the report data provided below. It covers the current and previous month,
in India time. Definitions: win rate = Won ÷ (Won + Lost); follow-up calls = calls on leads that already had a call;
fresh connected = a lead's first connected call; logged hours come from punch-in/punch-out.
Be concise and concrete: lead with the answer, then the few numbers that support it. Use a small table when comparing
agents or processes. If the data can't answer the question, say what is missing instead of guessing.
You never see customer names, phone numbers or emails, and you should not ask for them.`;

export type Turn = { role: "user" | "assistant"; content: string };
export class AiNotConnected extends Error {}

let client: Anthropic | null = null;

export async function askOps(context: unknown, history: Turn[], question: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new AiNotConnected();
  client ??= new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // a declined request is retried on a fallback model inside the same call
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM },
        // The data block is the same for every question this hour, so cache it.
        { type: "text", text: `Report data (JSON):\n${JSON.stringify(context)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [...history, { role: "user", content: question }],
    });
    if (res.stop_reason === "refusal") return "I can't help with that question. Try asking about the report numbers.";
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return text || "I couldn't produce an answer. Try rephrasing the question.";
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiNotConnected();
    if (e instanceof Anthropic.RateLimitError) throw new Error("Ops AI is busy. Try again in a minute.");
    if (e instanceof Anthropic.APIError) { console.error("ops-ai", e.status, e.message); throw new Error("Ops AI couldn't answer right now. Try again."); }
    throw e;
  }
}

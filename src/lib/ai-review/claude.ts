import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ReviewModel, TokenUsage } from "./review";

/** The current lightweight Claude model, unless AI_REVIEW_MODEL names another. */
export const CLAUDE_MODEL = process.env.AI_REVIEW_MODEL ?? "claude-haiku-5-5";

/** The Claude adapter for AI 검토, or null when this server has no API key. */
export function claudeReviewModel(onUsage?: (usage: TokenUsage) => void): ReviewModel | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  return {
    async countTokens({ system, user }) {
      const { input_tokens } = await client.messages.countTokens({
        model: CLAUDE_MODEL,
        system,
        messages: [{ role: "user", content: user }],
      });
      return input_tokens;
    },
    async generate({ system, user }, schema) {
      const response = await client.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(schema), effort: "medium" },
      });
      onUsage?.({ input: response.usage.input_tokens, output: response.usage.output_tokens });
      // A refusal or a cut-off answer is no answer.
      if (response.stop_reason !== "end_turn") return null;
      return response.parsed_output;
    },
  };
}

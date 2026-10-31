import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Prompt, ReviewModel, TokenUsage } from "./review";

/** The prompt text, then each attached picture after its label. */
function content({ user, images = [] }: Prompt): Anthropic.ContentBlockParam[] {
  return [
    { type: "text", text: user },
    ...images.flatMap((image): Anthropic.ContentBlockParam[] => [
      { type: "text", text: image.label },
      { type: "image", source: { type: "base64", media_type: image.mime, data: image.data } },
    ]),
  ];
}

/** The current lightweight Claude model, unless AI_REVIEW_MODEL names another. */
export const CLAUDE_MODEL = process.env.AI_REVIEW_MODEL ?? "claude-haiku-5-5";

/** The Claude adapter for AI 검토, or null when this server has no API key. */
export function claudeReviewModel(onUsage?: (usage: TokenUsage) => void): ReviewModel | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  return {
    async countTokens(prompt) {
      const { input_tokens } = await client.messages.countTokens({
        model: CLAUDE_MODEL,
        system: prompt.system,
        messages: [{ role: "user", content: content(prompt) }],
      });
      return input_tokens;
    },
    async generate(prompt, schema) {
      const response = await client.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: prompt.system,
        messages: [{ role: "user", content: content(prompt) }],
        output_config: { format: zodOutputFormat(schema), effort: "medium" },
      });
      onUsage?.({ input: response.usage.input_tokens, output: response.usage.output_tokens });
      // A refusal or a cut-off answer is no answer.
      if (response.stop_reason !== "end_turn") return null;
      return response.parsed_output;
    },
  };
}

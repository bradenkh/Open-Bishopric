import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

export function getAIModel(): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? "openai-compat";
  const apiKey = process.env.AI_API_KEY!;
  const modelName = process.env.AI_MODEL ?? "glm-4-flash";

  if (provider === "deepseek") {
    const deepseek = createDeepSeek({ apiKey });
    return deepseek(modelName) as LanguageModel;
  }

  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4/",
  });
  return openai(modelName);
}

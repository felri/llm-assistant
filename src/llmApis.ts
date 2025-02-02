import OpenAI from "openai";

// Extended options so that local providers (like Ollama) can pass an endpoint URL.
export interface LLMResponseOptions {
  apiKey: string;
  endpointUrl?: string; // for local server endpoints (e.g. Ollama)
  prompt: string;
  model: string;
  /**
   * Callback invoked for each streaming chunk received.
   */
  onChunk: (chunk: string) => void;
  /**
   * Callback invoked once streaming is complete.
   */
  onComplete: () => void;
}

/**
 * Uses the official OpenAI package to create a streaming chat completion.
 */
export async function callOpenAiWithPackage(
  options: LLMResponseOptions
): Promise<void> {
  const { apiKey, prompt, model, onChunk, onComplete } = options;
  const openai = new OpenAI({ apiKey });

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      store: true,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        onChunk(content);
      }
    }
    onComplete();
  } catch (error: any) {
    console.error("Error in callOpenAiWithPackage:", error);
    onChunk(`\n[Error calling OpenAI: ${error.message || error}]`);
    onComplete();
  }
}

/**
 * Uses DeepSeek for streaming chat completions.
 * It appends both any reasoning_content and content.
 */
export async function callDeepseek(options: LLMResponseOptions): Promise<void> {
  const { apiKey, prompt, model, onChunk, onComplete } = options;
  const deepseek = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  try {
    const stream = await deepseek.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      store: true,
      stream: true,
    });
    for await (const chunk of stream) {
      let text = "";
      // @ts-ignore
      if (chunk.choices?.[0]?.delta?.reasoning_content) {
        // @ts-ignore
        text += chunk.choices[0].delta.reasoning_content;
      }
      if (chunk.choices?.[0]?.delta?.content) {
        text += chunk.choices[0].delta.content;
      }
      if (text) {
        onChunk(text);
      }
    }
    onComplete();
  } catch (error: any) {
    console.error("Error in callDeepseek:", error);
    onChunk(`\n[Error calling DeepSeek: ${error.message || error}]`);
    onComplete();
  }
}

/**
 * Uses Ollama's local API for streaming chat completions.
 * Here we use the endpointUrl (if provided) to point to a local server running Ollama.
 */
export async function callOllama(options: LLMResponseOptions): Promise<void> {
  const { prompt, model, onChunk, onComplete, endpointUrl } = options;
  // Use the provided endpointUrl or default to http://localhost:11434.
  const baseURL =
    endpointUrl && endpointUrl.trim() !== ""
      ? endpointUrl
      : "http://localhost:11434";

  const ollama = new OpenAI({ apiKey: 'ollama', baseURL });

  try {
    const stream = await ollama.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        onChunk(content);
      }
    }
    onComplete();
  } catch (error: any) {
    console.error("Error in callOllama:", error);
    onChunk(`\n[Error calling Ollama: ${error.message || error}]`);
    onComplete();
  }
}

/**
 * Placeholder implementation for Claude.
 */
export async function callClaude(options: LLMResponseOptions): Promise<void> {
  options.onChunk("Claude streaming not implemented yet.");
  options.onComplete();
}

/**
 * Dispatch function that selects the correct LLM API call based on provider.
 */
export function callLLM(
  provider: string,
  options: LLMResponseOptions
): Promise<void> {
  switch (provider.toLowerCase()) {
    case "openai":
      return callOpenAiWithPackage(options);
    case "deepseek":
      return callDeepseek(options);
    case "ollama":
      return callOllama(options);
    case "claude":
      return callClaude(options);
    default:
      return Promise.reject(new Error(`Unsupported LLM provider: ${provider}`));
  }
}

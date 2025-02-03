import * as vscode from "vscode";
import { callLLM, LLMResponseOptions } from "./llmApis"; // adjust path as needed

// Define the persistent configuration for auto-completion.
// Later you can update these values from a config UI.
interface AutoCompleteConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpointUrl: string;
  // The maximum input “token” count (using an approximation of one token ≃ 4 characters)
  maxInputTokens: number;
  // Maximum number of tokens to generate in the output
  maxOutputTokens: number;
  // How much of the allowed input comes from above vs. below the cursor.
  contextAbovePercentage: number;
  contextBelowPercentage: number;
}

const defaultAutoCompleteConfig: AutoCompleteConfig = {
  provider: "ollama",
  model: "codellama:7b",
  apiKey: "", // fill in if needed or let the user configure it later
  endpointUrl: "",
  maxInputTokens: 2048,
  maxOutputTokens: 128,
  contextAbovePercentage: 1.0,
  contextBelowPercentage: 0.0,
};

// To avoid spamming the back end on every keystroke, we cache the last request details
let lastRequestPosition: { uri: string; offset: number } | undefined;
let lastCompletionPromise: Promise<string> | undefined;

/**
 * Extract a text “context” around the cursor.
 * We approximate the allowed input by taking config.maxInputTokens * 4 characters.
 * We then split that into a portion coming from before (70%) and after (30%) the cursor.
 */
function extractContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  config: AutoCompleteConfig
): string {
  const allowedInputLength = config.maxInputTokens * 4; // approximate character count
  const beforeLength = Math.floor(
    allowedInputLength * config.contextAbovePercentage
  );
  const afterLength = allowedInputLength - beforeLength;
  const currentOffset = document.offsetAt(position);
  const startOffset = Math.max(0, currentOffset - beforeLength);
  const endOffset = Math.min(
    document.getText().length,
    currentOffset + afterLength
  );
  const startPos = document.positionAt(startOffset);
  const endPos = document.positionAt(endOffset);
  return document.getText(new vscode.Range(startPos, endPos));
}

/**
 * Request a code completion from your LLM backend.
 * This function wraps callLLM into a Promise that aggregates streamed chunks.
 */
function requestCompletion(
  prompt: string,
  config: AutoCompleteConfig
): Promise<string> {
  return new Promise((resolve, reject) => {
    let aggregated = "";
    const options: LLMResponseOptions = {
      apiKey: config.apiKey,
      endpointUrl: config.endpointUrl,
      prompt: prompt,
      model: config.model,
      maxOutputTokens: config.maxOutputTokens,
      onChunk: (chunk: string) => {
        console.log(chunk);
        aggregated += chunk;
      },
      onComplete: () => {
        resolve(aggregated);
      },
    };
    callLLM(config.provider, options).catch((error: Error) => {
      reject(error);
    });
  });
}

/**
 * A simple inline completion provider.
 * When VS Code asks for inline completions, we:
 *   • Check if we’re at the same position as a previous request (to reuse a cached result)
 *   • Otherwise, we debounce (300ms) before extracting the context and making an LLM call
 *   • We then return the generated text as an InlineCompletionItem
 */
class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlineCompletionList> {
    const currentUri = document.uri.toString();
    const currentOffset = document.offsetAt(position);

    // Reuse a pending/completed result if the cursor hasn’t moved.
    if (
      lastRequestPosition &&
      lastRequestPosition.uri === currentUri &&
      lastRequestPosition.offset === currentOffset &&
      lastCompletionPromise
    ) {
      return lastCompletionPromise.then((completion) => {
        return new vscode.InlineCompletionList([
          new vscode.InlineCompletionItem(completion),
        ]);
      });
    }

    // Update the last request position.
    lastRequestPosition = { uri: currentUri, offset: currentOffset };

    // Debounce the request by 300 ms.
    lastCompletionPromise = new Promise<string>((resolve, reject) => {
      setTimeout(() => {
        if (token.isCancellationRequested) {
          return resolve("");
        }
        // Extract a context window from the current document.
        const contextText = extractContext(
          document,
          position,
          defaultAutoCompleteConfig
        );
        console.log("contextText", contextText);

        const prompt =
          contextText +
          "\nONLY RETURN CODE. Complete above line with one short snippet:\n";
        requestCompletion(prompt, defaultAutoCompleteConfig)
          .then((suggestion) => {
            resolve(suggestion);
          })
          .catch((error) => {
            console.error("Error during auto-completion:", error);
            resolve(error);
          });
      }, 300);
    });

    return lastCompletionPromise.then((completion) => {
      if (completion && completion.trim().length > 0) {
        return new vscode.InlineCompletionList([
          new vscode.InlineCompletionItem(completion),
        ]);
      }
      return new vscode.InlineCompletionList([]);
    });
  }
}

/**
 * Call this from your extension's activate() to register the inline completion provider.
 */
export function registerAutoCompleteProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      new InlineCompletionProvider()
    )
  );
}

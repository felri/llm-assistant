import * as vscode from "vscode";
import { callLLM, LLMResponseOptions } from "./llmApis";

interface AutoCompleteConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpointUrl: string;
  // The maximum input “token” count (using an approximation of one token ≃ 4 characters)
  maxInputTokens: number;
  maxOutputTokens: number;
  // How much of the allowed input comes from above vs. below the cursor.
  contextAbovePercentage: number;
  contextBelowPercentage: number;
}

const defaultAutoCompleteConfig: AutoCompleteConfig = {
  provider: "ollama",
  model: "qwen2.5-coder:14b",
  apiKey: "",
  endpointUrl: "",
  maxInputTokens: 2048,
  maxOutputTokens: 128,
  contextAbovePercentage: 1.0,
  contextBelowPercentage: 0.0,
};

// Global flag to allow completions only when manually triggered.
let manualTrigger = false;

// To avoid spamming the back end on every invocation, we cache the last request details.
let lastRequestPosition: { uri: string; offset: number } | undefined;
let lastCompletionPromise: Promise<string> | undefined;

/**
 * Extract a text “context” around the cursor.
 * We approximate the allowed input by taking config.maxInputTokens * 4 characters.
 * We then split that into a portion coming from before and after the cursor.
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
        aggregated += chunk;
      },
      onComplete: () => {
        let lines = aggregated.split('\n');
        lines = lines.filter(line => !line.includes('```'));
        resolve(lines.join('\n').replace(/^\s+/, ''));
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
 *   • Only provide a completion if it was manually triggered.
 *   • Otherwise, we return an empty list.
 * When triggered, we debounce (300ms) before extracting the context and making an LLM call.
 */
class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlineCompletionList> {
    // Only provide completions if the manual trigger flag is set.
    if (!manualTrigger) {
      return new vscode.InlineCompletionList([]);
    }
    // Reset the flag so that we don't run automatically again.
    manualTrigger = false;

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
          "\nReturn only code, nothing else, try to predict what the user wants to write in the next few tokens, one line maximum:\n";
        requestCompletion(prompt, defaultAutoCompleteConfig)
          .then((suggestion) => {
            resolve(suggestion);
          })
          .catch((error) => {
            console.error("Error during auto-completion:", error);
            resolve("");
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

/**
 * Register a command to trigger ghost completions manually.
 * When the command is executed, we set the manualTrigger flag and then execute
 * VS Code's built-in command to trigger inline suggestions.
 */
export function registerTriggerCommand(context: vscode.ExtensionContext) {
  const triggerCommand = vscode.commands.registerCommand(
    "extension.triggerGhostCompletion",
    () => {
      manualTrigger = true;
      // Trigger the inline suggestion widget.
      vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    }
  );
  context.subscriptions.push(triggerCommand);
}
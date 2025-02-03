//extensions.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { callLLM, LLMResponseOptions } from "./llmApis";
import { registerAutoCompleteProvider, registerTriggerCommand } from "./autoComplete";
interface Snippet {
  text: string;
  file: string;
}

let snippetStore: Snippet[] = [];
let panel: vscode.WebviewPanel | undefined;

// Utility function to generate a random nonce
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getWebviewContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  initialConfig: Record<string, any>
): string {
  const htmlPath = path.join(context.extensionUri.fsPath, "media", "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "main.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "styles.css")
  );

  // Generate a nonce to allow inline scripts
  const nonce = getNonce();

  // Create the CSP meta tag using the nonce for scripts.
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">`;

  // Replace placeholders in your HTML template.
  html = html
    .replace("${cspMeta}", cspMeta)
    .replace(/\${scriptUri}/g, scriptUri.toString())
    .replace(/\${styleUri}/g, styleUri.toString())
    // Inject the initial config into the inline script.
    .replace(
      "${initialConfig}",
      JSON.stringify(initialConfig)
    )
    // Also inject the nonce for the inline script.
    .replace(/\${nonce}/g, nonce);

  return html;
}

/**
 * Builds a conversation prompt from all the snippets.
 */
function buildConversationPrompt(snippets: Snippet[]): string {
  return snippets
    .map((snippet) => `${snippet.file}:\n${snippet.text}`)
    .join("\n\n");
}

export function activate(context: vscode.ExtensionContext) {
  // Register the inline completion provider.
  registerAutoCompleteProvider(context);
  // Register the manual trigger command.
  registerTriggerCommand(context);

  const initialConfig = {
    selectedProvider: context.globalState.get("selectedProvider", "openai"),
    // For each provider you would normally store the API key, model, endpoint, etc.
    apiKeys: {
      openai: context.globalState.get("apiKey_openai", ""),
      deepseek: context.globalState.get("apiKey_deepseek", ""),
      claude: context.globalState.get("apiKey_claude", ""),
    },
    models: {
      openai: context.globalState.get("model_openai", "gpt-3.5-turbo"),
      ollama: context.globalState.get("model_ollama", ""),
      claude: context.globalState.get("model_claude", ""),
      deepseek: context.globalState.get("model_deepseek", "")
    },
    endpoints: {
      ollama: context.globalState.get("endpointURL_ollama", "http://localhost:11434/api/chat"),
    }
  };

  const captureSelection = vscode.commands.registerCommand(
    "extension.captureSelection",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found!");
        return;
      }

      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showInformationMessage("Please select some code first.");
        return;
      }

      const code = editor.document.getText(selection);
      const file = editor.document.fileName;
      snippetStore.push({ text: code, file });

      if (!panel) {
        panel = vscode.window.createWebviewPanel(
          "snippetPanel",
          "Captured Snippets / Chat",
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
              vscode.Uri.joinPath(context.extensionUri, "media"),
            ],
          }
        );
        panel.webview.html = getWebviewContent(context, panel.webview, initialConfig);
        panel.webview.onDidReceiveMessage((message) => {
          switch (message.command) {
            case "updateSnippet": {
              const { index, newText } = message;
              if (typeof index === "number" && snippetStore[index]) {
                snippetStore[index].text = newText;
              }
              break;
            }
            case "deleteSnippet": {
              const { index } = message;
              if (typeof index === "number" && snippetStore[index]) {
                snippetStore.splice(index, 1);
                panel!.webview.postMessage({
                  command: "update",
                  snippets: snippetStore,
                });
              }
              break;
            }
            case "moveUpSnippet": {
              const { index } = message;
              if (typeof index === "number" && index > 0) {
                [snippetStore[index - 1], snippetStore[index]] = [
                  snippetStore[index],
                  snippetStore[index - 1],
                ];
                panel!.webview.postMessage({
                  command: "update",
                  snippets: snippetStore,
                });
              }
              break;
            }
            case "moveDownSnippet": {
              const { index } = message;
              if (
                typeof index === "number" &&
                index < snippetStore.length - 1
              ) {
                [snippetStore[index], snippetStore[index + 1]] = [
                  snippetStore[index + 1],
                  snippetStore[index],
                ];
                panel!.webview.postMessage({
                  command: "update",
                  snippets: snippetStore,
                });
              }
              break;
            }
            case "clearAll": {
              // Clear all stored snippets
              snippetStore = [];
              panel!.webview.postMessage({
                command: "update",
                snippets: snippetStore,
              });
              break;
            }
            case "showAlert": {
              const { alert } = message;
              if (!alert) {
                return;
              }
              vscode.window.showErrorMessage(alert);
            }
            case "updateSetting": {
              const { key, value } = message;
              context.globalState.update(key, value);
              break;
            }
            case "sendPrompt": {
              // Extract endpointUrl along with the others.
              const { prompt, provider, apiKey, model, endpointUrl } = message;

              // For non-local providers we require an API key.
              if (
                provider.toLowerCase() !== "ollama" &&
                (!apiKey || apiKey.trim() === "")
              ) {
                vscode.window.showErrorMessage("Please provide an API key!");
                return;
              }

              if (!prompt.trim().length && !snippetStore.length) {
                vscode.window.showErrorMessage(
                  "Please provide a prompt or a snippet before sending."
                );
                return;
              }

              // Append the user prompt and a placeholder for the assistant.
              snippetStore.push({ file: "User", text: prompt });
              const responseTitle = `Assistant Response (${provider.toUpperCase()})`;
              snippetStore.push({ file: responseTitle, text: "" });
              panel!.webview.postMessage({
                command: "update",
                snippets: snippetStore,
              });
              panel!.webview.postMessage({ command: "clearPrompt" });

              // Build a full conversation prompt.
              const fullPrompt = buildConversationPrompt(snippetStore);

              // Set up options, including endpointUrl for Ollama.
              const options: LLMResponseOptions = {
                apiKey,
                endpointUrl, // if provider is "ollama", this will be defined.
                prompt: fullPrompt,
                model,
                onChunk: (chunk) => {
                  snippetStore[snippetStore.length - 1].text += chunk;
                  if (panel) {
                    panel.webview.postMessage({
                      command: "update",
                      snippets: snippetStore,
                    });
                  }
                },
                onComplete: () => {
                  console.log("Streaming complete");
                },
              };

              // Call the appropriate LLM API.
              callLLM(provider, options).catch((error) => {
                console.error(error);
                snippetStore[
                  snippetStore.length - 1
                ].text += `\n[Error: ${error.message}]`;
                panel!.webview.postMessage({
                  command: "update",
                  snippets: snippetStore,
                });
              });
              break;
            }
            default:
              break;
          }
        });
        panel.onDidDispose(() => {
          panel = undefined;
        });
      }

      if (panel) {
        panel.webview.postMessage({
          command: "update",
          snippets: snippetStore,
        });
      }
    }
  );

  context.subscriptions.push(captureSelection);
}

export function deactivate() { }

//extensions.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { callLLM, LLMResponseOptions } from "./llmApis";
import { registerAutoCompleteProvider } from "./autoComplete";
interface Snippet {
  text: string;
  file: string;
}

let snippetStore: Snippet[] = [];
let panel: vscode.WebviewPanel | undefined;

function getWebviewContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
  const htmlPath = path.join(
    context.extensionUri.fsPath,
    "media",
    "index.html"
  );
  let html = fs.readFileSync(htmlPath, "utf8");
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "main.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "styles.css")
  );
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">`;
  html = html
    .replace("${cspMeta}", cspMeta)
    .replace(/\${scriptUri}/g, scriptUri.toString())
    .replace(/\${styleUri}/g, styleUri.toString());
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
  // registerAutoCompleteProvider(context);

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
        panel.webview.html = getWebviewContent(context, panel.webview);
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

export function deactivate() {}

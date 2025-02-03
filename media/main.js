"use strict";
const vscode = acquireVsCodeApi();

// Provider-to-model mapping.
const providerModels = {
  openai: [
    "gpt-3.5-turbo",
    "gpt-4",
    "gpt-4-turbo",
    "o1-mini",
    "o3-mini",
    "o1",
    "gpt-4o-mini",
    "gpt-4o",
  ],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  claude: [
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
    "claude-3-opus-latest",
    "claude-3-opus-20240229",
    "claude-3-haiku-20240307",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
  ],
  // gemini: ["gemini-base"],
  // qwen: ["qwen-small"],
};

// -------------------------------------------
// Restore saved provider from global state
// -------------------------------------------
function loadGlobalState() {
  const providerSelect = document.getElementById("llmProvider");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const endpointUrlInput = document.getElementById("endpointUrlInput"); // new input for local endpoints (e.g., for Ollama)
  const model = document.getElementById("modelSelect");
  const ollamaModel = document.getElementById("ollamaModelInput");

  const config = window.initialConfig || {};

  console.log('config', config);
  if (config.selectedProvider) {
    providerSelect.value = config.selectedProvider;
  }

  if (config.apiKeys[config.selectedProvider.toLowerCase()]) {
    apiKeyInput.value = config.apiKeys[config.selectedProvider.toLowerCase()];
  } else {
    apiKeyInput.value = "";
  }

  if (config.models[config.selectedProvider.toLowerCase()]) {
    if (config.selectedProvider === "ollama") {
      ollamaModel.value = config.models[config.selectedProvider.toLowerCase()];
    } else {
      model.value = config.models[config.selectedProvider.toLowerCase()];
    }
  }

  if (config?.selectedProvider === "ollama" && config.endpoints.ollama) {
    endpointUrlInput.value = config.endpoints.ollama;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const providerSelect = document.getElementById("llmProvider");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const endpointUrlInput = document.getElementById("endpointUrlInput"); // new input for local endpoints (e.g., for Ollama)
  const model = document.getElementById("modelSelect");
  const ollamaModel = document.getElementById("ollamaModelInput");

  loadGlobalState();

  // Utility: update models dropdown.
  function updateModelDropdown(provider) {
    model.innerHTML = ""; // clear current options
    const models = providerModels[provider.toLowerCase()] || [];
    models.forEach((modelName) => {
      const option = document.createElement("option");
      option.value = modelName;
      option.textContent = modelName;
      model.appendChild(option);
    });
  }

  // Update fields based on the currently selected provider.
  function updateProviderDependentFields(provider) {
    updateModelDropdown(provider);

    // If using a local provider (e.g., Ollama), show endpoint URL input instead of API key.
    if (provider === "ollama") {
      apiKeyInput.style.display = "none";
      model.style.display = "none";

      if (document.getElementById("apiKeyLabel")) {
        document.getElementById("apiKeyLabel").style.display = "none";
      }
      if (document.getElementById("modelSelectLabel")) {
        document.getElementById("modelSelectLabel").style.display = "none";
      }

      endpointUrlInput.style.display = "inline";
      ollamaModel.style.display = "inline";

      if (document.getElementById("endpointUrlLabel")) {
        document.getElementById("endpointUrlLabel").style.display = "inline";
      }
      if (document.getElementById("ollamaModelLabel")) {
        document.getElementById("ollamaModelLabel").style.display = "inline";
      }
    } else {
      // For providers that use an API key.
      apiKeyInput.style.display = "inline";
      model.style.display = "inline";
      apiKeyInput.value = window.initialConfig.apiKeys[provider] ?? "";

      if (document.getElementById("apiKeyLabel")) {
        document.getElementById("apiKeyLabel").style.display = "inline";
      }
      if (document.getElementById("modelSelectLabel")) {
        document.getElementById("modelSelectLabel").style.display = "inline";
      }

      endpointUrlInput.style.display = "none";
      ollamaModel.style.display = "none";
      if (document.getElementById("endpointUrlLabel")) {
        document.getElementById("endpointUrlLabel").style.display = "none";
      }
      if (document.getElementById("ollamaModelLabel")) {
        document.getElementById("ollamaModelLabel").style.display = "none";
      }
    }
  }

  // Initial update.
  const config = window.initialConfig;
  updateProviderDependentFields(config.selectedProvider);

  // -------------------------------------------
  // Save provider setting when it is changed.
  // -------------------------------------------
  providerSelect.addEventListener("change", () => {
    vscode.postMessage({
      command: "configUpdate",
      key: "selectedProvider",
      value: providerSelect.value,
    });
    updateProviderDependentFields(providerSelect.value);
  });

  // Save changes for API key.
  apiKeyInput.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    vscode.postMessage({
      command: "configUpdate",
      key: "apiKey_" + currentProvider,
      value: apiKeyInput.value,
    });
  });

  // Save changes for endpoint URL (for local providers).
  endpointUrlInput.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    vscode.postMessage({
      command: "configUpdate",
      key: "endpointURL_" + currentProvider,
      value: endpointUrlInput.value,
    });
  });

  // -------------------------------------------
  // Save model selection for non-Ollama providers.
  // -------------------------------------------
  model.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    vscode.postMessage({
      command: "configUpdate",
      key: "model_" + currentProvider,
      value: model.value,
    });
  });

  // -------------------------------------------
  // Save model selection for Ollama.
  // -------------------------------------------
  ollamaModel.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    vscode.postMessage({
      command: "configUpdate",
      key: "model_" + currentProvider,
      value: ollamaModel.value,
    });
  });

  // Attach event listener to the CLEAR button.
  document.getElementById("clearAll").addEventListener("click", () => {
    vscode.postMessage({ command: "clearAll" });
  });
});

// Listen for messages from the extension.
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.command === "update") {
    updateSnippetList(message.snippets);
  }
  if (message.command === "configUpdated") {
    loadGlobalState();
  }
  if (message.command === "clearPrompt") {
    document.getElementById("promptInput").value = "";
  }
});

function updateSnippetList(snippets) {
  const container = document.getElementById("snippet-container");
  if (!snippets || snippets.length === 0) {
    container.innerHTML = "<p>No snippets captured yet.</p>";
  } else {
    container.innerHTML = "";
    snippets.forEach((snippet, index) => {
      const snippetDiv = document.createElement("div");
      snippetDiv.className = "snippet";

      // Assign class based on snippet type.
      if (snippet.file === "User") {
        snippetDiv.classList.add("user");
      } else if (snippet.file.indexOf("Assistant Response") === 0) {
        snippetDiv.classList.add("assistant");
      }

      const title = document.createElement("p");
      title.className = "title";
      title.textContent = snippet.file;
      snippetDiv.appendChild(title);

      const textArea = document.createElement("textarea");
      textArea.value = snippet.text;
      textArea.style.overflow = "hidden";
      autoResize(textArea);
      textArea.addEventListener("input", (event) => {
        autoResize(textArea);
        const newText = event.target.value;
        vscode.postMessage({ command: "updateSnippet", index, newText });
      });
      snippetDiv.appendChild(textArea);

      // Delete button.
      const deleteButton = document.createElement("button");
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
        vscode.postMessage({ command: "deleteSnippet", index });
      });
      snippetDiv.appendChild(deleteButton);

      // Move Up button.
      if (index > 0) {
        const moveUpButton = document.createElement("button");
        moveUpButton.textContent = "Move Up";
        moveUpButton.addEventListener("click", () => {
          vscode.postMessage({ command: "moveUpSnippet", index });
        });
        snippetDiv.appendChild(moveUpButton);
      }

      // Move Down button.
      if (index < snippets.length - 1) {
        const moveDownButton = document.createElement("button");
        moveDownButton.textContent = "Move Down";
        moveDownButton.addEventListener("click", () => {
          vscode.postMessage({ command: "moveDownSnippet", index });
        });
        snippetDiv.appendChild(moveDownButton);
      }

      container.appendChild(snippetDiv);
    });
  }
  // Ensure auto-scroll happens after rendering.
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }, 50);
}

function autoResize(textArea) {
  // Reset the height to "auto" so we correctly measure when content shrinks
  textArea.style.height = "auto";

  const dummy = document.createElement("div");
  const computed = window.getComputedStyle(textArea);

  // Apply the same styling as the textarea
  dummy.style.position = "absolute";
  dummy.style.visibility = "hidden";
  dummy.style.zIndex = "-1";
  dummy.style.whiteSpace = "pre-wrap";
  dummy.style.wordWrap = "break-word";
  dummy.style.fontFamily = computed.fontFamily;
  dummy.style.fontSize = computed.fontSize;
  dummy.style.lineHeight = computed.lineHeight;
  dummy.style.padding = computed.padding;
  dummy.style.border = computed.border;
  dummy.style.boxSizing = computed.boxSizing;
  dummy.style.width = computed.width;

  // Copy the textarea content
  dummy.innerText = textArea.value;

  // Append the dummy element to the document to perform layout measurements
  document.body.appendChild(dummy);

  // Compute extra spacing based on the line height to ensure there's no clipping.
  // We use a fraction (e.g., 30%) of the computed line height as additional padding.
  let extraSpace = 0;
  const lineHeight = parseFloat(computed.lineHeight);
  if (!isNaN(lineHeight)) {
    extraSpace = lineHeight * 0.3;
  } else {
    // Fallback in case the computed lineHeight isn't a number
    extraSpace = 4;
  }

  // Set the textarea's height to the dummy's scrollHeight plus the extra space
  textArea.style.height = dummy.scrollHeight + extraSpace + "px";

  // Clean up the dummy element
  document.body.removeChild(dummy);
}

// Attach event listener to the "Send" button.
document.getElementById("sendPrompt").addEventListener("click", () => {
  const prompt = document.getElementById("promptInput").value;
  const provider = document.getElementById("llmProvider").value;
  const apiKey = document.getElementById("apiKeyInput").value;

  let modelValue;
  if (provider === "ollama") {
    modelValue = document.getElementById("ollamaModelInput").value;
  } else {
    modelValue = document.getElementById("modelSelect").value;
  }
  // Get the local endpoint URL if present.
  const endpointUrlInput = document.getElementById("endpointUrlInput");
  const endpointUrl = endpointUrlInput ? endpointUrlInput.value : "";

  if (provider !== "ollama" && (!apiKey || apiKey.trim() === "")) {
    vscode.postMessage({
      command: "showAlert",
      alert: "Please provide an API key before sending a prompt.",
    });
    return;
  }

  if (provider === "ollama" && (!modelValue || modelValue.trim() === "")) {
    vscode.postMessage({
      command: "showAlert",
      alert: "Please provide a model name before sending a prompt.",
    });
    return;
  }

  console.log("Sending prompt payload:", {
    prompt,
    provider,
    apiKey,
    model: modelValue,
    endpointUrl,
  });
  vscode.postMessage({
    command: "sendPrompt",
    prompt,
    provider,
    apiKey,
    model: modelValue,
    endpointUrl,
  });
});

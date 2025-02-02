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
  claude: ["claude-v1", "claude-instant"],
  gemini: ["gemini-base"],
  qwen: ["qwen-small"],
};

document.addEventListener("DOMContentLoaded", () => {
  const providerSelect = document.getElementById("llmProvider");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const endpointUrlInput = document.getElementById("endpointUrlInput"); // new input for local endpoints (e.g., for Ollama)
  const model = document.getElementById("modelSelect");
  const ollamaModel = document.getElementById("ollamaModelInput");

  // -------------------------------------------
  // Restore saved provider from local storage, if any.
  // -------------------------------------------
  const savedProvider = localStorage.getItem("selectedProvider");
  if (savedProvider) {
    providerSelect.value = savedProvider;
  }

  // Utility: update models dropdown.
  function updateModelDropdown() {
    const provider = providerSelect.value;
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
  function updateProviderDependentFields() {
    updateModelDropdown();
    const provider = providerSelect.value;

    // -------------------------------------------
    // Restore saved model for this provider (if any).
    // We use a key of the form "model_<provider>"
    // -------------------------------------------
    if (provider === "ollama") {
      const savedOllamaModel = localStorage.getItem(`model_${provider}`);
      ollamaModel.value = savedOllamaModel || "";
    } else {
      const savedModel = localStorage.getItem(`model_${provider}`);
      if (savedModel) {
        model.value = savedModel;
      }
    }

    // If using a local provider (e.g., Ollama), show endpoint URL input instead of API key.
    if (provider === "ollama") {
      apiKeyInput.style.display = "none";
      if (document.getElementById("apiKeyLabel")) {
        document.getElementById("apiKeyLabel").style.display = "none";
      }
      model.style.display = "none";
      if (document.getElementById("modelSelectLabel")) {
        document.getElementById("modelSelectLabel").style.display = "none";
      }

      endpointUrlInput.style.display = "inline";
      if (document.getElementById("endpointUrlLabel")) {
        document.getElementById("endpointUrlLabel").style.display = "inline";
      }
      ollamaModel.style.display = "inline";
      if (document.getElementById("ollamaModelLabel")) {
        document.getElementById("ollamaModelLabel").style.display = "inline";
      }

      const savedEndpoint = localStorage.getItem(`endpointURL_${provider}`);
      endpointUrlInput.value = savedEndpoint || "";
    } else {
      // For providers that use an API key.
      apiKeyInput.style.display = "inline";
      if (document.getElementById("apiKeyLabel")) {
        document.getElementById("apiKeyLabel").style.display = "inline";
      }
      model.style.display = "inline";
      if (document.getElementById("modelSelectLabel")) {
        document.getElementById("modelSelectLabel").style.display = "inline";
      }

      endpointUrlInput.style.display = "none";
      if (document.getElementById("endpointUrlLabel")) {
        document.getElementById("endpointUrlLabel").style.display = "none";
      }
      ollamaModel.style.display = "none";
      if (document.getElementById("ollamaModelLabel")) {
        document.getElementById("ollamaModelLabel").style.display = "none";
      }

      const savedApiKey = localStorage.getItem(`apiKey_${provider}`);
      apiKeyInput.value = savedApiKey || "";
    }
  }

  // Initial update.
  updateProviderDependentFields();

  // -------------------------------------------
  // Save provider setting when it is changed.
  // -------------------------------------------
  providerSelect.addEventListener("change", () => {
    localStorage.setItem("selectedProvider", providerSelect.value);
    updateProviderDependentFields();
  });

  // Save changes for API key.
  apiKeyInput.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    localStorage.setItem(`apiKey_${currentProvider}`, apiKeyInput.value);
  });

  // Save changes for endpoint URL (for local providers).
  endpointUrlInput.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    localStorage.setItem(
      `endpointURL_${currentProvider}`,
      endpointUrlInput.value
    );
  });

  // -------------------------------------------
  // Save model selection for non-Ollama providers.
  // -------------------------------------------
  model.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    localStorage.setItem(`model_${currentProvider}`, model.value);
  });

  // -------------------------------------------
  // Save model selection for Ollama.
  // -------------------------------------------
  ollamaModel.addEventListener("change", () => {
    const currentProvider = providerSelect.value;
    localStorage.setItem(`model_${currentProvider}`, ollamaModel.value);
  });

  // Attach event listener to the CLEAR button.
  document.getElementById("clearAll").addEventListener("click", () => {
    vscode.postMessage({ command: "clearAll" });
  });

  // Auto-scroll snippet container and whole body when focus is gained.
  // window.addEventListener("focus", () => {
  //   const container = document.getElementById("snippet-container");
  //   container.scrollTop = container.scrollHeight;
  //   window.scrollTo(0, document.body.scrollHeight);
  // });
});

// Listen for messages from the extension.
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.command === "update") {
    updateSnippetList(message.snippets);
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
  const dummy = document.createElement("div");
  const computed = window.getComputedStyle(textArea);
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
  dummy.innerText = textArea.value;
  document.body.appendChild(dummy);
  const newHeight = parseInt(dummy.scrollHeight) + 60;
  document.body.removeChild(dummy);
  textArea.style.height = newHeight.toString() + "px";
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
      alert: "Please provide an API key before sending a prompt."
    });
    return;
  }

  if (provider === "ollama" && (!modelValue || modelValue.trim() === "")) {
    vscode.postMessage({
      command: "showAlert",
      alert: "Please provide a model name before sending a prompt."
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

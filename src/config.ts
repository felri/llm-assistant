type Provider = "openai" | "deepseek" | "claude" | "ollama";

interface Config {
  selectedProvider: Provider;
  apiKeys: Record<Provider, string>;
  models: Record<Provider, string>;
  endpoints: Partial<Record<Provider, string>>;
  autoCompleteProvider: Provider;
  autoCompleteModels: Record<Provider, string>;
  autoCompleteEndpoints: Partial<Record<Provider, string>>;
  autoCompleteEnabled: string;
}

export const getConfig = (context: {
  globalState: { get: (key: string, defaultValue: string) => string };
}): Config => {
  return {
    selectedProvider: context.globalState.get(
      "selectedProvider",
      "openai"
    ) as Provider,
    apiKeys: {
      openai: context.globalState.get("apiKey_openai", ""),
      deepseek: context.globalState.get("apiKey_deepseek", ""),
      claude: context.globalState.get("apiKey_claude", ""),
      ollama: "", // Ensuring all providers are included
    },
    models: {
      openai: context.globalState.get("model_openai", "gpt-3.5-turbo"),
      ollama: context.globalState.get("model_ollama", ""),
      claude: context.globalState.get("model_claude", ""),
      deepseek: context.globalState.get("model_deepseek", ""),
    },
    endpoints: {
      ollama: context.globalState.get(
        "endpointURL_ollama",
        "http://localhost:11434/v1/"
      ),
    },
    autoCompleteProvider: context.globalState.get(
      "autocomplete_selectedProvider",
      "openai"
    ) as Provider,
    autoCompleteModels: {
      openai: context.globalState.get(
        "autocomplete_model_openai",
        "gpt-3.5-turbo"
      ),
      ollama: context.globalState.get("autocomplete_model_ollama", ""),
      claude: context.globalState.get("autocomplete_model_claude", ""),
      deepseek: context.globalState.get("autocomplete_model_deepseek", ""),
    },
    autoCompleteEndpoints: {
      ollama: context.globalState.get(
        "autocomplete_endpointURL_ollama",
        "http://localhost:11434/v1/"
      ),
    },
    autoCompleteEnabled: context.globalState.get("autoCompleteEnabled", "false"),
  };
};

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(import.meta.url), "../..");

async function loadEnv() {
  try {
    const contents = await readFile(resolve(projectRoot, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;

      const name = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (name && process.env[name] === undefined) process.env[name] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function askFeatherless(message) {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey || apiKey === "replace_with_your_api_key") {
    throw new Error("Set FEATHERLESS_API_KEY in .env before running the project.");
  }

  const baseUrl = (process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1").replace(/\/+$/, "");
  const model = process.env.FEATHERLESS_MODEL || "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: message }],
      temperature: 0.7,
      max_tokens: 512
    })
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || response.statusText;
    throw new Error(`Featherless API request failed (${response.status}): ${detail}`);
  }

  const answer = body?.choices?.[0]?.message?.content;
  if (typeof answer !== "string") {
    throw new Error("Featherless API returned an unexpected response shape.");
  }
  return answer;
}

await loadEnv();

const prompt = process.argv.slice(2).join(" ").trim() || "Say hello in one sentence.";

try {
  console.log(await askFeatherless(prompt));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}


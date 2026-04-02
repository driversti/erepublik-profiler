import { gotScraping } from "got-scraping";

export interface FetchResult {
  type: "success" | "not_found" | "error";
  data?: any;
  error?: FetchError;
}

export interface FetchError {
  statusCode?: number;
  message: string;
  retryable: boolean;
}

function isCloudflareResponse(body: string): boolean {
  return (
    typeof body === "string" &&
    (body.includes("Cloudflare") ||
      body.includes("cf-browser-verification") ||
      body.includes("challenge-platform"))
  );
}

export async function fetchCitizen(citizenId: number): Promise<FetchResult> {
  try {
    const response = await gotScraping({
      url: `https://www.erepublik.com/en/main/citizen-profile-json-global/${citizenId}`,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      http2: false,
      timeout: { request: 15_000, lookup: 5_000, connect: 5_000, send: 5_000 },
      responseType: "text",
      signal: AbortSignal.timeout(20_000),
    });

    if (response.statusCode === 404) {
      return { type: "not_found" };
    }

    if (isCloudflareResponse(response.body)) {
      return {
        type: "error",
        error: { message: "Cloudflare challenge", retryable: true },
      };
    }

    try {
      const data = JSON.parse(response.body);
      return { type: "success", data };
    } catch {
      return {
        type: "error",
        error: { message: "Non-JSON response", retryable: true },
      };
    }
  } catch (err: any) {
    const statusCode = err.response?.statusCode;

    if (statusCode === 404) {
      return { type: "not_found" };
    }

    const retryable =
      statusCode === 403 ||
      statusCode === 429 ||
      (statusCode && statusCode >= 500) ||
      ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET"].includes(err.code);

    return {
      type: "error",
      error: {
        statusCode,
        message: err.message || "Unknown error",
        retryable: Boolean(retryable),
      },
    };
  }
}

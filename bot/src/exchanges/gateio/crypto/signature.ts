import { createHmac, createHash } from "crypto";

export function createGateIOSignature(
  apiKey: string,
  apiSecret: string,
  method: string,
  url: string, // Полный путь включая /api/v4
  queryString: string = "",
  payloadString: string = ""
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // 1. Хешируем тело запроса (SHA512)
  const hashedPayload = createHash("sha512")
    .update(payloadString || "")
    .digest("hex");

  // 2. Формируем строку для подписи
  // Формат: METHOD\nURL\nQUERY_STRING\nHASHED_PAYLOAD\nTIMESTAMP
  const signString = [
    method.toUpperCase(),
    url,
    queryString || "",
    hashedPayload,
    timestamp,
  ].join("\n");

  // 3. Создаем HMAC-SHA512 подпись
  const signature = createHmac("sha512", apiSecret)
    .update(signString)
    .digest("hex");

  return {
    KEY: apiKey,
    Timestamp: timestamp,
    SIGN: signature,
  };
}

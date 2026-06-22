import { verifySiweMessage } from "@worldcoin/minikit-js/siwe";

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return "";

  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }

  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cookieNonce = readCookie(req.headers.cookie, "rc_siwe_nonce");
  const { payload, nonce } = req.body ?? {};

  if (!cookieNonce || !nonce || nonce !== cookieNonce || !payload) {
    return res.status(400).json({
      isValid: false,
      error: "Nonce or SIWE payload is invalid",
    });
  }

  try {
    const verification = await verifySiweMessage(
      payload,
      nonce,
      "Iniciar sesión en RC Wallet Recovery",
    );

    if (!verification.isValid) {
      return res.status(401).json({
        isValid: false,
        error: "SIWE signature is invalid",
      });
    }

    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `rc_siwe_nonce=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    );
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      isValid: true,
      address: verification.siweMessageData.address,
    });
  } catch (error) {
    return res.status(400).json({
      isValid: false,
      error: error instanceof Error ? error.message : "SIWE verification failed",
    });
  }
}

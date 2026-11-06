// Server only (uses node:crypto).
import { createHash, randomBytes, randomInt } from "node:crypto";

/** No 0/O, 1/I/L: easy to read aloud and type on a phone. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function isRoomCode(code: unknown): code is string {
  return (
    typeof code === "string" &&
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((c) => CODE_ALPHABET.includes(c))
  );
}

/** Guest token kept on the player's device. 256 bits, so a plain sha256 is enough to store it. */
export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Public player id. */
export function newPlayerId(): string {
  return randomBytes(9).toString("base64url");
}

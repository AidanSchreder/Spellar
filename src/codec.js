// Undoes the server's spoiler shield: base64, then XOR with "spellar:" + the date (UTF-8 bytes).
// Not security; it only keeps the answer from being readable at a glance in the network tab.

export function decode(b64, date) {
  const raw = atob(b64);
  const key = new TextEncoder().encode(`spellar:${date}`);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) ^ key[i % key.length];
  return new TextDecoder().decode(bytes);
}

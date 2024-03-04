export function salt(length: number) {
  return Math.random().toString(36).substring(2).padStart(length, "0").slice(0, length);
}

export function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = 31 * h + str.charCodeAt(i);
  }
  // Convert to base-36 string and pad with zeros
  let hash = h.toString(36).padStart(3, "0");
  // Return the first 3 characters of the hash
  return hash.slice(0, 3);
}

export function signature() {
  let payload = salt(7), hashstr = hash(payload);
  return payload.concat(hashstr).split('').join('.');
}

export function isValidMiddleware(sign: string) {
  return typeof sign === 'string' && (sign = sign.replace(/\./g, '')).length === 10 && hash(sign.slice(0, 7)) === sign.slice(7, 10);
}

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
  sign = sign.split('.').join('');
  let payload = sign.substring(0, 7);
  return hash(payload) == sign.substring(7, 10);
}

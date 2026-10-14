// Controllable cookie jar standing in for next/headers.
const jar: Record<string, string> = {};

export function cookies() {
  return {
    get(name: string) { return name in jar ? { name, value: jar[name] } : undefined; },
    set(name: string, value: unknown) {
      jar[name] = typeof value === 'string' ? value : (value as { value: string }).value;
    },
    delete(name: string) { delete jar[name]; },
  };
}

export const __cookies = {
  clear() { for (const k of Object.keys(jar)) delete jar[k]; },
  snapshot() { return { ...jar }; },
};

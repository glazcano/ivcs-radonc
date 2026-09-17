// Budgets cover RGBA bitmap storage; browser/GPU bookkeeping can add overhead.
export function getRecent<K,V>(cache: Map<K,V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) { cache.delete(key); cache.set(key,value); }
  return value;
}

export function putBounded<K,V>(cache: Map<K,V>, key: K, value: V, budgetBytes: number, size: (value: V)=>number): void {
  cache.delete(key);
  cache.set(key,value);
  let bytes=0;
  for(const entry of cache.values()) bytes+=size(entry);
  while(bytes>budgetBytes && cache.size) {
    const oldest=cache.keys().next().value!;
    bytes-=size(cache.get(oldest)!);
    cache.delete(oldest);
  }
}

export const bitmapBytes = (canvas: {width:number;height:number})=>canvas.width*canvas.height*4;

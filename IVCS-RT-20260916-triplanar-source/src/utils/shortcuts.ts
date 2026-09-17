export const defaultShortcuts:Record<string,string>={brush:'b',pencil:'p',polygon:'g',eraser:'e',threshold:'t',window:'w',pan:'h',zoom:'z',ruler:'r'};
export function validShortcuts(value:Record<string,string>){return value && Object.keys(defaultShortcuts).every(k=>/^[a-z]$/.test(value[k]) && !['o','s'].includes(value[k])) && new Set(Object.values(value)).size===9;}

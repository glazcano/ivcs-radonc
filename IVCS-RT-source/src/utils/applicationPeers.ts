// Detached panels share their owner's React tree and do not register as separate clients.
const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('ivcs-application-windows');
channel?.addEventListener('message',({data})=>{if(data?.type==='query')channel.postMessage({type:'present',request:data.request});});
export async function hasOtherApplicationWindows():Promise<boolean>{
 if(!channel)return false;
 const request=crypto.randomUUID();let found=false;
 const receive=({data}:MessageEvent)=>{if(data?.type==='present'&&data.request===request)found=true;};
 channel.addEventListener('message',receive);channel.postMessage({type:'query',request});
 await new Promise(resolve=>setTimeout(resolve,500));channel.removeEventListener('message',receive);return found;
}

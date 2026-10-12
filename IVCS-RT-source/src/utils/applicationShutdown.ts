/** Complete each probe before retrying; a timeout is not proof of server exit. */
export async function waitForApplicationStop({
  attempts=40, intervalMs=250, timeoutMs=2500,
  fetcher=fetch,
  wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),
}:{attempts?:number;intervalMs?:number;timeoutMs?:number;fetcher?:typeof fetch;wait?:(ms:number)=>Promise<void>}={}):Promise<boolean>{
  for(let i=0;i<attempts;i++){
    await wait(intervalMs);
    const signal=AbortSignal.timeout(timeoutMs);
    let receivedHeaders=false;
    try{
      const response=await fetcher('/api/application/status',{cache:'no-store',signal});
      receivedHeaders=true;
      // Reading only headers leaves the body pending until the abort timer
      // fires, allowing the next probe to reuse an existing connection.
      await response.text();
    }catch(error){
      // Browser fetch reports a refused/failed connection as TypeError. A
      // probe timeout or interrupted body may occur while the server is alive.
      if(!receivedHeaders && !signal.aborted && error instanceof TypeError)return true;
    }
  }
  return false;
}

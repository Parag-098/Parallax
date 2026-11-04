import { HistoryEvent } from './model';
import { HistoryStore } from './store';

export function replayContentReferences(events: HistoryEvent[], target: number, baseline: Record<string,string> = {}, afterSequence = 0): Map<string, string> {
 const state = new Map<string, string>(Object.entries(baseline));
 for (const event of events.filter(e => e.sequence > afterSequence && e.sequence <= target).sort((a, b) => a.sequence - b.sequence)) {
  if (event.kind === 'rename' && event.oldPath && event.path) { const hash = state.get(event.oldPath); if (hash) { state.delete(event.oldPath); state.set(event.path, hash); } continue; }
  if (!event.path) continue;
  if (event.kind === 'delete') state.delete(event.path);
  else if (event.contentHash) state.set(event.path, event.contentHash);
 }
 return state;
}

export async function reconstruct(store: HistoryStore, events: HistoryEvent[], target: number, requestedPath: string): Promise<string | undefined> {
 if (!Number.isSafeInteger(target) || target < 0 || requestedPath.startsWith('/') || requestedPath.includes('\\') || requestedPath.split('/').some(part => part === '..')) throw new Error('Invalid historical reconstruction target');
 if(new Set(events.map(event=>event.sessionId)).size>1)throw new Error('Historical reconstruction requires events from exactly one session');
 const sessionId = events[0]?.sessionId;
 const snapshots = sessionId ? await store.snapshots(sessionId) : [];
 let lastError: unknown;
 for (const snapshot of [...snapshots.filter(s => s.sequence <= target), undefined]) {
  try {
   const state = new Map<string, string>(); const start = snapshot?.sequence ?? 0;
   if (snapshot) {
    for (const [file, hash] of Object.entries(snapshot.files)) {
     if (file.startsWith('/') || file.includes('\\') || file.split('/').some(part => part === '..')) throw new Error('Unsafe path in snapshot');
     if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid content hash in snapshot'); state.set(file, hash);
    }
   }
   const after = events.filter(e => e.sequence > start && e.sequence <= target).sort((a, b) => a.sequence - b.sequence);
   if (!snapshot && events.length && events[0]!.sequence !== 1) throw new Error(`History before sequence ${events[0]!.sequence} is unavailable and no valid snapshot covers it`);
   let expected = start + 1;
   for (const event of after) {
    if (event.sequence !== expected) throw new Error(`Incomplete event history at sequence ${expected}`); expected++;
    if (event.kind === 'rename' && event.oldPath && event.path) { const hash = state.get(event.oldPath); if (hash) { state.delete(event.oldPath); state.set(event.path, hash); } continue; }
    if (!event.path) continue;
    if (event.kind === 'delete') state.delete(event.path); else if (event.contentHash) state.set(event.path, event.contentHash);
   }
   if (target > Math.max(start, events.at(-1)?.sequence ?? 0)) throw new Error(`History through sequence ${target} is unavailable`);
   const hash = state.get(requestedPath); return hash ? await store.getContent(hash) : undefined;
  } catch (error) { lastError = error; }
 }
 throw lastError instanceof Error ? lastError : new Error('Historical reconstruction failed');
}

/** Indexed variant used by the extension host; event memory is bounded to the range after a snapshot. */
export async function reconstructAt(store:HistoryStore,sessionId:string,target:number,requestedPath:string):Promise<string|undefined>{
 if(!Number.isSafeInteger(target)||target<0||requestedPath.startsWith('/')||requestedPath.includes('\\')||requestedPath.split('/').some(part=>part==='..'))throw new Error('Invalid historical reconstruction target');
 const snapshots=await store.snapshots(sessionId);let lastError:unknown;
 for(const snapshot of [...snapshots.filter(s=>s.sequence<=target),undefined])try{
  const start=snapshot?.sequence??0,events=await store.eventsBetween(sessionId,start,target);const newest=(await store.eventPage(sessionId,Number.MAX_SAFE_INTEGER,1))[0];
  if(!newest&&target>start)throw new Error(`History through sequence ${target} is unavailable`);
  if(target>Math.max(start,newest?.sequence??0))throw new Error(`History through sequence ${target} is unavailable`);
  const state=new Map<string,string>(Object.entries(snapshot?.files??{}));for(const [file,hash] of state)if(file.startsWith('/')||file.includes('\\')||file.split('/').some(p=>p==='..')||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Unsafe path or content reference in snapshot');
  let expected=start+1;const first=await store.firstEvent(sessionId);
  // Retention can remove the prefix only when a retained anchor snapshot covers it.
  if(!snapshot&&first&&first.sequence!==1)throw new Error(`History before sequence ${first.sequence} is unavailable and no valid snapshot covers it`);
  for(const event of events){if(event.sequence!==expected++)throw new Error(`Incomplete event history at sequence ${expected-1}`);if(event.kind==='rename'&&event.oldPath&&event.path){const hash=state.get(event.oldPath);if(hash){state.delete(event.oldPath);state.set(event.path,hash);}continue;}if(!event.path)continue;if(event.kind==='delete')state.delete(event.path);else if(event.contentHash)state.set(event.path,event.contentHash);}
  if(target>start&&events.length&&events.at(-1)!.sequence<target)throw new Error(`Incomplete event history at sequence ${events.at(-1)!.sequence+1}`);
  const hash=state.get(requestedPath);return hash?await store.getContent(hash):undefined;
 }catch(error){lastError=error;}
 throw lastError instanceof Error?lastError:new Error('Historical reconstruction failed');
}

export async function reconstructWorkspaceReferences(store:HistoryStore,events:HistoryEvent[],target:number):Promise<Map<string,string>>{
 if(!Number.isSafeInteger(target)||target<0)throw new Error('Invalid historical reconstruction target');
 if(new Set(events.map(e=>e.sessionId)).size>1)throw new Error('Historical reconstruction requires events from exactly one session');
 const sessionId=events[0]?.sessionId;if(!sessionId)return new Map();const snapshots=await store.snapshots(sessionId);let lastError:unknown;
 for(const snapshot of [...snapshots.filter(s=>s.sequence<=target),undefined])try{
  const state=new Map<string,string>(Object.entries(snapshot?.files??{}));const start=snapshot?.sequence??0;
  for(const [name,hash] of state)if(name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='..')||! /^[a-f0-9]{64}$/.test(hash))throw new Error('Unsafe or invalid path in snapshot');
  const tail=events.filter(e=>e.sequence>start&&e.sequence<=target).sort((a,b)=>a.sequence-b.sequence);if(!snapshot&&events.length&&events[0]!.sequence!==1)throw new Error('History before retained events is unavailable');let expected=start+1;
  for(const event of tail){if(event.sequence!==expected++)throw new Error(`Incomplete event history at sequence ${expected-1}`);if(event.kind==='rename'&&event.path&&event.oldPath){const hash=state.get(event.oldPath);if(hash){state.delete(event.oldPath);state.set(event.path,hash);}continue;}if(!event.path)continue;if(event.kind==='delete')state.delete(event.path);else if(event.contentHash)state.set(event.path,event.contentHash);}
  if(target>Math.max(start,events.at(-1)?.sequence??0))throw new Error(`History through sequence ${target} is unavailable`);
  for(const hash of state.values())await store.getContent(hash);return state;
 }catch(error){lastError=error;}
 throw lastError instanceof Error?lastError:new Error('Workspace reconstruction failed');
}

export async function reconstructWorkspaceAt(store:HistoryStore,sessionId:string,target:number):Promise<Map<string,string>>{
 if(!Number.isSafeInteger(target)||target<0)throw new Error('Invalid historical reconstruction target');const snapshots=await store.snapshots(sessionId);let lastError:unknown;
 for(const snapshot of [...snapshots.filter(s=>s.sequence<=target),undefined])try{
  const start=snapshot?.sequence??0,tail=await store.eventsBetween(sessionId,start,target);let expected=start+1;const state=new Map<string,string>(Object.entries(snapshot?.files??{}));
  for(const [name,hash]of state)if(name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='..')||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Unsafe or invalid path in snapshot');
  if(!snapshot){const first=await store.firstEvent(sessionId);if(first&&first.sequence!==1)throw new Error('History before retained events is unavailable');}
  for(const event of tail){if(event.sequence!==expected++)throw new Error(`Incomplete event history at sequence ${expected-1}`);if(event.kind==='rename'&&event.path&&event.oldPath){const hash=state.get(event.oldPath);if(hash){state.delete(event.oldPath);state.set(event.path,hash);}continue;}if(!event.path)continue;if(event.kind==='delete')state.delete(event.path);else if(event.contentHash)state.set(event.path,event.contentHash);}
  const newest=(await store.eventPage(sessionId,Number.MAX_SAFE_INTEGER,1))[0];if(target>Math.max(start,newest?.sequence??0))throw new Error(`History through sequence ${target} is unavailable`);if(target>start&&tail.length&&tail.at(-1)!.sequence<target)throw new Error(`Incomplete event history at sequence ${tail.at(-1)!.sequence+1}`);
  for(const hash of state.values())await store.getContent(hash);return state;
 }catch(error){lastError=error;}
 throw lastError instanceof Error?lastError:new Error('Workspace reconstruction failed');
}

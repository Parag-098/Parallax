import * as fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import * as path from 'path';
import { hashContent, isSupportedText } from './content';
import { isExcluded } from './excludes';

export interface InventoryResult { files:Record<string,string>; contents:Record<string,string>; omittedPaths:string[]; omissionsTruncated:boolean; complete:boolean; filesRead:number; bytesRead:number; }
interface Candidate { relative:string; absolute:string; realPath:string; size:number; mtimeMs:number; ctimeMs:number; }
const FILE_WORKERS=16;
const READ_WORKERS=8;

/** Capture a bounded eligible-text baseline. Enumeration stays ordered; bounded workers read independent files. */
export async function inventoryWorkspace(rootPath:string,patterns:string[],options:{maxFiles?:number;maxBytes?:number;excludedStoragePath?:string}={}):Promise<InventoryResult>{
 const root=await fs.realpath(rootPath),maxFiles=options.maxFiles??5000,maxBytes=options.maxBytes??64*1024*1024,candidates:string[]=[],files:Record<string,string>={},contents:Record<string,string>={},omittedPaths:string[]=[];
 let complete=true,omissionsTruncated=false,entriesVisited=0,filesRead=0,bytesRead=0;
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Inventory limits must be positive safe integers');
 const excludedStorage=options.excludedStoragePath?await fs.realpath(options.excludedStoragePath).catch(()=>path.resolve(options.excludedStoragePath!)):undefined;
 const omit=(relative:string):void=>{if(omittedPaths.length<500)omittedPaths.push(relative);else omissionsTruncated=true;};
 const walk=async(directory:string):Promise<void>=>{
  let entries;try{const realDirectory=await fs.realpath(directory);if(!inside(root,realDirectory)){complete=false;return;}entries=await fs.readdir(directory,{withFileTypes:true});}catch{complete=false;return;}
  for(const entry of entries){
   entriesVisited++;if(entriesVisited>50000){complete=false;omissionsTruncated=true;return;}
   const absolute=path.join(directory,entry.name),relative=path.relative(root,absolute).split(path.sep).join('/');
   if(isExcluded(relative,patterns)||excludedStorage&&inside(excludedStorage,absolute))continue;
   if(entry.isSymbolicLink()){omit(relative);continue;}
   if(entry.isDirectory()){
    try{const real=await fs.realpath(absolute);if(!inside(root,real)){omit(relative);continue;}}catch{complete=false;omit(relative);continue;}
    await walk(absolute);if(entriesVisited>50000)return;continue;
   }
   if(entry.isFile())candidates.push(relative);
  }
 };
 await walk(root);candidates.sort((a,b)=>a.localeCompare(b));
 if(candidates.length>maxFiles){complete=false;omissionsTruncated=true;candidates.length=maxFiles;}

 const inspected=await mapConcurrent(candidates,FILE_WORKERS,async relative=>{
  const absolute=path.join(root,...relative.split('/'));
  try{
   const stat=await fs.lstat(absolute);if(!stat.isFile()||stat.isSymbolicLink()){omit(relative);return undefined;}
   const realPath=await fs.realpath(absolute);if(!inside(root,realPath))throw new Error('File resolves outside workspace');
   return{relative,absolute,realPath,size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs} satisfies Candidate;
  }catch{complete=false;omit(relative);return undefined;}
 });

 // Allocate the shared byte budget in stable path order before any content reads begin.
 const admitted:Candidate[]=[];let reservedBytes=0;
 for(const candidate of inspected){
  if(!candidate)continue;
  if(candidate.size>10*1024*1024||candidate.size>maxBytes-reservedBytes){complete=false;omit(candidate.relative);continue;}
  reservedBytes+=candidate.size;admitted.push(candidate);
 }
 await mapConcurrent(admitted,READ_WORKERS,async candidate=>{
  try{
   const handle=await fs.open(candidate.realPath,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW??0));
   let bytes:Buffer;
   try{
    const opened=await handle.stat();if(!opened.isFile()||opened.size!==candidate.size||opened.size>10*1024*1024)throw new Error('File changed after inventory metadata was read');
    bytes=Buffer.alloc(opened.size);let offset=0;
    while(offset<bytes.length){const result=await handle.read(bytes,offset,bytes.length-offset,offset);if(result.bytesRead===0)throw new Error('File shortened during inventory');offset+=result.bytesRead;}
    const afterOpen=await handle.stat(),afterPath=await fs.realpath(candidate.absolute);
    if(afterPath!==candidate.realPath||!inside(root,afterPath)||afterOpen.size!==opened.size||afterOpen.mtimeMs!==opened.mtimeMs||afterOpen.ctimeMs!==opened.ctimeMs)throw new Error('File changed during inventory');
   }finally{await handle.close();}
   if(!isSupportedText(bytes!)){omit(candidate.relative);return;}
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes!);files[candidate.relative]=hashContent(text);contents[candidate.relative]=text;filesRead++;bytesRead+=bytes!.length;
  }catch{complete=false;omit(candidate.relative);}
 });
 return{files,contents,omittedPaths,omissionsTruncated,complete,filesRead,bytesRead};
}

async function mapConcurrent<T,R>(items:readonly T[],concurrency:number,work:(item:T)=>Promise<R>):Promise<R[]>{
 const results=new Array<R>(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(true){const index=next++;if(index>=items.length)return;results[index]=await work(items[index]!);}}));
 return results;
}
function inside(parent:string,candidate:string):boolean{const rel=path.relative(parent,candidate);return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));}

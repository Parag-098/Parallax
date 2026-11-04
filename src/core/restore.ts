import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { hashContent } from './content';
import { isSupportedText } from './content';

function inside(root:string,target:string):boolean{const relative=path.relative(root,target);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
async function assertSafeExistingAncestor(root:string,parent:string):Promise<void>{let cursor=parent;while(true){try{const real=await fs.realpath(cursor);if(!inside(root,real))throw new Error('Restore path resolves outside the workspace');const stat=await fs.stat(real);if(!stat.isDirectory())throw new Error('Restore parent is not a directory');return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const next=path.dirname(cursor);if(next===cursor)throw new Error('Could not find a safe restore parent');cursor=next;}}}
export async function restoreFile(rootPath:string,relativePath:string,expectedCurrentHash:string|undefined,historicalContent:string|undefined):Promise<void>{
 if(!relativePath||path.isAbsolute(relativePath)||relativePath.includes('\0')||relativePath.split(/[\\/]/).some(part=>part==='..'))throw new Error('Unsafe restore path');
 const root=await fs.realpath(rootPath);const target=path.resolve(root,relativePath);if(!inside(root,target))throw new Error('Restore path escapes the workspace');
 let currentHash:string|undefined;try{const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Refusing to restore through a symlink or non-file');const bytes=await fs.readFile(target);if(!isSupportedText(bytes))throw new Error('Refusing to replace an unsupported or binary file');currentHash=hashContent(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(currentHash!==expectedCurrentHash)throw new Error('Workspace file changed after the restore preview; refresh and try again');
 await assertSafeExistingAncestor(root,path.dirname(target));await fs.mkdir(path.dirname(target),{recursive:true});const parent=await fs.realpath(path.dirname(target));if(!inside(root,parent))throw new Error('Restore parent resolves outside the workspace');
 try{const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Refusing to replace a symlink or non-file');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(historicalContent===undefined){if(currentHash===undefined)return;const backup=`${target}.${randomUUID()}.parallax-backup`;const parentNow=await fs.realpath(path.dirname(target));if(parentNow!==parent||!inside(root,parentNow))throw new Error('Restore directory changed during operation');await fs.rename(target,backup);try{await fs.unlink(backup);}catch(error){await fs.rename(backup,target).catch(()=>undefined);throw error;}return;}
 const temporary=path.join(parent,`.${path.basename(target)}.${randomUUID()}.parallax-tmp`);await fs.writeFile(temporary,historicalContent,{encoding:'utf8',flag:'wx'});try{const parentNow=await fs.realpath(path.dirname(target));if(parentNow!==parent||!inside(root,parentNow))throw new Error('Restore directory changed during operation');const latest=await fs.lstat(target).then(async stat=>{if(stat.isSymbolicLink()||!stat.isFile())return undefined;const bytes=await fs.readFile(target);return isSupportedText(bytes)?hashContent(new TextDecoder('utf-8',{fatal:true}).decode(bytes)):undefined;}).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;});if(latest!==expectedCurrentHash)throw new Error('Workspace file changed during restore');const parentAtCommit=await fs.realpath(path.dirname(target));if(parentAtCommit!==parent||!inside(root,parentAtCommit))throw new Error('Restore directory changed during operation');await fs.rename(temporary,target);}catch(error){await fs.unlink(temporary).catch(()=>undefined);throw error;}
}

export interface WorkspaceRestoreEntry { path: string; expectedCurrentHash?: string; historicalContent?: string; }
export interface WorkspaceRestoreResult { applied: string[]; }

/** Apply a reviewed complete file plan. All conflicts are checked before the first write;
 * if a later filesystem operation fails, already-applied files are rolled back. */
export async function restoreWorkspace(rootPath:string,entries:WorkspaceRestoreEntry[]):Promise<WorkspaceRestoreResult>{
 const root=await fs.realpath(rootPath),unique=new Set<string>();
 if(entries.length>10000)throw new Error('Workspace restore exceeds the 10,000-file safety limit');
 const before=new Map<string,string|undefined>();
 for(const entry of entries){
  if(unique.has(entry.path))throw new Error(`Duplicate restore path: ${entry.path}`);unique.add(entry.path);
  if(!entry.path||path.isAbsolute(entry.path)||entry.path.includes('\0')||entry.path.split(/[\\/]/).some(p=>p==='..'||p===''))throw new Error(`Unsafe restore path: ${entry.path}`);
  const target=path.resolve(root,entry.path);if(!inside(root,target))throw new Error(`Restore path escapes the workspace: ${entry.path}`);
  await assertSafeExistingAncestor(root,path.dirname(target));
  let current:string|undefined;try{const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`Refusing to restore symlink or non-file: ${entry.path}`);const bytes=await fs.readFile(target);if(!isSupportedText(bytes))throw new Error(`Unsupported current file: ${entry.path}`);current=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const currentHash=current===undefined?undefined:hashContent(current);if(currentHash!==entry.expectedCurrentHash)throw new Error(`Restore conflict at ${entry.path}`);before.set(entry.path,current);
 }
 const applied:string[]=[];
 try{for(const entry of entries){await restoreFile(root,entry.path,entry.expectedCurrentHash,entry.historicalContent);applied.push(entry.path);}return{applied};}
 catch(error){const rollbackErrors:unknown[]=[];for(const name of applied.reverse()){const entry=entries.find(e=>e.path===name)!;try{const resulting=entry.historicalContent===undefined?undefined:hashContent(entry.historicalContent);await restoreFile(root,name,resulting,before.get(name));}catch(rollbackError){rollbackErrors.push(rollbackError);}}
  if(rollbackErrors.length)throw new Error(`Workspace restore failed and rollback was incomplete (${rollbackErrors.length} file(s)); original error: ${String(error)}`);throw error;
 }
}

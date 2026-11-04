export interface Disposable { dispose(): void }
export interface GitHead { name?: string; commit?: string }
export interface GitRepository { rootUri: { fsPath: string }; state: { HEAD?: GitHead; onDidChange?: (listener: () => void) => Disposable }; onDidCommit?: (listener: () => void) => Disposable; onDidCheckout?: (listener: () => void) => Disposable }
export interface GitApi { repositories: GitRepository[]; onDidOpenRepository?: (listener: (repo: GitRepository) => void) => Disposable; onDidCloseRepository?: (listener: (repo: GitRepository) => void) => Disposable }
export interface GitTransition { repository: string; kind: 'git-commit'|'git-checkout'|'git-head'; previousCommit?: string; commit?: string; previousRef?: string; ref?: string }
function headKey(head:GitHead|undefined):string{return `${head?.name??''}\u0000${head?.commit??''}`;}
export class GitAwareness {
 private readonly repositoryListeners=new Map<GitRepository,Disposable[]>();
 private readonly subscriptions:Disposable[]=[];
 private readonly heads=new Map<GitRepository,GitHead|undefined>();
 constructor(private readonly api:GitApi,private readonly onTransition:(transition:GitTransition)=>void){for(const repo of api.repositories)this.add(repo);if(api.onDidOpenRepository)this.subscriptions.push(api.onDidOpenRepository(repo=>this.add(repo)));if(api.onDidCloseRepository)this.subscriptions.push(api.onDidCloseRepository(repo=>this.remove(repo)));}
 private emit(repo:GitRepository,kind:GitTransition['kind']):void{const before=this.heads.get(repo),after=repo.state.HEAD;this.heads.set(repo,after);this.onTransition({repository:repo.rootUri.fsPath,kind,previousCommit:before?.commit,commit:after?.commit,previousRef:before?.name,ref:after?.name});}
 private add(repo:GitRepository):void{if(this.repositoryListeners.has(repo))return;this.heads.set(repo,repo.state.HEAD);const listeners:Disposable[]=[];const changed=repo.state.onDidChange?.(()=>{const before=this.heads.get(repo),after=repo.state.HEAD;if(headKey(before)===headKey(after))return;this.emit(repo,'git-head');});if(changed)listeners.push(changed);const commit=repo.onDidCommit?.(()=>this.emit(repo,'git-commit'));if(commit)listeners.push(commit);const checkout=repo.onDidCheckout?.(()=>this.emit(repo,'git-checkout'));if(checkout)listeners.push(checkout);this.repositoryListeners.set(repo,listeners);}
 private remove(repo:GitRepository):void{for(const listener of this.repositoryListeners.get(repo)??[])listener.dispose();this.repositoryListeners.delete(repo);this.heads.delete(repo);}
 dispose():void{for(const values of this.repositoryListeners.values())for(const value of values)value.dispose();for(const value of this.subscriptions)value.dispose();this.repositoryListeners.clear();this.subscriptions.length=0;this.heads.clear();}
}

export function asGitApi(value:unknown):GitApi|undefined {if(!value||typeof value!=='object')return;const candidate=value as Partial<GitApi>;if(!Array.isArray(candidate.repositories))return;if(!candidate.repositories.every(r=>!!r&&typeof r.rootUri?.fsPath==='string'&&!!r.state))return;return candidate as GitApi;}

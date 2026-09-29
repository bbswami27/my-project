'use strict';
// Unit-test fixture ONLY. Production bootstrap exclusively constructs PgStore.
class MemoryStore {
 constructor(){this.data={accounts:new Map(),sessions:new Map(),challenges:new Map(),nonces:new Map()};this.queue=Promise.resolve();}
 transaction(fn){const execute=async()=>{const copy=structuredClone(this.data);const api={
  get:async(k,id)=>copy[k].get(id)||null,
  findAccount:async(field,value)=>[...copy.accounts.values()].find(a=>a[field]===value)||null,
  save:async(k,row)=>{if(k==='accounts'){for(const other of copy.accounts.values())if(other.id!==row.id&&['email','phone','googleSub'].some(f=>row[f]&&row[f]===other[f]))throw Object.assign(Error('Unique account constraint'),{code:'23505'});}copy[k].set(row.id,structuredClone(row));},
  remove:async(k,id)=>copy[k].delete(id),
  revokeSessions:async(id)=>{for(const [key,s]of copy.sessions)if(s.accountId===id)copy.sessions.delete(key);}
 };const r=await fn(api);this.data=copy;return r;};const r=this.queue.then(execute);this.queue=r.catch(()=>{});return r;}
}
module.exports={MemoryStore};

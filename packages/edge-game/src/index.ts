import { authenticateRequest } from './auth.js';
import { json, readBounded } from './protocol.js';
import type { Env } from './room.js';
export { ChannelRoom } from './room.js';

export default {
  async fetch(request: Request,env: Env): Promise<Response> {
    const url=new URL(request.url);
    if (url.pathname==='/health' && request.method==='GET') return json({service:'baited-edge-poc',enabled:env.EDGE_POC_ENABLED==='true',mode:'synthetic-proof'});
    const match=/^\/v1\/rooms\/([1-9][0-9]{0,24})\/(state|commands|socket|art\/[a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
    if (!match) return json({error:'Not found.'},404);
    const channel=match[1]!;const route=match[2]!;
    if (request.method==='OPTIONS') {
      const origin=request.headers.get('origin');
      const values=(s?:string)=>s?.split(',').map((v)=>v.trim())??[];
      const requested=request.headers.get('access-control-request-method');
      const headers=(request.headers.get('access-control-request-headers')??'').split(',').map((h)=>h.trim().toLowerCase()).filter(Boolean);
      if (env.EDGE_POC_ENABLED!=='true' || !origin || !values(env.EDGE_ALLOWED_HOSTS).includes(url.host) ||
        !values(env.EDGE_ALLOWED_CHANNELS).includes(channel) || !values(env.EDGE_ALLOWED_ORIGINS).includes(origin) ||
        !['GET','POST'].includes(requested??'') || headers.some((h)=>!['authorization','content-type'].includes(h))) return json({error:'Access denied.'},403);
      return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST',
        'access-control-allow-headers':'Authorization, Content-Type','access-control-max-age':'300','vary':'Origin','cache-control':'no-store'}});
    }
    const auth=await authenticateRequest(request,env,channel);
    if (!auth.ok) return auth.response;
    if ((route==='commands' && request.method!=='POST') || (route!=='commands' && request.method!=='GET')) return json({error:'Method not allowed.'},405);
    const internalHeaders=new Headers({'x-edge-identity':JSON.stringify(auth.identity)});
    if (auth.protocol) internalHeaders.set('upgrade','websocket');
    let body: string | undefined;
    if (request.method==='POST') {
      if (request.headers.get('content-type')?.split(';')[0]!=='application/json') return json({error:'Use a JSON request.'},415);
      try {body=await readBounded(request);} catch {return json({error:'Request too large.'},413);}
    }
    const room=env.ROOMS.get(env.ROOMS.idFromName(`channel:${channel}`));
    const response=await room.fetch(new Request(`https://room.internal/${route}`,{method:request.method,headers:internalHeaders,body}));
    const headers=new Headers(response.headers);const origin=request.headers.get('origin');
    if (origin) {headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');}
    return new Response(response.body,{status:response.status,headers,...(response.webSocket?{webSocket:response.webSocket}:{})});
  },
} satisfies ExportedHandler<Env>;

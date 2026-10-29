import { authenticateRequest } from "./auth.js";
import { json, readBounded } from "./protocol.js";
import { pilotLimits, pilotLogins } from "./pilot-policy.js";
import { pilotIngress } from "./ingress.js";
import type { Env } from "./room.js";
export { ChannelRoom } from "./room.js";
export { TwitchControl } from "./control.js";

const values=(s?:string)=>s?.split(",").map(v=>v.trim()).filter(Boolean)??[];
function destination(request:Request,env:Env) {
  const url=new URL(request.url);
  return values(env.EDGE_ALLOWED_HOSTS).includes(url.host) && (url.protocol==="https:" ||
    (url.protocol==="http:" && ["127.0.0.1","localhost","[::1]"].includes(url.hostname))) &&
    (!request.headers.has("host") || request.headers.get("host")===url.host);
}
function control(env:Env) {
  if(!env.CONTROL) throw new Error("Control unavailable.");
  return env.CONTROL.get(env.CONTROL.idFromName("control-v1"));
}
function cors(response:Response,origin:string|null) {
  const headers=new Headers(response.headers);
  if(origin) {headers.set("access-control-allow-origin",origin);headers.set("vary","Origin");}
  return new Response(response.body,{status:response.status,headers,...(response.webSocket?{webSocket:response.webSocket}:{})});
}
async function assets(request:Request,env:Env) {
  if(!env.ASSETS) return json({error:"Not found."},404);
  const url=new URL(request.url);
  if(request.method!=="GET" && request.method!=="HEAD") return json({error:"Method not allowed."},405);
  if((/^\/(?:api|auth|v1|internal|creator|card-lab)(?:\/|$)/.test(url.pathname) && url.pathname!=="/card-lab/backs/back-prism.webp") || url.pathname.includes("..")) return json({error:"Not found."},404);
  const spa=/^\/(?:studio(?:\/(?:setup|settings))?|privacy|overlay\/\d+|play\/\d+)?\/?$/.test(url.pathname);
  const assetUrl=new URL(request.url); if(spa) assetUrl.pathname="/index.html";
  const response=await env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  const headers=new Headers(response.headers);
  headers.set("x-content-type-options","nosniff");headers.set("referrer-policy","no-referrer");
  headers.set("permissions-policy","camera=(), geolocation=(), microphone=(self)");
  headers.set("cross-origin-opener-policy","same-origin");headers.set("cross-origin-embedder-policy","require-corp");
  // Only the pinned Moonshine worker needs Emscripten dynamic JS binding.
  const moonshine=url.pathname==="/moonshine-worker.js" || url.pathname==="/moonshine/runtime-0.1.5-csp1/moonshine.mjs";
  const quote=String.fromCharCode(39);
  const self=quote+"self"+quote;
  headers.set("content-security-policy",`default-src ${self}; script-src ${self} ${quote}wasm-unsafe-eval${quote}${moonshine?` ${quote}unsafe-eval${quote}`:""}; style-src ${self} ${quote}unsafe-inline${quote}; img-src ${self} data: blob:; media-src ${self} blob:; connect-src ${self} https://download.moonshine.ai; worker-src ${self} blob:; font-src ${self}; frame-ancestors ${quote}none${quote}; base-uri ${quote}none${quote}; form-action ${self} https://id.twitch.tv; object-src ${quote}none${quote}`);
  if(spa) headers.set("cache-control","private, no-store");
  return new Response(response.body,{status:response.status,headers});
}

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url);
    const pilot=env.EDGE_PILOT_ENABLED==="true";
    if(url.pathname==="/health" && request.method==="GET") return json({service:pilot?"baited-edge-pilot":"baited-edge-poc",enabled:pilot||env.EDGE_POC_ENABLED==="true",mode:pilot?"allowlisted-pilot":"synthetic-proof"});
    try {
      if(pilot) {
        pilotLimits(env);pilotLogins(env);
        if(!destination(request,env)) return json({error:"Access denied."},403);
        const ingress = await pilotIngress(request, env);
        if ('response' in ingress) return cors(ingress.response, values(env.EDGE_ALLOWED_ORIGINS).includes(request.headers.get('origin')??'') ? request.headers.get('origin') : null);
        request = ingress.request;
        const publicControl=["/api/session","/api/edge/session","/api/edge/overlay","/api/edge/chat","/api/logout","/api/bot/authorize","/api/twitch/eventsub",
          "/auth/twitch","/auth/twitch/bot","/auth/twitch/callback"];
        if(publicControl.includes(url.pathname)) return control(env).fetch(request);
      }
      const match=/^\/v1\/rooms\/([1-9][0-9]{0,24})\/(state|commands|socket|art\/[a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
      if(!match) return pilot?assets(request,env):json({error:"Not found."},404);
      const channel=match[1]!;const route=match[2]!;
      if(pilot && route.startsWith("art/")) return json({error:"Not found."},404);
      if(request.method==="OPTIONS") {
        const origin=request.headers.get("origin");
        const requested=request.headers.get("access-control-request-method");
        const headers=(request.headers.get("access-control-request-headers")??"").split(",").map(h=>h.trim().toLowerCase()).filter(Boolean);
        if((!pilot && env.EDGE_POC_ENABLED!=="true") || !origin || !destination(request,env) ||
          (!pilot && !values(env.EDGE_ALLOWED_CHANNELS).includes(channel)) || !values(env.EDGE_ALLOWED_ORIGINS).includes(origin) ||
          !["GET","POST"].includes(requested??"") || headers.some(h=>!["authorization","content-type"].includes(h))) return json({error:"Access denied."},403);
        return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET, POST",
          "access-control-allow-headers":"Authorization, Content-Type","access-control-max-age":"300","vary":"Origin","cache-control":"no-store"}});
      }
      const auth=await authenticateRequest(request,env,channel);
      if(!auth.ok) return auth.response;
      if((route==="commands" && request.method!=="POST") || (route!=="commands" && request.method!=="GET")) return json({error:"Method not allowed."},405);
      const internalHeaders=new Headers({"x-edge-identity":JSON.stringify(auth.identity)});
      if(pilot) {
        if(auth.identity.authKind!=="pilot-session" && auth.identity.authKind!=="twitch-extension") return json({error:"Access denied."},403);
        const admission=await control(env).fetch(new Request("https://control.internal/internal/authorize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({channelId:channel,sessionId:auth.identity.sessionId,role:auth.identity.authKind==='twitch-extension'?'viewer':auth.identity.role})}));
        const data=await admission.json() as {allowed?:boolean;login?:string};
        if(!admission.ok || !data.allowed || !data.login) return json({error:"This channel is not connected to the pilot."},403);
        internalHeaders.set("x-edge-channel-login",data.login);
      }
      if(auth.protocol) internalHeaders.set("upgrade","websocket");
      let body:string|undefined;
      if(request.method==="POST") {
        if(request.headers.get("content-type")?.split(";")[0]!=="application/json") return json({error:"Use a JSON request."},415);
        try {body=await readBounded(request);} catch {return json({error:"Request too large."},413);}
      }
      const room=env.ROOMS.get(env.ROOMS.idFromName(`channel:${channel}`));
      const response=await room.fetch(new Request(`https://room.internal/${route}`,{method:request.method,headers:internalHeaders,body}));
      return cors(response,request.headers.get("origin"));
    } catch { return json({error:"The pilot is temporarily unavailable. Try again shortly."},503); }
  },
} satisfies ExportedHandler<Env>;

import { operatorAuthorized } from './operator-auth.js';
import { isKnownAppPath, withErrorDocument } from '../../app/shared/error-pages.js';
import { authenticateRequest } from "./auth.js";
import { CARD_REQUEST_BYTES, json, readBounded, readBoundedBytes } from "./protocol.js";
import { CARD_ART_CHECK_HEADER, EDGE_CARD_ART_LIMITS } from "../../app/shared/card-art.js";
import { pilotLimits, pilotLogins } from "./pilot-policy.js";
import { pilotIngress } from "./ingress.js";
import { internalFetch } from "./internal-fetch.js";
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
  if(!env.ASSETS) return withErrorDocument(request,json({error:"Not found."},404));
  const url=new URL(request.url);
  if(request.method!=="GET" && request.method!=="HEAD") return json({error:"Method not allowed."},405);
  if((/^\/(?:api|auth|v1|internal|creator|card-lab)(?:\/|$)/.test(url.pathname) && url.pathname!=="/card-lab/backs/back-prism.webp") || url.pathname.includes("..")) return withErrorDocument(request,json({error:"Not found."},404));
  const spa=isKnownAppPath(url.pathname,true);
  const assetUrl=new URL(request.url); if(spa) assetUrl.pathname="/index.html";
  const response=await env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  const headers=new Headers(response.headers);
  headers.set("x-content-type-options","nosniff");headers.set("referrer-policy","no-referrer");
  headers.set("permissions-policy","camera=(), geolocation=(), microphone=(self)");
  headers.set("cross-origin-opener-policy","same-origin");headers.set("cross-origin-embedder-policy","require-corp");
  // Only the pinned Moonshine worker needs Emscripten dynamic JS binding.
  const moonshine=url.pathname==="/moonshine-worker.js" || url.pathname==="/moonshine/runtime-0.1.5-csp1/moonshine.mjs";
  const whisper=/^\/assets\/whisper-worker-[A-Za-z0-9_-]+\.js$/.test(url.pathname);
  const quote=String.fromCharCode(39);
  const self=quote+"self"+quote;
  headers.set("content-security-policy",`default-src ${self}; script-src ${self} ${quote}wasm-unsafe-eval${quote}${moonshine?` ${quote}unsafe-eval${quote}`:""}; style-src ${self} ${quote}unsafe-inline${quote}; img-src ${self} data: blob:; media-src ${self} blob:; connect-src ${self}${whisper?"":" https://download.moonshine.ai"}; worker-src ${self} blob:; font-src ${self}; frame-ancestors ${quote}none${quote}; base-uri ${quote}none${quote}; form-action ${self} https://id.twitch.tv; object-src ${quote}none${quote}`);
  if(spa) headers.set("cache-control","private, no-store");
  return withErrorDocument(request,new Response(response.body,{status:response.status,headers}));
}

/** Control finds the Studio session and, for a change, checks its CSRF token. */
async function studioOwner(request:Request,env:Env,change:boolean):Promise<Response|{channelId:string;login:string}> {
  // Fresh headers: only what Control needs to find the session and check the token.
  const headers=new Headers({"content-type":"application/json"});
  for(const name of ["cookie","origin","sec-fetch-site","x-csrf-token"]) {const value=request.headers.get(name);if(value!==null) headers.set(name,value);}
  const auth=await internalFetch(control(env),new Request("https://control.internal/internal/studio-session",{method:"POST",headers,body:JSON.stringify({mutation:change})}));
  return auth.ok ? await auth.json() as {channelId:string;login:string} : auth;
}
const channelRoom=(env:Env,channelId:string)=>env.ROOMS.get(env.ROOMS.idFromName(`channel:${channelId}`));

/** Studio's card library. Control checks the session (and the CSRF token for changes); the channel's room owns the data. */
async function studioCards(request:Request,env:Env,action:string):Promise<Response> {
  const change=action!=="";
  if(request.method!==(change?"POST":"GET")) return json({error:"Method not allowed."},405);
  if(change && request.headers.get("content-type")?.split(";")[0]!=="application/json") return json({error:"Use a JSON request."},415);
  const owner=await studioOwner(request,env,change);
  if(owner instanceof Response) return owner;
  let body:string|undefined;
  if(change) {try {body=await readBounded(request,CARD_REQUEST_BYTES);} catch {return json({error:"This pack is too large to save."},413);}}
  const response=await internalFetch(channelRoom(env,owner.channelId),new Request(`https://room.internal/internal/cards${action}`,{method:request.method,
    headers:{"content-type":"application/json","x-edge-channel-id":owner.channelId,"x-edge-channel-login":owner.login},body}));
  return new Response(response.body,{status:response.status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}

/** Studio's images: list and upload at the root, `/<id>.png` to read one, `/<id>` to delete it. The room stores them. */
async function studioArt(request:Request,env:Env,rest:string):Promise<Response> {
  const methods=rest==="" ? ["GET","POST"] : /^\/[0-9a-f-]{36}\.png$/.test(rest) ? ["GET"] : /^\/[0-9a-f-]{36}$/.test(rest) ? ["DELETE"] : null;
  if(!methods) return json({error:"Not found."},404);
  if(!methods.includes(request.method)) return json({error:"Method not allowed."},405);
  const upload=request.method==="POST";
  if(upload && request.headers.get("content-type")?.split(";")[0]!=="image/png")
    return json({code:"invalid_image",error:"Studio uploads the PNG it fits on your device. Reload Studio and choose the image again."},415);
  const owner=await studioOwner(request,env,request.method!=="GET");
  if(owner instanceof Response) return owner;
  const headers=new Headers({"x-edge-channel-id":owner.channelId,"x-edge-channel-login":owner.login});
  let body:Uint8Array|undefined;
  if(upload) {
    try {body=await readBoundedBytes(request,EDGE_CARD_ART_LIMITS.outputBytes);}
    catch {return json({code:"invalid_image",error:"Images are saved at up to 1 MB. Choose it again so Studio can fit it."},413);}
    for(const name of ["content-type","x-art-purpose","x-art-source","x-art-source-id",CARD_ART_CHECK_HEADER]) {const value=request.headers.get(name);if(value!==null) headers.set(name,value);}
  }
  const response=await internalFetch(channelRoom(env,owner.channelId),new Request(`https://room.internal/internal/card-art${rest}`,{method:request.method,headers,body}));
  const image=response.headers.get("content-type")==="image/png";
  return new Response(response.body,{status:response.status,headers:{"content-type":image?"image/png":"application/json; charset=utf-8",
    "cache-control":"private, no-store","x-content-type-options":"nosniff",...(image?{"cross-origin-resource-policy":"same-origin"}:{})}});
}

/** A round's image for the Extension and overlays. The room checks the signature and that the round shows that image. */
async function roundArt(request:Request,env:Env,channelId:string,rest:string):Promise<Response> {
  const url=new URL(request.url), origin=request.headers.get("origin");
  if(!["GET","HEAD"].includes(request.method)) return json({error:"Method not allowed."},405);
  if(url.search || (origin && !values(env.EDGE_ALLOWED_ORIGINS).includes(origin))) return json({error:"Not found."},404);
  const response=await internalFetch(channelRoom(env,channelId),new Request(`https://room.internal/internal/card-art/round/edge-${channelId}/${rest}`,{method:request.method}));
  return cors(response,origin);
}

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url);
    const pilot=env.EDGE_PILOT_ENABLED==="true";
    if(url.pathname==="/health" && request.method==="GET") {
      let enabled=pilot||env.EDGE_POC_ENABLED==="true";
      if(pilot && env.CONTROL) {
        try {const response=await internalFetch(control(env),'https://control.internal/internal/operator-health');
          enabled=response.ok && (await response.json() as {enabled?:boolean}).enabled===true;}
        catch {return json({service:'baited-edge-pilot',enabled:false,mode:'unavailable'},503);}
      }
      return json({service:pilot?"baited-edge-pilot":"baited-edge-poc",enabled,mode:pilot?enabled?'allowlisted-pilot':'stopped':"synthetic-proof"});
    }
    try {
      if(url.pathname==='/api/operator/status' || url.pathname==='/api/operator/pilot' || url.pathname==='/api/operator/card-art') {
        if(!destination(request,env)) return json({error:'Access denied.'},403);
        if(!operatorAuthorized(request,env)) return json({error:'Operator access denied.',code:'operator_auth'},401);
        return control(env).fetch(request);
      }
      if(pilot) {
        pilotLimits(env);pilotLogins(env);
        if(!destination(request,env)) return json({error:"Access denied."},403);
        const ingress = await pilotIngress(request, env);
        if ('response' in ingress) return cors(withErrorDocument(request,ingress.response), values(env.EDGE_ALLOWED_ORIGINS).includes(request.headers.get('origin')??'') ? request.headers.get('origin') : null);
        request = ingress.request;
        const publicControl=["/api/session","/api/edge/session","/api/edge/overlay","/api/edge/chat","/api/logout","/api/bot/authorize","/api/twitch/eventsub",
          "/auth/twitch","/auth/twitch/bot","/auth/twitch/callback"];
        if(publicControl.includes(url.pathname)) return withErrorDocument(request,await control(env).fetch(request));
        const cards=/^\/api\/studio\/cards(\/(?:pack|archive|select))?$/.exec(url.pathname);
        if(cards) return studioCards(request,env,cards[1]??"");
        const art=/^\/api\/studio\/card-art(\/[^/]*)?$/.exec(url.pathname);
        if(art) return studioArt(request,env,art[1]??"");
        const round=/^\/api\/card-art\/round\/edge-([1-9][0-9]{0,24})\/([0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{43})\.png$/.exec(url.pathname);
        if(round) return roundArt(request,env,round[1]!,round[2]!);
      }
      const match=/^\/v1\/rooms\/([1-9][0-9]{0,24})\/(state|commands|socket|art\/[a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
      if(!match) return pilot?await assets(request,env):json({error:"Not found."},404);
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
        const admission=await internalFetch(control(env),new Request("https://control.internal/internal/authorize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({channelId:channel,sessionId:auth.identity.sessionId,role:auth.identity.authKind==='twitch-extension'?'viewer':auth.identity.role})}));
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
      const response=await internalFetch(room,new Request(`https://room.internal/${route}`,{method:request.method,headers:internalHeaders,body}));
      return cors(response,request.headers.get("origin"));
    } catch { return withErrorDocument(request,json({error:"The pilot is temporarily unavailable. Try again shortly."},503)); }
  },
} satisfies ExportedHandler<Env>;

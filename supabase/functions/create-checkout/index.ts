import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const env=(k:string)=>{const v=Deno.env.get(k);if(!v)throw Error(`Missing ${k}`);return v};
const url=env('SUPABASE_URL'),admin=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'));
const origin=env('SITE_ORIGIN');const siteUrl=env('SITE_URL');const mollieKey=env('MOLLIE_API_KEY');
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
try{
const requestOrigin=req.headers.get('origin');if(requestOrigin!==origin)return reply({error:'Origine non autorisée'},403);
const input=await req.json();const c=input.customer??{};const s=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const first_name=s(c.first_name,100),last_name=s(c.last_name,100),email=s(c.email,250),phone=s(c.phone,40),team=s(c.team,80),notes=s(c.notes,1000);
if(!first_name||!last_name||!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||!phone)return reply({error:'Coordonnées invalides'},400);
if(!Array.isArray(input.items)||input.items.length===0||input.items.length>30)return reply({error:'Sélection invalide'},400);
const {data:settings,error:se}=await admin.from('event_settings').select('*').eq('id',1).single();if(se||!settings?.booking_open||(settings.booking_deadline&&Date.now()>new Date(settings.booking_deadline).getTime()))return reply({error:'Réservations fermées'},400);
const ids=[...new Set(input.items.map((i:any)=>i.menu_id))];if(ids.length!==input.items.length||ids.some((id:any)=>typeof id!=='string'))return reply({error:'Menus invalides'},400);
const {data:menus,error:me}=await admin.from('menus').select('id,name,price_cents,category,active').in('id',ids);if(me||!menus||menus.length!==ids.length||menus.some(m=>!m.active))return reply({error:'Menu indisponible'},400);
const byId=new Map(menus.map(m=>[m.id,m]));let total=0,qty=0;const items=[];
for(const i of input.items){const m=byId.get(i.menu_id);if(!m||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100)return reply({error:'Quantité invalide'},400);total+=m.price_cents*i.quantity;qty+=i.quantity;items.push({menu_id:m.id,name:m.name,category:m.category,unit_price_cents:m.price_cents,quantity:i.quantity})}
if(qty>200||total<1||total>10000000)return reply({error:'Montant non autorisé'},400);
const {data:booking,error:be}=await admin.from('bookings').insert({first_name,last_name,email,phone,team,notes,items,total_cents:total}).select('id,reference').single();if(be||!booking)throw Error('Enregistrement impossible');
const endpoint=`${url}/functions/v1/mollie-webhook?token=${encodeURIComponent(env('WEBHOOK_SECRET'))}`;
const body={amount:{currency:'EUR',value:(total/100).toFixed(2)},description:`Saint-Nicolas JS Dottignies ${booking.reference}`,redirectUrl:`${siteUrl}/?payment=return`,webhookUrl:endpoint,metadata:{booking_id:booking.id},locale:'fr_BE'};
const r=await fetch('https://api.mollie.com/v2/payments',{method:'POST',headers:{Authorization:`Bearer ${mollieKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const payment=await r.json();if(!r.ok||!payment.id||!payment._links?.checkout?.href){await admin.from('bookings').update({status:'failed'}).eq('id',booking.id);throw Error('Paiement temporairement indisponible')}
const {data:linked,error:linkError}=await admin.from('bookings').update({mollie_payment_id:payment.id}).eq('id',booking.id).is('mollie_payment_id',null).select('id').single();
if(linkError||!linked){console.error('Payment linkage failed',linkError);return reply({error:'Paiement créé mais réservation non finalisée. Contactez le club avant de réessayer.',reference:booking.reference},503)}
return reply({checkout_url:payment._links.checkout.href,reference:booking.reference});
}catch(e){console.error(e);return reply({error:'Impossible de préparer le paiement. Veuillez réessayer.'},500)}});

import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const env=(k:string)=>{const v=Deno.env.get(k);if(!v)throw Error(`Missing ${k}`);return v};
const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
serve(async req=>{if(req.method!=='POST')return new Response('Method not allowed',{status:405});try{
// Mollie webhook: l'identifiant transmis n'est jamais considéré comme une preuve de paiement.
// On récupère toujours le paiement depuis l'API Mollie avec notre clé secrète.
const token=new URL(req.url).searchParams.get('token');if(token!==env('WEBHOOK_SECRET'))return new Response('Forbidden',{status:403});
const data=await req.formData(),id=data.get('id');if(typeof id!=='string'||!/^tr_[A-Za-z0-9]+$/.test(id))return new Response('Bad request',{status:400});
const r=await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${env('MOLLIE_API_KEY')}`}});if(!r.ok)return new Response('Retry',{status:503});const payment=await r.json();const bookingId=payment.metadata?.booking_id;if(!bookingId)return new Response('OK');
const {data:booking,error}=await admin.from('bookings').select('id,total_cents,status,mollie_payment_id').eq('id',bookingId).single();if(error||!booking)return new Response('Retry',{status:503});
// Ne jamais attribuer un paiement si create-checkout n'a pas encore lié son ID.
// Une réponse 503 demande à Mollie de retenter la notification.
if(!booking.mollie_payment_id)return new Response('Retry',{status:503});
if(booking.mollie_payment_id!==id)return new Response('Mismatch',{status:409});
if(payment.amount?.currency!=='EUR'||Math.round(Number(payment.amount?.value)*100)!==booking.total_cents)return new Response('Amount mismatch',{status:409});
const map:Record<string,string>={paid:'paid',failed:'failed',canceled:'cancelled',expired:'expired'};const status=map[payment.status];if(!status)return new Response('OK');if(booking.status==='paid'&&status!=='paid')return new Response('OK');
const update:any={status,mollie_payment_id:id};if(status==='paid')update.paid_at=new Date().toISOString();const query=admin.from('bookings').update(update).eq('id',booking.id).eq('mollie_payment_id',id);
const {data:updated,error:up}=await (status==='paid'?query.select('id').single():query.neq('status','paid').select('id').maybeSingle());
if(up)throw up;
if(status==='paid'&&!updated)throw Error('Paid update missing');
return new Response('OK');
}catch(e){console.error(e);return new Response('Retry',{status:500})}});

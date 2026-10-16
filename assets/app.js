
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';

const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let menus=[],settings=null,counts={},bookings=[];
let transferBusy=false;
let publicReloadBusy=false;

function notify(s){
  $('#notice').textContent=s;
  $('#notice').classList.remove('hidden');
}

function total(){
  return menus.reduce((s,m)=>s+(counts[m.id]||0)*m.price_cents,0);
}

// Fermeture automatique des réservations.
function reservationsOuvertes(){
  if(!settings?.booking_open)return false;
  if(settings.booking_deadline){
    const deadline=new Date(settings.booking_deadline).getTime();
    if(!Number.isFinite(deadline)||Date.now()>deadline)return false;
  }
  return true;
}

function verifierFermeture(){
  if(!settings)return;
  if(!reservationsOuvertes()){
    notify('Les réservations sont clôturées.');
  }
  $('#pay-button').disabled=!reservationsOuvertes()||total()<=0;
  $('#transfer-button').disabled=!reservationsOuvertes()||total()<=0;
}

function drawMenus(){
  const active=menus.filter(m=>m.active);
  $('#menu-list').innerHTML=active.length
    ?active.map(m=>`
      <div class="menu">
        <div>
          <b>${esc(m.name)}</b>
          <small>${m.category==='enfant'?'Enfant':'Adulte'} · <strong>${money(m.price_cents/100)}</strong></small>
        </div>
        <div class="qty">
          <button type="button" data-id="${m.id}" data-step="-1" aria-label="Retirer">−</button>
          <output>${counts[m.id]||0}</output>
          <button type="button" data-id="${m.id}" data-step="1" aria-label="Ajouter">+</button>
        </div>
      </div>`).join('')
    :'<p>Aucun menu disponible pour le moment.</p>';
  $('#total').textContent=money(total()/100);
  verifierFermeture();
}

$('#menu-list').addEventListener('click',e=>{
  const b=e.target.closest('button[data-id]');
  if(!b)return;
  const id=b.dataset.id;
  counts[id]=Math.max(0,Math.min(100,(counts[id]||0)+Number(b.dataset.step)));
  drawMenus();
});

async function loadPublic(){
  const [a,b]=await Promise.all([
    sb.from('event_settings').select('*').eq('id',1).single(),
    sb.from('menus').select('*').eq('active',true).order('sort_order')
  ]);
  if(a.error||b.error){
    notify('Impossible de charger les informations. Vérifiez la configuration Supabase.');
    return;
  }
  settings=a.data;
  afficherDateLimite();
  menus=b.data;
  $('#event-info').textContent=settings.event_details||'';
  drawMenus();
}

function dateLimiteLisible(value){
  if(!value)return 'Sans date limite';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return 'Date limite indisponible';
  return new Intl.DateTimeFormat('fr-BE',{timeZone:'Europe/Brussels',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}
function afficherDateLimite(){
  const label=settings?.booking_deadline ? 'Réserver jusqu’au '+dateLimiteLisible(settings.booking_deadline) : 'Pas de date limite définie';
  $('#public-deadline').textContent=label;
  $('#footer-deadline').textContent=label;
}
// Conversion d'une date de l'éditeur en heure de Bruxelles, indépendamment du fuseau du navigateur.
function heureBruxellesPourFormulaire(value){
  if(!value)return '';
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
function dateLocaleVersUTC(value){
  if(!value)return null;
  const [ymd,hm]=value.split('T');
  const [y,m,d]=ymd.split('-').map(Number);
  const [hh,mm]=hm.split(':').map(Number);
  const naive=Date.UTC(y,m-1,d,hh,mm);
  let result=naive;
  for(let i=0;i<3;i++){
    const local=heureBruxellesPourFormulaire(new Date(result).toISOString());
    const [ld,lt]=local.split('T');
    const [ly,lm,lj]=ld.split('-').map(Number);
    const [lh,lmin]=lt.split(':').map(Number);
    result+=naive-Date.UTC(ly,lm-1,lj,lh,lmin);
  }
  return new Date(result).toISOString();
}

function bookingPayload(form){
  const f=new FormData(form);
  return {
    customer:{
      first_name:f.get('first_name'),
      last_name:f.get('last_name'),
      email:f.get('email'),
      phone:f.get('phone'),
      team:f.get('team'),
      notes:f.get('notes')
    },
    items:menus.filter(m=>counts[m.id]>0).map(m=>({
      menu_id:m.id,
      quantity:counts[m.id]
    }))
  };
}

// Paiement Bancontact.
$('#booking-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!reservationsOuvertes())return notify('Les réservations sont clôturées.');
  if(total()<=0)return notify('Sélectionnez au moins un repas.');

  const btn=$('#pay-button');
  btn.disabled=true;
  btn.textContent='Préparation du paiement…';

  try{
    const {data,error}=await sb.functions.invoke('create-checkout',{
      body:bookingPayload(e.target)
    });
    if(error)throw new Error(data?.error||error.message);
    if(!data?.checkout_url)throw new Error('Lien de paiement indisponible');
    window.location.assign(data.checkout_url);
  }catch(err){
    notify('Paiement non lancé : '+err.message);
    btn.textContent='Payer en ligne (Bancontact) →';
    verifierFermeture();
  }
});

// Paiement par virement bancaire.
$('#transfer-button').onclick=async()=>{
  const form=$('#booking-form');
  if(!reservationsOuvertes())return notify('Les réservations sont clôturées.');
  if(!form.reportValidity())return;
  if(total()<=0)return notify('Sélectionnez au moins un repas.');
  if(transferBusy)return;

  transferBusy=true;
  const button=$('#transfer-button');
  const pay=$('#pay-button');
  button.disabled=true;
  pay.disabled=true;
  button.textContent='Enregistrement de la réservation…';

  try{
    const {data,error}=await sb.functions.invoke('create-transfer',{
      body:bookingPayload(form)
    });

    if(error||!data?.reference||!Number.isInteger(data.total_cents)){
      throw new Error(data?.error||error?.message||'Réponse du serveur invalide');
    }

    $('#transfer-beneficiary').textContent=data.beneficiary||'Jeunesse Sportive Dottignies';
    $('#transfer-iban').textContent=data.iban||'BE64 0688 9493 4252';
    $('#transfer-amount').textContent=money(data.total_cents/100);
    $('#transfer-reference').textContent=data.communication||data.reference;
    $('#transfer-result').classList.remove('hidden');
    form.classList.add('hidden');
    $('#notice').classList.add('hidden');
    $('#transfer-result').scrollIntoView({behavior:'smooth',block:'start'});
    $('#transfer-result').focus({preventScroll:true});
  }catch(err){
    notify('Réservation par virement non enregistrée : '+err.message);
  }finally{
    transferBusy=false;
    button.textContent='Je paie par virement bancaire';
    verifierFermeture();
  }
};

$('#new-booking').onclick=()=>{
  counts={};
  $('#booking-form').reset();
  $('#booking-form').classList.remove('hidden');
  $('#transfer-result').classList.add('hidden');
  drawMenus();
  $('#booking-form').scrollIntoView({behavior:'smooth'});
};

function showTab(admin){
  $('#public-view').classList.toggle('hidden',admin);
  $('#admin-view').classList.toggle('hidden',!admin);
  $('#public-tab').classList.toggle('active',!admin);
  $('#admin-tab').classList.toggle('active',admin);
  if(admin)loadAdmin();
  else loadPublic();
}

$('#public-tab').onclick=()=>showTab(false);
$('#admin-tab').onclick=()=>showTab(true);

$('#login-form').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const {error}=await sb.auth.signInWithPassword({
    email:f.get('email'),
    password:f.get('password')
  });
  if(error)return alert(error.message);
  loadAdmin();
};

$('#logout').onclick=async()=>{
  await sb.auth.signOut();
  loadAdmin();
};

$('#refresh').onclick=()=>loadAdmin();

async function loadAdmin(){
  const {data:{user}}=await sb.auth.getUser();

  if(!user){
    $('#login-panel').classList.remove('hidden');
    $('#admin-panel').classList.add('hidden');
    return;
  }

  const {data:role}=await sb.from('admin_users')
    .select('user_id').eq('user_id',user.id).maybeSingle();

  if(!role){
    $('#login-panel').classList.remove('hidden');
    $('#admin-panel').classList.add('hidden');
    alert('Ce compte ne dispose pas des droits administrateur.');
    return;
  }

  $('#login-panel').classList.add('hidden');
  $('#admin-panel').classList.remove('hidden');

  const [s,m,b]=await Promise.all([
    sb.from('event_settings').select('*').eq('id',1).single(),
    sb.from('menus').select('*').order('sort_order'),
    sb.from('admin_booking_overview').select('*')
      .order('created_at',{ascending:false}).limit(5000)
  ]);

  if(s.error||m.error||b.error){
    return alert('Erreur de chargement de l’administration');
  }

  settings=s.data;
  menus=m.data;
  bookings=b.data;

  const form=$('#settings-form');
  form.elements.title.value=settings.title;
  form.elements.event_details.value=settings.event_details||'';
  form.elements.booking_open.checked=settings.booking_open;
  form.elements.booking_deadline.value=heureBruxellesPourFormulaire(settings.booking_deadline);

  renderAdmin();
}

// Calcul des repas adultes et enfants.
function quantitesRepas(booking){
  const q={adulte:0,enfant:0};

  for(const item of booking.items||[]){
    const menu=menus.find(m=>m.name===item.name);
    const enfant=menu
      ?menu.category==='enfant'
      :/enfant/i.test(item.name||'');

    q[enfant?'enfant':'adulte']+=Number(item.quantity)||0;
  }

  return q;
}

function recapitulatif(){
  const paid=bookings.filter(b=>b.status==='paid');
  const q={adulte:0,enfant:0};
  let montant=0;

  for(const b of paid){
    const x=quantitesRepas(b);
    q.adulte+=x.adulte;
    q.enfant+=x.enfant;
    montant+=Number(b.total_cents)||0;
  }

  return {
    reservations:paid.length,
    adulte:q.adulte,
    enfant:q.enfant,
    repas:q.adulte+q.enfant,
    montant
  };
}

function statutPaiement(status){
  return ({
    paid:'Payé',
    pending:'En attente',
    failed:'Échoué',
    cancelled:'Annulé',
    expired:'Expiré',
    transfer_pending:'Virement attendu',
    transfer_expired:'Virement expiré',
    admin_cancelled:'Annulée manuellement'
  })[status]||status;
}

function dateBelge(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';

  return new Intl.DateTimeFormat('fr-BE',{
    timeZone:'Europe/Brussels',
    day:'2-digit',
    month:'2-digit',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  }).format(date);
}

function renderAdmin(){
  const r=recapitulatif();

  $('#stats').innerHTML=`
    <div class="stat">
      <strong>${r.reservations}</strong>
      <small>Réservations payées</small>
    </div>
    <div class="stat">
      <strong>${r.repas}</strong>
      <small>Repas payés</small>
    </div>
    <div class="stat">
      <strong>${money(r.montant/100)}</strong>
      <small>Total encaissé brut</small>
    </div>
  `;

  let recap=$('#recap-repas');

  if(!recap){
    recap=document.createElement('div');
    recap.id='recap-repas';
    recap.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:12px 0 18px';
    $('#stats').insertAdjacentElement('afterend',recap);
  }

  recap.innerHTML=`
    <div class="stat">
      <strong>${r.adulte}</strong>
      <small>Menus adultes payés</small>
    </div>
    <div class="stat">
      <strong>${r.enfant}</strong>
      <small>Menus enfants payés</small>
    </div>
    <div class="stat">
      <strong>${r.repas}</strong>
      <small>Total repas payés</small>
    </div>
  `;

  $('#admin-menus').innerHTML=menus.map(m=>`
    <div class="menu-admin">
      <span>${esc(m.name)} · ${esc(m.category)} · ${money(m.price_cents/100)} ${m.active?'':'(inactif)'}</span>
      <button data-edit="${m.id}">Modifier</button>
    </div>
  `).join('');

  $('#booking-rows').innerHTML=bookings.map(b=>`
    <tr>
      <td>${esc(b.reference)}</td>
      <td>${esc(b.last_name)} ${esc(b.first_name)}</td>
      <td>${esc(b.email)}<br>${esc(b.phone)}</td>
      <td>
        ${(b.items||[]).map(i=>esc(i.name)+' × '+i.quantity).join('<br>')}
        <br><small>${esc(b.notes)}</small>
      </td>
      <td>${money(b.total_cents/100)}</td>
      <td>
        <span class="payment-status payment-${esc(b.status)}">
          ${esc(statutPaiement(b.status))}
        </span>
        <br>
        <small>${b.payment_method==='transfer'?'Virement bancaire':'Mollie / Bancontact'}</small>
        ${b.status==='admin_cancelled' ? `<br><small>${b.refunded_at?'Remboursement déclaré effectué le '+esc(dateBelge(b.refunded_at)):b.paid_at?'Remboursement manuel à effectuer':'Non payée au moment de l’annulation'}</small>`:''}
      </td>
      <td>
        ${b.payment_method==='transfer'&&b.status==='transfer_pending'
          ?`<button type="button" class="confirm-transfer" data-confirm-transfer="${esc(b.id)}">Confirmer le virement reçu</button>`
          :''}
        ${!['admin_cancelled','cancelled','expired','failed','transfer_expired'].includes(b.status)
          ?`<button type="button" class="cancel-booking" data-cancel-booking="${esc(b.id)}">Annuler</button>`:''}
        ${b.status==='admin_cancelled'&&b.paid_at&&!b.refunded_at
          ?`<button type="button" class="mark-refunded" data-mark-refunded="${esc(b.id)}">Marquer remboursé</button>`:''}
        ${b.status==='admin_cancelled'&&(!b.paid_at||b.refunded_at)?'—':''}
      </td>
      <td>${dateBelge(b.created_at)}</td>
    </tr>
  `).join('');
}

// Actions protégées par des fonctions SQL réservées aux administrateurs.
$('#booking-rows').addEventListener('click',async e=>{
  const cancel=e.target.closest('[data-cancel-booking]');
  const refund=e.target.closest('[data-mark-refunded]');
  if(!cancel&&!refund)return;
  const id=cancel?.dataset.cancelBooking||refund?.dataset.markRefunded;
  const b=bookings.find(x=>x.id===id);
  if(!b)return;
  const message=cancel
    ?`Annuler la réservation ${b.reference} de ${b.first_name} ${b.last_name} ?\n\nATTENTION : cette action ne rembourse PAS le client et ne stoppe PAS un paiement Mollie en cours. Vérifiez les paiements dans Mollie avant tout remboursement.`
    :`Confirmer que le remboursement de ${money(b.total_cents/100)} a DÉJÀ été effectué manuellement pour ${b.reference} ?\n\nCe bouton n'effectue aucun paiement.`;
  if(!window.confirm(message))return;
  const button=cancel||refund;
  button.disabled=true;
  const {error}=await sb.rpc(cancel?'admin_cancel_booking':'admin_mark_booking_refunded',{booking_uuid:id});
  if(error){alert('Opération impossible : '+error.message);button.disabled=false;return;}
  await loadAdmin();
});

// Confirmation des virements et envoi des e-mails.
$('#booking-rows').addEventListener('click',async e=>{
  const button=e.target.closest('[data-confirm-transfer]');
  if(!button)return;

  const id=button.dataset.confirmTransfer;
  const booking=bookings.find(b=>b.id===id);

  if(!booking||
     booking.payment_method!=='transfer'||
     booking.status!=='transfer_pending')return;

  const message=`Confirmer la réception bancaire de ${money(booking.total_cents/100)} pour ${booking.last_name} ${booking.first_name} (réf. ${booking.reference}) ?\n\nCette action marque la réservation comme payée. Vérifiez d'abord le virement sur le compte du club.`;

  if(!window.confirm(message))return;

  button.disabled=true;
  button.textContent='Validation…';

  const {error}=await sb.rpc('confirm_transfer_payment',{
    booking_uuid:id
  });

  if(error){
    alert('Impossible de confirmer ce virement : '+error.message);
    button.disabled=false;
    button.textContent='Confirmer le virement reçu';
    return;
  }

  button.textContent='Envoi de l’e-mail…';

  try{
    const {data:emailResult,error:emailError}=
      await sb.functions.invoke('confirm-transfer-email',{
        body:{booking_id:id}
      });

    if(emailError||!emailResult?.success){
      alert('Le virement est confirmé comme payé, mais l’e-mail n’a pas pu être envoyé. Vérifiez les logs Supabase.');
    }else{
      alert('Virement confirmé et e-mail de confirmation envoyé !');
    }
  }catch(err){
    alert('Le virement est confirmé, mais une erreur est survenue lors de l’envoi de l’e-mail.');
  }

  await loadAdmin();
});

// Gestion des menus.
$('#admin-menus').onclick=e=>{
  const b=e.target.closest('[data-edit]');
  if(!b)return;

  const m=menus.find(x=>x.id===b.dataset.edit);
  const f=$('#menu-form');

  f.elements.id.value=m.id;
  f.elements.name.value=m.name;
  f.elements.category.value=m.category;
  f.elements.price.value=(m.price_cents/100).toFixed(2);
  f.elements.sort_order.value=m.sort_order;
  f.elements.active.checked=m.active;
  f.scrollIntoView({behavior:'smooth'});
};

$('#reset-menu').onclick=()=>$('#menu-form').reset();

$('#menu-form').onsubmit=async e=>{
  e.preventDefault();

  const f=new FormData(e.target);
  const id=f.get('id');

  const row={
    name:f.get('name'),
    category:f.get('category'),
    price_cents:Math.round(Number(f.get('price'))*100),
    sort_order:Number(f.get('sort_order')),
    active:f.get('active')==='on'
  };

  if(!row.price_cents||row.price_cents<1){
    return alert('Prix invalide');
  }

  const {error}=id
    ?await sb.from('menus').update(row).eq('id',id)
    :await sb.from('menus').insert(row);

  if(error)return alert(error.message);

  e.target.reset();
  e.target.elements.id.value='';
  loadAdmin();
};

// Paramètres de l'événement.
$('#settings-form').onsubmit=async e=>{
  e.preventDefault();

  const f=new FormData(e.target);
  const d=f.get('booking_deadline');

  const {error}=await sb.from('event_settings').update({
    title:f.get('title'),
    event_details:f.get('event_details'),
    booking_open:f.get('booking_open')==='on',
    booking_deadline:dateLocaleVersUTC(d)
  }).eq('id',1);

  if(error)return alert(error.message);

  alert('Paramètres enregistrés');
  await loadAdmin();
  await loadPublic();
};

// Export CSV amélioré.
$('#export').onclick=()=>{
  const rows=[[
    'Référence',
    'Nom',
    'Prénom',
    'E-mail',
    'Téléphone',
    'Équipe',
    'Remarques / allergies',
    'Menus détaillés',
    'Menus adultes',
    'Menus enfants',
    'Total repas',
    'Total EUR',
    'Mode de paiement',
    'Statut',
    'Date de réservation',
    'Annulée le',
    'Remboursée manuellement le'
  ]];

  for(const b of bookings){
    const q=quantitesRepas(b);

    rows.push([
      b.reference,
      b.last_name,
      b.first_name,
      b.email,
      b.phone,
      b.team,
      b.notes,
      (b.items||[]).map(i=>i.name+' x '+i.quantity).join(' | '),
      q.adulte,
      q.enfant,
      q.adulte+q.enfant,
      (b.total_cents/100).toFixed(2).replace('.',','),
      b.payment_method==='transfer'?'Virement bancaire':'Mollie / Bancontact',
      statutPaiement(b.status),
      dateBelge(b.created_at),
      dateBelge(b.cancelled_at),
      dateBelge(b.refunded_at)
    ]);
  }

  const r=recapitulatif();

  rows.push([]);
  rows.push(['RÉCAPITULATIF DES RÉSERVATIONS PAYÉES']);
  rows.push(['Réservations payées',r.reservations]);
  rows.push(['Menus adultes payés',r.adulte]);
  rows.push(['Menus enfants payés',r.enfant]);
  rows.push(['Total repas payés',r.repas]);
  rows.push([
    'Total encaissé brut EUR',
    (r.montant/100).toFixed(2).replace('.',',')
  ]);

  const csv='\ufeff'+rows.map(row=>
    row.map(v=>{
      let value=String(v??'');
      if(/^[\s]*[=+@-]/.test(value))value="'"+value;
      return '"'+value.replace(/"/g,'""')+'"';
    }).join(';')
  ).join('\r\n');

  const url=URL.createObjectURL(
    new Blob([csv],{type:'text/csv;charset=utf-8'})
  );

  const a=document.createElement('a');
  a.href=url;
  a.download='reservations-saint-nicolas.csv';

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// Vérification périodique de la fermeture.
setInterval(verifierFermeture,30000);
// Recharger périodiquement les paramètres modifiés depuis un autre appareil.
setInterval(()=>{if(!document.hidden)loadPublic();},60000);

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){loadPublic();verifierFermeture();}
});

const params=new URLSearchParams(location.search);

if(params.has('payment')){
  notify('Retour du paiement : le statut est vérifié par le serveur. Le club confirmera votre réservation après validation bancaire.');
  history.replaceState({},'',location.pathname);
}

loadPublic();

(() => {
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const has = id => !!document.getElementById(id);
  const setYear = () => { const y = $('#year'); if (y) y.textContent = new Date().getFullYear(); };

  /* NAV: Admin ↔ Panel (po zalogowaniu) */
  async function updateNavAuth() {
  const link = document.getElementById('adminLink');
  if (!link) return;

  try {
    const res = await fetch('/api/auth/me');

    if (res.ok) {
      // użytkownik zalogowany
      link.href = '/logowanie/admin.html';
      link.textContent = 'Panel';

      // dodaj przycisk wylogowania tylko raz
      if (!document.getElementById('logoutBtn')) {
        const out = document.createElement('a');
        out.id = 'logoutBtn';
        out.href = '#';
        out.textContent = 'Wyloguj';

        link.parentElement.appendChild(out);

        out.addEventListener('click', async (e) => {
          e.preventDefault();

          await fetch('/api/auth/logout', {
            method: 'POST'
          });

          window.location.href = '/index.html';
        });
      }

    } else {
      // użytkownik niezalogowany
      link.href = '/logowanie/login.html';
      link.textContent = 'Panel';

      document.getElementById('logoutBtn')?.remove();
    }

  } catch (err) {
    console.error(err);

    link.href = '/logowanie/login.html';
    link.textContent = 'Panel';

    document.getElementById('logoutBtn')?.remove();
  }
}

  /* LOGIN */
  async function initLogin() {
    setYear();
    const btn = $('#loginBtn');
    if (!btn) return;

    const doLogin = async () => {
      const email = ($('#email')?.value || '').trim();
      const password = $('#password')?.value || '';
      if (!email || !password) return alert('Podaj e-mail i hasło.');
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      });
      if (res.ok) window.location.href = 'admin.html';
      else alert('Błędny e-mail lub hasło.');
    };

    btn.addEventListener('click', doLogin);
    // Enter w polach
    ['#email','#password'].forEach(sel=>{
      $(sel)?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doLogin(); });
    });
  }

  /* ADMIN */
  let currentSort = 'created-desc';

  async function authGuard() {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) { window.location.href = 'login.html'; return null; }
    return res.json();
  }
  async function fetchCats() {
    const r = await fetch('/api/categories'); return r.json();
  }
  async function fetchProducts() {
    const r = await fetch('/api/products'); return r.json();
  }

  function renderCatsList(cats) {
    const list = $('#catList'); if (!list) return;
    list.innerHTML = '';
    cats.forEach(c => {
      const row = document.createElement('div');
      row.className = 'kat-item';
      row.innerHTML = `<span>${c.name}</span><button class="btn btn-del" data-id="${c.id}">Usuń</button>`;
      list.appendChild(row);
    });
  }
  function fillCategorySelect(cats) {
    const sel = $('#pCategory'); if (!sel) return;
    sel.innerHTML = '';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      sel.appendChild(opt);
    });
  }

  // Karta produktu w panelu admina (z edycją ceny/opisu i przełącznikiem pokazywania ceny)
  function prodCard(p) {
    const img = p.image_url
      ? `<img class="prod-img" src="${p.image_url}" alt="${p.name}">`
      : `<div class="prod-img" style="display:grid;place-items:center;color:var(--muted)">Brak zdjęcia</div>`;

    const el = document.createElement('div');
    el.className = 'prod-card';
    el.innerHTML = `
      <div class="prod-head">
        <h4>${p.name}</h4>
        <button class="btn" data-action="delete" data-id="${p.id}">Usuń</button>
      </div>

      ${img}

      <div class="prod-meta">
        <span class="tag">${p.category || '—'}</span>
        <label class="tag">
          <input type="checkbox" data-action="togglePrice" data-id="${p.id}" ${p.show_price ? 'checked':''}>
          pokazuj cenę
        </label>
      </div>

      <div class="prod-edit">
        <label>Cena (PLN)
          <input type="number" class="edit-price" min="0" step="0.01" value="${Number(p.price || 0)}" disabled>
        </label>
        <label>Opis
          <textarea class="edit-desc" rows="3" placeholder="Krótki opis…" disabled>${p.description || ''}</textarea>
        </label>
      </div>
    `;
    return el;
  }

  function sortClient(list) {
    const name = p => (p.name||'').toLowerCase();
    const cat  = p => (p.category||'').toLowerCase();
    const price= p => isNaN(Number(p.price)) ? Number.POSITIVE_INFINITY : Number(p.price);
    const time = p => Number(p.created_at||0);
    switch (currentSort) {
      case 'created-asc':  return list.sort((a,b)=> time(a)-time(b));
      case 'created-desc': return list.sort((a,b)=> time(b)-time(a));
      case 'name-asc':     return list.sort((a,b)=> name(a).localeCompare(name(b),'pl',{sensitivity:'base'}));
      case 'name-desc':    return list.sort((a,b)=> name(b).localeCompare(name(a),'pl',{sensitivity:'base'}));
      case 'price-asc':    return list.sort((a,b)=> price(a)-price(b));
      case 'price-desc':   return list.sort((a,b)=> price(b)-price(a));
      case 'category-asc': return list.sort((a,b)=> cat(a).localeCompare(cat(b),'pl',{sensitivity:'base'}));
      default: return list;
    }
  }

  async function renderProductsAdmin(filter='') {
    const box = $('#productsList'); if (!box) return;
    const all = await fetchProducts();
    const term = (filter||'').toLowerCase().trim();
    let list = all.filter(p =>
      !term ||
      (p.name||'').toLowerCase().includes(term) ||
      (p.category||'').toLowerCase().includes(term)
    );
    list = sortClient(list);
    box.innerHTML = '';
    list.forEach(p => box.appendChild(prodCard(p)));
  }

  async function initAdmin() {
    setYear();
    const me = await authGuard(); if (!me) return;

    // logout z nagłówka (jeśli jest w HTML)
    $('#logoutBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/auth/logout', { method:'POST' });
      window.location.href = 'login.html';
    });

    // Lewy panel (sekcje)
    $$('.admin-nav .stack a').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const id = a.getAttribute('href');
        $$('.panel').forEach(p=> p.style.display='none');
        $$('.admin-nav .stack a').forEach(x=> x.classList.remove('active'));
        a.classList.add('active');
        const panel = document.querySelector(id); if (panel) panel.style.display='grid';
        window.scrollTo({top:0, behavior:'smooth'});
      });
    });
    // domyślnie pierwsza sekcja
    $$('.panel').forEach((p,i)=> p.style.display = i===0 ? 'grid' : 'none');

    // Kategorie
    const cats = await fetchCats();
    renderCatsList(cats);
    fillCategorySelect(cats);

    $('#addCatBtn')?.addEventListener('click', async ()=>{
      const name = ($('#catName')?.value || '').trim();
      if (!name) return alert('Podaj nazwę kategorii.');
      const res = await fetch('/api/categories', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name })
      });
      if (!res.ok) return alert('Błąd dodawania kategorii');
      ($('#catName') && ($('#catName').value=''));
      const upd = await fetchCats();
      renderCatsList(upd); fillCategorySelect(upd);
    });

    $('#catList')?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button.btn-del'); if (!btn) return;
      if (!confirm('Usunąć kategorię?')) return;
      const id = btn.dataset.id;
      await fetch(`/api/categories/${id}`, { method:'DELETE' });
      const upd = await fetchCats();
      renderCatsList(upd); fillCategorySelect(upd);
    });

    /* Banery (slider) w panelu */
    async function loadBanners(){
      const res = await fetch('/api/admin/banners');
      return res.json();
    }
    function bannerCard(b){
      const el = document.createElement('div');
      el.className = 'banner-card';
      el.dataset.id = b.id;
      el.innerHTML = `
        <img src="${b.image_url}" alt="baner ${b.id}">
        <div class="banner-row">
          <label class="inline"><input type="checkbox" class="b-active" ${b.active ? 'checked':''}> aktywny</label>
          <label>Kolejność <input type="number" class="b-order" min="0" value="${b.sort_order ?? 0}" style="width:90px"></label>
        </div>
        <div class="banner-row">
          <label style="flex:1">Link
            <input type="url" class="b-link" value="${b.link_url || ''}" placeholder="https://...">
          </label>
        </div>
        <div class="banner-actions">
          <label>Nowe zdjęcie <input type="file" class="b-image" accept="image/*"></label>
          <button class="btn b-save">Zapisz</button>
          <button class="btn b-del">Usuń</button>
        </div>
      `;
      return el;
    }
    async function renderBanners(){
      const box = document.getElementById('bannersList');
      if (!box) return;
      const list = await loadBanners();
      box.innerHTML = '';
      list.forEach(b => box.appendChild(bannerCard(b)));
    }

    document.getElementById('addBannerBtn')?.addEventListener('click', async ()=>{
      const file = document.getElementById('bImage')?.files?.[0];
      if (!file) return alert('Wybierz obraz.');
      const fd = new FormData();
      fd.append('image', file);
      fd.append('link_url', document.getElementById('bLink')?.value || '');
      fd.append('sort_order', document.getElementById('bOrder')?.value || '0');
      fd.append('active', document.getElementById('bActive')?.checked ? '1' : '0');
      const res = await fetch('/api/banners', { method: 'POST', body: fd });
      if (!res.ok) return alert('Nie udało się dodać banera.');
      if (document.getElementById('bImage')) document.getElementById('bImage').value = '';
      renderBanners();
    });

    document.getElementById('bannersList')?.addEventListener('click', async (e)=>{
      const card = e.target.closest('.banner-card'); if (!card) return;
      const id = card.dataset.id;

      if (e.target.classList.contains('b-del')) {
        if (!confirm('Usunąć baner?')) return;
        await fetch(`/api/banners/${id}`, { method:'DELETE' });
        renderBanners();
        return;
      }

      if (e.target.classList.contains('b-save')) {
        const fd = new FormData();
        const imgFile = card.querySelector('.b-image')?.files?.[0];
        if (imgFile) fd.append('image', imgFile);
        fd.append('link_url', card.querySelector('.b-link')?.value || '');
        fd.append('sort_order', card.querySelector('.b-order')?.value || '0');
        fd.append('active', card.querySelector('.b-active')?.checked ? '1' : '0');

        const res = await fetch(`/api/banners/${id}`, { method:'PATCH', body: fd });
        if (!res.ok) return alert('Błąd zapisu banera.');
        renderBanners();
      }
    });

    // Produkty — dodawanie
    $('#addProductBtn')?.addEventListener('click', async ()=>{
      const name = ($('#pName')?.value || '').trim();
      const category_id = $('#pCategory')?.value || '';
      const price = $('#pPrice')?.value || '';
      const show_price = $('#pShowPrice')?.checked ? '1' : '0';
      const description = ($('#pDesc')?.value || '').trim();
      const file = $('#pImage')?.files?.[0];

      if (!name) return alert('Podaj nazwę produktu.');
      if (!category_id) return alert('Wybierz kategorię.');

      const fd = new FormData();
      fd.append('name', name);
      fd.append('category_id', category_id);
      fd.append('price', price);
      fd.append('show_price', show_price);
      fd.append('description', description);
      if (file) fd.append('image', file);

      const res = await fetch('/api/products', { method:'POST', body: fd });
      if (!res.ok) return alert('Błąd dodawania produktu.');

      // reset
      $('#pName') && ($('#pName').value = '');
      $('#pPrice') && ($('#pPrice').value = '');
      $('#pDesc') && ($('#pDesc').value = '');
      $('#pImage') && ($('#pImage').value = '');
      $('#pShowPrice') && ($('#pShowPrice').checked = true);

      renderProductsAdmin($('#searchProducts')?.value || '');
    });

    // Produkty — operacje listy
    $('#productsList')?.addEventListener('click', async (e)=>{
      const del = e.target.closest('button[data-action="delete"]');
      const tgl = e.target.closest('input[data-action="togglePrice"]');

      if (del) {
        if (!confirm('Usunąć ten produkt?')) return;
        const id = del.dataset.id;
        await fetch(`/api/products/${id}`, { method:'DELETE' });
        renderProductsAdmin($('#searchProducts')?.value || '');
      }
      if (tgl) {
        const id = tgl.dataset.id;
        await fetch(`/api/products/${id}`, {
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ show_price: tgl.checked })
        });
      }
    });

    // Produkty — wyszukiwarka + sort
    $('#searchProducts')?.addEventListener('input', e => renderProductsAdmin(e.target.value));
    $('#sortProducts')?.addEventListener('change', e => {
      currentSort = e.target.value;
      renderProductsAdmin($('#searchProducts')?.value || '');
    });

    // Ustawienia admina (email)
    (async function initAdminSettings(){
      const me = await (await fetch('/api/auth/me')).json().catch(()=>({}));
      if ($('#admEmail')) $('#admEmail').value = me?.email || '';
    })();

    // Pierwsze renderowanie
    renderProductsAdmin();
    renderBanners();
  }

  /* HOME (lista + slider) */
  async function initHome() {
    setYear();

    // --- BANERY: wczytaj i uruchom slider ---
    const sliderEl = document.getElementById('bannerSlider');
    if (sliderEl) {
      const dotsEl = document.getElementById('bannerDots');
      const res = await fetch('/api/banners');
      const banners = await res.json();

      // usuń tylko poprzednie slajdy
      sliderEl.querySelectorAll('.slide').forEach(n => n.remove());
      if (dotsEl) dotsEl.innerHTML = '';

      banners.forEach((b, i) => {
        const s = document.createElement('div');
        s.className = 'slide' + (i === 0 ? ' active' : '');
        s.innerHTML = b.link_url
          ? `<a href="${b.link_url}" target="_blank" rel="noopener">
               <img src="${b.image_url}" alt="baner ${i+1}">
             </a>`
          : `<img src="${b.image_url}" alt="baner ${i+1}">`;
        const beforeNode = sliderEl.querySelector('.prev') || sliderEl.firstChild;
        sliderEl.insertBefore(s, beforeNode);

        const d = document.createElement('button');
        d.className = i === 0 ? 'active' : '';
        d.addEventListener('click', () => show(i));
        dotsEl?.appendChild(d);
      });

      let idx = 0, tmr = null;
      const slides = () => Array.from(sliderEl.querySelectorAll('.slide'));
      const dots   = () => Array.from(dotsEl?.querySelectorAll('button') || []);

      function show(n){
        if (!banners.length) return;
        idx = (n + banners.length) % banners.length;
        slides().forEach((el,i)=> el.classList.toggle('active', i===idx));
        dots().forEach((el,i)=> el.classList.toggle('active', i===idx));
      }
      function next(){ show(idx+1); }
      function prev(){ show(idx-1); }

      // strzałki ekranowe
      sliderEl.querySelector('.next')?.addEventListener('click', ()=>{ stop(); next(); });
      sliderEl.querySelector('.prev')?.addEventListener('click', ()=>{ stop(); prev(); });

      // swipe na telefonie
      let startX=0, startY=0, touching=false;
      sliderEl.addEventListener('touchstart', (e)=>{
        const t=e.touches[0]; startX=t.clientX; startY=t.clientY; touching=true; stop();
      }, { passive:true });
      sliderEl.addEventListener('touchend', (e)=>{
        if(!touching) return; touching=false;
        const t=e.changedTouches[0]; const dx=t.clientX-startX; const dy=t.clientY-startY;
        if(Math.abs(dx)>Math.abs(dy) && Math.abs(dx)>40){ dx<0 ? next() : prev(); }
        setTimeout(start,800);
      }, { passive:true });

      function start(){ if (tmr) clearInterval(tmr); if (banners.length>1) tmr = setInterval(next, 5000); }
      function stop(){ if (tmr) clearInterval(tmr); }

      sliderEl.addEventListener('mouseenter', stop);
      sliderEl.addEventListener('mouseleave', start);
      if (banners.length > 1) start();
    }

    // LISTA PRODUKTÓW
    const grid = $('#grid'); if (!grid) return;

    const cats = await (await fetch('/api/categories')).json();
    const holder = $('#category-filters');
    if (holder) {
      holder.innerHTML = cats.map(c => `
        <label class="chip">
          <input type="checkbox" value="${c.name}" checked>
          ${c.name}
        </label>
      `).join('');
    }

    async function loadAndRender() {
      const sort = $('#sort')?.value || 'created_desc';
      const search = ($('#search')?.value || '').trim().toLowerCase();

      const res = await fetch(`/api/products?sort=${encodeURIComponent(sort)}${search?`&search=${encodeURIComponent(search)}`:''}`);
      const products = await res.json();

      // filtr kategorii po nazwach (multi-select po stronie klienta)
      const active = new Set($$('#category-filters input[type="checkbox"]:checked').map(i => i.value));
      const filtered = products.filter(p => active.has(p.category || ''));

      grid.innerHTML = '';
      filtered.forEach(p => {
        const art = document.createElement('article');
        art.className = 'card';
        art.innerHTML = `
          <img src="${p.image_url || 'https://picsum.photos/seed/placeholder/600/400'}" alt="${p.name}" loading="lazy">
          <div class="card-body">
            <h3 class="card-title">${p.name}</h3>
            ${p.show_price ? `<p class="price"><strong>${(Number(p.price)||0).toFixed(2)} zł</strong></p>` : `<p class="price"></p>`}
            <details class="desc-panel">
              <summary>Opis</summary>
              <div class="desc">${p.description ? p.description : '—'}</div>
            </details>
            <span class="badge">${p.category || '—'}</span>
          </div>
        `;
        grid.appendChild(art);
      });
    }

    $('#search')?.addEventListener('input', loadAndRender);
    $('#sort')?.addEventListener('change', loadAndRender);
    $('#category-filters')?.addEventListener('change', loadAndRender);
    loadAndRender();
  }

  /* ROUTER */
  function router() {
    updateNavAuth();                  // podmień link w nav wg sesji

    if (has('loginBtn'))   return initLogin();
    if (has('productsList')) return initAdmin();
    if (has('grid'))       return initHome();

    setYear();
  }

  // Jeśli skrypt na końcu body – odpal od razu, inaczej poczekaj
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', router);
  } else {
    router();
  }
})();

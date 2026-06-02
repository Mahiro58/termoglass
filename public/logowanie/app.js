(() => {
  /* Helpers */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const LS_KEYS = {
    user: 'wykoncz_user',
    products: 'wykoncz_products',
    categories: 'wykoncz_categories',
  };

  const TOKEN_KEY = 'wykoncz_token';

  const has = (id) => !!document.getElementById(id);

  const toDataURL = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const safeJSON = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || '') ?? fallback; }
    catch { return fallback; }
  };

  /* Dane (get/set) */
  const getCats  = () => safeJSON(LS_KEYS.categories, []);
  const setCats  = (arr) => localStorage.setItem(LS_KEYS.categories, JSON.stringify(arr));
  const getProds = () => safeJSON(LS_KEYS.products, []);
  const setProds = (arr) => localStorage.setItem(LS_KEYS.products, JSON.stringify(arr));

  /* Inicjały / domyślne */
  function ensureDefaults() {
    if (!localStorage.getItem(LS_KEYS.user)) {
      const defaultUser = { email: 'admin@local', password: 'admin123', createdAt: Date.now() };
      localStorage.setItem(LS_KEYS.user, JSON.stringify(defaultUser));
    }
    if (!localStorage.getItem(LS_KEYS.categories)) {
      setCats(['narzędzia ręczne','elektronarzędzia','farby & wykończenia','podłogi & płytki','oświetlenie','akcesoria montażowe']);
    }
    if (!localStorage.getItem(LS_KEYS.products)) {
      setProds([]);
    }
  }

  /* Auth */
  function requireAuthOrRedirect() {
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      window.location.href = 'login.html';
    }
  }

  function setFooterYear() {
    const el = $('#year');
    if (el) el.textContent = new Date().getFullYear();
  }

  /*     LOGIN PAGE     */
  function initLoginPage() {
    ensureDefaults();
    setFooterYear();

    const emailEl = $('#email');
    const passEl  = $('#password');
    const loginBtn = $('#loginBtn');
    const seedLink = $('#seedData');

    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const email = (emailEl?.value || '').trim();
        const pass  = passEl?.value || '';
        const saved = safeJSON(LS_KEYS.user, {});

        if (email === saved.email && pass === saved.password) {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ email, at: Date.now() }));
          window.location.href = 'admin.html';
        } else {
          alert('Błędny e-mail lub hasło.');
        }
      });
    }

    if (seedLink) {
      seedLink.addEventListener('click', (e) => {
        e.preventDefault();
        // Kategorie
        const cats = ['narzędzia ręczne','elektronarzędzia','farby & wykończenia','podłogi & płytki','oświetlenie','akcesoria montażowe'];
        setCats(cats);

        // Kilka przykładowych produktów (bez zdjęć)
        const sample = [
          { id: crypto.randomUUID(), name: 'Młotek stolarski 16 oz', category: 'narzędzia ręczne', price: 49.9, showPrice: true, rating: 4.6, desc: 'Trzonek z włókna szklanego.', image: '', createdAt: Date.now() - 3000 },
          { id: crypto.randomUUID(), name: 'Wkrętarka 18V Pro', category: 'elektronarzędzia', price: 399, showPrice: true, rating: 4.8, desc: '2 biegi, 45 Nm.', image: '', createdAt: Date.now() - 2000 },
          { id: crypto.randomUUID(), name: 'Farba lateksowa Biała 10L', category: 'farby & wykończenia', price: 129.99, showPrice: true, rating: 4.5, desc: 'Wysoka odporność na zmywanie.', image: '', createdAt: Date.now() - 1000 },
        ];
        setProds(sample);

        alert('Dodano przykładowe kategorie i produkty.');
      });
    }
  }

  /* ADMIN PAGE */
  let currentSort = 'created-desc';

  function migrateCreatedAt() {
    const arr = getProds();
    let changed = false;
    let t = Date.now();
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i].createdAt) {
        arr[i].createdAt = t - i * 1000;
        changed = true;
      }
    }
    if (changed) setProds(arr);
  }

  function productCard(p) {
    const price = (p.showPrice && (p.price || p.price === 0))
      ? `<span class="tag">Cena: ${Number(p.price).toFixed(2)} zł</span>`
      : `<span class="tag">Cena ukryta</span>`;

    const img = p.image
      ? `<img class="prod-img" src="${p.image}" alt="${p.name}">`
      : `<div class="prod-img" style="display:grid;place-items:center;color:var(--muted)">Brak zdjęcia</div>`;

    const wrap = document.createElement('div');
    wrap.className = 'prod-card';
    wrap.innerHTML = `
      <div class="prod-head">
        <h4>${p.name}</h4>
        <button class="btn" data-action="delete" data-id="${p.id}">Usuń</button>
      </div>
      ${img}
      <div class="prod-meta">
        <span class="tag">${p.category || '—'}</span>
        ${price}
        <label class="tag" style="cursor:pointer">
          <input type="checkbox" data-action="togglePrice" data-id="${p.id}" ${p.showPrice ? 'checked' : ''}> pokazuj cenę
        </label>
      </div>
      <p style="margin:.5rem 0 0; color:#d6dee6">${p.desc || ''}</p>
    `;
    return wrap;
  }

  function renderCategoriesUI() {
    const list = $('#catList');
    if (!list) return;
    list.innerHTML = '';
    getCats().forEach(cat => {
      const row = document.createElement('div');
      row.className = 'kat-item';
      row.innerHTML = `
        <span>${cat}</span>
        <button class="btn btn-del" data-cat="${cat}">Usuń</button>
      `;
      list.appendChild(row);
    });
  }

  function populateCategorySelect() {
    const sel = $('#pCategory');
    if (!sel) return;
    sel.innerHTML = '';
    getCats().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
  }

  function renderProducts(filter = '') {
    const box  = $('#productsList');
    if (!box) return;

    box.innerHTML = '';
    const term = (filter || '').trim().toLowerCase();

    let list = getProds().filter(p =>
      !term ||
      (p.name || '').toLowerCase().includes(term) ||
      (p.category || '').toLowerCase().includes(term)
    );

    const safeName  = (p) => (p.name || '').toLowerCase();
    const safeCat   = (p) => (p.category || '').toLowerCase();
    const safePrice = (p) => isNaN(Number(p.price)) ? Number.POSITIVE_INFINITY : Number(p.price);
    const safeTime  = (p) => Number(p.createdAt || 0);

    switch (currentSort) {
      case 'created-asc':  list.sort((a,b) => safeTime(a) - safeTime(b)); break;
      case 'created-desc': list.sort((a,b) => safeTime(b) - safeTime(a)); break;
      case 'name-asc':     list.sort((a,b) => safeName(a).localeCompare(safeName(b), 'pl', {sensitivity:'base'})); break;
      case 'name-desc':    list.sort((a,b) => safeName(b).localeCompare(safeName(a), 'pl', {sensitivity:'base'})); break;
      case 'price-asc':    list.sort((a,b) => safePrice(a) - safePrice(b)); break;
      case 'price-desc':   list.sort((a,b) => safePrice(b) - safePrice(a)); break;
      case 'category-asc': list.sort((a,b) => safeCat(a).localeCompare(safeCat(b), 'pl', {sensitivity:'base'})); break;
    }

    list.forEach(p => box.appendChild(productCard(p)));
  }

  function initAdminPage() {
    requireAuthOrRedirect();
    ensureDefaults();
    migrateCreatedAt();
    setFooterYear();

    // Logout 
    const logoutBtn = $('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        sessionStorage.removeItem(TOKEN_KEY);
      });
    }

    // Sekcje
    renderCategoriesUI();
    populateCategorySelect();
    renderProducts();

    // Nawigacja lewego panelu (sekcje)
    $$('.admin-nav .stack a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href');
        $$('.panel').forEach(p => p.style.display = 'none');
        $$('.admin-nav .stack a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        const panel = document.querySelector(id);
        if (panel) panel.style.display = 'grid';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    // pokaż pierwszą sekcję
    const panels = $$('.panel');
    panels.forEach((p, i) => p.style.display = i === 0 ? 'grid' : 'none');

    /* Produkty: dodawanie */
    const addBtn = $('#addProductBtn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const name = ($('#pName')?.value || '').trim();
        const category = $('#pCategory')?.value || '';
        const price = parseFloat($('#pPrice')?.value || '0');
        const showPrice = $('#pShowPrice')?.checked ?? true;
        const desc = ($('#pDesc')?.value || '').trim();
        const file = $('#pImage')?.files?.[0];

        if (!name) return alert('Podaj nazwę produktu.');
        if (!category) return alert('Wybierz kategorię.');

        let imageData = '';
        if (file) {
          try { imageData = await toDataURL(file); }
          catch (e) { console.error(e); alert('Nie udało się wczytać obrazu.'); }
        }

        const newProd = {
          id: crypto.randomUUID(),
          name,
          category,
          price: isNaN(price) ? 0 : price,
          showPrice,
          desc,
          image: imageData,
          createdAt: Date.now(),
        };

        const arr = getProds();
        arr.unshift(newProd);
        setProds(arr);

        // reset formu
        if ($('#pName'))  $('#pName').value = '';
        if ($('#pPrice')) $('#pPrice').value = '';
        if ($('#pDesc'))  $('#pDesc').value = '';
        if ($('#pImage')) $('#pImage').value = '';
        if ($('#pShowPrice')) $('#pShowPrice').checked = true;

        renderProducts($('#searchProducts')?.value || '');
      });
    }

    /* Produkty: operacje na liście */
    const listBox = $('#productsList');
    if (listBox) {
      listBox.addEventListener('click', (e) => {
        const delBtn = e.target.closest('button[data-action="delete"]');
        const tgl = e.target.closest('input[data-action="togglePrice"]');

        if (delBtn) {
          const id = delBtn.dataset.id;
          if (confirm('Usunąć ten produkt?')) {
            setProds(getProds().filter(p => p.id !== id));
            renderProducts($('#searchProducts')?.value || '');
          }
        }

        if (tgl) {
          const id = tgl.dataset.id;
          const arr = getProds().map(p => p.id === id ? { ...p, showPrice: tgl.checked } : p);
          setProds(arr);
          renderProducts($('#searchProducts')?.value || '');
        }
      });
    }

    /* Produkty: wyszukiwarka + sortowanie */
    const searchInput = $('#searchProducts');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderProducts(e.target.value);
      });
    }

    const sortSelect = $('#sortProducts');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderProducts($('#searchProducts')?.value || '');
      });
    }

    /* Kategorie: dodawanie/usuwanie */
    const addCatBtn = $('#addCatBtn');
    if (addCatBtn) {
      addCatBtn.addEventListener('click', () => {
        const name = ($('#catName')?.value || '').trim();
        if (!name) return alert('Podaj nazwę kategorii.');
        const cats = getCats();
        if (cats.includes(name)) return alert('Taka kategoria już istnieje.');
        cats.push(name);
        setCats(cats);
        if ($('#catName')) $('#catName').value = '';
        renderCategoriesUI();
        populateCategorySelect();
      });
    }

    const catList = $('#catList');
    if (catList) {
      catList.addEventListener('click', (e) => {
        const btn = e.target.closest('button.btn-del');
        if (!btn) return;
        const name = btn.dataset.cat;
        if (!confirm(`Usunąć kategorię „${name}”? Produkty pozostaną, ale ich kategoria nie zmieni się automatycznie.`)) return;
        setCats(getCats().filter(c => c !== name));
        renderCategoriesUI();
        populateCategorySelect();
      });
    }

    /* Ustawienia admina */
    (function initAdminSettings() {
      const u = safeJSON(LS_KEYS.user, {});
      if ($('#admEmail')) $('#admEmail').value = u.email || '';
    })();

    const saveAdminBtn = $('#saveAdmin');
    if (saveAdminBtn) {
      saveAdminBtn.addEventListener('click', () => {
        const email = ($('#admEmail')?.value || '').trim();
        const pass  = $('#admPass')?.value || '';
        if (!email) return alert('Podaj e-mail administratora.');

        const u = safeJSON(LS_KEYS.user, {});
        u.email = email;
        if (pass) u.password = pass;
        localStorage.setItem(LS_KEYS.user, JSON.stringify(u));

        if ($('#admPass')) $('#admPass').value = '';
        alert('Zapisano ustawienia administratora.');
      });
    }
  }

  /* Router inicjalizujący skrypt zależnie od strony */
  function initRouter() {
    // login.html ma #loginBtn
    if (has('loginBtn')) {
      initLoginPage();
      return;
    }
    // admin.html ma #productsList
    if (has('productsList')) {
      initAdminPage();
      return;
    }
    // Strony publiczne: tylko rok w stopce, jeśli jest
    setFooterYear();
  }

  // Start
  document.addEventListener('DOMContentLoaded', initRouter);
})();

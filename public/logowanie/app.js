function initMobileMenu() {
  const btn = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav') || document.querySelector('.main-nav');

  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
    btn.textContent = nav.classList.contains('open')
      ? '✕'
      : '☰';
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      btn.textContent = '☰';
    });
  });

  // klik poza menu zamyka
  document.addEventListener('click', (e) => {
    const clickedInside =
      nav.contains(e.target) ||
      btn.contains(e.target);

    if (!clickedInside && nav.classList.contains('open')) {
      nav.classList.remove('open');
      btn.textContent = '☰';
    }
  });

  // po zmianie rozmiaru ekranu reset
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      nav.classList.remove('open');
      btn.textContent = '☰';
    }
  });
}


(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const has = (id) => !!document.getElementById(id);

  let currentSort = 'created-desc';
  let cachedCategories = [];
  let cachedProducts = [];
  let cachedBanners = [];
  let editingBannerId = null;

  function setFooterYear() {
    const el = $('#year');
    if (el) el.textContent = new Date().getFullYear();
  }

  async function api(url, options = {}) {
    const res = await fetch(url, options);

    if (res.status === 401) {
      window.location.href = '/logowanie/login.html';
      return null;
    }

    if (!res.ok) {
      let msg = 'Wystąpił błąd.';
      try {
        const data = await res.json();
        msg = data.error || msg;
      } catch {}
      throw new Error(msg);
    }

    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  async function requireAuthOrRedirect() {
    const res = await fetch('/api/auth/me');

    if (res.status === 401) {
      window.location.href = '/logowanie/login.html';
      return false;
    }

    return true;
  }

  function initLoginPage() {
    setFooterYear();

    const emailEl = $('#email');
    const passEl = $('#password');
    const loginBtn = $('#loginBtn');

    async function doLogin() {
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';

      if (!email || !password) return alert('Podaj e-mail i hasło.');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        if (res.ok) window.location.href = '/logowanie/admin.html';
        else alert('Błędny e-mail lub hasło.');
      } catch (err) {
        console.error(err);
        alert('Nie udało się zalogować.');
      }
    }

    loginBtn?.addEventListener('click', doLogin);

    ['#email', '#password'].forEach(sel => {
      $(sel)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
      });
    });
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
  }

  async function fetchCategories() {
    cachedCategories = await api('/api/categories') || [];
  }

  function renderCategoriesUI() {
    const list = $('#catList');
    if (!list) return;

    list.innerHTML = '';

    cachedCategories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'kat-item';
      row.innerHTML = `
        <span>${cat.name}</span>
        <button class="btn btn-del" data-cat-id="${cat.id}">Usuń</button>
      `;
      list.appendChild(row);
    });
  }

  function populateCategorySelect() {
    const sel = $('#pCategory');
    if (!sel) return;

    sel.innerHTML = '';

    cachedCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      sel.appendChild(opt);
    });
  }

  async function reloadCategories() {
    await fetchCategories();
    renderCategoriesUI();
    populateCategorySelect();
  }

  async function fetchProducts() {
    cachedProducts = await api('/api/products') || [];
  }

  function productCard(p) {
    const price = Number(p.show_price)
      ? `<span class="tag">Cena: ${Number(p.price || 0).toFixed(2)} zł</span>`
      : `<span class="tag">Cena ukryta</span>`;

    const img = p.image_url
      ? `<img class="prod-img" src="${p.image_url}" alt="${p.name}">`
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
          <input 
            type="checkbox" 
            data-action="togglePrice" 
            data-id="${p.id}" 
            ${Number(p.show_price) ? 'checked' : ''}
          >
          pokazuj cenę
        </label>
      </div>

      <p style="margin:.5rem 0 0; color:#d6dee6">${p.description || ''}</p>
    `;

    return wrap;
  }

  function renderProducts(filter = '') {
    const box = $('#productsList');
    if (!box) return;

    box.innerHTML = '';

    const term = (filter || '').trim().toLowerCase();

    let list = cachedProducts.filter(p =>
      !term ||
      (p.name || '').toLowerCase().includes(term) ||
      (p.category || '').toLowerCase().includes(term) ||
      (p.description || '').toLowerCase().includes(term)
    );

    const safeName = p => (p.name || '').toLowerCase();
    const safeCat = p => (p.category || '').toLowerCase();
    const safePrice = p => isNaN(Number(p.price)) ? Number.POSITIVE_INFINITY : Number(p.price);
    const safeTime = p => Number(p.created_at || 0);

    switch (currentSort) {
      case 'created-asc':
        list.sort((a, b) => safeTime(a) - safeTime(b));
        break;
      case 'created-desc':
        list.sort((a, b) => safeTime(b) - safeTime(a));
        break;
      case 'name-asc':
        list.sort((a, b) => safeName(a).localeCompare(safeName(b), 'pl'));
        break;
      case 'name-desc':
        list.sort((a, b) => safeName(b).localeCompare(safeName(a), 'pl'));
        break;
      case 'price-asc':
        list.sort((a, b) => safePrice(a) - safePrice(b));
        break;
      case 'price-desc':
        list.sort((a, b) => safePrice(b) - safePrice(a));
        break;
      case 'category-asc':
        list.sort((a, b) => safeCat(a).localeCompare(safeCat(b), 'pl'));
        break;
    }

    list.forEach(p => box.appendChild(productCard(p)));
  }

  async function reloadProducts() {
    await fetchProducts();
    renderProducts($('#searchProducts')?.value || '');
  }

  async function fetchBanners() {
    cachedBanners = await api('/api/admin/banners') || [];
  }

  function bannerCard(b) {
    const wrap = document.createElement('div');
    wrap.className = 'prod-card';

    wrap.innerHTML = `
      <div class="prod-head">
        <h4>Baner #${b.id}</h4>
        <div class="inline">
          <button class="btn" data-action="editBanner" data-id="${b.id}">Edytuj</button>
          <button class="btn" data-action="deleteBanner" data-id="${b.id}">Usuń</button>
        </div>
      </div>

      <img class="prod-img" src="${b.image_url}" alt="Baner">

      <div class="prod-meta">
        <span class="tag">Kolejność: ${b.sort_order ?? 0}</span>
        <span class="tag">${Number(b.active) ? 'Aktywny' : 'Nieaktywny'}</span>
      </div>

      <p style="margin:.5rem 0 0; color:#d6dee6">
        Link: ${b.link_url || 'brak'}
      </p>
    `;

    return wrap;
  }

  function renderBanners() {
    const box = $('#bannersList');
    if (!box) return;

    box.innerHTML = '';

    if (!cachedBanners.length) {
      box.innerHTML = '<p>Brak banerów.</p>';
      return;
    }

    cachedBanners.forEach(b => box.appendChild(bannerCard(b)));
  }

  async function reloadBanners() {
    await fetchBanners();
    renderBanners();
  }

  function resetBannerForm() {
    editingBannerId = null;

    if ($('#bImage')) $('#bImage').value = '';
    if ($('#bLink')) $('#bLink').value = '';
    if ($('#bSort')) $('#bSort').value = '0';
    if ($('#bActive')) $('#bActive').checked = true;

    if ($('#addBannerBtn')) $('#addBannerBtn').style.display = 'inline-block';
    if ($('#saveBannerBtn')) $('#saveBannerBtn').style.display = 'none';
    if ($('#cancelBannerEditBtn')) $('#cancelBannerEditBtn').style.display = 'none';
  }

  async function initAdminPage() {
    const ok = await requireAuthOrRedirect();
    if (!ok) return;

    setFooterYear();

    $('#logoutBtn')?.addEventListener('click', e => {
      e.preventDefault();
      logout();
    });

    $$('.admin-nav .stack a').forEach(a => {
      a.addEventListener('click', e => {
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

    const panels = $$('.panel');
    panels.forEach((p, i) => p.style.display = i === 0 ? 'grid' : 'none');

    await reloadCategories();
    await reloadProducts();

    if (has('bannersList')) {
      await reloadBanners();
    }

    $('#addProductBtn')?.addEventListener('click', async () => {
      const name = ($('#pName')?.value || '').trim();
      const categoryId = $('#pCategory')?.value || '';
      const price = $('#pPrice')?.value || '0';
      const showPrice = $('#pShowPrice')?.checked ? '1' : '0';
      const description = ($('#pDesc')?.value || '').trim();
      const file = $('#pImage')?.files?.[0];

      if (!name) return alert('Podaj nazwę produktu.');
      if (!categoryId) return alert('Wybierz kategorię.');

      const fd = new FormData();
      fd.append('name', name);
      fd.append('category_id', categoryId);
      fd.append('price', price);
      fd.append('show_price', showPrice);
      fd.append('description', description);

      if (file) fd.append('image', file);

      try {
        await api('/api/products', {
          method: 'POST',
          body: fd
        });

        if ($('#pName')) $('#pName').value = '';
        if ($('#pPrice')) $('#pPrice').value = '';
        if ($('#pDesc')) $('#pDesc').value = '';
        if ($('#pImage')) $('#pImage').value = '';
        if ($('#pShowPrice')) $('#pShowPrice').checked = true;

        await reloadProducts();
        alert('Dodano produkt.');
      } catch (err) {
        console.error(err);
        alert('Nie udało się dodać produktu.');
      }
    });

    $('#productsList')?.addEventListener('click', async e => {
      const delBtn = e.target.closest('button[data-action="delete"]');
      const tgl = e.target.closest('input[data-action="togglePrice"]');

      if (delBtn) {
        const id = delBtn.dataset.id;

        if (!confirm('Usunąć ten produkt?')) return;

        try {
          await api(`/api/products/${id}`, { method: 'DELETE' });
          await reloadProducts();
        } catch (err) {
          console.error(err);
          alert('Nie udało się usunąć produktu.');
        }
      }

      if (tgl) {
        const id = tgl.dataset.id;

        try {
          await api(`/api/products/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ show_price: tgl.checked ? 1 : 0 })
          });

          await reloadProducts();
        } catch (err) {
          console.error(err);
          alert('Nie udało się zmienić widoczności ceny.');
        }
      }
    });

    $('#searchProducts')?.addEventListener('input', e => {
      renderProducts(e.target.value);
    });

    $('#sortProducts')?.addEventListener('change', e => {
      currentSort = e.target.value;
      renderProducts($('#searchProducts')?.value || '');
    });

    $('#addCatBtn')?.addEventListener('click', async () => {
      const name = ($('#catName')?.value || '').trim();

      if (!name) return alert('Podaj nazwę kategorii.');

      try {
        await api('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });

        if ($('#catName')) $('#catName').value = '';

        await reloadCategories();
        alert('Dodano kategorię.');
      } catch (err) {
        console.error(err);
        alert('Nie udało się dodać kategorii. Możliwe, że już istnieje.');
      }
    });

    $('#catList')?.addEventListener('click', async e => {
      const btn = e.target.closest('button.btn-del');
      if (!btn) return;

      const id = btn.dataset.catId;

      if (!confirm('Usunąć kategorię? Produkty z tej kategorii mogą zostać bez kategorii.')) return;

      try {
        await api(`/api/categories/${id}`, { method: 'DELETE' });
        await reloadCategories();
        await reloadProducts();
      } catch (err) {
        console.error(err);
        alert('Nie udało się usunąć kategorii.');
      }
    });

    $('#addBannerBtn')?.addEventListener('click', async () => {
      const file = $('#bImage')?.files?.[0];
      const linkUrl = ($('#bLink')?.value || '').trim();
      const sortOrder = $('#bSort')?.value || '0';
      const active = $('#bActive')?.checked ? '1' : '0';

      if (!file) return alert('Wybierz obraz banera.');

      const fd = new FormData();
      fd.append('image', file);
      fd.append('link_url', linkUrl);
      fd.append('sort_order', sortOrder);
      fd.append('active', active);

      try {
        await api('/api/banners', {
          method: 'POST',
          body: fd
        });

        resetBannerForm();
        await reloadBanners();
        alert('Dodano baner.');
      } catch (err) {
        console.error(err);
        alert('Nie udało się dodać banera.');
      }
    });

    $('#bannersList')?.addEventListener('click', async e => {
      const editBtn = e.target.closest('button[data-action="editBanner"]');
      const deleteBtn = e.target.closest('button[data-action="deleteBanner"]');

      if (editBtn) {
        const id = Number(editBtn.dataset.id);
        const banner = cachedBanners.find(b => Number(b.id) === id);
        if (!banner) return;

        editingBannerId = id;

        if ($('#bLink')) $('#bLink').value = banner.link_url || '';
        if ($('#bSort')) $('#bSort').value = banner.sort_order ?? 0;
        if ($('#bActive')) $('#bActive').checked = Number(banner.active) === 1;
        if ($('#bImage')) $('#bImage').value = '';

        if ($('#addBannerBtn')) $('#addBannerBtn').style.display = 'none';
        if ($('#saveBannerBtn')) $('#saveBannerBtn').style.display = 'inline-block';
        if ($('#cancelBannerEditBtn')) $('#cancelBannerEditBtn').style.display = 'inline-block';

        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (deleteBtn) {
        const id = deleteBtn.dataset.id;

        if (!confirm('Usunąć ten baner?')) return;

        try {
          await api(`/api/banners/${id}`, { method: 'DELETE' });
          await reloadBanners();
        } catch (err) {
          console.error(err);
          alert('Nie udało się usunąć banera.');
        }
      }
    });

    $('#saveBannerBtn')?.addEventListener('click', async () => {
      if (!editingBannerId) return;

      const file = $('#bImage')?.files?.[0];
      const linkUrl = ($('#bLink')?.value || '').trim();
      const sortOrder = $('#bSort')?.value || '0';
      const active = $('#bActive')?.checked ? '1' : '0';

      const fd = new FormData();
      fd.append('link_url', linkUrl);
      fd.append('sort_order', sortOrder);
      fd.append('active', active);

      if (file) fd.append('image', file);

      try {
        await api(`/api/banners/${editingBannerId}`, {
          method: 'PATCH',
          body: fd
        });

        resetBannerForm();
        await reloadBanners();
        alert('Zapisano baner.');
      } catch (err) {
        console.error(err);
        alert('Nie udało się zapisać banera.');
      }
    });

    $('#cancelBannerEditBtn')?.addEventListener('click', resetBannerForm);

    try {
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const me = await meRes.json();
        if ($('#admEmail')) $('#admEmail').value = me.email || '';
      }
    } catch {}

    $('#saveAdmin')?.addEventListener('click', async () => {
      const email = ($('#admEmail')?.value || '').trim();
      const password = $('#admPass')?.value || '';

      if (!email) return alert('Podaj e-mail administratora.');

      try {
        await api('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        if ($('#admPass')) $('#admPass').value = '';
        alert('Zapisano ustawienia administratora.');
      } catch (err) {
        console.error(err);
        alert('Nie udało się zapisać ustawień.');
      }
    });
  }

function initRouter() {
  initMobileMenu();

  if (has('loginBtn')) {
    initLoginPage();
    return;
  }

  if (has('productsList')) {
    initAdminPage();
    return;
  }

  setFooterYear();
}

  document.addEventListener('DOMContentLoaded', initRouter);
})();
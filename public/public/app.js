import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCYqtsAfvKIXSb0NJwfkR6qSVibDXrRCn8',
  authDomain: 'devamsizliktakip-98cc3.firebaseapp.com',
  projectId: 'devamsizliktakip-98cc3',
  storageBucket: 'devamsizliktakip-98cc3.firebasestorage.app',
  messagingSenderId: '825327656249',
  appId: '1:825327656249:web:c10cd8cd35c11d35741ce8'
};

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore();
const codes = ['A1', 'A2', 'B1', 'B2'];
const names = { A1: 'Foundation', A2: 'Progress', B1: 'Bridge', B2: 'Summit' };
const lessonPlan = { 7: 140, 8: 160 };
const state = { user: null, avatar: '', activePage: 'tracker' };
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function emptyModules() {
  return Object.fromEntries(codes.map((code) => [code, { lessons: 0, weeks: '', absences: 0 }]));
}
function userEmail(username) { return username + '@lau-track.app'; }
function username(value) { return String(value || '').trim().toLowerCase(); }
function validUsername(value) { return /^[a-z0-9_.-]{3,28}$/.test(value); }
function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function initials() {
  const profile = state.user?.profile || {};
  return ((profile.firstName || state.user?.username || 'L')[0] || 'L') + ((profile.lastName || '')[0] || '');
}
function avatarMarkup(className) {
  const avatar = state.user?.profile?.avatar;
  return '<div class="' + className + '">' + (avatar ? '<img src="' + avatar + '" alt="Profil görseli">' : initials().toUpperCase()) + '</div>';
}
function summary(modules) {
  const items = Object.values(modules || {});
  const lessons = items.reduce((total, item) => total + Number(item.lessons || 0), 0);
  const absences = items.reduce((total, item) => total + Number(item.absences || 0), 0);
  return { lessons, absences, attendance: lessons ? Math.max(0, ((lessons - absences) / lessons) * 100) : null };
}
function plansComplete(modules) {
  return codes.every((code) => {
    const item = modules?.[code];
    return item && [7, 8].includes(Number(item.weeks)) && Number(item.lessons) > 0;
  });
}
function annual() {
  const data = summary(state.user?.modules);
  const ready = plansComplete(state.user?.modules);
  return { ...data, ready, attendance: ready ? data.attendance : null };
}
function rate(value) { return value === null ? '—' : '%' + value.toFixed(1).replace('.', ','); }
function status(value, ready) {
  if (!ready) return { label: '4 MODÜL BEKLİYOR', cls: 'status-warn' };
  if (value >= 80) return { label: 'KANAAT İÇİN UYGUN', cls: 'status-good' };
  if (value >= 70) return { label: 'DEVAM EŞİĞİ TAMAM', cls: 'status-warn' };
  return { label: 'RİSKTE', cls: 'status-risk' };
}
function message(selector, text = '', success = false) {
  const target = $(selector);
  target.textContent = text;
  target.classList.toggle('success', success);
}
function toast(text) {
  let item = $('.toast');
  if (!item) {
    item = document.createElement('div');
    item.className = 'toast';
    document.body.append(item);
  }
  item.textContent = text;
  item.classList.add('show');
  clearTimeout(item.timer);
  item.timer = setTimeout(() => item.classList.remove('show'), 3300);
}
function errorText(error) {
  const errors = {
    'auth/email-already-in-use': 'Bu kullanıcı adı kullanılıyor.',
    'auth/weak-password': 'Şifre en az 8 karakter olmalı.',
    'auth/invalid-credential': 'Kullanıcı adı veya şifre hatalı.',
    'auth/invalid-email': 'Kullanıcı adı geçersiz.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
    'permission-denied': 'Veri izni henüz ayarlanmadı. Firebase kurulum adımını tamamla.'
  };
  return errors[error?.code] || errors[error?.message] || 'Bir şeyler ters gitti. Tekrar dene.';
}

function renderSidebar() {
  const profile = state.user.profile || {};
  $('#sidebar-profile').innerHTML = avatarMarkup('avatar') + '<div><span class="sidebar-name">' + escapeHtml(profile.firstName || state.user.username) + '</span><span class="sidebar-handle">@' + escapeHtml(state.user.username) + '</span></div>';
}
function renderSummary() {
  const data = annual();
  const stateStatus = status(data.attendance, data.ready);
  const note = data.ready ? '4 modülün yıllık toplamına göre' : 'Önce A1, A2, B1 ve B2’yi ayarla';
  $('#summary-cards').innerHTML =
    '<article class="metric-card primary-metric"><span class="metric-label">YILLIK DEVAM ORANI</span><strong class="metric-value">' + rate(data.attendance) + '</strong><span class="metric-note">' + note + '</span><b class="metric-status ' + stateStatus.cls + '">' + stateStatus.label + '</b></article>' +
    '<article class="metric-card"><span class="metric-label">TOPLAM İŞLENEN DERS</span><strong class="metric-value">' + (data.lessons || '—') + '</strong><span class="metric-note">A1’den B2’ye yıl geneli</span></article>' +
    '<article class="metric-card"><span class="metric-label">TOPLAM DEVAMSIZLIK</span><strong class="metric-value">' + (data.absences || '0') + '</strong><span class="metric-note">Girdiğin tüm yoklamalar</span></article>';
}
function updateCard(card) {
  const lessons = Math.max(0, Number($('.lessons', card).value) || 0);
  const absences = Math.max(0, Number($('.absences', card).value) || 0);
  const weeks = $('.weeks', card).value;
  const set = weeks === '7' || weeks === '8';
  const moduleRate = lessons ? Math.max(0, ((lessons - absences) / lessons) * 100) : 0;
  $('.module-weeks', card).textContent = set ? weeks + ' HAFTA' : 'PLAN BEKLENİYOR';
  $('.module-meter span', card).style.width = set && lessons ? moduleRate + '%' : '0%';
  $('.module-meter span', card).style.background = moduleRate >= 70 || !lessons ? 'linear-gradient(90deg,var(--electric),var(--violet))' : 'linear-gradient(90deg,var(--danger),var(--amber))';
  if (!set) $('.module-foot', card).textContent = 'Önce bu modülün 7 veya 8 hafta süreceğini seç.';
  else if (!lessons) $('.module-foot', card).textContent = 'Başlangıç ders sayısı otomatik gelecek; sonra iptal edilen dersleri düşebilirsin.';
  else $('.module-foot', card).textContent = lessons + ' derste ' + absences + ' devamsızlık · Modül devamın %' + moduleRate.toFixed(1).replace('.', ',');
}
function renderModules() {
  const grid = $('#module-grid');
  const template = $('#module-template');
  grid.innerHTML = '';
  for (const code of codes) {
    const data = state.user.modules?.[code] || { lessons: 0, weeks: '', absences: 0 };
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.module = code;
    $('.module-code', card).textContent = code;
    $('h3', card).textContent = names[code];
    $('.lessons', card).value = data.lessons || '';
    $('.weeks', card).value = String(data.weeks || '');
    $('.absences', card).value = data.absences || '';
    grid.append(card);
    updateCard(card);
  }
}
function collectModules() {
  const modules = {};
  $$('.module-card').forEach((card) => {
    modules[card.dataset.module] = {
      lessons: Math.max(0, Number($('.lessons', card).value) || 0),
      weeks: Number($('.weeks', card).value) || 0,
      absences: Math.max(0, Number($('.absences', card).value) || 0)
    };
  });
  return modules;
}
function previewModules() {
  state.user.modules = collectModules();
  $$('.module-card').forEach(updateCard);
  renderSummary();
}
function setStartingLessons(card) {
  $('.lessons', card).value = lessonPlan[Number($('.weeks', card).value)] || '';
}
function renderProfile() {
  const profile = state.user.profile || {};
  $('#avatar-preview').outerHTML = avatarMarkup('avatar-large').replace('class="avatar-large"', 'id="avatar-preview" class="avatar-large"');
  const form = $('#profile-form');
  form.firstName.value = profile.firstName || '';
  form.lastName.value = profile.lastName || '';
  form.birthDate.value = profile.birthDate || '';
  form.department.value = profile.department || '';
  state.avatar = profile.avatar || '';
  $('#admin-entry').innerHTML = state.user.role === 'admin'
    ? '<div class="admin-panel"><h3>Yönetici alanı</h3><p>Kayıtlı öğrencilerin yıllık devamsızlık özetlerini görüntüleyebilirsin.</p><button id="open-admin" class="button" type="button">Yönetim panelini aç <span>→</span></button></div>'
    : '';
}
function showPage(page) {
  state.activePage = page;
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  $('#tracker-page').classList.toggle('hidden', page !== 'tracker');
  $('#profile-page').classList.toggle('hidden', page !== 'profile');
  if (page === 'profile') renderProfile();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderApp() {
  $('#auth-view').classList.add('hidden');
  $('#dashboard-view').classList.remove('hidden');
  renderSidebar();
  renderSummary();
  renderModules();
  showPage(state.activePage);
}

async function saveTracker() {
  const modules = collectModules();
  for (const [code, data] of Object.entries(modules)) {
    if (data.absences > data.lessons) return toast(code + ' modülünde devamsızlık ders sayısından büyük olamaz.');
  }
  const button = $('#save-tracker');
  button.disabled = true;
  button.textContent = 'Kaydediliyor…';
  try {
    await updateDoc(doc(db, 'users', state.user.id), { modules, updatedAt: serverTimestamp() });
    state.user.modules = modules;
    renderSummary();
    renderModules();
    toast(plansComplete(modules) ? 'Tüm modüller kaydedildi. Yıllık oran hazır.' : 'Modül bilgisi kaydedildi. Yıllık oran için dört modülü de ayarla.');
  } catch (error) {
    toast(errorText(error));
  } finally {
    button.disabled = false;
    button.innerHTML = 'Değişiklikleri kaydet <span>↗</span>';
  }
}
function profileFromForm(form, avatar = state.avatar) {
  return {
    firstName: String(form.firstName.value || '').trim().slice(0, 50),
    lastName: String(form.lastName.value || '').trim().slice(0, 50),
    birthDate: form.birthDate.value || '',
    department: String(form.department.value || '').trim().slice(0, 100),
    avatar
  };
}
async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  message('#profile-message');
  const profile = profileFromForm(form);
  try {
    await updateDoc(doc(db, 'users', state.user.id), { profile, updatedAt: serverTimestamp() });
    state.user.profile = profile;
    renderSidebar();
    renderProfile();
    message('#profile-message', 'Profilin buluta kaydedildi.', true);
    toast('Profilin güncellendi.');
  } catch (error) {
    message('#profile-message', errorText(error));
  }
}
function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Lütfen bir görsel dosyası seç.'));
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const attempts = [{ edge: 560, quality: 0.82 }, { edge: 460, quality: 0.74 }, { edge: 360, quality: 0.66 }, { edge: 280, quality: 0.56 }];
      let dataUrl = '';
      for (const attempt of attempts) {
        const scale = Math.min(1, attempt.edge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', attempt.quality);
        if (dataUrl.length <= 380000) break;
      }
      resolve(dataUrl);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Görsel okunamadı. Başka bir fotoğraf dene.')); };
    image.src = objectUrl;
  });
}
async function handleAvatar(file) {
  if (!file) return;
  try {
    toast('Profil fotoğrafı hazırlanıyor…');
    const avatar = await compressAvatar(file);
    state.avatar = avatar;
    $('#avatar-preview').outerHTML = '<div id="avatar-preview" class="avatar-large"><img src="' + avatar + '" alt="Profil ön izlemesi"></div>';
    toast('Fotoğraf hazır. Profilini kaydetmeyi unutma.');
  } catch (error) {
    toast(error.message || 'Fotoğraf eklenemedi.');
  }
}
async function loadAdmin() {
  const target = $('#admin-entry');
  target.innerHTML = '<div class="admin-panel"><p>Yönetim verileri yükleniyor…</p></div>';
  try {
    const snapshots = await getDocs(collection(db, 'users'));
    const users = snapshots.docs.map((item) => ({ id: item.id, ...item.data() }));
    const absences = users.reduce((total, user) => total + summary(user.modules).absences, 0);
    const list = users.map((user) => {
      const data = summary(user.modules);
      const complete = plansComplete(user.modules);
      const profile = user.profile || {};
      return '<article class="admin-user"><div><strong>' + escapeHtml(profile.firstName || user.username || 'İsimsiz') + ' ' + escapeHtml(profile.lastName || '') + '</strong><small>@' + escapeHtml(user.username || '') + ' · ' + escapeHtml(profile.department || 'Profil bilgisi yok') + '</small></div><span class="admin-abs">' + data.absences + ' dev.</span><span class="admin-rate">' + (complete ? rate(data.attendance) : 'Plan eksik') + '</span></article>';
    }).join('');
    target.innerHTML = '<div class="admin-drawer"><div class="admin-stats"><div class="admin-stat"><span>TOPLAM HESAP</span><strong>' + users.length + '</strong></div><div class="admin-stat"><span>TOPLAM DEVAMSIZLIK</span><strong>' + absences + '</strong></div></div><div class="admin-list">' + list + '</div></div>';
  } catch (error) {
    target.innerHTML = '<div class="admin-panel"><p>' + escapeHtml(errorText(error)) + '</p></div>';
  }
}
function openLegal() { $('#legal-modal').showModal(); }

function bindEvents() {
  $$('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item === button));
    $('#login-form').classList.toggle('hidden', button.dataset.authTab !== 'login');
    $('#register-form').classList.toggle('hidden', button.dataset.authTab !== 'register');
    message('#auth-message');
  }));
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    message('#auth-message');
    const form = event.currentTarget;
    const loginName = username(form.username.value);
    if (!validUsername(loginName)) return message('#auth-message', 'Kullanıcı adı 3–28 karakter olmalı.');
    try {
      await signInWithEmailAndPassword(auth, userEmail(loginName), form.password.value);
    } catch (error) {
      message('#auth-message', errorText(error));
    }
  });
  $('#register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    message('#auth-message');
    const form = event.currentTarget;
    const loginName = username(form.username.value);
    const password = form.password.value;
    const profile = profileFromForm(form, '');
    if (!form.legalAccepted.checked) return message('#auth-message', 'Hesap açmak için yasal bilgilendirme onayı gerekli.');
    if (!validUsername(loginName)) return message('#auth-message', 'Kullanıcı adı 3–28 karakter olmalı.');
    if (password.length < 8) return message('#auth-message', 'Şifre en az 8 karakter olmalı.');
    if (!profile.firstName || !profile.lastName || !profile.birthDate || !profile.department) return message('#auth-message', 'Lütfen tüm kişisel bilgileri doldur.');
    try {
      const result = await createUserWithEmailAndPassword(auth, userEmail(loginName), password);
      await setDoc(doc(db, 'users', result.user.uid), { username: loginName, role: 'student', legalAcceptedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), profile, modules: emptyModules() });
    } catch (error) {
      message('#auth-message', errorText(error));
    }
  });
  $('#logout').addEventListener('click', () => signOut(auth));
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
  $('#save-tracker').addEventListener('click', saveTracker);
  $('#module-grid').addEventListener('input', previewModules);
  $('#module-grid').addEventListener('change', (event) => {
    const card = event.target.closest('.module-card');
    if (card && event.target.matches('.weeks')) setStartingLessons(card);
    previewModules();
  });
  $('#profile-form').addEventListener('submit', saveProfile);
  $('#avatar-input').addEventListener('change', (event) => handleAvatar(event.target.files[0]));
  $('#remove-avatar').addEventListener('click', () => {
    state.avatar = '';
    $('#avatar-preview').outerHTML = '<div id="avatar-preview" class="avatar-large">' + initials() + '</div>';
  });
  $('#open-legal').addEventListener('click', openLegal);
  $('#open-legal-2').addEventListener('click', openLegal);
  $('.modal-close').addEventListener('click', () => $('#legal-modal').close());
  $('.modal-accept').addEventListener('click', () => $('#legal-modal').close());
  $('#legal-modal').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $('#admin-entry').addEventListener('click', (event) => { if (event.target.closest('#open-admin')) loadAdmin(); });
}
function boot() {
  bindEvents();
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      state.user = null;
      $('#dashboard-view').classList.add('hidden');
      $('#auth-view').classList.remove('hidden');
      return;
    }
    try {
      const profile = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!profile.exists()) throw new Error('permission-denied');
      state.user = { id: firebaseUser.uid, ...profile.data() };
      $('#sync-state').textContent = '● Firebase senkronu açık';
      renderApp();
    } catch (error) {
      await signOut(auth);
      message('#auth-message', errorText(error));
    }
  });
}
boot();

# LAÜ Devamsızlık Takip

Lefke Avrupa Üniversitesi hazırlık öğrencileri için dört modüllü (A1, A2, B1, B2) kişisel devamsızlık takip uygulaması.

## Çalıştırma

Node.js 18 veya üzeri yüklüyken:

```powershell
npm start
```

Uygulama `http://localhost:3000` adresinde açılır. Her hesap, devamsızlık verisi ve profil bilgisi sunucudaki `data/database.json` içinde tutulur. Bu klasör `.gitignore` içindedir; kişisel verileri GitHub'a yüklemez.

## İlk yönetici hesabı

İlk açılışta şu yönetici hesabı otomatik oluşturulur:

- Kullanıcı adı: `adminbero`
- Şifre: `alibeyköy`

Yayınlamadan önce bu parolayı ortam değişkenleriyle değiştirmen gerekir:

```powershell
$env:ADMIN_USERNAME="adminbero"
$env:ADMIN_PASSWORD="çok-güçlü-ve-özel-bir-şifre"
npm start
```

Bu değişkenler yalnızca ilk veritabanı oluşturulurken ilk yönetici hesabını belirler. Oluşmuş bir hesabın parolasını değiştirmek için yeni bir veri deposuyla başlamak yerine, ileride parola değiştirme ekranı eklenmelidir.

## GitHub ve çoklu cihaz kullanımı

Bu repo GitHub'a güvenle yüklenebilir; ancak **GitHub Pages yalnızca statik dosya sunar** ve kullanıcı hesabı/veri senkronizasyonu için uygun değildir. Çoklu cihaz senkronizasyonunun çalışması için bu Node uygulamasını kalıcı disk sunan bir Node barındırma hizmetine (ör. Render, Railway veya kendi sunucun) dağıtmalı ve `data/` klasörünü kalıcı bir volume'a bağlamalısın.

Dağıtımda şu ayarları kullan:

- Build command: boş bırakılabilir
- Start command: `npm start`
- Node sürümü: 18+
- Kalıcı disk bağlama noktası: `/app/data` (ve `DATA_DIR=/app/data` ortam değişkeni)
- `ADMIN_PASSWORD`: güçlü ve gizli bir değer

Bu yapı sayesinde kullanıcılar aynı alan adına telefon, tablet ve bilgisayardan girdiklerinde aynı hesap ve devamsızlık kayıtlarını görür.

## Güvenlik notu

Parolalar PBKDF2-SHA-256 ile sunucuda özetlenir; tarayıcıya veya JSON yanıtlarına gönderilmez. Oturum çerezi `HttpOnly` ve `SameSite=Lax` ayarlarıyla tutulur. Uygulama resmi üniversite yoklama sistemi değildir; ekrandaki yasal metin, hesap kurulmadan önce kabul edilmelidir.

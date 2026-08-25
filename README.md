# Cosmetics POS

نظام إدارة مبيعات ومخزون لمحل تجميل واحد + مخزن (أو أكثر لاحقاً). يعمل **بدون إنترنت** على Windows.

## التشغيل للتطوير

المتطلبات على جهاز المطوّر فقط: Node.js 20+ و Rust (MSVC).

```powershell
subst B: "C:\Users\Wateen&Taleen\Desktop\beautyshop"
cd B:\
npm install
npm run tauri dev
```

> إن كان اسم المستخدم يحتوي `&` استخدم `subst` كما أعلاه حتى لا ينكسر npm/cargo.

## الإنتاج

```powershell
npm run tauri build
```

المثبّت: NSIS في `src-tauri/target/release/bundle/nsis/`  
بيانات المستخدم: `%APPDATA%\CosmeticsPOS\` (لا تُحذف مع إلغاء التثبيت افتراضياً).

الحد الأدنى المدعوم: **Windows 10 1809+** مع WebView2. المثبّت يضم WebView2 bootstrapper.

## توثيق

- `docs/ARCHITECTURE.md`
- `docs/SCHEMA.md`
- `docs/PROGRESS.md`
- `docs/USER_GUIDE.ar.md`

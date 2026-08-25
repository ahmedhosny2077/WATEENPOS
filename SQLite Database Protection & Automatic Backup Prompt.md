# SQLite Database Protection & Automatic Backup — Production-Ready Prompt

أريد منك تنفيذ مراجعة وتطوير شاملة لطبقة قاعدة البيانات **SQLite** في برنامجي، وجعلها **Production-Ready** قدر الإمكان، مع التركيز بشكل خاص على حماية قاعدة البيانات من التلف بسبب:

- انقطاع الكهرباء
- إغلاق البرنامج بشكل مفاجئ
- توقف Windows
- Crash للتطبيق
- Kill Process
- أخطاء القرص
- عمليات الكتابة غير المكتملة
- تشغيل أكثر من نسخة من البرنامج
- تلف أو فقدان ملفات WAL

لا أريد مجرد إضافة Backup عادي، بل أريد بناء **نظام متكامل لإدارة SQLite وحمايتها واستعادتها**.

---

## 1. تحليل قاعدة البيانات الحالية

ابدأ أولاً بفحص المشروع بالكامل وتحديد:

- مكان ملف SQLite.
- طريقة إنشاء اتصال SQLite.
- جميع أماكن فتح وإغلاق الاتصالات.
- هل يتم استخدام Connection واحد أم Connections متعددة.
- جميع عمليات `INSERT`.
- جميع عمليات `UPDATE`.
- جميع عمليات `DELETE`.
- جميع Transactions.
- جميع عمليات إنشاء وتعديل الجداول.
- جميع عمليات Backup الحالية إن وجدت.
- هل توجد Threads أو Processes تستخدم قاعدة البيانات.
- هل توجد عمليات Async أو Background Tasks.
- هل توجد عمليات كتابة متزامنة.
- هل يتم إغلاق الاتصال بشكل صحيح عند إغلاق البرنامج.
- هل توجد عمليات يمكن أن تكتب إلى قاعدة البيانات أثناء إغلاق البرنامج.
- هل قاعدة البيانات موجودة داخل `Program Files`.
- هل التطبيق يحتاج Administrator Permission.
- هل قاعدة البيانات معرضة لأن تكون Read-Only.

بعد التحليل، عدّل الكود الحالي بدلاً من إنشاء نظام منفصل غير متوافق مع المشروع.

---

# 2. SQLite PRAGMA Configuration

اضبط SQLite باستخدام أفضل الإعدادات المناسبة لتطبيق Desktop.

استخدم:

```sql
PRAGMA journal_mode=WAL;
```

واضبط:

```sql
PRAGMA synchronous=FULL;
```

إذا كان هناك سبب تقني قوي لاستخدام `NORMAL` بدلاً من `FULL`، وضّح السبب قبل تغييره.

استخدم:

```sql
PRAGMA foreign_keys=ON;
```

واضبط:

```sql
PRAGMA busy_timeout=5000;
```

واستخدم:

```sql
PRAGMA temp_store=MEMORY;
```

واضبط `cache_size` بشكل مناسب دون استهلاك مبالغ فيه للذاكرة.

قم بدراسة استخدام:

```sql
PRAGMA auto_vacuum=INCREMENTAL;
```

ولا تقم بتفعيل أي PRAGMA قد يؤدي إلى تقليل أمان البيانات فقط من أجل زيادة الأداء.

### الأولوية دائماً:

**Data Integrity > Reliability > Recovery > Performance**

---

# 3. حماية قاعدة البيانات من انقطاع الكهرباء

أريد حماية قاعدة البيانات قدر الإمكان في حالة:

- انقطاع الكهرباء أثناء `INSERT`.
- انقطاع الكهرباء أثناء `UPDATE`.
- انقطاع الكهرباء أثناء `DELETE`.
- إغلاق Windows فجأة.
- Crash للتطبيق.
- Kill Process.
- Force Close.
- إعادة تشغيل الجهاز أثناء الكتابة.

استخدم Transactions بشكل صحيح.

أي عملية تحتوي على أكثر من عملية Database يجب أن تكون داخل Transaction واحدة.

استخدم:

```text
BEGIN
...
COMMIT
```

وفي حالة الخطأ:

```text
ROLLBACK
```

تأكد من أن عمليات الكتابة المهمة Atomic قدر الإمكان.

لا تستخدم Autocommit بطريقة تؤدي إلى عمليات كتابة غير آمنة.

---

# 4. Connection Management

أنشئ طبقة مركزية لإدارة SQLite Connection بدلاً من فتح Connections بطريقة عشوائية في أنحاء المشروع.

يجب أن توفر الطبقة:

- Connection creation.
- Connection closing.
- Transaction management.
- Error handling.
- Retry عند `database locked`.
- Busy timeout.
- Foreign keys.
- WAL verification.
- Integrity checking.

ويجب أن يتم إغلاق Connections بشكل صحيح عند:

- إغلاق التطبيق.
- Shutdown.
- Exception.
- العمليات الحرجة.

إذا كان التطبيق يستخدم Threads، فلا تشارك Connection واحدة بين Threads بطريقة غير آمنة.

---

# 5. منع Database Locked

عالج مشكلة:

```text
database is locked
```

بشكل احترافي.

استخدم:

- `busy_timeout`
- Retry mechanism.
- Exponential backoff عند الحاجة.
- Transactions قصيرة.
- عدم إبقاء Connection مفتوحة أثناء عمليات غير Database.
- عدم تنفيذ عمليات طويلة داخل Transaction.

لكن لا تستخدم Retry بشكل أعمى.

إذا كان هناك Deadlock أو مشكلة حقيقية، يجب تسجيلها ومعالجتها.

---

# 6. WAL Management

إذا تم استخدام WAL Mode، تعامل مع الملفات:

```text
database.sqlite
database.sqlite-wal
database.sqlite-shm
```

بشكل صحيح.

لا تقم أبداً بنسخ ملف SQLite الرئيسي فقط أثناء وجود WAL نشط بطريقة قد تنتج نسخة Backup غير مكتملة.

استخدم:

- SQLite Online Backup API
- أو آلية Backup آمنة ومتوافقة مع WAL.

يجب أن يكون Backup:

- Consistent.
- Recoverable.
- Valid.

---

# 7. نظام Backup تلقائي

أنشئ نظام Backup تلقائي متعدد المستويات.

أريد على الأقل:

### Automatic Backup

- Backup عند تشغيل البرنامج إذا كان مناسباً.
- Backup دوري أثناء التشغيل.
- Backup عند إغلاق البرنامج.
- Backup قبل Database Migration.
- Backup قبل أي عملية خطرة على البيانات.

لكن لا تجعل Backup المتكرر يؤثر بشكل واضح على أداء البرنامج.

---

# 8. Backup Rotation

لا تحتفظ بعدد لا نهائي من النسخ.

أنشئ نظام Rotation مثل:

- آخر 10 نسخ يومية.
- آخر 4 نسخ أسبوعية.
- آخر 12 نسخة شهرية.

ويجب أن تكون هذه القيم قابلة للتعديل من Settings.

مثال:

```text
backup/
├── daily/
├── weekly/
├── monthly/
└── emergency/
```

مثال اسم Backup:

```text
backup_2026-08-24_13-30-15.sqlite
```

كل Backup يجب أن يحتوي على:

- التاريخ.
- الوقت.
- إصدار البرنامج.
- إصدار Schema Database.
- حجم الملف.
- نوع Backup.

---

# 9. Backup أثناء استخدام البرنامج

يجب أن يعمل Backup بدون إيقاف البرنامج.

استخدم SQLite Online Backup API أو أفضل آلية متوافقة مع SQLite.

لا تستخدم:

```text
copy database.sqlite backup.sqlite
```

بشكل مباشر أثناء تشغيل البرنامج إذا كان ذلك قد يؤدي إلى نسخة غير متناسقة.

يجب أن يكون Backup:

- Consistent.
- Atomic.
- Recoverable.

---

# 10. التحقق من صحة Backup

بعد إنشاء كل Backup مهم، نفذ Integrity Check.

استخدم:

```sql
PRAGMA integrity_check;
```

ويمكن أيضاً استخدام:

```sql
PRAGMA quick_check;
```

عند الحاجة.

لا تعتبر Backup ناجحاً بمجرد إنشاء الملف.

يجب التحقق من:

- وجود الملف.
- حجمه.
- إمكانية فتحه.
- إمكانية تنفيذ Query عليه.
- Integrity Check.
- وجود الجداول الأساسية.

إذا فشل Backup:

- لا تحذف النسخة السابقة.
- سجل الخطأ.
- أظهر تحذيراً للمستخدم إذا كان الخطأ مهماً.
- حاول إعادة Backup إذا كان ذلك آمناً.

---

# 11. اختبار الاستعادة Restore

أنشئ نظام Restore آمن.

عند استعادة Backup:

1. أغلق جميع عمليات Database.
2. تأكد من عدم وجود Transactions مفتوحة.
3. أنشئ Backup طوارئ من قاعدة البيانات الحالية.
4. لا تستبدل قاعدة البيانات الأصلية مباشرة.
5. استعد Backup إلى ملف مؤقت.
6. نفذ Integrity Check.
7. تحقق من Schema.
8. تحقق من الجداول الأساسية.
9. إذا نجح التحقق فقط، استبدل قاعدة البيانات الحالية.
10. احتفظ بالنسخة القديمة في Emergency Backup.

يجب ألا يؤدي Backup تالف إلى تدمير قاعدة البيانات الحالية.

---

# 12. Emergency Backup

قبل أي عملية قد تغير البيانات بشكل واسع مثل:

- Database Migration.
- تحديث Schema.
- استيراد بيانات ضخمة.
- حذف جماعي.
- ترقية البرنامج.

أنشئ:

```text
Emergency Backup
```

ولا تحذفه تلقائياً إلا وفق سياسة واضحة.

---

# 13. حماية من تلف قاعدة البيانات

أضف آلية لاكتشاف Database Corruption.

عند تشغيل البرنامج:

- تحقق من وجود Database.
- تحقق من إمكانية فتحها.
- نفذ Quick Check بشكل دوري.
- نفذ Integrity Check بشكل أعمق حسب الجدول الزمني.
- تحقق من الجداول الأساسية.
- تحقق من Schema Version.

إذا اكتشفت مشكلة:

لا تبدأ بإصلاح عشوائي.

أظهر للمستخدم:

> تم اكتشاف مشكلة محتملة في قاعدة البيانات. سيتم إنشاء نسخة احتياطية قبل محاولة الاستعادة.

ثم:

1. Backup للملف الحالي.
2. تسجيل الخطأ.
3. محاولة Recovery فقط إذا كان ذلك آمناً.
4. إتاحة Restore من آخر Backup صالح.

---

# 14. Database Corruption Recovery

أنشئ Recovery Strategy متعددة المراحل.

الترتيب:

1. فتح قاعدة البيانات.
2. Quick Check.
3. Integrity Check.
4. Backup Current DB.
5. محاولة قراءة البيانات.
6. إذا فشلت:
   - Restore من آخر Backup صالح.
7. إذا فشل:
   - تجربة Backup أقدم.
8. عدم الكتابة فوق قاعدة البيانات الأصلية قبل التأكد من سلامة النسخة البديلة.

يجب ألا يكون هناك أي Recovery Process مدمر للبيانات.

---

# 15. Atomic File Replacement

عند استبدال Database:

لا تستخدم حذف الملف القديم ثم نسخ الملف الجديد فقط.

استخدم آلية Atomic Replacement مناسبة لنظام Windows قدر الإمكان.

الهدف:

إما أن تكون قاعدة البيانات القديمة موجودة بالكامل أو الجديدة موجودة بالكامل.

لا نريد حالة يكون فيها الملف:

```text
0 KB
```

أو ناقصاً بسبب انقطاع الكهرباء أثناء الاستبدال.

---

# 16. مكان تخزين قاعدة البيانات

راجع مكان تخزين SQLite.

لا تضع Database داخل:

```text
Program Files
```

إذا كان التطبيق يحتاج الكتابة إليها.

استخدم مساراً مناسباً مثل:

```text
%APPDATA%
```

أو:

```text
%PROGRAMDATA%
```

بحسب طبيعة التطبيق.

افصل:

```text
Application Files
User Data
Database
Backups
Logs
```

بحيث تكون البنية واضحة.

---

# 17. Logging

أنشئ نظام Logging خاص بقاعدة البيانات.

سجل:

- Database opened.
- Database closed.
- Backup started.
- Backup completed.
- Backup failed.
- Restore started.
- Restore completed.
- Restore failed.
- Integrity check.
- Corruption detection.
- Database locked.
- Transaction rollback.
- Migration.
- Recovery.

لكن لا تسجل بيانات حساسة مثل:

- كلمات المرور.
- بيانات بطاقات الدفع.
- Tokens.
- بيانات سرية.

---

# 18. التعامل مع إغلاق البرنامج

عند إغلاق البرنامج:

1. أوقف العمليات الخلفية التي تستخدم Database.
2. انتظر انتهاء العمليات المهمة.
3. Commit للعمليات الصحيحة.
4. Rollback للعمليات الفاشلة.
5. أغلق Connections.
6. نفذ Checkpoint مناسب للـ WAL إذا كان ذلك آمناً.
7. نفذ Backup عند الحاجة.
8. أغلق SQLite بشكل صحيح.

يجب منع إغلاق البرنامج أثناء عملية كتابة حساسة إذا كان ذلك ممكناً.

---

# 19. Crash Recovery

عند تشغيل البرنامج بعد إغلاق غير طبيعي:

اكتشف أن الإغلاق السابق لم يكن سليماً.

ثم:

- تحقق من Database.
- تحقق من WAL.
- نفذ Integrity Check عند الحاجة.
- تحقق من آخر Backup.
- سجل Crash Recovery Event.

لا تقم بعمل Restore تلقائي من Backup لمجرد أن البرنامج أغلق بشكل غير طبيعي.

أولاً تحقق من سلامة قاعدة البيانات الحالية.

---

# 20. Database Maintenance

أضف نظام صيانة دوري يشمل:

- Integrity Check.
- WAL Checkpoint.
- تحليل حجم Database.
- معرفة حجم WAL.
- معرفة حجم Backup.
- تنظيف النسخ القديمة.
- VACUUM عند الحاجة فقط.
- ANALYZE عند الحاجة.
- فحص Indexes.

لا تستخدم `VACUUM` بشكل متكرر لأنه قد يكون مكلفاً.

---

# 21. WAL Checkpoint

راقب حجم:

```text
database.sqlite-wal
```

إذا أصبح كبيراً بشكل غير طبيعي، نفذ Checkpoint مناسباً.

لا تقم بحذف ملف WAL يدوياً.

لا تقم بحذف:

```text
.sqlite-wal
.sqlite-shm
```

يدوياً أثناء تشغيل البرنامج.

---

# 22. Database Schema Versioning

أضف نظام Versioning لقاعدة البيانات.

مثلاً:

```text
schema_version
```

أو استخدم نظام Migration مناسب.

يجب أن يعرف التطبيق:

- Database Version.
- Application Version.
- آخر Migration تم تطبيقه.

قبل Migration:

```text
Emergency Backup
```

ثم Migration.

إذا فشل Migration:

- Rollback
- أو Restore آمن.

---

# 23. Settings داخل البرنامج

أضف صفحة:

# Database & Backup Settings

وتحتوي على:

## Database

- Database Location.
- Database Size.
- SQLite Version.
- Journal Mode.
- Synchronous Mode.
- Foreign Keys.
- Busy Timeout.
- WAL Status.

## Backup

- Enable Automatic Backup.
- Backup Frequency.
- Backup Location.
- Daily Retention.
- Weekly Retention.
- Monthly Retention.
- Backup on Exit.
- Backup before Migration.
- Backup before Major Operations.

## Maintenance

- Automatic Integrity Check.
- Quick Check Frequency.
- Full Integrity Check Frequency.
- WAL Checkpoint Policy.
- Automatic Cleanup.

## Recovery

- Last Successful Backup.
- Last Integrity Check.
- Database Health Status.
- Restore Database.
- Create Emergency Backup.
- Verify Backup.

---

# 24. Backup Location

اسمح للمستخدم بتغيير مكان النسخ الاحتياطي.

مثلاً:

```text
D:\PharmacyBackups
```

أو:

```text
External Drive
```

أو Network Folder إذا كان النظام يدعم ذلك.

لكن لا تجعل Backup داخل نفس مجلد Database فقط.

إذا تلف القرص الذي يحتوي على Database، يجب ألا تضيع كل النسخ الاحتياطية معه.

---

# 25. Backup Encryption

إذا كانت قاعدة البيانات تحتوي على بيانات حساسة، صمم النظام بحيث يمكن دعم Backup Encryption.

لا تخزن كلمات المرور أو مفاتيح التشفير داخل الكود.

إذا كان المشروع يحتاج تشفير SQLite نفسه، اشرح الخيارات المناسبة مثل:

- SQLCipher
- أو بديل مناسب.

مع توضيح أن:

**تشفير Backup يختلف عن تشفير Database أثناء التشغيل.**

---

# 26. Backup Integrity

أضف Checksum للنسخ الاحتياطية.

استخدم مثلاً:

```text
SHA-256
```

وسجل:

- Backup filename.
- SHA-256.
- Size.
- Creation time.
- Database version.

عند Restore:

تحقق من Checksum إذا كان متاحاً.

---

# 27. Automatic Backup Scheduler

إذا كان التطبيق يعمل لفترات طويلة، أنشئ Scheduler آمن.

مثلاً:

```text
Every 1 hour
```

أو:

```text
Every 6 hours
```

أو:

```text
Once per day
```

ويجب ألا يبدأ Backup جديد إذا كان Backup سابق ما زال يعمل.

استخدم Lock لمنع:

- Backup متزامن.
- Restore أثناء Backup.
- Maintenance أثناء Restore.

---

# 28. Multiple Instances

إذا قام المستخدم بتشغيل البرنامج مرتين، لا تسمح للبرنامجين بالتسبب في تلف البيانات.

أضف Single Instance Lock إذا كان ذلك مناسباً للتطبيق.

أو قم بإدارة Multiple SQLite Connections/Processes بشكل آمن.

يجب معالجة:

```text
database locked
```

وعدم السماح بعمليات متعارضة غير آمنة.

---

# 29. حماية من الحذف العرضي

أضف تأكيدات للعمليات الحساسة:

- Delete All.
- Reset Database.
- Restore.
- Replace Database.
- Import Large Dataset.

وقبل العمليات الخطرة:

```text
Automatic Emergency Backup
```

---

# 30. اختبار النظام

بعد تنفيذ كل شيء، لا تكتفِ بتعديل الكود.

اختبر السيناريوهات التالية:

- [ ] INSERT ثم إغلاق البرنامج.
- [ ] UPDATE ثم إغلاق البرنامج.
- [ ] DELETE ثم إغلاق البرنامج.
- [ ] إغلاق البرنامج بالقوة.
- [ ] Kill Process.
- [ ] Restart Windows.
- [ ] انقطاع الكهرباء أثناء الكتابة.
- [ ] انقطاع الكهرباء أثناء Backup.
- [ ] Database Locked.
- [ ] Backup تالف.
- [ ] Restore Backup.
- [ ] Restore Backup قديم.
- [ ] Database Corruption.
- [ ] WAL موجود عند تشغيل البرنامج.
- [ ] تشغيل البرنامج مرتين.
- [ ] Migration فاشل.
- [ ] Backup Disk Full.
- [ ] Backup Folder غير قابل للكتابة.
- [ ] Database Read-Only.
- [ ] وجود آلاف السجلات.
- [ ] Database كبيرة الحجم.
- [ ] Backup أثناء استخدام المستخدم للنظام.

يجب التأكد أن البيانات لا تضيع في هذه الحالات قدر الإمكان.

---

# 31. لا تستخدم حلولاً خطرة

ممنوع تنفيذ أي من التالي:

- حذف Database تلقائياً عند حدوث خطأ.
- حذف WAL يدوياً.
- نسخ SQLite file بشكل غير آمن أثناء التشغيل.
- Restore تلقائي بدون إنشاء Emergency Backup.
- VACUUM بشكل عشوائي ومتكرر.
- تجاهل Database Locked.
- تجاهل Integrity Check.
- إخفاء أخطاء Database.
- تخزين Database داخل Program Files إذا كان ذلك يسبب مشاكل صلاحيات.
- استخدام `PRAGMA synchronous=OFF` في تطبيق يحتاج أعلى مستوى من سلامة البيانات.
- حذف النسخ القديمة قبل التأكد من نجاح Backup الجديد.

---

# 32. الأولويات

رتب النظام بهذا الشكل:

1. **Data Integrity**
2. **Data Recovery**
3. **Backup Reliability**
4. **Crash Safety**
5. **Power Loss Protection**
6. **Security**
7. **Maintainability**
8. **Performance**
9. **Disk Space Optimization**

لا تضحي بسلامة البيانات من أجل زيادة الأداء.

---

# 33. المطلوب منك أثناء التنفيذ

لا تقم بإعطائي شرحاً نظرياً فقط.

أريد منك:

1. فحص المشروع الحالي.
2. تحديد مشاكل SQLite الموجودة.
3. تحديد الملفات التي تحتاج تعديل.
4. تنفيذ التعديلات فعلياً.
5. إنشاء Database Manager مركزي إذا كان ذلك مناسباً.
6. إنشاء Backup Manager.
7. إنشاء Recovery Manager.
8. إنشاء Integrity Checker.
9. إنشاء Logging مناسب.
10. إنشاء Settings الخاصة بقاعدة البيانات والنسخ الاحتياطي.
11. ربط النظام بالكامل بالبرنامج الحالي.
12. الحفاظ على جميع وظائف البرنامج الحالية.
13. عدم تغيير تصميم البرنامج أو وظائفه بدون سبب.
14. عدم حذف أي بيانات موجودة.
15. عدم إنشاء Database جديدة بدلاً من الحالية بدون ضرورة.
16. الحفاظ على توافق البيانات الحالية.

---

# 34. معايير النجاح

اعتبر المهمة ناجحة فقط إذا:

- [ ] SQLite يعمل بـ WAL عندما يكون مناسباً.
- [ ] `synchronous` مضبوط على إعداد آمن.
- [ ] Foreign Keys مفعلة.
- [ ] Busy Timeout موجود.
- [ ] Transactions آمنة.
- [ ] Connections تتم إدارتها مركزياً.
- [ ] Backup يتم تلقائياً.
- [ ] Backup يتم بطريقة آمنة ومتوافقة مع WAL.
- [ ] Backup يتم التحقق من سلامته.
- [ ] يوجد Backup Rotation.
- [ ] يوجد Emergency Backup.
- [ ] يوجد Restore آمن.
- [ ] يوجد Integrity Check.
- [ ] يوجد Crash Recovery.
- [ ] يوجد Database Health Check.
- [ ] يوجد Logging.
- [ ] يوجد Database Maintenance.
- [ ] يوجد Schema Versioning.
- [ ] البرنامج لا يحذف قاعدة البيانات تلقائياً عند حدوث خطأ.
- [ ] Restore لا يستبدل Database الحالية قبل التحقق من النسخة الجديدة.
- [ ] جميع العمليات الحساسة لها حماية مناسبة.
- [ ] النظام يعمل بشكل طبيعي مع انقطاع الكهرباء أو الإغلاق المفاجئ قدر الإمكان.

---

# 35. نقطة مهمة جداً

قبل تعديل أي شيء، افحص الكود الحالي وحدد ما هو موجود بالفعل.

**لا تنشئ أنظمة مكررة.**

إذا كان المشروع يحتوي على Database Manager أو Backup Manager بالفعل، قم بتطويره بدلاً من إنشاء نسخة ثانية.

إذا كان هناك تعارض بين إعدادات SQLite الحالية والإعدادات المقترحة، وضّح السبب وقم بتطبيق الإعداد الأكثر أماناً.

في النهاية أعطني تقريراً واضحاً يحتوي على:

- ما الذي تم تغييره.
- الملفات التي تم تعديلها.
- الملفات الجديدة.
- إعدادات SQLite النهائية.
- استراتيجية Backup النهائية.
- مكان حفظ Database.
- مكان حفظ Backups.
- سياسة الاحتفاظ بالنسخ.
- آلية Restore.
- آلية Recovery.
- آلية حماية انقطاع الكهرباء.
- الاختبارات التي تم تنفيذها.
- أي مخاطر متبقية.

## أهم قاعدة

**لا تعتبر إنشاء ملف Backup نجاحاً بحد ذاته.**

النجاح الحقيقي هو أن أستطيع **استعادة قاعدة البيانات منه فعلياً بعد حدوث مشكلة**، وأن تكون النسخة المستعادة سليمة وقابلة للاستخدام.
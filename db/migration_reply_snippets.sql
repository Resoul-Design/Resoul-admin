-- ============================================================
-- 遷移：回覆助手・回覆知識庫（2026-10-01）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（安全，可重複執行）
-- 說明：
--   • reply_snippets：後台「回覆助手」使用的回覆範本／知識庫，中英對照，同事可在後台編輯。
--   • 可用代號：{稱呼} {毛孩} {日期} {時段} {專案編號} {同事} {網站}，插入時自動填入。
--   • 收費代號：{風之旅起價} {雲之旅起價} {星之旅起價} {火化收費表} {獸醫收費表} {情緒支援收費表}，自動填入後台「網站內容」的收費（2026-10-06）。
--   • 初稿內容按網站 2026-10-01 的收費、流程、火化須知及常見問題整理；收費或安排有變時請在後台同步修改。
--   • 初稿以 slug 識別，重複執行不會覆蓋同事已修改的內容。
--   • 只經後台伺服器（service_role）讀寫；不開放 anon／authenticated 直接存取。
-- ============================================================

create table if not exists public.reply_snippets (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        unique,
  category    text        not null default '常用語',
  title       text        not null,
  zh          text        not null default '',
  en          text        not null default '',
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reply_snippets_category_idx on public.reply_snippets (category, sort_order);

alter table public.reply_snippets enable row level security;

insert into public.reply_snippets (slug, category, title, zh, en, sort_order) values
('ack', '常用語', '收到，稍後回覆',
$$收到，多謝你嘅資料。我同同事確認一下，稍後再覆你。$$,
$$Thank you for the details. Let me check with my team and I'll get back to you shortly.$$, 10),

('condolence', '常用語', '慰問',
$$好抱歉聽到{毛孩}離開咗嘅消息。呢段時間一定好唔容易，有咩需要我哋幫手，隨時話我哋知。$$,
$$I'm so sorry to hear about {毛孩}. This must be a very difficult time — if there's anything we can help with, please let us know anytime.$$, 20),

('confirm_booking', '常用語', '確認預約安排',
$$同你確認返：{毛孩}嘅接送安排喺 {日期} {時段}，專案編號係 {專案編號}。如果有任何改動，隨時話我知。$$,
$$Just to confirm: {毛孩}'s pick-up is arranged for {日期} {時段}, project no. {專案編號}. If anything changes, just let me know.$$, 30),

('closing', '常用語', '結尾',
$$有咩問題隨時搵我哋，我哋 24 小時都喺度。$$,
$$If you have any questions, feel free to reach us anytime — we're here 24 hours a day.$$, 40),

('price_journeys', '收費', '火化三個旅程',
$$我哋有三個火化旅程，收費按毛孩實際體重計算：
・風之旅：{風之旅起價} 起（私人接送、個別火化同基本骨灰安排）
・雲之旅：{雲之旅起價} 起（完整私人告別儀式同指定紀念項目）
・星之旅：{星之旅起價} 起（深度個人化告別同進階紀念選擇）
詳細比較可以睇：{網站}/cremation#plans$$,
$$We offer three cremation journeys, priced by your pet's actual weight:
• Breeze: from {風之旅起價} (private pick-up, individual cremation and a simple ashes arrangement)
• Cloud: from {雲之旅起價} (a complete private farewell ceremony with selected memorial items)
• Star: from {星之旅起價} (a deeply personalised farewell with advanced memorial options)
Full comparison: {網站}/cremation-en#plans$$, 10),

('price_weight', '收費', '按體重收費表',
$$按體重收費（風之旅／雲之旅／星之旅）：
{火化收費表}
表以外嘅體重請同我哋確認收費。$$,
$$Fees by weight (Breeze / Cloud / Star):
{火化收費表}
For weights not listed, please check with us for the fee.$$, 20),

('price_vet', '收費', '上門安樂死參考收費',
$$上門評估及安樂善終嘅參考收費（已包括獸醫上門診症同注射針劑）：
{獸醫收費表}
（日間：中午 12 時至晚上 8 時；晚間：晚上 8 時至午夜 12 時）
實際費用同鎮靜安排由獨立註冊獸醫評估及確認，火化同紀念品另計。$$,
$$Reference fees for a home assessment and euthanasia (including the vet's home visit and the injection):
{獸醫收費表}
(Day: 12 noon–8 pm; evening: 8 pm–midnight)
Final fees and sedation are assessed and confirmed by the independent registered vet; cremation and keepsakes are charged separately.$$, 30),

('price_grief', '收費', '情緒支援收費',
$$情緒支援嘅收費：
{情緒支援收費表}
實際服務內容、資格同收費會喺預約前確認。詳情可以睇：{網站}/referral#pricing$$,
$$Grief support fees:
{情緒支援收費表}
Service details, qualifications and fees are confirmed before booking. Details: {網站}/referral-en#pricing$$, 40),

('pay_methods', '付款', '訂金及付款方法',
$$預約接送需要先俾 HK$1,800 訂金，餘額喺紀念儀式當日俾就得。我哋接受現金、易辦事、PayMe、FPS 同信用卡。$$,
$$A HK$1,800 deposit is required to book the pick-up, and the balance is paid on the day of the memorial ceremony. We accept cash, EPS, PayMe, FPS and credit cards.$$, 10),

('pay_booking_link', '付款', '網上預約接送連結',
$$你可以喺呢度填資料同俾訂金預約接送：{網站}/booking
我哋會喺 24 小時內聯絡你確認安排。如果情況緊急，可以直接打 6476 2951。$$,
$$You can book the pick-up and pay the deposit here: {網站}/booking-en
We'll contact you within 24 hours to confirm the arrangements. If it's urgent, please call us directly on 6476 2951.$$, 20),

('pickup_area', '接送', '24 小時接送及範圍',
$$我哋提供 24 小時接送，家中或者全港任何獸醫診所都可以。服務費已經包括所有地區接送（愉景灣另收 HK$300，唐樓樓梯會另收附加費）。你可以預先話我哋知毛孩嘅情況，方便我哋盡快安排。$$,
$$We provide 24-hour pick-up from your home or any vet clinic in Hong Kong. The fee covers pick-up in all districts (Discovery Bay is an extra HK$300, and walk-up buildings carry a stair surcharge). Let us know about your pet's situation in advance so we can arrange things quickly.$$, 10),

('pickup_info', '接送', '接送前請提供資料',
$$為咗安排合適嘅接送同時段，麻煩你話我哋知：
・毛孩嘅體重同種類
・而家所在位置（家中地址或診所）
・離世時間
如果毛孩有晶片、金屬植入物或者心臟起搏器等，都請預先講，部分要喺火化前移除。$$,
$$To arrange a suitable pick-up and time, please let us know:
• your pet's weight and type
• where your pet is now (home address or clinic)
• the time of passing
If your pet has a microchip, metal implant or pacemaker, please tell us in advance — some need to be removed before cremation.$$, 20),

('after_passing', '接送', '剛離世點樣處理',
$$可以喺屋企安靜嘅地方，用一個舒服嘅箱鋪上牠鍾意嘅毛巾，俾牠休息。大約兩個鐘後身體會慢慢變硬，可以輕輕幫牠擺好睡姿，蓋上毛巾。天氣熱可以開冷氣，喺頭部同腹部放冰袋。如果未能即時接送，記得避免陽光直射。之後打 6476 2951 搵我哋，同事會喺兩個鐘內上門接牠。$$,
$$Please let your pet rest in a quiet place at home, in a comfortable box lined with a favourite towel. After about two hours the body begins to stiffen, so gently arrange a sleeping position and cover with a towel. In hot weather, turn on the air-conditioning and place ice packs by the head and tummy, away from direct sunlight. Then call us on 6476 2951 — our team will come to collect your pet within two hours.$$, 30),

('process', '流程', '服務流程',
$$我哋嘅服務流程：
1. 聯絡同初步確認：話我哋知毛孩位置、體重同情況，緊急個案會優先安排
2. 私人接送：由家中或獸醫診所接送，到咗會通知你
3. 安放同基礎整理：清潔、磅重同獨立安放
4. 確認告別儀式：安排海景告別室、時間同心意物品
5. 個別火化：一對一進行並保留過程記錄
6. 骨灰同紀念品：整理骨灰、毛髮、掌印等紀念品
7. 取回或安放：可以領取、寄送、暫存或者回歸自然$$,
$$Our process:
1. Contact & initial check: tell us where your pet is, the weight and situation — urgent cases are prioritised
2. Private pick-up: from your home or vet clinic; we'll message you on arrival
3. Care & preparation: gentle cleaning, weighing and individual resting place
4. Farewell ceremony: we arrange the seaview room, timing and keepsake items
5. Individual cremation: one-to-one, with the process recorded
6. Ashes & keepsakes: ashes, fur, paw prints and other keepsake options
7. Collection or placement: collect, delivery, temporary storage or return to nature$$, 10),

('individual', '告別儀式與火化', '只做個別（獨立）火化',
$$我哋只做個別火化，一隻一爐獨立進行，全程有記錄，絕對唔會同其他寵物混合。交返俾你嘅，只會係牠自己。$$,
$$We only do individual cremation — one pet at a time, fully recorded and never mixed with any other pet. What we return to you is only your companion.$$, 10),

('ceremony', '告別儀式與火化', '海景告別室及陪伴火化',
$$我哋有海景紀念室，俾你喺寧靜、私密嘅空間同牠道別。你可以親自按掣送別，按掣後要喺休息區等候，整個過程大約兩個鐘，之後可以即刻帶牠回家。全程都有拍攝記錄。如果想延長悼念時間都可以，但每隻毛孩情況唔同，請提早同我哋傾。$$,
$$Our seaview memorial room offers a calm, private space to say goodbye. You can press the button yourself to send your pet off, then wait in the lounge — the process takes about two hours and you can take your pet home right after. Everything is recorded. You may also extend the farewell time; as every pet is different, please discuss this with us in advance.$$, 20),

('items', '告別儀式與火化', '可以帶咩物品',
$$可以準備少量心意物一齊告別，例如鮮花、信、小零食或紙製品。金屬、玻璃、電子、塑膠同不易燃嘅物品就唔適合入爐，會影響骨灰質素。如果想物品一齊火化，或者想保留毛髮、觸鬚、掌印或指甲，請喺儀式前同我哋確認。$$,
$$You're welcome to bring a few keepsakes for the farewell, such as flowers, a letter, small treats or paper items. Metal, glass, electronics, plastic and non-flammable items can't go into the cremator as they affect the ashes. If you'd like items cremated together, or want to keep fur, whiskers, paw prints or claws, please let us know before the ceremony.$$, 30),

('ashes_pickup', '骨灰與紀念', '取回骨灰',
$$火化後可以揀保留骨頭或者磨灰處理，亦可以揀領回、送遞、暫存或者回歸自然。建議喺一個星期內接回骨灰，你亦可以授權家人代領，或者安排速遞。$$,
$$After cremation you can choose to keep the bones or have them ground, and choose collection, delivery, temporary storage or return to nature. We suggest collecting the ashes within a week; a family member can collect on your behalf, or we can arrange courier delivery.$$, 10),

('fur', '骨灰與紀念', '保留毛髮',
$$當然可以。你可以預先話我哋知，我哋會保留梳洗時嘅毛髮製作紀念品；你亦可以喺悼念儀式親自幫牠梳毛留低毛髮。$$,
$$Of course. Let us know in advance and we'll keep fur from grooming for a keepsake, or you can brush your pet yourself during the farewell to keep some fur.$$, 20),

('reschedule', '時間', '更改火化時間',
$$可以免費更改一次，但要提前 48 小時通知我哋。$$,
$$You can change the time once for free, with at least 48 hours' notice.$$, 10),

('same_day', '時間', '即日火化',
$$如果當日有空位，我哋會盡量幫你安排，實際要睇當日嘅預約情況。我同同事確認一下再覆你。$$,
$$If there's an available slot that day, we'll do our best to arrange it — it depends on that day's bookings. Let me check with my team and get back to you.$$, 20),

('vet_referral', '獸醫轉介', '上門安樂死安排',
$$我哋提供行政協調同獸醫轉介，可以幫你安排獨立註冊獸醫上門評估，並預先銜接之後嘅接送同善終安排。是否適合進行安樂程序，只會由到場嘅註冊獸醫按毛孩情況判斷，並喺你了解同同意後先進行。你可以喺呢度提交評估申請：{網站}/euthanasia$$,
$$We provide coordination and vet referral — we can arrange for an independent registered vet to assess your pet at home, and line up the pick-up and farewell arrangements afterwards. Whether euthanasia is appropriate is decided only by the attending registered vet based on your pet's condition, and only after you understand and consent. You can submit an assessment request here: {網站}/euthanasia-en$$, 10),

('grief_support', '情緒支援', '情緒支援資源',
$$失去毛孩真係好難受，請俾自己慢慢悲傷。我哋網站有情緒支援同專業輔導轉介嘅資料，有需要可以睇下：{網站}/support ，或者專業輔導轉介及資源：{網站}/referral$$,
$$Losing a companion is truly painful — please give yourself time to grieve. Our website has emotional support and professional counselling resources if you need them: {網站}/support-en and {網站}/referral-en$$, 10),

('crisis', '情緒支援', '危機關懷（請同事親自跟進）',
$$我哋好擔心你而家嘅狀況。如果你有傷害自己嘅念頭，或者覺得撐唔住，請即刻致電 999，或者撒瑪利亞防止自殺會 24 小時熱線 2389 2222。你唔需要一個人面對，我哋同事會好快同你聯絡。$$,
$$We're really worried about how you're feeling. If you're having thoughts of harming yourself or feel you can't cope, please call 999 now, or The Samaritan Befrienders Hong Kong 24-hour hotline on 2389 2222. You don't have to face this alone — someone from our team will contact you very soon.$$, 20)
on conflict (slug) do nothing;

# Client ko bhejne wala message (Roman Urdu)

---

**Assalam-o-Alaikum Sir,**

Kal wali call ka follow-up — maine sab points likh liye hain taake hum 100% aligned hon:

**Jo main samjha hoon:**

**1. Inspection Companies (multi-company system)**
- Har inspection company ka apna login hoga (email + mobile number). Username/password
  banane mein hum unki madad karenge kyunke kuch log zyada parhe likhe nahi hote.
- Login ke baad Registration option: company ka naam, details, location (Google Maps
  se), aur ek **Point of Contact** (naam, mobile number, email).
- Har company ka **apna admin panel** hoga aur woh **apne inspectors ke logins khud
  banayegi** (Company = parent, Inspector = child). Jo inspection aayegi, company ka
  admin khud apne inspector ko assign karega.

**2. Supervisor (Super Admin)**
- Hum kisi ke account mein login NAHI karenge — sab kuch Supervisor panel se hoga.
- Dashboard: **Companies tab** (list view + map view with pins, har company ko kitni
  jobs di aur kitni complete huin), **Bookings tab** (customer ki har booking foran
  nazar aayegi), **Customers/Jobs tab**.

**3. Customer ka flow**
- **Login ke baghair koi booking nahi** (mobile OTP se login) → booking → **payment**
  → booking log hogi → Super Admin ko show hogi.

**4. Job dispatch (jo aap ne research ka kaha tha)**
- Koi manual assignment nahi. Job **sab companies ko live** show hogi, jo pehle accept
  karega usko milegi, double acceptance nahi hogi, cancel karne par job dobara live
  hogi lekin cancel karne wala dobara wohi job nahi le sakega, aur har company ke
  Point of Contact ko WhatsApp alert jayega.

---

**Meri research aur tajweez (Uber/InDrive wala sawal):**

Maine study kar liya hai. Uber location-based matching use karta hai (pehle qareeb
wale drivers, phir radius barhta hai), lekin hamare stage ke liye main
**"broadcast + first-accept" model** recommend karta hoon (jaise InDrive/Careem
captain job boards):

1. **Phase 1 (launch):** Har live job SAB registered companies ko show hogi + unke
   PoC ko WhatsApp alert. Jo pehle accept karega usko milegi — yeh database level
   par (atomic transaction) enforce hoga, is liye double-acceptance technically
   IMPOSSIBLE hogi, chahe do log ek hi second mein click karein.
2. **Job window:** Job ek muqarrar waqt tak live rahegi (meri tajweez **24 ghante**,
   Supervisor panel se change ho sakega). Agar koi accept na kare to Super Admin ko
   flag ho jayegi manual follow-up ke liye.
3. **Cancel rule:** Cancel karne wala us job ke liye hamesha ke liye block — job
   automatically dobara live hogi aur naye WhatsApp alerts jayenge.
4. **Phase 2 (jab volume barhega):** Location filtering add karenge — sirf customer
   ke X km ke andar wali companies ko show/notify hogi, aur agar 30–60 minute mein
   koi accept na kare to radius barhta jayega. Yeh bilkul Uber ka tareeqa hai, aur
   kyunke hum registration par company ki location le rahe hain, jab zaroorat hogi
   yeh ready hoga.

Is se launch simple rahega, sab kuch fully automated hoga (koi "gadhe wala kaam"
nahi 😄), aur 1000+ jobs tak scale karega.

**Aap ki taraf se mujhe kya chahiye:**
- **Payment/bank API ki details** — payment flow ke liye yehi mera main blocker hai.
- Job open-time window ki confirmation (24 ghante theek hain?).

Login aur registration ka kaam main abhi shuru kar raha hoon (1–2 din, jaise baat
hui thi). Google Maps view aakhir mein hoga, jaisa tay hua tha.

Confirm kar dein to main aage barhta hoon. JazakAllah!

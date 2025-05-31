// flower_shop_bot/index.js
const TelegramBot = require("node-telegram-bot-api");
const mysql = require("mysql2/promise");

// Setup database connection
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "5555",
  database: "flowershop",
});

// Setup Telegram bot
const bot = new TelegramBot("7968532696:AAFg8E__oR5L3IHtVGYF1ugjuvs9Bdm0Psg", { polling: true });

// Holatlarni saqlash
const userStates = {};
// Admin ID lar ro'yxati
const ADMIN_IDS = [6096809632,6440063246];

// Main menu ko'rsatuvchi funksiya
function showMainMenu(chatId) {
  const menuText = `🎉 Ro'yxatdan o'tdingiz yoki asosiy menyudasiz!
Quyidagi bo'limlardan birini tanlang:`;

  bot.sendMessage(chatId, menuText, {
    reply_markup: {
      keyboard: [
        ["✅ Mavjud gullar", "🆕 Yangi gullar"],
        ["🔍 Narx bo'yicha qidirish", "🛒 Buyurtma berish"],
        ["📋 Mening buyurtmalarim", "📞 Biz bilan bog‘lanish"],
        ["💰 FGC balance", "🔗 Referal linkim"]
      ],
      resize_keyboard: true,
    },
  });
}


bot.onText(/\/start(?:\s+ref_(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const referredBy = match[1] ? parseInt(match[1]) : null;

  const [existingUsers] = await db.query("SELECT * FROM users WHERE telegram_id = ?", [telegramId]);

  if (existingUsers.length > 0) {
    if (ADMIN_IDS.includes(telegramId)) {
      showAdminMenu(chatId);
    } else {
      showMainMenu(chatId);
    }
  } else {
    const welcomeText = `👋 Assalomu alaykum!

🌸 Gul do'konimizga xush kelibsiz!
Ro'yxatdan o'tish uchun ismingizni yuboring:`;
    
    bot.sendMessage(chatId, welcomeText);

    // Bu yerda referer ID saqlanadi (agar bor bo‘lsa)
    userStates[chatId] = { step: "awaiting_name", referred_by: referredBy };
  }
});




// Ism qabul qilish va raqam so‘rash
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates[chatId];

  if (!state) return;

  if (state.step === "awaiting_name") {
    userStates[chatId].name = text;
    userStates[chatId].step = "awaiting_phone";

    bot.sendMessage(chatId, "📞 Iltimos, telefon raqamingizni yuboring:", {
      reply_markup: {
        keyboard: [[{ text: "📲 Raqamni yuborish", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  }
});



// Kontaktni qabul qilish va DB ga yozish
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;

  const state = userStates[chatId];
  if (!state || state.step !== "awaiting_phone") return;

  if (contact.user_id !== msg.from.id) {
    return bot.sendMessage(chatId, "⚠️ Iltimos, faqat o'zingizning raqamingizni yuboring.");
  }

  const name = state.name;
  const phone = contact.phone_number;
  const telegramId = msg.from.id;
  const username = msg.from.username || "";
  const referredBy = state.referred_by || null;

  const [existingUsers] = await db.query("SELECT * FROM users WHERE telegram_id = ?", [telegramId]);
  if (existingUsers.length === 0) {
    await db.query(
      "INSERT INTO users (telegram_id, name, phone, username, referred_by) VALUES (?, ?, ?, ?, ?)",
      [telegramId, name, phone, username, referredBy]
    );

    if (referredBy) {
      await db.query(
        "UPDATE users SET balance = balance + 10 WHERE telegram_id = ?",
        [referredBy]
      );

      bot.sendMessage(referredBy, "🎉 Sizning ssilkangiz orqali yangi foydalanuvchi ro'yxatdan o'tdi.\n💰 Sizga +10 FGC taqdim etildi!");
    }
  }

  const referralLink = `https://t.me/VeronicaGarden_bot?start=ref_${telegramId}`;
  const refText = `✅ Ro'yxatdan o'tdingiz!

🔗 <b>Sizning referal linkingiz:</b>
<code>${referralLink}</code>

💸 Sizning ssilkangizdan kirgan har bir do'stingiz uchun sizga <b>10 FGC (Flower Garden Coin)</b> beriladi!

🌺 Bu coinlar orqali siz gullar uchun chegirmalarni qo'lga kiritishingiz mumkin!`;

  await bot.sendMessage(chatId, refText, { parse_mode: "HTML" });

  delete userStates[chatId];

  showMainMenu(chatId);
});


bot.onText(/✅ Mavjud gullar/, async (msg) => {
  const chatId = msg.chat.id;
  const [flowers] = await db.query("SELECT * FROM flowers WHERE status = 'Mavjud'");

  if (flowers.length === 0) {
    return bot.sendMessage(chatId, "🚫 Hozircha mavjud gullar yo‘q.");
  }

  for (const f of flowers) {
    await bot.sendPhoto(chatId, f.photo, {
      caption: `🆔 ID: ${f.id}\n🌸 ${f.name}\n💵 Narxi: ${f.price} so'm\n📦 Holati: ${f.status}`,
    });
  }

  showMainMenu(chatId);
});

bot.onText(/🆕 Yangi gullar/, async (msg) => {
  const chatId = msg.chat.id;
  const [flowers] = await db.query("SELECT * FROM flowers WHERE status = 'Yangi'");

  if (flowers.length === 0) {
    return bot.sendMessage(chatId, "📭 Hozircha yangi gullar yo‘q.");
  }

  for (const f of flowers) {
    await bot.sendPhoto(chatId, f.photo, {
      caption: `🆔 ID: ${f.id}\n🌸 ${f.name}\n💵 Narxi: ${f.price} so'm\n📦 Holati: ${f.status}`,
    });
  }

  showMainMenu(chatId);
});

const priceSearchStates = {};

bot.onText(/🔍 Narx bo'yicha qidirish/, (msg) => {
  const chatId = msg.chat.id;
  priceSearchStates[chatId] = { step: "min" };
  bot.sendMessage(chatId, "💰 Minimal narxni kiriting:");
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = priceSearchStates[chatId];

  if (!state) return;

  if (state.step === "min") {
    const min = parseInt(text);
    if (isNaN(min)) return bot.sendMessage(chatId, "❗ Iltimos, son kiriting:");

    state.min = min;
    state.step = "max";
    bot.sendMessage(chatId, "💰 Maksimal narxni kiriting:");
  } else if (state.step === "max") {
    const max = parseInt(text);
    if (isNaN(max)) return bot.sendMessage(chatId, "❗ Iltimos, son kiriting:");

    const [flowers] = await db.query("SELECT * FROM flowers WHERE price BETWEEN ? AND ?", [state.min, max]);

    if (flowers.length === 0) {
      bot.sendMessage(chatId, "🔎 Bu oraliqda hech qanday gul topilmadi.");
    } else {
      for (const f of flowers) {
        await bot.sendPhoto(chatId, f.photo, {
          caption: `🆔 ID: ${f.id}\n🌸 ${f.name}\n💵 Narxi: ${f.price} so'm\n📦 Holati: ${f.status}`,
        });
      }
    }

    delete priceSearchStates[chatId];
    showMainMenu(chatId);
  }
});



bot.onText(/💰 FGC balance/, async (msg) => {
  const telegramId = msg.from.id;
  const chatId = msg.chat.id;

  const [rows] = await db.query("SELECT balance FROM users WHERE telegram_id = ?", [telegramId]);

  if (rows.length === 0) {
    return bot.sendMessage(chatId, "❌ Siz ro'yxatdan o'tmagansiz.");
  }

  const balance = rows[0].balance || 0;

  bot.sendMessage(chatId, `💳 Sizning FGC balansingiz: <b>${balance} FGC</b>`, {
    parse_mode: "HTML",
  });
});

bot.onText(/🔗 Referal linkim/, async (msg) => {
  const telegramId = msg.from.id;
  const chatId = msg.chat.id;

  const [rows] = await db.query("SELECT * FROM users WHERE telegram_id = ?", [telegramId]);

  if (rows.length === 0) {
    return bot.sendMessage(chatId, "❌ Siz ro'yxatdan o'tmagansiz.");
  }

  const referralLink = `https://t.me/VeronicaGarden_bot?start=ref_${telegramId}`;

  const text = `🔗 Sizning referal linkingiz:\n<code>${referralLink}</code>

👥 Sizning ssilkangiz orqali ro'yxatdan o'tgan har bir foydalanuvchi uchun sizga <b>10 FGC</b> taqdim etiladi!`;

  bot.sendMessage(chatId, text, { parse_mode: "HTML" });
});


bot.onText(/\/order|🛒 Buyurtma berish/, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "🆔 Iltimos, buyurtma qilmoqchi bo'lgan gul ID raqamini kiriting:");

  bot.once("message", async (idMsg) => {
    const flowerId = parseInt(idMsg.text);
    if (isNaN(flowerId)) return bot.sendMessage(chatId, "❌ Noto‘g‘ri ID kiritildi. Faqat raqam kiriting.");

    const [[flower]] = await db.query("SELECT * FROM flowers WHERE id = ?", [flowerId]);
    if (!flower) return bot.sendMessage(chatId, "❌ Bunday ID raqamli gul mavjud emas.");

    // Buyurtma kiritish (buyurtma status hali tekshirilmaydi)
    await db.query("INSERT INTO orders (flower_name, phone, user_id) VALUES (?, ?, ?)", [
      flower.name, 'no phone needed here', chatId
    ]);

    // To‘lov botiga yo‘naltiruvchi button
    bot.sendMessage(chatId, `💳 Shu bot orqali to‘lovni amalga oshiring\nBuyurtmani holatini ko'rib borish uchun /status so'zini yuboring!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➡️ BOT", url: "https://t.me/VeronicaGardenPay_bot" }]
        ]
      }
    });

    // 4 daqiqadan so‘ng `order_status` tekshiriladi
    setTimeout(async () => {
      const [[statusRow]] = await db.query(
        "SELECT status FROM order_status WHERE telegram_id = ? ORDER BY id DESC LIMIT 1",
        [chatId]
      );

      if (!statusRow || statusRow.status !== "Tasdiqlandi") return;

      bot.sendMessage(chatId, "🚚 Buyurtmani olib ketasizmi yoki yetkazib beraylikmi?", {
        reply_markup: {
          keyboard: [["🏬 Borib olaman", "📦 Yetkazib bering"]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });

      bot.once("message", async (deliveryMsg) => {
        const choice = deliveryMsg.text;

        if (choice === "🏬 Borib olaman") {
          // Locationni bazadan olish (misol uchun 1 ta entry bor deb olamiz)
          const [[location]] = await db.query("SELECT * FROM location LIMIT 1");
          if (!location) return bot.sendMessage(chatId, "⚠️ Manzil mavjud emas.");

          bot.sendMessage(chatId, "📍 Bizning manzil:", {
            reply_markup: { remove_keyboard: true }
          });

          bot.sendLocation(chatId, location.latitude, location.longitude);
          showMainMenu(chatId);

        } else if (choice === "📦 Yetkazib bering") {
          bot.sendMessage(chatId, "📍 Joylashuvingizni yuboring:", {
            reply_markup: {
              keyboard: [[{ text: "📍 Joylashuvni yuborish", request_location: true }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          });

          bot.once("location", async (locMsg) => {
            bot.sendMessage(chatId, "✅ Buyurtmangiz muvaffaqiyatli qabul qilindi!");
            showMainMenu(chatId);
            // Foydalanuvchi haqida malumot olish
            const [[user]] = await db.query("SELECT * FROM users WHERE telegram_id = ?", [chatId]);

            for (const adminId of ADMIN_IDS) {
              await bot.sendPhoto(adminId, flower.photo, {
                caption: `🛒 Yangi buyurtma:\n👤 Ismi: ${user.name}\n📞 Telefon: ${user.phone}\n🔗 @${user.username || 'username yoʻq'}\n🌸 Gul: ${flower.name} (${flower.price} so‘m)`
              });
            }
          });
        }
      });
    }, 4 * 60 * 1000); // 4 daqiqa kutish
  });
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  // So‘nggi buyurtmani olish
  const [[order]] = await db.query(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [chatId]
  );

  if (!order) {
    return bot.sendMessage(chatId, "❌ Sizda hech qanday buyurtma mavjud emas.");
    showMainMenu(chatId);
  }

  // So‘nggi holatni olish
  const [[statusRow]] = await db.query(
    "SELECT status FROM order_status WHERE telegram_id = ? ORDER BY id DESC LIMIT 1",
    [chatId]
  );

  if (!statusRow) {
    return bot.sendMessage(chatId, "🕒 Hozircha buyurtma holati mavjud emas.");
    showMainMenu(chatId);
  }

  if (statusRow.status === "Tasdiqlandi") {
    // 1-bosqich: ishlanmoqda deb ko‘rsatish
    await bot.sendMessage(chatId, `⏳`);

    // 3 daqiqadan keyin holatni qayta tekshirish va xabar berish
    setTimeout(async () => {
      const [[newStatus]] = await db.query(
        "SELECT status FROM order_status WHERE telegram_id = ? ORDER BY id DESC LIMIT 1",
        [chatId]
      );

      if (!newStatus) {
        return bot.sendMessage(chatId, "🕒 Buyurtma holati hali yangilanmadi.");
      }

      if (newStatus.status === "Tasdiqlandi") {
        bot.sendMessage(chatId, `✅`);
      } else if (newStatus.status === "Bekor qilindi") {
        bot.sendMessage(chatId, `❌ Buyurtmangiz bekor qilindi. 🌸 Gul: ${order.flower_name}`);
        showMainMenu(chatId);
      } else {
        bot.sendMessage(chatId, `📦 Buyurtma holati: ${newStatus.status} 🌸 Gul: ${order.flower_name}`);
        showMainMenu(chatId);
      }
    }, 3 * 60 * 1000); // 3 daqiqa
  } else if (statusRow.status === "Bekor qilindi") {
    return bot.sendMessage(chatId, `❌ Buyurtmangiz bekor qilingan.\n\n🌸 Gul: ${order.flower_name}`);
    showMainMenu(chatId);
  } else {
    return bot.sendMessage(chatId, `📦 Buyurtma holati: ${statusRow.status}\n\n🌸 Gul: ${order.flower_name}`);
    showMainMenu(chatId);
  }
});



// Mening buyurtmalarim
bot.onText(/📋 Mening buyurtmalarim/, async (msg) => {
  const chatId = msg.chat.id;
  const [orders] = await db.query("SELECT * FROM orders WHERE user_id = ?", [chatId]);

  if (orders.length === 0) {
    return bot.sendMessage(chatId, "📭 Sizda hali buyurtmalar mavjud emas.");
  }

  let reply = "📋 Sizning buyurtmalaringiz:\n";
  orders.forEach((o, i) => {
    reply += `\n${i + 1}. ${o.flower_name}`;
  });

  bot.sendMessage(chatId, reply);
  showMainMenu(chatId);
});

// Biz bilan bog‘lanish
bot.onText(/📞 Biz bilan bog‘lanish/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `📞 Aloqa uchun:
📱 Telefon: +998 33 574 74 74
📍 Manzil: Tashkent, Amir Temur ko'chasi, 40B
🌐 Instagram:   veronica_garden__  `);
});

function showAdminMenu(chatId) {
  const adminMenuText = `🔧 *Admin Panel* 🔧

Quyidagilardan birini tanlang:`;

  const adminKeyboard = {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [
        ["👥 Foydalanuvchilar ro'yhati"],
        ["➕ Gul qo'shish", "❌ Gul o'chirish"],
        ["📢 Yangilik yuborish"],
        ["📢 Reklama yuborish","💥 Chegirma va Aksiya qilish"],
        ["📍 Joylashuvni yuborish","📊 Statistika"],
        ["⬅️ Yangilash"]
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };

  bot.sendMessage(chatId, adminMenuText, adminKeyboard);
}

const adminAddStates = {}; // Admin state'larini saqlash

bot.onText(/➕ Gul qo'shish/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  adminAddStates[chatId] = { step: "awaiting_photo" };

  bot.sendMessage(chatId, "📷 Iltimos, yangi gulning rasmini yuboring:");
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  if (!adminAddStates[chatId] || adminAddStates[chatId].step !== "awaiting_photo") return;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  adminAddStates[chatId].photo = fileId;
  adminAddStates[chatId].step = "awaiting_name";

  bot.sendMessage(chatId, "📝 Endi gulingiz nomini yuboring:");
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = adminAddStates[chatId];

  if (!state) return;

  if (state.step === "awaiting_name") {
    state.name = text;
    state.step = "awaiting_price";
    bot.sendMessage(chatId, "💰 Endi narxini yuboring (faqat son):");

  } else if (state.step === "awaiting_price") {
    const price = parseInt(text);
    if (isNaN(price)) return bot.sendMessage(chatId, "❗ Narx raqam bo‘lishi kerak. Qaytadan kiriting:");

    state.price = price;
    state.step = "awaiting_status";

    bot.sendMessage(chatId, "📦 Iltimos, gul holatini tanlang:", {
      reply_markup: {
        keyboard: [
          ["✅ Mavjud", "❌ Mavjud emas"],
          ["🆕 Yangi", "🔚 Tugagan"]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });

  } else if (state.step === "awaiting_status") {
    const validStatuses = ["✅ Mavjud", "❌ Mavjud emas", "🆕 Yangi", "🔚 Tugagan"];
    if (!validStatuses.includes(text)) {
      return bot.sendMessage(chatId, "❗ Iltimos, quyidagi tugmalardan birini tanlang.");
    }

    let status = text.replace(/^[^\w\s]+ /, ""); // Emoji olib tashlash
    const { name, price, photo } = state;

    await db.query("INSERT INTO flowers (name, price, photo, status) VALUES (?, ?, ?, ?)", [
      name,
      price,
      photo,
      status
    ]);

    delete adminAddStates[chatId];

    bot.sendMessage(chatId, "✅ Gul muvaffaqiyatli qo‘shildi!", {
      reply_markup: {
        keyboard: [
          ["👥 Foydalanuvchilar ro'yhati"],
          ["➕ Gul qo'shish", "❌ Gul o'chirish"],
          ["📢 Yangilik yuborish"],
          ["📢 Reklama yuborish", "💥 Chegirma va Aksiya qilish"],
          ["📍 Joylashuvni yuborish", "📊 Statistika"],
          ["⬅️ Yangilash"]
        ],
        resize_keyboard: true
      }
    });
  }
});


bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "⬅️ Orqaga") {
    if (ADMIN_IDS.includes(msg.from.id)) {
      showAdminMenu(chatId);
    } else {
      showMainMenu(chatId);
    }
  }
});

// 1. "Chegirma va Aksiya qilish" tugmasi bosilganda
bot.onText(/^💥 Chegirma va Aksiya qilish$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  const opts = {
    reply_markup: {
      keyboard: [
        ["Chegirma"],
        ["Aksiya"],
        ["⬅️ Orqaga"]
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };

  await bot.sendMessage(chatId, "💥 *Chegirma yoki Aksiya* tanlang:", { parse_mode: "Markdown", ...opts });
});

// 2. Chegirma bosilganda
bot.onText(/^Chegirma$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  await bot.sendMessage(chatId, "🌸 Qaysi ID li gulga chegirma qilishni hohlaysiz?");
  
  bot.once("message", async (idMsg) => {
    if (idMsg.chat.id !== chatId) return; // Faqat admin javobini olamiz
    
    const flowerId = parseInt(idMsg.text);
    if (isNaN(flowerId)) {
      return bot.sendMessage(chatId, "❌ Noto‘g‘ri ID kiritildi. Iltimos, raqam kiriting.");
      showAdminMenu(chatId);
    }

    const [[flower]] = await db.query("SELECT * FROM flowers WHERE id = ?", [flowerId]);
    if (!flower) {
      return bot.sendMessage(chatId, "❌ Bunday ID raqamli gul topilmadi.");
      showAdminMenu(chatId);
    }

    await bot.sendMessage(chatId, `🌼 Gul: *${flower.name}*\n💰 Asl narxi: *${flower.price} so'm*\n\nNechchi foiz *skidka* qilishni hohlaysiz?`, { parse_mode: "Markdown" });

    bot.once("message", async (percentMsg) => {
      if (percentMsg.chat.id !== chatId) return;

      const discountPercent = parseFloat(percentMsg.text);
      if (isNaN(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
        return bot.sendMessage(chatId, "❌ Iltimos, 0 dan katta va 100 dan kichik raqam kiriting.");
      }

      const discountedPrice = Math.round(flower.price * (1 - discountPercent / 100));
      await db.query("UPDATE flowers SET price = ? WHERE id = ?", [discountedPrice, flowerId]);

      await bot.sendMessage(chatId, `✅ *${flower.name}* uchun ${discountPercent}% chegirma qo‘llandi!\n📉 Yangi narx: *${discountedPrice} so'm*`, { parse_mode: "Markdown" });

      showAdminMenu(chatId);
    });
  });
});

// 3. Aksiya bosilganda
bot.onText(/^Aksiya$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  await bot.sendMessage(chatId, "📢 Aksiyangiz shartini yozing (Masalan: _Faqat bugun – 1 soat ichida buyurtma berganlarga 20% chegirma!_) 😍", { parse_mode: "Markdown" });

  bot.once("message", async (promoMsg) => {
    if (promoMsg.chat.id !== chatId) return;

    const promoText = promoMsg.text;
    const [users] = await db.query("SELECT telegram_id FROM users");

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, `📢 *Aksiya!*\n\n${promoText}`, { parse_mode: "Markdown" });
      } catch (e) {
        console.error(`Xatolik foydalanuvchi ${user.telegram_id} da:`, e.message);
      }
    }

    await bot.sendMessage(chatId, "✅ Aksiya barcha foydalanuvchilarga yuborildi!");
    showAdminMenu(chatId);
  });
});

bot.onText(/📍 Joylashuvni yuborish/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Siz admin emassiz.");
  }

  bot.sendMessage(chatId, "📍 Iltimos, joylashuvni yuboring.", {
    reply_markup: {
      keyboard: [[{ text: "📍 Joylashuv yuborish", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId)) return;

  const { latitude, longitude } = msg.location;

  try {
    await db.query(
      "INSERT INTO location (latitude, longitude) VALUES (?, ?)",
      [latitude, longitude]
    );

    bot.sendMessage(chatId, "✅ Joylashuv muvaffaqiyatli saqlandi!");
    showAdminMenu(chatId);
  } catch (err) {
    console.error("Joylashuv saqlashda xatolik:", err);
    bot.sendMessage(chatId, "❌ Joylashuvni saqlab bo'lmadi.");
    showAdminMenu(chatId);
  }
});

// 1. Statistika tugmasi bosilganda
bot.onText(/^📊 Statistika$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  const opts = {
    reply_markup: {
      keyboard: [
        ["📅 Kunlik buyurtmalar"],
        ["🗓️ Oylik buyurtmalar"],
        ["🏆 E.K.S gullar"],
        ["⬅️ Orqaga"]
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };

  await bot.sendMessage(chatId, "📊 Statistika bo‘limiga xush kelibsiz! Quyidagilardan birini tanlang:", opts);
});

// 2. Kunlik buyurtmalar
bot.onText(/^📅 Kunlik buyurtmalar$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  // Hozirgi kun boshlanish va tugash vaqtlarini olish
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // SQLda kunlik buyurtmalarni olish
  const [rows] = await db.query(
    "SELECT flower_name, COUNT(*) AS count FROM order_status WHERE created_at BETWEEN ? AND ? GROUP BY flower_name",
    [todayStart, todayEnd]
  );

  if (rows.length === 0) {
    return bot.sendMessage(chatId, "📅 Bugun hech qanday buyurtma yo‘q.");
    showAdminMenu(chatId);
  }

  let text = "📅 *Bugungi kunlik buyurtmalar statistikasi:*\n\n";
  rows.forEach((row, i) => {
    text += `🌸 ${row.flower_name} — ${row.count} dona\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  showAdminMenu(chatId);
});

// 3. Oylik buyurtmalar
bot.onText(/^🗓️ Oylik buyurtmalar$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  // Hozirgi oy boshini olish
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [rows] = await db.query(
    "SELECT flower_name, COUNT(*) AS count FROM order_status WHERE created_at BETWEEN ? AND ? GROUP BY flower_name",
    [monthStart, monthEnd]
  );

  if (rows.length === 0) {
    return bot.sendMessage(chatId, "🗓️ Bu oy hech qanday buyurtma yo‘q.");
    showAdminMenu(chatId);
  }

  let text = "🗓️ *Oylik buyurtmalar statistikasi:*\n\n";
  rows.forEach((row, i) => {
    text += `🌸 ${row.flower_name} — ${row.count} dona\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  showAdminMenu(chatId);
});

// 4. Eng ko'p sotilgan gullar (E.K.S gullar)
bot.onText(/^🏆 E.K.S gullar$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  // Eng ko'p sotilgan 5 ta gulni olish
  const [rows] = await db.query(
    "SELECT flower_name, COUNT(*) AS count FROM order_status GROUP BY flower_name ORDER BY count DESC LIMIT 5"
  );

  if (rows.length === 0) {
    return bot.sendMessage(chatId, "🏆 Hozircha hech qanday buyurtma yo‘q.");
    showAdminMenu(chatId);
  }

  let text = "🏆 *Eng ko'p sotilgan gullar:*\n\n";
  rows.forEach((row, i) => {
    text += `${i + 1}. 🌸 ${row.flower_name} — ${row.count} dona\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  showAdminMenu(chatId);
});

bot.onText(/📢 Reklama yuborish/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  bot.sendMessage(chatId, "📸 Iltimos, *reklama uchun rasm yoki video* yuboring.", { parse_mode: "Markdown" });

  bot.once("message", async (mediaMsg) => {
    let mediaFileId = null;
    let mediaType = null;

    // Media aniqlash
    if (mediaMsg.photo) {
      mediaFileId = mediaMsg.photo[mediaMsg.photo.length - 1].file_id;
      mediaType = "photo";
    } else if (mediaMsg.video) {
      mediaFileId = mediaMsg.video.file_id;
      mediaType = "video";
    } else {
      return bot.sendMessage(chatId, "❌ Rasm yoki video yuboring.");
    }

    // Caption so‘rash
    bot.sendMessage(chatId, "✍️ Endi reklamaga qo‘shiladigan matn (caption) ni yuboring.");

    bot.once("message", async (textMsg) => {
      const caption = textMsg.text;

      // Barcha foydalanuvchilarni olish
      const [users] = await db.query("SELECT telegram_id FROM users");

      for (const user of users) {
        try {
          if (mediaType === "photo") {
            await bot.sendPhoto(user.telegram_id, mediaFileId, { caption });
          } else if (mediaType === "video") {
            await bot.sendVideo(user.telegram_id, mediaFileId, { caption });
          }
        } catch (e) {
          console.log(`Xatolik: ${user.telegram_id} - ${e.message}`);
        }
      }

      bot.sendMessage(chatId, "✅ Reklama barcha foydalanuvchilarga yuborildi.");
      showAdminMenu(chatId);
    });
  });
});

function escapeMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

bot.onText(/👥 Foydalanuvchilar ro'yhati/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  const [users] = await db.query("SELECT * FROM users");

  if (users.length === 0) {
    return bot.sendMessage(chatId, "📭 Hech qanday foydalanuvchi topilmadi.");
  }

  let message = "👥 *Foydalanuvchilar ro'yxati:*\n\n";
  for (const u of users) {
    message += `🆔 ID: ${escapeMarkdown(u.id.toString())}\n👤 Ism: ${escapeMarkdown(u.name)}\n📞 Tel: ${escapeMarkdown(u.phone)}\n🔗 Username: @${escapeMarkdown(u.username || 'yo‘q')}\n\n`;
  }

  bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  showAdminMenu(chatId);
});


bot.onText(/📢 Yangilik yuborish/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  bot.sendMessage(chatId, "🖼 Rasmni yuboring:");
  bot.once("photo", async (photoMsg) => {
    const photo = photoMsg.photo[photoMsg.photo.length - 1].file_id;

    bot.sendMessage(chatId, "📛 Yangilik nomini kiriting:");
    bot.once("message", async (nameMsg) => {
      const name = nameMsg.text;

      bot.sendMessage(chatId, "💵 Narxini kiriting:");
      bot.once("message", async (priceMsg) => {
        const price = priceMsg.text;

        const [users] = await db.query("SELECT * FROM users");

        for (const user of users) {
          await bot.sendPhoto(user.id, photo, {
            caption: `🆕 Yangi gul!\n🌸 ${name}\n💵 Narxi: ${price} so‘m`,
          });
        }

        bot.sendMessage(chatId, "✅ Yangilik barcha foydalanuvchilarga yuborildi!");
        showAdminMenu(chatId);
      });
    });
  });
});



bot.onText(/⬅️ Yangilash/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  showAdminMenu(chatId);
});


bot.onText(/❌ Gul o'chirish/, async (msg) => {
  const chatId = msg.chat.id;

  // Faqat adminlar uchun
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "❌ Sizda bu amalni bajarish uchun ruxsat yo'q.");
  }

  // Gullarning ro'yxatini chiqarish
  const [flowers] = await db.query("SELECT * FROM flowers");

  if (flowers.length === 0) {
    return bot.sendMessage(chatId, "📭 Hozircha hech qanday gul mavjud emas.");
  }

  let flowerList = "🗑 O'chirmoqchi bo'lgan gul ID sini yuboring:\n\n";
  flowers.forEach((flower) => {
    flowerList += `ID: ${flower.id} - ${flower.name} - ${flower.price} so'm\n`;
  });

  bot.sendMessage(chatId, flowerList);

  // Keyingi ID yozilishini kutamiz
  bot.once("message", async (deleteMsg) => {
    const flowerIdToDelete = parseInt(deleteMsg.text);

    if (isNaN(flowerIdToDelete)) {
      return bot.sendMessage(chatId, "❗️ Noto‘g‘ri ID kiritildi. Iltimos, raqam yuboring.");
    }

    const [result] = await db.query("DELETE FROM flowers WHERE id = ?", [flowerIdToDelete]);

    if (result.affectedRows === 0) {
      return bot.sendMessage(chatId, `⚠️ ID ${flowerIdToDelete} bo‘yicha gul topilmadi.`);
    }

    bot.sendMessage(chatId, `✅ Gul muvaffaqiyatli o‘chirildi (ID: ${flowerIdToDelete}).`);
    showAdminMenu(chatId);
  });
});


console.log("Bot ishga tushdi!!!!!!!")

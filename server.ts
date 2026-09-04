import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/create-waiter", async (req, res) => {
    const { name, email, password, restaurant_id } = req.body;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({ error: "Supabase URL is not configured." });
    }

    try {
      if (!name || !email || !password || !restaurant_id) {
        throw new Error("يرجى ملء جميع الحقول المطلوبة: الاسم، البريد الإلكتروني، كلمة المرور، ومعرف المطعم.");
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();
      const cleanPassword = password.trim();

      if (serviceRoleKey) {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        // 1. Check if user already exists
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find(u => u.email?.toLowerCase() === cleanEmail);

        let userId = existing?.id;

        if (existing) {
          // Update existing user
          const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existing.id,
            {
              password: cleanPassword,
              email_confirm: true,
              user_metadata: {
                full_name: cleanName,
                role: "waiter",
                restaurant_id
              }
            }
          );
          if (updateError) throw updateError;
          userId = updated.user.id;
        } else {
          // Create new user
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: cleanPassword,
            email_confirm: true,
            user_metadata: {
              full_name: cleanName,
              role: "waiter",
              restaurant_id
            }
          });
          if (authError) throw authError;
          userId = authData.user.id;
        }

        // 2. Fetch restaurant name
        const { data: restData } = await supabaseAdmin
          .from("restaurants")
          .select("name")
          .eq("id", restaurant_id)
          .single();

        // 3. Upsert into public.profiles
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            id: userId,
            email: cleanEmail,
            full_name: cleanName,
            role: "waiter",
            restaurant_id: restaurant_id,
            restaurant_name: restData?.name || null
          });

        if (profileError) {
          console.warn("Profile upsert warning in server:", profileError);
        }

        return res.status(200).json({ 
          success: true, 
          message: "تم إنشاء وتفعيل حساب النادل بنجاح!",
          user_id: userId 
        });
      } else if (anonKey) {
        // Fallback using anon key RPC
        const supabaseAnon = createClient(supabaseUrl, anonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        const { data: rpcData, error: rpcError } = await supabaseAnon.rpc("admin_create_user", {
          new_email: cleanEmail,
          new_password: cleanPassword,
          new_full_name: cleanName,
          new_role: "waiter",
          new_restaurant_id: restaurant_id
        });

        if (!rpcError && rpcData?.success) {
          return res.status(200).json(rpcData);
        }

        // Direct signup fallback
        const { data: authData, error: authError } = await supabaseAnon.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              full_name: cleanName,
              role: "waiter",
              restaurant_id
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          await supabaseAnon.from("profiles").upsert({
            id: authData.user.id,
            email: cleanEmail,
            full_name: cleanName,
            role: "waiter",
            restaurant_id: restaurant_id
          });
        }

        return res.status(200).json({ 
          success: true, 
          message: "تم إنشاء حساب النادل بنجاح!",
          user_id: authData.user?.id 
        });
      } else {
        throw new Error("لا توجد مفاتيح Supabase مهيأة على الخادم.");
      }
    } catch (error: any) {
      console.error("Error creating waiter:", error);
      res.status(400).json({ error: error.message || "فشل في إنشاء حساب النادل" });
    }
  });

  // Call Waiter API endpoint (Guarantees customer can notify waiter even with strict client RLS)
  app.post("/api/call-waiter", async (req, res) => {
    const { restaurant_id, table_id, table_number } = req.body;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم غير محدد." });
    }

    try {
      const client = serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey)
        : createClient(supabaseUrl, anonKey || "");

      let finalTableId = table_id;

      // If table_id is missing or not a UUID, attempt lookup by table_number
      if (!finalTableId && table_number) {
        const { data: tableData } = await client
          .from("tables")
          .select("id")
          .eq("restaurant_id", restaurant_id)
          .eq("table_number", String(table_number))
          .maybeSingle();

        if (tableData) {
          finalTableId = tableData.id;
        }
      }

      const { data, error } = await client
        .from("waiter_calls")
        .insert({
          restaurant_id,
          table_id: finalTableId || null,
          status: "pending"
        })
        .select("id")
        .single();

      if (error) {
        console.error("Database insert error in /api/call-waiter:", error);
        throw error;
      }

      res.status(200).json({
        success: true,
        message: "تم إرسال نداء النادل بنجاح",
        call_id: data?.id
      });
    } catch (err: any) {
      console.error("Call waiter API exception:", err);
      res.status(500).json({ error: err.message || "فشل في إرسال النداء" });
    }
  });

  // Admin Delete Product API endpoint
  app.post("/api/admin/delete-product", async (req, res) => {
    const { product_id } = req.body;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !product_id) {
      return res.status(400).json({ error: "معرف المنتج مطلوب." });
    }

    try {
      const client = serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey)
        : createClient(supabaseUrl, anonKey || "");

      // 1. Decouple from any order items to prevent foreign key errors while preserving order history
      try {
        await client
          .from("order_items")
          .update({ product_id: null })
          .eq("product_id", product_id);
      } catch (fkErr) {
        console.warn("Decoupling order items note:", fkErr);
      }

      // 2. Delete the product
      const { error } = await client.from("products").delete().eq("id", product_id);

      if (error) {
        console.error("Delete product database error:", error);
        throw error;
      }

      res.status(200).json({
        success: true,
        message: "تم حذف المنتج بنجاح"
      });
    } catch (err: any) {
      console.error("Delete product API exception:", err);
      res.status(500).json({ error: err.message || "فشل في حذف المنتج" });
    }
  });

  // Admin Delete Category API endpoint
  app.post("/api/admin/delete-category", async (req, res) => {
    const { category_id } = req.body;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !category_id) {
      return res.status(400).json({ error: "معرف التصنيف مطلوب." });
    }

    try {
      const client = serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey)
        : createClient(supabaseUrl, anonKey || "");

      // 1. Unlink products associated with this category
      try {
        await client
          .from("products")
          .update({ category_id: null })
          .eq("category_id", category_id);
      } catch (catFkErr) {
        console.warn("Unlinking category from products note:", catFkErr);
      }

      // 2. Delete the category
      const { error } = await client.from("categories").delete().eq("id", category_id);

      if (error) {
        console.error("Delete category database error:", error);
        throw error;
      }

      res.status(200).json({
        success: true,
        message: "تم حذف التصنيف بنجاح"
      });
    } catch (err: any) {
      console.error("Delete category API exception:", err);
      res.status(500).json({ error: err.message || "فشل في حذف التصنيف" });
    }
  });

  // Persistent category options file store
  const optionsFilePath = path.join(process.cwd(), "category-options.json");
  let categoryOptionsStore: Record<string, any> = {};

  try {
    if (fs.existsSync(optionsFilePath)) {
      const fileData = fs.readFileSync(optionsFilePath, "utf-8");
      categoryOptionsStore = JSON.parse(fileData || "{}");
    }
  } catch (e) {
    console.warn("Could not read category-options.json:", e);
  }

  const persistCategoryOptions = () => {
    try {
      fs.writeFileSync(optionsFilePath, JSON.stringify(categoryOptionsStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write category-options.json:", e);
    }
  };

  // Save Category Options API
  app.post("/api/admin/save-category-options", async (req, res) => {
    const { category_id, options } = req.body;
    if (!category_id) {
      return res.status(400).json({ error: "معرف التصنيف مطلوب." });
    }

    try {
      categoryOptionsStore[category_id] = options || [];
      persistCategoryOptions();
      
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl) {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        // Attempt update in database if column exists
        try {
          await client.from("categories").update({ options }).eq("id", category_id);
        } catch (dbErr) {
          // Column might not exist in Supabase yet, local store handles it
        }
      }

      res.status(200).json({ success: true, message: "تم حفظ خيارات التصنيف بنجاح", options });
    } catch (err: any) {
      console.error("Save category options error:", err);
      res.status(500).json({ error: err.message || "فشل في حفظ الخيارات" });
    }
  });

  // Get All Category Options API
  app.get("/api/category-options", (req, res) => {
    res.status(200).json({ options: categoryOptionsStore });
  });

  // Persistent product options file store (for size pricing & custom product options)
  const productOptionsFilePath = path.join(process.cwd(), "product-options.json");
  let productOptionsStore: Record<string, any> = {};

  try {
    if (fs.existsSync(productOptionsFilePath)) {
      const pData = fs.readFileSync(productOptionsFilePath, "utf-8");
      productOptionsStore = JSON.parse(pData || "{}");
    }
  } catch (e) {
    console.warn("Could not read product-options.json:", e);
  }

  const persistProductOptions = () => {
    try {
      fs.writeFileSync(productOptionsFilePath, JSON.stringify(productOptionsStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write product-options.json:", e);
    }
  };

  // Save Product Options API
  app.post("/api/admin/save-product-options", async (req, res) => {
    const { product_id, options } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: "معرف المنتج مطلوب." });
    }

    try {
      productOptionsStore[product_id] = options || [];
      persistProductOptions();

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl) {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        try {
          await client.from("products").update({ options }).eq("id", product_id);
        } catch (dbErr) {
          // Column might not exist in Supabase yet, local store handles it
        }
      }

      res.status(200).json({ success: true, message: "تم حفظ خيارات وأسعار المنتج بنجاح", options });
    } catch (err: any) {
      console.error("Save product options error:", err);
      res.status(500).json({ error: err.message || "فشل في حفظ خيارات المنتج" });
    }
  });

  // Get All Product Options API
  app.get("/api/product-options", (req, res) => {
    res.status(200).json({ options: productOptionsStore });
  });

  // Persistent restaurant geofences store
  const geofencesFilePath = path.join(process.cwd(), "restaurant-geofences.json");
  let restaurantGeofencesStore: Record<string, any> = {};

  try {
    if (fs.existsSync(geofencesFilePath)) {
      const gData = fs.readFileSync(geofencesFilePath, "utf-8");
      restaurantGeofencesStore = JSON.parse(gData || "{}");
    }
  } catch (e) {
    console.warn("Could not read restaurant-geofences.json:", e);
  }

  const persistGeofences = () => {
    try {
      fs.writeFileSync(geofencesFilePath, JSON.stringify(restaurantGeofencesStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write restaurant-geofences.json:", e);
    }
  };

  // Save Restaurant Geofence API
  app.post("/api/restaurants/geofence", async (req, res) => {
    const { restaurant_id, geofence } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      restaurantGeofencesStore[restaurant_id] = geofence || {};
      if (req.body.slug) {
        restaurantGeofencesStore[req.body.slug] = geofence || {};
      }
      persistGeofences();

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && geofence) {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        try {
          await client.from("restaurants").update({
            geofence_enabled: geofence.geofence_enabled,
            latitude: geofence.latitude,
            longitude: geofence.longitude,
            geofence_radius_meters: geofence.geofence_radius_meters,
            service_fee_percentage: geofence.service_fee_percentage,
            is_prepaid: geofence.is_prepaid,
            payment_model: geofence.payment_model
          }).eq("id", restaurant_id);
        } catch (dbErr) {
          // In case column doesn't exist yet, file store is the source of truth
        }
      }

      res.status(200).json({ success: true, message: "تم حفظ النطاق الجغرافي للمطعم", geofence });
    } catch (err: any) {
      console.error("Save restaurant geofence error:", err);
      res.status(500).json({ error: err.message || "فشل في حفظ النطاق الجغرافي" });
    }
  });

  // Get All Restaurant Geofences API
  app.get("/api/restaurants/geofence", (req, res) => {
    res.status(200).json({ geofences: restaurantGeofencesStore });
  });

  // Persistent daily order sequence store (starts from 1 each day at 12:00 AM)
  const dailySequenceFilePath = path.join(process.cwd(), "daily-order-sequences.json");
  let dailySequenceStore: Record<string, number> = {};

  try {
    if (fs.existsSync(dailySequenceFilePath)) {
      const sData = fs.readFileSync(dailySequenceFilePath, "utf-8");
      dailySequenceStore = JSON.parse(sData || "{}");
    }
  } catch (e) {
    console.warn("Could not read daily-order-sequences.json:", e);
  }

  const persistDailySequences = () => {
    try {
      fs.writeFileSync(dailySequenceFilePath, JSON.stringify(dailySequenceStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write daily-order-sequences.json:", e);
    }
  };

  // API to get/assign daily sequence order number per restaurant
  app.get("/api/orders/daily-sequence", (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const storeKey = `${restaurantId}_${dateKey}`;
    const currentSaved = dailySequenceStore[storeKey] || 0;
    res.status(200).json({ success: true, restaurant_id: restaurantId, date: dateKey, current_sequence: currentSaved });
  });

  app.post("/api/orders/daily-sequence", async (req, res) => {
    const { restaurant_id, action } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      const now = new Date();
      // Date in YYYY-MM-DD
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const storeKey = `${restaurant_id}_${dateKey}`;

      // Check highest number in today's live orders
      let highestLiveNum = 0;
      const liveForRest = liveOrdersStore[restaurant_id] || [];
      liveForRest.forEach((o: any) => {
        if (o.created_at && o.created_at.slice(0, 10) === dateKey && o.daily_order_number) {
          const numVal = parseInt(String(o.daily_order_number), 10);
          if (!isNaN(numVal) && numVal > highestLiveNum) {
            highestLiveNum = numVal;
          }
        }
      });

      // Also count today's orders in database and inspect highest daily order number
      let dbCount = 0;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl) {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        try {
          const { data: dbOrders, error } = await client
            .from("orders")
            .select("id, created_at, order_items(notes)")
            .eq("restaurant_id", restaurant_id)
            .gte("created_at", startOfDay.toISOString());

          if (!error && Array.isArray(dbOrders)) {
            dbCount = dbOrders.length;
            dbOrders.forEach((ord: any) => {
              const note = ord.order_items?.[0]?.notes || '';
              const match = note.match(/#(\d+)/);
              if (match && match[1]) {
                const parsed = parseInt(match[1], 10);
                if (!isNaN(parsed) && parsed > dbCount) {
                  dbCount = parsed;
                }
              }
            });
          }
        } catch (dbErr) {
          console.warn("Daily count error from DB:", dbErr);
        }
      }

      const currentSaved = dailySequenceStore[storeKey] || 0;
      const baseMax = Math.max(currentSaved, highestLiveNum, dbCount);
      let sequence = baseMax;

      if (action === 'next') {
        sequence = baseMax + 1;
        if (sequence <= 0) sequence = 1;
        dailySequenceStore[storeKey] = sequence;
        persistDailySequences();
      } else if (action === 'sync' && req.body.current_number) {
        const num = parseInt(req.body.current_number, 10) || 0;
        if (num > sequence) {
          sequence = num;
          dailySequenceStore[storeKey] = sequence;
          persistDailySequences();
        }
      } else {
        if (sequence <= 0) {
          sequence = 1;
          dailySequenceStore[storeKey] = sequence;
          persistDailySequences();
        }
      }

      res.status(200).json({
        success: true,
        restaurant_id,
        date: dateKey,
        daily_order_number: sequence
      });
    } catch (err: any) {
      console.error("Daily sequence API error:", err);
      res.status(500).json({ error: err.message || "فشل في جلب رقم الطلب اليومي" });
    }
  });

  // Persistent Live Orders Store (supports Customer App & POS synchronization)
  const liveOrdersFilePath = path.join(process.cwd(), "live-orders.json");
  let liveOrdersStore: Record<string, any[]> = {}; // restaurant_id -> orders[]

  try {
    if (fs.existsSync(liveOrdersFilePath)) {
      const oData = fs.readFileSync(liveOrdersFilePath, "utf-8");
      liveOrdersStore = JSON.parse(oData || "{}");
    }
  } catch (e) {
    console.warn("Could not read live-orders.json:", e);
  }

  const persistLiveOrders = () => {
    try {
      fs.writeFileSync(liveOrdersFilePath, JSON.stringify(liveOrdersStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write live-orders.json:", e);
    }
  };

  // POST /api/orders/live - Add or update live order
  app.post("/api/orders/live", (req, res) => {
    const orderData = req.body;
    const restaurantId = orderData.restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      if (!liveOrdersStore[restaurantId]) {
        liveOrdersStore[restaurantId] = [];
      }

      const existingIndex = liveOrdersStore[restaurantId].findIndex(
        (o: any) => String(o.id) === String(orderData.id)
      );

      const orderRecord = {
        ...orderData,
        updated_at: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        liveOrdersStore[restaurantId][existingIndex] = {
          ...liveOrdersStore[restaurantId][existingIndex],
          ...orderRecord,
        };
      } else {
        liveOrdersStore[restaurantId].unshift(orderRecord);
      }

      // Keep recent 200 orders per restaurant
      if (liveOrdersStore[restaurantId].length > 200) {
        liveOrdersStore[restaurantId] = liveOrdersStore[restaurantId].slice(0, 200);
      }

      persistLiveOrders();
      res.status(200).json({ success: true, order: orderRecord });
    } catch (err: any) {
      console.error("Live order save error:", err);
      res.status(500).json({ error: err.message || "فشل في حفظ الطلب المباشر" });
    }
  });

  // GET /api/orders/live - Get live orders for a restaurant (merges in-memory and Supabase)
  app.get("/api/orders/live", async (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    let orders = liveOrdersStore[restaurantId] || [];

    // Also enrich from Supabase if available so orders persist across server restarts or different tabs
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl) {
      try {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        const { data: dbOrders, error } = await client
          .from("orders")
          .select("*, order_items(*, products(*)), tables(table_number)")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(60);

        if (!error && Array.isArray(dbOrders)) {
          const mergedMap = new Map<string, any>();
          
          // First add existing in-memory live orders
          orders.forEach((o: any) => mergedMap.set(String(o.id), o));

          // Then map dbOrders
          dbOrders.forEach((dbo: any) => {
            const firstNote = dbo.order_items?.[0]?.notes || '';
            const isCustomer = firstNote.includes('[طلب زبون') || (!dbo.waiter_id && (dbo.status === 'new' || dbo.status === 'preparing'));
            const numMatch = firstNote.match(/#(\d+)/);
            const dailyNum = numMatch ? parseInt(numMatch[1], 10) : dbo.id;

            let orderType = 'dine_in';
            if (firstNote.includes('دليفري')) orderType = 'delivery';
            else if (firstNote.includes('سفري')) orderType = 'takeaway';

            const tableNumMatch = firstNote.match(/طاولة\s*([^|\]]+)/);
            const tableNum = dbo.tables?.table_number || (tableNumMatch ? tableNumMatch[1].trim() : null);

            // Delivery info
            const nameMatch = firstNote.match(/الاسم:\s*([^|\]]+)/);
            const phoneMatch = firstNote.match(/هاتف:\s*([^|\]]+)/);
            const addrMatch = firstNote.match(/العنوان:\s*([^|\]]+)/);

            const mappedOrder = {
              id: dbo.id,
              daily_order_number: dailyNum,
              restaurant_id: dbo.restaurant_id,
              source: isCustomer ? 'customer_app' : 'pos',
              order_type: orderType,
              table_id: dbo.table_id,
              table_number: tableNum,
              customer_name: nameMatch ? nameMatch[1].trim() : undefined,
              customer_phone: phoneMatch ? phoneMatch[1].trim() : undefined,
              delivery_address: addrMatch ? addrMatch[1].trim() : undefined,
              notes: firstNote,
              total_price: Number(dbo.total_price || 0),
              status: dbo.status || 'new',
              payment_status: 'unpaid',
              items: (dbo.order_items || []).map((it: any) => ({
                id: it.product_id,
                name: it.products?.name_ar || it.products?.name_en || 'صنف',
                quantity: it.quantity,
                price: Number(it.price_at_order || 0),
                notes: it.notes,
                sugar_level: it.sugar_level
              })),
              created_at: dbo.created_at
            };

            const existing = mergedMap.get(String(dbo.id));
            if (!existing) {
              mergedMap.set(String(dbo.id), mappedOrder);
            } else {
              // Merge status if db has newer status
              mergedMap.set(String(dbo.id), {
                ...mappedOrder,
                ...existing,
                status: dbo.status || existing.status
              });
            }
          });

          orders = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          liveOrdersStore[restaurantId] = orders;
          persistLiveOrders();
        }
      } catch (dbErr) {
        console.warn("Live orders DB sync error:", dbErr);
      }
    }

    res.status(200).json({ success: true, orders });
  });

  // GET /api/customer/orders - Lookup previous customer orders by email or phone
  app.get("/api/customer/orders", async (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    const email = ((req.query.email as string) || "").trim().toLowerCase();
    const phone = ((req.query.phone as string) || "").trim();

    if (!email && !phone) {
      return res.status(400).json({ error: "البريد الإلكتروني أو رقم الهاتف مطلوب للبحث." });
    }

    try {
      const matchedMap = new Map<string, any>();

      // 1. Search in in-memory / persistent live orders
      const restIds = restaurantId ? [restaurantId] : Object.keys(liveOrdersStore);
      for (const rid of restIds) {
        const orders = liveOrdersStore[rid] || [];
        for (const ord of orders) {
          const ordEmail = ((ord.customer_email as string) || "").trim().toLowerCase();
          const ordPhone = ((ord.customer_phone as string) || "").trim();
          const ordNotes = ((ord.notes as string) || "").toLowerCase();

          const matchesEmail = email && (ordEmail === email || ordNotes.includes(email));
          const matchesPhone = phone && (
            ordPhone === phone || 
            (ordPhone.length >= 8 && phone.includes(ordPhone)) || 
            (phone.length >= 8 && ordPhone.includes(phone)) || 
            ordNotes.includes(phone)
          );

          if (matchesEmail || matchesPhone) {
            matchedMap.set(String(ord.id), ord);
          }
        }
      }

      // 2. Search in Supabase if configured
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl) {
        try {
          const client = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : createClient(supabaseUrl, anonKey || "");

          let dbQuery = client
            .from("orders")
            .select("*, order_items(*, products(*)), tables(table_number)")
            .order("created_at", { ascending: false })
            .limit(100);

          if (restaurantId) {
            dbQuery = dbQuery.eq("restaurant_id", restaurantId);
          }

          const { data: dbOrders, error } = await dbQuery;

          if (!error && dbOrders) {
            dbOrders.forEach((dbo: any) => {
              const firstItemNotes = ((dbo.order_items?.[0]?.notes as string) || "").toLowerCase();
              const matchesEmail = email && firstItemNotes.includes(email);
              const matchesPhone = phone && firstItemNotes.includes(phone);

              if (matchesEmail || matchesPhone) {
                if (!matchedMap.has(String(dbo.id))) {
                  matchedMap.set(String(dbo.id), {
                    id: dbo.id,
                    daily_order_number: dbo.daily_order_number || dbo.id,
                    restaurant_id: dbo.restaurant_id,
                    source: "customer_app",
                    order_type: firstItemNotes.includes("دليفري") ? "delivery" : "dine_in",
                    table_id: dbo.table_id,
                    table_number: dbo.tables?.table_number,
                    total_price: dbo.total_price,
                    status: dbo.status || "new",
                    payment_status: dbo.payment_status || "unpaid",
                    customer_email: email,
                    customer_phone: phone,
                    items: (dbo.order_items || []).map((it: any) => ({
                      id: it.product_id,
                      name: it.products?.name_ar || it.products?.name_en || "صنف",
                      quantity: it.quantity,
                      price: it.price_at_order || it.products?.price || 0,
                      notes: it.notes,
                      sugar_level: it.sugar_level
                    })),
                    created_at: dbo.created_at
                  });
                }
              }
            });
          }
        } catch (dbErr) {
          console.warn("Customer orders DB lookup warning:", dbErr);
        }
      }

      const sortedOrders = Array.from(matchedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      res.status(200).json({ success: true, orders: sortedOrders });
    } catch (err: any) {
      console.error("Customer orders lookup error:", err);
      res.status(500).json({ error: err.message || "فشل في جلب طلبات الزبون" });
    }
  });

  // PATCH /api/orders/live/:id/status - Update status of an order
  app.patch("/api/orders/live/:id/status", async (req, res) => {
    const orderId = req.params.id;
    const { restaurant_id, status, payment_status } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      const orders = liveOrdersStore[restaurant_id] || [];
      const order = orders.find((o: any) => String(o.id) === String(orderId));
      if (order) {
        if (status) order.status = status;
        if (payment_status) order.payment_status = payment_status;
        order.updated_at = new Date().toISOString();
        persistLiveOrders();
      }

      // Also update Supabase orders table
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && status) {
        try {
          const client = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : createClient(supabaseUrl, anonKey || "");

          const updatePayload: any = { status };
          if (status === 'preparing') updatePayload.preparing_at = new Date().toISOString();
          if (status === 'completed' || status === 'delivered') updatePayload.delivered_at = new Date().toISOString();
          if (status === 'cancelled') updatePayload.cancelled_at = new Date().toISOString();

          const numId = parseInt(orderId, 10);
          if (!isNaN(numId)) {
            await client.from("orders").update(updatePayload).eq("id", numId);
          } else {
            await client.from("orders").update(updatePayload).eq("id", orderId);
          }
        } catch (dbErr) {
          console.warn("DB status update error:", dbErr);
        }
      }

      res.status(200).json({ success: true, order });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "فشل في تحديث حالة الطلب" });
    }
  });

  // Persistent Inventory Store (Stock, Movements, Audits, Shift Logs)
  const inventoryFilePath = path.join(process.cwd(), "inventory-store.json");
  let inventoryStore: Record<string, {
    stock: Record<string, number>;
    minAlerts: Record<string, number>;
    movements: any[];
    shiftLogs: any[];
    audits: any[];
  }> = {};

  try {
    if (fs.existsSync(inventoryFilePath)) {
      const invData = fs.readFileSync(inventoryFilePath, "utf-8");
      inventoryStore = JSON.parse(invData || "{}");
    }
  } catch (e) {
    console.warn("Could not read inventory-store.json:", e);
  }

  const persistInventory = () => {
    try {
      fs.writeFileSync(inventoryFilePath, JSON.stringify(inventoryStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write inventory-store.json:", e);
    }
  };

  // GET /api/inventory - Get restaurant inventory, movements and alerts
  app.get("/api/inventory", (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    const data = inventoryStore[restaurantId] || {
      stock: {},
      minAlerts: {},
      movements: [],
      shiftLogs: [],
      audits: []
    };

    res.status(200).json({ success: true, ...data });
  });

  // POST /api/inventory/update - Adjust stock (Stock In, Waste, Sale, Manual)
  app.post("/api/inventory/update", (req, res) => {
    const { restaurant_id, productId, productName, newStock, delta, type, reason, performedBy, minAlert } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      if (!inventoryStore[restaurant_id]) {
        inventoryStore[restaurant_id] = {
          stock: {},
          minAlerts: {},
          movements: [],
          shiftLogs: [],
          audits: []
        };
      }

      const restInv = inventoryStore[restaurant_id];
      const prevStock = restInv.stock[productId] ?? 20;
      let finalStock = prevStock;

      if (typeof newStock === 'number') {
        finalStock = newStock;
      } else if (typeof delta === 'number') {
        finalStock = Math.max(0, prevStock + delta);
      }

      if (productId) {
        restInv.stock[productId] = finalStock;
      }

      if (minAlert !== undefined && productId) {
        restInv.minAlerts[productId] = minAlert;
      }

      if (productId && (type || reason)) {
        const movement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId,
          productName: productName || productId,
          type: type || 'adjustment', // 'stock_in' | 'waste' | 'sale' | 'audit' | 'adjustment'
          quantity: delta !== undefined ? Math.abs(delta) : Math.abs(finalStock - prevStock),
          prevStock,
          newStock: finalStock,
          reason: reason || '',
          performedBy: performedBy || 'المدير',
          timestamp: new Date().toISOString()
        };
        restInv.movements.unshift(movement);
        if (restInv.movements.length > 500) {
          restInv.movements = restInv.movements.slice(0, 500);
        }
      }

      persistInventory();
      res.status(200).json({
        success: true,
        productId,
        currentStock: finalStock,
        movements: restInv.movements.slice(0, 20)
      });
    } catch (err: any) {
      console.error("Inventory update error:", err);
      res.status(500).json({ error: err.message || "فشل في تحديث المخزون" });
    }
  });

  // POST /api/inventory/shift-log - Record shift events for Admin cash drawer monitor
  app.post("/api/inventory/shift-log", (req, res) => {
    const { restaurant_id, shiftRecord } = req.body;
    if (!restaurant_id || !shiftRecord) {
      return res.status(400).json({ error: "البيانات غير مكتملة." });
    }

    try {
      if (!inventoryStore[restaurant_id]) {
        inventoryStore[restaurant_id] = {
          stock: {},
          minAlerts: {},
          movements: [],
          shiftLogs: [],
          audits: []
        };
      }

      const restInv = inventoryStore[restaurant_id];
      const existingIdx = restInv.shiftLogs.findIndex((s: any) => s.id === shiftRecord.id);
      if (existingIdx >= 0) {
        restInv.shiftLogs[existingIdx] = shiftRecord;
      } else {
        restInv.shiftLogs.unshift(shiftRecord);
      }

      if (restInv.shiftLogs.length > 100) {
        restInv.shiftLogs = restInv.shiftLogs.slice(0, 100);
      }

      persistInventory();
      res.status(200).json({ success: true, message: "تم تسجيل حركة الشيفت بنجاح" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "فشل في تسجيل حركة الشيفت" });
    }
  });

  // Persistent restaurant delivery zones store
  const deliveryZonesFilePath = path.join(process.cwd(), "restaurant-delivery-zones.json");
  let restaurantDeliveryZonesStore: Record<string, any> = {};

  try {
    if (fs.existsSync(deliveryZonesFilePath)) {
      const dData = fs.readFileSync(deliveryZonesFilePath, "utf-8");
      restaurantDeliveryZonesStore = JSON.parse(dData || "{}");
    }
  } catch (e) {
    console.warn("Could not read restaurant-delivery-zones.json:", e);
  }

  const persistDeliveryZones = () => {
    try {
      fs.writeFileSync(deliveryZonesFilePath, JSON.stringify(restaurantDeliveryZonesStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write restaurant-delivery-zones.json:", e);
    }
  };

  // Save Restaurant Delivery Zones API
  app.post("/api/restaurants/save-delivery-zones", async (req, res) => {
    const { restaurant_id, delivery_zones } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      restaurantDeliveryZonesStore[restaurant_id] = delivery_zones || [];
      persistDeliveryZones();

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && delivery_zones) {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        try {
          await client.from("restaurants").update({
            delivery_zones: delivery_zones
          }).eq("id", restaurant_id);
        } catch (dbErr) {
          // File store is the primary reliable store
        }
      }

      res.status(200).json({ success: true, message: "تم حفظ مناطق ورسوم التوصيل بنجاح", delivery_zones });
    } catch (err: any) {
      console.error("Save restaurant delivery zones error:", err);
      res.status(500).json({ error: err.message || "فشل في حفظ مناطق التوصيل" });
    }
  });

  const DEFAULT_DELIVERY_ZONES_SERVER = [
    { id: 'dz_ps', name: 'بورسعيد', fee: 30, estimated_time: '30-45 دقيقة', is_active: true },
    { id: 'dz_pf', name: 'بورفؤاد', fee: 40, estimated_time: '40-50 دقيقة', is_active: true },
    { id: 'dz_fy', name: 'الفيروز', fee: 50, estimated_time: '45-60 دقيقة', is_active: true },
    { id: 'dz_em', name: 'الحي الاماراتي', fee: 50, estimated_time: '45-60 دقيقة', is_active: true },
  ];

  // Get All Restaurant Delivery Zones API
  app.get("/api/restaurants/delivery-zones", (req, res) => {
    res.status(200).json({ 
      delivery_zones: restaurantDeliveryZonesStore,
      default_zones: DEFAULT_DELIVERY_ZONES_SERVER
    });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

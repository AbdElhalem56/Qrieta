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

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Ensure uploads directory exists and is statically served
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "products");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

  // Supabase Cloud Storage & Database Sync Engine
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  const getSupabaseAdmin = () => {
    if (!supabaseUrl) return null;
    return createClient(supabaseUrl, serviceRoleKey || anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  };

  let isSystemBucketReady = false;
  const ensureSystemBucket = async () => {
    if (isSystemBucketReady) return;
    const client = getSupabaseAdmin();
    if (!client) return;
    try {
      const { data: buckets } = await client.storage.listBuckets();
      if (!buckets?.some((b: any) => b.name === "system-data")) {
        await client.storage.createBucket("system-data", { public: false });
      }
      isSystemBucketReady = true;
    } catch (e) {
      console.warn("System storage bucket initialization warning:", e);
    }
  };

  const loadFromSupabaseStorage = async <T>(storagePath: string, fallback: T): Promise<T> => {
    const client = getSupabaseAdmin();
    if (!client) return fallback;
    try {
      await ensureSystemBucket();
      const { data, error } = await client.storage.from("system-data").download(storagePath);
      if (!error && data) {
        const text = await data.text();
        return JSON.parse(text) as T;
      }
    } catch (err) {
      // Return fallback silently if not uploaded yet
    }
    return fallback;
  };

  const saveToSupabaseStorage = async (storagePath: string, payload: any): Promise<void> => {
    const client = getSupabaseAdmin();
    if (!client) return;
    try {
      await ensureSystemBucket();
      await client.storage.from("system-data").upload(storagePath, JSON.stringify(payload, null, 2), {
        contentType: "application/json",
        upsert: true
      });
    } catch (err) {
      console.warn(`Supabase storage sync warning for ${storagePath}:`, err);
    }
  };

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

  // Admin Upload Product Image API endpoint
  app.post("/api/admin/upload-product-image", async (req, res) => {
    const { image_data, file_name, product_id, mime_type } = req.body;
    if (!image_data) {
      return res.status(400).json({ error: "بيانات الصورة مطلوبة." });
    }

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      let publicUrl = "";

      // 1. Try Supabase Storage if configured
      if (supabaseUrl && (serviceRoleKey || anonKey)) {
        try {
          const client = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : createClient(supabaseUrl, anonKey || "");

          // Check or create 'product-images' bucket
          const { data: buckets } = await client.storage.listBuckets();
          if (!buckets?.some((b: any) => b.name === "product-images")) {
            await client.storage.createBucket("product-images", { public: true });
          }

          // Extract base64 payload
          const base64Parts = image_data.split(";base64,");
          const contentType = mime_type || (base64Parts[0] ? base64Parts[0].replace("data:", "") : "image/jpeg");
          const rawData = base64Parts[1] || image_data;
          const buffer = Buffer.from(rawData, "base64");

          const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
          const cleanName = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

          const { error: uploadError } = await client.storage
            .from("product-images")
            .upload(cleanName, buffer, {
              contentType,
              upsert: true,
            });

          if (!uploadError) {
            const { data: pubData } = client.storage.from("product-images").getPublicUrl(cleanName);
            if (pubData?.publicUrl) {
              publicUrl = pubData.publicUrl;
            }
          } else {
            console.warn("Supabase storage upload error, using local/data url fallback:", uploadError);
          }
        } catch (storageErr) {
          console.warn("Storage exception, using fallback:", storageErr);
        }
      }

      // 2. If storage URL wasn't generated, save to public/uploads directory or use data URL
      if (!publicUrl) {
        try {
          const targetDir = path.join(process.cwd(), "public", "uploads", "products");
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const base64Parts = image_data.split(";base64,");
          const contentType = mime_type || (base64Parts[0] ? base64Parts[0].replace("data:", "") : "image/jpeg");
          const rawData = base64Parts[1] || image_data;
          const buffer = Buffer.from(rawData, "base64");
          const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
          const localFileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
          fs.writeFileSync(path.join(targetDir, localFileName), buffer);
          publicUrl = `/uploads/products/${localFileName}`;
        } catch (localFsErr) {
          publicUrl = image_data;
        }
      }

      // 3. If product_id is given, update product in Supabase directly
      if (product_id && supabaseUrl && (serviceRoleKey || anonKey)) {
        try {
          const client = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : createClient(supabaseUrl, anonKey || "");
          await client.from("products").update({ image_url: publicUrl }).eq("id", product_id);
        } catch (dbErr) {
          console.warn("Updating product image in DB note:", dbErr);
        }
      }

      res.status(200).json({
        success: true,
        image_url: publicUrl,
        message: "تم حفظ صورة المنتج بنجاح",
      });
    } catch (err: any) {
      console.error("Upload product image exception:", err);
      res.status(500).json({ error: err.message || "فشل في رفع الصورة" });
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
  app.get("/api/product-options", async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl) {
        const client = serviceRoleKey
          ? createClient(supabaseUrl, serviceRoleKey)
          : createClient(supabaseUrl, anonKey || "");

        const { data } = await client
          .from("products")
          .select("id, options")
          .not("options", "is", null);

        if (data && Array.isArray(data)) {
          data.forEach((p: any) => {
            let opts = p.options;
            if (typeof opts === "string") {
              try { opts = JSON.parse(opts); } catch (e) { opts = null; }
            }
            if (Array.isArray(opts) && opts.length > 0) {
              if (!productOptionsStore[p.id] || productOptionsStore[p.id].length === 0) {
                productOptionsStore[p.id] = opts;
              }
            }
          });
          persistProductOptions();
        }
      }
    } catch (e) {
      console.warn("Could not sync product options from Supabase:", e);
    }
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

  // Persistent Live Orders Store (supports Customer App & POS synchronization)
  const liveOrdersFilePath = path.join(process.cwd(), "live-orders.json");
  let liveOrdersStore: Record<string, any[]> = {}; // restaurant_id/slug -> orders[]

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

  // Restaurant Canonical Resolution Map (bidirectional: slug <-> UUID id)
  const restaurantSlugToId: Record<string, string> = {};
  const restaurantIdToSlug: Record<string, string> = {};

  // Pre-populate restaurant maps on boot
  const initRestaurantMaps = async () => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
      if (supabaseUrl) {
        const client = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : createClient(supabaseUrl, anonKey || "");
        const { data } = await client.from("restaurants").select("id, slug, name");
        if (Array.isArray(data)) {
          data.forEach((r: any) => {
            if (r.id) {
              if (r.slug) {
                const s = String(r.slug).toLowerCase();
                restaurantSlugToId[s] = r.id;
                restaurantIdToSlug[r.id] = s;
              }
              if (r.name) {
                restaurantSlugToId[String(r.name).toLowerCase()] = r.id;
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn("Could not pre-populate restaurant maps:", e);
    }
  };
  initRestaurantMaps().catch(() => {});

  const resolveRestaurantAliases = async (input: string): Promise<{ canonicalId: string; canonicalSlug: string; aliases: string[] }> => {
    if (!input || typeof input !== 'string') {
      return { canonicalId: '', canonicalSlug: '', aliases: [] };
    }
    const clean = input.trim();
    const cleanLower = clean.toLowerCase();

    // Check in-memory maps first
    let canonicalId = restaurantSlugToId[cleanLower] || (restaurantIdToSlug[clean] ? clean : '');
    let canonicalSlug = restaurantIdToSlug[clean] || (restaurantSlugToId[cleanLower] ? cleanLower : '');

    // If not cached, query Supabase to populate
    if (!canonicalId || !canonicalSlug) {
      try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (supabaseUrl) {
          const client = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : createClient(supabaseUrl, anonKey || "");
          const { data } = await client.from("restaurants").select("id, slug, name");
          if (Array.isArray(data)) {
            data.forEach((r: any) => {
              if (r.id) {
                if (r.slug) {
                  const s = String(r.slug).toLowerCase();
                  restaurantSlugToId[s] = r.id;
                  restaurantIdToSlug[r.id] = s;
                }
                if (r.name) {
                  restaurantSlugToId[String(r.name).toLowerCase()] = r.id;
                }
              }
            });
          }
          canonicalId = restaurantSlugToId[cleanLower] || (restaurantIdToSlug[clean] ? clean : clean);
          canonicalSlug = restaurantIdToSlug[canonicalId] || cleanLower;
        }
      } catch (e) {
        console.warn("Could not refresh restaurants map:", e);
      }
    }

    if (!canonicalId) canonicalId = clean;
    if (!canonicalSlug) canonicalSlug = cleanLower;

    const aliasesSet = new Set<string>([clean, cleanLower, canonicalId, canonicalSlug].filter(Boolean));
    return {
      canonicalId,
      canonicalSlug,
      aliases: Array.from(aliasesSet)
    };
  };

  // Mutex lock to serialize sequence increments per restaurant and avoid race conditions
  const restaurantSequenceLocks = new Map<string, Promise<any>>();
  const withRestaurantSequenceLock = async <T>(lockKey: string, task: () => Promise<T>): Promise<T> => {
    const prev = restaurantSequenceLocks.get(lockKey) || Promise.resolve();
    let releaseLock: () => void = () => {};
    const next = new Promise<void>(resolve => { releaseLock = resolve; });
    const runTask = prev.then(async () => {
      try {
        return await task();
      } finally {
        releaseLock();
      }
    }, async () => {
      try {
        return await task();
      } finally {
        releaseLock();
      }
    });
    restaurantSequenceLocks.set(lockKey, runTask);
    return runTask;
  };

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
    saveToSupabaseStorage("system/daily-sequences.json", dailySequenceStore).catch(() => {});
  };

  // Helper to get local date key (Africa/Cairo or local)
  const getTodayDateKey = () => {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(new Date()); // YYYY-MM-DD in Egypt
    } catch (e) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  };

  const getCairoDateForIso = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(new Date(isoStr));
    } catch (e) {
      return isoStr.slice(0, 10);
    }
  };

  // API to get/assign daily sequence order number per restaurant
  app.get("/api/orders/daily-sequence", async (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }
    const { canonicalId, canonicalSlug, aliases } = await resolveRestaurantAliases(restaurantId);
    const dateKey = getTodayDateKey();
    
    let currentSaved = 0;
    aliases.forEach(a => {
      const k = `${a}_${dateKey}`;
      if (dailySequenceStore[k] && dailySequenceStore[k] > currentSaved) {
        currentSaved = dailySequenceStore[k];
      }
    });

    res.status(200).json({
      success: true,
      restaurant_id: canonicalId,
      slug: canonicalSlug,
      date: dateKey,
      current_sequence: currentSaved
    });
  });

  app.post("/api/orders/daily-sequence", async (req, res) => {
    const { restaurant_id, action } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      const { canonicalId, canonicalSlug, aliases } = await resolveRestaurantAliases(restaurant_id);
      const lockKey = canonicalId || restaurant_id;

      const result = await withRestaurantSequenceLock(lockKey, async () => {
        const dateKey = getTodayDateKey();

        // 1. Check existing saved sequence across ALL aliases for today
        let currentSaved = 0;
        aliases.forEach(a => {
          const k = `${a}_${dateKey}`;
          if (dailySequenceStore[k] && dailySequenceStore[k] > currentSaved) {
            currentSaved = dailySequenceStore[k];
          }
        });

        // 2. Check highest number in today's live orders across all aliases
        let highestLiveNum = 0;
        const checkedLiveOrderIds = new Set<string>();
        aliases.forEach(aliasKey => {
          const liveForAlias = liveOrdersStore[aliasKey] || [];
          liveForAlias.forEach((o: any) => {
            const ordId = String(o.id || '');
            if (ordId && checkedLiveOrderIds.has(ordId)) return;
            if (ordId) checkedLiveOrderIds.add(ordId);

            const cairoDate = getCairoDateForIso(o.created_at);
            const isToday = cairoDate === dateKey;
            if (isToday) {
              let numVal = 0;
              if (o.daily_order_number) {
                numVal = parseInt(String(o.daily_order_number), 10);
              }
              if (!numVal || isNaN(numVal)) {
                const noteText = o.notes || o.delivery_notes || o.items?.[0]?.notes || '';
                const match = String(noteText).match(/#(\d+)/);
                if (match && match[1]) {
                  numVal = parseInt(match[1], 10);
                }
              }
              if (!isNaN(numVal) && numVal > highestLiveNum) {
                highestLiveNum = numVal;
              }
            }
          });
        });

        // 3. Check today's orders in Supabase across all aliases
        let dbCount = 0;
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

        if (supabaseUrl) {
          const client = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : createClient(supabaseUrl, anonKey || "");

          const checkSince = new Date(Date.now() - 36 * 60 * 60 * 1000);

          try {
            const { data: dbOrders, error } = await client
              .from("orders")
              .select("id, created_at, order_items(notes)")
              .in("restaurant_id", aliases)
              .gte("created_at", checkSince.toISOString());

            if (!error && Array.isArray(dbOrders)) {
              dbOrders.forEach((ord: any) => {
                const cairoDate = getCairoDateForIso(ord.created_at);
                if (cairoDate === dateKey) {
                  if (Array.isArray(ord.order_items)) {
                    ord.order_items.forEach((it: any) => {
                      const note = it?.notes || '';
                      const match = String(note).match(/#(\d+)/);
                      if (match && match[1]) {
                        const parsed = parseInt(match[1], 10);
                        if (!isNaN(parsed) && parsed > dbCount) {
                          dbCount = parsed;
                        }
                      }
                    });
                  }
                }
              });
            }
          } catch (dbErr) {
            console.warn("Daily count error from DB:", dbErr);
          }
        }

        const baseMax = Math.max(currentSaved, highestLiveNum, dbCount, 0);
        let sequence = baseMax;

        if (action === 'next') {
          sequence = baseMax + 1;
          if (sequence <= 0) sequence = 1;
          aliases.forEach(a => {
            dailySequenceStore[`${a}_${dateKey}`] = sequence;
          });
          persistDailySequences();
        } else if (action === 'sync' && req.body.current_number) {
          const num = parseInt(req.body.current_number, 10) || 0;
          if (num > sequence) {
            sequence = num;
            aliases.forEach(a => {
              dailySequenceStore[`${a}_${dateKey}`] = sequence;
            });
            persistDailySequences();
          }
        } else {
          if (sequence <= 0) {
            sequence = 1;
            aliases.forEach(a => {
              dailySequenceStore[`${a}_${dateKey}`] = sequence;
            });
            persistDailySequences();
          }
        }

        return {
          success: true,
          restaurant_id: canonicalId,
          slug: canonicalSlug,
          date: dateKey,
          daily_order_number: sequence
        };
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error("Daily sequence calculation error:", err);
      res.status(500).json({ error: "تعذر احتساب رقم الطلب اليومي الموحد." });
    }
  });

  // POST /api/orders/live - Add or update live order
  app.post("/api/orders/live", async (req, res) => {
    const orderData = req.body;
    const restaurantId = orderData.restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      const { canonicalId, canonicalSlug, aliases } = await resolveRestaurantAliases(restaurantId);

      const orderRecord = {
        ...orderData,
        restaurant_id: canonicalId,
        updated_at: new Date().toISOString(),
      };

      // Extract daily order number to sync sequence store automatically
      let dailyNum = 0;
      if (orderRecord.daily_order_number) {
        dailyNum = parseInt(String(orderRecord.daily_order_number), 10);
      }
      if (!dailyNum || isNaN(dailyNum)) {
        const noteText = orderRecord.notes || orderRecord.delivery_notes || orderRecord.items?.[0]?.notes || '';
        const match = String(noteText).match(/#(\d+)/);
        if (match && match[1]) {
          dailyNum = parseInt(match[1], 10);
        }
      }

      if (dailyNum > 0) {
        const dateKey = getTodayDateKey();
        aliases.forEach(a => {
          const k = `${a}_${dateKey}`;
          const cur = dailySequenceStore[k] || 0;
          if (dailyNum > cur) {
            dailySequenceStore[k] = dailyNum;
          }
        });
        persistDailySequences();
      }

      // Store in all alias keys for this restaurant
      aliases.forEach(a => {
        if (!liveOrdersStore[a]) {
          liveOrdersStore[a] = [];
        }
        const existingIndex = liveOrdersStore[a].findIndex(
          (o: any) => String(o.id) === String(orderData.id)
        );
        if (existingIndex >= 0) {
          liveOrdersStore[a][existingIndex] = {
            ...liveOrdersStore[a][existingIndex],
            ...orderRecord,
          };
        } else {
          liveOrdersStore[a].unshift(orderRecord);
        }
        if (liveOrdersStore[a].length > 200) {
          liveOrdersStore[a] = liveOrdersStore[a].slice(0, 200);
        }
      });

      persistLiveOrders();
      res.status(200).json({ success: true, order: orderRecord });
    } catch (err: any) {
      console.error("Live order save error:", err);
      res.status(500).json({ error: err.message || "فشل في حفظ الطلب المباشر" });
    }
  });

  // GET /api/orders/live - Get live orders for a restaurant (merges in-memory and Supabase across aliases)
  app.get("/api/orders/live", async (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    const { canonicalId, canonicalSlug, aliases } = await resolveRestaurantAliases(restaurantId);

    const mergedMap = new Map<string, any>();
    // First, add all in-memory live orders from any alias
    aliases.forEach(a => {
      const list = liveOrdersStore[a] || [];
      list.forEach((o: any) => {
        if (o && o.id) {
          mergedMap.set(String(o.id), o);
        }
      });
    });

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
          .in("restaurant_id", aliases)
          .order("created_at", { ascending: false })
          .limit(60);

        if (!error && Array.isArray(dbOrders)) {
          const STATUS_RANK: Record<string, number> = {
            new: 1,
            preparing: 2,
            ready: 3,
            delivered: 4,
            completed: 4,
            cancelled: 5
          };

          // Then map dbOrders
          dbOrders.forEach((dbo: any) => {
            const firstNote = dbo.order_items?.[0]?.notes || '';
            const isCustomer = firstNote.includes('[طلب زبون') || (!dbo.waiter_id && (dbo.status === 'new' || dbo.status === 'preparing'));
            const numMatch = firstNote.match(/#(\d+)/);
            const dailyNum = numMatch ? parseInt(numMatch[1], 10) : (dbo.daily_order_number || dbo.id);

            let orderType = 'dine_in';
            if (firstNote.includes('دليفري')) orderType = 'delivery';
            else if (firstNote.includes('سفري')) orderType = 'takeaway';

            const tableNumMatch = firstNote.match(/طاولة\s*([^|\]]+)/);
            const tableNum = dbo.tables?.table_number || (tableNumMatch ? tableNumMatch[1].trim() : null);

            // Delivery info
            const nameMatch = firstNote.match(/الاسم:\s*([^|\]]+)/);
            const phoneMatch = firstNote.match(/هاتف:\s*([^|\]]+)/);
            const addrMatch = firstNote.match(/العنوان:\s*([^|\]]+)/);

            // Cashier & Payment Extraction
            const cashierMatch = firstNote.match(/كاشير:\s*([^|\]]+)/);
            const cashierName = dbo.cashier_name || (cashierMatch ? cashierMatch[1].trim() : (isCustomer ? 'طلب أونلاين' : 'كاشير الفرع'));

            let payMethod = dbo.payment_method || 'cash';
            if (firstNote.includes('دفع: card') || firstNote.includes('دفع: visa') || firstNote.includes('فيزا') || firstNote.includes('بطاقة')) {
              payMethod = 'card';
            } else if (firstNote.includes('دفع: wallet') || firstNote.includes('دفع: instapay') || firstNote.includes('انستاباي') || firstNote.includes('محفظة')) {
              payMethod = 'wallet';
            } else if (firstNote.includes('دفع: split') || firstNote.includes('مقسم') || firstNote.includes('مجزأ')) {
              payMethod = 'split';
            }

            const mappedOrder = {
              id: dbo.id,
              daily_order_number: dailyNum,
              restaurant_id: dbo.restaurant_id,
              source: isCustomer ? 'customer_app' : 'pos',
              cashier_name: cashierName,
              payment_method: payMethod,
              order_type: orderType,
              table_id: dbo.table_id,
              table_number: tableNum,
              customer_name: nameMatch ? nameMatch[1].trim() : undefined,
              customer_phone: phoneMatch ? phoneMatch[1].trim() : undefined,
              delivery_address: addrMatch ? addrMatch[1].trim() : undefined,
              notes: firstNote,
              total_price: Number(dbo.total_price || 0),
              status: dbo.status === 'delivered' ? 'completed' : (dbo.status || 'new'),
              payment_status: dbo.payment_status || 'unpaid',
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
              // Merge status: respect explicitly updated higher status (e.g. delivered, completed, preparing)
              const existingRank = STATUS_RANK[existing.status] || 1;
              const dbNormStatus = dbo.status === 'delivered' ? 'completed' : (dbo.status || 'new');
              const dbRank = STATUS_RANK[dbNormStatus] || 1;

              const mergedStatus = existingRank >= dbRank ? existing.status : dbNormStatus;
              const mergedPayment = (existing.payment_status === 'paid' || dbo.payment_status === 'paid') ? 'paid' : 'unpaid';

              const mergedObj = {
                ...mappedOrder,
                ...existing,
                status: mergedStatus,
                payment_status: mergedPayment
              };

              mergedMap.set(String(dbo.id), mergedObj);
            }
          });

          // Deduplicate by unique order ID (never merge distinct orders by sequence number)
          const uniqueOrdersMap = new Map<string, any>();
          Array.from(mergedMap.values()).forEach((ord: any) => {
            const key = String(ord.id);
            if (!uniqueOrdersMap.has(key)) {
              uniqueOrdersMap.set(key, ord);
            } else {
              const existingOrd = uniqueOrdersMap.get(key);
              const exRank = STATUS_RANK[existingOrd.status] || 1;
              const ordRank = STATUS_RANK[ord.status] || 1;
              if (ordRank >= exRank) {
                uniqueOrdersMap.set(key, { ...existingOrd, ...ord });
              }
            }
          });

          const sortedOrders = Array.from(uniqueOrdersMap.values()).sort(
            (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
          aliases.forEach(a => {
            liveOrdersStore[a] = sortedOrders;
          });
          persistLiveOrders();
          return res.status(200).json({ success: true, orders: sortedOrders });
        }
      } catch (dbErr) {
        console.warn("Live orders DB sync error:", dbErr);
      }
    }

    const fallbackOrders = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    res.status(200).json({ success: true, orders: fallbackOrders });
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
    const { restaurant_id, status, payment_status, cashier_name } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      if (!liveOrdersStore[restaurant_id]) {
        liveOrdersStore[restaurant_id] = [];
      }
      const orders = liveOrdersStore[restaurant_id];
      const order = orders.find((o: any) => 
        String(o.id) === String(orderId)
      );

      if (order) {
        if (status) order.status = status;
        if (payment_status) order.payment_status = payment_status;
        if (cashier_name) order.cashier_name = cashier_name;
        order.updated_at = new Date().toISOString();
        persistLiveOrders();
      } else {
        // Record status change in memory so polling retains it
        orders.unshift({
          id: orderId,
          restaurant_id,
          status: status || 'new',
          payment_status: payment_status || 'unpaid',
          cashier_name: cashier_name || undefined,
          updated_at: new Date().toISOString()
        });
        persistLiveOrders();
      }

      // Also update Supabase orders table safely (no non-existent columns)
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && status) {
        try {
          const client = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey)
            : createClient(supabaseUrl, anonKey || "");

          // Supabase check constraint only allows ('new', 'preparing', 'delivered', 'cancelled')
          const dbStatus = (status === 'completed' || status === 'delivered') 
            ? 'delivered' 
            : (status === 'ready' ? 'preparing' : status);

          const updatePayload: any = { status: dbStatus };
          if (status === 'preparing') updatePayload.preparing_at = new Date().toISOString();
          if (status === 'completed' || status === 'delivered') updatePayload.delivered_at = new Date().toISOString();

          const numId = parseInt(orderId, 10);
          if (!isNaN(numId) && String(numId) === String(orderId).trim()) {
            await client.from("orders").update(updatePayload).eq("id", numId);
          } else {
            await client.from("orders").update(updatePayload).eq("id", orderId);
          }
        } catch (dbErr) {
          console.warn("DB status update error:", dbErr);
        }
      }

      res.status(200).json({ success: true, orderId, status });
    } catch (err: any) {
      console.error("Order status update error:", err);
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

  const persistInventory = (restaurantId?: string) => {
    try {
      fs.writeFileSync(inventoryFilePath, JSON.stringify(inventoryStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write inventory-store.json:", e);
    }
    if (restaurantId && inventoryStore[restaurantId]) {
      saveToSupabaseStorage(`restaurants/${restaurantId}/inventory.json`, inventoryStore[restaurantId]).catch(() => {});
    }
  };

  // GET /api/inventory - Get restaurant inventory, movements and alerts (Supabase Cloud + Local Memory)
  app.get("/api/inventory", async (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    if (!inventoryStore[restaurantId]) {
      const cloudInv = await loadFromSupabaseStorage(`restaurants/${restaurantId}/inventory.json`, null);
      if (cloudInv) {
        inventoryStore[restaurantId] = cloudInv;
      }
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
  app.post("/api/inventory/update", async (req, res) => {
    const { restaurant_id, productId, productName, newStock, delta, type, reason, performedBy, minAlert } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    try {
      if (!inventoryStore[restaurant_id]) {
        const cloudInv = await loadFromSupabaseStorage(`restaurants/${restaurant_id}/inventory.json`, null);
        inventoryStore[restaurant_id] = cloudInv || {
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

      persistInventory(restaurant_id);
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
  app.post("/api/inventory/shift-log", async (req, res) => {
    const { restaurant_id, shiftRecord } = req.body;
    if (!restaurant_id || !shiftRecord) {
      return res.status(400).json({ error: "البيانات غير مكتملة." });
    }

    try {
      if (!inventoryStore[restaurant_id]) {
        const cloudInv = await loadFromSupabaseStorage(`restaurants/${restaurant_id}/inventory.json`, null);
        inventoryStore[restaurant_id] = cloudInv || {
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

      persistInventory(restaurant_id);
      res.status(200).json({ success: true, message: "تم تسجيل حركة الشيفت بنجاح" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "فشل في تسجيل حركة الشيفت" });
    }
  });

  // Persistent Recipe & Raw Materials Store (BOM, Food Cost & Raw Movements)
  const recipesFilePath = path.join(process.cwd(), "recipes-store.json");
  let recipesStore: Record<string, {
    materials: any[];
    categories?: any[];
    recipes: Record<string, any>;
    purchases: any[];
    wastes: any[];
    audits: any[];
    movements: any[];
  }> = {};

  try {
    if (fs.existsSync(recipesFilePath)) {
      const recData = fs.readFileSync(recipesFilePath, "utf-8");
      recipesStore = JSON.parse(recData || "{}");
    }
  } catch (e) {
    console.warn("Could not read recipes-store.json:", e);
  }

  const persistRecipes = (restaurantId?: string) => {
    try {
      fs.writeFileSync(recipesFilePath, JSON.stringify(recipesStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write recipes-store.json:", e);
    }
    if (restaurantId && recipesStore[restaurantId]) {
      saveToSupabaseStorage(`restaurants/${restaurantId}/recipes.json`, recipesStore[restaurantId]).catch(() => {});
    }
  };

  // GET /api/inventory/recipes-data - Get all raw materials, recipes, and movements (Supabase Cloud + Local Memory)
  app.get("/api/inventory/recipes-data", async (req, res) => {
    const restaurantId = req.query.restaurant_id as string;
    if (!restaurantId) {
      return res.status(400).json({ error: "معرف المطعم مطلوب." });
    }

    if (!recipesStore[restaurantId]) {
      const cloudRec = await loadFromSupabaseStorage(`restaurants/${restaurantId}/recipes.json`, null);
      if (cloudRec) {
        recipesStore[restaurantId] = cloudRec;
      }
    }

    const data = recipesStore[restaurantId] || {
      materials: [],
      categories: [],
      recipes: {},
      purchases: [],
      wastes: [],
      audits: [],
      movements: []
    };

    res.status(200).json({ success: true, ...data });
  });

  // POST /api/inventory/recipes-data - Save all raw materials, recipes, and movements
  app.post("/api/inventory/recipes-data", async (req, res) => {
    const restaurant_id = req.body.restaurant_id || req.body.restaurantId;
    const data = req.body.data;
    if (!restaurant_id || !data) {
      return res.status(400).json({ error: "بيانات غير مكتملة." });
    }

    try {
      recipesStore[restaurant_id] = {
        materials: data.materials || [],
        categories: data.categories || [],
        recipes: data.recipes || {},
        purchases: data.purchases || [],
        wastes: data.wastes || [],
        audits: data.audits || [],
        movements: data.movements || []
      };

      persistRecipes(restaurant_id);
      res.status(200).json({ success: true, message: "تم حفظ بيانات الريسبي والمخزون بنجاح" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "فشل في حفظ بيانات الريسبي" });
    }
  });

  // POST /api/inventory/recipes-deduct - Auto-deduct raw materials for completed orders
  app.post("/api/inventory/recipes-deduct", async (req, res) => {
    let restaurant_id = req.body.restaurant_id || req.body.restaurantId || (req.query.restaurant_id as string);
    if (!restaurant_id && Object.keys(recipesStore).length > 0) {
      restaurant_id = Object.keys(recipesStore)[0];
    }
    const items = req.body.items;
    const orderRef = req.body.orderRef || req.body.dailySeqNum || 'طلب';
    const cashierName = req.body.cashierName || req.body.performedBy || 'الكاشير';

    if (!restaurant_id || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: "بيانات غير مكتملة." });
    }

    try {
      if (!recipesStore[restaurant_id]) {
        const cloudRec = await loadFromSupabaseStorage(`restaurants/${restaurant_id}/recipes.json`, null);
        if (cloudRec) {
          recipesStore[restaurant_id] = cloudRec;
        } else {
          recipesStore[restaurant_id] = {
            materials: [],
            categories: [],
            recipes: {},
            purchases: [],
            wastes: [],
            audits: [],
            movements: []
          };
        }
      }

      const rest = recipesStore[restaurant_id];
      const matMap = new Map<string, any>();
      (rest.materials || []).forEach(m => matMap.set(m.id, m));

      let deducted = 0;
      const now = new Date().toISOString();

      items.forEach((item: any) => {
        const prodId = item.id || item.menuItemId || item.product_id;
        const qty = Math.max(1, item.quantity || 1);
        if (!prodId) return;

        // Also deduct direct product stock if present in inventoryStore
        if (inventoryStore[restaurant_id]) {
          const inv = inventoryStore[restaurant_id];
          if (inv.stock && (inv.stock[prodId] !== undefined || inv.stock[String(prodId)] !== undefined)) {
            const key = inv.stock[prodId] !== undefined ? prodId : String(prodId);
            const prevStock = inv.stock[key] || 0;
            inv.stock[key] = Math.max(0, prevStock - qty);
            if (!Array.isArray(inv.movements)) {
              inv.movements = [];
            }
            inv.movements.unshift({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              restaurant_id,
              product_id: key,
              product_name: item.name,
              type: 'sale',
              quantity: -qty,
              prev_stock: prevStock,
              new_stock: inv.stock[key],
              reason: `طلب #${orderRef} (${cashierName})`,
              performed_by: cashierName,
              timestamp: now
            });
            persistInventory(restaurant_id);
          }
        }

        let recipe = rest.recipes[prodId];
        if (!recipe && item.name) {
          recipe = Object.values(rest.recipes).find((r: any) =>
            (r.product_id && String(r.product_id) === String(prodId)) ||
            (r.product_name_ar && (item.name.includes(r.product_name_ar) || r.product_name_ar.includes(item.name))) ||
            (r.product_name_en && item.name.toLowerCase().includes(r.product_name_en.toLowerCase()))
          );
        }
        if (!recipe) return;

        let ingredientsToDeduct = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

        // Check if item matches any option-specific recipe variant
        if (Array.isArray(recipe.variants) && recipe.variants.length > 0) {
          const optionKeywords: string[] = [];

          if (Array.isArray(item.options)) {
            item.options.forEach((opt: any) => {
              if (typeof opt === 'string') optionKeywords.push(opt.toLowerCase().trim());
              else if (opt?.name) optionKeywords.push(String(opt.name).toLowerCase().trim());
              else if (opt?.name_ar) optionKeywords.push(String(opt.name_ar).toLowerCase().trim());
              else if (opt?.choiceName) optionKeywords.push(String(opt.choiceName).toLowerCase().trim());
              else if (opt?.optionName) optionKeywords.push(String(opt.optionName).toLowerCase().trim());
            });
          }

          if (item.selectedOptions && typeof item.selectedOptions === 'object') {
            Object.values(item.selectedOptions).forEach((val: any) => {
              if (typeof val === 'string') optionKeywords.push(val.toLowerCase().trim());
            });
          }

          if (item.sugar_level) {
            const sl = String(item.sugar_level).toLowerCase();
            if (sl === 'none') optionKeywords.push('سادة', 'ساده', 'بدون سكر', 'none');
            if (sl === 'low') optionKeywords.push('سكر خفيف', 'خفيف', 'low');
            if (sl === 'medium') optionKeywords.push('مضبوط', 'مظبوط', 'وسط', 'medium');
            if (sl === 'high') optionKeywords.push('زيادة', 'زياده', 'سكر زيادة', 'سكر زياده', 'high');
          }

          if (item.notes && typeof item.notes === 'string') {
            optionKeywords.push(item.notes.toLowerCase().trim());
          }

          const matchedVariant = recipe.variants.find((v: any) => {
            const vName = (v.name || '').toLowerCase().trim();
            const vChoiceId = (v.choice_id || '').toLowerCase().trim();
            return optionKeywords.some((kw: string) => 
              kw === vName || 
              kw === vChoiceId || 
              kw.includes(vName) || 
              vName.includes(kw)
            );
          });

          if (matchedVariant && Array.isArray(matchedVariant.ingredients) && matchedVariant.ingredients.length > 0) {
            ingredientsToDeduct = matchedVariant.ingredients;
          }
        }

        if (Array.isArray(ingredientsToDeduct)) {
          ingredientsToDeduct.forEach((ing: any) => {
            const mat = matMap.get(ing.material_id);
            if (mat) {
              const delta = (ing.quantity || 0) * qty;
              const prev = mat.current_stock;
              const next = Math.max(0, prev - delta);
              mat.current_stock = next;
              deducted++;

              rest.movements.unshift({
                id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                restaurant_id,
                material_id: mat.id,
                material_name: mat.name_ar,
                type: 'sale_deduction',
                quantity: -delta,
                prev_stock: prev,
                new_stock: next,
                unit: mat.unit,
                order_id: orderRef,
                reason: `خصم مبيعات تلقائي: ${item.name} x ${qty} (طلب #${orderRef})`,
                performed_by: cashierName || 'الكاشير',
                timestamp: now
              });
            }
          });
        }
      });

      if (rest.movements.length > 1000) {
        rest.movements = rest.movements.slice(0, 1000);
      }

      persistRecipes(restaurant_id);
      res.status(200).json({ success: true, deducted });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "فشل في خصم مكونات الريسبي" });
    }
  });

  // POST /api/inventory/recipes-restore - Restore raw materials for cancelled orders
  app.post("/api/inventory/recipes-restore", async (req, res) => {
    const restaurant_id = req.body.restaurant_id || req.body.restaurantId;
    const items = req.body.items;
    const orderRef = req.body.orderRef || req.body.dailySeqNum || 'طلب';
    const cashierName = req.body.cashierName || req.body.performedBy || 'الكاشير';

    if (!restaurant_id || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: "بيانات غير مكتملة." });
    }

    try {
      if (!recipesStore[restaurant_id]) {
        const cloudRec = await loadFromSupabaseStorage(`restaurants/${restaurant_id}/recipes.json`, null);
        if (cloudRec) {
          recipesStore[restaurant_id] = cloudRec;
        } else {
          return res.status(200).json({ success: true, restored: 0 });
        }
      }

      const rest = recipesStore[restaurant_id];
      const matMap = new Map<string, any>();
      (rest.materials || []).forEach(m => matMap.set(m.id, m));

      let restored = 0;
      const now = new Date().toISOString();

      items.forEach((item: any) => {
        const prodId = item.id || item.menuItemId || item.product_id;
        const qty = Math.max(1, item.quantity || 1);
        if (!prodId || !rest.recipes[prodId]) return;

        const recipe = rest.recipes[prodId];
        let ingredientsToRestore = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

        // Check if item matches any option-specific recipe variant
        if (Array.isArray(recipe.variants) && recipe.variants.length > 0) {
          const optionKeywords: string[] = [];

          if (Array.isArray(item.options)) {
            item.options.forEach((opt: any) => {
              if (typeof opt === 'string') optionKeywords.push(opt.toLowerCase().trim());
              else if (opt?.name) optionKeywords.push(String(opt.name).toLowerCase().trim());
              else if (opt?.name_ar) optionKeywords.push(String(opt.name_ar).toLowerCase().trim());
              else if (opt?.choiceName) optionKeywords.push(String(opt.choiceName).toLowerCase().trim());
              else if (opt?.optionName) optionKeywords.push(String(opt.optionName).toLowerCase().trim());
            });
          }

          if (item.selectedOptions && typeof item.selectedOptions === 'object') {
            Object.values(item.selectedOptions).forEach((val: any) => {
              if (typeof val === 'string') optionKeywords.push(val.toLowerCase().trim());
            });
          }

          if (item.sugar_level) {
            const sl = String(item.sugar_level).toLowerCase();
            if (sl === 'none') optionKeywords.push('سادة', 'ساده', 'بدون سكر', 'none');
            if (sl === 'low') optionKeywords.push('سكر خفيف', 'خفيف', 'low');
            if (sl === 'medium') optionKeywords.push('مضبوط', 'مظبوط', 'وسط', 'medium');
            if (sl === 'high') optionKeywords.push('زيادة', 'زياده', 'سكر زيادة', 'سكر زياده', 'high');
          }

          if (item.notes && typeof item.notes === 'string') {
            optionKeywords.push(item.notes.toLowerCase().trim());
          }

          const matchedVariant = recipe.variants.find((v: any) => {
            const vName = (v.name || '').toLowerCase().trim();
            const vChoiceId = (v.choice_id || '').toLowerCase().trim();
            return optionKeywords.some((kw: string) => 
              kw === vName || 
              kw === vChoiceId || 
              kw.includes(vName) || 
              vName.includes(kw)
            );
          });

          if (matchedVariant && Array.isArray(matchedVariant.ingredients) && matchedVariant.ingredients.length > 0) {
            ingredientsToRestore = matchedVariant.ingredients;
          }
        }

        if (Array.isArray(ingredientsToRestore)) {
          ingredientsToRestore.forEach((ing: any) => {
            const mat = matMap.get(ing.material_id);
            if (mat) {
              const delta = (ing.quantity || 0) * qty;
              const prev = mat.current_stock;
              const next = prev + delta;
              mat.current_stock = next;
              restored++;

              rest.movements.unshift({
                id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                restaurant_id,
                material_id: mat.id,
                material_name: mat.name_ar,
                type: 'manual_adjust',
                quantity: delta,
                prev_stock: prev,
                new_stock: next,
                unit: mat.unit,
                order_id: orderRef,
                reason: `استرجاع ريسبي (إلغاء/مرتجع طلب #${orderRef}): ${item.name} x ${qty}`,
                performed_by: cashierName || 'الكاشير',
                timestamp: now
              });
            }
          });
        }
      });

      if (rest.movements.length > 1000) {
        rest.movements = rest.movements.slice(0, 1000);
      }

      persistRecipes(restaurant_id);
      res.status(200).json({ success: true, restored });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "فشل في استرجاع مكونات الريسبي" });
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

  const persistDeliveryZones = (restaurantId?: string) => {
    try {
      fs.writeFileSync(deliveryZonesFilePath, JSON.stringify(restaurantDeliveryZonesStore, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not write restaurant-delivery-zones.json:", e);
    }
    saveToSupabaseStorage("system/delivery-zones.json", restaurantDeliveryZonesStore).catch(() => {});
    if (restaurantId && restaurantDeliveryZonesStore[restaurantId]) {
      saveToSupabaseStorage(`restaurants/${restaurantId}/delivery_zones.json`, restaurantDeliveryZonesStore[restaurantId]).catch(() => {});
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
      persistDeliveryZones(restaurant_id);

      const client = getSupabaseAdmin();
      if (client && delivery_zones) {
        try {
          await client.from("restaurants").update({
            delivery_zones: delivery_zones
          }).eq("id", restaurant_id);
        } catch (dbErr) {
          // Fallback to storage
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
  app.get("/api/restaurants/delivery-zones", async (req, res) => {
    if (Object.keys(restaurantDeliveryZonesStore).length === 0) {
      const cloudZones = await loadFromSupabaseStorage("system/delivery-zones.json", null);
      if (cloudZones) {
        restaurantDeliveryZonesStore = cloudZones;
      }
    }
    res.status(200).json({ 
      delivery_zones: restaurantDeliveryZonesStore,
      default_zones: DEFAULT_DELIVERY_ZONES_SERVER
    });
  });

  // System Cloud Status API for Multi-branch Health Monitoring
  app.get("/api/system/cloud-status", async (req, res) => {
    const client = getSupabaseAdmin();
    if (!client) {
      return res.status(503).json({ status: "disconnected", error: "Supabase client not initialized" });
    }

    try {
      const { data: restaurants, error: restErr } = await client.from("restaurants").select("id, name, slug").limit(50);
      const { data: buckets } = await client.storage.listBuckets();
      const hasSystemBucket = buckets?.some((b: any) => b.name === "system-data");

      res.status(200).json({
        status: "healthy",
        provider: "Supabase PostgreSQL & Cloud Storage",
        database_connected: !restErr,
        restaurants_count: restaurants?.length || 0,
        restaurants: restaurants || [],
        storage_bucket_active: Boolean(hasSystemBucket),
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message || "Failed to check Supabase health" });
    }
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

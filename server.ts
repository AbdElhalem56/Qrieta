import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
            service_fee_percentage: geofence.service_fee_percentage
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

# Shop Dashboard API — ต้องเขียนใหม่ก่อนนำกลับมาใช้

ย้ายออกจาก `src/app/api/` เมื่อ 3 ก.ย. 2026 เพราะ **ใช้งานไม่ได้และไม่ปลอดภัย**
ไม่ใช่การทิ้งงาน — โครงและเจตนายังอยู่ครบ แต่ต้องแก้ 2 เรื่องก่อนต่อกลับ

## 1. ไม่มีการตรวจสิทธิ์เลย

ทุก route รับ `shopId` จาก URL แล้วคืนข้อมูลทันที ไม่เช็คว่า
ล็อกอินหรือยัง และไม่เช็คว่าเป็นเจ้าของร้านนั้นไหม

`GET /api/shops/<id>/orders` คืน **ชื่อ เบอร์โทร และที่อยู่ของลูกค้า**
ใครก็ยิงได้ถ้ารู้หรือเดา id ร้าน — เป็นข้อมูลส่วนบุคคลตาม PDPA

routes ใช้ service role ซึ่งข้าม RLS ทั้งหมด จึงต้องเขียนการตรวจสิทธิ์เองในโค้ด
แต่ไม่ได้เขียนไว้

## 2. อ้าง schema ที่ไม่มีอยู่จริง

| โค้ดเรียกใช้ | ของจริง |
|---|---|
| ตาราง `shops` | `merchants` |
| ตาราง `products` | `menu_items` |
| `orders.shop_id` | `orders.merchant_id` |
| `orders.customer_name` / `customer_phone` | ไม่มี — ต้อง join `profiles` ผ่าน `customer_id` |
| `orders.delivery_address` | `orders.dropoff` |
| `orders.total_price` | `orders.price` (มี `items_subtotal`, `delivery_fee` แยก) |
| `orders.order_number` | ไม่มี — มีแค่ `id` |
| `orders.estimated_delivery_time` | ไม่มี |
| `order_items.product_name` | `order_items.name` |
| `order_items.quantity` | `order_items.qty` |

ใส่ service role key ที่ถูกต้องก็ยังพัง เพราะตารางที่อ้างถึงไม่มีอยู่

## วิธีเขียนใหม่ที่แนะนำ

**ไม่ต้องใช้ service role** — ฐานข้อมูลนี้มี RLS ครบแล้ว

`orders_select_relevant` และ `menu_items_write_owner_or_admin` อนุญาตให้เจ้าของร้าน
อ่าน/แก้ข้อมูลร้านตัวเองได้อยู่แล้ว ถ้าใช้ session ของผู้ใช้ (`@/lib/supabase/server`)
ฐานข้อมูลจะบังคับสิทธิ์ให้เอง ไม่ต้องเขียน authorization ซ้ำและไม่มีทางลืม

สั้นกว่า ปลอดภัยกว่า และไม่ต้องพึ่ง secret key

> component ที่จะเรียก API เหล่านี้ (`src/components/ShopDashboard/*`) ก็เขียนจาก
> schema ชุดเดียวกัน จึงต้องปรับพร้อมกัน

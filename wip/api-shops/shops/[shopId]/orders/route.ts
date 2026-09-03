import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;

    // Get orders for the shop
    const { data: orders, error: ordersError } = await supabaseAdmin()
      .from('orders')
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        total_price,
        status,
        created_at,
        estimated_delivery_time
      `)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (ordersError) {
      throw ordersError;
    }

    // Get items for each order
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order) => {
        const { data: items } = await supabaseAdmin()
          .from('order_items')
          .select(`
            id,
            product_name,
            quantity,
            price
          `)
          .eq('order_id', order.id);

        return {
          ...order,
          items: items || [],
        };
      })
    );

    return NextResponse.json({
      orders: ordersWithItems,
    });
  } catch (error) {
    console.error('Get shop orders error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

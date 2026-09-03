import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string; orderId: string }> }
) {
  try {
    const { shopId, orderId } = await params;
    const body = await request.json();
    const { status } = body;

    // Validate status
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Verify order belongs to shop
    const { data: order, error: orderError } = await supabaseAdmin()
      .from('orders')
      .select('id, shop_id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    if (order.shop_id !== shopId) {
      return NextResponse.json(
        { error: 'Order does not belong to this shop' },
        { status: 403 }
      );
    }

    // Update order status
    const { error: updateError } = await supabaseAdmin()
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: `Order status updated to ${status}`,
      order_id: orderId,
      new_status: status,
    });
  } catch (error) {
    console.error('Update order status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

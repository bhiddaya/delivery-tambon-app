import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;

    const { data: shop, error: shopError } = await supabaseAdmin()
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single();

    if (shopError || !shop) {
      return NextResponse.json(
        { error: 'Shop not found' },
        { status: 404 }
      );
    }

    // Get product count
    const { count: productCount } = await supabaseAdmin()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    // Get total orders count
    const { count: totalOrders } = await supabaseAdmin()
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    // Get pending orders count
    const { count: pendingCount } = await supabaseAdmin()
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('status', 'pending');

    return NextResponse.json({
      shop: {
        ...shop,
        product_count: productCount || 0,
        total_orders: totalOrders || 0,
        pending_orders_count: pendingCount || 0,
        rating: 4.5, // Mock rating
      },
    });
  } catch (error) {
    console.error('Get shop details error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const body = await request.json();

    const {
      name,
      category,
      address,
      phone,
      email,
      description,
      opening_time,
      closing_time,
    } = body;

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (description !== undefined) updateData.description = description;
    if (opening_time !== undefined) updateData.opening_time = opening_time;
    if (closing_time !== undefined) updateData.closing_time = closing_time;
    updateData.updated_at = new Date().toISOString();

    const { data: shop, error: updateError } = await supabaseAdmin()
      .from('shops')
      .update(updateData)
      .eq('id', shopId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Shop not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      shop,
      message: 'Shop profile updated successfully',
    });
  } catch (error) {
    console.error('Update shop profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

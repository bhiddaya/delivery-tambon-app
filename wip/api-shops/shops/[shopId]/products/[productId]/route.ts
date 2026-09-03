import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string; productId: string }> }
) {
  try {
    const { shopId, productId } = await params;
    const body = await request.json();
    const { name, description, price, available } = body;

    // Verify product belongs to shop
    const { data: existingProduct, error: checkError } = await supabaseAdmin()
      .from('products')
      .select('shop_id')
      .eq('id', productId)
      .single();

    if (checkError || !existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (existingProduct.shop_id !== shopId) {
      return NextResponse.json(
        { error: 'Product does not belong to this shop' },
        { status: 403 }
      );
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (available !== undefined) updateData.available = available;
    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin()
      .from('products')
      .update(updateData)
      .eq('id', productId);

    if (updateError) throw updateError;

    return NextResponse.json({
      message: 'Product updated successfully',
    });
  } catch (error) {
    console.error('Update product error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string; productId: string }> }
) {
  try {
    const { shopId, productId } = await params;

    // Verify product belongs to shop
    const { data: existingProduct, error: checkError } = await supabaseAdmin()
      .from('products')
      .select('shop_id')
      .eq('id', productId)
      .single();

    if (checkError || !existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (existingProduct.shop_id !== shopId) {
      return NextResponse.json(
        { error: 'Product does not belong to this shop' },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabaseAdmin()
      .from('products')
      .delete()
      .eq('id', productId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Delete product error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

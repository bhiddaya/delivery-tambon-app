export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      drivers: {
        Row: {
          is_online: boolean
          profile_id: string
          today_earn: number
          today_jobs: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          is_online?: boolean
          profile_id: string
          today_earn?: number
          today_jobs?: number
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          is_online?: boolean
          profile_id?: string
          today_earn?: number
          today_jobs?: number
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          merchant_id: string
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          merchant_id: string
          name: string
          price: number
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          merchant_id?: string
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          id: string
          is_open: boolean
          name: string
          profile_id: string
          tambon_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          name: string
          profile_id: string
          tambon_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          name?: string
          profile_id?: string
          tambon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          menu_item_id: string | null
          name: string
          order_id: number
          price: number
          qty: number
        }
        Insert: {
          id?: string
          menu_item_id?: string | null
          name: string
          order_id: number
          price?: number
          qty?: number
        }
        Update: {
          id?: string
          menu_item_id?: string | null
          name?: string
          order_id?: number
          price?: number
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          delivery_fee: number
          driver_id: string | null
          dropoff: string | null
          id: number
          items_subtotal: number
          merchant_id: string | null
          note: string | null
          payment_method: string | null
          pickup: string | null
          price: number
          status: Database["public"]["Enums"]["order_status"]
          tambon_id: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_fee?: number
          driver_id?: string | null
          dropoff?: string | null
          id?: never
          items_subtotal?: number
          merchant_id?: string | null
          note?: string | null
          payment_method?: string | null
          pickup?: string | null
          price?: number
          status?: Database["public"]["Enums"]["order_status"]
          tambon_id: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_fee?: number
          driver_id?: string | null
          dropoff?: string | null
          id?: never
          items_subtotal?: number
          merchant_id?: string | null
          note?: string | null
          payment_method?: string | null
          pickup?: string | null
          price?: number
          status?: Database["public"]["Enums"]["order_status"]
          tambon_id?: string
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string
          full_name: string
          id: string
          phone: string | null
          promptpay_id: string | null
          rating: number
          role: Database["public"]["Enums"]["user_role"]
          tambon_id: string | null
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          promptpay_id?: string | null
          rating?: number
          role?: Database["public"]["Enums"]["user_role"]
          tambon_id?: string | null
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          promptpay_id?: string | null
          rating?: number
          role?: Database["public"]["Enums"]["user_role"]
          tambon_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          from_profile: string
          id: string
          order_id: number
          score: number
          to_profile: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          from_profile: string
          id?: string
          order_id: number
          score: number
          to_profile: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          from_profile?: string
          id?: string
          order_id?: number
          score?: number
          to_profile?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tambons: {
        Row: {
          code: string | null
          created_at: string
          district: string | null
          id: string
          name: string
          name_en: string | null
          note: string | null
          province: string | null
          slug: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          district?: string | null
          id?: string
          name: string
          name_en?: string | null
          note?: string | null
          province?: string | null
          slug: string
        }
        Update: {
          code?: string | null
          created_at?: string
          district?: string | null
          id?: string
          name?: string
          name_en?: string | null
          note?: string | null
          province?: string | null
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      order_status:
        | "pending"
        | "accepted"
        | "in_progress"
        | "delivered"
        | "cancelled"
      order_type: "food" | "parcel" | "ride"
      user_role: "customer" | "driver" | "merchant" | "admin"
      vehicle_type:
        | "motorcycle"
        | "pickup"
        | "trike"
        | "tractor"
        | "bicycle"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      order_status: [
        "pending",
        "accepted",
        "in_progress",
        "delivered",
        "cancelled",
      ],
      order_type: ["food", "parcel", "ride"],
      user_role: ["customer", "driver", "merchant", "admin"],
      vehicle_type: [
        "motorcycle",
        "pickup",
        "trike",
        "tractor",
        "bicycle",
        "other",
      ],
    },
  },
} as const

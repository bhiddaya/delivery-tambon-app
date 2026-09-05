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
      admin_scopes: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          note: string | null
          profile_id: string
          tambon_id: string | null
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          note?: string | null
          profile_id: string
          tambon_id?: string | null
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          note?: string | null
          profile_id?: string
          tambon_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_scopes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_scopes_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
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
          line_user_id: string | null
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
          line_user_id?: string | null
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
          line_user_id?: string | null
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
      tambon_applications: {
        Row: {
          applicant_line: string | null
          applicant_name: string
          applicant_phone: string
          applicant_profile_id: string | null
          created_at: string
          created_tambon_id: string | null
          details: Json
          district: string
          driver_count: number | null
          id: string
          merchant_count: number | null
          pdpa_consent: boolean
          province: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tambon_code: string | null
          tambon_name: string
        }
        Insert: {
          applicant_line?: string | null
          applicant_name: string
          applicant_phone: string
          applicant_profile_id?: string | null
          created_at?: string
          created_tambon_id?: string | null
          details?: Json
          district: string
          driver_count?: number | null
          id?: string
          merchant_count?: number | null
          pdpa_consent?: boolean
          province: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tambon_code?: string | null
          tambon_name: string
        }
        Update: {
          applicant_line?: string | null
          applicant_name?: string
          applicant_phone?: string
          applicant_profile_id?: string | null
          created_at?: string
          created_tambon_id?: string | null
          details?: Json
          district?: string
          driver_count?: number | null
          id?: string
          merchant_count?: number | null
          pdpa_consent?: boolean
          province?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tambon_code?: string | null
          tambon_name?: string
        }
        Relationships: []
      }
      tambon_profiles: {
        Row: {
          area_sqkm: number | null
          attractions: Json
          budget_total: number | null
          budget_year: number | null
          culture: string | null
          households: number | null
          local_gov_name: string | null
          local_gov_website: string | null
          main_economy: string | null
          population: number | null
          products: Json
          sources: Json
          tambon_id: string
          traditions: Json
          updated_at: string
          updated_by: string | null
          villages: number | null
        }
        Insert: {
          area_sqkm?: number | null
          attractions?: Json
          budget_total?: number | null
          budget_year?: number | null
          culture?: string | null
          households?: number | null
          local_gov_name?: string | null
          local_gov_website?: string | null
          main_economy?: string | null
          population?: number | null
          products?: Json
          sources?: Json
          tambon_id: string
          traditions?: Json
          updated_at?: string
          updated_by?: string | null
          villages?: number | null
        }
        Update: {
          area_sqkm?: number | null
          attractions?: Json
          budget_total?: number | null
          budget_year?: number | null
          culture?: string | null
          households?: number | null
          local_gov_name?: string | null
          local_gov_website?: string | null
          main_economy?: string | null
          population?: number | null
          products?: Json
          sources?: Json
          tambon_id?: string
          traditions?: Json
          updated_at?: string
          updated_by?: string | null
          villages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tambon_profiles_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: true
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
      tambons: {
        Row: {
          announcement: string | null
          code: string | null
          contact_line: string | null
          contact_phone: string | null
          cover_url: string | null
          created_at: string
          delivery_fee_base: number | null
          delivery_fee_per_km: number | null
          district: string | null
          id: string
          intro: string | null
          is_active: boolean
          name: string
          name_en: string | null
          note: string | null
          opened_at: string | null
          province: string | null
          slug: string
        }
        Insert: {
          announcement?: string | null
          code?: string | null
          contact_line?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee_base?: number | null
          delivery_fee_per_km?: number | null
          district?: string | null
          id?: string
          intro?: string | null
          is_active?: boolean
          name: string
          name_en?: string | null
          note?: string | null
          opened_at?: string | null
          province?: string | null
          slug: string
        }
        Update: {
          announcement?: string | null
          code?: string | null
          contact_line?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee_base?: number | null
          delivery_fee_per_km?: number | null
          district?: string | null
          id?: string
          intro?: string | null
          is_active?: boolean
          name?: string
          name_en?: string | null
          note?: string | null
          opened_at?: string | null
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
      approve_tambon_application: {
        Args: { app_id: string; review_note?: string; tambon_slug: string }
        Returns: string
      }
      auth_user_id_for_line: {
        Args: { p_alias_email: string; p_line_user_id: string }
        Returns: string
      }
      can_admin_profile: { Args: { p: string }; Returns: boolean }
      can_admin_tambon: { Args: { t: string }; Returns: boolean }
      has_national_scope: { Args: never; Returns: boolean }
      is_approved_driver_in: { Args: { t: string }; Returns: boolean }
      my_tambon_id: { Args: never; Returns: string }
      shares_order_with: { Args: { p: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tambon_admin: { Args: { t: string }; Returns: boolean }
    }
    Enums: {
      order_status:
        | "pending"
        | "accepted"
        | "in_progress"
        | "delivered"
        | "cancelled"
      order_type: "food" | "parcel" | "ride" | "agri_service"
      user_role: "customer" | "driver" | "merchant" | "admin" | "superadmin"
      vehicle_type:
        | "motorcycle"
        | "pickup"
        | "trike"
        | "tractor"
        | "bicycle"
        | "other"
        | "harvester"
        | "rice_transplanter"
        | "drone"
        | "car"
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
      order_type: ["food", "parcel", "ride", "agri_service"],
      user_role: ["customer", "driver", "merchant", "admin", "superadmin"],
      vehicle_type: [
        "motorcycle",
        "pickup",
        "trike",
        "tractor",
        "bicycle",
        "other",
        "harvester",
        "rice_transplanter",
        "drone",
        "car",
      ],
    },
  },
} as const

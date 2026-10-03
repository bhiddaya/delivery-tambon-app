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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: number
          note: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: never
          note?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: never
          note?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
            foreignKeyName: "admin_scopes_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_scopes_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_scopes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
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
      ai_conversations: {
        Row: {
          content: string
          created_at: string
          id: string
          line_user_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          line_user_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          line_user_id?: string
          role?: string
        }
        Relationships: []
      }
      carts: {
        Row: {
          items: Json
          line_user_id: string
          merchant_id: string | null
          updated_at: string
        }
        Insert: {
          items?: Json
          line_user_id: string
          merchant_id?: string | null
          updated_at?: string
        }
        Update: {
          items?: Json
          line_user_id?: string
          merchant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_rankings"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "carts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_updates: {
        Row: {
          complaint_id: string
          created_at: string
          created_by: string
          id: string
          is_public: boolean
          note: string | null
          status: string
        }
        Insert: {
          complaint_id: string
          created_at?: string
          created_by?: string
          id?: string
          is_public?: boolean
          note?: string | null
          status: string
        }
        Update: {
          complaint_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_public?: boolean
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_updates_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          agency_hint: string | null
          ai_summary: string | null
          category: string | null
          created_at: string
          detail: string
          disclose_identity: boolean
          id: string
          is_test: boolean
          line_user_id: string
          occurred_on: string | null
          place: string | null
          raw_text: string | null
          reporter_name: string | null
          reporter_phone: string | null
          source: string
          status: string
          subject: string | null
          suggested_agency: string | null
          tambon_id: string | null
          ticket_no: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          agency_hint?: string | null
          ai_summary?: string | null
          category?: string | null
          created_at?: string
          detail: string
          disclose_identity?: boolean
          id?: string
          is_test?: boolean
          line_user_id: string
          occurred_on?: string | null
          place?: string | null
          raw_text?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          source?: string
          status?: string
          subject?: string | null
          suggested_agency?: string | null
          tambon_id?: string | null
          ticket_no: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          agency_hint?: string | null
          ai_summary?: string | null
          category?: string | null
          created_at?: string
          detail?: string
          disclose_identity?: boolean
          id?: string
          is_test?: boolean
          line_user_id?: string
          occurred_on?: string | null
          place?: string | null
          raw_text?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          source?: string
          status?: string
          subject?: string | null
          suggested_agency?: string | null
          tambon_id?: string | null
          ticket_no?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          context: string | null
          conversation_id: string | null
          created_at: string | null
          id: number
          model: string | null
          response: string | null
          task: string
          tokens_used: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          context?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: number
          model?: string | null
          response?: string | null
          task: string
          tokens_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          context?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: number
          model?: string | null
          response?: string | null
          task?: string
          tokens_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      demand_signals: {
        Row: {
          created_at: string
          detail: Json
          id: number
          kind: string
          profile_id: string | null
          tambon_id: string | null
          value: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: never
          kind: string
          profile_id?: string | null
          tambon_id?: string | null
          value: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: never
          kind?: string
          profile_id?: string | null
          tambon_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_signals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_signals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_signals_tambon_id_fkey"
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
          lat: number | null
          lng: number | null
          location_updated_at: string | null
          profile_id: string
          today_earn: number
          today_jobs: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          is_online?: boolean
          lat?: number | null
          lng?: number | null
          location_updated_at?: string | null
          profile_id: string
          today_earn?: number
          today_jobs?: number
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          is_online?: boolean
          lat?: number | null
          lng?: number | null
          location_updated_at?: string | null
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
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_seekers: {
        Row: {
          area: string | null
          created_at: string
          full_name: string
          id: string
          line_user_id: string
          occupation: string | null
          phone: string | null
          skills_experience: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          full_name: string
          id?: string
          line_user_id: string
          occupation?: string | null
          phone?: string | null
          skills_experience?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string
          full_name?: string
          id?: string
          line_user_id?: string
          occupation?: string | null
          phone?: string | null
          skills_experience?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          is_hidden: boolean
          merchant_id: string
          name: string
          photo_url: string | null
          price: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          is_hidden?: boolean
          merchant_id: string
          name: string
          photo_url?: string | null
          price: number
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          is_hidden?: boolean
          merchant_id?: string
          name?: string
          photo_url?: string | null
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_rankings"
            referencedColumns: ["merchant_id"]
          },
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
          is_test: boolean
          lat: number | null
          lng: number | null
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
          is_test?: boolean
          lat?: number | null
          lng?: number | null
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
          is_test?: boolean
          lat?: number | null
          lng?: number | null
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
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
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
      order_events: {
        Row: {
          created_at: string
          id: number
          note: string | null
          order_id: number
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          created_at?: string
          id?: never
          note?: string | null
          order_id: number
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          created_at?: string
          id?: never
          note?: string | null
          order_id?: number
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          customer_paid_at: string | null
          customer_slip_url: string | null
          delivered_at: string | null
          delivery_fee: number
          driver_id: string | null
          dropoff: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          id: number
          is_test: boolean
          items_subtotal: number
          job_area_rai: number | null
          job_duration_hours: number | null
          merchant_id: string | null
          note: string | null
          payment_method: string | null
          payment_ref: string | null
          payment_reject_reason: string | null
          payment_rejected_at: string | null
          payment_verified_by: string | null
          pickup: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          plot_id: string | null
          price: number
          required_vehicle_type:
            | Database["public"]["Enums"]["vehicle_type"]
            | null
          scheduled_date: string | null
          slip_submitted_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          tambon_id: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_paid_at?: string | null
          customer_slip_url?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          driver_id?: string | null
          dropoff?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          id?: never
          is_test?: boolean
          items_subtotal?: number
          job_area_rai?: number | null
          job_duration_hours?: number | null
          merchant_id?: string | null
          note?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          payment_reject_reason?: string | null
          payment_rejected_at?: string | null
          payment_verified_by?: string | null
          pickup?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          plot_id?: string | null
          price?: number
          required_vehicle_type?:
            | Database["public"]["Enums"]["vehicle_type"]
            | null
          scheduled_date?: string | null
          slip_submitted_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tambon_id: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_paid_at?: string | null
          customer_slip_url?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          driver_id?: string | null
          dropoff?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          id?: never
          is_test?: boolean
          items_subtotal?: number
          job_area_rai?: number | null
          job_duration_hours?: number | null
          merchant_id?: string | null
          note?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          payment_reject_reason?: string | null
          payment_rejected_at?: string | null
          payment_verified_by?: string | null
          pickup?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          plot_id?: string | null
          price?: number
          required_vehicle_type?:
            | Database["public"]["Enums"]["vehicle_type"]
            | null
          scheduled_date?: string | null
          slip_submitted_at?: string | null
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
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "driver_rankings"
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
            referencedRelation: "merchant_rankings"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_verified_by_fkey"
            columns: ["payment_verified_by"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_verified_by_fkey"
            columns: ["payment_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
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
      pending_menu_items: {
        Row: {
          created_at: string
          id: string
          line_user_id: string
          merchant_id: string
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_user_id: string
          merchant_id: string
          name: string
          price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_user_id?: string
          merchant_id?: string
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pending_menu_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_rankings"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "pending_menu_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          ai_confidence: number | null
          category: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          note: string | null
          phone: string | null
          source: string
          source_url: string | null
          tambon_id: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          address?: string | null
          ai_confidence?: number | null
          category: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          note?: string | null
          phone?: string | null
          source?: string
          source_url?: string | null
          tambon_id?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          address?: string | null
          ai_confidence?: number | null
          category?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          note?: string | null
          phone?: string | null
          source?: string
          source_url?: string | null
          tambon_id?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "places_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
      plots: {
        Row: {
          address: string | null
          area_rai: number | null
          created_at: string
          crop_type: string | null
          id: string
          lat: number | null
          lng: number | null
          note: string | null
          owner_profile_id: string
          tambon_id: string
        }
        Insert: {
          address?: string | null
          area_rai?: number | null
          created_at?: string
          crop_type?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          owner_profile_id: string
          tambon_id: string
        }
        Update: {
          address?: string | null
          area_rai?: number | null
          created_at?: string
          crop_type?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          owner_profile_id?: string
          tambon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plots_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plots_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plots_tambon_id_fkey"
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
          is_test: boolean
          line_user_id: string | null
          phone: string | null
          promptpay_id: string | null
          rating: number
          role: Database["public"]["Enums"]["user_role"]
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          tambon_id: string | null
          updated_at: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          full_name: string
          id?: string
          is_test?: boolean
          line_user_id?: string | null
          phone?: string | null
          promptpay_id?: string | null
          rating?: number
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          tambon_id?: string | null
          updated_at?: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          full_name?: string
          id?: string
          is_test?: boolean
          line_user_id?: string | null
          phone?: string | null
          promptpay_id?: string | null
          rating?: number
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          tambon_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "driver_rankings"
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
      settlements: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          due_at: string
          id: number
          order_id: number
          paid_out_at: string | null
          paid_out_slip_url: string | null
          payee_profile_id: string
          payee_role: string
          payout_ref: string | null
          tambon_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          due_at: string
          id?: never
          order_id: number
          paid_out_at?: string | null
          paid_out_slip_url?: string | null
          payee_profile_id: string
          payee_role: string
          payout_ref?: string | null
          tambon_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          due_at?: string
          id?: never
          order_id?: number
          paid_out_at?: string | null
          paid_out_slip_url?: string | null
          payee_profile_id?: string
          payee_role?: string
          payout_ref?: string | null
          tambon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payee_profile_id_fkey"
            columns: ["payee_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payee_profile_id_fkey"
            columns: ["payee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
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
          deposit_amount: number | null
          deposit_received_at: string | null
          deposit_slip_url: string | null
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
          settlement_promptpay_id: string | null
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
          deposit_amount?: number | null
          deposit_received_at?: string | null
          deposit_slip_url?: string | null
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
          settlement_promptpay_id?: string | null
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
          deposit_amount?: number | null
          deposit_received_at?: string | null
          deposit_slip_url?: string | null
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
          settlement_promptpay_id?: string | null
          status?: string
          tambon_code?: string | null
          tambon_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tambon_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_applications_applicant_profile_id_fkey"
            columns: ["applicant_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_applications_created_tambon_id_fkey"
            columns: ["created_tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tambon_posts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: number
          image_url: string | null
          is_published: boolean
          pinned: boolean
          tambon_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: never
          image_url?: string | null
          is_published?: boolean
          pinned?: boolean
          tambon_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: never
          image_url?: string | null
          is_published?: boolean
          pinned?: boolean
          tambon_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tambon_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_posts_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "tambon_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "driver_rankings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tambon_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tambons: {
        Row: {
          agent_share_commission_pct: number
          agent_share_delivery_pct: number
          announcement: string | null
          code: string | null
          contact_line: string | null
          contact_phone: string | null
          cover_url: string | null
          created_at: string
          delivery_fee_base: number | null
          delivery_fee_per_km: number | null
          deposit_amount: number
          district: string | null
          id: string
          intake_blocked: boolean
          intake_blocked_reason: string | null
          intro: string | null
          is_active: boolean
          name: string
          name_en: string | null
          note: string | null
          opened_at: string | null
          payout_cutoff_time: string
          province: string | null
          settlement_account_name: string | null
          settlement_promptpay_id: string | null
          slug: string
        }
        Insert: {
          agent_share_commission_pct?: number
          agent_share_delivery_pct?: number
          announcement?: string | null
          code?: string | null
          contact_line?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee_base?: number | null
          delivery_fee_per_km?: number | null
          deposit_amount?: number
          district?: string | null
          id?: string
          intake_blocked?: boolean
          intake_blocked_reason?: string | null
          intro?: string | null
          is_active?: boolean
          name: string
          name_en?: string | null
          note?: string | null
          opened_at?: string | null
          payout_cutoff_time?: string
          province?: string | null
          settlement_account_name?: string | null
          settlement_promptpay_id?: string | null
          slug: string
        }
        Update: {
          agent_share_commission_pct?: number
          agent_share_delivery_pct?: number
          announcement?: string | null
          code?: string | null
          contact_line?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee_base?: number | null
          delivery_fee_per_km?: number | null
          deposit_amount?: number
          district?: string | null
          id?: string
          intake_blocked?: boolean
          intake_blocked_reason?: string | null
          intro?: string | null
          is_active?: boolean
          name?: string
          name_en?: string | null
          note?: string | null
          opened_at?: string | null
          payout_cutoff_time?: string
          province?: string | null
          settlement_account_name?: string | null
          settlement_promptpay_id?: string | null
          slug?: string
        }
        Relationships: []
      }
      web_applications: {
        Row: {
          created_at: string
          details: Json
          full_name: string
          id: string
          line_id: string | null
          pdpa_consent: boolean
          phone: string
          role: string
          status: string
          tambon_confirmed: boolean
          tambon_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          full_name: string
          id?: string
          line_id?: string | null
          pdpa_consent?: boolean
          phone: string
          role: string
          status?: string
          tambon_confirmed?: boolean
          tambon_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          full_name?: string
          id?: string
          line_id?: string | null
          pdpa_consent?: boolean
          phone?: string
          role?: string
          status?: string
          tambon_confirmed?: boolean
          tambon_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_applications_tambon_id_fkey"
            columns: ["tambon_id"]
            isOneToOne: false
            referencedRelation: "tambons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      driver_rankings: {
        Row: {
          avg_score: number | null
          full_name: string | null
          id: string | null
          rating_count: number | null
        }
        Relationships: []
      }
      merchant_rankings: {
        Row: {
          avg_score: number | null
          merchant_id: string | null
          name: string | null
          rating_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cart_json: { Args: { p_user: string }; Returns: Json }
      admin_assign_order: {
        Args: { p_driver_id: string; p_order_id: number }
        Returns: undefined
      }
      admin_cancel_order: {
        Args: { p_order_id: number; p_reason: string }
        Returns: undefined
      }
      admin_set_agent_share: {
        Args: {
          p_commission_pct: number
          p_delivery_pct: number
          p_tambon_id: string
        }
        Returns: undefined
      }
      admin_set_shop_open: {
        Args: { p_merchant_id: string; p_open: boolean }
        Returns: undefined
      }
      admin_set_suspended: {
        Args: { p_profile_id: string; p_reason: string; p_suspend: boolean }
        Returns: undefined
      }
      admin_stats_snapshot: { Args: never; Returns: Json }
      approve_tambon_application: {
        Args: {
          app_id: string
          p_make_applicant_admin?: boolean
          review_note?: string
          tambon_slug: string
        }
        Returns: string
      }
      auth_user_id_for_line: {
        Args: { p_alias_email: string; p_line_user_id: string }
        Returns: string
      }
      base36: { Args: { p: number }; Returns: string }
      calc_delivery_fee: { Args: { distance_km: number }; Returns: number }
      can_admin_profile: { Args: { p: string }; Returns: boolean }
      can_admin_tambon: { Args: { t: string }; Returns: boolean }
      confirm_customer_payment: {
        Args: { p_order_id: number; p_slip_url?: string }
        Returns: undefined
      }
      confirm_payout_received: {
        Args: { p_settlement_id: number }
        Returns: undefined
      }
      delivery_overview: { Args: never; Returns: Json }
      find_agri_owner: {
        Args: {
          p_is_test?: boolean
          p_order_lat: number
          p_order_lng: number
          p_tambon_id: string
          p_vehicle_type?: string
        }
        Returns: {
          distance_km: number
          line_user_id: string
          profile_id: string
          vehicle_type: string
        }[]
      }
      find_nearest_driver: {
        Args: {
          p_is_test?: boolean
          p_order_lat: number
          p_order_lng: number
          p_tambon_id: string
          p_vehicle_type?: string
        }
        Returns: {
          distance_km: number
          line_user_id: string
          profile_id: string
          vehicle_type: string
        }[]
      }
      food_flow: {
        Args: { p_action: string; p_arg?: string; p_user: string }
        Returns: Json
      }
      has_national_scope: { Args: never; Returns: boolean }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved_driver_in: { Args: { t: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tambon_admin: { Args: { t: string }; Returns: boolean }
      line_slip_target: {
        Args: { p_line_user_id: string }
        Returns: {
          order_id: number
          profile_role: string
          slip_state: string
          tambon_id: string
          tambon_slug: string
          total: number
        }[]
      }
      line_targets_for_new_order: {
        Args: { p_order_id: number }
        Returns: {
          line_user_id: string
        }[]
      }
      line_targets_for_tambon_admin: {
        Args: { p_tambon_id: string }
        Returns: {
          line_user_id: string
        }[]
      }
      make_ref: { Args: { p_id: number; p_prefix: string }; Returns: string }
      mark_payout_sent: {
        Args: { p_settlement_id: number; p_slip_url?: string }
        Returns: undefined
      }
      my_tambon_id: { Args: never; Returns: string }
      next_payout_due: { Args: { p_tambon: string }; Returns: string }
      order_customer_total: {
        Args: { p_order: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: number
      }
      purge_stale_carts: { Args: { p_days?: number }; Returns: number }
      recalc_profile_rating: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      refresh_intake_block: { Args: { p_tambon: string }; Returns: undefined }
      reject_customer_payment: {
        Args: { p_order_id: number; p_reason: string }
        Returns: undefined
      }
      search_menu: {
        Args: { p_query: string; p_tambon?: string }
        Returns: {
          item_id: string
          item_name: string
          merchant_category: string
          merchant_id: string
          merchant_name: string
          photo_url: string
          price: number
        }[]
      }
      session_used_password: { Args: never; Returns: boolean }
      shares_order_with: { Args: { p: string }; Returns: boolean }
      slip_order_id: { Args: { p_name: string }; Returns: number }
      submit_payment_slip: {
        Args: { p_order_id: number; p_slip_path: string }
        Returns: undefined
      }
      tambon_admin_grant: {
        Args: { p_note?: string; p_profile_id: string; p_tambon_id: string }
        Returns: string
      }
      tambon_admin_revoke: {
        Args: { p_note?: string; p_profile_id: string; p_tambon_id: string }
        Returns: boolean
      }
      tambon_daily_stats: {
        Args: never
        Returns: {
          delivered_today: number
          drivers_online: number
          drivers_total: number
          merchants_open: number
          orders_today: number
          pending_now: number
          tambon_id: string
          tambon_name: string
          waiting_approval: number
        }[]
      }
      tambon_float: { Args: { p_tambon: string }; Returns: number }
      vehicle_availability: {
        Args: never
        Returns: {
          offline: number
          ready: number
          total: number
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }[]
      }
      verify_customer_payment: {
        Args: { p_order_id: number }
        Returns: undefined
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
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

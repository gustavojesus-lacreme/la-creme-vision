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
      appointments: {
        Row: {
          barber_id: string
          created_at: string
          customer_first_name: string
          customer_last_name: string
          customer_whatsapp: string
          ends_at: string
          id: string
          service_id: string
          service_ids: string[]
          services_label: string
          starts_at: string
          status: string
          total_duration_minutes: number | null
          total_price_cents: number | null
          user_id: string | null
        }
        Insert: {
          barber_id: string
          created_at?: string
          customer_first_name: string
          customer_last_name: string
          customer_whatsapp: string
          ends_at: string
          id?: string
          service_id: string
          service_ids?: string[]
          services_label?: string
          starts_at: string
          status?: string
          total_duration_minutes?: number | null
          total_price_cents?: number | null
          user_id?: string | null
        }
        Update: {
          barber_id?: string
          created_at?: string
          customer_first_name?: string
          customer_last_name?: string
          customer_whatsapp?: string
          ends_at?: string
          id?: string
          service_id?: string
          service_ids?: string[]
          services_label?: string
          starts_at?: string
          status?: string
          total_duration_minutes?: number | null
          total_price_cents?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      barber_absences: {
        Row: {
          barber_id: string
          created_at: string
          created_by: string | null
          ends_on: string
          ends_time: string | null
          id: string
          kind: string
          note: string
          starts_on: string
          starts_time: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          barber_id: string
          created_at?: string
          created_by?: string | null
          ends_on: string
          ends_time?: string | null
          id?: string
          kind: string
          note?: string
          starts_on: string
          starts_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          barber_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string
          ends_time?: string | null
          id?: string
          kind?: string
          note?: string
          starts_on?: string
          starts_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barber_absences_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      barber_invites: {
        Row: {
          barber_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          barber_id: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          barber_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barber_invites_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers: {
        Row: {
          active: boolean
          approved_at: string | null
          archived_at: string | null
          color: string
          commission_plan_pct: number | null
          commission_service_pct: number | null
          created_at: string
          email: string | null
          id: string
          last_name: string
          name: string
          service_ids: string[]
          sort_order: number
          specialty: string
          team_role: string
          user_id: string | null
          whatsapp: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          archived_at?: string | null
          color?: string
          commission_plan_pct?: number | null
          commission_service_pct?: number | null
          created_at?: string
          email?: string | null
          id?: string
          last_name?: string
          name: string
          service_ids?: string[]
          sort_order?: number
          specialty?: string
          team_role?: string
          user_id?: string | null
          whatsapp?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          archived_at?: string | null
          color?: string
          commission_plan_pct?: number | null
          commission_service_pct?: number | null
          created_at?: string
          email?: string | null
          id?: string
          last_name?: string
          name?: string
          service_ids?: string[]
          sort_order?: number
          specialty?: string
          team_role?: string
          user_id?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          closed: boolean
          closes_at: string | null
          opens_at: string | null
          weekday: number
        }
        Insert: {
          closed?: boolean
          closes_at?: string | null
          opens_at?: string | null
          weekday: number
        }
        Update: {
          closed?: boolean
          closes_at?: string | null
          opens_at?: string | null
          weekday?: number
        }
        Relationships: []
      }
      business_periods: {
        Row: {
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          weekday: number
        }
        Insert: {
          closes_at: string
          created_at?: string
          id?: string
          opens_at: string
          weekday: number
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: string
          opens_at?: string
          weekday?: number
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          barber_id: string | null
          category: string
          client_name: string
          commission_barber_id: string | null
          commission_cents: number
          commission_paid_at: string | null
          commission_percent: number
          commission_status: string
          created_at: string
          description: string
          discount_cents: number
          fee_cents: number
          fee_percent: number
          id: string
          kind: string
          note: string
          occurred_at: string
          payment_method: string | null
          product_id: string | null
          quantity: number
          received_by: string | null
          refunded_at: string | null
          refunded_by: string | null
          seller_barber_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          barber_id?: string | null
          category: string
          client_name?: string
          commission_barber_id?: string | null
          commission_cents?: number
          commission_paid_at?: string | null
          commission_percent?: number
          commission_status?: string
          created_at?: string
          description?: string
          discount_cents?: number
          fee_cents?: number
          fee_percent?: number
          id?: string
          kind: string
          note?: string
          occurred_at?: string
          payment_method?: string | null
          product_id?: string | null
          quantity?: number
          received_by?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          seller_barber_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          barber_id?: string | null
          category?: string
          client_name?: string
          commission_barber_id?: string | null
          commission_cents?: number
          commission_paid_at?: string | null
          commission_percent?: number
          commission_status?: string
          created_at?: string
          description?: string
          discount_cents?: number
          fee_cents?: number
          fee_percent?: number
          id?: string
          kind?: string
          note?: string
          occurred_at?: string
          payment_method?: string | null
          product_id?: string | null
          quantity?: number
          received_by?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          seller_barber_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_commission_barber_id_fkey"
            columns: ["commission_barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_payment_method_fkey"
            columns: ["payment_method"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_seller_barber_id_fkey"
            columns: ["seller_barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          audience: string
          enabled: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience: string
          enabled?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          enabled?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      operation_settings: {
        Row: {
          cancel_min_hours: number | null
          commission_plan_pct: number
          commission_product_pct: number
          commission_service_pct: number
          id: number
          lunch_end: string | null
          lunch_start: string | null
          max_advance_days: number | null
          min_advance_minutes: number
          reschedule_block_saturday: boolean
          reschedule_cutoff_time: string | null
          reschedule_cutoff_weekday: number | null
          reschedule_extra_fee_cents: number
          reschedule_per_week: number
          shop_address: string
          shop_email: string
          shop_name: string
          shop_public_info: string
          shop_whatsapp: string
          slot_step_minutes: number
          tolerance_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_min_hours?: number | null
          commission_plan_pct?: number
          commission_product_pct?: number
          commission_service_pct?: number
          id?: number
          lunch_end?: string | null
          lunch_start?: string | null
          max_advance_days?: number | null
          min_advance_minutes?: number
          reschedule_block_saturday?: boolean
          reschedule_cutoff_time?: string | null
          reschedule_cutoff_weekday?: number | null
          reschedule_extra_fee_cents?: number
          reschedule_per_week?: number
          shop_address?: string
          shop_email?: string
          shop_name?: string
          shop_public_info?: string
          shop_whatsapp?: string
          slot_step_minutes?: number
          tolerance_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_min_hours?: number | null
          commission_plan_pct?: number
          commission_product_pct?: number
          commission_service_pct?: number
          id?: number
          lunch_end?: string | null
          lunch_start?: string | null
          max_advance_days?: number | null
          min_advance_minutes?: number
          reschedule_block_saturday?: boolean
          reschedule_cutoff_time?: string | null
          reschedule_cutoff_weekday?: number | null
          reschedule_extra_fee_cents?: number
          reschedule_per_week?: number
          shop_address?: string
          shop_email?: string
          shop_name?: string
          shop_public_info?: string
          shop_whatsapp?: string
          slot_step_minutes?: number
          tolerance_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          active: boolean
          fee_percent: number
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          fee_percent?: number
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          fee_percent?: number
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      plan_items: {
        Row: {
          id: string
          plan_id: string
          quantity: number
          service_id: string
        }
        Insert: {
          id?: string
          plan_id: string
          quantity: number
          service_id: string
        }
        Update: {
          id?: string
          plan_id?: string
          quantity?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          auto_renew: boolean
          compensation_weeks: number
          created_at: string
          description: string
          id: string
          max_uses_per_week: number | null
          name: string
          price_cents: number
          updated_at: string
          usage_rules: string
          validity_days: number
        }
        Insert: {
          active?: boolean
          auto_renew?: boolean
          compensation_weeks?: number
          created_at?: string
          description?: string
          id?: string
          max_uses_per_week?: number | null
          name: string
          price_cents: number
          updated_at?: string
          usage_rules?: string
          validity_days: number
        }
        Update: {
          active?: boolean
          auto_renew?: boolean
          compensation_weeks?: number
          created_at?: string
          description?: string
          id?: string
          max_uses_per_week?: number | null
          name?: string
          price_cents?: number
          updated_at?: string
          usage_rules?: string
          validity_days?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          category: string
          commission_pct: number
          cost_cents: number
          created_at: string
          id: string
          min_stock: number
          name: string
          price_cents: number
          sku: string
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          commission_pct?: number
          cost_cents?: number
          created_at?: string
          id?: string
          min_stock?: number
          name: string
          price_cents?: number
          sku?: string
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          commission_pct?: number
          cost_cents?: number
          created_at?: string
          id?: string
          min_stock?: number
          name?: string
          price_cents?: number
          sku?: string
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          whatsapp: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          first_name?: string
          id: string
          last_name?: string
          whatsapp?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          whatsapp?: string
        }
        Relationships: []
      }
      service_combos: {
        Row: {
          active: boolean
          created_at: string
          duration_minutes: number
          id: string
          name: string
          price_cents: number
          service_ids: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_minutes: number
          id?: string
          name: string
          price_cents: number
          service_ids: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          price_cents?: number
          service_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string
          duration_minutes: number
          id: string
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          duration_minutes: number
          id?: string
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          appointment_id: string | null
          balance_after: number
          created_at: string
          created_by: string | null
          financial_entry_id: string | null
          id: string
          kind: string
          note: string
          product_id: string
          quantity: number
          unit_cost_cents: number | null
        }
        Insert: {
          appointment_id?: string | null
          balance_after?: number
          created_at?: string
          created_by?: string | null
          financial_entry_id?: string | null
          id?: string
          kind: string
          note?: string
          product_id: string
          quantity: number
          unit_cost_cents?: number | null
        }
        Update: {
          appointment_id?: string | null
          balance_after?: number
          created_at?: string
          created_by?: string | null
          financial_entry_id?: string | null
          id?: string
          kind?: string
          note?: string
          product_id?: string
          quantity?: number
          unit_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      barber_commissionable: { Args: { _barber_id: string }; Returns: boolean }
      finalize_appointment: {
        Args: {
          _appointment_id: string
          _discount_cents?: number
          _method: string
          _products?: Json
          _services?: Json
        }
        Returns: undefined
      }
      get_available_slots: {
        Args: { _barber_id: string; _day: string; _duration: number }
        Returns: {
          starts_at: string
        }[]
      }
      get_barber_absences_public: {
        Args: never
        Returns: {
          barber_id: string
          ends_on: string
          is_vacation: boolean
          starts_on: string
        }[]
      }
      get_busy_slots: {
        Args: { _barber_id: string; _day: string }
        Returns: {
          ends_at: string
          starts_at: string
        }[]
      }
      get_public_settings: {
        Args: never
        Returns: {
          max_advance_days: number
          min_advance_minutes: number
          shop_address: string
          shop_email: string
          shop_name: string
          shop_public_info: string
          shop_whatsapp: string
          slot_step_minutes: number
        }[]
      }
      get_sellable_products: {
        Args: never
        Returns: {
          category: string
          id: string
          low: boolean
          name: string
          price_cents: number
          stock: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_barber_bookable: { Args: { _barber_id: string }; Returns: boolean }
      refund_product_sale: {
        Args: { _entry_id: string; _note?: string }
        Returns: undefined
      }
      register_stock_movement: {
        Args: {
          _kind: string
          _note?: string
          _product_id: string
          _quantity: number
          _unit_cost_cents?: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "barbeiro"
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
      app_role: ["admin", "user", "barbeiro"],
    },
  },
} as const

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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string
          id: string
          new_data: Json | null
          old_data: Json | null
          target_id: string
          target_table: string
          ts: string
        }
        Insert: {
          action: string
          actor_id: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          target_id: string
          target_table: string
          ts?: string
        }
        Update: {
          action?: string
          actor_id?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          target_id?: string
          target_table?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          id: string
          name: string
          rate_config: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rate_config?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rate_config?: Json
        }
        Relationships: []
      }
      canteen_sales: {
        Row: {
          branch_id: string
          cashier_id: string
          id: string
          item: string
          qty: number
          sold_at: string
          total: number
          unit_price: number
        }
        Insert: {
          branch_id: string
          cashier_id: string
          id?: string
          item: string
          qty: number
          sold_at?: string
          total: number
          unit_price: number
        }
        Update: {
          branch_id?: string
          cashier_id?: string
          id?: string
          item?: string
          qty?: number
          sold_at?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "canteen_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canteen_sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          room_number: string
          status: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          room_number: string
          status?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          room_number?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      session_addons: {
        Row: {
          added_at: string
          cashier_id: string
          id: string
          item: string
          qty: number
          session_id: string
          total: number
          unit_price: number
        }
        Insert: {
          added_at?: string
          cashier_id: string
          id?: string
          item: string
          qty: number
          session_id: string
          total: number
          unit_price: number
        }
        Update: {
          added_at?: string
          cashier_id?: string
          id?: string
          item?: string
          qty?: number
          session_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_addons_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_addons_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          base_rate: number
          booked_end_at: string
          booking_type: string
          branch_id: string
          cashier_id: string
          checked_in_at: string
          checked_out_at: string | null
          id: string
          pax: number
          room_id: string
          status: string
          surcharges: number
          total: number
          void_reason: string | null
        }
        Insert: {
          base_rate?: number
          // Optional at the API: the trg_set_checked_in trigger (migration
          // 0004) always computes booked_end_at server-side, so clients must
          // not (and do not) send it.
          booked_end_at?: string
          booking_type: string
          branch_id: string
          cashier_id: string
          checked_in_at?: string
          checked_out_at?: string | null
          id?: string
          pax: number
          room_id: string
          status?: string
          surcharges?: number
          total?: number
          void_reason?: string | null
        }
        Update: {
          base_rate?: number
          booked_end_at?: string
          booking_type?: string
          branch_id?: string
          cashier_id?: string
          checked_in_at?: string
          checked_out_at?: string | null
          id?: string
          pax?: number
          room_id?: string
          status?: string
          surcharges?: number
          total?: number
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: string
          closed_at: string | null
          closed_by: string | null
          counted_total: number | null
          expected_addons: number
          expected_canteen: number
          expected_room: number
          expected_total: number
          id: string
          opened_at: string
          opened_by: string
          status: string
          variance: number | null
        }
        Insert: {
          branch_id: string
          closed_at?: string | null
          closed_by?: string | null
          counted_total?: number | null
          expected_addons?: number
          expected_canteen?: number
          expected_room?: number
          expected_total?: number
          id?: string
          opened_at?: string
          opened_by: string
          status?: string
          variance?: number | null
        }
        Update: {
          branch_id?: string
          closed_at?: string | null
          closed_by?: string | null
          counted_total?: number | null
          expected_addons?: number
          expected_canteen?: number
          expected_room?: number
          expected_total?: number
          id?: string
          opened_at?: string
          opened_by?: string
          status?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string
          id: string
          role: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email: string
          id?: string
          role: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_grace_escalation: { Args: Record<string, never>; Returns: undefined }
      close_session: { Args: { p_session_id: string }; Returns: Json }
      close_shift: { Args: { p_counted_total?: null | number; p_shift_id: string }; Returns: Json }
      get_extension_params: {
        Args: { p_branch_id: string }
        Returns: { grace_minutes: number; block_minutes: number; charge_php: number }[]
      }
      open_shift: { Args: Record<string, never>; Returns: Json }
      record_shift_count: { Args: { p_counted_total: number; p_shift_id: string }; Returns: Json }
      update_rate_config: {
        Args: { p_branch_id: string; p_canteen: Json; p_extension: Json }
        Returns: Json
      }
      void_session: { Args: { p_reason: string; p_session_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

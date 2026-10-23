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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slack_channel_id: string | null
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slack_channel_id?: string | null
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slack_channel_id?: string | null
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sheet_rows: {
        Row: {
          acted_by: string | null
          created_at: string
          fingerprint: string
          id: string
          moved_at: string | null
          moved_to_tab: string | null
          raw: Json
          reason: string | null
          source_tab: string
          status: Database["public"]["Enums"]["sheet_row_status"]
          workspace_id: string
        }
        Insert: {
          acted_by?: string | null
          created_at?: string
          fingerprint: string
          id?: string
          moved_at?: string | null
          moved_to_tab?: string | null
          raw: Json
          reason?: string | null
          source_tab: string
          status: Database["public"]["Enums"]["sheet_row_status"]
          workspace_id: string
        }
        Update: {
          acted_by?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          moved_at?: string | null
          moved_to_tab?: string | null
          raw?: Json
          reason?: string | null
          source_tab?: string
          status?: Database["public"]["Enums"]["sheet_row_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_rows_acted_by_fkey"
            columns: ["acted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_rows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_writebacks: {
        Row: {
          attempts: number
          column_name: string
          created_at: string
          done_at: string | null
          id: string
          last_error: string | null
          status: Database["public"]["Enums"]["writeback_status"]
          ticket_id: string
          value: string
        }
        Insert: {
          attempts?: number
          column_name: string
          created_at?: string
          done_at?: string | null
          id?: string
          last_error?: string | null
          status?: Database["public"]["Enums"]["writeback_status"]
          ticket_id: string
          value: string
        }
        Update: {
          attempts?: number
          column_name?: string
          created_at?: string
          done_at?: string | null
          id?: string
          last_error?: string | null
          status?: Database["public"]["Enums"]["writeback_status"]
          ticket_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_writebacks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_writebacks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["stage"] | null
          id: string
          payload: Json | null
          ticket_id: string
          to_stage: Database["public"]["Enums"]["stage"] | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["stage"] | null
          id?: string
          payload?: Json | null
          ticket_id: string
          to_stage?: Database["public"]["Enums"]["stage"] | null
          type: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["stage"] | null
          id?: string
          payload?: Json | null
          ticket_id?: string
          to_stage?: Database["public"]["Enums"]["stage"] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at: string
          created_by: string | null
          error: string | null
          external_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          last_reply: string | null
          recipient: string | null
          replies_checked_at: string | null
          reply_count: number
          status: Database["public"]["Enums"]["message_status"]
          subject: string | null
          ticket_id: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["message_kind"]
          last_reply?: string | null
          recipient?: string | null
          replies_checked_at?: string | null
          reply_count?: number
          status?: Database["public"]["Enums"]["message_status"]
          subject?: string | null
          ticket_id: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          last_reply?: string | null
          recipient?: string | null
          replies_checked_at?: string | null
          reply_count?: number
          status?: Database["public"]["Enums"]["message_status"]
          subject?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_photos: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["photo_kind"]
          sort: number
          storage_path: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["photo_kind"]
          sort?: number
          storage_path: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["photo_kind"]
          sort?: number
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_photos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_photos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_steps: {
        Row: {
          answer: boolean | null
          done_at: string | null
          done_by: string | null
          notes: string | null
          skipped: boolean
          stage: Database["public"]["Enums"]["stage"]
          ticket_id: string
          updated_at: string
        }
        Insert: {
          answer?: boolean | null
          done_at?: string | null
          done_by?: string | null
          notes?: string | null
          skipped?: boolean
          stage: Database["public"]["Enums"]["stage"]
          ticket_id: string
          updated_at?: string
        }
        Update: {
          answer?: boolean | null
          done_at?: string | null
          done_by?: string | null
          notes?: string | null
          skipped?: boolean
          stage?: Database["public"]["Enums"]["stage"]
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_steps_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_steps_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_steps_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tests: {
        Row: {
          attempt: number
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["test_kind"]
          note: string | null
          result: Database["public"]["Enums"]["test_result"]
          ticket_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["test_kind"]
          note?: string | null
          result: Database["public"]["Enums"]["test_result"]
          ticket_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["test_kind"]
          note?: string | null
          result?: Database["public"]["Enums"]["test_result"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          bench_note: string | null
          brand_id: string
          claim_ref: string | null
          closed_at: string | null
          coverage: Database["public"]["Enums"]["coverage"] | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          invoice_sent_at: string | null
          issue: string | null
          label_url: string | null
          needs_payment: boolean
          number: string
          payment_amount: number | null
          priority: boolean
          return_to_everett: boolean
          search: unknown
          serial: string | null
          sheet_row_id: string | null
          ship_carrier: string | null
          ship_to: Json | null
          ship_tracking: string | null
          source: Database["public"]["Enums"]["ticket_source"]
          stage: Database["public"]["Enums"]["stage"]
          test_attempt: number
          updated_at: string
          watch: string
          workspace_id: string
        }
        Insert: {
          bench_note?: string | null
          brand_id: string
          claim_ref?: string | null
          closed_at?: string | null
          coverage?: Database["public"]["Enums"]["coverage"] | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          invoice_sent_at?: string | null
          issue?: string | null
          label_url?: string | null
          needs_payment?: boolean
          number: string
          payment_amount?: number | null
          priority?: boolean
          return_to_everett?: boolean
          search?: unknown
          serial?: string | null
          sheet_row_id?: string | null
          ship_carrier?: string | null
          ship_to?: Json | null
          ship_tracking?: string | null
          source?: Database["public"]["Enums"]["ticket_source"]
          stage?: Database["public"]["Enums"]["stage"]
          test_attempt?: number
          updated_at?: string
          watch: string
          workspace_id: string
        }
        Update: {
          bench_note?: string | null
          brand_id?: string
          claim_ref?: string | null
          closed_at?: string | null
          coverage?: Database["public"]["Enums"]["coverage"] | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          invoice_sent_at?: string | null
          issue?: string | null
          label_url?: string | null
          needs_payment?: boolean
          number?: string
          payment_amount?: number | null
          priority?: boolean
          return_to_everett?: boolean
          search?: unknown
          serial?: string | null
          sheet_row_id?: string | null
          ship_carrier?: string | null
          ship_to?: Json | null
          ship_tracking?: string | null
          source?: Database["public"]["Enums"]["ticket_source"]
          stage?: Database["public"]["Enums"]["stage"]
          test_attempt?: number
          updated_at?: string
          watch?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sheet_row_id_fkey"
            columns: ["sheet_row_id"]
            isOneToOne: true
            referencedRelation: "sheet_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          bench_address: Json | null
          created_at: string
          fulfillment_address: Json | null
          id: string
          name: string
          slug: string
          ticket_prefix: string
          updated_at: string
        }
        Insert: {
          bench_address?: Json | null
          created_at?: string
          fulfillment_address?: Json | null
          id?: string
          name: string
          slug: string
          ticket_prefix: string
          updated_at?: string
        }
        Update: {
          bench_address?: Json | null
          created_at?: string
          fulfillment_address?: Json | null
          id?: string
          name?: string
          slug?: string
          ticket_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      ticket_board: {
        Row: {
          awaiting_payment: boolean | null
          bench_photo_path: string | null
          brand_id: string | null
          closed_at: string | null
          coverage: Database["public"]["Enums"]["coverage"] | null
          created_at: string | null
          customer_name: string | null
          id: string | null
          invoice_sent_at: string | null
          needs_payment: boolean | null
          number: string | null
          outcome: string | null
          parked: boolean | null
          parts_list: string | null
          parts_requested_at: string | null
          payment_amount: number | null
          payment_received: boolean | null
          priority: boolean | null
          received_at: string | null
          return_to_everett: boolean | null
          ship_ready: boolean | null
          slack_kind: Database["public"]["Enums"]["message_kind"] | null
          slack_replies: number | null
          source: Database["public"]["Enums"]["ticket_source"] | null
          stage: Database["public"]["Enums"]["stage"] | null
          stage_entered_at: string | null
          test_attempt: number | null
          tests_passed: number | null
          waiting_for_parts: boolean | null
          watch: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_update_profile: {
        Args: { p_display_name: string; p_is_active: boolean; p_user: string }
        Returns: undefined
      }
      advance: {
        Args: { p_override?: boolean; p_ticket: string }
        Returns: Database["public"]["Enums"]["stage"]
      }
      create_ticket: {
        Args: { p: Json }
        Returns: {
          id: string
          number: string
        }[]
      }
      customer_request_address_update: {
        Args: { p_address: Json; p_email: string; p_number: string }
        Returns: boolean
      }
      customer_ticket_status: {
        Args: { p_email: string; p_number: string }
        Returns: Json
      }
      my_real_grants: {
        Args: never
        Returns: {
          brand_id: string
          role: Database["public"]["Enums"]["member_role"]
          workspace_id: string
        }[]
      }
      reopen: { Args: { p_ticket: string }; Returns: undefined }
      send_back: {
        Args: { p_ticket: string; p_to: Database["public"]["Enums"]["stage"] }
        Returns: undefined
      }
      skip_to_ship: {
        Args: { p_ticket: string }
        Returns: Database["public"]["Enums"]["stage"]
      }
    }
    Enums: {
      coverage: "warranty" | "paid"
      member_role: "owner" | "admin" | "brand_rep" | "watchmaker"
      message_channel: "slack" | "email"
      message_kind: "parts_needed" | "cannot_replicate" | "received" | "shipped"
      message_status: "logged" | "sent" | "failed"
      photo_kind: "customer" | "bench"
      sheet_row_status: "imported" | "dismissed"
      stage:
        | "check_in"
        | "inspect"
        | "supply"
        | "repair"
        | "test"
        | "payment"
        | "ship"
        | "closed"
      test_kind: "time" | "water" | "looks"
      test_result: "pass" | "fail"
      ticket_source: "sheet" | "by_hand"
      writeback_status: "pending" | "done" | "failed"
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
      coverage: ["warranty", "paid"],
      member_role: ["owner", "admin", "brand_rep", "watchmaker"],
      message_channel: ["slack", "email"],
      message_kind: ["parts_needed", "cannot_replicate", "received", "shipped"],
      message_status: ["logged", "sent", "failed"],
      photo_kind: ["customer", "bench"],
      sheet_row_status: ["imported", "dismissed"],
      stage: [
        "check_in",
        "inspect",
        "supply",
        "repair",
        "test",
        "payment",
        "ship",
        "closed",
      ],
      test_kind: ["time", "water", "looks"],
      test_result: ["pass", "fail"],
      ticket_source: ["sheet", "by_hand"],
      writeback_status: ["pending", "done", "failed"],
    },
  },
} as const

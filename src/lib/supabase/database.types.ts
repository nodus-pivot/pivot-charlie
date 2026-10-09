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
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
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
      parts: {
        Row: {
          brand_id: string
          component: Database["public"]["Enums"]["component"]
          created_at: string
          id: string
          is_active: boolean
          name: string
          sku: string
          updated_at: string
          variant: string | null
          workspace_id: string
        }
        Insert: {
          brand_id: string
          component: Database["public"]["Enums"]["component"]
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sku: string
          updated_at?: string
          variant?: string | null
          workspace_id: string
        }
        Update: {
          brand_id?: string
          component?: Database["public"]["Enums"]["component"]
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sku?: string
          updated_at?: string
          variant?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_workspace_id_fkey"
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
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          email_customer: boolean
          handed_over: boolean
          id: string
          ship_to: Json | null
          shipped_at: string | null
          signature_required: boolean
          ticket_id: string
          tracking: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          email_customer?: boolean
          handed_over?: boolean
          id?: string
          ship_to?: Json | null
          shipped_at?: string | null
          signature_required?: boolean
          ticket_id: string
          tracking?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          email_customer?: boolean
          handed_over?: boolean
          id?: string
          ship_to?: Json | null
          shipped_at?: string | null
          signature_required?: boolean
          ticket_id?: string
          tracking?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
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
      ticket_findings: {
        Row: {
          action: Database["public"]["Enums"]["finding_action"]
          component: Database["public"]["Enums"]["component"]
          condition: Database["public"]["Enums"]["finding_condition"] | null
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          found_at_stage: Database["public"]["Enums"]["stage"]
          id: string
          note: string | null
          part_id: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["finding_action"]
          component: Database["public"]["Enums"]["component"]
          condition?: Database["public"]["Enums"]["finding_condition"] | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          found_at_stage?: Database["public"]["Enums"]["stage"]
          id?: string
          note?: string | null
          part_id?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["finding_action"]
          component?: Database["public"]["Enums"]["component"]
          condition?: Database["public"]["Enums"]["finding_condition"] | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          found_at_stage?: Database["public"]["Enums"]["stage"]
          id?: string
          note?: string | null
          part_id?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_findings_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_findings_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_findings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_findings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_parts: {
        Row: {
          arrived_at: string | null
          created_at: string
          created_by: string | null
          finding_id: string | null
          have_it: boolean
          id: string
          label: string | null
          note: string | null
          part_id: string
          qty: number
          requested_at: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          created_at?: string
          created_by?: string | null
          finding_id?: string | null
          have_it?: boolean
          id?: string
          label?: string | null
          note?: string | null
          part_id: string
          qty?: number
          requested_at?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          created_at?: string
          created_by?: string | null
          finding_id?: string | null
          have_it?: boolean
          id?: string
          label?: string | null
          note?: string | null
          part_id?: string
          qty?: number
          requested_at?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_parts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_parts_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "ticket_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_parts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_parts_ticket_id_fkey"
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
          bench_minutes: number | null
          bench_note: string | null
          brand_id: string
          claim_ref: string | null
          closed_at: string | null
          coverage: Database["public"]["Enums"]["coverage"] | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_model_text: string | null
          customer_name: string
          customer_phone: string | null
          fix_note: string | null
          id: string
          inspect_note: string | null
          issue: string | null
          needs_payment: boolean
          number: string
          payment_amount: number | null
          payment_received: boolean
          priority: boolean
          received_at: string | null
          return_to_everett: boolean
          search: unknown
          serial: string | null
          sheet_row_id: string | null
          ship_to: Json | null
          source: Database["public"]["Enums"]["ticket_source"]
          stage: Database["public"]["Enums"]["stage"]
          supply_note: string | null
          test_attempt: number
          test_note: string | null
          updated_at: string
          watch_id: string
          workspace_id: string
        }
        Insert: {
          bench_minutes?: number | null
          bench_note?: string | null
          brand_id: string
          claim_ref?: string | null
          closed_at?: string | null
          coverage?: Database["public"]["Enums"]["coverage"] | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_model_text?: string | null
          customer_name: string
          customer_phone?: string | null
          fix_note?: string | null
          id?: string
          inspect_note?: string | null
          issue?: string | null
          needs_payment?: boolean
          number: string
          payment_amount?: number | null
          payment_received?: boolean
          priority?: boolean
          received_at?: string | null
          return_to_everett?: boolean
          search?: unknown
          serial?: string | null
          sheet_row_id?: string | null
          ship_to?: Json | null
          source?: Database["public"]["Enums"]["ticket_source"]
          stage?: Database["public"]["Enums"]["stage"]
          supply_note?: string | null
          test_attempt?: number
          test_note?: string | null
          updated_at?: string
          watch_id: string
          workspace_id: string
        }
        Update: {
          bench_minutes?: number | null
          bench_note?: string | null
          brand_id?: string
          claim_ref?: string | null
          closed_at?: string | null
          coverage?: Database["public"]["Enums"]["coverage"] | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_model_text?: string | null
          customer_name?: string
          customer_phone?: string | null
          fix_note?: string | null
          id?: string
          inspect_note?: string | null
          issue?: string | null
          needs_payment?: boolean
          number?: string
          payment_amount?: number | null
          payment_received?: boolean
          priority?: boolean
          received_at?: string | null
          return_to_everett?: boolean
          search?: unknown
          serial?: string | null
          sheet_row_id?: string | null
          ship_to?: Json | null
          source?: Database["public"]["Enums"]["ticket_source"]
          stage?: Database["public"]["Enums"]["stage"]
          supply_note?: string | null
          test_attempt?: number
          test_note?: string | null
          updated_at?: string
          watch_id?: string
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
            foreignKeyName: "tickets_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
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
      watch_parts: {
        Row: {
          part_id: string
          watch_id: string
        }
        Insert: {
          part_id: string
          watch_id: string
        }
        Update: {
          part_id?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_parts_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      watches: {
        Row: {
          brand_id: string
          case_spec: string | null
          created_at: string
          id: string
          is_active: boolean
          movement: string | null
          name: string
          notes: string | null
          photo_path: string | null
          reference: string | null
          updated_at: string
          warranty_months: number | null
          workspace_id: string
        }
        Insert: {
          brand_id: string
          case_spec?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          movement?: string | null
          name: string
          notes?: string | null
          photo_path?: string | null
          reference?: string | null
          updated_at?: string
          warranty_months?: number | null
          workspace_id: string
        }
        Update: {
          brand_id?: string
          case_spec?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          movement?: string | null
          name?: string
          notes?: string | null
          photo_path?: string | null
          reference?: string | null
          updated_at?: string
          warranty_months?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watches_workspace_id_fkey"
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
          bench_photo_path: string | null
          brand_id: string | null
          closed_at: string | null
          coverage: Database["public"]["Enums"]["coverage"] | null
          created_at: string | null
          customer_name: string | null
          findings_done: number | null
          findings_total: number | null
          id: string | null
          needs_payment: boolean | null
          number: string | null
          parked: boolean | null
          parts_in_hand: number | null
          parts_requested_at: string | null
          parts_total: number | null
          payment_received: boolean | null
          priority: boolean | null
          received_at: string | null
          return_to_everett: boolean | null
          ship_ready: boolean | null
          source: Database["public"]["Enums"]["ticket_source"] | null
          stage: Database["public"]["Enums"]["stage"] | null
          stage_entered_at: string | null
          tests_passed: number | null
          waiting_on: string | null
          watch_id: string | null
          watch_name: string | null
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
            foreignKeyName: "tickets_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
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
      create_ticket: {
        Args: { p: Json }
        Returns: {
          id: string
          number: string
        }[]
      }
      my_real_grants: {
        Args: never
        Returns: {
          brand_id: string
          role: Database["public"]["Enums"]["member_role"]
          workspace_id: string
        }[]
      }
      set_stage: {
        Args: {
          p_kind?: string
          p_override?: boolean
          p_ticket: string
          p_to: Database["public"]["Enums"]["stage"]
        }
        Returns: undefined
      }
    }
    Enums: {
      component:
        | "bezel"
        | "crystal"
        | "crown"
        | "case"
        | "dial"
        | "hands"
        | "movement"
        | "gaskets"
        | "strap"
        | "clasp"
        | "caseback"
        | "lume"
      coverage: "warranty" | "paid"
      finding_action: "fix" | "replace"
      finding_condition: "worn" | "scratched" | "discolored" | "cracked"
      member_role: "owner" | "admin" | "brand_rep" | "watchmaker"
      photo_kind: "customer" | "bench"
      sheet_row_status: "imported" | "dismissed"
      stage:
        | "check_in"
        | "inspect"
        | "supply"
        | "fix"
        | "test"
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
      component: [
        "bezel",
        "crystal",
        "crown",
        "case",
        "dial",
        "hands",
        "movement",
        "gaskets",
        "strap",
        "clasp",
        "caseback",
        "lume",
      ],
      coverage: ["warranty", "paid"],
      finding_action: ["fix", "replace"],
      finding_condition: ["worn", "scratched", "discolored", "cracked"],
      member_role: ["owner", "admin", "brand_rep", "watchmaker"],
      photo_kind: ["customer", "bench"],
      sheet_row_status: ["imported", "dismissed"],
      stage: ["check_in", "inspect", "supply", "fix", "test", "ship", "closed"],
      test_kind: ["time", "water", "looks"],
      test_result: ["pass", "fail"],
      ticket_source: ["sheet", "by_hand"],
      writeback_status: ["pending", "done", "failed"],
    },
  },
} as const

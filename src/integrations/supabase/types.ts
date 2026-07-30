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
      borrow_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          fulfilled_at: string | null
          id: string
          needed_by: string | null
          product_id: string
          qty_approved: number | null
          qty_requested: number
          reason: string | null
          requested_by: string | null
          source_project_id: string
          status: Database["public"]["Enums"]["borrow_status"]
          target_project_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          fulfilled_at?: string | null
          id?: string
          needed_by?: string | null
          product_id: string
          qty_approved?: number | null
          qty_requested: number
          reason?: string | null
          requested_by?: string | null
          source_project_id: string
          status?: Database["public"]["Enums"]["borrow_status"]
          target_project_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          fulfilled_at?: string | null
          id?: string
          needed_by?: string | null
          product_id?: string
          qty_approved?: number | null
          qty_requested?: number
          reason?: string | null
          requested_by?: string | null
          source_project_id?: string
          status?: Database["public"]["Enums"]["borrow_status"]
          target_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "borrow_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          product_id: string
          project_id: string
          reason: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["ledger_source"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          product_id: string
          project_id: string
          reason?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["ledger_source"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          product_id?: string
          project_id?: string
          reason?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["ledger_source"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      packing_slip_items: {
        Row: {
          condition: string
          description: string
          id: string
          po_item_id: string | null
          product_id: string | null
          qty_ordered: number
          qty_received: number
          slip_id: string
        }
        Insert: {
          condition?: string
          description: string
          id?: string
          po_item_id?: string | null
          product_id?: string | null
          qty_ordered?: number
          qty_received?: number
          slip_id: string
        }
        Update: {
          condition?: string
          description?: string
          id?: string
          po_item_id?: string | null
          product_id?: string | null
          qty_ordered?: number
          qty_received?: number
          slip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_slip_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_slip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_slip_items_slip_id_fkey"
            columns: ["slip_id"]
            isOneToOne: false
            referencedRelation: "packing_slips"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_slips: {
        Row: {
          attachment_url: string | null
          carrier: string | null
          created_at: string
          id: string
          notes: string | null
          po_id: string
          project_id: string
          received_by: string | null
          received_date: string
          slip_number: string
          status: string
          vendor_slip_number: string | null
        }
        Insert: {
          attachment_url?: string | null
          carrier?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          po_id: string
          project_id: string
          received_by?: string | null
          received_date?: string
          slip_number: string
          status?: string
          vendor_slip_number?: string | null
        }
        Update: {
          attachment_url?: string | null
          carrier?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          po_id?: string
          project_id?: string
          received_by?: string | null
          received_date?: string
          slip_number?: string
          status?: string
          vendor_slip_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_slips_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_slips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string
          id: string
          part_number: string
          reorder_point: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          part_number: string
          reorder_point?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          part_number?: string
          reorder_point?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_engineers: {
        Row: {
          project_id: string
          user_id: string
        }
        Insert: {
          project_id: string
          user_id: string
        }
        Update: {
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_engineers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_managers: {
        Row: {
          project_id: string
          user_id: string
        }
        Insert: {
          project_id: string
          user_id: string
        }
        Update: {
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_managers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          contract_number: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          mkj_number: string
          name: string
          project_manager_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          mkj_number: string
          name: string
          project_manager_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          mkj_number?: string
          name?: string
          project_manager_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          budget_code: string | null
          description: string
          id: string
          line_no: number
          po_id: string
          product_id: string | null
          qty: number
          unit: string
          unit_cost: number
        }
        Insert: {
          budget_code?: string | null
          description: string
          id?: string
          line_no: number
          po_id: string
          product_id?: string | null
          qty: number
          unit?: string
          unit_cost?: number
        }
        Update: {
          budget_code?: string | null
          description?: string
          id?: string
          line_no?: number
          po_id?: string
          product_id?: string | null
          qty?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          additional_freight: number | null
          assignee: string | null
          bill_to: string | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          description: string | null
          id: string
          payment_terms: string | null
          po_number: string
          po_sequence: number
          project_id: string
          project_number: string
          ship_to: string | null
          ship_via: string | null
          status: Database["public"]["Enums"]["po_status"]
          supplier_id: string | null
          terms_conditions: string | null
          updated_at: string
        }
        Insert: {
          additional_freight?: number | null
          assignee?: string | null
          bill_to?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          description?: string | null
          id?: string
          payment_terms?: string | null
          po_number: string
          po_sequence: number
          project_id: string
          project_number: string
          ship_to?: string | null
          ship_via?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Update: {
          additional_freight?: number | null
          assignee?: string | null
          bill_to?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          description?: string | null
          id?: string
          payment_terms?: string | null
          po_number?: string
          po_sequence?: number
          project_id?: string
          project_number?: string
          ship_to?: string | null
          ship_via?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_ticket_items: {
        Row: {
          description: string
          id: string
          product_id: string | null
          qty_backordered: number
          qty_shipped: number
          ticket_id: string
        }
        Insert: {
          description: string
          id?: string
          product_id?: string | null
          qty_backordered?: number
          qty_shipped?: number
          ticket_id: string
        }
        Update: {
          description?: string
          id?: string
          product_id?: string | null
          qty_backordered?: number
          qty_shipped?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_ticket_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "shipping_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_tickets: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          contract_number: string | null
          created_at: string
          created_by: string | null
          deliver_to_address: string | null
          deliver_to_name: string | null
          delivered_by: string | null
          id: string
          pass_number: string | null
          po_reference: string | null
          project_id: string
          received_by: string | null
          received_date: string | null
          ship_by: string | null
          ship_date: string
          signature_url: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          deliver_to_address?: string | null
          deliver_to_name?: string | null
          delivered_by?: string | null
          id?: string
          pass_number?: string | null
          po_reference?: string | null
          project_id: string
          received_by?: string | null
          received_date?: string | null
          ship_by?: string | null
          ship_date?: string
          signature_url?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          deliver_to_address?: string | null
          deliver_to_name?: string | null
          delivered_by?: string | null
          id?: string
          pass_number?: string | null
          po_reference?: string | null
          project_id?: string
          received_by?: string | null
          received_date?: string | null
          ship_by?: string | null
          ship_date?: string
          signature_url?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_project_inventory: {
        Row: {
          on_hand: number | null
          product_id: string | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      borrow_notify_recipients: {
        Args: { _project_id: string }
        Returns: string[]
      }
      can_see_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_write: { Args: { _user_id: string }; Returns: boolean }
      can_write_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      create_purchase_order: {
        Args: {
          _bill_to: string
          _delivery_date: string
          _description: string
          _payment_terms: string
          _project_id: string
          _ship_to: string
          _ship_via: string
          _supplier_id: string
        }
        Returns: {
          additional_freight: number | null
          assignee: string | null
          bill_to: string | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          description: string | null
          id: string
          payment_terms: string | null
          po_number: string
          po_sequence: number
          project_id: string
          project_number: string
          ship_to: string | null
          ship_via: string | null
          status: Database["public"]["Enums"]["po_status"]
          supplier_id: string | null
          terms_conditions: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gen_ps_number: { Args: { _mkj: string }; Returns: string }
      gen_ticket_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_warehouse_or_admin: { Args: { _user_id: string }; Returns: boolean }
      manages_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "warehouse_manager" | "manager" | "engineer"
      borrow_status:
        | "pending"
        | "approved"
        | "partially_approved"
        | "denied"
        | "fulfilled"
        | "returned"
        | "cancelled"
      ledger_source:
        | "packing_slip"
        | "shipping_ticket"
        | "manual_adjustment"
        | "borrow_out"
        | "borrow_in"
        | "borrow_return_out"
        | "borrow_return_in"
        | "initial"
      po_status:
        | "draft"
        | "approved"
        | "executed"
        | "partially_received"
        | "received"
        | "closed"
      project_status: "active" | "on_hold" | "closed"
      ticket_status: "draft" | "ready" | "shipped" | "delivered"
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
  public: {
    Enums: {
      app_role: ["admin", "warehouse_manager", "manager", "engineer"],
      borrow_status: [
        "pending",
        "approved",
        "partially_approved",
        "denied",
        "fulfilled",
        "returned",
        "cancelled",
      ],
      ledger_source: [
        "packing_slip",
        "shipping_ticket",
        "manual_adjustment",
        "borrow_out",
        "borrow_in",
        "borrow_return_out",
        "borrow_return_in",
        "initial",
      ],
      po_status: [
        "draft",
        "approved",
        "executed",
        "partially_received",
        "received",
        "closed",
      ],
      project_status: ["active", "on_hold", "closed"],
      ticket_status: ["draft", "ready", "shipped", "delivered"],
    },
  },
} as const

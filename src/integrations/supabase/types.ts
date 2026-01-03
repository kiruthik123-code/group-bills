export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      expenses: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          amount: number;
          paid_by: string;
          created_at: string;
          created_by_user_id?: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          title: string;
          amount: number;
          paid_by: string;
          created_at?: string;
          created_by_user_id?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          title?: string;
          amount?: number;
          paid_by?: string;
          created_at?: string;
          created_by_user_id?: string;
        };
      };
      expense_splits: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          share_amount: number;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          share_amount: number;
        };
        Update: {
          id?: string;
          expense_id?: string;
          user_id?: string;
          share_amount?: number;
        };
      };
      groups: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          invite_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          invite_code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          invite_code?: string;
          created_at?: string;
        };
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          upi_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          upi_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          upi_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];